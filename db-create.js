require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const pool = new Pool({
  connectionString: process.env.DB_CONNECTION_STRING,
  ssl: {
    rejectUnauthorized: false,
  },
});

console.log('Initializing database connection...');

const createTables = async () => {
  const query = `
    -- Drop only chat_previews to avoid affecting user data
    DROP TABLE IF EXISTS chat_previews;

    CREATE TABLE IF NOT EXISTS users (
      user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      full_name VARCHAR(255) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      about_message TEXT,
      username VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      gender VARCHAR(10),
      profile_picture TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS contacts (
      contact_id UUID NOT NULL,
      user_id UUID NOT NULL,
      sender_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      receiver_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      contact_name VARCHAR(255) NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (contact_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS messages (
      message_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      temp_id UUID,
      contact_id UUID NOT NULL,
      sender_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
      receiver_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
      message_text TEXT NOT NULL,
      timestamp TIMESTAMPTZ DEFAULT NOW(),
      read_checker VARCHAR(10) DEFAULT 'unread'
    );

    -- Drop and recreate chat_previews to ensure contact_id is PRIMARY KEY
    CREATE TABLE chat_previews (
      contact_id UUID PRIMARY KEY,
      profile_picture TEXT,
      contact_name VARCHAR(255) NOT NULL,
      last_text TEXT,
      text_timestamp TIMESTAMPTZ,
      sender_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
      receiver_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
      user_id UUID REFERENCES users(user_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS status (
  status_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  media_url TEXT NOT NULL,
  caption TEXT,
  not_allow_id UUID[] DEFAULT '{}',
  read_id UUID[] DEFAULT '{}',
  timestamp TIMESTAMPTZ DEFAULT NOW()
);


    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
    CREATE INDEX IF NOT EXISTS idx_contacts_user ON contacts(user_id);
    CREATE INDEX IF NOT EXISTS idx_contacts_receiver ON contacts(receiver_id);
    CREATE INDEX IF NOT EXISTS idx_messages_contact_id ON messages(contact_id);
    CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON messages(sender_id);
    CREATE INDEX IF NOT EXISTS idx_messages_receiver_id ON messages(receiver_id);
    CREATE INDEX IF NOT EXISTS idx_chat_previews_user ON chat_previews(user_id);
  `;

  try {
    const client = await pool.connect();
    await client.query(query);
    client.release();
    console.log('✅ Database tables created/verified');
  } catch (err) {
    console.error('❌ Table creation failed:', err);
    throw err;
  }
};



const testConnection = async () => {
  let client;
  try {
    client = await pool.connect();
    await client.query('SELECT 1');
    console.log('✅ Database connection verified');
    return true;
  } catch (err) {
    console.error('❌ Database connection failed:', err);
    return false;
  } finally {
    if (client) client.release();
  }
};

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

// Auto-initialize in non-production environments
if (process.env.NODE_ENV !== 'production') {
  initializeDb().catch((err) => {
    console.error('❌ Startup failed:', err);
    process.exit(1);
  });
}

module.exports = {
  pool,
  generateToken: (user) => jwt.sign(
    {
      user_id: user.user_id,
      username: user.username,
      iat: Math.floor(Date.now() / 1000),
    },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  ),
  hashPassword: (password) => bcrypt.hash(password, 12),
  initializeDb,
  testConnection,
};