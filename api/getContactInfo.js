require('dotenv').config();
const { pool } = require('../db-create');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const express = require('express');
const router = express.Router();

// Function to get contact details based on sender_id and receiver_id
const getContactDetails = async (senderId, receiverId) => {

  try {
    // If sender and receiver are the same, return user's own details
    if (senderId === receiverId) {

      const userQuery = `
        SELECT full_name AS contact_name, profile_picture
        FROM users
        WHERE user_id = $1
        LIMIT 1;
      `;
      const userRes = await pool.query(userQuery, [senderId]);

      if (userRes.rows.length === 0) {
        throw new Error('User not found');
      }

      const { contact_name, profile_picture } = userRes.rows[0];
      return {
        contactName: contact_name,
        profilePicture: profile_picture,
      };
    }

    // Otherwise, get contact name from contacts table
    const contactQuery = `
      SELECT contact_name
      FROM contacts
      WHERE sender_id = $1 AND receiver_id = $2
      LIMIT 1;
    `;
    const contactRes = await pool.query(contactQuery, [senderId, receiverId]);

    if (contactRes.rows.length === 0) {
      throw new Error('Contact not found');
    }

    const contactName = contactRes.rows[0].contact_name;

    // Get receiver's profile picture from users table
    const userQuery = `
      SELECT profile_picture
      FROM users
      WHERE user_id = $1
      LIMIT 1;
    `;
    const userRes = await pool.query(userQuery, [receiverId]);

    if (userRes.rows.length === 0) {
      throw new Error('User not found');
    }

    const profilePicture = userRes.rows[0].profile_picture;

    return {
      contactName,
      profilePicture,
    };
  } catch (error) {
    console.error('Error fetching contact details:', error);
    throw error;
  }
};

// POST endpoint to fetch contact details
router.post('/contact-info', async (req, res) => {

  try {
    const { sender_id, receiver_id } = req.body;

    if (!sender_id || !receiver_id) {
      return res.status(400).json({ error: 'sender_id and receiver_id are required' });
    }

    const contactDetails = await getContactDetails(sender_id, receiver_id);

    return res.json(contactDetails);
  } catch (error) {
    console.error('Error in /contact-info route:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
