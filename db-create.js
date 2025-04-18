require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// Direct Neon.tech connection configuration
const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_BbaR3OQnS6MW@ep-mute-morning-a511sula-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require',
  ssl: {
    rejectUnauthorized: false
  },
  max: 5, // Optimal pool size for serverless
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000
});

console.log('Initializing Neon.tech database connection...');

// Enhanced connection test with Neon-specific checks
const testConnection = async () => {
  let client;
  try {
    client = await pool.connect();
    const res = await client.query('SELECT 1 AS connection_test');
    console.log('✅ Neon.tech connection verified');
    return true;
  } catch (err) {
    console.error('❌ Neon.tech connection failed:', {
      error: err.message,
      code: err.code,
      time: new Date().toISOString()
    });
    return false;
  } finally {
    if (client) client.release();
  }
};

// Neon-optimized table creation
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
      profile_picture TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
  `;

  try {
    const client = await pool.connect();
    await client.query(query);
    client.release();
    console.log('✅ Users table ready');
  } catch (err) {
    console.error('❌ Table creation failed:', err);
    throw err;
  }
};

// Initialize with production-ready checks
const initializeDb = async () => {
  if (!await testConnection()) {
    throw new Error('Database connection unavailable');
  }
  await createUsersTable();
};

// Serverless-compatible exports
module.exports = {
  pool,
  generateToken: (user) => jwt.sign(
    {
      user_id: user.user_id,
      username: user.username,
      iat: Math.floor(Date.now() / 1000)
    },
    process.env.JWT_SECRET || 'fallback-secret-for-dev',
    { expiresIn: '24h' }
  ),
  hashPassword: (password) => bcrypt.hash(password, 12), // Increased rounds for security
  initializeDb,
  testConnection
};

// Auto-initialize only in development
if (process.env.NODE_ENV !== 'production') {
  initializeDb().catch(err => {
    console.error('Startup failed:', err);
    process.exit(1);
  });
}