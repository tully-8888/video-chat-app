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

// Determine WebSocket URL based on environment
const getWebSocketURL = (): string => {
  // For local development, connect to the Node server's port (e.g., 3001)
  if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
    // Assuming the signaling server runs on port 3001 locally
    // Use ws:// not wss:// for local unsecured connection
    const localPort = process.env.NEXT_PUBLIC_SIGNALING_PORT || 3001;
    return `ws://localhost:${localPort}`;
  }
  // For deployment, derive WebSocket URL from the window location
  // Use wss:// for secure connection on deployed environments
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host; // Includes hostname and port (if any)
  return `${protocol}//${host}`;
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