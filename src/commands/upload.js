import { SlashCommandBuilder } from "discord.js";
import * as db from "../db.js";


/**
 * Format a number of bytes as human-readable text.
 * https://stackoverflow.com/a/14919494
 * 
 * @param bytes Number of bytes.
 * @param dp Number of decimal places to display.
 * @return Formatted string.
 */
function humanFileSize(bytes, dp=1) {
	const thresh = 1024;
	if (Math.abs(bytes) < thresh) {
		return bytes + " B";
	}
	const units = ["KB", "MB", "GB"];
	let u = -1;
	const r = 10 ** dp;
	do {
		bytes /= thresh;
		++u;
	} while (Math.round(Math.abs(bytes) * r) / r >= thresh && u < units.length - 1);
	return bytes.toFixed(dp) + " " + units[u];
}


export const data = new SlashCommandBuilder()
	.setName("upload")
	.setDescription("Upload a file beyond the Discord file size limit.");


export async function execute(interaction) {
	const token = await db.reserveUpload(interaction.id, interaction.user.id);
	await interaction.reply(
		`Go to http://localhost:3000/upload?token=${token} to upload your file.`
	);
	db.emitter.once("uploadComplete", async ({ filename, filesize }) => {
		await channel.send(
			`<@${interaction.user.id}> posted a file: `
			`http://localhost:3000/file?=${interaction.id}#${filename}\n`
			`${humanFileSize(filesize, 2)}`
		);
	});
}
