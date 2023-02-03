import Discord from "discord.js";
import * as db from "../../db/index.js";
import * as config from "../../config.js";


// Format a number of bytes as human-readable text.
// https://stackoverflow.com/a/14919494
function humanFileSize(numBytes: number, numDecimalPlaces: number=1): string {
	const thresh = 1024;
	if (Math.abs(numBytes) < thresh) {
		return numBytes + " B";
	}
	const units = ["KB", "MB", "GB"];
	let u = -1;
	const r = 10 ** numDecimalPlaces;
	do {
		numBytes /= thresh;
		++u;
	} while (Math.round(Math.abs(numBytes) * r) / r >= thresh && u < units.length - 1);
	return numBytes.toFixed(numDecimalPlaces) + " " + units[u];
}


export const data = new Discord.SlashCommandBuilder()
	.setName("upload")
	.setDescription("Upload a file beyond the Discord file size limit.");


export async function execute(interaction: Discord.ChatInputCommandInteraction): Promise<void> {
	const token = db.generateToken();
	interaction.reply(
		`Go to http://localhost:${config.webserverPort}/upload?token=${token} to upload your file.`
	);

	// Add a promise to an object that other modules can access.
	// The webserver will resolve it when the upload is complete.
	const uploadComplete: Promise<db.UploadReport> = new Promise( (resolve, reject) => {
		db.pendingUploads[interaction.id] = { resolve, reject };
	});
	db.reserveUpload(
		BigInt(interaction.id),
		BigInt(interaction.user.id),
		token
	);
	const { filename, filesize } = await uploadComplete;

	let mention: string;
	let channel: Discord.User | Discord.TextBasedChannel;
	if (interaction.channel) {
		mention = `<@${interaction.user.id}>`;
		channel = interaction.channel;
	} else {
		mention = "You";
		channel = interaction.user;
	}

	channel.send({
		content: `${mention} posted a file: ` +
				`http://localhost:${config.webserverPort}/file/${interaction.id}/${filename}\n` +
				`${humanFileSize(filesize, 2)}`,
		allowedMentions: {
			users: []
		},
	});
	delete db.pendingUploads[interaction.id];
}
