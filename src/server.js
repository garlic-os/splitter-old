import { Database } from "sqlite-async";
import express from "express";
import multer from "multer";
import * as config from "../config.js";
import * as bot from "./bot.js";


function generateToken() {
	const chars = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-_";
	let result = "";
	for (let i = 32; i > 0; --i) {
		result += chars[Math.floor(Math.random() * chars.length)];
	}
	return result;
}


async function reserveUpload(db, fileID, authorID) {
	const token = generateToken();
	const expiry = Date.now() + 1000 * 60 * 60 * 24; // 24 hours
	await db.run(`
		INSERT INTO files
		(id, author_id, upload_token, upload_expiry)
		VALUES (?, ?, ?, ?)
	`, fileID, authorID, token, expiry);
}


async function checkToken(db, token) {
	// Check if the token exists and has not expired.
	const tokenRow = await db.get("SELECT * FROM tokens WHERE token = ?", token);
	if (!tokenRow) return false;
	if (tokenRow.expiry < Date.now()) return false;
	return true;
}


const db = await Database.open(config.databasePath);
await db.run(`
	CREATE TABLE IF NOT EXISTS files (
		id             INTEGER PRIMARY KEY NOT NULL,
		author_id      INTEGER NOT NULL,
		upload_token   TEXT    NOT NULL,
		upload_expiry  INTEGER NOT NULL,
		name           TEXT DEFAULT NULL
	);
	CREATE TABLE IF NOT EXISTS parts (
		file_id        INTEGER PRIMARY KEY NOT NULL REFERENCES files(id),
		url            TEXT    NOT NULL
	);
`);

process.on("exit", async () => {
	await db.close();
});

await bot.start(config.discordBotToken);

const app = express();
app.use(express.static("public"));
app.use(express.json());

const upload = multer({
	limits: {
		fileSize: 1024 * 1024 * 8, // 8 MB
		files: 1,
	}
});
const fileUploadFields = upload.fields([{ name: "file", maxCount: 1 }]);

app.post("/file/:fileID", async (req, res) => {
	// Generate an upload token and expiry for the file.
	// The token should be stored in the database and
	// sent to the user in the response.
	const fileID = req.params.fileID;
	const authorID = req.body.authorID;
	const uploadToken = await reserveUpload(db, fileID, authorID);
	res.send(uploadToken);
});

app.patch("/file/:fileID", fileUploadFields, async (req, res) => {
	// Have the Discord bot upload the file to Discord,
	// then store the returned URL in the database.
	const file = req.files["file"][0];
	const fileID = req.params.fileID;
	const { filename, partNumber } = req.body.filename;
	const token = req.headers["Authorization"];
	if (!await checkToken(db, token)) return res.sendStatus(401);
	const partURL = await bot.uploadToDiscord(file.buffer, `filename.part${partNumber}`);
	await db.run(
		"UPDATE files SET name = ? WHERE id = ?",
		filename, fileID
	);
	await db.run(
		"INSERT INTO parts (file_id, url) VALUES (?, ?)",
		fileID, partURL
	);
	res.sendStatus(204);
});

app.get("/parts/:fileID", async (req, res) => {
	const fileID = req.params.fileID;
	const urls = await db.all(
		"SELECT url FROM parts WHERE file_id = ?",
		fileID
	);
	if (urls.length === 0) return res.sendStatus(404);
	const filename = await db.run(
		"SELECT name FROM files WHERE id = ?",
		fileID
	);
	res.json({ filename, urls });
});

app.listen(config.serverPort, () => {
	console.log(`Web interface listening on port ${config.serverPort}`);
});
