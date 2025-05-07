require('dotenv').config();
const express = require('express');
const http = require('http');

const app = require('./api/index');  // Your express app
const { initializeDb } = require('./db-create');
const { setupWebSocket } = require('./ws');  // Import WebSocket setup

// API routes
const userInfoRoutes = require('./api/userInfo');
const addContactRoutes = require('./api/addContact');
const { uploadToImageKit } = require('./api/imagekitUpload');
const updateProfilePicture = require('./api/profileUpdate');
const userUpdate = require('./api/userUpdate');
const getContactInfo = require('./api/getContactInfo');

// Import the necessary functions
const { handleSocketMessage } = require('./api/handleSocketMessage');  // Import handleSocketMessage

const PORT = process.env.PORT || 5000;
const server = http.createServer(app); // Create HTTP server from Express

// 🌐 Setup WebSocket server (attaching to the existing HTTP server)
setupWebSocket(server); // Initialize WebSocket logic and attach it to the server

// Mount API routes
app.use('/api', userInfoRoutes);
app.use('/api', addContactRoutes);
app.use('/api', updateProfilePicture);
app.use('/api', userUpdate);
app.use('/api', getContactInfo);

// Start the server
const startServer = async () => {
  try {
    console.log('🔧 Initializing database...');
    await initializeDb();

    server.listen(PORT, () => {
      console.log(`🚀 Server running at http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('❌ Failed to start server:', err);
    process.exit(1);
  }
};

startServer();
