'use client';

import React, { useState } from 'react';
import {
    Video,
    Keyboard
} from 'lucide-react';

interface LobbyProps {
    roomIdFromUrl?: string; // Optional: Pre-fill room ID if coming from a URL
    isConnecting: boolean;
    isLoading: boolean; // Combined joining/creating loading state
    isCreatingRoom: boolean;
    isJoining: boolean;
    onCreateRoom: () => void;
    onJoinRoom: (roomId: string) => void;
}

export const Lobby = ({
    roomIdFromUrl = '',
    isConnecting,
    isLoading,
    isCreatingRoom,
    isJoining,
    onCreateRoom,
    onJoinRoom
}: LobbyProps) => {
    const [roomIdInput, setRoomIdInput] = useState(roomIdFromUrl);

    const handleJoin = () => {
        if (roomIdInput.trim()) {
            onJoinRoom(roomIdInput.trim().toLowerCase());
        }
    };

    return (
        <div className="flex-grow flex flex-col items-center justify-center text-center px-4">
            <h1 className="text-4xl sm:text-5xl text-gray-100 font-semibold mb-3">
                Connect with friends, instantly.
            </h1>
            <p className="text-base sm:text-lg text-gray-400 mb-10 sm:mb-12 max-w-xl">
                Simple, secure P2P video calls powered by WebRTC. No servers involved in media transmission.
            </p>
            <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-4">
                <button
                    onClick={onCreateRoom}
                    disabled={isConnecting || isLoading}
                    className={`flex items-center justify-center gap-2 px-5 py-3 rounded-full font-semibold transition-all duration-200 ease-in-out transform border focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 focus:ring-offset-gray-950 ${
                        isConnecting || isLoading
                            ? 'bg-gray-700 border-gray-600 text-gray-500 cursor-not-allowed'
                            : 'bg-gray-900 border-emerald-600 text-emerald-400 hover:bg-emerald-900/40 hover:text-emerald-300 hover:border-emerald-500 active:scale-95'
                        }`}
                >
                    <Video size={20} />
                    {isCreatingRoom ? 'Starting...' : 'New meeting'}
                </button>
                <div className="flex items-center w-full sm:w-auto">
                    <div className="relative flex-grow">
                        <span className="absolute inset-y-0 left-0 flex items-center pl-3">
                            <Keyboard size={20} className="text-gray-500" />
                        </span>
                        <input
                            type="text"
                            placeholder="Enter a code"
                            value={roomIdInput}
                            onChange={(e) => setRoomIdInput(e.target.value)}
                            className="w-full sm:w-64 pl-10 pr-4 py-3 border border-gray-700 rounded-xl bg-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-gray-100 placeholder-gray-500 transition duration-150 ease-in-out"
                            disabled={isConnecting || isLoading}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleJoin(); }}
                        />
                    </div>
                    <button
                        onClick={handleJoin}
                        disabled={!roomIdInput.trim() || isConnecting || isLoading}
                        className={`ml-2 px-4 py-3 rounded-full font-semibold transition-colors duration-200 ease-in-out active:scale-95 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 focus:ring-offset-gray-950 ${
                            !roomIdInput.trim() || isConnecting || isLoading
                                ? 'text-gray-600 cursor-not-allowed'
                                : 'text-emerald-500 hover:bg-emerald-500/10 hover:text-emerald-400'
                            } sm:ml-3`}
                    >
                        Join
                    </button>
                </div>
            </div>
            {(isLoading || isConnecting) && (
                <p className="mt-6 text-sm text-gray-400 animate-pulse">
                    {isCreatingRoom ? 'Starting your meeting...' : (isJoining ? 'Joining meeting...' : 'Connecting to service...')}
                </p>
            )}
        </div>
    );
}; 