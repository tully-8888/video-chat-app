import React, { useEffect, useRef, useMemo } from 'react';

type VideoPlayerProps = {
  stream: MediaStream | null;
  muted?: boolean;
  mirror?: boolean;
  label?: string;
  showControls?: boolean;
  className?: string;
  videoClassName?: string;
  isLocal?: boolean;
};

export default function VideoPlayer({
  stream,
  muted = false,
  mirror = false,
  label,
  showControls = false,
  className = '',
  videoClassName = '',
  isLocal = false,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  
  // Check if stream has active video tracks
  const hasVideoTracks = useMemo(() => {
    if (!stream) return false;
    return stream.getVideoTracks().length > 0 && 
           stream.getVideoTracks().some(track => track.enabled && track.readyState === 'live');
  }, [stream]);

  // Check if stream has active audio tracks
  const hasAudioTracks = useMemo(() => {
    if (!stream) return false;
    return stream.getAudioTracks().length > 0 && 
           stream.getAudioTracks().some(track => track.enabled && track.readyState === 'live');
  }, [stream]);
  
  // Generate user avatar from label
  const avatarText = useMemo(() => {
    if (!label) return '?';
    return label.substring(0, 2).toUpperCase();
  }, [label]);
  
  // Attach stream to video element when it changes
  useEffect(() => {
    const videoElement = videoRef.current;
    let mounted = true;
    
    if (videoElement && stream) {
      // Only set srcObject if it's different from the current one
      if (videoElement.srcObject !== stream) {
        videoElement.srcObject = stream;
        
        const playVideo = async () => {
          if (!mounted) return;
          
          try {
            await videoElement.play();
          } catch (err) {
            console.error('Error playing video:', err);
          }
        };
        
        playVideo();
      }
    }
    
    return () => {
      mounted = false;
      // We should only clean up srcObject if the component is unmounting
      // and the stream has changed, not on every render
      if (videoElement && videoElement.srcObject === stream) {
        // Cancel any pending play operations by pausing
        try {
          videoElement.pause();
        } catch /* (e) */ { // Remove the unused 'e' variable
          // Ignore errors from pausing (comment indicates intention)
          console.log('Ignoring potential error during video pause on cleanup.') // Optional log
        }
      }
    };
  }, [stream]);
  
  return (
    <div className={`relative overflow-hidden rounded-xl shadow-lg transition-all ${className}`}>
      {/* Video */}
      <video
        ref={videoRef}
        className={`w-full h-full object-cover ${mirror ? 'scale-x-[-1]' : ''} ${videoClassName}`}
        autoPlay
        playsInline
        muted={muted}
        controls={showControls}
        onError={(event) => {
          console.error("Video Player Component Error:", event);
        }}
      />

      {/* Placeholder when no video */}
      {(!stream || !hasVideoTracks) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-800 text-white">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-xl font-bold mb-2">
            {avatarText}
          </div>
          <p className="text-sm text-gray-300">{isLocal ? 'Your camera is off' : 'Camera off'}</p>
        </div>
      )}
      
      {/* Status indicators */}
      <div className="absolute bottom-2 left-2 right-2 flex justify-between items-center">
        {/* Left side - user name/label */}
        {label && (
          <div className="bg-black/60 backdrop-blur-sm text-white text-xs px-2 py-1 rounded-md">
            {label}
            {isLocal && <span className="ml-1 text-indigo-300">(You)</span>}
          </div>
        )}
        
        {/* Right side - indicators */}
        <div className="flex space-x-1 ml-auto">
          {/* Muted audio indicator */}
          {(!hasAudioTracks) && (
            <div className="bg-black/60 backdrop-blur-sm text-white text-xs px-2 py-1 rounded-md flex items-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1 text-red-500" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-3.293 3.293 3.293 3.293a1 1 0 01-1.414 1.414L10 13.414l-3.293 3.293a1 1 0 01-1.414-1.414l3.293-3.293-3.293-3.293a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
              <span>Muted</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 