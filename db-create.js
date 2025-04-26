require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// Direct Neon.tech connection configuration
  const pool = new Pool({
    connectionString: process.env.DB_CONNECTION_STRING,
    ssl: {
      rejectUnauthorized: false,
    },
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
const createTables = async () => {
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

    CREATE TABLE IF NOT EXISTS chat_previews (
      chat_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
      contact_name VARCHAR(255) NOT NULL,
      last_message TEXT,
      last_message_time TIMESTAMPTZ DEFAULT NOW(),
      unread_count INT DEFAULT 0,
      avatar_url TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_chat_previews_user ON chat_previews(user_id);
    CREATE INDEX IF NOT EXISTS idx_chat_previews_time ON chat_previews(last_message_time DESC);

    CREATE TABLE IF NOT EXISTS contacts (
      contact_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
      contacted_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
      contact_name VARCHAR(255) NOT NULL,
      contact_message TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    
    );
    CREATE INDEX IF NOT EXISTS idx_contacts_user ON contacts(user_id);
    CREATE INDEX IF NOT EXISTS idx_contacts_name ON contacts(contact_name);
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
  await createTables();
};

if (!process.env.JWT_SECRET) {
  console.error('❌ JWT_SECRET is not defined in .env');
  process.exit(1);
}

module.exports = {
  pool,
  generateToken: (user) =>
    jwt.sign(
      {
        user_id: user.user_id,
        username: user.username,
        iat: Math.floor(Date.now() / 1000),
      },
      process.env.JWT_SECRET, // ✅ no fallback!
      { expiresIn: '24h' }
    ),
  hashPassword: (password) => bcrypt.hash(password, 12), // 🔐 more secure
  initializeDb,
  testConnection,
};

// Optional dev DB auto-init
if (process.env.NODE_ENV !== 'production') {
  initializeDb().catch((err) => {
    console.error('❌ Startup failed:', err);
    process.exit(1);
  });
}