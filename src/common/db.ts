import * as sqlite3 from "sqlite-async";
import * as config from "../config.js";


export interface UploadReport {
	filename: string;
	filesize: number;
}

export interface PendingUpload {
	resolve: (report: UploadReport) => void;
	reject: (err: Error) => void;
};

export interface PendingUploads {
	[key: string]: PendingUpload;
}


export const con = await sqlite3.Database.open(config.databasePath);
await con.exec(`
	CREATE TABLE IF NOT EXISTS files (
		id             TEXT    PRIMARY KEY NOT NULL UNIQUE,
		author_id      INTEGER NOT NULL,
		upload_token   TEXT    NOT NULL,
		upload_expiry  INTEGER NOT NULL,
		name           TEXT    DEFAULT NULL
	);
	CREATE TABLE IF NOT EXISTS parts (
		file_id        TEXT NOT NULL REFERENCES files(id),
		url            TEXT NOT NULL UNIQUE
	);
`);


process.on("exit", async () => {
	await con.close();
});


export const pendingUploads: PendingUploads = {};


export function generateToken(): string {
	const chars = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-_";
	let result = "";
	for (let i = 32; i > 0; --i) {
		result += chars[Math.floor(Math.random() * chars.length)];
	}
	return result;
}


export function reserveUpload(fileID: string, authorID: string, token: string): Promise<void> {
	const expiry = Date.now() + config.uploadTokenLifetime;
	return con.run(`
		INSERT INTO files
		(id, author_id, upload_token, upload_expiry)
		VALUES (?, ?, ?, ?)
	`, fileID, authorID, token, expiry);
}
