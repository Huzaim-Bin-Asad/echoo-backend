require('dotenv').config();

const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// Enhanced connection configuration for serverless
const pool = new Pool({
  connectionString: process.env.DB_CONNECTION_STRING,
  // Serverless-optimized pool settings
  max: 5,                 // Maximum number of clients in the pool
  min: 1,                 // Minimum number of clients in the pool
  idleTimeoutMillis: 30000, // How long a client is allowed to remain idle
  connectionTimeoutMillis: 2000, // Time to wait for connection
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Debug connection
console.log("DB connection configured with:", {
  host: pool.options.host,
  database: pool.options.database,
  user: pool.options.user,
  poolSize: `${pool.options.max} connections`
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
      profile_picture TEXT,  -- Changed to TEXT to store base64 encoded images
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
  `;

  let client;
  try {
    client = await pool.connect();
    await client.query(query);
    console.log('✔ Users table and indexes created/verified');
  } catch (err) {
    console.error('❌ Error creating table:', err.message);
    throw err; // Rethrow to handle in initialization
  } finally {
    if (client) client.release();
  }
};

// Enhanced token generation with refresh token support
const generateToken = (user) => {
  const accessToken = jwt.sign(
    {
      user_id: user.user_id,
      username: user.username
    },
    process.env.JWT_SECRET,
    { expiresIn: '15m' }  // Shorter expiry for security
  );

  const refreshToken = jwt.sign(
    { user_id: user.user_id },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: '7d' }
  );

  return { accessToken, refreshToken };
};

// More secure password hashing
const hashPassword = async (password) => {
  try {
    const saltRounds = 12; // Increased for better security
    return await bcrypt.hash(password, saltRounds);
  } catch (err) {
    console.error('Password hashing error:', err);
    throw new Error('Could not hash password');
  }
};

// Secure password verification
const verifyPassword = async (password, hash) => {
  try {
    return await bcrypt.compare(password, hash);
  } catch (err) {
    console.error('Password verification error:', err);
    throw new Error('Could not verify password');
  }
};

// Initialize the database with retry logic
const initializeDb = async (retries = 3, delay = 1000) => {
  for (let i = 0; i < retries; i++) {
    try {
      await createUsersTable();
      console.log('Database initialized successfully');
      return;
    } catch (err) {
      if (i === retries - 1) {
        console.error(`Failed to initialize database after ${retries} attempts`);
        throw err;
      }
      console.log(`Retrying database initialization (${i + 1}/${retries})...`);
      await new Promise(res => setTimeout(res, delay));
    }
  }
};

// Serverless connection handling
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
  verifyPassword,
  initializeDb,
  withDB  // Added for serverless operations
};

// Initialize only if not in serverless environment
if (process.env.VERCEL !== '1') {
  initializeDb().catch(err => {
    console.error('Database initialization failed:', err);
    process.exit(1);
  });
}