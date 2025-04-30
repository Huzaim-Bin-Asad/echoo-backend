const express = require('express');
const { pool } = require('../db-create');
const router = express.Router();

// Update user profile route
router.put('/users/update', async (req, res) => {
  const { user_id, full_name, email, about_message, username } = req.body;

  if (!user_id) {
    return res.status(400).send('Missing user_id in request body');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let updateQuery = 'UPDATE users SET';
    const values = [];
    let index = 1;

    if (full_name) {
      updateQuery += ` full_name = $${index++},`;
      values.push(full_name);
    }
    if (email) {
      updateQuery += ` email = $${index++},`;
      values.push(email);
    }
    if (about_message) {
      updateQuery += ` about_message = $${index++},`;
      values.push(about_message);
    }
    if (username) {
      updateQuery += ` username = $${index++},`;
      values.push(username);
    }

    if (values.length === 0) {
      return res.status(400).send('No fields provided to update');
    }

    updateQuery = updateQuery.slice(0, -1); // Remove trailing comma
    updateQuery += ` WHERE user_id = $${index}`;
    values.push(user_id);

    await client.query(updateQuery, values);
    await client.query('COMMIT');

    res.status(200).send('User profile updated successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error updating profile:', error);
    res.status(500).send('Error updating profile');
  } finally {
    client.release();
  }
});

module.exports = router;
