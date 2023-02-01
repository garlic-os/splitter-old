import * as config from "../config.js";
import * as bot from "./bot.js";
import * as db from "./db.js";


/**
 * Consume pieces of a file and upload them to Discord in specific-sized parts.
 * This class's purpose is to extract away the logic for making the size of the
 * parts received from clients independent of the size of the parts that will be
 * uploaded to Discord.
 */
export default class PartUploader {
	constructor(fileID, filename) {
		this.fileID = fileID;
		this.filename = filename;
		this.part = Buffer.alloc(config.partSize);
		this.pendingUploads = [];
		this.partNumber = 0;
		this.index = 0;
	}

	async _uploadPart(part, partNumber) {
		const url = await bot.uploadToDiscord(
			part,
			`${this.filename}.part${partNumber}`
		);
		await db.con.run(
			"INSERT INTO parts (file_id, url) VALUES (?, ?)",
			fileID, url
		);
	}

	async _processPart(subPart) {
		// for (const byte of subPart) {
		// 	this.part[this.index] = byte;
		// 	this.index++;
		// 	if (this.index === this.part.byteLength) {
		// 		this._uploadPart(this.part, this.partNumber);
		// 		this.part.fill(0);
		// 		this.index = 0;
		// 		this.partNumber++;
		// 	}
		// }

		const bytesLeft = this.part.byteLength - this.index;
		if (subPart.byteLength <= bytesLeft) {
			subPart.copy(this.part, this.index);
			this.index += subPart.byteLength;
		} else {
			subPart.copy(this.part, this.index, 0, bytesLeft);
			this._uploadPart(this.part, this.partNumber);
			this.part.fill(0);
			this.index = 0;
			this.partNumber++;

			subPart.copy(this.part, this.index, bytesLeft);
			this.index += subPart.byteLength - bytesLeft;
		}
	}

	consume(subPart) {
		this.pendingUploads.push(this._processPart(subPart));
	}

	async uploadsComplete() {
		await Promise.all(this.pendingUploads);
	}
}
