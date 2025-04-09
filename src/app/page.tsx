'use client';

import React from 'react';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useWebRTC } from './hooks/useWebRTC';

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

export default function Home() {
  const [roomId, setRoomId] = useState('');
  const [userId, setUserId] = useState('');
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isJoining, setIsJoining] = useState(false); // Prevent multiple join attempts
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isVideoStopped, setIsVideoStopped] = useState(false);

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
    webSocketState
  } = useWebRTC({
    localStream,
    onRemoteStream: handleRemoteStream,
    onPeerDisconnect: handlePeerDisconnect,
  });
  // -------------------------------------

  // Get user media
  const getMedia = useCallback(async (audio = true, video = true) => {
    setError(null);
    try {
      console.log(`Requesting local media... Audio: ${audio}, Video: ${video}`);
      localStream?.getTracks().forEach(track => track.stop());
      
      const constraints = { audio, video };
      if (!audio && !video) {
        setLocalStream(null); 
        console.log('Cleared local media as audio and video are false.');
        return; 
      }
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      console.log('Local media obtained:', stream.id);
      setLocalStream(stream);
    } catch (err) {
      console.error('Failed to get local stream:', err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(`Failed to get camera/microphone: ${errorMessage}. Please check permissions.`);
      setLocalStream(null); 
    }
  }, [localStream]);

  // Automatically get media and set default userId on component mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
        // Generate default userId only on the client after mount
        if (!userId) { // Only set if not already set (e.g., by user input)
             setUserId(`user_${Math.random().toString(36).substring(2, 9)}`);
        }
        // Call getMedia, but don't make the effect depend on it
        getMedia(); 
    }
    // Cleanup function should still run on actual unmount
    return () => {
      console.log('Cleaning up local stream on unmount');
      // Use ref or access localStream directly - need to be careful here
      // Accessing state directly in cleanup can be stale.
      // Let's rely on the getMedia function itself to handle stopping previous tracks.
      // The primary cleanup is handled when the component *actually* unmounts.
      // We might need a ref to the stream for robust cleanup if needed later.
    }
  // Run only once on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty dependency array ensures this runs only ONCE on mount

  const handleJoinRoom = () => {
    if (!roomId.trim() || !userId.trim()) {
      setError('Please enter both Room ID and User ID.');
      return;
    }
    if (!localStream) {
      // Try getting media again if missing
      console.log('Local stream missing, attempting to get media again...')
      getMedia().then(() => {
          // Check again after attempting to get media
          if (!localStream) {
             setError('Cannot join room: Local media (camera/mic) not available. Please grant permissions and refresh.');
             return;
          }
          // If media acquired now, proceed to join (check WS state etc.)
          proceedToJoin(); 
      }).catch(err => {
          console.error('Error trying to get media again:', err);
          setError('Failed to acquire camera/microphone for joining.');
      });
      return; // Exit for now, let the async getMedia handle it
    }
    // If localStream exists, proceed directly
    proceedToJoin();
  };

  // Helper function to contain the joining logic after checks
  const proceedToJoin = () => {
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
      console.log(`Calling rtcJoinRoom for room: ${roomId}, user: ${userId}`);
      // Call the join function from the hook, passing roomId and userId
      rtcJoinRoom({ roomId, userId }); 
      // We don't setIsJoining(false) here immediately,
      // rely on isJoined from the hook to update the UI state
  };

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
            <p className="ws-status">
              WebSocket: <span className={`status-${webSocketState.toLowerCase()}`}>{webSocketState}</span>
            </p>

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
            {!localStream && webSocketState === 'OPEN' && <p className="status-text warning">Waiting for camera/microphone...</p>}
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
                <button onClick={toggleMic} className={`control-button ${isMicMuted ? 'muted' : ''}`}>
                   {isMicMuted ? 'Unmute' : 'Mute'} {/* Replace with icons later */}
                </button>
                <button onClick={toggleVideo} className={`control-button ${isVideoStopped ? 'stopped' : ''}`}>
                   {isVideoStopped ? 'Start Vid' : 'Stop Vid'} {/* Replace with icons later */}
                </button>
                <button onClick={handleLeaveRoom} className="control-button leave">
                   Leave
                </button>
             </div>
          </div>
        )}
      </main>

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
             --background: #1a1a1a;
             --background-secondary: #2a2a2a;
             --background-input: #333;
             --foreground: #eaeaea;
             --foreground-muted: #888888;
             --border: #444;
             --accent: #3b82f6; /* Blue */
             --color-error: #ef4444; /* Red */
             --color-warning: #fbbf24; /* Amber */
             --color-success: #22c55e; /* Green */
             --background-disabled: #555;
             --foreground-disabled: #999;
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
        }
         .main-container.in-call {
           /* Layout handled by .call-container */
         }

        /* Pre-Join Screen Styles */
        .join-container {
          background-color: var(--background-secondary);
          padding: 30px 40px;
          border-radius: 12px;
          box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
          text-align: center;
          max-width: 450px;
          width: 100%;
        }
        .title {
          margin: 0 0 10px;
          font-size: 2.5em;
          font-weight: 600;
          color: var(--foreground);
        }
        .subtitle {
          margin: 0 0 25px;
          color: var(--foreground-muted);
          font-size: 1em;
        }
        .input-group {
          display: flex;
          flex-direction: column;
          gap: 15px;
          margin-bottom: 25px;
        }
        .input-field {
          padding: 12px 15px;
          border: 1px solid var(--border);
          border-radius: 8px;
          background-color: var(--background-input);
          color: var(--foreground);
          font-size: 1em;
          transition: border-color 0.2s ease, box-shadow 0.2s ease;
        }
        .input-field:focus {
          outline: none;
          border-color: var(--accent);
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.3);
        }
        .join-button {
          padding: 12px 25px;
          border: none;
          border-radius: 8px;
          background-color: var(--accent);
          color: white;
          font-size: 1.1em;
          font-weight: 500;
          cursor: pointer;
          transition: background-color 0.2s ease, opacity 0.2s ease;
          width: 100%;
        }
        .join-button:hover:not(:disabled) {
          background-color: #2563eb; /* Darker blue */
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
         .ws-status {
           margin-bottom: 20px;
           font-size: 0.9em;
           color: var(--foreground-muted);
         }
         .ws-status span { font-weight: bold; }
         .ws-status .status-connecting { color: var(--color-warning); }
         .ws-status .status-open { color: var(--color-success); }
         .ws-status .status-closing, .ws-status .status-closed { color: var(--color-error); }
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


      `}</style>
    </>
  );
}
