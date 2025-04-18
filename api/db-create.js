require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// Enhanced pool configuration for Neon PostgreSQL
const pool = new Pool({
  connectionString: process.env.DB_CONNECTION_STRING,
  ssl: {
    rejectUnauthorized: false // Required for Neon.tech
  },
  max: 5, // Recommended for serverless
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000
});

console.log('Database pool created with Neon.tech connection');

// Create users table with Neon-compatible SQL
const createUsersTable = async () => {
  const query = `
    CREATE TABLE IF NOT EXISTS users (
      user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      first_name VARCHAR(255) NOT NULL,
      last_name VARCHAR(255) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      username VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      gender VARCHAR(10),
      profile_picture TEXT, -- Using TEXT for base64 storage
      created_at TIMESTAMPTZ DEFAULT NOW(), -- Using TIMESTAMPTZ for Neon
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
  `;

  try {
    await pool.query(query);
    console.log('Users table verified/created in Neon PostgreSQL');
  } catch (err) {
    console.error('Error creating table:', err);
    throw err;
  }
};

// Generate JWT token (Neon-compatible)
const generateToken = (user) => {
  return jwt.sign(
    {
      user_id: user.user_id,
      username: user.username
    },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  );
};

// Hash password
const hashPassword = async (password) => {
  const saltRounds = 10;
  return await bcrypt.hash(password, saltRounds);
};

// Initialize the database
const initializeDb = async () => {
  try {
    await createUsersTable();
  } catch (err) {
    console.error('Database initialization failed:', err);
    process.exit(1);
  }
};

// Serverless connection helper
const withDB = async (handler) => {
  let client;
  try {
    client = await pool.connect();
    return await handler(client);
  } catch (err) {
    console.error('Database operation failed:', err);
    throw err;
  } finally {
    if (client) client.release();
  }
};

module.exports = {
  pool,
  generateToken,
  hashPassword,
  initializeDb,
  withDB
};

// Initialize if not in production (for dev/testing)
if (process.env.NODE_ENV !== 'production') {
  initializeDb();
}