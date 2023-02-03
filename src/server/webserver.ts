import path from "node:path";
import express from "express";
import StatusCodes from "http-status-codes";
import * as config from "../config.js";
import * as db from "../db/index.js";
import * as bot from "../bot/index.js";


const app = express();
app.use(express.static("./dist/web/public"));
app.use(express.json());


app.get("/file/*", (_, res) => {
	res.sendFile(path.resolve("./dist/web/download.html"));
});


const raw = express.raw({
	type: "application/octet-stream",
	limit: config.fileSizeLimit,
});
/**
 * Receive a file and have the Discord bot upload it to Discord in parts. 
 * Then store the URLs to the parts that Discord returns.
 * Requires authorization. Users receive a token per file when they reserve an
 * upload.
 */
app.put("/file", async (req, res) => {
	const token = req.headers["authorization"];
	const filename = (req.headers["x-filename"] as string | undefined)
		?.replaceAll(" ", "_");

	if (!filename) return res.sendStatus(StatusCodes.BAD_REQUEST);

	const file = db.getFileByToken(token);

	// Check if the token exists and has not expired.
	if (!token || !file || file.upload_expiry < Date.now()) {
		return res.sendStatus(StatusCodes.UNAUTHORIZED);
	}

	// Set the file's name in the database.
	db.setFileName(file.id, filename);

	// Upload the file to Discord in parts.
	let partNumber = 0;
	let bytesRead = 0;
	let chunk: Buffer | null = null;
	while (null !== (chunk = req.read(config.partSize))) {
		const url = await bot.uploadToDiscord(
			chunk,
			`${filename}.part${partNumber++}`
		);
		db.addPart({
			file_id: file.id,
			url: url,
		});
		bytesRead += chunk.byteLength;
	}

	// Send the client this file's download link.
	res.status(StatusCodes.CREATED).send(
		`/file/${file.id}/${filename}`
	);

	// Tell the bot that the upload is complete.
	db.pendingUploads[file.id.toString()].resolve({
		filename: filename,
		filesize: bytesRead,
	});

	db.disableUpload(file.id);
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
app.get("/parts/:fileID", (req, res) => {
	const fileID = BigInt(req.params.fileID);

	// Bypass CORS lmao
	const urls = db.getPartURLs(fileID)
		.map(url => `//localhost:${config.corsProxyPort}/${url}`);
	if (urls.length === 0) return res.sendStatus(StatusCodes.NOT_FOUND);

	const filename = db.getFilename(fileID);
	res.json({ filename, urls });
});


app.listen(config.webserverPort, () => {
	console.log(`Web interface listening on port ${config.webserverPort}`);
});
