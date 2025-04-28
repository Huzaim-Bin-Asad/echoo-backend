const express = require('express');
const jwt = require('jsonwebtoken');
const { pool } = require('../db-create');
const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET;

router.get('/userinfo', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Token missing' });

    const decoded = jwt.verify(token, JWT_SECRET);
    const userId = decoded.user_id;

    // Query user basic data
    const userQuery = await pool.query(`
      SELECT 
        user_id, first_name, last_name, email, username, gender, 
        profile_picture, created_at, updated_at, about_message
      FROM users
      WHERE user_id = $1;
    `, [userId]);

    if (!userQuery.rows.length) return res.status(404).json({ error: 'User not found' });

    const user = userQuery.rows[0];

    // Query chat_previews separately
    const chatPreviewsQuery = await pool.query(`
      SELECT 
        chat_id, contact_name, last_message, last_message_time, unread_count, avatar_url, created_at
      FROM chat_previews
      WHERE user_id = $1;
    `, [userId]);

    // Query contacts separately
    const contactsQuery = await pool.query(`
      SELECT 
        contact_id, contacted_id, contact_name, contact_message, created_at
      FROM contacts
      WHERE user_id = $1;
    `, [userId]);

    const userData = {
      user: {
        user_id: user.user_id,
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
        username: user.username,
        gender: user.gender,
        profile_picture: user.profile_picture,
        about_message: user.about_message,
        created_at: user.created_at,
        updated_at: user.updated_at,
      },
      chat_previews: chatPreviewsQuery.rows,
      contacts: contactsQuery.rows,
    };

    res.json(userData);
  } catch (err) {
    console.error(err);
    if (err instanceof jwt.JsonWebTokenError) {
      res.status(401).json({ error: 'Invalid token' });
    } else {
      res.status(500).json({ error: 'Server error' });
    }
  }
});

module.exports = router;
