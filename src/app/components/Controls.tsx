'use client';

import React from 'react';
import {
    Video,
    Mic,
    MicOff,
    VideoOff,
    LogOut,
    ListFilter,
    RefreshCw,
    Settings
} from 'lucide-react';

interface ControlsProps {
    isMicMuted: boolean;
    isVideoStopped: boolean;
    hasMultipleCameras: boolean;
    showSettingsPanel: boolean;
    showLogs: boolean;
    onToggleMic: () => void;
    onToggleVideo: () => void;
    onSwitchCamera: () => void;
    onToggleSettings: () => void;
    onToggleLogs: () => void;
    onLeaveRoom: () => void;
}

export const Controls = ({
    isMicMuted,
    isVideoStopped,
    hasMultipleCameras,
    showSettingsPanel,
    showLogs,
    onToggleMic,
    onToggleVideo,
    onSwitchCamera,
    onToggleSettings,
    onToggleLogs,
    onLeaveRoom,
}: ControlsProps) => {
    return (
        <div className="flex items-center justify-center gap-3 sm:gap-4 bg-gray-900/70 backdrop-blur-sm p-2 sm:p-3 rounded-full shadow-lg border border-gray-700/50">
            <button
                onClick={onToggleMic}
                title={isMicMuted ? 'Unmute Microphone' : 'Mute Microphone'}
                className={`p-2 sm:p-3 rounded-full transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 focus:ring-offset-gray-900/80 ${
                    isMicMuted
                        ? 'bg-red-600 hover:bg-red-500 text-white'
                        : 'bg-gray-700 hover:bg-gray-600 text-gray-200'
                    }`}
            >
                {isMicMuted ? <MicOff size={18} /> : <Mic size={18} />}
            </button>

            <button
                onClick={onToggleVideo}
                title={isVideoStopped ? 'Start Video' : 'Stop Video'}
                className={`p-2 sm:p-3 rounded-full transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 focus:ring-offset-gray-900/80 ${
                    isVideoStopped
                        ? 'bg-red-600 hover:bg-red-500 text-white'
                        : 'bg-gray-700 hover:bg-gray-600 text-gray-200'
                    }`}
            >
                {isVideoStopped ? <VideoOff size={18} /> : <Video size={18} />}
            </button>

            <button
                onClick={onToggleSettings}
                title="Quality Settings"
                className={`p-2 sm:p-3 rounded-full transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 focus:ring-offset-gray-900/80 ${
                    showSettingsPanel ? 'bg-emerald-700 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-200'
                    }`}
            >
                <Settings size={18} />
            </button>

            {hasMultipleCameras && (
                <button
                    onClick={onSwitchCamera}
                    title="Switch Camera"
                    className="p-2 sm:p-3 rounded-full bg-gray-700 hover:bg-gray-600 text-gray-200 transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 focus:ring-offset-gray-900/80"
                >
                    <RefreshCw size={18} />
                </button>
            )}

            <button
                onClick={onToggleLogs}
                title={showLogs ? 'Hide Logs' : 'Show Logs'}
                className={`p-2 sm:p-3 rounded-full transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 focus:ring-offset-gray-900/80 ${
                    showLogs ? 'bg-blue-700 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-200' // Optional: Indicate active logs
                    }`}
            >
                <ListFilter size={18} />
            </button>

            <button
                onClick={onLeaveRoom}
                title="Leave Room"
                className="p-2 sm:p-3 rounded-full bg-red-600 hover:bg-red-500 text-white transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 focus:ring-offset-gray-900/80"
            >
                <LogOut size={18} />
            </button>
        </div>
    );
}; 