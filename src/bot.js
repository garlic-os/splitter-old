import fs from "node:fs/promises";
import Discord from "discord.js";
import * as config from "../config.js";


const bot = new Discord.Client({
	intents: [Discord.GatewayIntentBits.Guilds],
});
bot.commands = new Discord.Collection();


bot.on(Discord.Events.ClientReady, async () => {
	bot.uploadChannel = await bot.channels.fetch(config.discordUploadChannelID);
	if (bot.uploadChannel === null) throw new Error("Invalid Discord channel ID");
	console.log(`Bot logged in as ${bot.user.tag}`);
});


bot.on(Discord.Events.InteractionCreate, async (interaction) => {
	if (!interaction.isChatInputCommand()) return;
	const command = bot.commands.get(interaction.commandName);

	if (!command) {
		console.error(`No command matching ${interaction.commandName} was found.`);
		return;
	}

	try {
		await command.execute(interaction);
	} catch (error) {
		console.error(error);
		await interaction.reply({
			content: 'There was an error while executing this command!',
			ephemeral: true
		});
	}
});


process.on("exit", () => {
	bot.destroy();
});


async function loadCommands() {
	const commandsDir = new URL("commands", import.meta.url);
	const commandPaths = (await fs.readdir(commandsDir)).filter( (file) => {
		return file.endsWith(".js");
	});
	
	for (const path of commandPaths) {
		const command = await import(`${commandsDir}/${path}`);
		if ("data" in command && "execute" in command) {
			bot.commands.set(command.data.name, command);
		} else {
			console.warn(`[WARNING] The command at ${path} is missing a required "data" or "execute" property.`);
		}
	}
}


await loadCommands();
await bot.login(config.discordBotToken);


export async function uploadToDiscord(buffer, filename) {
	// Upload the file to Discord and return the URL.
	const attachment = new Discord.AttachmentBuilder(buffer, {
		name: filename,
	});
	const message = await bot.uploadChannel.send({files: [attachment]});
	return message.attachments.first().url;
}
