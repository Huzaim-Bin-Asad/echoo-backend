const express = require('express');
const router = express.Router();
const { pool } = require('../db-create');

router.post('/getCurrentStatus', async (req, res) => {
  const { user_id } = req.body;

  if (!user_id) {
    return res.status(400).json({ message: 'user_id is required' });
  }

  try {
    const result = await pool.query(
      'SELECT * FROM status WHERE user_id = $1 ORDER BY timestamp DESC LIMIT 1',
      [user_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'No status found' });
    }

    return res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching current status:', error);
    return res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
