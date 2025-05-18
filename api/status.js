const express = require('express');
const router = express.Router();
const { pool } = require('../db-create');

router.post('/status', async (req, res) => {

  const {
    userId,
    mediaUrl,
    caption = '',
    notAllowId = [],
    readId = [],
    timestamp = null
  } = req.body;

  if (!userId || !mediaUrl) {
    return res.status(400).json({ error: 'Missing userId or mediaUrl' });
  }

  try {

    // Convert millisecond timestamp to ISO format if provided
    const formattedTimestamp = timestamp ? new Date(timestamp).toISOString() : null;

    const result = await pool.query(
      `INSERT INTO status (user_id, media_url, caption, not_allow_id, read_id, timestamp) 
       VALUES ($1, $2, $3, $4, $5, COALESCE($6, NOW())) RETURNING *`,
      [userId, mediaUrl, caption, notAllowId, readId, formattedTimestamp]
    );

    return res.status(201).json({ status: 'ok', data: result.rows[0] });

  } catch (err) {
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

module.exports = router;
