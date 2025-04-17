const { pool, hashPassword, generateToken } = require('../../db-create');
const multer = require('multer');
const cors = require('cors');
const upload = multer({ storage: multer.memoryStorage() });

const corsMiddleware = cors({
  origin: [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'https://your-vercel-app.vercel.app'
  ],
  methods: ['POST'],
  allowedHeaders: ['Content-Type'],
  credentials: true
});

module.exports = async (req, res) => {
  corsMiddleware(req, res, async () => {
    if (req.method !== 'POST') {
      return res.status(405).json({ message: 'Method not allowed' });
    }

    upload.single('profilePicture')(req, res, async (err) => {
      if (err) {
        return res.status(400).json({ message: 'File upload error' });
      }

      const { firstName, lastName, email, username, password, gender } = req.body;
      const profilePicture = req.file ? req.file.buffer.toString('base64') : null;

      try {
        const passwordHash = await hashPassword(password);
        
        const result = await pool.query(
          `INSERT INTO users (first_name, last_name, email, username, password_hash, gender, profile_picture) 
           VALUES ($1, $2, $3, $4, $5, $6, $7) 
           RETURNING user_id, username, email, first_name, last_name, gender, profile_picture`,
          [firstName, lastName, email, username, passwordHash, gender, profilePicture]
        );

        const user = result.rows[0];
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
  });
};