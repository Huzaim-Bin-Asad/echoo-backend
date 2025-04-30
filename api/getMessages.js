// getMessages.js
const express = require('express');
const router = express.Router();
const { pool } = require('../db-create');

// Fetch messages between two users by contact_id
router.get('/get-messages/:contact_id/:user_id', async (req, res) => {
  const { contact_id, user_id } = req.params;

  try {
    const result = await pool.query(
      `SELECT * FROM messages WHERE contact_id = $1 ORDER BY timestamp ASC`,
      [contact_id]
    );

    const messages = result.rows.map(msg => ({
      ...msg,
      from: msg.sender_id === user_id ? 'me' : 'them',
      text: msg.message_text,
      time: msg.timestamp
    }));

    res.json(messages);
  } catch (err) {
    console.error('❌ Error fetching messages:', err);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

module.exports = router; // Correct export of the router
