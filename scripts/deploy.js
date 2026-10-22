import { config } from '../src/config.js';
import { registerCommands } from '../src/deploy.js';

if (!config.token || !config.clientId) {
  console.error('DISCORD_TOKEN and DISCORD_CLIENT_ID are required (see .env.example).');
  process.exit(1);
}
await registerCommands();
