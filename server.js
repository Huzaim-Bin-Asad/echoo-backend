// server.js

require('dotenv').config(); // Load env vars
const app = require('./api/index'); // Import the Express app
const { initializeDb } = require('./db-create'); // Ensure DB setup on start
// const userInfoRoutes = require('./api/userInfo'); ❌ Not needed here

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    console.log('🔧 Initializing database...');
    await initializeDb(); // Ensure DB is ready before accepting traffic

    app.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('❌ Failed to start server:', err);
    process.exit(1);
  }
};

startServer();
