import fs from "node:fs/promises";
import Discord from "discord.js";
import * as Config from "../config.js";


interface DiscordSlashCommandHandler {
	data: Discord.ApplicationCommandData;
	execute(interaction: Discord.CommandInteraction): Promise<void>;
}


class SplitterBot extends Discord.Client {
	commands: Discord.Collection<string, DiscordSlashCommandHandler>;
	uploadChannel: Discord.TextChannel | null;
	ready: Promise<void>;

	constructor(options: Discord.ClientOptions) {
		super(options);
		this.commands = new Discord.Collection();
		this.uploadChannel = null;
		this.ready = new Promise((resolve) => {
			this.once(Discord.Events.ClientReady, () => resolve());
		});
	}
}


const bot = new SplitterBot({
	intents: [Discord.GatewayIntentBits.Guilds],
});


bot.on(Discord.Events.ClientReady, async () => {
	const channel = await bot.channels.fetch(Config.discordUploadChannelID);
	if (channel instanceof Discord.TextChannel) {
		bot.uploadChannel = channel;
	} else {
		throw new Error("Invalid Discord channel ID");
	}
	if (!bot.user) {
		throw new Error("Bot user is null");
	}
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


async function loadCommands(): Promise<void> {
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
await bot.login(Config.discordBotToken);


export async function uploadToDiscord(buffer: Buffer, filename: string): Promise<string> {
	await bot.ready;  // Ensure uploadChannel has been set.

	// Upload the file to Discord.
	const attachment = new Discord.AttachmentBuilder(buffer, {
		name: filename,
	});
	const message = await (bot.uploadChannel as Discord.TextChannel)
		.send({files: [attachment]});

	// Return the URL of the uploaded file.
	const sentAttachment = message.attachments.first();
	if (!sentAttachment) {
		throw new Error("No attachment found in message");
	}
	return sentAttachment.url;
}
