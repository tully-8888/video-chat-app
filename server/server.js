import express from "express";
import cors from "cors";
// import net from "net"; // Removed unused import
import fs from "fs/promises"; // Use promises for cleaner async
import path from "path";
import Debug from 'debug'; // Use default import convention for debug
// import os from 'os'; // Already removed
import WebSocket, { WebSocketServer } from 'ws'; // Import WebSocketServer as well
import { fileURLToPath } from 'url'; // Needed for __dirname equivalent in ES Modules

const debug = Debug('signaling:server'); // Initialize debug

// ES Module equivalent for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
// Use the PORT environment variable provided by the platform, with a fallback for local dev
const PORT = process.env.PORT || 3001;
// const portFilePath = path.join(__dirname, "server-port.json"); // Removed unused variable
let server = null; // Server instance
// serverPort variable is less critical now, mainly used in /ping
let serverPort = PORT;

// Ignore port file in nodemon (only needs to run once)
// Note: fs.writeFile returns a promise, await it or handle it
fs.writeFile(path.join(__dirname, ".nodemonignore"), "server-port.json\n")
  .catch(err => debug("Error writing .nodemonignore: %o", err));

// Middleware
app.use(cors({ origin: "*", methods: ["GET", "POST", "OPTIONS"], credentials: true }));
app.use(express.json());

app.use((req, res, next) => {
  debug(`[${new Date().toISOString()}] ${req.method} ${req.url} from ${req.ip}`);
  next();
});

// Status endpoint for server discovery
app.get("/status", (req, res) => {
  // Get the actual port the server is listening on
  const actualPort = server && server.address() ? server.address().port : serverPort;
  res.json({ status: "online", port: actualPort });
});

// --- WebSocket Signaling State ---
const clients = new Map(); // userId -> { ws: WebSocket, roomId: string }
const rooms = new Map();   // roomId -> Set<string> (userIds)
const wsToUserId = new Map(); // WebSocket -> userId

// Helper to send message to a specific client
const sendTo = (ws, message) => {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  } else {
    debug(`[${new Date().toISOString()}] ⚠️ Attempted to send to closed socket for user ${wsToUserId.get(ws)}`);
  }
};

// Helper to broadcast to all clients in a room *except* the sender
const broadcast = (roomId, senderWs, message) => {
  const room = rooms.get(roomId);
  if (!room) return;

  const senderId = wsToUserId.get(senderWs);
  debug(`[${new Date().toISOString()}] 📢 Broadcasting in room ${roomId} (from ${senderId || 'unknown'}): ${JSON.stringify(message).substring(0,100)}...`);

  room.forEach(userId => {
    const client = clients.get(userId);
    // Don't send message back to the sender
    if (client && client.ws !== senderWs && client.ws.readyState === WebSocket.OPEN) {
      sendTo(client.ws, message);
    }
  });
};

// Cleanup function for disconnecting clients
const handleDisconnect = (ws) => {
  const userId = wsToUserId.get(ws);
  if (!userId) {
    debug(`[${new Date().toISOString()}] 🔌 WebSocket closed, but no associated userId found.`);
    return; // User might have disconnected before joining a room
  }

  const client = clients.get(userId);
  if (!client) return; // Should not happen if wsToUserId is consistent

  const { roomId } = client;
  debug(`[${new Date().toISOString()}] 👋 User ${userId} disconnected from room ${roomId}`);

  // Remove user
  wsToUserId.delete(ws);
  clients.delete(userId);
  const room = rooms.get(roomId);
  if (room) {
    room.delete(userId);
    if (room.size === 0) {
      debug(`[${new Date().toISOString()}] 🧹 Room ${roomId} deleted (empty)`);
      rooms.delete(roomId);
    } else {
      // Notify remaining users
      debug(`[${new Date().toISOString()}] ℹ️ Room ${roomId} has ${room.size} remaining users: ${[...room].join(', ')}`);
      broadcast(roomId, ws, { type: 'user_left', payload: { userId } });
    }
  }
};
// --- End WebSocket Signaling State ---

// Start server
(async () => {
  try {
    // Directly use the PORT determined above
    serverPort = PORT;
    server = app.listen(serverPort, "0.0.0.0", () => {
      // Simplified startup logging for deployment
      console.log(`\n========== VIDEO CHAT SERVER ==========`);
      console.log(`🚀 Server listening on port ${serverPort}`);
      console.log(`=====================================\n`);
    });

    // Handle potential errors during server listen
    server.on('error', (error) => {
      debug(`[${new Date().toISOString()}] ❌ Server listen error: ${error.message}`);
      console.error(`Failed to start server on port ${serverPort}: ${error.message}`);
      process.exit(1);
    });

  } catch (error) {
    // Catch errors from potential async operations before listen (though less likely now)
    debug(`[${new Date().toISOString()}] ❌ Server start failed: ${error.message}`);
    console.error(`Server failed to start: ${error.message}`);
    process.exit(1);
  }
})();

// Add PING endpoint to verify connection
app.get("/ping", (req, res) => {
  res.send({
    timestamp: Date.now(),
    clientIp: req.ip,
    serverPort: serverPort
  });
});

// Add WebSocket support to your server
const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
  const clientIp = req.socket.remoteAddress;
  debug(`[${new Date().toISOString()}] 🔌 WebSocket connection established from ${clientIp}`);
  // wsToUserId.set(ws, null); // Tentatively track the socket

  ws.on('message', (message) => {
    let data;
    try {
      // Use Buffer.from(message).toString('utf8') for robustness with binary data
      const messageString = Buffer.isBuffer(message) ? message.toString('utf8') : message;
      data = JSON.parse(messageString);
      debug(`[${new Date().toISOString()}] 📩 WebSocket message from ${wsToUserId.get(ws) || clientIp}: ${messageString}`);
    } catch (parseError) { // Renamed 'e' to 'parseError'
      // Use parseError.message
      debug(`[${new Date().toISOString()}] ❌ WebSocket message error (invalid JSON) from ${clientIp}: ${parseError.message}`);
      return; // Ignore non-JSON messages
    }

    try {
      switch (data.type) {
        case 'join': {
          const { userId, roomId } = data.payload || {};
          if (!userId || !roomId) {
            debug(`[${new Date().toISOString()}] ❌ Join rejected: Missing userId or roomId from ${clientIp}`);
            sendTo(ws, { type: 'error', payload: { message: 'Missing userId or roomId in join message' } });
            return;
          }

          // Check if user ID is already taken in another connection (optional, depends on requirements)
          if(clients.has(userId)){
             debug(`[${new Date().toISOString()}] ❌ Join rejected: User ID ${userId} already connected.`);
             sendTo(ws, { type: 'error', payload: { message: `User ID ${userId} is already in use.` } });
             ws.close(); // Close the new connection trying to use the existing ID
             return;
          }

          // Clean up any previous association if the socket was somehow reused without closing
          handleDisconnect(ws);

          // Associate ws with userId
          wsToUserId.set(ws, userId);
          clients.set(userId, { ws, roomId });

          // Add to room
          if (!rooms.has(roomId)) {
            rooms.set(roomId, new Set());
          }
          const room = rooms.get(roomId);
          room.add(userId);
          debug(`[${new Date().toISOString()}] 👋 User ${userId} joined room ${roomId}, active users: ${[...room].join(', ')}`);


          // Notify newcomer about existing users (send IDs only)
          const existingUserIds = [...room].filter(id => id !== userId);
          sendTo(ws, { type: 'existing_room', payload: { userIds: existingUserIds } });
           debug(`[${new Date().toISOString()}] ➡️ Sent existing room info to ${userId}: ${existingUserIds.join(', ')}`);


          // Notify existing users about the newcomer
          broadcast(roomId, ws, { type: 'user_joined', payload: { userId } });
          break;
        }

        case 'signal': {
          const { receiverId, signalData } = data.payload || {};
          const senderId = wsToUserId.get(ws);

          if (!senderId) {
            debug(`[${new Date().toISOString()}] ❌ Signal rejected: Sender ID not found for connection from ${clientIp}`);
            sendTo(ws, { type: 'error', payload: { message: 'Cannot send signal before joining a room' } });
            return;
          }
          if (!receiverId || !signalData) {
            debug(`[${new Date().toISOString()}] ❌ Signal rejected: Missing receiverId or signalData from ${senderId}`);
            sendTo(ws, { type: 'error', payload: { message: 'Missing receiverId or signalData in signal message' } });
            return;
          }

          const receiverClient = clients.get(receiverId);
          if (receiverClient && receiverClient.ws.readyState === WebSocket.OPEN) {
            debug(`[${new Date().toISOString()}] 📨 Relaying signal: ${senderId} → ${receiverId}`);
            sendTo(receiverClient.ws, {
              type: 'signal',
              payload: { senderId, signalData }
            });
          } else {
            debug(`[${new Date().toISOString()}] ⚠️ Signal failed: Receiver ${receiverId} not found or connection closed.`);
            // Optionally notify sender that the receiver is unavailable
            // sendTo(ws, { type: 'error', payload: { message: `User ${receiverId} is not available.` } });
          }
          break;
        }

        default:
          debug(`[${new Date().toISOString()}] ❓ Unknown message type: ${data.type} from ${wsToUserId.get(ws) || clientIp}`);
          sendTo(ws, { type: 'error', payload: { message: `Unknown message type: ${data.type}` } });
      }
    } catch (error) {
       debug(`[${new Date().toISOString()}] 💥 Error processing WebSocket message type ${data.type} from ${wsToUserId.get(ws) || clientIp}: ${error.message}`);
       sendTo(ws, { type: 'error', payload: { message: `Server error processing message: ${error.message}` } });
    }
  });

  ws.on('error', (error) => {
     debug(`[${new Date().toISOString()}] 💥 WebSocket error for ${wsToUserId.get(ws) || clientIp}: ${error.message}`);
     handleDisconnect(ws); // Clean up on error as well
  });

  ws.on('close', (code, reason) => {
    debug(`[${new Date().toISOString()}] 🔌 WebSocket connection closed for ${wsToUserId.get(ws) || clientIp}. Code: ${code}, Reason: ${reason || 'N/A'}`);
    handleDisconnect(ws);
  });

  // Send initial welcome/confirmation (optional)
  // sendTo(ws, { type: 'welcome', payload: { serverTime: Date.now() } });
});