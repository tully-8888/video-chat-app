'use client';

import React from 'react';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useDebouncedCallback } from 'use-debounce'; // Import debounce hook
import { useWebRTC } from './hooks/useWebRTC';
import type { Instance as PeerInstance } from 'simple-peer'; // Import PeerInstance type

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
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isVideoStopped, setIsVideoStopped] = useState(false);

  // --- Debugging State ---
  const [logs, setLogs] = useState<{ type: 'log' | 'error' | 'warn', message: string, timestamp: number }[]>([]);
  const [showLogs, setShowLogs] = useState(false); // State to control log window visibility
  // -----------------------

  // New state for call statistics
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
  }, [localStream, currentResolutionIndex, currentFrameRateIndex]);

  // Set default userId on component mount (client-side only)
  useEffect(() => {
    if (typeof window !== 'undefined' && !userId) {
        setUserId(`user_${Math.random().toString(36).substring(2, 9)}`);
    }
    // NO LONGER CALLS getMedia here

    // Cleanup function: stop tracks if component unmounts unexpectedly
    // Use a ref to the stream for reliable cleanup
    const streamRef = { current: localStream }; 
    return () => {
      console.log('Cleaning up local stream on unmount/re-render');
      streamRef.current?.getTracks().forEach(track => track.stop());
    }
  // localStream dependency ensures ref is updated if stream changes
  // userId dependency ensures effect runs if userId changes externally
  }, [userId, localStream]); 

  const handleJoinRoom = async () => { // Make async
    if (!roomId.trim() || !userId.trim()) {
      setError('Please enter both Room ID and User ID.');
      return;
    }
    if (webSocketState !== 'OPEN') {
      setError('Cannot join room: Not connected to signaling server.');
      return;
    }
    if (isJoining || isJoined) {
      console.warn('Already joining or joined.');
      return;
    }

    setError(null);
    setIsJoining(true); 

    try {
        console.log('Attempting to get media before joining...');
        const stream = await getMedia(); // Await media access HERE
        
        if (!stream) { 
             // Should be caught by getMedia's throw, but double-check
             throw new Error('Media stream not available after request.');
        }

        // If media acquired, proceed to join
        console.log(`Media acquired, calling rtcJoinRoom for room: ${roomId}, user: ${userId}`);
        // Call the join function from the hook, passing roomId and userId
        // The hook uses the `localStream` state variable which `getMedia` updated.
        rtcJoinRoom({ roomId, userId });
        // `isJoined` state from the hook will eventually set isJoining to false

    } catch (err) {
        console.error('Failed to join room (likely media error):', err);
        // setError should have been set within getMedia
        if (!error) { // Set a generic error if getMedia didn't
             setError('Failed to join room. Could not access camera/microphone.');
        }
        setIsJoining(false); // Stop joining attempt on error
    }
  };

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
      <div className="log-window">
        <div className="log-header">
          <h3>Console Logs & Stats</h3>
          <button onClick={onGetStats} className="stats-button" title="Fetch WebRTC Stats">
            Get Stats
          </button>
          <button onClick={onClose} className="close-log-button" title="Close Logs">
            &times;
          </button>
        </div>
        <div className="log-content" ref={logContentRef}>
          {currentLogs.length === 0 ? (
            <p className="no-logs">No logs yet. Join a room and click Get Stats.</p>
          ) : (
            currentLogs.map((log, index) => (
              <div key={index} className={`log-entry log-${log.type}`}>
                <span className="log-timestamp">{formatTimestamp(log.timestamp)}</span>
                <span className={`log-message`}>{log.message}</span>
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

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col">
      <header className="bg-gray-800 p-4 shadow-md flex justify-between items-center">
        <h1 className="text-2xl font-bold">P2P Video Chat</h1>
        {isJoined && (
          <div className="text-sm text-gray-400">
            Room: {roomId} | User: {userId} | WS: {webSocketState}
          </div>
        )}
      </header>

      <main className="flex-grow p-4 flex flex-col">
        {error && (
          <div
            className="bg-red-800 border border-red-600 text-red-100 px-4 py-3 rounded relative mb-4 shadow-lg"
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
        )}

        {!isJoined ? (
          // --- Join Form ---
          <div className="flex-grow flex items-center justify-center">
            <div className="bg-gray-800 p-8 rounded-lg shadow-xl w-full max-w-md">
              <h2 className="text-xl mb-6 text-center">Join Room</h2>
              <input
                type="text"
                placeholder="Room ID"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value.trim())}
                className="w-full p-3 mb-4 bg-gray-700 rounded border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={isJoining}
              />
              <input
                type="text"
                placeholder="User ID (auto-generated if blank)"
                value={userId}
                onChange={(e) => setUserId(e.target.value.trim())}
                className="w-full p-3 mb-4 bg-gray-700 rounded border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={isJoining}
              />
              <button
                onClick={handleJoinRoom}
                disabled={!roomId.trim() || webSocketState !== 'OPEN' || isJoining}
                className={`w-full p-3 rounded font-semibold transition-colors duration-200 ${isJoining || webSocketState !== 'OPEN' || !roomId.trim()
                    ? 'bg-gray-600 cursor-not-allowed'
                    : 'bg-blue-600 hover:bg-blue-700'
                  }`}
              >
                {isJoining ? 'Joining...' : (webSocketState !== 'OPEN' ? `Connecting (${webSocketState})...` : 'Join Room')}
              </button>
            </div>
          </div>
        ) : (
          // --- In Call UI ---
          <div className="flex-grow flex flex-col">
            {/* --- Video Grid --- */}
            <div className={`flex-grow grid gap-4 ${gridCols} ${gridRows} content-start overflow-hidden mb-4`}>
              {/* Local Video */}
              <div className={`relative bg-black rounded-lg overflow-hidden shadow-lg ${localVideoSpan} ${videoHeight}`}>
                <VideoPlayer stream={localStream} muted={true} className="w-full h-full" />
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
            <div className="bg-gray-800 p-3 rounded-lg shadow-md flex flex-wrap items-center justify-center gap-x-4 gap-y-2"> {/* Adjusted gap */}
              {/* Mute/Unmute Mic */}
              <button
                onClick={toggleMic}
                className={`px-4 py-2 rounded font-semibold transition-colors duration-200 ${isMicMuted ? 'bg-yellow-600 hover:bg-yellow-700' : 'bg-gray-600 hover:bg-gray-700'}`}
              >
                {isMicMuted ? 'Unmute Mic' : 'Mute Mic'}
              </button>

              {/* Stop/Start Video */}
              <button
                onClick={toggleVideo}
                className={`px-4 py-2 rounded font-semibold transition-colors duration-200 ${isVideoStopped ? 'bg-yellow-600 hover:bg-yellow-700' : 'bg-gray-600 hover:bg-gray-700'}`}
              >
                {isVideoStopped ? 'Start Video' : 'Stop Video'}
              </button>

              {/* Leave Room */}
              <button
                onClick={handleLeaveRoom}
                className="px-4 py-2 rounded bg-red-600 hover:bg-red-700 font-semibold transition-colors duration-200"
              >
                Leave Room
              </button>

              {/* Show/Hide Logs */}
              <button
                onClick={() => setShowLogs(!showLogs)}
                className="px-4 py-2 rounded bg-purple-600 hover:bg-purple-700 font-semibold transition-colors duration-200"
              >
                {showLogs ? 'Hide Logs' : 'Show Logs'}
              </button>

              {/* --- Bitrate Slider Control --- */}
              <div className="flex items-center gap-2 text-sm">
                <label htmlFor="bitrateSlider" className="whitespace-nowrap">Max Bitrate:</label>
                <input
                  type="range"
                  id="bitrateSlider"
                  min={MIN_BITRATE_KBPS}
                  max={MAX_BITRATE_KBPS}
                  value={targetBitrateKbps}
                  onChange={handleBitrateChange}
                  className="w-32 h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-blue-500"
                  aria-label="Maximum video bitrate"
                />
                <span className="w-16 text-right font-mono">{targetBitrateKbps} kbps</span>
              </div>
              {/* ----------------------------- */}

              {/* --- Resolution Slider Control --- */}
              <div className="flex items-center gap-2 text-sm">
                <label htmlFor="resolutionSlider" className="whitespace-nowrap">Resolution:</label>
                <input
                  type="range"
                  id="resolutionSlider"
                  min={0}
                  max={RESOLUTION_PRESETS.length - 1}
                  step={1}
                  value={currentResolutionIndex}
                  onChange={handleResolutionChange}
                  className="w-24 h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-green-500"
                  aria-label="Video resolution"
                />
                <span className="w-12 text-right font-mono">{RESOLUTION_PRESETS[currentResolutionIndex]?.label || 'N/A'}</span>
              </div>
              {/* ------------------------------ */}

              {/* --- Frame Rate Slider Control --- */}
              <div className="flex items-center gap-2 text-sm">
                <label htmlFor="fpsSlider" className="whitespace-nowrap">FPS:</label>
                <input
                  type="range"
                  id="fpsSlider"
                  min={0}
                  max={FRAME_RATE_PRESETS.length - 1}
                  step={1}
                  value={currentFrameRateIndex}
                  onChange={handleFrameRateChange}
                  className="w-20 h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-red-500"
                  aria-label="Video frame rate"
                />
                <span className="w-10 text-right font-mono">{FRAME_RATE_PRESETS[currentFrameRateIndex]}</span>
              </div>
              {/* ------------------------------ */}

              {/* --- Call Stats Display --- */}
              {callStats && (
                <div className="text-xs text-gray-400 border-l border-gray-600 pl-3 ml-1 flex flex-col items-start">
                  <span>TX: {callStats.totalSent} | RX: {callStats.totalReceived}</span>
                  <span>Bitrate: {callStats.currentBitrate} | Loss: {callStats.packetLoss}</span>
                </div>
              )}
              {/* ------------------------- */}

            </div>

            {/* Log Window */} 
            {showLogs && (
              <LogWindow
                logs={logs}
                onClose={() => setShowLogs(false)}
                onGetStats={logPeerStats}
              />
            )}
          </div>
        )}
      </main>
    </div>
  );
}
