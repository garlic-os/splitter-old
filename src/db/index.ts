import Database from "better-sqlite3";
import * as config from "../config.js";


export interface UploadReport {
	filename: string;
	filesize: number;
};

export interface PendingUpload {
	resolve: (report: UploadReport) => void;
	reject: (err: Error) => void;
};

export interface PendingUploads {
	[key: string]: PendingUpload;
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


const con = new Database(config.databasePath);
con.pragma("journal_mode = WAL");
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


export const pendingUploads: PendingUploads = {};


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


export function setFileName(id: bigint, name: string): void {
	statements.setFileName.run(name, id);
}


export function addPart(part: PartEntry): void {
	statements.addPart.run(part.file_id, part.url);
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


export function addFile(file: Omit<FileEntry, "name">): void {
	statements.addFile.run(
		file.id,
		file.author_id,
		file.upload_token,
		file.upload_expiry
	);
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
	const expiry = Date.now() + config.uploadTokenLifetime;
	addFile({
		id: fileID,
		author_id: authorID,
		upload_token: token,
		upload_expiry: expiry
	});
}
