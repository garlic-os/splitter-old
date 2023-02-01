import * as fs from "node:fs/promises";
import * as Discord from "discord.js";
import * as config from "../config.js";


interface DiscordSlashCommandHandler {
	data: Discord.ApplicationCommandData;
	execute(interaction: Discord.CommandInteraction): Promise<void>;
}


class SplitterBot extends Discord.Client {
	commands: Discord.Collection<string, DiscordSlashCommandHandler>;
	uploadChannel: Discord.TextChannel | null;

	constructor(options: Discord.ClientOptions) {
		super(options);
		this.commands = new Discord.Collection();
		this.uploadChannel = null;
	}
}


const bot = new SplitterBot({
	intents: [Discord.GatewayIntentBits.Guilds],
});


bot.on(Discord.Events.ClientReady, async () => {
	const channel = await bot.channels.fetch(config.discordUploadChannelID);
	if (channel instanceof Discord.TextChannel) {
		bot.uploadChannel = channel;
	} else {
		throw new Error("Invalid Discord channel ID");
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
await bot.login(config.discordBotToken);


export async function uploadToDiscord(buffer: Buffer, filename: string): Promise<string> {
	// Upload the file to Discord and return the URL.
	const attachment = new Discord.AttachmentBuilder(buffer, {
		name: filename,
	});
	const message = await bot.uploadChannel.send({files: [attachment]});
	return message.attachments.first().url;
}
