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

    // Get user base info
    const userQuery = await pool.query(`
      SELECT 
        user_id, full_name, email, username, gender, 
        profile_picture, created_at, updated_at, about_message
      FROM users
      WHERE user_id = $1;
    `, [userId]);

    if (!userQuery.rows.length) {
      console.warn('⚠️ User not found');
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userQuery.rows[0];

    // Get full contact data (all columns)
    const contactsQuery = await pool.query(`
      SELECT 
        contact_id, user_id, sender_id, receiver_id, 
        contact_name, created_at
      FROM contacts
      WHERE user_id = $1;
    `, [userId]);

    const contacts = contactsQuery.rows;

    // Enrich each contact with profile_picture and about_message of the receiver
    const enrichedContacts = await Promise.all(
      contacts.map(async (contact) => {
        const userDetailsQuery = await pool.query(`
          SELECT profile_picture, about_message
          FROM users
          WHERE user_id = $1;
        `, [contact.receiver_id]);

        const userDetails = userDetailsQuery.rows[0] || {};
        return {
          ...contact,
          profile_picture: userDetails.profile_picture || null,
          about_message: userDetails.about_message || null,
        };
      })
    );

    // Get chat previews for this user
    let chatPreviews = [];
    try {
      const chatPreviewsQuery = await pool.query(`
        SELECT 
          contact_id, profile_picture, contact_name, last_text,
          text_timestamp, sender_id, receiver_id, user_id
        FROM chat_previews
        WHERE sender_id = $1;
      `, [userId]);

      chatPreviews = chatPreviewsQuery.rows;
    } catch (previewErr) {
      console.error('❌ Error fetching chat previews:', previewErr);
    }

    const userData = {
      user: {
        user_id: user.user_id,
        full_name: user.full_name,
        email: user.email,
        username: user.username,
        gender: user.gender,
        profile_picture: user.profile_picture,
        about_message: user.about_message,
        created_at: user.created_at,
        updated_at: user.updated_at,
      },
      contacts: enrichedContacts,
      chat_previews: chatPreviews,
    };

    res.json(userData);
  } catch (err) {
    console.error('❌ Server error in /userinfo:', err);
    if (err instanceof jwt.JsonWebTokenError) {
      res.status(401).json({ error: 'Invalid token' });
    } else {
      res.status(500).json({ error: 'Server error' });
    }
  }
});

module.exports = router;
