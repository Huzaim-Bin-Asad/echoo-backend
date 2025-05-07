const WebSocket = require('ws');
const { handleConnection } = require('./api/handleSocketMessage');

const clients = new Map(); // user_id → WebSocket mapping

function setupWebSocket(server) {
  const wss = new WebSocket.Server({ server });

  wss.on('connection', (ws) => {
    console.log('🔌 New WebSocket connection established');
    
    // Handle the connection with the handler, passing the clients Map
    handleConnection(ws, clients);
  });

  console.log('🌐 WebSocket server is ready');
}

function broadcastToUser(user_id, data) {
  const ws = clients.get(user_id);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

module.exports = {
  setupWebSocket,
  broadcastToUser,
  clients, // Export the Map for direct access if needed
};