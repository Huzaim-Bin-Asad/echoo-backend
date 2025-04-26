const express = require('express');
const jwt = require('jsonwebtoken');
const { pool } = require('../db-create');
const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET;

router.get('/userinfo', async (req, res) => {
  try {
    // Retrieve the token from the Authorization header
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Token missing' });

    // Verify the token
    const decoded = jwt.verify(token, JWT_SECRET);
    const userId = decoded.user_id;

    // Query to get user data and related chat previews and contacts
    const userQuery = await pool.query(`
      SELECT 
        u.user_id, u.first_name, u.last_name, u.email, u.username, u.gender, 
        u.profile_picture, u.created_at, u.updated_at, u.about_message, -- 🆕 Added about_message
        cp.chat_id, cp.contact_name AS chat_contact_name, cp.last_message, cp.last_message_time, cp.unread_count, cp.avatar_url AS chat_avatar_url,
        c.contact_id, c.contact_name AS contact_name, c.contact_message, c.created_at AS contact_created_at
      FROM users u
      LEFT JOIN chat_previews cp ON u.user_id = cp.user_id
      LEFT JOIN contacts c ON u.user_id = c.user_id
      WHERE u.user_id = $1;
    `, [userId]);

    const user = userQuery.rows[0];

    // Check if user exists
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Structure the response
    const userData = {
      user: {
        user_id: user.user_id,
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
        username: user.username,
        gender: user.gender,
        profile_picture: user.profile_picture,
        about_message: user.about_message, // 🆕 Added here in response
        created_at: user.created_at,
        updated_at: user.updated_at,
      },
      chat_previews: userQuery.rows.filter(row => row.chat_id), // Filter chat preview data
      contacts: userQuery.rows.filter(row => row.contact_id),   // Filter contact data
    };

    // Send response with user data and associated chat previews & contacts
    res.json(userData);
  } catch (err) {
    console.error(err);
    res.status(401).json({ error: 'Invalid token' });
  }
});

module.exports = router;
