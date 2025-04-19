'use client';

import React from 'react';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useDebouncedCallback } from 'use-debounce'; // Import debounce hook
import { useWebRTC } from './hooks/useWebRTC';
import type { Instance as PeerInstance } from 'simple-peer'; // Import PeerInstance type
import { v4 as uuidv4 } from 'uuid'; // Import UUID for generating room IDs
import { 
  Video, 
  Keyboard, 
  Mic,             // Added
  MicOff,          // Added
  VideoOff,        // Added
  LogOut,          // Added
  ListFilter,      // Added
  BarChartHorizontal, // Added
  X,               // Added
  RefreshCw        // Added
} from 'lucide-react'; // Import icons
import { ToastContainer, toast } from 'react-toastify'; // Import react-toastify
import 'react-toastify/dist/ReactToastify.css'; // Import default CSS

// Simple Video Player Component
const VideoPlayer = ({ stream, muted = false, className = '' }: { stream: MediaStream | null, muted?: boolean, className?: string }) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    } else if (videoRef.current) {
      videoRef.current.srcObject = null; // Clear source if stream is null
    }
  }, [stream]);

  return (
    <video
      ref={videoRef}
      className={className}
      autoPlay
      playsInline // Important for mobile browsers
      muted={muted}
      style={{
        display: 'block',
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        backgroundColor: 'black',
      }}
      onError={(event) => {
        console.error("Video Player Error:", event);
      }}
    />
  );
};

// --- Resolution Presets ---
type ResolutionPreset = {
  label: string;
  width: number;
  height: number;
};

const RESOLUTION_PRESETS: ResolutionPreset[] = [
  { label: '360p', width: 640, height: 360 },
  { label: '480p', width: 854, height: 480 },
  { label: '720p', width: 1280, height: 720 },
  // Add 1080p cautiously, might strain P2P connections
  // { label: '1080p', width: 1920, height: 1080 }, 
];
const DEFAULT_RESOLUTION_INDEX = 1; // Default to 480p
// ------------------------

// --- Frame Rate Presets ---
const FRAME_RATE_PRESETS: number[] = [15, 30, 60];
const DEFAULT_FRAME_RATE_INDEX = 1; // Default to 30fps
// -------------------------

export default function Home() {
  const [roomId, setRoomId] = useState('');
  const [userId, setUserId] = useState('');
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isJoining, setIsJoining] = useState(false); // Prevent multiple join attempts
  const [isCreatingRoom, setIsCreatingRoom] = useState(false); // New state for "New meeting" button
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isVideoStopped, setIsVideoStopped] = useState(false);

  // --- State for Camera Switching ---
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [currentVideoDeviceId, setCurrentVideoDeviceId] = useState<string | null>(null);
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false);
  // --------------------------------

  // --- Debugging State ---
  const [logs, setLogs] = useState<{ type: 'log' | 'error' | 'warn', message: string, timestamp: number }[]>([]);
  const [showLogs, setShowLogs] = useState(false); // State to control log window visibility
  // -----------------------

  // Ref to track previous WebSocket state for transition detection
  const previousWebSocketStateRef = useRef<string | null>(null);

  // --- Call Statistics State ---
  const [callStats, setCallStats] = useState<{
    totalSent: string;
    totalReceived: string;
    currentBitrate: string;
    packetLoss: string;
  } | null>(null);

  // New state for bitrate slider
  const [targetBitrateKbps, setTargetBitrateKbps] = useState<number>(800); // Default: 800 kbps
  const MIN_BITRATE_KBPS = 100;
  const MAX_BITRATE_KBPS = 2500; // 2.5 Mbps max, adjust as needed

  // New state for resolution
  const [currentResolutionIndex, setCurrentResolutionIndex] = useState<number>(DEFAULT_RESOLUTION_INDEX);
  // New state for frame rate
  const [currentFrameRateIndex, setCurrentFrameRateIndex] = useState<number>(DEFAULT_FRAME_RATE_INDEX);

  // Helper function to add logs
  const addLog = useCallback((type: 'log' | 'error' | 'warn', ...args: unknown[]) => {
    // Simple serialization for objects
    const message = args.map(arg => {
        try {
            if (arg instanceof Error) return arg.message;
            if (typeof arg === 'object' && arg !== null) return JSON.stringify(arg);
            if (typeof arg === 'string') return arg;
            if (typeof arg === 'number' || typeof arg === 'boolean' || typeof arg === 'undefined' || typeof arg === 'symbol' || typeof arg === 'bigint') return String(arg);
            if (arg === null) return 'null';
             return typeof arg;
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (_error) {
            return '[Unserializable]';
        }
    }).join(' ');

    setLogs(prevLogs => [
        ...prevLogs.slice(-100), // Keep only the last 100 logs
        {
            type,
            message,
            timestamp: Date.now()
        }
    ]);
  }, []); // No dependencies, safe to keep empty

  // Override console methods to capture logs
  useEffect(() => {
    const originalLog = console.log;
    const originalError = console.error;
    const originalWarn = console.warn;

    console.log = (...args) => {
      originalLog.apply(console, args);
      addLog('log', ...args);
    };
    console.error = (...args) => {
      originalError.apply(console, args);
      addLog('error', ...args);
    };
    console.warn = (...args) => {
      originalWarn.apply(console, args);
      addLog('warn', ...args);
    };

    // Cleanup: Restore original methods on unmount
    return () => {
      console.log = originalLog;
      console.error = originalError;
      console.warn = originalWarn;
    };
  }, [addLog]); // Depend on addLog

  const handleRemoteStream = useCallback((peerId: string, stream: MediaStream) => {
    console.log('New remote stream received from:', peerId);
    setRemoteStreams(prev => new Map(prev).set(peerId, stream));
  }, []);

  const handlePeerDisconnect = useCallback((peerId: string) => {
    console.log('Peer disconnected:', peerId);
    setRemoteStreams(prev => {
      const newMap = new Map(prev);
      newMap.delete(peerId);
      return newMap;
    });
  }, []);

  // --- Instantiate the WebRTC Hook ---
  const { 
    joinRoom: rtcJoinRoom, 
    leaveRoom: rtcLeaveRoom, 
    isJoined, 
    webSocketState,
    peers,
    setVideoBitrate
  } = useWebRTC({
    localStream,
    onRemoteStream: handleRemoteStream,
    onPeerDisconnect: handlePeerDisconnect,
  });
  // -------------------------------------

  // --- Debounced Bitrate Update ---
  const debouncedSetBitrate = useDebouncedCallback(
    async (bitrateKbps: number) => {
      if (setVideoBitrate) {
        const bitrateBps = bitrateKbps * 1000;
        await setVideoBitrate(bitrateBps);
      }
    },
    300 // Debounce for 300ms
  );

  const handleBitrateChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newBitrate = parseInt(event.target.value, 10);
    setTargetBitrateKbps(newBitrate);
    debouncedSetBitrate(newBitrate);
  };
  // -------------------------------

  // --- Debounced Video Constraint Update (Combined Resolution & FPS) ---
  const applyVideoTrackConstraints = useDebouncedCallback(
    async () => {
      // Read current state values INSIDE the debounced function
      const resIndex = currentResolutionIndex;
      const fpsIndex = currentFrameRateIndex;

      if (!localStream) {
        console.warn('Cannot apply constraints: No local stream.');
        return;
      }
      const videoTrack = localStream.getVideoTracks()[0];
      if (!videoTrack) {
        console.warn('Cannot apply constraints: No video track found.');
        return;
      }

      const selectedPreset = RESOLUTION_PRESETS[resIndex];
      const selectedFps = FRAME_RATE_PRESETS[fpsIndex];

      if (!selectedPreset || selectedFps === undefined) {
          console.error(`Invalid resolution/FPS preset index: Res ${resIndex}, FPS ${fpsIndex}`);
          return;
      }

      const constraints: MediaTrackConstraints = {
        width: { ideal: selectedPreset.width },
        height: { ideal: selectedPreset.height },
        frameRate: { ideal: selectedFps }
      };

      console.log(`Attempting to apply video constraints: ${JSON.stringify(constraints)}`);
      try {
        await videoTrack.applyConstraints(constraints);
        console.log('Successfully applied video constraints.');
      } catch (error) {
        console.error('Failed to apply video constraints:', error);
        // Optionally revert state or show error to user
        // setError(`Failed to apply constraints: ${error.message}. Check device support.`);
      }
    },
    500 // Debounce for 500ms
  );

  // Update resolution slider handler
  const handleResolutionChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newIndex = parseInt(event.target.value, 10);
    setCurrentResolutionIndex(newIndex);
    // Trigger the combined constraint application
    applyVideoTrackConstraints();
  };

  // New frame rate slider handler
  const handleFrameRateChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newIndex = parseInt(event.target.value, 10);
    setCurrentFrameRateIndex(newIndex);
    // Trigger the combined constraint application
    applyVideoTrackConstraints();
  };
  // ---------------------------------

  // Get user media - Now uses the current resolution AND frame rate state
  const getMedia = useCallback(async (audio = true, video = true): Promise<MediaStream> => {
    setError(null);
    try {
      console.log(`Requesting local media... Audio: ${audio}, Video: ${video}`);
      localStream?.getTracks().forEach(track => track.stop());

      const constraints: MediaStreamConstraints = {};
      if (audio) {
          constraints.audio = true; // Or add specific audio constraints
      }
      if (video) {
          const selectedPreset = RESOLUTION_PRESETS[currentResolutionIndex];
          const selectedFps = FRAME_RATE_PRESETS[currentFrameRateIndex];
          constraints.video = {
              width: { ideal: selectedPreset.width },
              height: { ideal: selectedPreset.height },
              frameRate: { ideal: selectedFps } // Add default frameRate
          };
          console.log('Using initial video constraints:', constraints.video);
      }

      if (!audio && !video) {
        setLocalStream(null);
        console.log('Cleared local media as audio and video are false.');
        throw new Error("Cannot get media with audio and video both false.");
      }

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      console.log('Local media obtained:', stream.id);
      setLocalStream(stream);
      return stream;
    } catch (err) {
      console.error('Failed to get local stream:', err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      const userFriendlyError = `Failed to get camera/microphone: ${errorMessage}. Please check permissions and device support for resolution.`;
      setError(userFriendlyError);
      setLocalStream(null);
      throw new Error(userFriendlyError);
    }
  // Add currentFrameRateIndex dependency
  // Add currentVideoDeviceId dependency
  }, [localStream, currentResolutionIndex, currentFrameRateIndex, currentVideoDeviceId]);

  // Set default userId on component mount (client-side only)
  useEffect(() => {
    if (typeof window !== 'undefined' && !userId) {
        setUserId(`user_${Math.random().toString(36).substring(2, 9)}`);
    }

    // The stream cleanup is handled by getMedia (for replacements)
    // and handleLeaveRoom (for explicit leaves / unmount).
    // This effect should only focus on setting the userId on mount.
    // Remove the problematic cleanup function and localStream dependency.

    // No return statement needed here unless there's specific non-stream cleanup.

  }, [userId]); // Remove localStream from dependencies

  // --- Effect to Enumerate Devices and Set Initial Camera ---
  useEffect(() => {
    if (!localStream || typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) {
      return; // Need stream and API support
    }

    const enumerateAndSet = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoInputs = devices.filter(device => device.kind === 'videoinput');
        
        console.log('Available video input devices:', videoInputs);
        setVideoDevices(videoInputs);

        if (videoInputs.length > 1) {
          setHasMultipleCameras(true);
          console.log('Multiple cameras detected.');
        } else {
          setHasMultipleCameras(false);
          console.log('Single or no camera detected.');
        }

        // Set the current device ID based on the existing stream
        const currentTrack = localStream.getVideoTracks()[0];
        if (currentTrack) {
          const currentSettings = currentTrack.getSettings();
          if (currentSettings.deviceId && !currentVideoDeviceId) { // Set only if not already set
            console.log('Setting initial camera device ID:', currentSettings.deviceId);
            setCurrentVideoDeviceId(currentSettings.deviceId);
          } else if (!currentSettings.deviceId) {
            console.warn('Could not get device ID from initial stream track.');
          }
        } else {
           console.warn('No video track found in initial stream to set device ID.');
        }

      } catch (err) {
        console.error('Error enumerating devices:', err);
        setHasMultipleCameras(false); // Assume single camera on error
      }
    };

    enumerateAndSet();
  // Run only when localStream is initially set or potentially changes significantly
  // Do NOT include currentVideoDeviceId here to avoid loops
  }, [localStream]); 

  // --- Effect to re-acquire media when camera device changes ---
  useEffect(() => {
    // Only run if the device ID changes *after* the initial stream is set
    // and the user is considered "in" the call (localStream exists).
    if (currentVideoDeviceId && localStream && hasMultipleCameras) {
      // Check if the stream's current device ID matches the selected one.
      // If they don't match, it means we need to get the new stream.
      const currentTrackDeviceId = localStream.getVideoTracks()[0]?.getSettings().deviceId;
      if (currentTrackDeviceId && currentTrackDeviceId !== currentVideoDeviceId) {
        console.log(`Current video device ID (${currentVideoDeviceId}) differs from stream's track (${currentTrackDeviceId}). Re-acquiring media.`);
        getMedia().catch(err => {
            console.error("Error getting media after device switch:", err);
            // Handle potential error, maybe revert device ID or show toast
        });
      }
    }
    // Depend only on currentVideoDeviceId and whether we *have* a stream and multiple cameras
  }, [currentVideoDeviceId, localStream, hasMultipleCameras, getMedia]);

  // --- Refactored Join Logic ---
  const initiateJoin = useCallback(async (targetRoomId: string) => {
    if (!targetRoomId.trim()) {
      setError('Room ID cannot be empty.');
      return;
    }
    // Simplified check: If not OPEN, just show message, button disabled state handles prevention
    // if (webSocketState !== 'OPEN') {
    //   setError('Cannot join room: Not connected to signaling server.');
    //   return;
    // }
    if (isJoining || isJoined) {
      console.warn('Already joining or joined.');
      return;
    }

    setError(null);
    setIsJoining(true); // Indicate joining process started

    // Ensure userId is set (it should be by useEffect, but double-check)
    let currentUserId = userId;
    if (!currentUserId) {
        currentUserId = `user_${Math.random().toString(36).substring(2, 9)}`;
        setUserId(currentUserId);
        console.log("Generated userId on demand:", currentUserId);
    }

    try {
      console.log('Attempting to get media before joining...');
      const stream = await getMedia(); // Await media access

      if (!stream) {
        // This case should be handled by getMedia throwing an error
         throw new Error('Media stream not available after request.');
      }

      // Set the roomId state just before joining (important for UI consistency if joining existing)
      setRoomId(targetRoomId);

      console.log(`Media acquired, calling rtcJoinRoom for room: ${targetRoomId}, user: ${currentUserId}`);
      rtcJoinRoom({ roomId: targetRoomId, userId: currentUserId });
      // isJoining will be set to false by the useEffect watching isJoined

    } catch (err) {
      console.error(`Failed to join room ${targetRoomId}:`, err);
       // Error should be set within getMedia, but set a fallback
       if (!error) {
           const errorMessage = err instanceof Error ? err.message : String(err);
           // Use the error state for user feedback
           setError(`Failed to join room: ${errorMessage}. Check permissions?`);
       }
      setIsJoining(false); // Stop joining attempt on error
      setIsCreatingRoom(false); // Reset creation state if it was a new meeting
    }
  // Added missing dependencies like setError, error
  }, [userId, webSocketState, isJoining, isJoined, getMedia, rtcJoinRoom, setRoomId, setError, error, setUserId /* Added setUserId */]);

  // --- New Meeting Handler ---
  const handleNewMeeting = useCallback(async () => {
     // Check websocket state *before* proceeding
     if (webSocketState !== 'OPEN') {
         setError("Cannot start meeting: Connection issue. Please wait.");
         console.warn("New meeting blocked: WebSocket not open.");
         return;
     }
    if (isJoining || isCreatingRoom) return; // Prevent double clicks

    setIsCreatingRoom(true); // Indicate creation process started
    setIsJoining(true); // Also set isJoining true immediately for consistent UI disabling
    const newRoomId = uuidv4().substring(0, 8); // Generate a random room ID
    console.log(`Generated new Room ID: ${newRoomId}`);
    await initiateJoin(newRoomId);
    // On failure, states are reset in initiateJoin's catch block
    // On success, isJoining becomes false via useEffect hook, setIsCreatingRoom(false) might be needed if initiateJoin succeeds but isJoined takes time? Let's reset it for safety if initiateJoin returns successfully (although it doesn't return anything now)
    // Let's rely on the flow: initiateJoin sets isJoining. useEffect sets it false when isJoined becomes true. We only need to reset isCreatingRoom on failure.
  }, [webSocketState, isJoining, isCreatingRoom, initiateJoin, setError /* Added setError */]);

  // --- Join Existing Room Handler (using roomId from state) ---
  const handleJoinExistingRoom = useCallback(async () => {
     // Check websocket state *before* proceeding
     if (webSocketState !== 'OPEN') {
         setError("Cannot join meeting: Connection issue. Please wait.");
         console.warn("Join meeting blocked: WebSocket not open.");
         return;
     }
    if (isJoining || !roomId.trim()) return; // Prevent joining if already joining or no room ID
    // No need for isCreatingRoom check here
    await initiateJoin(roomId);
  }, [webSocketState, isJoining, roomId, initiateJoin, setError /* Added setError */]);

  // Remove the separate proceedToJoin function, logic is now in handleJoinRoom
  // const proceedToJoin = () => { ... };

  const handleLeaveRoom = () => {
    rtcLeaveRoom();
    setIsJoining(false); // Reset joining state
    setRemoteStreams(new Map()); // Clear remote streams on leave
    // Reset mute/video state visually on leave
    setIsMicMuted(false);
    setIsVideoStopped(false);
    // Optionally stop local stream tracks on leave
    localStream?.getTracks().forEach(track => track.stop());
    setLocalStream(null); // Clear local stream state
    setShowLogs(false); // Hide logs on leaving room
  };
  
  // Update joining status based on hook state
  useEffect(() => {
    if(isJoined) {
      setIsJoining(false);
    }
  }, [isJoined]);

  // Toggle Mic
  const toggleMic = useCallback(() => {
    if (localStream) {
        let muted = false;
        localStream.getAudioTracks().forEach(track => {
            track.enabled = !track.enabled;
            muted = !track.enabled; // Update based on the new state
        });
        setIsMicMuted(muted);
        // No need to create a new stream object just for state update
        // setLocalStream(new MediaStream(localStream.getTracks()));
    }
  }, [localStream]);

  // Toggle Video
  const toggleVideo = useCallback(() => {
    if (localStream) {
        let stopped = false;
        localStream.getVideoTracks().forEach(track => {
            track.enabled = !track.enabled;
            stopped = !track.enabled; // Update based on the new state
        });
        setIsVideoStopped(stopped);
        // No need to create a new stream object just for state update
        // setLocalStream(new MediaStream(localStream.getTracks()));
    }
  }, [localStream]);

  // --- Switch Camera Function ---
  const switchCamera = useCallback(() => {
    if (!hasMultipleCameras || videoDevices.length < 2) {
      console.warn('Camera switch called with insufficient devices.');
      return;
    }

    const currentDeviceIndex = videoDevices.findIndex(device => device.deviceId === currentVideoDeviceId);
    const nextDeviceIndex = (currentDeviceIndex + 1) % videoDevices.length;
    const nextDeviceId = videoDevices[nextDeviceIndex]?.deviceId;

    if (nextDeviceId && nextDeviceId !== currentVideoDeviceId) {
      console.log(`Switching camera to device ID: ${nextDeviceId}`);
      setCurrentVideoDeviceId(nextDeviceId); // This state change triggers the useEffect above
    } else {
      console.warn('Could not determine next camera device ID or ID is the same.');
    }
  }, [hasMultipleCameras, videoDevices, currentVideoDeviceId]);
  // --------------------------

  // Function to get and log WebRTC stats
  const logPeerStats = useCallback(async () => {
    if (!isJoined || peers.size === 0) {
      addLog('warn', 'Cannot get stats: Not in a room or no peers connected.');
      setCallStats(null); // Clear stats if not joined or no peers
      return;
    }

    addLog('log', '--- Fetching WebRTC Stats ---');

    // Initialize aggregators outside the loop
    let totalAggregatedSent = 0;
    let totalAggregatedReceived = 0;
    let totalAggregatedBitrate = 0;
    let totalAggregatedPacketLoss = 0;
    let peerCount = 0; // To average packet loss later

    for (const [peerId, peerData] of peers.entries()) {
      if (peerData.peer) {
        try {
          const pc = (peerData.peer as PeerInstance & { _pc: RTCPeerConnection })._pc;
          const stats = await pc.getStats();

          // Use unique names for variables within this peer's scope
          let currentPeerBytesSent = 0;
          let currentPeerBytesReceived = 0;
          let currentPeerBitrate = 0;
          let currentPeerAvailableBitrate = 0;
          let currentPeerPacketLoss = 0;

          stats.forEach(report => {
            // Track cumulative bytes for this peer
            if (report.type === 'outbound-rtp') {
              currentPeerBytesSent += report.bytesSent || 0;
            }
            if (report.type === 'inbound-rtp') {
              currentPeerBytesReceived += report.bytesReceived || 0;
            }

            // Track connection quality for this peer
            if (report.type === 'candidate-pair' && report.nominated) {
              currentPeerBitrate = report.availableOutgoingBitrate || 0;
              currentPeerAvailableBitrate = report.availableIncomingBitrate || 0;
              currentPeerPacketLoss = report.requestsReceived && report.responsesReceived ?
                ((report.requestsReceived - report.responsesReceived) / report.requestsReceived) * 100 : 0;
            }
          });

          // Convert units for this peer
          const sentMB = currentPeerBytesSent / (1024 * 1024);
          const receivedMB = currentPeerBytesReceived / (1024 * 1024);
          const currentMbps = currentPeerBitrate / 1e6; // This is fine as a const per peer calculation
          const availableMbps = currentPeerAvailableBitrate / 1e6;

          addLog('log', `Peer ${peerId.substring(0, 6)}:
  Total Sent: ${sentMB.toFixed(2)} MB
  Total Received: ${receivedMB.toFixed(2)} MB
  Current Bitrate: ${currentMbps.toFixed(2)} Mbps
  Available Bitrate: ${availableMbps.toFixed(2)} Mbps
  Packet Loss: ${currentPeerPacketLoss.toFixed(2)}%`);

          // Aggregate stats from this peer
          totalAggregatedSent += sentMB;
          totalAggregatedReceived += receivedMB;
          totalAggregatedBitrate += currentMbps; // Summing bitrates across peers
          totalAggregatedPacketLoss += currentPeerPacketLoss;
          peerCount++;

        } catch (error) {
          addLog('error', `Failed to get stats for peer ${peerId}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }

    addLog('log', '--- Finished Fetching Stats ---');

    // Calculate average packet loss if there are peers
    const avgPacketLoss = peerCount > 0 ? totalAggregatedPacketLoss / peerCount : 0;

    // Set the aggregated stats state *after* the loop finishes
    setCallStats({
      totalSent: totalAggregatedSent.toFixed(2) + ' MB',
      totalReceived: totalAggregatedReceived.toFixed(2) + ' MB',
      // Displaying the sum of bitrates. Could be changed to average if preferred.
      currentBitrate: totalAggregatedBitrate.toFixed(2) + ' Mbps', 
      packetLoss: avgPacketLoss.toFixed(2) + '%' // Displaying average packet loss
    });

  }, [peers, isJoined, addLog, setCallStats]); // Ensure setCallStats is in the dependency array

  // LogWindow component definition moved inside Home
  const LogWindow = ({
    logs: currentLogs, // Renamed prop to avoid conflict with state variable
    onClose,
    onGetStats,
  }: {
    logs: { type: 'log' | 'error' | 'warn', message: string, timestamp: number }[];
    onClose: () => void;
    onGetStats: () => void;
  }) => {
    const logContentRef = useRef<HTMLDivElement>(null);

    // Scroll to bottom when logs update
    useEffect(() => {
      if (logContentRef.current) {
        logContentRef.current.scrollTop = logContentRef.current.scrollHeight;
      }
    }, [currentLogs]); // Depend on the passed prop

    const formatTimestamp = (timestamp: number) => {
      const date = new Date(timestamp);
      return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}.${date.getMilliseconds().toString().padStart(3, '0')}`;
    };

    return (
      // Updated Log Window Styling
      <div className="log-window bg-gray-800 border border-gray-700 rounded-lg shadow-lg mt-4 text-gray-300"> 
        <div className="log-header flex justify-between items-center p-2 border-b border-gray-700">
          <h3 className="text-base font-semibold text-gray-100 ml-2">Console Logs & Stats</h3>
          <div className="flex items-center gap-1">
             <button 
                onClick={onGetStats} 
                className="p-1.5 rounded-full text-gray-400 hover:bg-gray-700/50 hover:text-emerald-400 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 focus:ring-offset-gray-800 transition-colors" 
                title="Fetch WebRTC Stats"
             >
                <BarChartHorizontal size={18} />
             </button>
             <button 
                onClick={onClose} 
                className="p-1.5 rounded-full text-gray-400 hover:bg-gray-700/50 hover:text-red-400 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 focus:ring-offset-gray-800 transition-colors" 
                title="Close Logs"
             >
                <X size={18} />
             </button>
          </div>
        </div>
        <div className="log-content p-3 text-xs max-h-48 overflow-y-auto font-mono" ref={logContentRef}>
          {currentLogs.length === 0 ? (
            <p className="no-logs text-gray-500 italic">No logs yet. Join a room and click Get Stats.</p>
          ) : (
            currentLogs.map((log, index) => (
              // Updated Log Entry Styling
              <div key={index} className={`log-entry flex gap-2 mb-0.5`}>
                <span className="log-timestamp text-gray-500 flex-shrink-0">{formatTimestamp(log.timestamp)}</span>
                <span className={`log-message ${
                  log.type === 'error' ? 'text-red-400' : log.type === 'warn' ? 'text-yellow-400' : 'text-gray-300'
                }`}>{log.message}</span>
              </div>
            ))
          )}
        </div>
      </div>
    );
  };

  // Calculate grid layout based on number of participants
  const participantCount = remoteStreams.size + 1; // +1 for local video
  let gridCols = 'grid-cols-1';
  let gridRows = 'grid-rows-1';
  let videoHeight = 'h-full';
  const localVideoSpan = 'col-span-1 row-span-1';

  if (participantCount === 2) {
    gridCols = 'grid-cols-2';
    gridRows = 'grid-rows-1';
    videoHeight = 'h-[calc(50vh-2rem)] md:h-[calc(100vh-4rem)]'; // Adjust based on controls height
  } else if (participantCount === 3 || participantCount === 4) {
    gridCols = 'grid-cols-2';
    gridRows = 'grid-rows-2';
    videoHeight = 'h-[calc(50vh-2rem)]';
  } else if (participantCount > 4) {
    // Handle more participants (e.g., larger grid or different layout)
    // For simplicity, cap at 2x2 for now, subsequent videos might overflow or need scrolling
    gridCols = 'grid-cols-3'; // Example for 5+
    gridRows = 'grid-rows-auto';
    videoHeight = 'h-[calc(33vh-1.5rem)]';
  }
  // Simple case for single user
  if (participantCount === 1) {
      videoHeight = 'h-[calc(100vh-4rem)]';
  }

  const isLoading = isJoining || isCreatingRoom; // Combined loading state
  const isConnecting = webSocketState !== 'OPEN' && webSocketState !== 'CLOSED'; // WebSocket trying to connect

  // --- Effect to show errors as toasts --- 
  useEffect(() => {
    if (error) {
      toast.error(error, { toastId: `error-${error.substring(0, 20)}` }); // Add toastId to prevent duplicates on re-renders
      // Clear the error state after showing the toast so it doesn't re-trigger
      // if the component re-renders for other reasons.
      setError(null);
    }
  }, [error]); // Dependency array ensures this runs only when error state changes

  // --- Effect to show specific WebSocket connection failure toast --- 
  useEffect(() => {
    // Check for transition *to* CLOSED state specifically when not already joined/joining
    if (
      previousWebSocketStateRef.current !== 'CLOSED' &&
      webSocketState === 'CLOSED' &&
      !isJoining &&
      !isCreatingRoom &&
      !isJoined
    ) {
      // Use a specific toastId to prevent duplicates if state changes rapidly
      toast.error("Connection failed. Please check internet or try again.", { toastId: 'ws-conn-failed' }); 
    }
    // Update the ref *after* the check
    previousWebSocketStateRef.current = webSocketState;
  }, [webSocketState, isJoining, isCreatingRoom, isJoined]); // Rerun when these states change

  return (
    // Apply dark theme universally when not joined
    <div className={`min-h-screen flex flex-col ${!isJoined ? 'bg-gray-950 text-gray-200' : 'bg-gray-900 text-gray-200'}`}> 
      {/* Toast Container added here - configure appearance */}
      <ToastContainer
        position="bottom-right"
        autoClose={5000} // Close after 5 seconds
        hideProgressBar={false}
        newestOnTop={false}
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
        theme="dark" // Use dark theme to match UI
      />

      {/* <header> block removed */}

      {/* Use main tag consistently */}
      <main className="flex-grow p-4 flex flex-col">
        {/* Error display div removed - handled by toast notifications */}
        {/* {error && (
          <div
            className={`border px-4 py-3 rounded relative mb-4 shadow-lg ${!isJoined ? 'bg-red-900/30 border-red-700 text-red-300' : 'bg-red-800 border-red-600 text-red-100'}`}
            role="alert"
          >
            <strong className="font-bold">Error: </strong>
            <span className="block sm:inline">{error}</span>
            <button
              onClick={() => setError(null)}
              className="absolute top-0 bottom-0 right-0 px-4 py-3 text-red-100 hover:text-white"
              aria-label="Close"
            >
              &times;
            </button>
          </div>
        )} */}

        {!isJoined ? (
          // --- Dark Theme Join UI ---
          <div className="flex-grow flex flex-col items-center justify-center text-center px-4">
            {/* Title */}
            <h1 className="text-4xl sm:text-5xl text-gray-100 font-semibold mb-3"> {/* Light text, changed font-normal to font-semibold */}
              Connect with friends, instantly.
            </h1>
            {/* Subtitle */}
            <p className="text-base sm:text-lg text-gray-400 mb-10 sm:mb-12 max-w-xl"> {/* Lighter secondary text */}
              Simple, secure P2P video calls powered by WebRTC. No servers involved in media transmission.
            </p>

            {/* Actions Container */}
            <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-4">
              {/* New Meeting Button (Dark Theme) */}
              <button
                onClick={handleNewMeeting}
                disabled={isConnecting || isLoading}
                className={`flex items-center justify-center gap-2 px-5 py-3 rounded-full font-semibold transition-all duration-200 ease-in-out transform border focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 focus:ring-offset-gray-950 ${ /* Changed rounded-md to rounded-full */
                  isConnecting || isLoading
                    ? 'bg-gray-700 border-gray-600 text-gray-500 cursor-not-allowed' // Dark disabled state
                    : 'bg-gray-900 border-emerald-600 text-emerald-400 hover:bg-emerald-900/40 hover:text-emerald-300 hover:border-emerald-500 active:scale-95' // Dark theme button styles
                }`}
              >
                <Video size={20} /> {/* Icon color inherited via text */}
                {isCreatingRoom ? 'Starting...' : 'New meeting'}
              </button>

              {/* Join Existing Meeting Input Group (Dark Theme) */}
              <div className="flex items-center w-full sm:w-auto">
                <div className="relative flex-grow">
                   <span className="absolute inset-y-0 left-0 flex items-center pl-3">
                      {/* Icon color matches placeholder */}
                      <Keyboard size={20} className="text-gray-500" /> 
                    </span>
                    <input
                      type="text"
                      placeholder="Enter a code"
                      value={roomId}
                      onChange={(e) => setRoomId(e.target.value.trim().toLowerCase())}
                       // Dark theme input styles
                      className="w-full sm:w-64 pl-10 pr-4 py-3 border border-gray-700 rounded-xl bg-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-gray-100 placeholder-gray-500 transition duration-150 ease-in-out" // Changed rounded-md to rounded-xl
                      disabled={isConnecting || isLoading}
                      onKeyDown={(e) => { if (e.key === 'Enter' && roomId.trim()) handleJoinExistingRoom(); }}
                    />
                </div>
                {/* Separate Join button (Dark Theme) */}
                 <button
                    onClick={handleJoinExistingRoom}
                    disabled={!roomId.trim() || isConnecting || isLoading}
                     // Dark theme secondary button, changed font-medium to font-semibold
                    className={`ml-2 px-4 py-3 rounded-full font-semibold transition-colors duration-200 ease-in-out active:scale-95 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 focus:ring-offset-gray-950 ${ /* Changed rounded-md to rounded-full */
                      !roomId.trim() || isConnecting || isLoading
                        ? 'text-gray-600 cursor-not-allowed' // Dark disabled
                        : 'text-emerald-500 hover:bg-emerald-500/10 hover:text-emerald-400' // Dark hover
                    } sm:ml-3`}
                 >
                    Join
                 </button>
              </div>
            </div>

             {/* Loading/Connecting Indicator (Dark Theme) */}
             {(isLoading || isConnecting) && (
               <p className="mt-6 text-sm text-gray-400 animate-pulse"> {/* Adjusted text color */}
                 {isCreatingRoom ? 'Starting your meeting...' : (isJoining ? 'Joining meeting...' : 'Connecting to service...')}
               </p>
             )}
            {/* WebSocket connection error <p> tag removed - handled by toast */}
            {/* {webSocketState === 'CLOSED' && !error && !isJoining && (
                 <p className="mt-6 text-sm text-red-500/80"> 
                     Connection failed. Please check your internet or try again later.
                 </p>
             )} */}

          </div>
          // --- End Dark Theme Join UI ---
        ) : (
          // --- In Call UI (Original Dark Theme) ---
          <div className="flex-grow flex flex-col bg-gray-900"> 
            {/* --- Video Grid --- */}
            <div className={`flex-grow grid gap-4 ${gridCols} ${gridRows} content-start overflow-hidden mb-4 p-4`}>
              {/* Local Video */}
              <div className={`relative bg-black rounded-lg overflow-hidden shadow-lg ${localVideoSpan} ${videoHeight}`}>
                <VideoPlayer stream={localStream} muted={true} className="w-full h-full transform -scale-x-100" />
                <div className="absolute bottom-2 left-2 bg-black bg-opacity-50 text-white text-xs px-2 py-1 rounded"> 
                  {userId} (You){isMicMuted ? ' [MIC MUTED]' : ''}{isVideoStopped ? ' [CAM OFF]' : ''}
                </div>
              </div>

              {/* Remote Videos */}
              {Array.from(remoteStreams.entries()).map(([peerId, stream]) => (
                <div key={peerId} className={`relative bg-black rounded-lg overflow-hidden shadow-lg ${videoHeight}`}>
                  <VideoPlayer stream={stream} className="w-full h-full" />
                  <div className="absolute bottom-2 left-2 bg-black bg-opacity-50 text-white text-xs px-2 py-1 rounded">
                    {peerId}
                  </div>
                </div>
              ))}
            </div>

            {/* --- Controls --- */}
            <div className="bg-gray-800 p-3 border-t border-gray-700 rounded-t-lg shadow-md flex flex-wrap items-center justify-center gap-3"> 
              
              {/* Mute/Unmute Mic Button */}
              <button
                onClick={toggleMic}
                title={isMicMuted ? 'Unmute Microphone' : 'Mute Microphone'}
                // Updated Button Styling: rounded-full, focus ring offset, padding, icons
                // Conditional styles based on isMicMuted (primary border style when muted, secondary text style when not)
                className={`flex items-center justify-center gap-2 px-4 py-2 rounded-full font-semibold transition-all duration-200 ease-in-out transform active:scale-95 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 focus:ring-offset-gray-800 ${
                  isMicMuted 
                    ? 'border border-emerald-600 text-emerald-400 hover:bg-emerald-900/40 hover:text-emerald-300 hover:border-emerald-500' 
                    : 'text-emerald-500 hover:bg-emerald-500/10 hover:text-emerald-400'
                }`}
              >
                {isMicMuted ? <MicOff size={18} /> : <Mic size={18} />}
                {/* Text hidden on smaller screens, shown on md+ */}
                <span className="hidden sm:inline">{isMicMuted ? 'Unmute' : 'Mute'}</span> 
              </button>

              {/* Stop/Start Video Button */}
              <button
                onClick={toggleVideo}
                title={isVideoStopped ? 'Start Video' : 'Stop Video'}
                // Updated Button Styling: rounded-full, focus ring offset, padding, icons
                // Conditional styles based on isVideoStopped (primary border style when stopped, secondary text style when running)
                className={`flex items-center justify-center gap-2 px-4 py-2 rounded-full font-semibold transition-all duration-200 ease-in-out transform active:scale-95 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 focus:ring-offset-gray-800 ${
                  isVideoStopped 
                    ? 'border border-emerald-600 text-emerald-400 hover:bg-emerald-900/40 hover:text-emerald-300 hover:border-emerald-500' 
                    : 'text-emerald-500 hover:bg-emerald-500/10 hover:text-emerald-400'
                }`}
              >
                {isVideoStopped ? <VideoOff size={18} /> : <Video size={18} />}
                 {/* Text hidden on smaller screens, shown on md+ */}
                 <span className="hidden sm:inline">{isVideoStopped ? 'Video On' : 'Video Off'}</span>
              </button>
              
              {/* Show/Hide Logs Button */}
              <button
                onClick={() => setShowLogs(!showLogs)}
                title={showLogs ? 'Hide Logs' : 'Show Logs'}
                 // Updated Button Styling: Neutral secondary style
                className="flex items-center justify-center gap-2 px-4 py-2 rounded-full font-semibold transition-all duration-200 ease-in-out transform active:scale-95 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 focus:ring-offset-gray-800 text-gray-400 hover:bg-gray-700/50 hover:text-gray-300"
              >
                <ListFilter size={18} />
                {/* Text hidden on smaller screens, shown on md+ */}
                <span className="hidden sm:inline">{showLogs ? 'Hide Logs' : 'Show Logs'}</span>
              </button>

              {/* --- Camera Switch Button (Conditional) --- */}
              {hasMultipleCameras && (
                <button
                  onClick={switchCamera}
                  title="Switch Camera"
                  // Style similar to Logs button (neutral secondary)
                  className="flex items-center justify-center gap-2 px-4 py-2 rounded-full font-semibold transition-all duration-200 ease-in-out transform active:scale-95 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 focus:ring-offset-gray-800 text-gray-400 hover:bg-gray-700/50 hover:text-gray-300"
                >
                  <RefreshCw size={18} />
                  <span className="hidden sm:inline">Switch Cam</span>
                </button>
              )}
              {/* --------------------------------------- */}

              {/* Leave Room Button */}
              <button
                onClick={handleLeaveRoom}
                title="Leave Room"
                // Updated Button Styling: Red accent, primary button style
                className="flex items-center justify-center gap-2 px-4 py-2 rounded-full font-semibold transition-all duration-200 ease-in-out transform active:scale-95 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 focus:ring-offset-gray-800 border border-red-600 text-red-400 hover:bg-red-900/40 hover:text-red-300 hover:border-red-500"
              >
                <LogOut size={18} />
                 {/* Text hidden on smaller screens, shown on md+ */}
                 <span className="hidden sm:inline">Leave</span>
              </button>

              {/* --- Bitrate Slider Control --- */}
              <div className="flex items-center gap-2 text-sm text-gray-400"> 
                <label htmlFor="bitrateSlider" className="whitespace-nowrap">Bitrate:</label>
                <input
                  type="range"
                  id="bitrateSlider"
                  min={MIN_BITRATE_KBPS}
                  max={MAX_BITRATE_KBPS}
                  value={targetBitrateKbps}
                  onChange={handleBitrateChange}
                  className="w-24 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                  aria-label="Maximum video bitrate"
                />
                <span className="w-16 text-right font-mono text-gray-300">{targetBitrateKbps} kbps</span>
              </div>
              {/* ----------------------------- */}

              {/* --- Resolution Slider Control --- */}
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <label htmlFor="resolutionSlider" className="whitespace-nowrap">Res:</label>
                <input
                  type="range"
                  id="resolutionSlider"
                  min={0}
                  max={RESOLUTION_PRESETS.length - 1}
                  step={1}
                  value={currentResolutionIndex}
                  onChange={handleResolutionChange}
                  className="w-20 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-emerald-500" 
                  aria-label="Video resolution"
                />
                <span className="w-12 text-right font-mono text-gray-300">{RESOLUTION_PRESETS[currentResolutionIndex]?.label || 'N/A'}</span>
              </div>
              {/* ------------------------------ */}

              {/* --- Frame Rate Slider Control --- */}
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <label htmlFor="fpsSlider" className="whitespace-nowrap">FPS:</label>
                <input
                  type="range"
                  id="fpsSlider"
                  min={0}
                  max={FRAME_RATE_PRESETS.length - 1}
                  step={1}
                  value={currentFrameRateIndex}
                  onChange={handleFrameRateChange}
                  className="w-16 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-emerald-500" 
                  aria-label="Video frame rate"
                />
                <span className="w-10 text-right font-mono text-gray-300">{FRAME_RATE_PRESETS[currentFrameRateIndex]}</span>
              </div>
              {/* ------------------------------ */}

              {/* --- Call Stats Display --- */}
              {callStats && (
                <div className="text-xs text-gray-400 border-l border-gray-700 pl-3 ml-1 flex flex-col items-start">
                  <span>TX: {callStats.totalSent} | RX: {callStats.totalReceived}</span>
                  <span>Bitrate: {callStats.currentBitrate} | Loss: {callStats.packetLoss}</span>
                </div>
              )}
              {/* ------------------------- */}

            </div>

            {/* Log Window - Uses updated LogWindow component styles */} 
            {showLogs && (
              <div className="px-4 pb-4"> {/* Add padding around log window */}
                <LogWindow
                  logs={logs}
                  onClose={() => setShowLogs(false)}
                  onGetStats={logPeerStats}
                />
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
