require('dotenv').config();
const express = require('express');
const { pool, generateToken, hashPassword } = require('./db-create');
const multer = require('multer');
const path = require('path');
const cors = require('cors');
const bcrypt = require('bcrypt'); // ✅ FIXED: bcrypt was missing
const jwt = require('jsonwebtoken'); // ✅ Required for profile route token decoding

// Initialize Express app
const app = express();

// CORS configuration
app.use(cors({
  origin: 'http://localhost:3000',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

// Middleware for parsing JSON bodies
app.use(express.json());

// Setup Multer for file uploads
const upload = multer({ dest: 'uploads/' });

// Signup Route with automatic login
app.post('/signup', upload.single('profilePicture'), async (req, res) => {
  const { firstName, lastName, email, username, password, gender } = req.body;
  const profilePicture = req.file ? req.file.filename : null;

  console.log('[SIGNUP] Received data:', { firstName, lastName, email, username, gender });

  try {
    const passwordHash = await hashPassword(password);
    console.log('[SIGNUP] Password hashed');

    const result = await pool.query(
      `INSERT INTO users (first_name, last_name, email, username, password_hash, gender, profile_picture) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) 
       RETURNING user_id, username, email, first_name, last_name, gender, profile_picture`,
      [firstName, lastName, email, username, passwordHash, gender, profilePicture]
    );

    const user = result.rows[0];
    console.log('[SIGNUP] User created:', user);

    const token = generateToken({
      user_id: user.user_id,
      username: user.username
    });

    res.status(201).json({
      message: 'Signup and login successful',
      user,
      token
    });
  } catch (err) {
    console.error('[SIGNUP] Database error:', err);

    if (err.code === '23505') {
      const field = err.constraint.includes('email') ? 'email' : 'username';
      return res.status(400).json({ 
        message: `${field} already exists`,
        field
      });
    }

    res.status(500).json({ message: 'Signup failed', error: err.message });
  }
});

// Login Route with detailed logging
app.post('/login', async (req, res) => {
  const { identifier, password } = req.body;
  console.log('[LOGIN] Attempting login for:', identifier);

  try {
    const result = await pool.query(
      `SELECT user_id, username, email, first_name, last_name, password_hash 
       FROM users 
       WHERE email = $1 OR username = $1`,
      [identifier]
    );

    if (result.rows.length === 0) {
      console.warn('[LOGIN] No user found with identifier:', identifier);
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const user = result.rows[0];
    console.log('[LOGIN] User found:', user.username);

    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    console.log('[LOGIN] Password valid:', isPasswordValid);

    if (!isPasswordValid) {
      console.warn('[LOGIN] Invalid password for user:', user.username);
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = generateToken({
      user_id: user.user_id,
      username: user.username
    });

    delete user.password_hash;

    res.status(200).json({
      message: 'Login successful',
      user,
      token
    });
  } catch (err) {
    console.error('[LOGIN] Login error:', err);
    res.status(500).json({ message: 'Login failed', error: err.message });
  }
});

// Protected Profile Route
app.get('/profile', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      console.warn('[PROFILE] No token provided');
      return res.status(401).json({ message: 'Authentication required' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log('[PROFILE] Token decoded:', decoded);

    const result = await pool.query(
      `SELECT user_id, username, email, first_name, last_name, gender, profile_picture
       FROM users 
       WHERE user_id = $1`,
      [decoded.user_id]
    );

    if (result.rows.length === 0) {
      console.warn('[PROFILE] User not found for ID:', decoded.user_id);
      return res.status(404).json({ message: 'User not found' });
    }

    res.status(200).json(result.rows[0]);
  } catch (err) {
    console.error('[PROFILE] Error:', err);

    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: 'Invalid token' });
    }

    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token expired' });
    }

    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Start Server
const port = process.env.PORT || 5000;
app.listen(port, () => {
  console.log(`✅ Server running on port ${port}`);
});
