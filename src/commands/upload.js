import Discord from "discord.js";
import * as db from "../db.js";
import * as config from "../../config.js";


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


export const data = new Discord.SlashCommandBuilder()
	.setName("upload")
	.setDescription("Upload a file beyond the Discord file size limit.");


/**
 * 
 * @param {Discord.ChatInputCommandInteraction} interaction 
 */
export async function execute(interaction) {
	const token = db.generateToken();
	interaction.reply(
		`Go to http://localhost:${config.webserverPort}/upload?token=${token} to upload your file.`
	);

	// Add a promise to an object that other modules can access.
	// The webserver will resolve it when the upload is complete.
	const uploadComplete = new Promise( (resolve, reject) => {
		db.pendingUploads[interaction.id] = { resolve, reject };
	});
	db.reserveUpload(interaction.id, interaction.user.id, token);
	const { filename, filesize } = await uploadComplete;

	interaction.channel.send(
		`<@${interaction.user.id}> posted a file: ` +
		`http://localhost:${config.webserverPort}/file/${interaction.id}/${filename}\n` +
		`${humanFileSize(filesize, 2)}`, {
			allowedMentions: { users: [] },
		}
	);
	delete db.pendingUploads[interaction.id];
}
