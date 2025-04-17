const { pool, generateToken } = require('../../db-create');
const bcrypt = require('bcrypt');
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

    const { identifier, password } = req.body;

    try {
      const result = await pool.query(
        `SELECT user_id, username, email, first_name, last_name, password_hash 
         FROM users 
         WHERE email = $1 OR username = $1`,
        [identifier]
      );

      if (result.rows.length === 0) {
        return res.status(401).json({ 
          message: 'Email or username not found',
          errorType: 'user_not_found' 
        });
      }

      const user = result.rows[0];
      const isPasswordValid = await bcrypt.compare(password, user.password_hash);

      if (!isPasswordValid) {
        return res.status(401).json({ 
          message: 'Password is incorrect',
          errorType: 'wrong_password'
        });
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
      res.status(500).json({ 
        message: 'Login failed. Please try again later.',
        errorType: 'server_error'
      });
    }
  });
};
