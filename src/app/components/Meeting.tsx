'use client';

import React, { useState } from 'react';
import { VideoGrid } from './VideoGrid';
import { Controls } from './Controls';
import { SettingsPanel } from './SettingsPanel';
import { LogPanel } from './LogPanel';
// Import types from the components where they are defined (or a shared types file)
import type { ResolutionPreset, QualityPresetConfig, CallStats } from './SettingsPanel';
import type { Log } from './LogPanel';

// Type definitions moved from SettingsPanel - consider a shared types file
// type ResolutionPreset = {
//     label: string;
//     width: number;
//     height: number;
// };
// type QualityPresetConfig = {
//     name: string;
//     bitrate: number;
//     resolutionIndex: number;
//     fpsIndex: number;
// };
// type CallStats = {
//     totalSent: string;
//     totalReceived: string;
//     currentBitrate: string;
//     packetLoss: string;
// };
// type Log = {
//   type: 'log' | 'error' | 'warn';
//   message: string;
//   timestamp: number;
// }

interface MeetingProps {
    // State from Home
    localStream: MediaStream | null;
    remoteStreams: Map<string, MediaStream>;
    userId: string;
    isMicMuted: boolean;
    isVideoStopped: boolean;
    hasMultipleCameras: boolean;
    callStats: CallStats | null;
    logs: Log[];
    // Settings related state from Home
    qualityPresets: QualityPresetConfig[];
    resolutionPresets: ResolutionPreset[];
    frameRatePresets: number[];
    minBitrateKbps: number;
    maxBitrateKbps: number;
    targetBitrateKbps: number;
    currentResolutionIndex: number;
    currentFrameRateIndex: number;
    // Handlers from Home
    onToggleMic: () => void;
    onToggleVideo: () => void;
    onSwitchCamera: () => void;
    onLeaveRoom: () => void;
    onGetStats: () => void;
    onApplyPreset: (presetName: 'Low' | 'Medium' | 'High') => void;
    onBitrateChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
    onResolutionChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
    onFrameRateChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
}

export const Meeting = ({
    localStream,
    remoteStreams,
    userId,
    isMicMuted,
    isVideoStopped,
    hasMultipleCameras,
    callStats,
    logs,
    qualityPresets,
    resolutionPresets,
    frameRatePresets,
    minBitrateKbps,
    maxBitrateKbps,
    targetBitrateKbps,
    currentResolutionIndex,
    currentFrameRateIndex,
    onToggleMic,
    onToggleVideo,
    onSwitchCamera,
    onLeaveRoom,
    onGetStats,
    onApplyPreset,
    onBitrateChange,
    onResolutionChange,
    onFrameRateChange,
}: MeetingProps) => {
    const [showSettingsPanel, setShowSettingsPanel] = useState(false);
    const [showLogs, setShowLogs] = useState(false);

    return (
        <div className="flex-grow flex flex-col bg-gray-900 relative">
            <VideoGrid
                localStream={localStream}
                remoteStreams={remoteStreams}
                userId={userId}
                isMicMuted={isMicMuted}
                isVideoStopped={isVideoStopped}
            />

            <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-30">
                {/* Settings Panel Popup */}
                {showSettingsPanel && (
                    <SettingsPanel
                        qualityPresets={qualityPresets}
                        resolutionPresets={resolutionPresets}
                        frameRatePresets={frameRatePresets}
                        minBitrateKbps={minBitrateKbps}
                        maxBitrateKbps={maxBitrateKbps}
                        targetBitrateKbps={targetBitrateKbps}
                        currentResolutionIndex={currentResolutionIndex}
                        currentFrameRateIndex={currentFrameRateIndex}
                        callStats={callStats}
                        onApplyPreset={(presetName) => {
                            onApplyPreset(presetName);
                            setShowSettingsPanel(false); // Close panel on apply
                        }}
                        onBitrateChange={onBitrateChange}
                        onResolutionChange={onResolutionChange}
                        onFrameRateChange={onFrameRateChange}
                    />
                )}

                {/* Controls Bar */}
                <Controls
                    isMicMuted={isMicMuted}
                    isVideoStopped={isVideoStopped}
                    hasMultipleCameras={hasMultipleCameras}
                    showSettingsPanel={showSettingsPanel}
                    showLogs={showLogs}
                    onToggleMic={onToggleMic}
                    onToggleVideo={onToggleVideo}
                    onSwitchCamera={onSwitchCamera}
                    onToggleSettings={() => setShowSettingsPanel(!showSettingsPanel)}
                    onToggleLogs={() => setShowLogs(!showLogs)}
                    onLeaveRoom={onLeaveRoom}
                />
            </div>

            {/* Log Panel Overlay */}
            {showLogs && (
                <div className="absolute bottom-0 left-0 right-0 p-4 z-20 pointer-events-none">
                    {/* pointer-events-auto is now set within LogPanel */}
                    <LogPanel
                        logs={logs}
                        onClose={() => setShowLogs(false)}
                        onGetStats={onGetStats}
                    />
                </div>
            )}
        </div>
    );
}; 