const { pool } = require('../db-create');
const cron = require('node-cron');

cron.schedule(
  '*/60 * * * * *',
  async () => {
    try {
      const now = new Date();
      const result = await pool.query(
        `DELETE FROM status WHERE timestamp < NOW() - INTERVAL '24 hours' RETURNING *`
      );

      if (result.rowCount > 0) {
        console.log(`[${now.toISOString()}] Deleted ${result.rowCount} expired status(es).`);
      }
    } catch (err) {
      console.error('Error deleting expired statuses:', err);
    }
  },
  {
    scheduled: true,
    timezone: "UTC" // Optional: helps avoid local date issues
  }
);
