import Database from "better-sqlite3";
import * as Config from  "../config.js";


export interface UploadReport {
	filename: string;
	filesize: number;
};

export interface PendingUpload {
	resolve: (report: UploadReport) => void;
	reject: (err: Error) => void;
};

export interface FileEntry {
	id: bigint;
	author_id: bigint;
	upload_token: string;
	upload_expiry: number;
	name: string | null;
};

export interface PartEntry {
	file_id: bigint;
	url: string;
}


const con = new Database(Config.databasePath);
con.pragma("journal_mode = WAL");
con.defaultSafeIntegers(true);  // Enable BigInt support
con.exec(`
	CREATE TABLE IF NOT EXISTS files (
		id             INTEGER PRIMARY KEY NOT NULL UNIQUE,
		author_id      INTEGER NOT NULL,
		upload_token   TEXT    NOT NULL,
		upload_expiry  INTEGER NOT NULL,
		name           TEXT    DEFAULT NULL
	);
	CREATE TABLE IF NOT EXISTS parts (
		file_id        INTEGER NOT NULL REFERENCES files(id),
		url            TEXT    NOT NULL UNIQUE
	);
`);


process.on("exit", () => {
	con.close();
});




const statements = {
	setFileName: con.prepare("UPDATE files SET name = ? WHERE id = ?"),
	addPart: con.prepare("INSERT INTO parts (file_id, url) VALUES (?, ?)"),
	getPartURLs: con.prepare("SELECT url FROM parts WHERE file_id = ?"),
	getFilename: con.prepare("SELECT name FROM files WHERE id = ?"),
	getFileByToken: con.prepare(`
		SELECT id, upload_expiry FROM files WHERE upload_token = ?
	`),
	disableUpload: con.prepare(`
		UPDATE files SET upload_expiry = 0 WHERE id = ?
	`),
	addFile: con.prepare(`
		INSERT INTO files
		(id, author_id, upload_token, upload_expiry)
		VALUES (?, ?, ?, ?)
	`),
};
// Would use a plain object but BigInt keys aren't supported
export const pendingUploads = new Map<bigint, PendingUpload>();


export function setFileName(id: bigint, name: string): void {
	statements.setFileName.run(name, id);
}


export function addPart(fileID: bigint, url: string): void {
	statements.addPart.run(fileID, url);
}


export function getPartURLs(fileID: bigint): string[] {
	return statements.getPartURLs
		.all(fileID)
		.map((row: Pick<PartEntry, "url">) => row.url);
}


export function getFilename(id: bigint): string {
	return statements.getFilename.get(id).name;
}


export function getFileByToken(token: string | undefined): Pick<FileEntry, "id" | "upload_expiry"> | null {
	return statements.getFileByToken.get(token);
}


export function disableUpload(id: bigint): void {
	statements.disableUpload.run(id);
}


function addFile(fileID: bigint, authorID: bigint, token: string, expiry: number): void {
	statements.addFile.run(fileID, authorID, token, expiry);
}


const chars = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-_";
export function generateToken(): string {
	let result = "";
	for (let i = 32; i > 0; --i) {
		result += chars[Math.floor(Math.random() * chars.length)];
	}
	return result;
}


export function reserveUpload(fileID: bigint, authorID: bigint, token: string) {
	addFile(fileID, authorID, token, expiry);
	const expiry = Date.now() + Config.uploadTokenLifetime;
}
