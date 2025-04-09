'use client';

import React from 'react';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useWebRTC } from './hooks/useWebRTC';

// Simple Video Player Component
const VideoPlayer = ({ stream, muted = false }: { stream: MediaStream | null, muted?: boolean }) => {
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
      autoPlay
      playsInline // Important for mobile browsers
      muted={muted}
      style={{ 
        width: '300px', 
        // height: '225px', // Use aspectRatio for better responsiveness
        aspectRatio: '4 / 3', 
        margin: '5px', 
        border: '1px solid #ccc', 
        backgroundColor: 'black',
        borderRadius: '4px'
      }}
      onError={(event) => {
        console.error("Video Player Error:", event);
      }}
    />
  );
};

export default function Home() {
  const [roomId, setRoomId] = useState('');
  const [userId, setUserId] = useState(() => {
    // Generate a simple default user ID for convenience
    if (typeof window !== 'undefined') {
      return `user_${Math.random().toString(36).substring(2, 9)}`;
    }
    return '';
  });
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isJoining, setIsJoining] = useState(false); // Prevent multiple join attempts

  // State specifically for remote streams managed by the hook's callbacks
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());

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
    roomId: roomId, 
    userId: userId,   
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

  // Automatically get media on component mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
        getMedia();
    }
    return () => {
      console.log('Cleaning up local stream on unmount');
      localStream?.getTracks().forEach(track => track.stop());
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps 
  }, []);

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
      // Call the join function from the hook
      // The hook internally updates isJoined state and sends WS message
      rtcJoinRoom(); 
      // We don't setIsJoining(false) here immediately,
      // rely on isJoined from the hook to update the UI state
  };

  const handleLeaveRoom = () => {
    rtcLeaveRoom();
    setIsJoining(false); // Reset joining state
    setRemoteStreams(new Map()); // Clear remote streams on leave
  };
  
  // Update joining status based on hook state
  useEffect(() => {
    if(isJoined) {
      setIsJoining(false);
    }
  }, [isJoined]);

  return (
    <main style={{ padding: '20px', fontFamily: 'sans-serif', maxWidth: '1200px', margin: 'auto' }}>
      <h1 style={{ textAlign: 'center', marginBottom: '30px' }}>Simple P2P Video Chat</h1>

      {error && (
          <p style={{ color: '#dc3545', backgroundColor: '#f8d7da', border: '1px solid #f5c6cb', padding: '10px', borderRadius: '4px', marginBottom: '15px' }}>
             <strong>Error:</strong> {error}
          </p>
      )}
      <p style={{ textAlign: 'center', marginBottom: '20px', fontSize: '0.9em', color: '#6c757d' }}>
        WebSocket Status: <span style={{ fontWeight: 'bold' }}>{webSocketState}</span>
      </p>
      
      {!isJoined ? (
        <div style={{ marginBottom: '20px', padding: '20px', border: '1px solid #ddd', borderRadius: '8px', backgroundColor: '#f8f9fa' }}>
          <h2 style={{ marginTop: '0', marginBottom: '15px' }}>Join a Room</h2>
          <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
             <input
               type="text"
               placeholder="Room ID"
               value={roomId}
               onChange={(e) => setRoomId(e.target.value)}
               disabled={isJoining}
               style={{ padding: '10px', border: '1px solid #ccc', borderRadius: '4px', flexGrow: 1 }}
             />
             <input
               type="text"
               placeholder="Your User ID"
               value={userId}
               onChange={(e) => setUserId(e.target.value)}
               disabled={isJoining}
               style={{ padding: '10px', border: '1px solid #ccc', borderRadius: '4px', flexGrow: 1 }}
             />
          </div>
          <button 
            onClick={handleJoinRoom} 
            disabled={webSocketState !== 'OPEN' || isJoining}
            style={{ 
                padding: '10px 20px', 
                cursor: (webSocketState !== 'OPEN' || isJoining) ? 'not-allowed' : 'pointer',
                backgroundColor: (webSocketState !== 'OPEN' || isJoining) ? '#ccc' : '#007bff',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                fontSize: '1em' 
            }}
          >
            {isJoining ? 'Joining...' : 'Join Room'}
          </button>
          {webSocketState === 'CONNECTING' && <p style={{ marginTop: '10px', color: '#6c757d' }}>Connecting to server...</p>}
          {webSocketState !== 'OPEN' && webSocketState !== 'CONNECTING' && <p style={{ marginTop: '10px', color: '#dc3545' }}>Cannot connect to signaling server. Please ensure it is running.</p>}
          {!localStream && webSocketState === 'OPEN' && <p style={{ marginTop: '10px', color: '#ffc107' }}>Waiting for camera/microphone access...</p>}
        </div>
      ) : (
        <div style={{ marginBottom: '20px', padding: '15px', border: '1px solid #ddd', borderRadius: '8px', backgroundColor: '#e9ecef' }}>
          <p>Joined Room: <strong>{roomId}</strong> as <strong>{userId}</strong></p>
          <button onClick={handleLeaveRoom} style={{ 
             padding: '8px 15px', 
             cursor: 'pointer', 
             backgroundColor: '#dc3545', 
             color: 'white', 
             border: 'none', 
             borderRadius: '4px' 
          }}>
            Leave Room
          </button>
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', justifyContent: 'center' }}>
        {/* Local Video */}
        <div style={{ textAlign: 'center' }}>
          <h3 style={{ marginBottom: '5px' }}>You ({userId.substring(0,8)}...)</h3>
          <VideoPlayer stream={localStream} muted={true} />
          {/* Add Mute/Video Toggle Buttons */}
          {localStream && (
              <div style={{ marginTop: '5px' }}>
                  <button 
                      onClick={() => {
                          localStream.getAudioTracks().forEach(track => track.enabled = !track.enabled);
                          // Force re-render to update button style if needed (optional)
                          setLocalStream(new MediaStream(localStream.getTracks())); 
                      }} 
                      style={{ marginRight: '5px', padding: '5px 10px' }}
                  >
                      {localStream.getAudioTracks().some(track => track.enabled) ? 'Mute Mic' : 'Unmute Mic'}
                  </button>
                  <button 
                     onClick={() => {
                          localStream.getVideoTracks().forEach(track => track.enabled = !track.enabled);
                           // Force re-render to update button style if needed (optional)
                          setLocalStream(new MediaStream(localStream.getTracks())); 
                      }}
                      style={{ padding: '5px 10px' }}
                  >
                      {localStream.getVideoTracks().some(track => track.enabled) ? 'Stop Video' : 'Start Video'}
                  </button>
              </div>
          )}
        </div>
        
        {/* Remote Videos */} 
        {[...remoteStreams.entries()].map(([peerId, stream]) => (
          <div key={peerId} style={{ textAlign: 'center' }}>
            <h3 style={{ marginBottom: '5px' }}>Peer: {peerId.substring(0, 8)}...</h3>
            <VideoPlayer stream={stream} />
          </div>
        ))}
      </div>

       {isJoined && remoteStreams.size === 0 && (
         <p style={{ marginTop: '20px', textAlign: 'center', color: '#6c757d' }}>Waiting for others to join the room...</p>
       )}

    </main>
  );
}
