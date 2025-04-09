# P2P Video Chat App

A decentralized, peer-to-peer video chat application built with WebRTC, Next.js, and TypeScript. This application allows users to make video calls directly to each other without going through a central server (except for the initial signaling process).

## Features

- 🎥 Real-time video and audio communication
- 🔒 End-to-end encryption provided by WebRTC
- 🌐 P2P architecture for direct media streaming
- 🚪 Simple room joining via shared IDs
- 🎛️ Basic controls (mute mic, disable video)
- 📱 Responsive design
- 💬 WebSocket-based signaling

## How It Works

1.  **Signaling**: When a user joins a room, they connect to the signaling server via WebSocket. The server helps peers discover each other by relaying messages like join notifications and WebRTC connection details (offers, answers, ICE candidates).
2.  **WebRTC Connection**: Once peers are aware of each other via the signaling server, they establish a direct P2P WebRTC connection using the exchanged information.
3.  **Media Streaming**: Video and audio are streamed directly between peers over the encrypted WebRTC connection. The signaling server is no longer involved in media transfer.

## Technology Stack

- **Frontend**: Next.js, React, TypeScript
- **WebRTC**: `simple-peer` library (simplifies WebRTC API)
- **Signaling Server**: Node.js, Express.js, WebSockets (`ws` library)

## Project Structure

```
/
├── src/
│   ├── app/                 # Next.js app directory
│   │   ├── hooks/           # Custom React hooks
│   │   │   ├── useWebSocket.ts   # WebSocket connection management
│   │   │   └── useWebRTC.ts      # WebRTC peer connection logic
│   │   ├── page.tsx         # Main page component / UI
│   │   └── globals.css      # Global styles
│   │   └── layout.tsx       # Root layout
│   └── ...
├── server/                  # Signaling server
│   ├── server.js            # Node.js WebSocket server logic
│   └── package.json
└── ...
```

## Getting Started

### Prerequisites

- Node.js (v18.x or higher recommended)
- npm or yarn

### Installation

1.  Clone the repository:
    ```bash
    git clone <repository-url>
    cd video-chat-app
    ```

2.  Install frontend dependencies:
    ```bash
    npm install
    # or yarn install
    ```

3.  Install server dependencies:
    ```bash
    cd server
    npm install
    # or yarn install
    cd ..
    ```

### Development

To run both the Next.js frontend and the signaling server concurrently for development:

1.  **Terminal 1 (Frontend):**
    ```bash
    npm run dev
    # or yarn dev
    ```
    This starts the Next.js app, usually on `http://localhost:3000`.

2.  **Terminal 2 (Signaling Server):**
    ```bash
    cd server
    npm start
    # or yarn start
    ```
    This starts the signaling server, usually on port `3001` (defined in `server/server.js`). The frontend is configured to connect to `ws://localhost:3001` in development.

3.  Open `http://localhost:3000` in your browser.

*(Note: If port 3001 is taken, the server might log that it's using a different port. The frontend currently expects it on 3001 in development. You may need to adjust `NEXT_PUBLIC_SIGNALING_PORT` in `.env.local` or modify the port logic if needed).*

### Using on a Local Network

To test between devices on the same network:

1.  Find your computer's local IP address (e.g., `192.168.1.100`).
2.  Ensure the signaling server (`server/server.js`) is running.
3.  Start the Next.js development server, making it accessible on your network:
    ```bash
    npm run dev -- --hostname 0.0.0.0
    # or yarn dev --hostname 0.0.0.0
    ```
4.  Access the app from another device using `http://<your-local-ip>:3000`.

*(Note: Firewall settings might need to allow connections on ports 3000 and 3001. WebRTC might also require HTTPS in some strict network/browser environments, though localhost and local IPs are often exceptions).*

### Deployment

1.  **Signaling Server:**
    *   Deploy the `server/` directory to a Node.js hosting platform (e.g., Render, Fly.io, Heroku).
    *   Ensure the server listens on the host provided by the platform (usually `0.0.0.0`) and the correct port (often via `process.env.PORT`).
    *   Note the public URL of your deployed signaling server (e.g., `wss://your-signaling-server.onrender.com`).

2.  **Frontend (Next.js App):**
    *   Deploy the root project directory to a platform like Vercel or Netlify.
    *   Configure the **`NEXT_PUBLIC_SIGNALING_SERVER_URL`** environment variable in your deployment platform's settings. Set its value to the public URL of your deployed signaling server (from step 1).
    *   The frontend code (`useWebSocket.ts`) will automatically use this environment variable to connect to the correct signaling server when not running on localhost.

## Security Considerations

- WebRTC data channels and media streams are peer-to-peer and encrypted (DTLS-SRTP).
- The signaling server only brokers connections and does not handle media streams.
- Use `wss://` (Secure WebSockets) for the signaling server in production by deploying it behind a reverse proxy that handles TLS termination (most platforms do this automatically).
- Ensure the frontend is served over HTTPS in production.

## Browser Compatibility

Requires modern browsers with WebRTC support:
- Chrome
- Firefox
- Safari
- Edge (Chromium-based)

## Recent Improvements / Fixes

- **Fixed WebSocket Instability:** Resolved issue causing WebSocket connections to drop and reconnect prematurely, preventing users from joining rooms reliably. Stabilized React hook dependencies between `useWebRTC` and `useWebSocket`.
- **Enhanced Logging:** Added more detailed client-side logging for WebRTC signaling events.
- **Simplified Configuration:** Uses environment variables (`NEXT_PUBLIC_SIGNALING_SERVER_URL`) for production signaling server URL.

## License

MIT License.

## Acknowledgments

- [simple-peer](https://github.com/feross/simple-peer) library
- [Next.js](https://nextjs.org/) framework
- [ws](https://github.com/websockets/ws) library
