import type { RouteGenericInterface } from "fastify";

import fs from "node:fs";
import path from "node:path";
import fastify from "fastify";
import StatusCodes from "http-status-codes";
import * as Config from "../config.js";
import * as DB from "../db/index.js";
import * as bot from "../bot/index.js";


const app = fastify({
	ignoreDuplicateSlashes: true,
	ignoreTrailingSlash: true,
	logger: true,
});
app.register(import("@fastify/multipart"));
app.register(import("@fastify/static"), {
	root: path.resolve("./dist/web/public")
});


app.route({
	method: "GET",
	url: "/file/*",
	schema: {
		response: {
			[StatusCodes.OK]: {
				content: {
					"text/html": { type: "string" },
				},
			},
		},
	},
	handler: (_, reply) => {
		reply.send(
			fs.createReadStream(
				path.resolve("./dist/web/download.html")
			)
		);
	}
});


/**
 * Receive a file and have the Discord bot upload it to Discord in parts. 
 * Then store the URLs to the parts that Discord returns.
 * Requires authorization. Users receive a token per file when they reserve an
 * upload.
 */
app.route({
	method: "PUT",
	url: "/file",
	schema: {
		consumes: ["multipart/form-data"],
		headers: {
			type: "object",
			properties: {
				"authorization": { type: "string" },
			},
			required: ["authorization"],
		},
		// body: {
		// 	type: "object",
		// 	properties: {
		// 		file: {
		// 			type: "object",
		// 		},
		// 	},
		// 	required: ["file"],
		// },
		response: {
			[StatusCodes.CREATED]:      { type: "string" },
			[StatusCodes.BAD_REQUEST]:  { type: "null" },
			[StatusCodes.UNAUTHORIZED]: { type: "null" },
		},
	},
	handler: async (request, reply) => {
		const token = request.headers["authorization"];
		const fileEntry = DB.getFileByToken(token);
	
		const formData = await request.file({
			limits: {
				fileSize: Config.fileSizeLimit,
				files: 1,
				fields: 0,
			}
		});
		if (!formData) {
			reply.status(StatusCodes.BAD_REQUEST);
			return;
		}
	
		// Check if the file is valid and its upload window hasn't passed.
		if (!fileEntry || fileEntry.upload_expiry < Date.now()) {
			reply.status(StatusCodes.UNAUTHORIZED);
			return;
		}
	
		console.log("Receiving file ID:", fileEntry.id);
	
		// Set the file's name in the database.
		const filename = formData.filename.replaceAll(" ", "_");
		DB.setFileName(fileEntry.id, filename);
	
		// Upload the file to Discord in parts.
		let partNumber = 0;
		let bytesRead = 0;
		let chunk: Buffer | null = null;
	
		formData.file.pause();  // Enables the .read() method
		formData.file.on("readable", async () => {
			while (null !== (chunk = formData.file.read(Config.partSize))) {
				bytesRead += chunk.byteLength;
				const url = await bot.uploadToDiscord(
					chunk,
					`${filename}.part${partNumber++}`
				);
				DB.addPart(fileEntry.id, url);
			}
		});
	
		formData.file.on("end", () => {
			const pendingUpload = DB.pendingUploads.get(fileEntry.id);
			if (!pendingUpload) {
				console.warn("No pending upload found for file", fileEntry.id);
				return;
				// TODO: Delete the file entry
			}
	
			if (bytesRead > 0) {
				// Send the client this file's download link.
				reply.status(StatusCodes.CREATED).send(
					`/file/${fileEntry.id}/${filename}`
				);
	
				// Tell the bot that the upload is complete.
				pendingUpload.resolve({
					filename: filename,
					filesize: bytesRead,
				});
			} else {
				// The file was empty.
				reply.status(StatusCodes.BAD_REQUEST);
				pendingUpload.reject(new Error("File was empty"));
			}
	
			DB.disableUpload(fileEntry.id);
		});
	},
});


// TODO: Implement as a Discord slash command instead

// app.delete("/file/:fileID", async (request, res) => {
// 	const token = request.headers["Authorization"];
// 	const fileID = request.params.fileID;
// 	await DB.con.run("DELETE FROM files WHERE id = ?", fileID);
// 	await DB.con.run("DELETE FROM parts WHERE file_id = ?", fileID);
// 	res.sendStatus(204);
// });


interface PartsRouteSchema extends RouteGenericInterface {
	Params: {
		fileID: bigint;
	};
	Reply: {
		filename: string;
		urls: string[];
	};
};
app.route<PartsRouteSchema>({
	method: "GET",
	url: "/parts/:fileID",
	schema: {
		// params: {
		// 	type: "object",
		// 	properties: {
		// 		fileID: { type: "bigint" },
		// 	},
		// 	required: ["fileID"],
		// },
		response: {
			[StatusCodes.OK]: {
				type: "object",
				properties: {
					filename: { type: "string" },
					urls: {
						type: "array",
						items: { type: "string" },
					},
				},
			},
			[StatusCodes.NOT_FOUND]: { type: "null" },
		},
	},
	handler: (request, reply) => {
		const fileID = request.params.fileID;
	
		// Bypass CORS lmao
		const urls = DB.getPartURLs(fileID)
			?.map(url => `//localhost:${Config.corsProxyPort}/${url}`);
		if (!urls || urls?.length === 0) {
			reply.status(StatusCodes.NOT_FOUND);
			return;
		}
	
		const filename = DB.getFileName(fileID);
		reply.send({ filename, urls });
	},
});


console.log(`Web interface listening on port ${Config.webserverPort}`);
await app.listen({ port: Config.webserverPort });
