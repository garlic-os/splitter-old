import fs from "node:fs/promises";
import Discord from "discord.js";


const client = new Discord.Client({
	intents: [Discord.GatewayIntentBits.Guilds],
});
client.commands = new Discord.Collection();

client.on(Discord.Events.ClientReady, () => {
	console.log(`Bot logged in as ${client.user.tag}`);
});

client.on(Discord.Events.InteractionCreate, async (interaction) => {
	if (!interaction.isChatInputCommand()) return;
	const command = client.commands.get(interaction.commandName);

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


async function loadCommands() {
	const commandsDir = new URL("commands", import.meta.url);
	const commandPaths = (await fs.readdir(commandsDir)).filter( (file) => {
		return file.endsWith(".js");
	});
	
	for (const file of commandPaths) {
		const command = await import(`${commandsDir}/${file}`);
		if ("data" in command && "execute" in command) {
			client.commands.set(command.data.name, command);
		} else {
			console.warn(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
		}
	}
}


export async function start(token) {
	await loadCommands();
	return await client.login(token);
}


export async function uploadToDiscord(buffer, filename) {
	// Upload the file to Discord and return the URL.
	const channel = await client.channels.fetch(config.botUploadChannelID);
	const attachment = new Discord.MessageAttachment(buffer, filename);
	const message = await channel.send(attachment);
	return message.attachments.first().url;
}
