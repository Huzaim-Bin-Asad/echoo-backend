const express = require('express');
const { pool } = require('../db-create');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();

/**
 * @route POST /add-contact
 * @desc Add a new contact
 * @access Private
 */
router.post('/add-contact', async (req, res) => {
  const { user_id, contact_name, contact_message, contacted_email, contacted_username } = req.body;
  const timestamp = new Date().toISOString();
  const requestId = uuidv4();

  console.log(`[${timestamp}] [${requestId}] ➕ Contact creation request received`);

  if (!user_id || !contact_name) {
    const errorMsg = 'Missing required fields: ' + 
      (!user_id ? 'user_id ' : '') + 
      (!contact_name ? 'contact_name' : '');
    console.warn(`[${timestamp}] [${requestId}] ❌ ${errorMsg}`);
    return res.status(400).json({ 
      message: errorMsg,
      requestId,
      status: 'failed'
    });
  }

  let contacted_id = null;

  try {
    // Make sure both contacted_email and contacted_username are provided
    if (contacted_email && contacted_username) {
      const result = await pool.query(
        `SELECT user_id FROM users WHERE email = $1 AND username = $2 LIMIT 1`,
        [contacted_email, contacted_username]
      );

      if (result.rows.length > 0) {
        contacted_id = result.rows[0].user_id;
        console.log(`[${timestamp}] [${requestId}] 🧩 Matched contacted user ID: ${contacted_id}`);
      } else {
        console.warn(`[${timestamp}] [${requestId}] ❌ No user found matching both email and username`);
        return res.status(404).json({
          message: 'No user found matching the provided email and username.',
          requestId,
          status: 'failed'
        });
      }
    } else {
      return res.status(400).json({
        message: 'Both contacted_email and contacted_username are required.',
        requestId,
        status: 'failed'
      });
    }
  } catch (lookupErr) {
    console.error(`[${timestamp}] [${requestId}] ⚠️ Error looking up contacted user:\n`, lookupErr);
    return res.status(500).json({ 
      message: 'Error fetching contacted user.',
      requestId,
      status: 'error'
    });
  }

  try {
    const contact_id = uuidv4();
    const query = `
      INSERT INTO contacts (contact_id, user_id, contacted_id, contact_name, contact_message, created_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
      RETURNING contact_id, contact_name, created_at
    `;
    const values = [contact_id, user_id, contacted_id, contact_name, contact_message || null];

    console.log(`[${timestamp}] [${requestId}] 🛠️ Inserting contact`);
    const result = await pool.query(query, values);

    console.log(`[${timestamp}] [${requestId}] ✅ Contact created successfully`);
    res.status(201).json({
      status: 'success',
      data: result.rows[0],
      requestId
    });

  } catch (err) {
    console.error(`[${timestamp}] [${requestId}] 🚨 Database error during insert:\n`, err);
    res.status(500).json({ 
      message: 'Internal server error',
      requestId,
      status: 'error'
    });
  }
});

/**
 * @route POST /api/check-email
 * @desc Check if email exists and return associated username
 * @access Public
 */
router.post('/check-email', async (req, res) => {
  const { email } = req.body;
  const timestamp = new Date().toISOString();
  const requestId = uuidv4();

  console.log(`[${timestamp}] [${requestId}] 📧 Email lookup request received`);

  if (!email) {
    console.warn(`[${timestamp}] [${requestId}] ❌ Missing email parameter`);
    return res.status(400).json({ 
      message: 'Email parameter is required',
      requestId
    });
  }

  try {
    const result = await pool.query(
      `SELECT user_id, username FROM users WHERE email = $1`,
      [email]
    );

    if (result.rows.length > 0) {
      console.log(`[${timestamp}] [${requestId}] ✅ User found`);
      return res.status(200).json({
        status: 'success',
        exists: true,
        user_id: result.rows[0].user_id,
        username: result.rows[0].username,
        requestId
      });
    }

    console.log(`[${timestamp}] [${requestId}] ℹ️ No user found with this email`);
    res.status(200).json({
      status: 'success',
      exists: false,
      requestId
    });

  } catch (err) {
    console.error(`[${timestamp}] [${requestId}] 🚨 Database error:\n`, err);
    res.status(500).json({ 
      message: 'Internal server error',
      requestId,
      status: 'error'
    });
  }
});

/**
 * @route POST /api/check-username
 * @desc Check if username exists and return associated email
 * @access Public
 */
router.post('/check-username', async (req, res) => {
  const { username } = req.body;
  const timestamp = new Date().toISOString();
  const requestId = uuidv4();

  console.log(`[${timestamp}] [${requestId}] 👤 Username lookup request received`);

  if (!username) {
    console.warn(`[${timestamp}] [${requestId}] ❌ Missing username parameter`);
    return res.status(400).json({ 
      message: 'Username parameter is required',
      requestId
    });
  }

  try {
    const result = await pool.query(
      `SELECT user_id, email FROM users WHERE username = $1`,
      [username]
    );

    if (result.rows.length > 0) {
      console.log(`[${timestamp}] [${requestId}] ✅ User found`);
      return res.status(200).json({
        status: 'success',
        exists: true,
        user_id: result.rows[0].user_id,
        email: result.rows[0].email,
        requestId
      });
    }

    console.log(`[${timestamp}] [${requestId}] ℹ️ No user found with this username`);
    res.status(200).json({
      status: 'success',
      exists: false,
      requestId
    });

  } catch (err) {
    console.error(`[${timestamp}] [${requestId}] 🚨 Database error:\n`, err);
    res.status(500).json({ 
      message: 'Internal server error',
      requestId,
      status: 'error'
    });
  }
});

module.exports = router;
