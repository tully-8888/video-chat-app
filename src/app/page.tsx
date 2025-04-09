'use client';

import React from 'react';
import { useState, useEffect, useCallback, useRef } from 'react';
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

const LogWindow = ({
  logs,
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
  }, [logs]);

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
        {logs.length === 0 ? (
          <p className="no-logs">No logs yet.</p>
        ) : (
          logs.map((log, index) => (
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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [logs, setLogs] = useState<{ type: 'log' | 'error' | 'warn', message: string, timestamp: number }[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  // -----------------------

  // Helper function to add logs
  const addLog = useCallback((type: 'log' | 'error' | 'warn', ...args: unknown[]) => {
    // Simple serialization for objects
    const message = args.map(arg => {
        try {
            if (arg instanceof Error) return arg.message;
            // Check for null explicitly before stringifying
            if (typeof arg === 'object' && arg !== null) return JSON.stringify(arg);
             // Handle primitive types directly
            if (typeof arg === 'string') return arg;
            if (typeof arg === 'number' || typeof arg === 'boolean' || typeof arg === 'undefined' || typeof arg === 'symbol' || typeof arg === 'bigint') return String(arg);
            // Handle null after the object check
            if (arg === null) return 'null';
             // Fallback for other types (like functions, though stringify might handle some)
             return typeof arg; // Or a more descriptive placeholder
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (_error) { // Use _error to explicitly ignore
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
    peers
  } = useWebRTC({
    localStream,
    onRemoteStream: handleRemoteStream,
    onPeerDisconnect: handlePeerDisconnect,
  });
  // -------------------------------------

  // Get user media - Now returns the stream or throws error
  const getMedia = useCallback(async (audio = true, video = true): Promise<MediaStream> => {
    setError(null);
    try {
      console.log(`Requesting local media... Audio: ${audio}, Video: ${video}`);
      // Stop existing tracks *before* getting new ones
      localStream?.getTracks().forEach(track => track.stop());

      const constraints = { audio, video };
      if (!audio && !video) {
          setLocalStream(null);
          console.log('Cleared local media as audio and video are false.');
          // Technically shouldn't happen in the join flow, but handle defensively
          throw new Error("Cannot get media with audio and video both false.");
      }

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      console.log('Local media obtained:', stream.id);
      setLocalStream(stream); // Set the state
      return stream; // Return the obtained stream
    } catch (err) {
      console.error('Failed to get local stream:', err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      const userFriendlyError = `Failed to get camera/microphone: ${errorMessage}. Please check permissions.`;
      setError(userFriendlyError);
      setLocalStream(null);
      throw new Error(userFriendlyError); // Re-throw to stop the join process
    }
  }, [localStream]); // Keep localStream dependency for cleanup

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

  // Determine layout state for easier conditional rendering
  const mainRemoteStreamEntry = remoteStreams.size > 0 ? [...remoteStreams.entries()][0] : null;
  // const mainRemotePeerId = mainRemoteStreamEntry ? mainRemoteStreamEntry[0] : null; // Removed as unused
  const mainRemoteStream = mainRemoteStreamEntry ? mainRemoteStreamEntry[1] : null;
  const otherRemoteStreams = remoteStreams.size > 1 ? [...remoteStreams.entries()].slice(1) : [];

  // Function to get and log WebRTC stats
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const logPeerStats = useCallback(async () => {
    if (!isJoined || peers.size === 0) {
        addLog('warn', 'Cannot get stats: Not in a room or no peers connected.');
        return;
    }

    addLog('log', '--- Fetching WebRTC Stats ---');
    for (const [peerId, peerData] of peers.entries()) {
        if (peerData.peer) {
            try {
                // Access the underlying RTCPeerConnection via _pc
                // Use type assertion carefully, acknowledging _pc is not officially typed
                const pc = (peerData.peer as PeerInstance & { _pc: RTCPeerConnection })._pc;
                if (!pc || typeof pc.getStats !== 'function') {
                     addLog('error', `Could not access getStats for peer ${peerId}`);
                     continue; // Skip this peer
                }

                // getStats is asynchronous and returns a Promise
                const statsReport: RTCStatsReport = await pc.getStats();
                addLog('log', `Stats for Peer: ${peerId.substring(0, 6)}...`);
                
                // Iterate over the report (RTCStatsReport is like a Map)
                statsReport.forEach(report => {
                    // We are interested in 'inbound-rtp' for received data
                    // and 'outbound-rtp' for sent data.
                    // Let's log relevant parts for now, parsing is complex.
                    if (report.type === 'inbound-rtp' && report.kind === 'video') {
                         addLog('log', `  Inbound Video (${report.id}): Jitter=${report.jitter?.toFixed(4)}, PacketsLost=${report.packetsLost}, BytesReceived=${report.bytesReceived}`);
                         if (report.trackIdentifier) {
                            const trackStats = statsReport.get(report.trackIdentifier);
                            if(trackStats) {
                                addLog('log', `    Track: JitterBufferDelay=${trackStats.jitterBufferDelay?.toFixed(4)}, FramesDecoded=${trackStats.framesDecoded}, FramesDropped=${trackStats.framesDropped}`);
                            }
                         }
                    } else if (report.type === 'outbound-rtp' && report.kind === 'video') {
                         addLog('log', `  Outbound Video (${report.id}): PacketsSent=${report.packetsSent}, BytesSent=${report.bytesSent}, NACKs=${report.nackCount}`);
                         if (report.trackIdentifier) {
                             const trackStats = statsReport.get(report.trackIdentifier);
                             if(trackStats) {
                                 addLog('log', `    Track: FramesEncoded=${trackStats.framesEncoded}, QP Sum=${trackStats.qpSum}`);
                             }
                         }
                    }
                    // Could also log candidate pairs (type: 'candidate-pair', state: 'succeeded') for round-trip time (currentRoundTripTime)
                    // report.type === 'candidate-pair' && report.state === 'succeeded' -> report.currentRoundTripTime
                });

            } catch (error) {
                addLog('error', `Failed to get stats for peer ${peerId}: ${error instanceof Error ? error.message : String(error)}`);
            }
        } else {
             addLog('warn', `Peer object not found for peerId ${peerId} when getting stats.`);
        }
    }
    addLog('log', '--- Finished Fetching Stats ---');

  }, [peers, isJoined, addLog]);

  return (
    <>
      <main className={`main-container ${isJoined ? 'in-call' : 'pre-join'}`}>
        {!isJoined ? (
          // --- Pre-Join Screen ---
          <div className="join-container">
            <h1 className="title">Video Chat</h1>
            <p className="subtitle">Enter details to join or start a room</p>

            {error && (
              <p className="error-message">
                <strong>Error:</strong> {error}
              </p>
            )}
            {/* REMOVED WebSocket status display
            <p className="ws-status">
              WebSocket: <span className={`status-${webSocketState.toLowerCase()}`}>{webSocketState}</span>
            </p>
            */}

            <div className="input-group">
              <input
                type="text"
                placeholder="Room ID"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                disabled={isJoining}
                className="input-field"
              />
              <input
                type="text"
                placeholder="Your User ID (e.g., Alice)"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                disabled={isJoining}
                className="input-field"
              />
            </div>
            <button
              onClick={handleJoinRoom}
              disabled={webSocketState !== 'OPEN' || isJoining || !roomId.trim() || !userId.trim()}
              className="join-button"
            >
              {isJoining ? 'Joining...' : 'Join Room'}
            </button>
            {webSocketState === 'CONNECTING' && <p className="status-text">Connecting to server...</p>}
            {webSocketState !== 'OPEN' && webSocketState !== 'CONNECTING' && <p className="status-text error">Cannot connect to signaling server.</p>}
            {/* Debug Toggle Button (Pre-Join) */}
            <button onClick={() => setShowLogs(prev => !prev)} className="debug-toggle-button pre-join-debug">
                 {showLogs ? 'Hide Logs' : 'Show Logs'}
            </button>
          </div>

        ) : (
          // --- In-Call Screen ---
          <div className="call-container">
              {/* Main Video Area (Handles full screen for primary remote/local) */}
              <div className="main-video-area">
                 {mainRemoteStream ? (
                    <VideoPlayer stream={mainRemoteStream} className="main-video" />
                 ) : (
                    <VideoPlayer stream={localStream} muted={true} className="main-video local-only local-preview" />
                 )}

                {/* Local Video (Picture-in-Picture when remote exists) */}
                {mainRemoteStream && (
                  <div className="local-pip-container">
                    <VideoPlayer stream={localStream} muted={true} className="local-pip-video local-preview" />
                  </div>
                )}
             </div>

             {/* Gallery for other remote videos (e.g., on sidebar for desktop) */}
             {otherRemoteStreams.length > 0 && (
                 <div className="remote-gallery">
                     {otherRemoteStreams.map(([peerId, stream]) => (
                         <div key={peerId} className="gallery-item">
                             <VideoPlayer stream={stream} className="gallery-video" />
                             <span className="gallery-peer-id">{peerId.substring(0, 6)}...</span>
                         </div>
                     ))}
                 </div>
             )}

             {/* Call Info (Could be overlay or top bar) */}
             <div className="call-info">
                 Room: <strong>{roomId}</strong> | You: <strong>{userId}</strong>
             </div>

             {/* Loading/Waiting Message */}
             {remoteStreams.size === 0 && (
                 <div className="waiting-message">
                     Waiting for others to join...
                 </div>
             )}


             {/* Controls Bar */}
             <div className="controls-bar">
                <button onClick={toggleMic} className={`control-button ${isMicMuted ? 'muted' : ''}`} title={isMicMuted ? 'Unmute Microphone' : 'Mute Microphone'}>
                   {/* Mic Icon */}
                   {isMicMuted ? (
                       <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="icon">
                           <path d="M12 1a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3Z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2H3v2a8 8 0 0 0 7 7.93V22h2v-2.07A8 8 0 0 0 21 12v-2h-2Z"></path><line x1="4" x2="20" y1="4" y2="20"></line>
                       </svg>
                   ) : (
                       <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="icon">
                            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2H3v2a8 8 0 0 0 7 7.93V22h2v-2.07A8 8 0 0 0 21 12v-2h-2z"></path>
                       </svg>
                   )}
                </button>
                <button onClick={toggleVideo} className={`control-button ${isVideoStopped ? 'stopped' : ''}`} title={isVideoStopped ? 'Start Video' : 'Stop Video'}>
                   {/* Video Icon */}
                   {isVideoStopped ? (
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="icon">
                            <path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2v3.34l1 1L23 7v10"></path><line x1="1" x2="23" y1="1" y2="23"></line>
                        </svg>
                   ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="icon">
                             <polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
                        </svg>
                   )}
                </button>
                <button onClick={handleLeaveRoom} className="control-button leave" title="Leave Call">
                   {/* Leave Icon (Phone Down) */}
                   <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="icon">
                        <path d="M10.68 13.31a16 16 0 0 0 3.41 2.69l1.9-1.9a2 2 0 0 1 2.12 0l2.12 2.12a2 2 0 0 1 0 2.83L18.84 20a18.41 18.41 0 0 1-15.37-15.37l1.42-1.42a2 2 0 0 1 2.82 0l2.12 2.12a2 2 0 0 1 0 2.12L8.69 9.31a16 16 0 0 0 2.69 3.4Z"></path><path d="m22 2-8.5 8.5"></path><path d="M13.5 13.5 2 22"></path>
                    </svg>
                </button>
                {/* Debug Toggle Button (In-Call) */}
                <button onClick={() => setShowLogs(prev => !prev)} className="control-button debug" title={showLogs ? 'Hide Logs' : 'Show Logs'}>
                  {/* Logs Icon (File Text) */}
                   <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="icon">
                        <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" x2="8" y1="13" y2="13"></line><line x1="16" x2="8" y1="17" y2="17"></line><line x1="10" x2="8" y1="9" y2="9"></line>
                    </svg>
                </button>
             </div>
          </div>
        )}
      </main>

      {/* Conditionally render the Log Window */}
      {showLogs && (
          <LogWindow
              logs={logs}
              onClose={() => setShowLogs(false)}
              onGetStats={logPeerStats} // Pass the enhanced function
          />
      )}

      {/* Global styles and component-specific styles */}
      <style jsx>{`
        /* Basic Reset & Theming */
        :global(body) {
          margin: 0;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          background-color: var(--background, #1a1a1a);
          color: var(--foreground, #eaeaea);
          overflow: hidden; /* Prevent scrollbars from main page */
        }
        :global(:root) {
            /* Define theme variables if not already globally defined */
             --background: #121212; /* Slightly darker base */
             --background-secondary: #1e1e1e; /* Darker card */
             --background-input: #2c2c2c; /* Slightly lighter input */
             --foreground: #e0e0e0; /* Slightly softer white */
             --foreground-muted: #a0a0a0; /* Adjusted muted */
             --border: #3a3a3a; /* Softer border */
             --accent: #007aff; /* Apple-like blue */
             --color-error: #ff3b30; /* Apple-like red */
             --color-warning: #ff9500; /* Apple-like orange */
             --color-success: #34c759; /* Apple-like green */
             --background-disabled: #444;
             --foreground-disabled: #888;
        }

        /* Main Container Layouts */
        .main-container {
          display: flex;
          flex-direction: column;
          height: 100vh;
          width: 100vw;
          overflow: hidden;
        }
        .main-container.pre-join {
          justify-content: center;
          align-items: center;
          padding: 20px;
          /* Add a subtle background gradient or image maybe? */
          background: linear-gradient(135deg, #1a1a1a 0%, #121212 100%);
        }
         .main-container.in-call {
           /* Layout handled by .call-container */
         }

        /* Pre-Join Screen Styles */
        .join-container {
          background-color: var(--background-secondary);
          padding: 40px 50px; /* Increase padding */
          border-radius: 16px; /* Larger radius */
          box-shadow: 0 15px 35px rgba(0, 0, 0, 0.3); /* Deeper shadow */
          text-align: center;
          max-width: 480px; /* Slightly wider */
          width: 100%;
          border: 1px solid var(--border);
          transform: scale(1); /* Base for potential animation */
          transition: transform 0.3s ease-out;
        }
        /* Optional: slight scale effect on hover */
        /* .join-container:hover {
          transform: scale(1.02);
        } */
        .title {
          margin: 0 0 10px;
          font-size: 2.8em; /* Larger title */
          font-weight: 600;
          color: var(--accent); /* Use accent for title */
          letter-spacing: -0.5px;
        }
        .subtitle {
          margin: 0 0 35px; /* More space */
          color: var(--foreground-muted);
          font-size: 1.1em;
        }
        .input-group {
          display: flex;
          flex-direction: column;
          gap: 15px;
          margin-bottom: 25px;
        }
        .input-field {
          padding: 14px 18px; /* More padding */
          border: 1px solid var(--border);
          border-radius: 10px; /* More rounded */
          background-color: var(--background-input);
          color: var(--foreground);
          font-size: 1em;
          transition: border-color 0.2s ease, box-shadow 0.2s ease;
        }
        .input-field:focus {
          outline: none;
          border-color: var(--accent);
          box-shadow: 0 0 0 4px rgba(0, 122, 255, 0.2); /* Accent shadow */
        }
        .join-button {
          padding: 15px 25px; /* Taller button */
          border: none;
          border-radius: 10px; /* Match inputs */
          background-color: var(--accent);
          color: white;
          font-size: 1.2em; /* Bigger text */
          font-weight: 600; /* Bolder text */
          cursor: pointer;
          transition: background-color 0.2s ease, opacity 0.2s ease, transform 0.1s ease;
          width: 100%;
          margin-top: 10px; /* Space above button */
        }
        .join-button:hover:not(:disabled) {
          background-color: #005bb5; /* Darker accent */
          transform: translateY(-1px); /* Subtle lift */
        }
        .join-button:active:not(:disabled) {
          transform: translateY(0px); /* Press down */
        }
        .join-button:disabled {
          background-color: var(--background-disabled);
          color: var(--foreground-disabled);
          cursor: not-allowed;
          opacity: 0.7;
        }
        .error-message {
           color: var(--color-error);
           background-color: rgba(239, 68, 68, 0.1);
           border: 1px solid rgba(239, 68, 68, 0.3);
           padding: 10px;
           border-radius: 6px;
           margin-bottom: 15px;
           text-align: left;
           font-size: 0.9em;
        }
         .status-text {
             margin-top: 15px;
             font-size: 0.9em;
             color: var(--foreground-muted);
         }
         .status-text.error { color: var(--color-error); }
         .status-text.warning { color: var(--color-warning); }


        /* In-Call Screen Styles */
        .call-container {
          display: flex; /* Use flex for main layout */
          width: 100%;
          height: 100%;
          background-color: #000; /* Black background for the call */
          position: relative; /* For positioning children like controls */
        }

        .main-video-area {
           flex-grow: 1; /* Takes up remaining space */
           position: relative; /* Context for PiP */
           overflow: hidden; /* Ensure video fits */
           background-color: #000;
           display: flex;
           justify-content: center;
           align-items: center;
        }

        /* Style the video element itself via the class passed */
        :global(.main-video) {
           max-width: 100%;
           max-height: 100%;
           object-fit: contain; /* Contain ensures full video is visible */
           background-color: #000;
        }
        :global(.main-video.local-only) {
            /* Could add specific styles if needed when only local is shown */
        }

        /* Mirror the local preview */
        :global(.local-preview video) { /* Target the inner video element */
            transform: scaleX(-1);
        }

        .local-pip-container {
          position: absolute;
          bottom: 80px; /* Above controls */
          right: 20px;
          width: 15%; /* Responsive width */
          max-width: 180px; /* Max size */
          min-width: 100px; /* Min size */
          aspect-ratio: 4 / 3;
          border: 2px solid rgba(255, 255, 255, 0.3);
          border-radius: 8px;
          overflow: hidden; /* Clip the video */
          box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
          z-index: 10;
          background-color: #000; /* BG in case video doesn't load */
        }
        :global(.local-pip-video) {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        /* Mirror the local preview in PiP */
        /* :global(.local-pip-video.local-preview video) { 
            transform: scaleX(-1); 
        } */ 
        /* Combined rule above handles both cases */

        .remote-gallery {
          display: none; /* Hidden by default, shown on larger screens */
          flex-direction: column;
          gap: 10px;
          padding: 10px;
          background-color: var(--background-secondary);
          width: 200px; /* Fixed width sidebar */
          height: 100%;
          overflow-y: auto;
          flex-shrink: 0; /* Prevent shrinking */
        }
        .gallery-item {
           position: relative;
           aspect-ratio: 4 / 3;
           border-radius: 6px;
           overflow: hidden;
           background-color: #000;
        }
        :global(.gallery-video) {
           width: 100%;
           height: 100%;
           object-fit: cover;
        }
         .gallery-peer-id {
           position: absolute;
           bottom: 5px;
           left: 5px;
           background-color: rgba(0, 0, 0, 0.5);
           color: white;
           padding: 2px 5px;
           font-size: 0.8em;
           border-radius: 3px;
         }


        .call-info {
          position: absolute;
          top: 15px;
          left: 15px;
          background-color: rgba(0, 0, 0, 0.4);
          padding: 5px 10px;
          border-radius: 6px;
          font-size: 0.9em;
          color: var(--foreground);
          z-index: 5;
        }
        .call-info strong {
          color: var(--accent);
        }

        .waiting-message {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          color: var(--foreground-muted);
          font-size: 1.2em;
          background-color: rgba(0, 0, 0, 0.6);
          padding: 15px 25px;
          border-radius: 8px;
        }

        /* Controls Bar */
        .controls-bar {
          position: absolute;
          bottom: 0;
          left: 0;
          width: 100%;
          display: flex;
          justify-content: center;
          align-items: center;
          padding: 15px 0;
          gap: 15px;
          background: linear-gradient(to top, rgba(0, 0, 0, 0.7), rgba(0, 0, 0, 0)); /* Gradient background */
          z-index: 20;
        }
        .control-button {
          background-color: rgba(255, 255, 255, 0.2);
          border: none;
          color: white;
          padding: 10px;
          border-radius: 50%; /* Circular buttons */
          width: 50px;
          height: 50px;
          display: flex;
          justify-content: center;
          align-items: center;
          cursor: pointer;
          font-size: 0.8em; /* Adjust if using text */
          font-weight: 500;
          transition: background-color 0.2s ease;
          /* Add icons later */
        }
        .control-button:hover {
          background-color: rgba(255, 255, 255, 0.3);
        }
        .control-button.muted, .control-button.stopped {
          background-color: var(--background-secondary); /* Indicate active state */
          color: var(--foreground-muted);
        }
        .control-button.leave {
          background-color: var(--color-error);
        }
        .control-button.leave:hover {
          background-color: #dc2626; /* Darker red */
        }
        .control-button.debug {
            background-color: rgba(255, 255, 100, 0.15); /* Slightly different color for debug */
        }
        .control-button.debug:hover {
             background-color: rgba(255, 255, 100, 0.3);
        }

        /* Responsive Adjustments */
        @media (min-width: 768px) {
           .call-container {
              /* On larger screens, maybe don't force full black BG unless needed */
              background-color: var(--background);
           }
           .main-video-area {
              /* Could adjust main video area sizing if gallery is shown */
           }
           .local-pip-container {
              /* Slightly larger PiP on desktop */
              width: 18%;
              max-width: 220px;
           }
           .remote-gallery {
              display: flex; /* Show gallery sidebar */
           }
           .call-info {
             /* Keep top left */
           }
           .controls-bar {
             /* Maybe less prominent background on desktop */
             background: rgba(0, 0, 0, 0.1);
             padding: 10px 0;
             bottom: 10px; /* Give some space */
             left: 50%;
             transform: translateX(-50%);
             width: auto; /* Fit content */
             border-radius: 10px;
           }
           .waiting-message {
             /* No change needed */
           }
        }

        @media (min-width: 1200px) {
            .remote-gallery {
                width: 250px; /* Wider gallery on very large screens */
            }
            .local-pip-container {
              max-width: 250px;
            }
        }

        /* Debug Toggle Button (Pre-Join) */
        .debug-toggle-button {
            background: none;
            border: 1px solid var(--border);
            color: var(--foreground-muted);
            padding: 5px 10px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 0.8em;
            transition: all 0.2s ease;
        }
        .debug-toggle-button:hover {
            background-color: var(--background-input);
            border-color: var(--accent);
            color: var(--accent);
        }
        .pre-join-debug {
           margin-top: 20px; /* Space below join form */
           position: absolute; /* Position independently */
           bottom: 20px;
           left: 50%;
           transform: translateX(-50%);
        }

        /* Log Window Styles */
        .log-window {
            position: fixed; /* Overlay */
            bottom: 20px;
            right: 20px;
            width: 90%;
            max-width: 500px;
            height: 300px;
            background-color: rgba(30, 30, 30, 0.95); /* Dark semi-transparent */
            border: 1px solid var(--border);
            border-radius: 10px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
            z-index: 100;
            display: flex;
            flex-direction: column;
            backdrop-filter: blur(5px);
            overflow: hidden; /* Contain children */
        }
        .log-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 10px 15px;
            background-color: rgba(0, 0, 0, 0.2);
            border-bottom: 1px solid var(--border);
            flex-shrink: 0;
        }
        .log-header h3 {
            margin: 0;
            font-size: 1em;
            font-weight: 600;
        }
        .close-log-button {
            background: none;
            border: none;
            color: var(--foreground-muted);
            font-size: 1.5em;
            line-height: 1;
            cursor: pointer;
            padding: 0 5px;
        }
        .close-log-button:hover {
            color: var(--foreground);
        }
        .log-content {
            padding: 10px 15px;
            overflow-y: auto;
            flex-grow: 1;
            font-family: monospace;
            font-size: 0.85em;
        }
        .log-entry {
            margin: 0 0 5px;
            padding: 2px 0;
            white-space: pre-wrap; /* Wrap long lines */
            word-break: break-all; /* Break long words */
            border-bottom: 1px solid rgba(255, 255, 255, 0.05); /* Subtle separator */
        }
        .log-entry:last-child {
            border-bottom: none;
        }
        .log-timestamp {
            color: var(--foreground-muted);
            margin-right: 10px;
            font-size: 0.9em;
        }
        .log-message {
            /* Default color handled by log type */
        }
        .log-log .log-message {
            color: var(--foreground);
        }
        .log-warn .log-message {
            color: var(--color-warning);
        }
        .log-error .log-message {
            color: var(--color-error);
        }
        .no-logs {
            color: var(--foreground-muted);
            text-align: center;
            margin-top: 20px;
        }
        .stats-button {
            background: none;
            border: 1px solid var(--border);
            color: var(--foreground-muted);
            padding: 2px 6px;
            border-radius: 4px;
            cursor: pointer;
            margin-left: auto; /* Push it left before the close button */
            margin-right: 10px;
            font-size: 0.9em;
            transition: all 0.2s ease;
        }
        .stats-button:hover {
            background-color: var(--background-input);
            border-color: var(--accent);
            color: var(--accent);
        }

      `}</style>
    </>
  );
}
