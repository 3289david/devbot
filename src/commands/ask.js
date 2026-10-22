import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { askGeneral, aiEnabled } from '../ai.js';
import { db } from '../db.js';
import { answerPanel } from '../askflow.js';
import { say } from './_shared.js';

export default {
  data: new SlashCommandBuilder()
    .setName('ask')
    .setDescription('개발 관련 질문을 AI에게 물어봐요 (내 스택 기준)')
    .addStringOption((o) => o.setName('question').setDescription('질문').setRequired(true).setMaxLength(600)),
  async execute(interaction) {
    if (!aiEnabled) return say(interaction, 'AI 기능이 설정되지 않았어요. 관리자가 `ANTHROPIC_API_KEY`를 설정해야 해요.');
    const u = db.user(interaction.user.id);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const question = interaction.options.getString('question');
    return interaction.editReply(await answerPanel({ userId: interaction.user.id, question, general: true, run: () => askGeneral({ question, stack: u.stack, lang: u.language }) }));
  },
};
