import { useState, useEffect, useRef, useCallback } from 'react';
import Peer, { Instance as PeerInstance, SignalData } from 'simple-peer';
import { useWebSocket } from './useWebSocket'; // Assuming useWebSocket is in the same directory

// --- STUN/TURN Server Configuration ---
const peerConfig = {
  iceServers: [
    // --- Public STUN Servers ---
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    { urls: 'stun:stun.services.mozilla.com' },
    { urls: 'stun:stun.stunprotocol.org:3478' },
    { urls: 'stun:stun.nextcloud.com:443' },
    // Add more STUN if needed

    // --- Open Relay Project TURN Server (Free Tier) ---
    // Reference: https://www.metered.ca/tools/openrelay/
    // IMPORTANT: Replace credentials below with environment variables 
    // or fetch from a secure backend. DO NOT HARDCODE PRODUCTION CREDENTIALS.
    {
      urls: [
        'turn:openrelay.metered.ca:80', 
        'turn:openrelay.metered.ca:443',
        'turns:openrelay.metered.ca:443' // Secure TURN
      ],
      username: 'c4f7ff87d1325979858e8571', 
      credential: 'oP46m4ah5dOMj+7V',
      credentialType: 'password', // Open Relay uses password auth for static creds
    },
    // -----------------------------------------------------
  ],
  // --- Force TURN relay for testing --- 
  iceTransportPolicy: 'relay', 
  // ------------------------------------
};

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
  setVideoBitrate: (bitrate: number) => Promise<void>; // Add bitrate function
}

export function useWebRTC({
  localStream,
  onRemoteStream,
  onPeerDisconnect,
}: UseWebRTCOptions): UseWebRTCReturn {
  const [peers, setPeers] = useState<Map<string, PeerData>>(new Map());
  const [isJoined, setIsJoined] = useState(false);
  // --- Removed state for dynamic STUN servers ---
  // const [iceServers, setIceServers] = useState<RTCIceServer[]>(DEFAULT_STUN_SERVERS);
  // const [isLoadingStunList, setIsLoadingStunList] = useState(true);
  // -------------------------------------
  const peersRef = useRef(peers);
  const roomIdRef = useRef<string | null>(null);
  const userIdRef = useRef<string | null>(null);

  // Keep peersRef updated
  useEffect(() => {
    peersRef.current = peers;
  }, [peers]);

  // Stable callbacks for simple-peer events
  const stableOnRemoteStream = useCallback(onRemoteStream || (() => {}), [onRemoteStream]);
  const stableOnPeerDisconnect = useCallback(onPeerDisconnect || (() => {}), [onPeerDisconnect]);

  // --- Removed Effect to fetch dynamic STUN server list --- 
  // useEffect(() => { ... }, []);
  // ----------------------------------------------------

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

    // Retrieve sendMessage function from ref
    const webSocketSendMessage = wsSendMessageRef.current;
    if (!webSocketSendMessage) {
      console.error('sendMessage function not available when creating peer');
      return;
    }

    // --- Use static peerConfig defined above ---
    console.log(`Creating peer connection to ${peerId}, initiator: ${initiator}, using static config with ${peerConfig.iceServers.length} ICE servers.`);
    // ---------------------------------------------

    const newPeer = new Peer({ initiator, config: peerConfig, stream: localStream });

    newPeer.on('signal', (signalData: SignalData) => {
      // Log the type of signal being sent
      console.log(`[${userIdRef.current?.substring(0, 6)}] Sending signal (${signalData.type || 'candidate'}) to ${peerId.substring(0, 6)}`);
      webSocketSendMessage({ type: 'signal', payload: { receiverId: peerId, signalData } });
    });

    newPeer.on('stream', (remoteStream: MediaStream) => {
      console.log(`[${userIdRef.current?.substring(0, 6)}] Received stream from ${peerId.substring(0, 6)}`);
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
      // Log the specific peer error
      console.error(`[${userIdRef.current?.substring(0, 6)}] Peer error with ${peerId.substring(0, 6)}:`, err);
      // Attempt to remove the peer on error to cleanup state
      const remover = peerRemoverRef.current;
      if(remover) remover(peerId);
    });

    setPeers(prevPeers => {
      const updatedPeers = new Map(prevPeers);
      updatedPeers.set(peerId, { peerId, peer: newPeer });
      return updatedPeers;
    });

  }, [localStream, stableOnRemoteStream]); // Removed iceServers/isLoading dependencies

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

  // Placeholder stable callbacks for useWebSocket if needed
  const stableOnWebSocketError = useCallback(() => { /* TODO: Implement */ }, []);
  const stableOnWebSocketOpen = useCallback(() => { /* TODO: Implement */ }, []);
  const stableOnWebSocketClose = useCallback(() => { /* TODO: Implement */ }, []);

  // --- WebSocket Handling ---
  const handleWebSocketMessage = useCallback((message: { type: string; payload: unknown }) => {
    console.log('WebRTC hook received WS message:', message);
    const { type, payload } = message;

    // Get current user ID safely
    const currentUserId = userIdRef.current;

    // Get stable functions from refs
    const creator = peerCreatorRef.current;
    const remover = peerRemoverRef.current;

    switch (type) {
      case 'existing_room': {
        const data = payload as { userIds: string[] }; 
        if (data && Array.isArray(data.userIds)) {
            const { userIds } = data;
            console.log(`Found existing users: ${userIds.join(', ')}`);
            if (currentUserId) {
                userIds.forEach((peerId: string) => {
                    if (peerId === currentUserId) return; // Don't connect to self
                    // createPeer internally checks for localStream
                    creator(peerId, true); // Use creator ref
                });
            } else {
                console.warn('Cannot create peers for existing room: User ID not set yet.');
            }
        } else {
             console.warn('Received malformed existing_room payload:', payload);
        }
        break;
      }
      case 'user_joined': {
        const data = payload as { userId: string };
        if (data && typeof data.userId === 'string') {
            const { userId: newPeerId } = data;
            console.log(`User joined: ${newPeerId}`);
            if (currentUserId && newPeerId !== currentUserId) {
                 // We don't initiate connection here, the newcomer will send the offer
                 // Create peer instance, but set initiator to false
                 // createPeer internally checks for localStream
                 creator(newPeerId, false); // Use creator ref
            } else if (!currentUserId) {
                 console.warn('Cannot create peer for new user: User ID not set yet.');
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
                // Log the type of signal being received
                console.log(`[${userIdRef.current?.substring(0, 6)}] Received signal (${signalData.type || 'candidate'}) from ${senderId.substring(0, 6)}`);
                try {
                    peerData.peer.signal(signalData);
                } catch (err) {
                     console.error(`[${userIdRef.current?.substring(0, 6)}] Error processing signal from ${senderId.substring(0, 6)}:`, err);
                     // Optionally remove the peer if signaling fails critically
                     // const remover = peerRemoverRef.current;
                     // if(remover) remover(senderId);
                }
            } else {
                console.warn(`[${userIdRef.current?.substring(0, 6)}] Received signal from unknown peer: ${senderId.substring(0, 6)}`);
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
  }, []); // Empty dependency array makes this callback stable

  const { sendMessage, connectionState: webSocketState } = useWebSocket({
    onMessage: handleWebSocketMessage,
    onError: stableOnWebSocketError,
    onOpen: stableOnWebSocketOpen,
    onClose: stableOnWebSocketClose,
    // Add other handlers as needed
  });

  // Ensure the ref for sendMessage is updated when the hook provides it
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

  // --- Bitrate Control ---
  const setVideoBitrate = useCallback(async (bitrate: number) => {
    console.log(`Attempting to set max video bitrate to ${bitrate / 1000} kbps for all peers.`);
    for (const peerData of peersRef.current.values()) {
      // Access the underlying RTCPeerConnection (relies on simple-peer internal structure)
      const pc = (peerData.peer as PeerInstance & { _pc: RTCPeerConnection })._pc;

      if (!pc) {
        console.warn(`Peer ${peerData.peerId}: Could not access RTCPeerConnection.`);
        continue;
      }

      const senders = pc.getSenders();
      const videoSender = senders.find(sender => sender.track?.kind === 'video');

      if (!videoSender) {
        console.warn(`Peer ${peerData.peerId}: No video sender found.`);
        continue;
      }

      try {
        const parameters = videoSender.getParameters();

        if (!parameters.encodings || parameters.encodings.length === 0) {
          // If no encodings exist, create one with the desired bitrate
          parameters.encodings = [{ maxBitrate: bitrate }];
          console.log(`Peer ${peerData.peerId}: No existing encodings found, creating new encoding parameters.`);
        } else {
          // Modify the existing encoding's maxBitrate
          parameters.encodings[0].maxBitrate = bitrate;
           console.log(`Peer ${peerData.peerId}: Setting encoding[0].maxBitrate to ${bitrate}.`);
        }

        await videoSender.setParameters(parameters);
        console.log(`Peer ${peerData.peerId}: Successfully set maxBitrate to ${bitrate}.`);
      } catch (error) {
        console.error(`Peer ${peerData.peerId}: Failed to set video bitrate to ${bitrate}:`, error);
      }
    }
  }, []); // No dependencies, relies on peersRef

  return {
    peers,
    joinRoom,
    leaveRoom,
    isJoined,
    webSocketState,
    setVideoBitrate,
  };
} 