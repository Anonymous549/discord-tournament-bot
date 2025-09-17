// src/commands/tournament.js
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');
const db = require('../lib/db');
const { generateSingleElim, generateGroups, distributeRoundRobin } = require('../lib/brackets');
const { updateElo } = require('../lib/ratings');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('tournament')
    .setDescription('Tournament management')
    .addSubcommand(s => s.setName('create')
      .setDescription('Create a tournament')
      .addStringOption(o => o.setName('name').setRequired(true).setDescription('Tournament name'))
      .addIntegerOption(o => o.setName('slots').setRequired(false).setDescription('Total slots (capacity)'))
      .addIntegerOption(o => o.setName('group_size').setRequired(false).setDescription('Players per group (1 solo, 4 squads)'))
      .addRoleOption(o => o.setName('announce_role').setRequired(false).setDescription('Role to mention on start')))
    .addSubcommand(s => s.setName('join').setDescription('Join a tournament').addIntegerOption(o => o.setName('id').setRequired(false).setDescription('Tournament ID')))
    .addSubcommand(s => s.setName('leave').setDescription('Leave a tournament').addIntegerOption(o => o.setName('id').setRequired(false)))
    .addSubcommand(s => s.setName('start').setDescription('Start tournament (owner or admin)').addIntegerOption(o => o.setName('id').setRequired(false)))
    .addSubcommand(s => s.setName('info').setDescription('Show tournament info').addIntegerOption(o => o.setName('id').setRequired(false)))
    .addSubcommand(s => s.setName('bracket').setDescription('Show bracket (single elimination)').addIntegerOption(o => o.setName('id').setRequired(false)))
    .addSubcommand(s => s.setName('report').setDescription('Report match result').addIntegerOption(o => o.setName('id').setRequired(false))
      .addUserOption(o => o.setName('winner').setRequired(true))
      .addUserOption(o => o.setName('loser').setRequired(true))
      .addNumberOption(o => o.setName('score').setRequired(false).setDescription('Winner score')))
  ,
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    async function findTournamentFromOption() {
      const idOpt = interaction.options.getInteger('id');
      if (idOpt) return await db.get('SELECT * FROM tournaments WHERE id = ?', [idOpt]);
      const rows = await db.all('SELECT * FROM tournaments WHERE channel_id = ? ORDER BY created_at DESC LIMIT 1', [interaction.channelId]);
      return rows && rows[0] ? rows[0] : null;
    }

    if (sub === 'create') {
      const name = interaction.options.getString('name');
      const slots = interaction.options.getInteger('slots') || 16;
      const groupSize = interaction.options.getInteger('group_size') || 1;
      const role = interaction.options.getRole('announce_role');
      const mentionRoleId = role ? role.id : null;

      const res = await db.run(`INSERT INTO tournaments (guild_id, channel_id, name, owner_id, max_players, total_slots, group_size, mention_role_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [interaction.guildId, interaction.channelId, name, interaction.user.id, slots, slots, groupSize, mentionRoleId]);

      await interaction.reply({ content: `Tournament created: **${name}** (ID ${res.lastID}). Slots: ${slots}, Group size: ${groupSize}`, ephemeral: true });
      return;
    }

    if (sub === 'join') {
      const t = await findTournamentFromOption();
      if (!t) return interaction.reply({ content: 'No tournament found in this channel. Provide ID if it exists elsewhere.', ephemeral: true });

      if (t.status === 'locked') return interaction.reply({ content: 'Tournament is locked and not accepting joins.', ephemeral: true });

      let players = JSON.parse(t.players || '[]');
      if (players.find(p => p.id === interaction.user.id)) return interaction.reply({ content: 'You are already registered (pre-registered).', ephemeral: true });

      const capacity = t.total_slots || t.max_players || 16;
      const confirmedCount = players.filter(p => p.confirmed).length;
      if (confirmedCount >= capacity) return interaction.reply({ content: 'Tournament is full (confirmed slots).', ephemeral: true });

      players.push({ id: interaction.user.id, confirmed: false, joined_at: Date.now() });
      await db.run('UPDATE tournaments SET players = ? WHERE id = ?', [JSON.stringify(players), t.id]);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`t_confirm_${t.id}_${interaction.user.id}`)
          .setLabel('Confirm Registration')
          .setStyle(ButtonStyle.Primary)
      );

      try { await interaction.user.send(`You pre-registered for ${t.name} (ID ${t.id}). Press confirm in the server to finalize.`); } catch (e) { /* ignore DM failure */ }
      await interaction.reply({ content: `Pre-registered for **${t.name}**. Please confirm to secure your slot.`, components: [row], ephemeral: true });
      return;
    }

    if (sub === 'leave') {
      const t = await findTournamentFromOption();
      if (!t) return interaction.reply({ content: 'No tournament found.', ephemeral: true });
      let players = JSON.parse(t.players || '[]');
      const idx = players.findIndex(p => p.id === interaction.user.id);
      if (idx === -1) return interaction.reply({ content: 'You are not registered in this tournament.', ephemeral: true });
      players.splice(idx, 1);
      await db.run('UPDATE tournaments SET players = ? WHERE id = ?', [JSON.stringify(players), t.id]);
      await interaction.reply({ content: `You have left **${t.name}**.`, ephemeral: true });
      return;
    }

    if (sub === 'start') {
      const t = await findTournamentFromOption();
      if (!t) return interaction.reply({ content: 'No tournament found.', ephemeral: true });

      // Permission: owner or ManageGuild
      const isOwner = interaction.user.id === t.owner_id;
      const hasManage = interaction.member?.permissions?.has?.(PermissionFlagsBits.ManageGuild);
      if (!isOwner && !hasManage) {
        return interaction.reply({ content: 'Only the tournament owner or server managers can start.', ephemeral: true });
      }

      let players = JSON.parse(t.players || '[]');
      const confirmedPlayers = players.filter(p => p.confirmed).map(p => p.id);
      if (confirmedPlayers.length === 0) return interaction.reply({ content: 'No confirmed players. Cannot start.', ephemeral: true });

      const groupSize = t.group_size || 1;
      let groups = generateGroups(confirmedPlayers, groupSize, 'random');
      if (groups.length > 1) {
        const lastSize = groups[groups.length - 1].length;
        if (lastSize > 0 && lastSize <= Math.floor(groupSize / 2)) {
          groups = distributeRoundRobin(confirmedPlayers, groupSize);
        }
      }

      await db.run('UPDATE tournaments SET status = ?, groups = ? WHERE id = ?', ['running', JSON.stringify(groups), t.id]);

      const mentionText = t.mention_role_id ? `<@&${t.mention_role_id}> ` : '';
      const channel = interaction.channel;
      let announceText = `${mentionText}Tournament **${t.name}** is starting! ${groups.length} groups created (up to ${groupSize} per group).\n\n`;
      for (let i = 0; i < groups.length; i++) {
        const g = groups[i];
        const mentions = g.map(uid => `<@${uid}>`).join(' ');
        announceText += `**Group ${i + 1}** (${g.length}/${groupSize}): ${mentions}\n`;
      }
      await channel.send({ content: announceText });
      await interaction.reply({ content: `Tournament started and announced.`, ephemeral: true });
      return;
    }

    if (sub === 'info') {
      const t = await findTournamentFromOption();
      if (!t) return interaction.reply({ content: 'No tournament found.', ephemeral: true });

      const players = JSON.parse(t.players || '[]');
      const joined = players.length;
      const confirmed = players.filter(p => p.confirmed).length;
      const slots = t.total_slots || t.max_players || 16;
      const embed = new EmbedBuilder()
        .setTitle(`Tournament: ${t.name}`)
        .addFields(
          { name: 'ID', value: `${t.id}`, inline: true },
          { name: 'Status', value: `${t.status}`, inline: true },
          { name: 'Owner', value: `<@${t.owner_id}>`, inline: true },
          { name: 'Slots', value: `${confirmed} confirmed / ${joined} pre-registered (capacity ${slots})`, inline: false },
          { name: 'Group size', value: `${t.group_size}`, inline: true },
          { name: 'Mention role', value: t.mention_role_id ? `<@&${t.mention_role_id}>` : 'None', inline: true }
        )
        .setFooter({ text: `Created at ${new Date(t.created_at * 1000).toLocaleString()}` });

      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }

    if (sub === 'bracket') {
      const t = await findTournamentFromOption();
      if (!t) return interaction.reply({ content: 'No tournament found.', ephemeral: true });

      let players = JSON.parse(t.players || '[]').filter(p => p.confirmed).map(p => p.id);
      if (players.length === 0) return interaction.reply({ content: 'No confirmed players to generate bracket.', ephemeral: true });

      const rounds = generateSingleElim(players);
      let text = `Single-elimination bracket for **${t.name}**:\n`;
      rounds.forEach((round, idx) => {
        text += `\n**Round ${idx + 1}**\n`;
        round.forEach((m, mi) => {
          const a = m.a ? `<@${m.a}>` : 'BYE';
          const b = m.b ? `<@${m.b}>` : 'BYE';
          text += `Match ${mi + 1}: ${a} vs ${b}\n`;
        });
      });
      await interaction.reply({ content: text.substring(0, 1900), ephemeral: true });
      return;
    }

    if (sub === 'report') {
      const t = await findTournamentFromOption();
      if (!t) return interaction.reply({ content: 'No tournament found.', ephemeral: true });

      const winner = interaction.options.getUser('winner');
      const loser = interaction.options.getUser('loser');
      const score = interaction.options.getNumber('score') || 1;

      const rArow = await db.get('SELECT * FROM ratings WHERE user_id = ?', [winner.id]);
      const rBrow = await db.get('SELECT * FROM ratings WHERE user_id = ?', [loser.id]);
      const rA = rArow ? rArow.rating : 1200;
      const rB = rBrow ? rBrow.rating : 1200;
      const [newA, newB] = updateElo(rA, rB, 1);
      if (rArow) await db.run('UPDATE ratings SET rating = ? WHERE user_id = ?', [newA, winner.id]);
      else await db.run('INSERT INTO ratings (user_id, rating) VALUES (?, ?)', [winner.id, newA]);
      if (rBrow) await db.run('UPDATE ratings SET rating = ? WHERE user_id = ?', [newB, loser.id]);
      else await db.run('INSERT INTO ratings (user_id, rating) VALUES (?, ?)', [loser.id, newB]);

      const matches = JSON.parse(t.matches || '[]');
      matches.push({ a: loser.id, b: winner.id, winner: winner.id, score, ts: Date.now() });
      await db.run('UPDATE tournaments SET matches = ? WHERE id = ?', [JSON.stringify(matches), t.id]);

      await interaction.reply({ content: `Result recorded. Updated ratings — <@${winner.id}>: ${Math.round(newA)} | <@${loser.id}>: ${Math.round(newB)}`, ephemeral: true });
      return;
    }

    await interaction.reply({ content: 'Unknown subcommand', ephemeral: true });
  }
};
