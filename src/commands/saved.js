import { SlashCommandBuilder } from 'discord.js';
import { db } from '../db.js';
import { savedPanel } from '../ui/panels.js';

export const savedView = (userId) => {
  const u = db.user(userId);
  const items = u.saved.map((id) => db.item(id)).filter(Boolean).reverse();
  return savedPanel(items, u.language);
};

export default {
  data: new SlashCommandBuilder().setName('saved').setDescription('저장한 소식 보기'),
  execute: (interaction) => interaction.reply(savedView(interaction.user.id)),
};
