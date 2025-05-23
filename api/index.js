require('dotenv').config();
const express = require('express');
const { pool, generateToken, hashPassword } = require('../db-create');
const multer = require('multer');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { uploadToImageKit } = require('./imagekitUpload'); // ✅ Updated import

// Initialize Express app
const app = express();

// CORS configuration
app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://192.168.18.15:3000', // ✅ Add this line
    'http://192.168.213.115:3000', // ✅ Add this line

    'https://echho.vercel.app'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

// Increase the limit for JSON payloads
app.use(express.json({ limit: '50mb' }));  // Increased JSON payload size to 50MB
app.use(express.urlencoded({ limit: '50mb', extended: true }));  // Increased URL-encoded payload size to 50MB

// Multer file upload configuration for handling large files
const storage = multer.memoryStorage(); // Store files in memory
const upload = multer({ 
  storage, 
  limits: { fileSize: 50 * 1024 * 1024 }  // Allow up to 50MB files
}); 

// Add this near the end of your file, before the export
app.get('/', (req, res) => {
  res.status(200).json({
    message: 'Welcome to the API',
    endpoints: {
      auth: {
        signup: 'POST /signup',
        login: 'POST /login',
        profile: 'GET /profile',
        checkCredentials: 'POST /check-credentials',
        checkEmail: 'POST /api/check-email',
        checkUsername: 'POST /api/check-username'
      },
      user: {
        update: 'PUT /users/update',
        addContact: 'POST /add-contact',
        uploadProfilePicture: 'POST /upload-profile-picture',
        getUserInfo: 'GET /userinfo'
      },
      status: {
        upload: 'POST /api/status',
        getCurrent: 'POST /api/getCurrentStatus',
        getAllStatuses: 'POST /api/getAllStatuses',           // ✅ Added
        getMediaByUrl: 'POST /api/getMediaByUrl',             // ✅ Added
        getContactsStatuses: 'POST /api/get-contacts-statuses'// ✅ Added
      },
    },
  });
});


// Middleware for parsing JSON bodies
app.use(express.json());



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
  const { fullName, email, username, password, gender } = req.body;

  let profilePictureUrl = null;

  if (req.file) {
    try {
      const uploadResult = await uploadToImageKit(req.file.buffer, `${username}-profile.jpg`);

      profilePictureUrl = uploadResult.url;
    } catch (uploadErr) {
      return res.status(500).json({ message: 'Profile picture upload failed' });
    }
  }

  const aboutMessage = "Ready to Echoo";

  try {
    const passwordHash = await hashPassword(password);

    const user = await withDB(async (client) => {
      const result = await client.query(
        `INSERT INTO users (
          full_name, email, username, password_hash, gender, profile_picture, about_message
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7
        ) RETURNING user_id, username, email, full_name, gender, profile_picture, about_message`,
        [
          fullName,
          email,
          username,
          passwordHash,
          gender,
          profilePictureUrl,
          aboutMessage
        ]
      );
      return result.rows[0];
    });

    const token = generateToken({
      user_id: user.user_id,
      username: user.username
    });

    res.status(201).json({
      message: 'Signup successful',
      user: { ...user, profile_picture: profilePictureUrl },
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
        `SELECT user_id, username, email, full_name,  password_hash 
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

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const result = await pool.query(
      `SELECT user_id, username, email, full_name, gender, profile_picture
       FROM users 
       WHERE user_id = $1`,
      [decoded.user_id]
    );

    if (result.rows.length === 0) {
      console.warn('[PROFILE] No user found for user_id:', decoded.user_id);
      return res.status(404).json({ message: 'User not found' });
    }

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


// Start Server
module.exports = app;