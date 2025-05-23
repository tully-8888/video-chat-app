import { useState, useEffect, useRef, useCallback } from 'react';

// Define the structure of messages expected from the server
interface ServerMessage {
  type: string;
  payload: unknown;
}

type MessageHandler = (message: ServerMessage) => void;

// Define connection states
enum WebSocketState {
  CONNECTING = 'CONNECTING',
  OPEN = 'OPEN',
  CLOSING = 'CLOSING',
  CLOSED = 'CLOSED',
  ERROR = 'ERROR',
}

interface UseWebSocketOptions {
  onMessage: MessageHandler;
  onError?: (event: Event) => void;
  onOpen?: (event: Event) => void;
  onClose?: (event: CloseEvent) => void;
}

interface UseWebSocketReturn {
  sendMessage: (message: object) => void;
  connectionState: WebSocketState;
}

// Use the correctly named environment variable set in Netlify
const signalingUrl = process.env.NEXT_PUBLIC_SIGNALING_SERVER_URL; 

if (!signalingUrl) {
  // Update the error message to reflect the correct variable name
  console.error(
    "CRITICAL: Environment variable NEXT_PUBLIC_SIGNALING_SERVER_URL is not defined! " +
    "Ensure it is set in your .env.local file or deployment environment. " +
    "Falling back to a non-functional URL."
  );
}

// Fallback URL if the environment variable is not set
const WS_URL = signalingUrl || 'wss://error-signaling-url-not-set';

// Determine WebSocket URL based on environment
const getWebSocketURL = (): string => {
  // Check if running in a browser environment first
  if (typeof window === 'undefined') {
      // Return a dummy value or handle server-side case appropriately
      // This function should only be effectively called client-side anyway
      console.warn('getWebSocketURL called server-side, returning placeholder.');
      return 'ws://server-side-placeholder'; 
  }

  // --- Use the WS_URL constant defined above ---
  let wsUrl = WS_URL.trim(); // Trim whitespace just in case
  
  // Ensure the URL uses the wss:// protocol for secure WebSocket connections
  if (wsUrl.startsWith('https://')) {
    wsUrl = wsUrl.replace(/^https/, 'wss');
  } else if (wsUrl.startsWith('http://')) {
    // Less common, but handle if someone mistakenly puts http
    console.warn('Signaling URL starts with http://, converting to wss://. Ensure your Render service uses HTTPS.');
    wsUrl = wsUrl.replace(/^http/, 'wss');
  } else if (!wsUrl.startsWith('wss://')) {
    // If it doesn't start with wss:// or https://, prepend wss://
    console.warn("Signaling URL doesn't start with wss://, prepending automatically.");
    wsUrl = `wss://${wsUrl}`;
  }

  console.log(`WS URL (forced): ${wsUrl}`); // Log that we are forcing this URL
  return wsUrl;
};


export function useWebSocket({
  onMessage,
  onError,
  onOpen,
  onClose,
}: UseWebSocketOptions): UseWebSocketReturn {
  const [connectionState, setConnectionState] = useState<WebSocketState>(WebSocketState.CLOSED);
  const ws = useRef<WebSocket | null>(null);

  // Ensure onMessage is stable across renders
  const stableOnMessage = useCallback(onMessage, [onMessage]);
  const stableOnError = useCallback(onError || (() => {}), [onError]);
  const stableOnOpen = useCallback(onOpen || (() => {}), [onOpen]);
  const stableOnClose = useCallback(onClose || (() => {}), [onClose]);


  useEffect(() => {
    if (typeof window === 'undefined') {
      // Don't run WebSocket logic on the server during SSR/build
      return;
    }

    const wsUrl = getWebSocketURL();
    console.log(`Connecting WebSocket to: ${wsUrl}`);
    setConnectionState(WebSocketState.CONNECTING);

    try {
      const socket = new WebSocket(wsUrl);
      ws.current = socket;

      socket.onopen = (event) => {
        console.log('WebSocket connection opened');
        setConnectionState(WebSocketState.OPEN);
        stableOnOpen(event);
      };

      socket.onmessage = (event) => {
        try {
          const messageData = JSON.parse(event.data);
          // Add basic validation if needed
          if (messageData && typeof messageData.type === 'string') {
            stableOnMessage(messageData as ServerMessage);
          } else {
             console.warn('Received malformed WebSocket message:', event.data);
          }
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error, 'Data:', event.data);
        }
      };

      socket.onerror = (event) => {
        console.error('WebSocket error:', event);
        setConnectionState(WebSocketState.ERROR);
        stableOnError(event);
        // Attempt cleanup
        if (ws.current && ws.current.readyState !== WebSocket.CLOSED && ws.current.readyState !== WebSocket.CLOSING) {
           ws.current.close();
        }
      };

      socket.onclose = (event) => {
        console.log(`WebSocket connection closed. Code: ${event.code}, Reason: ${event.reason}`);
        setConnectionState(WebSocketState.CLOSED);
        ws.current = null;
        stableOnClose(event);
      };

    } catch (error) {
       console.error("Failed to create WebSocket connection:", error);
       setConnectionState(WebSocketState.ERROR);
    }

    // Cleanup function
    return () => {
      if (ws.current && ws.current.readyState === WebSocket.OPEN) {
        console.log('Closing WebSocket connection on cleanup');
        setConnectionState(WebSocketState.CLOSING);
        ws.current.close();
      }
      ws.current = null;
      setConnectionState(WebSocketState.CLOSED); // Ensure state is CLOSED on unmount
    };
    // Rerun effect if callbacks change (though useCallback minimizes this)
  }, [stableOnMessage, stableOnError, stableOnOpen, stableOnClose]);

  const sendMessage = useCallback((message: object) => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(message));
    } else {
      console.error('Cannot send message: WebSocket is not open.');
      // Optionally queue message or throw error
    }
  }, []);

  return { sendMessage, connectionState };
} 