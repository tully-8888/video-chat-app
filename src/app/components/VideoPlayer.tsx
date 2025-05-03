'use client';

import React, { useEffect, useRef, useState } from 'react';

// Enhanced Video Player Component with better debugging
export const VideoPlayer = ({ stream, muted = false, className = '' }: { stream: MediaStream | null, muted?: boolean, className?: string }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [hasVideo, setHasVideo] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      // Log information about the stream to help debug
      const videoTracks = stream.getVideoTracks();
      const audioTracks = stream.getAudioTracks();
      console.log(`VideoPlayer: Setting stream with ${videoTracks.length} video tracks and ${audioTracks.length} audio tracks`);
      
      if (videoTracks.length > 0) {
        // Check if video tracks are enabled
        const videoEnabled = videoTracks[0].enabled;
        console.log(`VideoPlayer: First video track enabled: ${videoEnabled}`);
        setHasVideo(true);
      } else {
        setHasVideo(false);
        console.warn('VideoPlayer: Stream has no video tracks');
      }

      // Set up event listeners on the video element
      const videoElement = videoRef.current;
      
      // Event listener for when video starts playing
      const handlePlaying = () => {
        console.log('VideoPlayer: Video is now playing');
        setError(null);
      };
      
      // Event listener for when video is stalled
      const handleStalled = () => {
        console.warn('VideoPlayer: Video playback stalled');
      };
      
      videoElement.srcObject = stream;
      
      // Add event listeners
      videoElement.addEventListener('playing', handlePlaying);
      videoElement.addEventListener('stalled', handleStalled);
      
      // Play the video and catch any errors
      videoElement.play().catch(e => {
        console.error('VideoPlayer: Error playing video:', e.message);
        setError(e.message);
      });
      
      return () => {
        // Clean up event listeners
        videoElement.removeEventListener('playing', handlePlaying);
        videoElement.removeEventListener('stalled', handleStalled);
      };
    } else if (videoRef.current) {
      console.log('VideoPlayer: Clearing video source');
      videoRef.current.srcObject = null; // Clear source if stream is null
      setHasVideo(false);
    }
  }, [stream]);

  return (
    <>
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
      />
      {!hasVideo && stream && (
        <div className="absolute inset-0 flex items-center justify-center text-white text-sm bg-black bg-opacity-70">
          No video available
        </div>
      )}
      {error && (
        <div className="absolute bottom-8 left-0 right-0 text-center text-red-500 text-xs bg-black bg-opacity-70 p-1">
          Error: {error}
        </div>
      )}
    </>
  );
}; 