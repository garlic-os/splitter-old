import fs from "node:fs/promises";
import * as Discord from "discord.js";
import * as config from "./config.js";

const commands = [];
const commandsDir = new URL("commands", import.meta.url);
const commandPaths = (await fs.readdir(commandsDir)).filter( (file) => {
	return file.endsWith(".js");
});

// Grab the SlashCommandBuilder#toJSON() output of each command's data for
// deployment.
for (const file of commandPaths) {
	const command = await import(`${commandsDir}/${file}`);
	commands.push(command.data.toJSON());
}

// Construct and prepare an instance of the REST module.
const rest = new Discord.REST({ version: "10" });
rest.setToken(config.discordBotToken);

// Deploy the commands.
console.log(`🔃 Registering ${commands.length} application (/) commands...`);

// The put method is used to fully refresh all commands in the guild
// with the current set.
const data = await rest.put(
	Discord.Routes.applicationCommands(config.discordClientID),
	{ body: commands },
);

if (data instanceof Array) {
	// If the data is an array, it is an array of command objects
	// that were successfully registered.
	console.log(`✅ Successfully registered ${data.length} application (/) commands.`);
} else {
	// If the data is not an array, it is an error object.
	console.error(`❌ Failed to register application (/) commands: ${data}`);
}
