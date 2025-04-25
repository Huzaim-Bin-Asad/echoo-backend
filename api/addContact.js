const express = require('express');
const { pool } = require('../db-create');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();

// Add a new contact
router.post('/add-contact', async (req, res) => {
  const { user_id, contact_name, contact_message } = req.body;
  const timestamp = new Date().toISOString();
  const requestId = uuidv4(); // Generate a unique ID for tracking

  console.log(`[${timestamp}] [${requestId}] ➕ Received request to add contact:`);
  console.log(`  - user_id: ${user_id}`);
  console.log(`  - contact_name: ${contact_name}`);
  console.log(`  - contact_message: ${contact_message}`);

  // Validation
  if (!user_id || !contact_name) {
    console.warn(`[${timestamp}] [${requestId}] ❌ Missing required fields`);
    return res.status(400).json({ message: 'User ID and Contact Name are required.' });
  }

  try {
    const contact_id = uuidv4();

    const query = `
      INSERT INTO contacts (contact_id, user_id, contact_name, contact_message, created_at)
      VALUES ($1, $2, $3, $4, NOW()) RETURNING *
    `;
    const values = [contact_id, user_id, contact_name, contact_message || null];

    console.log(`[${timestamp}] [${requestId}] 📤 Executing query:\n  ${query}`);
    console.log(`  - With values: ${JSON.stringify(values)}`);

    const result = await pool.query(query, values);

    console.log(`[${timestamp}] [${requestId}] ✅ Contact added successfully:\n  ${JSON.stringify(result.rows[0], null, 2)}`);
    res.status(201).json({
      message: 'Contact added successfully',
      contact: result.rows[0],
    });

  } catch (err) {
    console.error(`[${timestamp}] [${requestId}] ❗ Error adding contact:\n`, err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/api/check-email', async (req, res) => {
    const { email } = req.body;
    const timestamp = new Date().toISOString();
    const requestId = uuidv4();
  
    console.log(`[${timestamp}] [${requestId}] 📧 Checking email: ${email}`);
  
    try {
      const result = await pool.query(
        `SELECT username FROM users WHERE email = $1`,
        [email]
      );
  
      if (result.rows.length > 0) {
        console.log(`[${timestamp}] [${requestId}] ✅ Found username: ${result.rows[0].username}`);
        return res.status(200).json({ username: result.rows[0].username });
      } else {
        console.warn(`[${timestamp}] [${requestId}] ❌ No user found with that email.`);
        return res.status(404).json({ message: 'User not found' });
      }
    } catch (err) {
      console.error(`[${timestamp}] [${requestId}] ❗ Error checking email:\n`, err);
      res.status(500).json({ message: 'Server error' });
    }
  });
  

  router.post('/api/check-username', async (req, res) => {
    const { username } = req.body;
    const timestamp = new Date().toISOString();
    const requestId = uuidv4();
  
    console.log(`[${timestamp}] [${requestId}] 👤 Checking username: ${username}`);
  
    try {
      const result = await pool.query(
        `SELECT email FROM users WHERE username = $1`,
        [username]
      );
  
      if (result.rows.length > 0) {
        console.log(`[${timestamp}] [${requestId}] ✅ Found email: ${result.rows[0].email}`);
        return res.status(200).json({ email: result.rows[0].email });
      } else {
        console.warn(`[${timestamp}] [${requestId}] ❌ No user found with that username.`);
        return res.status(404).json({ message: 'User not found' });
      }
    } catch (err) {
      console.error(`[${timestamp}] [${requestId}] ❗ Error checking username:\n`, err);
      res.status(500).json({ message: 'Server error' });
    }
  });
  
module.exports = router;
