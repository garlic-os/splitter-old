import fs from "node:fs/promises";
import Discord from "discord.js";
import * as config from "../config.js";

const commands = [];
const commandsDir = new URL("commands", import.meta.url);
const commandPaths = (await fs.readdir(commandsDir)).filter( (file) => {
	return file.endsWith(".js");
});

// Grab the SlashCommandBuilder#toJSON() output of each command's data for
// deployment
for (const file of commandPaths) {
	const command = await import(`${commandsDir}/${file}`);
	commands.push(command.data.toJSON());
}

// Construct and prepare an instance of the REST module
const rest = new Discord.REST({ version: "10" });
rest.setToken(config.discordBotToken);

// Deploy the commands
console.log(`🔃 Deploying ${commands.length} application (/) commands...`);

// The put method is used to fully refresh all commands in the guild
// with the current set
const data = await rest.put(
	Discord.Routes.applicationCommands(config.discordClientId),
	{ body: commands },
);

console.log(`✅ Successfully deployed ${data.length} application (/) commands.`);
