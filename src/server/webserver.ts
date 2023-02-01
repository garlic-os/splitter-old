import * as path from "node:path";
import * as express from "express";
import { StatusCodes } from "http-status-codes";
import * as config from "../config.js";
import * as db from "../common/db.js";
import PartUploader from "./part-uploader.js";


const app = express();
app.use(express.static("./src/public"));
app.use(express.json());


app.get("/file/*", (_, res) => {
	res.sendFile(path.resolve("./src/file.html"));
});


const raw = express.raw({
	type: "application/octet-stream",
	limit: config.fileSizeLimit,
});
/**
 * Have the Discord bot upload a part of a file to Discord, then store the
 * URL of the file in Discord in the database.
 * The client calls this endpoint multiple times to upload every parts of
 * the file.
 * NB: This endpoint does NOT check if the parts are in order; that is up to the
 * client.
 * Requires authorization. Users receive a token per file when they reserve an
 * upload.
 */
app.put("/file", raw, async (req, res) => {
// app.put("/file", async (req, res) => {
	const token = req.headers["authorization"];
	const filename = (req.headers["x-filename"] as string | null)
		?.replaceAll(" ", "_");

	const file = await db.con.get(
		"SELECT id, upload_expiry FROM files WHERE upload_token = ?",
		token
	);

	// Check if the token exists and has not expired.
	if (!token || !file || file.upload_expiry < Date.now()) {
		return res.sendStatus(StatusCodes.UNAUTHORIZED);
	}

	if (!filename) return res.sendStatus(StatusCodes.BAD_REQUEST);

	// Set the file's name in the database.
	db.con.run(
		"UPDATE files SET name = ? WHERE id = ?",
		filename, file.id
	);

	// Upload the file to Discord in parts.
	const uploader = new PartUploader(file.id, filename);
	req.on("data", (data) => {
		uploader.consume(data);
	});

	req.on("end", async () => {
		// Wait for all the parts to be uploaded.
		// This is necessary because the data handler is async so the end event
		// fires almost right away.
		await uploader.uploadsComplete();

		// Send the client this file's download link.
		res.status(StatusCodes.CREATED).send(
			`/file/${file.id}/${filename}`
		);

		// Tell the bot that the upload is complete.
		db.pendingUploads[file.id].resolve({
			filename: filename,
			filesize: uploader.bytesUploaded,
		});

		// Expire the token.
		db.con.run("UPDATE files SET upload_expiry = 0 WHERE id = ?", file.id);
	});

	req.on("error", (err) => {
		console.error(err);
		res.sendStatus(StatusCodes.INTERNAL_SERVER_ERROR);
	});
});


// TODO: Implement as a Discord slash command instead

// app.delete("/file/:fileID", async (req, res) => {
// 	const token = req.headers["Authorization"];
// 	const fileID = req.params.fileID;
// 	await db.con.run("DELETE FROM files WHERE id = ?", fileID);
// 	await db.con.run("DELETE FROM parts WHERE file_id = ?", fileID);
// 	res.sendStatus(204);
// });


/**
 * Returns a file's name and the list of URLs to its parts.
 */
app.get("/parts/:fileID", async (req, res) => {
	const fileID = req.params.fileID;
	const urlRows = await db.con.all(
		"SELECT url FROM parts WHERE file_id = ?",
		fileID
	);

	if (urlRows.length === 0) return res.sendStatus(StatusCodes.NOT_FOUND);

	// Bypass CORS lmao
	const urls = urlRows
		.map((row: any) => `//localhost:${config.corsProxyPort}/${row.url}`);

	const { name: filename } = await db.con.get(
		"SELECT name FROM files WHERE id = ?",
		fileID
	);

	res.json({ filename, urls });
});


app.listen(config.webserverPort, () => {
	console.log(`Web interface listening on port ${config.webserverPort}`);
});
