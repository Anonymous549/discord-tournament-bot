// src/scheduler.js
const cron = require('node-cron');
const db = require('./lib/db');

// startScheduler(client) - placeholder; you can expand to send reminders, etc.
function startScheduler(client) {
  // Example: every minute run (skeleton)
  cron.schedule('* * * * *', async () => {
    // Example: check tournaments and send reminders (not implemented by default)
    // Keep this light on Replit to avoid rate limits.
  });
}

module.exports = { startScheduler };
