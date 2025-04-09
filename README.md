# P2P Video Chat App

A decentralized, peer-to-peer video chat application built with WebRTC, Next.js, and TypeScript. This application allows users to make video calls directly to each other without going through a central server (except for the initial signaling process).

## Features

- 🎥 Real-time video and audio communication
- 🔒 End-to-end encryption via WebRTC
- 🌐 P2P architecture for direct communication
- 🔗 Shareable room links
- 🎛️ Basic controls (mute, camera toggle)
- 📱 Responsive design works across devices
- 🚪 Easy room creation and joining

## How It Works

1. **Signaling**: When a user creates a room, they generate a unique room ID and wait for another user to join. The signaling server helps peers discover each other.

2. **WebRTC Connection**: Once signaling is complete, the peers establish a direct WebRTC connection with each other.

3. **Media Streaming**: Video and audio are streamed directly between peers without going through a server.

## Technology Stack

- **Frontend**: Next.js, React, TailwindCSS
- **WebRTC**: simple-peer library
- **Signaling Server**: Express.js with Server-Sent Events (SSE)
- **Unique IDs**: UUID

## Project Structure

```
/
├── src/
│   ├── app/               # Next.js app directory
│   │   ├── components/    # React components
│   │   ├── hooks/         # Custom React hooks
│   │   │   ├── useSignaling.ts   # Signaling logic
│   │   │   └── useWebRTC.ts      # WebRTC connection logic
│   │   ├── page.tsx       # Main page component
│   │   └── ...
└── server/                # Signaling server
    ├── server.js          # Express.js server
    └── package.json
```

## Getting Started

### Prerequisites

- Node.js 16.x or higher
- npm or yarn

### Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd video-chat-app
   ```

2. Install dependencies:
   ```bash
   npm install
   cd server && npm install && cd ..
   ```

3. Start both the Next.js app and signaling server simultaneously:
   ```bash
   npm run dev:all
   ```

4. The app will be available at http://localhost:3000

### Using on a Local Network

To test the app between devices on your local network:

1. Find your computer's local IP address:
   - On macOS/Linux: `ifconfig` or `ip addr`
   - On Windows: `ipconfig`

2. Start the app with:
   ```bash
   npm run dev:all
   ```

3. Access the app from another device using your computer's IP address:
   ```
   http://<your-local-ip>:3000
   ```

4. The app is now configured to automatically connect to the signaling server on the same IP address (port 3001).

#### Troubleshooting Network Issues

If you encounter connection problems when using the app on your local network:

1. **Firewall Settings**: Ensure ports 3000 and 3001 are allowed through your firewall.

2. **HTTPS Requirement**: Some browsers require secure contexts (HTTPS) for WebRTC. The app includes a check for this and will show appropriate error messages.

3. **Camera/Microphone Permissions**: Ensure you grant permission to access camera and microphone when prompted.

4. **Network Connectivity**: Both devices must be on the same network for local testing.

#### Handling Port Conflicts

If you see "address already in use" errors when starting the server:

1. **Find and Kill the Process**:
   - On macOS/Linux:
     ```bash
     # Find processes using port 3001
     lsof -i :3001
     # Kill the process
     kill -9 <PID>
     ```
   - On Windows:
     ```bash
     # Find processes using port 3001
     netstat -ano | findstr :3001
     # Kill the process
     taskkill /PID <PID> /F
     ```

2. **The server now automatically finds an available port** if 3001 is in use, and the client will dynamically connect to the correct port.

3. **Restart Your Computer**: If you continue having issues, sometimes a simple restart will resolve port conflicts.

### Deploying the Signaling Server

The signaling server can be deployed to platforms like Heroku, Glitch, or Render:

1. Navigate to the server directory:
   ```bash
   cd server
   ```

2. Install server dependencies:
   ```bash
   npm install
   ```

3. Start the server:
   ```bash
   npm start
   ```

4. For production, deploy the server to a service like Glitch, Render, or Heroku.

5. Update the `signalingServerURLBase` variable in `src/app/hooks/useSignaling.ts` with your deployed server URL.

## Security Considerations

- WebRTC streams are encrypted by default
- The signaling server only helps in establishing the initial connection
- No video/audio data passes through any server
- Room IDs are generated using UUID for uniqueness
- For production use, always use HTTPS for both the app and signaling server

## Browser Compatibility

This application works in modern browsers that support WebRTC:
- Chrome 55+
- Firefox 52+
- Safari 11+
- Edge 79+

## Recent Improvements

- Added robust reconnection logic for the signaling server
- Improved handling of WebRTC permissions and error states
- Auto-detection of local network IP for testing across devices
- Better CORS configuration to allow cross-origin requests
- Enhanced error handling and user feedback
- Added automatic port discovery to handle port conflicts

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- [simple-peer](https://github.com/feross/simple-peer) for WebRTC implementation
- [Next.js](https://nextjs.org/) for the React framework
