const { pool } = require('../../db-create');
const cors = require('cors');

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

    const { email, username, buttonId } = req.body;

    if (buttonId !== 'case2') {
      return res.status(403).json({ message: 'Unauthorized request source.' });
    }

    const errors = {};

    try {
      const emailCheck = await pool.query('SELECT user_id FROM users WHERE email = $1', [email]);
      if (emailCheck.rows.length > 0) {
        errors.email = 'Email already exists.';
      }

      const usernameCheck = await pool.query('SELECT user_id FROM users WHERE username = $1', [username]);
      if (usernameCheck.rows.length > 0) {
        errors.username = 'Username already exists.';
      }

      if (Object.keys(errors).length > 0) {
        return res.status(400).json({ errors });
      }

      res.status(200).json({ message: 'Email and Username are available.' });
    } catch (err) {
      console.error('[CHECK CREDENTIALS] Error:', err);
      res.status(500).json({ message: 'Server error while checking credentials.' });
    }
  });
};