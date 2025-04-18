require('dotenv').config();
console.log("DB connection string:", process.env.DB_CONNECTION_STRING); // <-- Debug line

const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const pool = new Pool({
  connectionString: process.env.DB_CONNECTION_STRING
});

// Create users table with UUID and encrypted password
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
      profile_picture VARCHAR(255),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;

  try {
    await pool.query(query);
    console.log('Users table created successfully');
  } catch (err) {
    console.error('Error creating table:', err);
  }
};

// Generate JWT token
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

// Verify password
const verifyPassword = async (password, hash) => {
  return await bcrypt.compare(password, hash);
};

// Initialize the database
const initializeDb = async () => {
  await createUsersTable();
};

module.exports = {
  pool,
  generateToken,
  hashPassword,
  verifyPassword,
  initializeDb
};

initializeDb();
