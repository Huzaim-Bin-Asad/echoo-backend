const { pool } = require('../db-create');
const jwt = require('jsonwebtoken');
const cors = require('cors');

const corsMiddleware = cors({
  origin: [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'https://your-vercel-app.vercel.app'
  ],
  methods: ['GET'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
});

module.exports = async (req, res) => {
  corsMiddleware(req, res, async () => {
    if (req.method !== 'GET') {
      return res.status(405).json({ message: 'Method not allowed' });
    }

    const authHeader = req.headers.authorization;

    try {
      if (!authHeader) {
        return res.status(401).json({ message: 'Authentication required' });
      }

      const token = authHeader.split(' ')[1];
      if (!token) {
        return res.status(401).json({ message: 'Authentication token missing' });
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      const result = await pool.query(
        `SELECT user_id, username, email, first_name, last_name, gender, profile_picture
         FROM users 
         WHERE user_id = $1`,
        [decoded.user_id]
      );

      if (result.rows.length === 0) {
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
};