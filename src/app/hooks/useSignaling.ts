import { useEffect, useCallback, useRef, useState } from 'react';
import { EventSourcePolyfill } from 'event-source-polyfill';

/**
 * SignalData represents the structure of signaling messages exchanged between peers
 */
type SignalData = {
  type: string;
  sender: string;
  receiver: string;
  data: any;
  timestamp: number;
};

// Check if code is running in browser environment
const isBrowser = typeof window !== 'undefined' && typeof navigator !== 'undefined';

// Add these type declarations at the top of the file
type EventSourceEvent = MessageEvent & { data: string };
type EventSourceError = Event & { status?: number; message?: string };

// Add at top after imports:
const DEBUG = true;
const logSignaling = (message: string, ...args: any[]) => {
  if (DEBUG) {
    console.log(`[Signaling ${new Date().toISOString()}] ${message}`, ...args);
  }
};

/**
 * A lightweight pub/sub implementation for signaling in P2P applications
 * This allows peers to find each other and exchange connection information
 */
export default function useSignaling(userId: string, roomId: string) {
  const signalCallbacksRef = useRef<((signal: any) => void)[]>([]);
  const [lastError, setLastError] = useState<Error | null>(null);
  const [serverPort, setServerPort] = useState<number>(3001); // Default port
  
  // Modified to handle local network access
  const baseURL = isBrowser
    ? window.location.protocol + '//' + window.location.hostname
    : 'http://localhost';
  
  // Computed signaling server URL that includes the port
  const signalingServerURLBase = `${baseURL}:${serverPort}`;
  
  const evtSourceRef = useRef<EventSource | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isClient, setIsClient] = useState(false);
  
  // Check if we have valid user and room IDs
  const hasValidIds = useCallback(() => {
    return isBrowser && userId !== '' && roomId !== '';
  }, [userId, roomId]);
  
  // Set isClient state once on mount
  useEffect(() => {
    setIsClient(true);
  }, []);
  
  // Discover the server port on component mount
  useEffect(() => {
    if (!isBrowser) return;
    
    // Function to find available server
    const findServer = async () => {
      logSignaling(`🔍 Searching for signaling server from ${baseURL}`);
      
      // For discovery, add IP addresses logging
      if (isBrowser) {
        logSignaling(`🌐 Running in browser: ${navigator.userAgent}`);
        logSignaling(`🔌 Current hostname: ${window.location.hostname}`);
      }

      // Try WebSocket first for modern connections
      for (let port = 3001; port <= 3010; port++) {
        try {
          logSignaling(`🔌 Testing WebSocket connection to ${window.location.hostname}:${port}`);
          const ws = new WebSocket(`ws://${window.location.hostname}:${port}`);
          await new Promise((resolve, reject) => {
            ws.onopen = () => {
              logSignaling(`✅ WebSocket connection succeeded on port ${port}`);
              resolve(undefined);
            };
            ws.onerror = (e) => {
              logSignaling(`❌ WebSocket connection failed on port ${port}`, e);
              reject(new Error('WS connection failed'));
            };
            setTimeout(() => {
              logSignaling(`⏱️ WebSocket connection timed out on port ${port}`);
              reject(new Error('WS timeout'));
            }, 1000);
          });
          setServerPort(port);
          ws.close();
          logSignaling(`🔗 Using signaling server on port ${port} (WebSocket)`);
          return;
        } catch (wsError) {
          logSignaling(`🚫 WebSocket on port ${port} failed: ${wsError}`);
          // Proceed to HTTP check
        }
      }

      // Fallback to HTTP check
      for (let port = 3001; port <= 3010; port++) {
        try {
          logSignaling(`🔌 Testing HTTP connection to ${baseURL}:${port}/status`);
          const response = await fetch(`${baseURL}:${port}/status`, {
            method: 'HEAD',
            signal: AbortSignal.timeout(500)
          });
          if (response.ok) {
            logSignaling(`✅ HTTP connection succeeded on port ${port}`);
            setServerPort(port);
            logSignaling(`🔗 Using signaling server on port ${port} (HTTP)`);
            return;
          }
        } catch (error) {
          logSignaling(`❌ HTTP connection failed on port ${port}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      
      logSignaling(`⚠️ No signaling server found after trying all ports!`);
      throw new Error('No signaling server found');
    };
    
    findServer();
  }, [baseURL]);
  
  // Send a signal to a specific peer
  const sendSignal = useCallback((receiverId: string, data: any) => {
    // Skip if not in browser environment or if missing required parameters
    if (!hasValidIds() || !receiverId) {
      logSignaling(`⚠️ Cannot send signal: Missing IDs`);
      return;
    }
    
    const signalData: SignalData = {
      type: 'signal',
      sender: userId,
      receiver: receiverId,
      data,
      timestamp: Date.now(),
    };
    
    logSignaling(`📤 Sending signal to ${receiverId}, type: ${data.type || 'unknown'}`);
    
    // Send the signal to our signaling server
    fetch(`${signalingServerURLBase}/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        roomId,
        signal: signalData,
      }),
    })
    .then(response => {
      if (!response.ok) {
        logSignaling(`❌ Server returned error ${response.status} when sending signal`);
        throw new Error(`Server returned ${response.status}`);
      }
      logSignaling(`✅ Signal sent successfully to ${receiverId}`);
      return response.text();
    })
    .catch(error => {
      logSignaling(`❌ Error sending signal: ${error instanceof Error ? error.message : String(error)}`);
      setLastError(error instanceof Error ? error : new Error('Failed to send signal'));
    });
  }, [userId, roomId, signalingServerURLBase, hasValidIds]);
  
  // Register a callback for receiving signals
  const onSignal = useCallback((callback: (signal: any) => void) => {
    signalCallbacksRef.current.push(callback);
    
    return () => {
      signalCallbacksRef.current = signalCallbacksRef.current.filter(cb => cb !== callback);
    };
  }, []);
  
  // Process received signals
  const processSignal = useCallback((signalData: SignalData) => {
    if (signalData.receiver === userId) {
      // The signal is meant for this user
      signalCallbacksRef.current.forEach(callback => {
        callback(signalData.data);
      });
    }
  }, [userId]);
  
  // Function to establish EventSource connection with retry logic
  const connectEventSource = useCallback(async () => {
    if (!hasValidIds()) {
      logSignaling(`⚠️ Missing required IDs, skipping connection`);
      return;
    }
    
    // Close any existing connection
    if (evtSourceRef.current) {
      logSignaling(`🔄 Closing existing EventSource connection`);
      evtSourceRef.current.close();
      evtSourceRef.current = null;
    }
    
    // Clear any existing timeout
    if (reconnectTimeoutRef.current) {
      logSignaling(`🔄 Clearing existing reconnection timeout`);
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    logSignaling(`📡 Connecting to signaling server at ${signalingServerURLBase}`);
    
    try {
      // Create SSE connection to receive signals
      const eventSourceURL = `${signalingServerURLBase}/events?roomId=${roomId}&userId=${userId}`;
      logSignaling(`🔌 Creating EventSource connection to ${eventSourceURL}`);
      
      // Add error handling before connection
      try {
        const testResponse = await fetch(`${signalingServerURLBase}/ping`, {
          method: 'GET',
          signal: AbortSignal.timeout(2000)
        });
        
        if (!testResponse.ok) {
          throw new Error(`Server ping failed with status ${testResponse.status}`);
        }
        
        logSignaling(`✅ Server ping successful, proceeding with EventSource`);
      } catch (pingError) {
        logSignaling(`⚠️ Unable to ping server: ${pingError instanceof Error ? pingError.message : String(pingError)}`);
        // Continue anyway - ping is just a preflight check
      }
      
      // Use more robust configuration with fewer options to avoid type errors
      const eventSource = new EventSourcePolyfill(eventSourceURL, {
        heartbeatTimeout: 60000,
      });
      evtSourceRef.current = eventSource;
      
      eventSource.onopen = () => {
        logSignaling(`✅ EventSource connection established`);
        reconnectAttemptsRef.current = 0; // Reset attempt counter on successful connection
      };
      
      eventSource.onmessage = (event: any) => {
        try {
          logSignaling(`📩 Received message: ${event.data.substring(0, 100)}...`);
          const signalData = JSON.parse(event.data) as SignalData;
          logSignaling(`📦 Signal from ${signalData.sender} to ${signalData.receiver}, type: ${signalData.type}`);
          processSignal(signalData);
        } catch (error) {
          logSignaling(`❌ Error processing signal: ${error instanceof Error ? error.message : String(error)}`);
        }
      };
      
      eventSource.onerror = (error: any) => {
        logSignaling(`❌ EventSource error:`, error);
        
        // Close the eventSource on error to clean up
        eventSource.close();
        
        // Implement exponential backoff for reconnection
        const reconnectDelay = Math.min(
          1000 * Math.pow(2, reconnectAttemptsRef.current),
          30000
        ); // Cap at 30 seconds
        
        reconnectAttemptsRef.current += 1;
        
        logSignaling(`🔄 Reconnecting in ${reconnectDelay}ms (attempt ${reconnectAttemptsRef.current})`);
        
        // Try to reconnect after delay
        reconnectTimeoutRef.current = setTimeout(() => {
          if (isBrowser) {
            logSignaling(`⏱️ Reconnection timeout triggered`);
            connectEventSource();
          }
        }, reconnectDelay);
      };
    } catch (error) {
      logSignaling(`❌ Error creating EventSource: ${error instanceof Error ? error.message : String(error)}`);
      setLastError(error instanceof Error ? error : new Error('Failed to connect to signaling server'));
      
      // Try to reconnect after a delay
      reconnectTimeoutRef.current = setTimeout(() => {
        if (isBrowser) {
          logSignaling(`⏱️ Error recovery timeout triggered`);
          connectEventSource();
        }
      }, 5000);
    }
  }, [roomId, userId, processSignal, signalingServerURLBase, hasValidIds]);
  
  // Set up the connection to the signaling server after determining the correct port
  useEffect(() => {
    // Skip if not in browser environment or if required parameters are missing
    if (!hasValidIds()) return;
    
    console.log(`Setting up signaling with base URL: ${signalingServerURLBase}`);
    
    // Initialize connection
    connectEventSource();
    
    // Join the room on the signaling server
    fetch(`${signalingServerURLBase}/join`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        roomId,
        userId,
      }),
    }).catch(error => {
      console.error('Error joining room:', error);
      setLastError(error instanceof Error ? error : new Error('Failed to join room'));
    });
    
    // Cleanup function for when the component unmounts
    return () => {
      // Clear any reconnection timeout
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      
      // Close the EventSource connection
      if (evtSourceRef.current) {
        evtSourceRef.current.close();
        evtSourceRef.current = null;
      }
      
      // Leave the room on the signaling server only if we had valid IDs
      if (hasValidIds()) {
        fetch(`${signalingServerURLBase}/leave`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            roomId,
            userId,
          }),
        }).catch(error => {
          console.error('Error leaving room:', error);
        });
      }
    };
  }, [roomId, userId, connectEventSource, signalingServerURLBase, hasValidIds]);
  
  return {
    sendSignal,
    onSignal,
    error: lastError,
    isReady: isClient && hasValidIds(),
  };
}

// Fallback implementation if the signaling server is down
// This creates a simple signaling server using GitHub Gist as a data store
function createFallbackSignaling() {
  // Implementation would go here if needed
  // This is not implemented in this version but could be added if needed
} 