import { REST, Routes } from 'discord.js';
import { config } from './config.js';
import { commandList } from './commands/index.js';
import { log } from './log.js';

/** Registers slash commands: to DEV_GUILD_ID instantly if set, otherwise globally (can take ~1h to propagate). */
export async function registerCommands(clientId = config.clientId) {
  const rest = new REST().setToken(config.token);
  const body = commandList.map((c) => c.data.toJSON());
  const route = config.devGuildId ? Routes.applicationGuildCommands(clientId, config.devGuildId) : Routes.applicationCommands(clientId);
  await rest.put(route, { body });
  log.info(`registered ${body.length} commands ${config.devGuildId ? `to guild ${config.devGuildId}` : 'globally'}`);
}
