require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const multer = require('multer');
const path = require('path');

// Initialize Express app
const app = express();

// CORS
// Add this middleware before your routes
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', 'http://localhost:3000');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    next();
  });
  
// Middleware for parsing JSON bodies
app.use(express.json());

// Setup the connection pool for PostgreSQL
const pool = new Pool({
  connectionString: process.env.DB_CONNECTION_STRING
});

// Setup Multer for file handling
const upload = multer({ dest: 'uploads/' });

// Signup Route
app.post('/signup', upload.single('profilePicture'), async (req, res) => {
  const { firstName, lastName, email, username, password, gender } = req.body;
  const profilePicture = req.file ? req.file.filename : null; // Handle profile picture if exists
  
  try {
    // Insert user into the database
    const result = await pool.query(
      `INSERT INTO users (first_name, last_name, email, username, password, gender, profile_picture) 
      VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [firstName, lastName, email, username, password, gender, profilePicture]
    );
    
    // Send the response back with the inserted user id
    res.status(201).json({
      message: 'Signup successful',
      userId: result.rows[0].id
    });
  } catch (err) {
    console.error('Database error:', err);
    res.status(500).json({ message: 'Signup failed', error: err.message });
  }
});

// Start the server
const port = process.env.PORT || 5000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
