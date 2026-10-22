import { SlashCommandBuilder } from 'discord.js';
import { db } from '../db.js';
import { settingsPanel } from '../ui/panels.js';

export default {
  data: new SlashCommandBuilder().setName('settings').setDescription('내 알림·구독·브리핑·스택 설정 패널'),
  execute: (interaction) => interaction.reply(settingsPanel(db.user(interaction.user.id))),
};
