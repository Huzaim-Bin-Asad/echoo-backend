require('dotenv').config();
const { Pool } = require('pg');

// Setup PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DB_CONNECTION_STRING
});

// Function to create the 'users' table
const createUsersTable = async () => {
  const query = `
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      first_name VARCHAR(255) NOT NULL,
      last_name VARCHAR(255) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      username VARCHAR(255) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      gender VARCHAR(10),
      profile_picture VARCHAR(255),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;

  try {
    const client = await pool.connect();
    await client.query(query);
    console.log('Users table created successfully');
    client.release();
  } catch (err) {
    console.error('Error creating table:', err);
  }
};

// Call the function to create the table
createUsersTable().then(() => {
  pool.end();  // Close the connection pool after the operation
});
