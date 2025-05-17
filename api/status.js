const express = require('express');
const router = express.Router();
const { pool } = require('../db-create');

router.post('/status', async (req, res) => {
  console.log('Received request to upload status:', req.body);

  const {
    userId,
    mediaUrl,
    caption = '',
    notAllowId = [],
    readId = [],
    timestamp = null
  } = req.body;

  if (!userId || !mediaUrl) {
    console.error('Missing userId or mediaUrl:', { userId, mediaUrl });
    return res.status(400).json({ error: 'Missing userId or mediaUrl' });
  }

  try {
    console.log(`Storing media URL for user ${userId}:`, mediaUrl);

    // Convert millisecond timestamp to ISO format if provided
    const formattedTimestamp = timestamp ? new Date(timestamp).toISOString() : null;

    const result = await pool.query(
      `INSERT INTO status (user_id, media_url, caption, not_allow_id, read_id, timestamp) 
       VALUES ($1, $2, $3, $4, $5, COALESCE($6, NOW())) RETURNING *`,
      [userId, mediaUrl, caption, notAllowId, readId, formattedTimestamp]
    );

    console.log('Status stored successfully:', result.rows[0]);
    return res.status(201).json({ status: 'ok', data: result.rows[0] });

  } catch (err) {
    console.error('Error storing status:', err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

module.exports = router;
