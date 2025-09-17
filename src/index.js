// src/index.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const { Client, Collection, GatewayIntentBits, Partials } = require('discord.js');
const db = require('./lib/db');
const startScheduler = require('./scheduler').startScheduler;

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages],
  partials: [Partials.Channel]
});
client.commands = new Collection();
const commandFiles = fs.readdirSync(path.join(__dirname, 'commands')).filter(f => f.endsWith('.js'));
for (const file of commandFiles) {
  const cmd = require(`./commands/${file}`);
  client.commands.set(cmd.data.name, cmd);
}

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);
  await db.init();
  // start scheduler (no-op by default; extend in scheduler.js)
  try { startScheduler(client); } catch (e) { console.error('Scheduler failed to start', e); }
});

// Interaction handling (commands + buttons)
client.on('interactionCreate', async (interaction) => {
  try {
    // Buttons (confirmation)
    if (interaction.isButton()) {
      const id = interaction.customId;
      if (id.startsWith('t_confirm_')) {
        const parts = id.split('_'); // ['t','confirm','{tid}','{uid}']
        const tid = parts[2];
        const uid = parts[3];
        if (interaction.user.id !== uid) {
          return interaction.reply({ content: 'Only the registrant can confirm.', ephemeral: true });
        }
        const t = await db.get('SELECT * FROM tournaments WHERE id = ?', [tid]);
        if (!t) return interaction.reply({ content: 'Tournament not found.', ephemeral: true });
        const players = JSON.parse(t.players || '[]');
        const p = players.find(pp => pp.id === uid);
        if (!p) return interaction.reply({ content: 'You are not registered.', ephemeral: true });

        const capacity = t.total_slots || t.max_players || 16;
        const confirmedCount = players.filter(pp => pp.confirmed).length;
        if (confirmedCount >= capacity) {
          return interaction.update({ content: 'Sorry — tournament is full (confirmed slots).', components: [] });
        }

        p.confirmed = true;
        await db.run('UPDATE tournaments SET players = ? WHERE id = ?', [JSON.stringify(players), tid]);

        try { await interaction.user.send(`✅ Registration confirmed for ${t.name}. Good luck!`); } catch (e) { /* ignore DM failure */ }
        return interaction.update({ content: 'Registration confirmed. Check your DMs!', components: [] });
      }
    }

    // Slash commands
    if (!interaction.isChatInputCommand()) return;
    const cmd = client.commands.get(interaction.commandName);
    if (!cmd) return;
    await cmd.execute(interaction, client);
  } catch (err) {
    console.error('Interaction error', err);
    try {
      if (interaction.replied || interaction.deferred) await interaction.followUp({ content: 'Error processing interaction', ephemeral: true });
      else await interaction.reply({ content: 'Error processing interaction', ephemeral: true });
    } catch (e) { console.error('Failed to send error reply', e); }
  }
});

// Ping server so Replit / uptime monitor can keep instance awake
const app = express();
app.get('/ping', (req, res) => res.send('pong'));
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Ping server listening on ${port}`));

// Login
client.login(process.env.BOT_TOKEN);
