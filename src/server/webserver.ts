import type { RouteOptions } from "fastify";

import fs from "node:fs";
import path from "node:path";
import fastify from "fastify";
import StatusCodes from "http-status-codes";
import * as config from "../config.js";
import * as db from "../db/index.js";
import * as bot from "../bot/index.js";


const app = fastify();
app.register(import("@fastify/static"), {
	root: path.resolve("./dist/web/public")
  })
// app.use(express.json());


app.get("/file/*", (_, reply) => {
	reply.send(
		fs.createReadStream(
			path.resolve("./dist/web/download.html")
		)
	);
});


// const raw = express.raw({
// 	type: "application/octet-stream",
// 	limit: config.fileSizeLimit,
// });
/**
 * Receive a file and have the Discord bot upload it to Discord in parts. 
 * Then store the URLs to the parts that Discord returns.
 * Requires authorization. Users receive a token per file when they reserve an
 * upload.
 */
// TODO: Ask ChatGPT how to express a route that accepts a raw body.
app.put("/file", async (request, reply) => {
	const token = request.headers["authorization"];
	const filename = (request.headers["x-filename"] as string | undefined)
		?.replaceAll(" ", "_");

	if (!filename) {
		reply.status(StatusCodes.BAD_REQUEST);
		return;
	}

	const file = db.getFileByToken(token);

	// Check if the token exists and has not expired.
	if (!token || !file || file.upload_expiry < Date.now()) {
		reply.status(StatusCodes.UNAUTHORIZED);
		return;
	}

	// Set the file's name in the database.
	db.setFileName(file.id, filename);

	// Upload the file to Discord in parts.
	let partNumber = 0;
	let bytesRead = 0;
	let chunk: Buffer | null = null;
	while (null !== (chunk = request.raw.read(config.partSize))) {
		const url = await bot.uploadToDiscord(
			chunk,
			`${filename}.part${partNumber++}`
		);
		db.addPart(file.id, url);
		bytesRead += chunk.byteLength;
	}

	// Send the client this file's download link.
	reply.status(StatusCodes.CREATED).send(
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

// app.delete("/file/:fileID", async (request, res) => {
// 	const token = request.headers["Authorization"];
// 	const fileID = request.params.fileID;
// 	await db.con.run("DELETE FROM files WHERE id = ?", fileID);
// 	await db.con.run("DELETE FROM parts WHERE file_id = ?", fileID);
// 	res.sendStatus(204);
// });


interface PartsRoute {
	Params: {
		fileID: bigint;
	};
	Response: {
		filename: string;
		urls: string[];
	};
};
app.get<PartsRoute>("/parts/:fileID", (request, reply) => {
	// const fileID = BigInt(request.params.fileID);
	const fileID = request.params.fileID;

	// Bypass CORS lmao
	const urls = db.getPartURLs(fileID)
		.map(url => `//localhost:${config.corsProxyPort}/${url}`);
	if (urls.length === 0) return reply.statusCode = StatusCodes.NOT_FOUND;

	const filename = db.getFilename(fileID);
	return { filename, urls };
});


console.log(`Web interface listening on port ${config.webserverPort}`);
await app.listen({ port: config.webserverPort });
