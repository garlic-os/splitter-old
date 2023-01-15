import express from "express";
import multer from "multer";
import * as config from "../config.js";
import * as db from "./db.js";
import * as bot from "./bot.js";


const app = express();
app.use(express.static("public"));
app.use(express.json());


const upload = multer({
	limits: {
		fileSize: config.partSize + 1,
		files: 1,
	}
});


app.get("/", (_, res) => {
	res.redirect("/upload");
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
const fileUploadFields = upload.fields([{ name: "file", maxCount: 1 }]);
app.patch("/file", fileUploadFields, async (req, res) => {
	const token = req.headers["authorization"];
	const file = req.files["file"][0];
	const filename = file.originalname;
	const { partNumber, totalParts } = req.body;

	// Check the token to make sure only the user who reserved the upload can
	// upload to it.
	if (!await db.checkToken(token)) return res.sendStatus(401);

	if (totalParts > config.partCountLimit) return res.sendStatus(413);

	const fileID = await db.con.get(
		"SELECT id FROM files WHERE upload_token = ?",
		token
	);

	// Upload the file to Discord and record the URL that Discord returns.
	const partURL = await bot.uploadToDiscord(
		file.buffer,
		`${filename}.part${partNumber}`
	);
	await db.con.run(
		"INSERT INTO parts (file_id, url) VALUES (?, ?)",
		fileID, partURL
	);

	// Set the entry's name now that we have it.
	if (partNumber === 1) {
		await db.con.run(
			"UPDATE files SET name = ? WHERE id = ?",
			filename, fileID
		);
	}

	// Check if the upload is complete.
	if (partNumber === totalParts) {
		await db.con.run("DELETE FROM tokens WHERE token = ?", token);
		db.emitter.emit("uploadComplete", {
			filename,
			filesize: totalParts * config.partSize,
		});
		res.sendStatus(204);
	} else {
		// Waiting for more data
		res.sendStatus(202);
	}
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
	const urls = await db.con.all("SELECT url FROM parts WHERE file_id = ?", fileID);
	if (urls.length === 0) return res.sendStatus(404);
	const filename = await db.con.run("SELECT name FROM files WHERE id = ?", fileID);
	res.json({ filename, urls });
});


app.listen(config.serverPort, () => {
	console.log(`Web interface listening on port ${config.serverPort}`);
});
