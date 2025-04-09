import { useState, useEffect, useRef, useCallback } from 'react';
import Peer, { Instance as PeerInstance, SignalData } from 'simple-peer';
import { useWebSocket } from './useWebSocket'; // Assuming useWebSocket is in the same directory

interface PeerData {
  peerId: string;
  peer: PeerInstance;
  stream?: MediaStream;
}

interface UseWebRTCOptions {
  localStream: MediaStream | null;
  onRemoteStream?: (peerId: string, stream: MediaStream) => void;
  onPeerDisconnect?: (peerId: string) => void;
}

interface JoinRoomOptions {
    roomId: string;
    userId: string;
}

interface UseWebRTCReturn {
  peers: Map<string, PeerData>; // Map of peerId -> PeerData
  joinRoom: (options: JoinRoomOptions) => void;
  leaveRoom: () => void;
  isJoined: boolean;
  webSocketState: string; // Expose WS state for UI feedback
}

// Configuration for STUN servers (use public ones for now)
const peerConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    // Add more STUN servers if needed
    // Consider adding TURN servers here if reliability over P2P is critical
    // { 
    //   urls: 'turn:your-turn-server.com:3478', 
    //   username: 'your-username',
    //   credential: 'your-password' 
    // },
  ],
};

export function useWebRTC({
  localStream,
  onRemoteStream,
  onPeerDisconnect,
}: UseWebRTCOptions): UseWebRTCReturn {
  const [peers, setPeers] = useState<Map<string, PeerData>>(new Map());
  const [isJoined, setIsJoined] = useState(false);
  const peersRef = useRef(peers); // Ref to access current peers in callbacks
  const roomIdRef = useRef<string | null>(null);
  const userIdRef = useRef<string | null>(null);

  // Keep peersRef updated
  useEffect(() => {
    peersRef.current = peers;
  }, [peers]);

  // Stable callbacks for simple-peer events
  const stableOnRemoteStream = useCallback(onRemoteStream || (() => {}), [onRemoteStream]);
  const stableOnPeerDisconnect = useCallback(onPeerDisconnect || (() => {}), [onPeerDisconnect]);

  // --- Peer Management Functions (defined before use in handleWebSocketMessage) ---
  const createPeer = useCallback((peerId: string, initiator: boolean) => {
    if (!localStream || !userIdRef.current) {
      console.error('Cannot create peer: Missing localStream or current userId');
      return;
    }
    if (peersRef.current.has(peerId)) {
      console.warn(`Peer already exists for ${peerId}, skipping creation.`);
      return;
    }

    console.log(`Creating peer connection to ${peerId}, initiator: ${initiator}`);
    // Need sendMessage from useWebSocket, but useWebSocket is defined later.
    // This creates a dependency cycle issue. We need to rethink the structure slightly.
    // Option 1: Pass sendMessage into createPeer (might get messy).
    // Option 2: Define sendMessage earlier (requires separating useWebSocket logic).
    // Option 3: Use refs for callbacks that need sendMessage.

    // Let's try getting sendMessage from a ref updated AFTER useWebSocket is called.
    const webSocketSendMessage = wsSendMessageRef.current;
    if (!webSocketSendMessage) {
      console.error('sendMessage function not available when creating peer');
      return;
    }

    const newPeer = new Peer({ initiator, config: peerConfig, stream: localStream });

    newPeer.on('signal', (signalData: SignalData) => {
      console.log(`Sending signal to ${peerId}`);
      webSocketSendMessage({ type: 'signal', payload: { receiverId: peerId, signalData } });
    });

    newPeer.on('stream', (remoteStream: MediaStream) => {
      console.log(`Received stream from ${peerId}`);
      setPeers(prevPeers => {
        const updatedPeers = new Map(prevPeers);
        updatedPeers.set(peerId, { peerId, peer: newPeer, stream: remoteStream });
        return updatedPeers;
      });
      stableOnRemoteStream(peerId, remoteStream);
    });

    newPeer.on('connect', () => {
      console.log(`✅ Peer connection established with ${peerId}`);
      // Optionally send data channel messages here if needed
    });

    newPeer.on('close', () => {
      console.log(`❌ Peer connection closed with ${peerId}`);
      // Need removePeer here, define it first or use ref
      const remover = peerRemoverRef.current;
      if(remover) remover(peerId);
    });

    newPeer.on('error', (err) => {
      console.error(`Peer error with ${peerId}:`, err);
      // Attempt to remove the peer on error to cleanup state
      const remover = peerRemoverRef.current;
      if(remover) remover(peerId);
    });

    setPeers(prevPeers => {
      const updatedPeers = new Map(prevPeers);
      updatedPeers.set(peerId, { peerId, peer: newPeer });
      return updatedPeers;
    });

  }, [localStream, stableOnRemoteStream]); // Removed userId dependency, will use ref

  const removePeer = useCallback((peerId: string) => {
    setPeers(prevPeers => {
      const peerData = prevPeers.get(peerId);
      if (peerData) {
         console.log(`Removing peer ${peerId}`);
        if (peerData.peer) {
           // Ensure destroy is called to clean up resources
           try {
              peerData.peer.destroy();
           } catch (error) {
              console.warn(`Error destroying peer ${peerId}:`, error);
           }
        }
        const updatedPeers = new Map(prevPeers);
        updatedPeers.delete(peerId);
        stableOnPeerDisconnect(peerId);
        return updatedPeers;
      } 
      return prevPeers; // No change if peer not found
    });
  }, [stableOnPeerDisconnect]);

  // Refs to hold stable versions of functions needed across callbacks
  const peerCreatorRef = useRef(createPeer);
  const peerRemoverRef = useRef(removePeer);
  const wsSendMessageRef = useRef<((message: object) => void) | null>(null);

  useEffect(() => {
      peerCreatorRef.current = createPeer;
  }, [createPeer]);

   useEffect(() => {
      peerRemoverRef.current = removePeer;
  }, [removePeer]);

  // --- WebSocket Handling ---
  const handleWebSocketMessage = useCallback((message: { type: string; payload: unknown }) => {
    console.log('WebRTC hook received WS message:', message);
    const { type, payload } = message;

    // Get stable functions from refs
    const creator = peerCreatorRef.current;
    const remover = peerRemoverRef.current;

    switch (type) {
      case 'existing_room': {
        // Called when *we* join a room with existing users
        // Type assertion/check for payload structure
        const data = payload as { userIds: string[] }; 
        if (data && Array.isArray(data.userIds)) {
            const { userIds } = data;
            console.log(`Found existing users: ${userIds.join(', ')}`);
            if (localStream && userIdRef.current) {
                userIds.forEach((peerId: string) => {
                    if (peerId === userIdRef.current) return; // Don't connect to self
                    creator(peerId, true); // Use creator ref
                });
            }
        } else {
             console.warn('Received malformed existing_room payload:', payload);
        }
        break;
      }
      case 'user_joined': {
        // Called when a *new* user joins the room we are already in
        const data = payload as { userId: string };
        if (data && typeof data.userId === 'string') {
            const { userId: newPeerId } = data;
            console.log(`User joined: ${newPeerId}`);
            if (localStream && userIdRef.current && newPeerId !== userIdRef.current) {
                // We don't initiate connection here, the newcomer will send the offer
                // Create peer instance, but set initiator to false
                creator(newPeerId, false); // Use creator ref
            }
        } else {
            console.warn('Received malformed user_joined payload:', payload);
        }
        break;
      }
      case 'signal': {
        // Handle incoming signal data (offer, answer, candidate) from another peer
        const data = payload as { senderId: string; signalData: SignalData };
        if (data && typeof data.senderId === 'string' && data.signalData) {
            const { senderId, signalData } = data;
            const peerData = peersRef.current.get(senderId);
            if (peerData) {
                console.log(`Received signal from ${senderId}`);
                peerData.peer.signal(signalData);
            } else {
                console.warn(`Received signal from unknown peer: ${senderId}`);
                // Potentially handle scenarios where signal arrives before peer object is created?
            }
        } else {
            console.warn('Received malformed signal payload:', payload);
        }
        break;
      }
      case 'user_left': {
        // Called when a user leaves the room
        const data = payload as { userId: string };
         if (data && typeof data.userId === 'string') {
            const { userId: leavingPeerId } = data;
            console.log(`User left: ${leavingPeerId}`);
            remover(leavingPeerId); // Use remover ref
         } else {
            console.warn('Received malformed user_left payload:', payload);
         }
        break;
      }
      case 'error': {
        const data = payload as { message: string };
        const errorMessage = data?.message || 'Unknown server error';
        console.error("Received error from signaling server:", errorMessage);
        // Handle server errors appropriately (e.g., display message to user)
        break;
      }
      default:
        console.warn(`Unhandled WebSocket message type: ${type}`);
    }
  }, [localStream]); // No longer depends on sendMessage

  const { sendMessage, connectionState: webSocketState } = useWebSocket({
    onMessage: handleWebSocketMessage,
    // Optional: Add onOpen, onClose, onError handlers for more detailed feedback
  });

  // Update the sendMessage ref whenever the sendMessage function from useWebSocket changes
  useEffect(() => {
      wsSendMessageRef.current = sendMessage;
  }, [sendMessage]);

  // --- Room Join/Leave Logic ---
  const joinRoom = useCallback((options: JoinRoomOptions) => {
    const { roomId, userId } = options; // Destructure from arguments

    if (webSocketState !== 'OPEN') {
      console.error('Cannot join room: WebSocket not open.');
      return;
    }
    if (!roomId || !userId) {
      console.error('Cannot join room: Missing roomId or userId in arguments.');
      return;
    }
    if (isJoined) {
       console.warn('Already joined room');
       return;
    }

    // Store roomId and userId in refs *before* sending message
    roomIdRef.current = roomId;
    userIdRef.current = userId;

    console.log(`Attempting to join room ${roomId} as ${userId}`);
    sendMessage({ type: 'join', payload: { roomId, userId } });
    setIsJoined(true); // Assume join success for now, handle potential errors via WS message
  }, [sendMessage, webSocketState, isJoined]); // sendMessage is a valid dependency here

  const leaveRoom = useCallback(() => {
    console.log('Leaving room...');
    // 1. Destroy all peer connections
    peersRef.current.forEach((peerData) => {
      try {
         peerData.peer.destroy();
      } catch (error) {
         console.warn(`Error destroying peer ${peerData.peerId} on leave:`, error);
      }
    });
    // 2. Clear peers state
    setPeers(new Map());
    peersRef.current = new Map();
    // 3. Close WebSocket connection (optional, depends if hook instance persists)
    // sendMessage({ type: 'leave' }); // Server handles disconnect via ws.on('close')
    // If the component unmounts, useWebSocket's cleanup will close the socket.
    // If the hook instance persists, you might need an explicit disconnect function in useWebSocket.
    // Clear refs on leave
    roomIdRef.current = null;
    userIdRef.current = null;
    setIsJoined(false);
  }, []); // No dependencies that should trigger recreation

  // Effect to leave room on component unmount or when roomId/userId changes
  useEffect(() => {
    return () => {
      if (isJoined) {
         leaveRoom();
      }
    };
  }, [isJoined, leaveRoom]); // Leave room if isJoined status changes (to false)

  return {
    peers,
    joinRoom,
    leaveRoom,
    isJoined,
    webSocketState,
  };
} 