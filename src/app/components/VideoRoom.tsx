import React, { useState, useEffect, useRef } from 'react';
import useWebRTC from '../hooks/useWebRTC';
import VideoPlayer from './VideoPlayer';
import CallControls from './CallControls';

// Types for props
interface VideoRoomProps {
  roomId?: string | null;
  userId?: string | null;
  onSignal?: (data: any) => void;
  receivedSignalData?: any;
  onLeaveRoom?: () => void;
  className?: string;
}

// Main VideoRoom component
const VideoRoom: React.FC<VideoRoomProps> = ({
  roomId,
  userId,
  onSignal,
  receivedSignalData,
  onLeaveRoom,
  className = '',
}) => {
  // State for managing UI components
  const [displayName, setDisplayName] = useState<string>('');
  const [showConnectionError, setShowConnectionError] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [showRetryButton, setShowRetryButton] = useState<boolean>(false);
  const [isAudioEnabled, setIsAudioEnabled] = useState<boolean>(true);
  const [isVideoEnabled, setIsVideoEnabled] = useState<boolean>(true);
  const [isLimitedMode, setIsLimitedMode] = useState<boolean>(false);
  
  // Refs to prevent unnecessary re-renders and manage component lifecycle
  const peerInitializedRef = useRef<boolean>(false);
  const signalDataProcessedRef = useRef<{ [key: string]: boolean }>({});
  const inCleanupRef = useRef<boolean>(false);
  const lastRoomIdRef = useRef<string | null | undefined>(null);
  const lastUserIdRef = useRef<string | null | undefined>(null);
  
  // Initialize WebRTC hook
  const {
    localStream,
    remoteStream,
    peer,
    connectionStatus,
    error,
    createPeer,
    destroyConnection,
    handleSignal,
  } = useWebRTC();

  // Set display name based on userId or a default
  useEffect(() => {
    if (userId) {
      setDisplayName(userId.substring(0, 2).toUpperCase());
    } else {
      setDisplayName('ME');
    }
  }, [userId]);

  // Check if the stream has active media tracks
  const hasMediaTracks = (stream: MediaStream | null): { video: boolean, audio: boolean } => {
    if (!stream) return { video: false, audio: false };
    
    const videoTracks = stream.getVideoTracks();
    const audioTracks = stream.getAudioTracks();
    
    return {
      video: videoTracks.length > 0 && videoTracks[0].enabled,
      audio: audioTracks.length > 0 && audioTracks[0].enabled,
    };
  };

  // Check if we're in limited mode (no proper media access)
  useEffect(() => {
    if (localStream) {
      const tracks = hasMediaTracks(localStream);
      // If we have video tracks but they are dummy tracks (created in useWebRTC)
      const videoTrack = localStream.getVideoTracks()[0];
      const isDummyTrack = videoTrack && videoTrack.label.includes('dummy');
      
      setIsLimitedMode(isDummyTrack || (!tracks.video && !tracks.audio));
    }
  }, [localStream]);

  // Handle peer connection initialization and cleanup
  useEffect(() => {
    // Only run if we have necessary data and haven't initialized yet
    if (!roomId || !userId || peerInitializedRef.current) {
      return;
    }
    
    // Check if room or user ID changed
    if (lastRoomIdRef.current !== roomId || lastUserIdRef.current !== userId) {
      console.log(`Initializing peer with roomId: ${roomId}, userId: ${userId}`);
      
      // Update ref values for comparison in next render
      lastRoomIdRef.current = roomId;
      lastUserIdRef.current = userId;
      
      // Determine if this user is the initiator based on roomId and userId
      // This is a simple way to ensure consistent roles between peers
      const initiator = userId.localeCompare(roomId) > 0;
      console.log(`User ${userId} is ${initiator ? 'initiator' : 'not initiator'} for room ${roomId}`);
      
      // Initialize the peer connection
      const initializePeer = async () => {
        try {
          console.log('Creating peer connection...');
          const newPeer = await createPeer(initiator);
          
          if (newPeer) {
            // Set up signal event handler
            newPeer.on('signal', (data: any) => {
              console.log('Local peer signaling:', data.type);
              if (onSignal) onSignal(data);
            });
            
            // Mark as initialized
            peerInitializedRef.current = true;
            console.log('Peer successfully initialized');
          } else {
            console.error('Failed to create peer');
            setErrorMessage('Failed to establish connection. Please try again.');
            setShowConnectionError(true);
            setShowRetryButton(true);
          }
        } catch (err) {
          console.error('Error initializing peer:', err);
          setErrorMessage(err instanceof Error ? err.message : 'Failed to establish connection');
          setShowConnectionError(true);
          setShowRetryButton(true);
        }
      };
      
      initializePeer();
    }
    
    // Cleanup function
    return () => {
      if (inCleanupRef.current) return;
      
      inCleanupRef.current = true;
      console.log('Cleanup: destroying peer connection and resetting state');
      
      // Reset initialization flag
      peerInitializedRef.current = false;
      
      // Clean up the peer connection
      destroyConnection();
      
      // Reset state
      setShowConnectionError(false);
      setShowRetryButton(false);
      
      inCleanupRef.current = false;
    };
  }, [roomId, userId, createPeer, destroyConnection, onSignal]);

  // Handle incoming signal data
  useEffect(() => {
    if (!receivedSignalData || !peer) return;
    
    // Create a unique ID for this signal data to prevent processing duplicates
    const signalId = JSON.stringify(receivedSignalData);
    
    // Skip if we've already processed this signal
    if (signalDataProcessedRef.current[signalId]) {
      return;
    }
    
    console.log('Processing received signal:', receivedSignalData.type);
    
    // Mark this signal as processed
    signalDataProcessedRef.current[signalId] = true;
    
    // Handle the signal
    handleSignal(receivedSignalData);
    
    // Limit the size of our processed signals cache
    const processedSignals = Object.keys(signalDataProcessedRef.current);
    if (processedSignals.length > 50) {
      // Remove the oldest signals if we have too many
      const oldestSignal = processedSignals[0];
      delete signalDataProcessedRef.current[oldestSignal];
    }
  }, [receivedSignalData, peer, handleSignal]);

  // Handle connection errors from WebRTC hook
  useEffect(() => {
    if (error) {
      console.error('WebRTC error:', error);
      setErrorMessage(error.message || 'Connection error occurred');
      setShowConnectionError(true);
      setShowRetryButton(true);
    } else {
      setShowConnectionError(false);
      setShowRetryButton(false);
    }
  }, [error]);

  // Functions to toggle audio and video
  const toggleAudio = () => {
    if (!localStream) return;
    
    const audioTracks = localStream.getAudioTracks();
    if (audioTracks.length === 0) return;
    
    const newState = !isAudioEnabled;
    audioTracks.forEach(track => {
      track.enabled = newState;
    });
    
    setIsAudioEnabled(newState);
  };

  const toggleVideo = () => {
    if (!localStream) return;
    
    const videoTracks = localStream.getVideoTracks();
    if (videoTracks.length === 0) return;
    
    const newState = !isVideoEnabled;
    videoTracks.forEach(track => {
      track.enabled = newState;
    });
    
    setIsVideoEnabled(newState);
  };

  // Retry connection after error
  const retryConnection = () => {
    setShowConnectionError(false);
    setShowRetryButton(false);
    setErrorMessage('');
    
    // Reset the initialization flag to allow reinitializing
    peerInitializedRef.current = false;
    
    // Clean up existing connection
    destroyConnection();
    
    // Force re-render to trigger the initialization useEffect
    lastRoomIdRef.current = null;
    lastUserIdRef.current = null;
  };

  // Render the component
  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Limited mode banner - shown when user has restricted media access */}
      {isLimitedMode && (
        <div className="w-full bg-amber-100 p-2 mb-4 rounded-lg">
          <div className="flex items-center text-amber-800">
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span className="font-medium">Limited Access Mode</span>
          </div>
          <p className="text-sm mt-1">
            You have limited or no access to camera/microphone. You can still participate but others won't see or hear you.
          </p>
        </div>
      )}

      {/* Connection error UI */}
      {showConnectionError && (
        <div className="w-full bg-red-100 p-4 mb-4 rounded-lg">
          <div className="flex items-center text-red-800">
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="font-medium">Connection Error</span>
          </div>
          <p className="text-sm mt-1">{errorMessage}</p>
          {showRetryButton && (
            <button 
              onClick={retryConnection}
              className="mt-2 px-3 py-1 bg-red-200 hover:bg-red-300 text-red-800 rounded-md transition-colors text-sm"
            >
              Retry Connection
            </button>
          )}
        </div>
      )}

      {/* Connection status indicator */}
      <div className="flex items-center mb-4 justify-center">
        <div className={`h-2 w-2 rounded-full mr-2 ${
          connectionStatus === 'connected' ? 'bg-green-500' : 
          connectionStatus === 'connecting' ? 'bg-yellow-500' : 'bg-red-500'
        }`}></div>
        <span className="text-sm text-gray-600">
          {connectionStatus === 'connected' ? 'Connected' : 
           connectionStatus === 'connecting' ? 'Connecting...' : 'Disconnected'}
        </span>
      </div>

      {/* Video grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-grow">
        {/* Local video */}
        <div className="relative rounded-lg overflow-hidden aspect-video bg-gray-100">
          <VideoPlayer 
            stream={localStream} 
            muted={true} 
            mirror={true} 
            label="You"
            isAudioMuted={!isAudioEnabled}
            userInitials={displayName}
          />
        </div>
        
        {/* Remote video */}
        {(remoteStream || connectionStatus === 'connecting') && (
          <div className="relative rounded-lg overflow-hidden aspect-video bg-gray-100">
            {connectionStatus === 'connecting' && !remoteStream ? (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
                <div className="animate-pulse text-gray-500">
                  <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  <p className="mt-2 text-center text-sm">Waiting for peer...</p>
                </div>
              </div>
            ) : (
              <VideoPlayer 
                stream={remoteStream} 
                muted={false} 
                mirror={false} 
                label="Peer" 
                userInitials={roomId?.substring(0, 2).toUpperCase() || 'P2'}
              />
            )}
          </div>
        )}
      </div>

      {/* Call controls */}
      <div className="mt-4">
        <CallControls 
          isAudioEnabled={isAudioEnabled}
          isVideoEnabled={isVideoEnabled}
          onToggleAudio={toggleAudio}
          onToggleVideo={toggleVideo}
          onEndCall={onLeaveRoom}
        />
      </div>
    </div>
  );
};

export default VideoRoom;