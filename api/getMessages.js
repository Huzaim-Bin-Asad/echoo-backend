const express = require('express');
const router = express.Router();
const { pool } = require('../db-create');

// In routes/messages.js
router.post('/get-messages', async (req, res) => {
  const { sender_id, receiver_id } = req.body;

  if (!sender_id || !receiver_id) {
    return res.status(400).json({ error: 'Missing sender_id or receiver_id' });
  }

  try {
    const { rows: messages } = await pool.query(
      `
      SELECT * FROM messages
      WHERE 
        (sender_id = $1 AND receiver_id = $2)
        OR
        (sender_id = $2 AND receiver_id = $1)
      ORDER BY timestamp ASC
      `,
      [sender_id, receiver_id]
    );

    res.json({ messages });
  } catch (err) {
    console.error('❌ Error fetching messages:', err.message);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

module.exports = router;
