import { EventEmitter } from "node:events";
import * as sqlite3 from "sqlite-async";
import * as config from "../config.js";


export const con = await sqlite3.Database.open(config.databasePath);
await con.exec(`
	BEGIN;
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
	COMMIT;
`);


process.on("exit", async () => {
	await con.close();
});


function generateToken() {
	const chars = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-_";
	let result = "";
	for (let i = 32; i > 0; --i) {
		result += chars[Math.floor(Math.random() * chars.length)];
	}
	return result;
}


export async function reserveUpload(fileID, authorID) {
	const token = generateToken();
	const expiry = Date.now() + config.uploadTokenLifetime;
	await con.run(`
		INSERT INTO files
		(id, author_id, upload_token, upload_expiry)
		VALUES (?, ?, ?, ?)
	`, fileID, authorID, token, expiry);
	return token;
}


export async function checkToken(token) {
	// Check if the token exists and has not expired.
	const row = await con.get(
		"SELECT upload_expiry FROM files WHERE upload_token = ?",
		token
	);
	return row?.upload_expiry > Date.now();
}

export const emitter = new EventEmitter();
