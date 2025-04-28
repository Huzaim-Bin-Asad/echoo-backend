const express = require('express');
const { pool } = require('../db-create'); // Import pool from your db-create file
const router = express.Router();

// Update user profile route
router.put('/users/update', async (req, res) => {
  const { user_id, first_name, last_name, email, about_message, username } = req.body;

  if (!user_id) {
    return res.status(400).send('Missing user_id in request body');
  }

  // Start a database transaction
  const client = await pool.connect();
  try {
    await client.query('BEGIN'); // Start the transaction

    // Build the SQL query to update the user profile
    let updateQuery = 'UPDATE users SET';
    const values = [];
    let index = 1;

    if (first_name) {
      updateQuery += ` first_name = $${index++},`;
      values.push(first_name);
    }
    if (last_name) {
      updateQuery += ` last_name = $${index++},`;
      values.push(last_name);
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

    // Remove trailing comma
    updateQuery = updateQuery.slice(0, -1);

    // Add the WHERE clause to target the specific user
    updateQuery += ` WHERE user_id = $${index}`;
    values.push(user_id); // Add the user_id as the last parameter

    // Execute the query
    await client.query(updateQuery, values);

    // Commit the transaction
    await client.query('COMMIT');

    res.status(200).send('User profile updated successfully');
  } catch (error) {
    // If there's an error, rollback the transaction
    await client.query('ROLLBACK');
    console.error('Error updating profile:', error);
    res.status(500).send('Error updating profile');
  } finally {
    client.release(); // Release the client back to the pool
  }
});

module.exports = router; // ✅ Fixed typo: module.exports
