'use client';

import React from 'react';
import { VideoPlayer } from './VideoPlayer';

interface VideoGridProps {
    localStream: MediaStream | null;
    remoteStreams: Map<string, MediaStream>;
    userId: string;
    isMicMuted: boolean;
    isVideoStopped: boolean;
}

export const VideoGrid = ({
    localStream,
    remoteStreams,
    userId,
    isMicMuted,
    isVideoStopped
}: VideoGridProps) => {

    const participantCount = remoteStreams.size + 1;
    let gridCols = 'grid-cols-1';
    let gridRows = 'grid-rows-1';
    const videoHeightClass = 'h-full'; // Keep consistent height for now
    const aspectRatioClass = 'aspect-video';
    
    // Determine grid layout based on participant count
    if (participantCount === 1) {
        gridCols = 'grid-cols-1';
        gridRows = 'grid-rows-1';
    } else if (participantCount === 2) {
        gridCols = 'grid-cols-2';
        gridRows = 'grid-rows-1';
    } else if (participantCount >= 3 && participantCount <= 4) {
        gridCols = 'grid-cols-2';
        gridRows = 'grid-rows-2';
    } else if (participantCount >= 5 && participantCount <= 6) {
        gridCols = 'grid-cols-3';
        gridRows = 'grid-rows-2';
    } else if (participantCount >= 7 && participantCount <= 9) {
        gridCols = 'grid-cols-3';
        gridRows = 'grid-rows-3';
    } else { // 10 or more participants
        gridCols = 'grid-cols-4';
        gridRows = 'grid-rows-auto'; // Allow rows to adjust
    }

    return (
        <div className={`flex-grow grid gap-1 sm:gap-2 ${gridCols} ${gridRows} content-center items-center overflow-hidden p-1 sm:p-2`}>
            {/* Local Video */}
            <div className={`relative bg-black rounded-md overflow-hidden shadow-md ${videoHeightClass} w-full flex items-center justify-center`}>
                <VideoPlayer stream={localStream} muted={true} className={`w-full h-full object-cover transform -scale-x-100 ${aspectRatioClass}`} />
                <div className="absolute bottom-1 left-1 sm:bottom-2 sm:left-2 bg-black bg-opacity-60 text-white text-[0.6rem] sm:text-xs px-1.5 py-0.5 sm:px-2 sm:py-1 rounded">
                    {userId} (You) {isMicMuted ? ' [MUTED]' : ''}{isVideoStopped ? ' [CAM OFF]' : ''}
                </div>
            </div>

            {/* Remote Videos */}
            {Array.from(remoteStreams.entries()).map(([peerId, stream]) => (
                <div key={peerId} className={`relative bg-black rounded-md overflow-hidden shadow-md ${videoHeightClass} w-full flex items-center justify-center`}>
                    <VideoPlayer stream={stream} className={`w-full h-full object-cover ${aspectRatioClass}`} />
                    <div className="absolute bottom-1 left-1 sm:bottom-2 sm:left-2 bg-black bg-opacity-60 text-white text-[0.6rem] sm:text-xs px-1.5 py-0.5 sm:px-2 sm:py-1 rounded">
                        {peerId.substring(0, 8)} {/* Display first 8 chars of peer ID */}
                    </div>
                </div>
            ))}
        </div>
    );
}; 