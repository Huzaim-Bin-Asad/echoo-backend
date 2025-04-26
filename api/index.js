require('dotenv').config();
const express = require('express');
const { pool, generateToken, hashPassword } = require('../db-create');
const multer = require('multer');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const userInfoRoutes = require('./userInfo');
const addContactRoutes = require('./addContact');

// Initialize Express app
const app = express();

// CORS configuration
app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'https://echho.vercel.app'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));


// Add this near the end of your file, before the export
app.get('/', (req, res) => {
  res.status(200).json({
    message: 'Welcome to the API',
    endpoints: {
      auth: {
        signup: 'POST /signup',
        login: 'POST /login',
        profile: 'GET /profile',
        checkCredentials: 'POST /check-credentials'  // Added this line
      },
      status: 'GET /status',
    },
  });
});

// Add a status endpoint
app.get('/status', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Middleware for parsing JSON bodies
app.use(express.json());

// Serverless-compatible multer configuration (memory storage)
const storage = multer.memoryStorage(); // Store files in memory
const upload = multer({ storage });

// Database connection wrapper for serverless
const withDB = async (handler) => {
  let client;
  try {
    client = await pool.connect();
    return await handler(client);
  } catch (error) {
    console.error('Database error:', error);
    throw error;
  } finally {
    if (client) client.release();
  }
};

app.post('/check-credentials', async (req, res) => {
  const { email, username, buttonId } = req.body;

  if (buttonId !== 'case2') {
    return res.status(403).json({ message: 'Unauthorized request source.' });
  }

  const errors = {};

  try {
    await withDB(async (client) => {
      const emailCheck = await client.query('SELECT user_id FROM users WHERE email = $1', [email]);
      if (emailCheck.rows.length > 0) errors.email = 'Email already exists.';

      const usernameCheck = await client.query('SELECT user_id FROM users WHERE username = $1', [username]);
      if (usernameCheck.rows.length > 0) errors.username = 'Username already exists.';
    });

    if (Object.keys(errors).length > 0) {
      return res.status(400).json({ errors });
    }

    res.status(200).json({ message: 'Credentials available' });
  } catch (err) {
    console.error('Error checking credentials:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

app.post('/signup', upload.single('profilePicture'), async (req, res) => {
  const { firstName, lastName, email, username, password, gender } = req.body;

  // Handle file upload - convert buffer to base64 for serverless
  const profilePicture = req.file 
    ? `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`
    : null;

  const aboutMessage = "Ready to Echoo"; // 🆕 Default about message

  try {
    const passwordHash = await hashPassword(password);
    
    const user = await withDB(async (client) => {
      const result = await client.query(
        `INSERT INTO users (first_name, last_name, email, username, password_hash, gender, profile_picture, about_message) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
         RETURNING user_id, username, email, first_name, last_name, gender, profile_picture, about_message`,
        [firstName, lastName, email, username, passwordHash, gender, profilePicture, aboutMessage]
      );
      return result.rows[0];
    });

    const token = generateToken({
      user_id: user.user_id,
      username: user.username
    });

    res.status(201).json({
      message: 'Signup successful',
      user,
      token
    });
  } catch (err) {
    console.error('Signup error:', err);
    
    if (err.code === '23505') {
      const field = err.constraint.includes('email') ? 'email' : 'username';
      return res.status(400).json({ message: `${field} already exists` });
    }
    
    res.status(500).json({ message: 'Signup failed' });
  }
});


// Login Route with detailed logging
app.post('/login', async (req, res) => {
  const { identifier, password } = req.body;
  
  try {
    const user = await withDB(async (client) => {
      const result = await client.query(
        `SELECT user_id, username, email, first_name, last_name, password_hash 
         FROM users 
         WHERE email = $1 OR username = $1`,
        [identifier]
      );
      return result.rows[0];
    });

    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = generateToken({
      user_id: user.user_id,
      username: user.username
    });

    delete user.password_hash;
    res.json({ user, token });

  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});
// Protected Profile Route with enhanced JWT logging
app.get('/profile', async (req, res) => {
  const authHeader = req.headers.authorization;
  console.log('[PROFILE] Authorization header:', authHeader);

  try {
    if (!authHeader) {
      console.warn('[PROFILE] No Authorization header present');
      return res.status(401).json({ message: 'Authentication required' });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      console.warn('[PROFILE] Bearer token missing from header');
      return res.status(401).json({ message: 'Authentication token missing' });
    }

    console.log('[PROFILE] Verifying token...');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log('[PROFILE] Token successfully decoded:', decoded);

    const result = await pool.query(
      `SELECT user_id, username, email, first_name, last_name, gender, profile_picture
       FROM users 
       WHERE user_id = $1`,
      [decoded.user_id]
    );

    if (result.rows.length === 0) {
      console.warn('[PROFILE] No user found for user_id:', decoded.user_id);
      return res.status(404).json({ message: 'User not found' });
    }

    console.log('[PROFILE] User fetched successfully for:', decoded.username || decoded.user_id);
    res.status(200).json(result.rows[0]);
  } catch (err) {
    console.error('[PROFILE] Error verifying or decoding JWT:', err);

    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: 'Invalid token' });
    }

    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token expired' });
    }

    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

app.use('/api', userInfoRoutes); // <--- Make sure this is added
app.use('/api', addContactRoutes);


// Start Server
module.exports = app;
