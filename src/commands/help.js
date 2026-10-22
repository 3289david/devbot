import { SlashCommandBuilder } from 'discord.js';
import { helpPanel } from '../ui/panels.js';

export default {
  data: new SlashCommandBuilder().setName('help').setDescription('DevBot 사용법'),
  execute: (interaction) => interaction.reply(helpPanel()),
};
