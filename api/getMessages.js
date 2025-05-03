const express = require('express');
const router = express.Router();
const { pool } = require('../db-create');

// In routes/messages.js
router.post('/get-messages', async (req, res) => {
  const { sender_id, receiver_id, before } = req.body;

  if (!sender_id || !receiver_id) {
    return res.status(400).json({ error: 'Missing sender_id or receiver_id' });
  }

  // Define the base query to fetch messages between sender and receiver
  let query = `
    SELECT temp_id, sender_id, receiver_id, message_text, timestamp 
    FROM messages
    WHERE 
      (sender_id = $1 AND receiver_id = $2)
      OR
      (sender_id = $2 AND receiver_id = $1)
  `;

  // If 'before' timestamp is provided, add condition to filter messages after that timestamp
  const queryParams = [sender_id, receiver_id];
  if (before) {
    query += ` AND timestamp > $3`;
    queryParams.push(before); // Add 'before' timestamp to query parameters
  }

  // Order the messages by timestamp in ascending order
  query += ' ORDER BY timestamp ASC';

  try {
    const { rows: messages } = await pool.query(query, queryParams);

    res.json({ messages });
  } catch (err) {
    console.error('❌ Error fetching messages:', err.message);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

module.exports = router;
