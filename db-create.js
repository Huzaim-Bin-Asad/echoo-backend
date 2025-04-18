require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// Enhanced Neon.tech connection configuration
const pool = new Pool({
  connectionString: process.env.DB_CONNECTION_STRING,
  ssl: {
    rejectUnauthorized: false
  },
  max: 3, // Reduced for local development
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 5000, // Shorter timeout for faster failure
  query_timeout: 5000
});

console.log('Attempting to connect to Neon.tech database...');

// Add connection test function
const testConnection = async () => {
  try {
    const client = await pool.connect();
    const res = await client.query('SELECT NOW()');
    console.log('Database connection successful. Current time:', res.rows[0].now);
    client.release();
    return true;
  } catch (err) {
    console.error('Connection test failed:', err);
    return false;
  }
};

// Create users table with retry logic
const createUsersTable = async (retries = 3, delay = 2000) => {
  const query = `
    CREATE TABLE IF NOT EXISTS users (
      user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      first_name VARCHAR(255) NOT NULL,
      last_name VARCHAR(255) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      username VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      gender VARCHAR(10),
      profile_picture TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `;

  for (let i = 0; i < retries; i++) {
    try {
      const client = await pool.connect();
      await client.query(query);
      client.release();
      console.log('Users table created/verified');
      return;
    } catch (err) {
      console.error(`Attempt ${i + 1} failed:`, err.message);
      if (i === retries - 1) throw err;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
};

// Initialize with connection test
const initializeDb = async () => {
  try {
    if (!await testConnection()) {
      throw new Error('Could not establish database connection');
    }
    await createUsersTable();
    console.log('Database initialization complete');
  } catch (err) {
    console.error('Database initialization failed:', err.message);
    throw err;
  }
};

// Export functions
module.exports = {
  pool,
  generateToken: (user) => jwt.sign(
    { user_id: user.user_id, username: user.username },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  ),
  hashPassword: (password) => bcrypt.hash(password, 10),
  initializeDb,
  testConnection
};

// Only initialize if run directly
if (require.main === module) {
  initializeDb().catch(() => process.exit(1));
}