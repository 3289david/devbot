import { Client, Events, GatewayIntentBits, MessageFlags, Partials } from 'discord.js';
import { config } from './config.js';
import { db } from './db.js';
import { log } from './log.js';
import { aiEnabled } from './ai.js';
import { commands } from './commands/index.js';
import { registerCommands } from './deploy.js';
import { routeComponent } from './interactions.js';
import { pollOnce } from './pipeline.js';
import { digestTick } from './digests.js';

if (!config.token || !config.clientId) {
  console.error('DISCORD_TOKEN and DISCORD_CLIENT_ID are required. Copy .env.example to .env and fill them in.');
  process.exit(1);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds], partials: [Partials.Channel] });

client.once(Events.ClientReady, async (c) => {
  log.info(`logged in as ${c.user.tag} · ${c.guilds.cache.size} servers · AI ${aiEnabled ? 'on' : 'off (rule-based summaries)'}`);
  try {
    await registerCommands(c.user.id);
  } catch (e) {
    log.error('command registration failed:', e.message);
  }

  const poll = () => pollOnce(client).catch((e) => log.error('poll error', e));
  setTimeout(poll, 5_000);
  setInterval(poll, config.pollMinutes * 60_000);
  setInterval(() => digestTick(client).catch((e) => log.error('digest error', e)), 60_000);
  setInterval(() => db.prune(), 6 * 3600_000);
  c.user.setActivity('/help · 개발 뉴스');
});

client.on(Events.GuildCreate, (guild) => {
  db.guild(guild.id);
  db.save();
  log.info(`joined ${guild.name} — run /setup channel to start`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      const cmd = commands.get(interaction.commandName);
      if (!cmd) return;
      return await cmd.execute(interaction);
    }
    if (interaction.isAutocomplete()) {
      const cmd = commands.get(interaction.commandName);
      return await cmd?.autocomplete?.(interaction);
    }
    if (interaction.isMessageComponent() || interaction.isModalSubmit()) return await routeComponent(interaction);
  } catch (e) {
    log.error('interaction failed:', e);
    const msg = { content: '앗, 처리 중 오류가 났어요. 잠시 뒤 다시 시도해 주세요.', flags: MessageFlags.Ephemeral };
    if (interaction.isAutocomplete?.()) return;
    if (interaction.deferred || interaction.replied) await interaction.followUp(msg).catch(() => {});
    else await interaction.reply(msg).catch(() => {});
  }
});

client.on(Events.Error, (e) => log.error('client error', e));
process.on('unhandledRejection', (e) => log.error('unhandled rejection', e));

await client.login(config.token);
