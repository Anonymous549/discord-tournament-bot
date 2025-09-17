// src/commands/admin.js
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../lib/db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('tadmin')
    .setDescription('Tournament admin utilities')
    .addSubcommand(s => s.setName('force-confirm').setDescription('Confirm a player manually')
      .addIntegerOption(o => o.setName('id').setRequired(true))
      .addUserOption(o => o.setName('user').setRequired(true)))
    .addSubcommand(s => s.setName('force-unconfirm').setDescription('Un-confirm a player')
      .addIntegerOption(o => o.setName('id').setRequired(true))
      .addUserOption(o => o.setName('user').setRequired(true)))
    .addSubcommand(s => s.setName('promote-waitlist').setDescription('Promote first waitlist user into confirmed')
      .addIntegerOption(o => o.setName('id').setRequired(true)))
    .addSubcommand(s => s.setName('lock').setDescription('Lock tournament (disable join)')
      .addIntegerOption(o => o.setName('id').setRequired(true)))
    .addSubcommand(s => s.setName('unlock').setDescription('Unlock tournament')
      .addIntegerOption(o => o.setName('id').setRequired(true)))
    .addSubcommand(s => s.setName('export').setDescription('Export tournament JSON')
      .addIntegerOption(o => o.setName('id').setRequired(true)))
    .addSubcommand(s => s.setName('import').setDescription('Import tournament JSON (use carefully)')
      .addStringOption(o => o.setName('json').setRequired(true)))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'force-confirm' || sub === 'force-unconfirm') {
      const tid = interaction.options.getInteger('id');
      const user = interaction.options.getUser('user');
      const t = await db.get('SELECT * FROM tournaments WHERE id = ?', [tid]);
      if (!t) return interaction.reply({ content: 'Tournament not found', ephemeral: true });
      let players = JSON.parse(t.players || '[]');
      let p = players.find(x => x.id === user.id);
      if (!p) {
        if (sub === 'force-confirm') {
          p = { id: user.id, confirmed: true, joined_at: Date.now() };
          players.push(p);
        } else {
          return interaction.reply({ content: 'User not registered', ephemeral: true });
        }
      } else {
        p.confirmed = (sub === 'force-confirm');
      }
      await db.run('UPDATE tournaments SET players = ? WHERE id = ?', [JSON.stringify(players), tid]);
      return interaction.reply({ content: `${user.tag} ${sub === 'force-confirm' ? 'confirmed' : 'unconfirmed'}.`, ephemeral: true });
    }

    if (sub === 'promote-waitlist') {
      const tid = interaction.options.getInteger('id');
      const t = await db.get('SELECT * FROM tournaments WHERE id = ?', [tid]);
      if (!t) return interaction.reply({ content: 'Tournament not found', ephemeral: true });
      let players = JSON.parse(t.players || '[]');
      const capacity = t.total_slots || t.max_players || 16;
      const confirmedCount = players.filter(p => p.confirmed).length;
      if (confirmedCount >= capacity) return interaction.reply({ content: 'No capacity to promote (already full)', ephemeral: true });
      const waitlist = players.filter(p => !p.confirmed);
      if (waitlist.length === 0) return interaction.reply({ content: 'No waitlist users to promote', ephemeral: true });
      const first = waitlist[0];
      first.confirmed = true;
      await db.run('UPDATE tournaments SET players = ? WHERE id = ?', [JSON.stringify(players), tid]);
      return interaction.reply({ content: `Promoted <@${first.id}> to confirmed.`, ephemeral: true });
    }

    if (sub === 'lock' || sub === 'unlock') {
      const tid = interaction.options.getInteger('id');
      const t = await db.get('SELECT * FROM tournaments WHERE id = ?', [tid]);
      if (!t) return interaction.reply({ content: 'Tournament not found', ephemeral: true });
      const newStatus = (sub === 'lock') ? 'locked' : 'open';
      await db.run('UPDATE tournaments SET status = ? WHERE id = ?', [newStatus, tid]);
      return interaction.reply({ content: `Tournament ${sub === 'lock' ? 'locked' : 'unlocked'}.`, ephemeral: true });
    }

    if (sub === 'export') {
      const tid = interaction.options.getInteger('id');
      const t = await db.get('SELECT * FROM tournaments WHERE id = ?', [tid]);
      if (!t) return interaction.reply({ content: 'Tournament not found', ephemeral: true });
      const json = JSON.stringify(t, null, 2);
      return interaction.reply({ content: 'Exported JSON attached.', files: [{ attachment: Buffer.from(json), name: `tournament-${tid}.json` }], ephemeral: true });
    }

    if (sub === 'import') {
      const raw = interaction.options.getString('json');
      let obj;
      try { obj = JSON.parse(raw); } catch (e) { return interaction.reply({ content: 'Invalid JSON', ephemeral: true }); }
      if (obj.id) delete obj.id;
      const fields = ['guild_id','channel_id','name','owner_id','max_players','total_slots','group_size','mention_role_id','status','players','matches','groups','created_at'];
      const vals = fields.map(f => obj[f] !== undefined ? obj[f] : null);
      const placeholders = fields.map(_ => '?').join(',');
      await db.run(`INSERT INTO tournaments (${fields.join(',')}) VALUES (${placeholders})`, vals);
      return interaction.reply({ content: 'Imported tournament (new record).', ephemeral: true });
    }

    await interaction.reply({ content: 'Unknown admin subcommand', ephemeral: true });
  }
};
