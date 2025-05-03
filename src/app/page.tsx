'use client';

import React from 'react';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useDebouncedCallback } from 'use-debounce'; // Import debounce hook
import { useWebRTC } from './hooks/useWebRTC';
import type { Instance as PeerInstance } from 'simple-peer'; // Import PeerInstance type
import { v4 as uuidv4 } from 'uuid'; // Import UUID for generating room IDs
import { Lobby } from './components/Lobby'; // Import the new component
import { Meeting } from './components/Meeting'; // Import the new component
import {
  // Video,          // Moved to Lobby
  // Keyboard,       // Moved to Lobby
  // Mic,             // Moved to Controls
  // MicOff,          // Moved to Controls
  // VideoOff,        // Moved to Controls
  // LogOut,          // Moved to Controls
  // ListFilter,      // Moved to Controls
  // RefreshCw,       // Moved to Controls
  // Settings        // Moved to Controls
} from 'lucide-react'; // Import icons
import { ToastContainer, toast } from 'react-toastify'; // Import react-toastify
import 'react-toastify/dist/ReactToastify.css'; // Import default CSS

// --- Resolution Presets ---
type ResolutionPreset = {
  label: string;
  width: number;
  height: number;
};

const RESOLUTION_PRESETS: ResolutionPreset[] = [
  { label: '360p', width: 640, height: 360 }, // Index 0
  { label: '480p', width: 854, height: 480 }, // Index 1
  { label: '720p', width: 1280, height: 720 }, // Index 2
  // { label: '1080p', width: 1920, height: 1080 }, // Optional
];
const DEFAULT_RESOLUTION_INDEX = 1; // Default to 480p (Index 1)
// ------------------------

// --- Frame Rate Presets ---
const FRAME_RATE_PRESETS: number[] = [15, 30, 60]; // Index 0, 1, 2
const DEFAULT_FRAME_RATE_INDEX = 1; // Default to 30fps (Index 1)
// -------------------------

// --- Quality Preset Definitions ---
// Type definitions moved to SettingsPanel.tsx
// export type QualityPresetConfig = {
//     name: string;
//     bitrate: number;
//     resolutionIndex: number;
//     fpsIndex: number;
// };

const QUALITY_PRESETS = [
  { name: 'Low', bitrate: 300, resolutionIndex: 0, fpsIndex: 0 }, // 360p, 15fps, 300kbps
  { name: 'Medium', bitrate: 800, resolutionIndex: 1, fpsIndex: 1 }, // 480p, 30fps, 800kbps (Default)
  { name: 'High', bitrate: 1500, resolutionIndex: 2, fpsIndex: 1 }, // 720p, 30fps, 1500kbps
];
// ------------------------------

export default function Home() {
  // const [roomId, setRoomId] = useState(''); // No longer needed for input, set during join
  const [currentJoinedRoomId, setCurrentJoinedRoomId] = useState(''); // Track the *actual* joined room
  const [userId, setUserId] = useState('');
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isJoining, setIsJoining] = useState(false);
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isVideoStopped, setIsVideoStopped] = useState(false);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [currentVideoDeviceId, setCurrentVideoDeviceId] = useState<string | null>(null);
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false);
  const [logs, setLogs] = useState<{ type: 'log' | 'error' | 'warn', message: string, timestamp: number }[]>([]);
  const previousWebSocketStateRef = useRef<string | null>(null);
  const [callStats, setCallStats] = useState<{
    totalSent: string;
    totalReceived: string;
    currentBitrate: string;
    packetLoss: string;
  } | null>(null);
  const [targetBitrateKbps, setTargetBitrateKbps] = useState<number>(QUALITY_PRESETS[1].bitrate); // Default Bitrate from Medium Preset
  const MIN_BITRATE_KBPS = 100;
  const MAX_BITRATE_KBPS = 2500;
  const [currentResolutionIndex, setCurrentResolutionIndex] = useState<number>(DEFAULT_RESOLUTION_INDEX);
  const [currentFrameRateIndex, setCurrentFrameRateIndex] = useState<number>(DEFAULT_FRAME_RATE_INDEX);

  // --- State for new Settings Panel --- // Moved to Meeting.tsx
  // const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  // ------------------------------------

  const addLog = useCallback((type: 'log' | 'error' | 'warn', ...args: unknown[]) => {
    const message = args.map(arg => {
        try {
            if (arg instanceof Error) return arg.message;
            if (typeof arg === 'object' && arg !== null) return JSON.stringify(arg);
            if (typeof arg === 'string') return arg;
            if (typeof arg === 'number' || typeof arg === 'boolean' || typeof arg === 'undefined' || typeof arg === 'symbol' || typeof arg === 'bigint') return String(arg);
            if (arg === null) return 'null';
             return typeof arg;
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (_error) {
            return '[Unserializable]';
        }
    }).join(' ');

    setLogs(prevLogs => [
        ...prevLogs.slice(-100),
        {
            type,
            message,
            timestamp: Date.now()
        }
    ]);
  }, []);

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

    return () => {
      console.log = originalLog;
      console.error = originalError;
      console.warn = originalWarn;
    };
  }, [addLog]);

  const handleRemoteStream = useCallback((peerId: string, stream: MediaStream) => {
    console.log('New remote stream received from:', peerId);
    setRemoteStreams(prev => new Map(prev).set(peerId, stream));
  }, []);

  const {
    joinRoom: rtcJoinRoom,
    leaveRoom: rtcLeaveRoom,
    isJoined,
    webSocketState,
    peers,
    setVideoBitrate
  } = useWebRTC({
    localStream,
    onRemoteStream: handleRemoteStream,
    onPeerDisconnect: (peerId: string) => handlePeerDisconnect(peerId),
  });

  const handlePeerDisconnect = useCallback((peerId: string) => {
    console.log('Peer disconnected:', peerId);
    setRemoteStreams(prev => {
      const newMap = new Map(prev);
      newMap.delete(peerId);
      return newMap;
    });
    if (peers.size <= 1) {
      setCallStats(null);
    }
  }, [peers]);

  const debouncedSetBitrate = useDebouncedCallback(
    async (bitrateKbps: number) => {
      if (setVideoBitrate && isJoined) {
        const bitrateBps = bitrateKbps * 1000;
        console.log(`Applying bitrate: ${bitrateBps} bps`);
        try {
          await setVideoBitrate(bitrateBps);
          console.log('Bitrate applied successfully.');
        } catch (error) {
           console.error('Failed to apply bitrate:', error);
           setError(`Failed to set bitrate: ${error instanceof Error ? error.message : String(error)}`);
        }
      } else {
         console.warn('Cannot set bitrate: Not joined or setVideoBitrate not available.');
      }
    },
    300
  );

  const handleBitrateChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newBitrate = parseInt(event.target.value, 10);
    setTargetBitrateKbps(newBitrate);
    debouncedSetBitrate(newBitrate);
  };

  const applyVideoTrackConstraints = useDebouncedCallback(
    async () => {
      const resIndex = currentResolutionIndex;
      const fpsIndex = currentFrameRateIndex;

      if (!localStream || !isJoined) {
        console.warn('Cannot apply constraints: No local stream or not joined.');
        return;
      }
      const videoTrack = localStream.getVideoTracks()[0];
      if (!videoTrack) {
        console.warn('Cannot apply constraints: No video track found.');
        return;
      }

      const selectedPreset = RESOLUTION_PRESETS[resIndex];
      const selectedFps = FRAME_RATE_PRESETS[fpsIndex];

      if (!selectedPreset || selectedFps === undefined) {
          console.error(`Invalid resolution/FPS preset index: Res ${resIndex}, FPS ${fpsIndex}`);
          return;
      }

      const constraints: MediaTrackConstraints = {
        width: { ideal: selectedPreset.width },
        height: { ideal: selectedPreset.height },
        frameRate: { ideal: selectedFps }
      };

      console.log(`Attempting to apply video constraints: ${JSON.stringify(constraints)}`);
      try {
        await videoTrack.applyConstraints(constraints);
        console.log('Successfully applied video constraints.');
      } catch (error) {
        console.error('Failed to apply video constraints:', error);
        setError(`Failed to apply constraints: ${error instanceof Error ? error.message : String(error)}. Check device support.`);
      }
    },
    500
  );

  const handleResolutionChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newIndex = parseInt(event.target.value, 10);
    setCurrentResolutionIndex(newIndex);
    applyVideoTrackConstraints();
  };

  const handleFrameRateChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newIndex = parseInt(event.target.value, 10);
    setCurrentFrameRateIndex(newIndex);
    applyVideoTrackConstraints();
  };

  const getMedia = useCallback(async (audio = true, video = true): Promise<MediaStream> => {
    setError(null);
    try {
      console.log(`Requesting local media... Audio: ${audio}, Video: ${video}`);
      localStream?.getTracks().forEach(track => track.stop());

      const resIndex = currentResolutionIndex;
      const fpsIndex = currentFrameRateIndex;
      const selectedPreset = RESOLUTION_PRESETS[resIndex];
      const selectedFps = FRAME_RATE_PRESETS[fpsIndex];

      const constraints: MediaStreamConstraints = {};
      if (audio) {
          constraints.audio = true;
      }
      if (video && selectedPreset && selectedFps !== undefined) {
          constraints.video = {
              width: { ideal: selectedPreset.width },
              height: { ideal: selectedPreset.height },
              frameRate: { ideal: selectedFps }
          };
          if (currentVideoDeviceId) {
              constraints.video.deviceId = { exact: currentVideoDeviceId };
          }
          console.log('Using initial video constraints:', constraints.video);
      } else if (video) {
          console.warn("Could not apply resolution/fps constraints during initial getMedia, requesting default video.");
          constraints.video = true;
      }

      if (!audio && !video) {
        setLocalStream(null);
        console.log('Cleared local media as audio and video are false.');
        throw new Error("Cannot get media with audio and video both false.");
      }

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      console.log('Local media obtained:', stream.id);
      setLocalStream(stream);

      setIsMicMuted(false);
      setIsVideoStopped(false);

      return stream;
    } catch (err) {
      console.error('Failed to get local stream:', err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      const userFriendlyError = `Failed to get camera/microphone: ${errorMessage}. Please check permissions and device support.`;
      setError(userFriendlyError);
      setLocalStream(null);
      throw new Error(userFriendlyError);
    }
  }, [localStream, currentResolutionIndex, currentFrameRateIndex, currentVideoDeviceId]);

  useEffect(() => {
    if (typeof window !== 'undefined' && !userId) {
        setUserId(`user_${Math.random().toString(36).substring(2, 9)}`);
    }
  }, [userId]);

  useEffect(() => {
    if (!localStream || typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) {
      return;
    }

    const enumerateAndSet = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoInputs = devices.filter(device => device.kind === 'videoinput');
        
        setVideoDevices(videoInputs);
        setHasMultipleCameras(videoInputs.length > 1);

        const currentTrack = localStream.getVideoTracks()[0];
        if (currentTrack) {
          const currentSettings = currentTrack.getSettings();
          if (currentSettings.deviceId && !currentVideoDeviceId) {
            setCurrentVideoDeviceId(currentSettings.deviceId);
          }
        }
      } catch (err) {
        console.error('Error enumerating devices:', err);
        setHasMultipleCameras(false);
      }
    };

    enumerateAndSet();
  }, [localStream]);

  useEffect(() => {
    // This effect handles re-acquiring media when the selected camera device changes.
    if (currentVideoDeviceId && localStream && hasMultipleCameras) {
      const currentTrackDeviceId = localStream.getVideoTracks()[0]?.getSettings().deviceId;
      // Only re-acquire if the desired device ID is different from the current track's device ID
      if (currentTrackDeviceId && currentTrackDeviceId !== currentVideoDeviceId) {
        console.log(`Switching camera device. Re-acquiring media for device: ${currentVideoDeviceId}`);
        getMedia().catch(err => {
            console.error("Error getting media after device switch:", err);
            setError(`Failed to switch camera: ${err.message}`);
        });
      }
    }
    // Add currentVideoDeviceId to the dependency array as it's used in the effect's logic.
  }, [localStream, hasMultipleCameras, getMedia, currentVideoDeviceId]);

  const initiateJoin = useCallback(async (targetRoomId: string) => {
    if (!targetRoomId.trim()) {
      setError('Room ID cannot be empty.');
      return;
    }
    if (isJoining || isJoined) return;

    setError(null);
    setIsJoining(true);

    let currentUserId = userId;
    if (!currentUserId) {
        currentUserId = `user_${Math.random().toString(36).substring(2, 9)}`;
        setUserId(currentUserId);
    }

    try {
      console.log('Attempting to get media before joining...');
      const stream = await getMedia();

      if (!stream) {
         throw new Error('Media stream not available after request.');
      }

      // setRoomId(targetRoomId); // Set the actual joined room ID state
      setCurrentJoinedRoomId(targetRoomId);
      console.log(`Media acquired, calling rtcJoinRoom for room: ${targetRoomId}, user: ${currentUserId}`);
      rtcJoinRoom({ roomId: targetRoomId, userId: currentUserId });

      debouncedSetBitrate(targetBitrateKbps);

      // setIsCreatingRoom(false); // This is set by the isJoined effect
      // setIsJoined(true); // This state comes from useWebRTC, don't set it manually here
    } catch (err) {
      console.error(`Failed to join room ${targetRoomId}:`, err);
       if (!error) {
           const errorMessage = err instanceof Error ? err.message : String(err);
           setError(`Failed to join room: ${errorMessage}. Check permissions?`);
       }
      setIsJoining(false);
      // setIsCreatingRoom(false); // This is set by the isJoined effect
    }
  }, [userId, isJoining, isJoined, getMedia, rtcJoinRoom, /* setRoomId, */ setError, error, setUserId, debouncedSetBitrate, targetBitrateKbps]);

  const handleNewMeeting = useCallback(async () => {
     if (webSocketState !== 'OPEN') {
         setError("Cannot start meeting: Connection issue. Please wait.");
         return;
     }
    if (isJoining || isCreatingRoom) return;

    setIsCreatingRoom(true);
    setIsJoining(true);
    const newRoomId = uuidv4().substring(0, 8);
    await initiateJoin(newRoomId);
  }, [webSocketState, isJoining, isCreatingRoom, initiateJoin, setError]);

  const handleJoinRoomRequest = useCallback(async (requestedRoomId: string) => {
     if (webSocketState !== 'OPEN') {
         setError("Cannot join meeting: Connection issue. Please wait.");
         return;
     }
    if (isJoining || !requestedRoomId.trim()) return;
    // Do not set roomId state here, initiateJoin will set currentJoinedRoomId on success
    await initiateJoin(requestedRoomId);
  }, [webSocketState, isJoining, initiateJoin, setError]);

  const handleLeaveRoom = () => {
    rtcLeaveRoom();
    setIsJoining(false);
    setRemoteStreams(new Map());
    setIsMicMuted(false);
    setIsVideoStopped(false);
    localStream?.getTracks().forEach(track => track.stop());
    setLocalStream(null);
    setCallStats(null);
    setCurrentJoinedRoomId(''); // Clear joined room ID on leave
  };
  
  useEffect(() => {
    if(isJoined) {
      setIsJoining(false);
      setIsCreatingRoom(false);
    }
  }, [isJoined]);

  const toggleMic = useCallback(() => {
    if (localStream) {
        let muted = false;
        localStream.getAudioTracks().forEach(track => {
            track.enabled = !track.enabled;
            muted = !track.enabled;
        });
        setIsMicMuted(muted);
    }
  }, [localStream]);

  const toggleVideo = useCallback(() => {
    if (localStream) {
        let stopped = false;
        localStream.getVideoTracks().forEach(track => {
            track.enabled = !track.enabled;
            stopped = !track.enabled;
        });
        setIsVideoStopped(stopped);
    }
  }, [localStream]);

  const switchCamera = useCallback(() => {
    if (!hasMultipleCameras || videoDevices.length < 2) return;

    const currentDeviceIndex = videoDevices.findIndex(device => device.deviceId === currentVideoDeviceId);
    const nextDeviceIndex = (currentDeviceIndex + 1) % videoDevices.length;
    const nextDeviceId = videoDevices[nextDeviceIndex]?.deviceId;

    if (nextDeviceId && nextDeviceId !== currentVideoDeviceId) {
      setCurrentVideoDeviceId(nextDeviceId);
    }
  }, [hasMultipleCameras, videoDevices, currentVideoDeviceId]);

  const logPeerStats = useCallback(async () => {
    if (!isJoined || peers.size === 0) {
      addLog('warn', 'Cannot get stats: Not in a room or no peers connected.');
      setCallStats(null);
      return;
    }

    addLog('log', '--- Fetching WebRTC Stats ---');
    let totalAggregatedSent = 0;
    let totalAggregatedReceived = 0;
    let totalAggregatedBitrate = 0;
    let totalAggregatedPacketLoss = 0;
    let peerCount = 0;

    for (const [peerId, peerData] of peers.entries()) {
      if (peerData.peer) {
        try {
          const pc = (peerData.peer as PeerInstance & { _pc: RTCPeerConnection })._pc;
          const stats = await pc.getStats();
          let currentPeerBytesSent = 0;
          let currentPeerBytesReceived = 0;
          let currentPeerBitrate = 0;
          let currentPeerPacketLoss = 0;

          stats.forEach(report => {
            if (report.type === 'outbound-rtp' && report.kind === 'video') {
              currentPeerBytesSent += report.bytesSent || 0;
            }
            if (report.type === 'inbound-rtp' && report.kind === 'video') {
              currentPeerBytesReceived += report.bytesReceived || 0;
            }
            if (report.type === 'candidate-pair' && report.nominated && report.state === 'succeeded') {
                currentPeerBitrate = report.availableOutgoingBitrate || currentPeerBitrate;
            }
            if (report.type === 'inbound-rtp' && report.kind === 'video') {
                if (report.packetsReceived && report.packetsLost) {
                    const totalPackets = report.packetsReceived + report.packetsLost;
                    if (totalPackets > 0) {
                        currentPeerPacketLoss = (report.packetsLost / totalPackets) * 100;
                    }
                }
            }
          });

          const sentMB = currentPeerBytesSent / (1024 * 1024);
          const receivedMB = currentPeerBytesReceived / (1024 * 1024);
          const currentMbps = currentPeerBitrate / 1e6;

          addLog('log', `Peer ${peerId.substring(0, 6)}: Sent: ${sentMB.toFixed(2)} MB, Received: ${receivedMB.toFixed(2)} MB, Outgoing Bitrate: ${currentMbps.toFixed(2)} Mbps, Packet Loss (In): ${currentPeerPacketLoss.toFixed(2)}%`);

          totalAggregatedSent += sentMB;
          totalAggregatedReceived += receivedMB;
          totalAggregatedBitrate += currentMbps;
          totalAggregatedPacketLoss += currentPeerPacketLoss;
          peerCount++;

        } catch (error) {
          addLog('error', `Failed to get stats for peer ${peerId}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }
    addLog('log', '--- Finished Fetching Stats ---');

    const avgPacketLoss = peerCount > 0 ? totalAggregatedPacketLoss / peerCount : 0;

    setCallStats({
      totalSent: totalAggregatedSent.toFixed(2) + ' MB',
      totalReceived: totalAggregatedReceived.toFixed(2) + ' MB',
      currentBitrate: totalAggregatedBitrate.toFixed(2) + ' Mbps',
      packetLoss: avgPacketLoss.toFixed(2) + '%'
    });

  }, [peers, isJoined, addLog]);

  const handleApplyPreset = useCallback((presetName: 'Low' | 'Medium' | 'High') => {
    const preset = QUALITY_PRESETS.find(p => p.name === presetName);
    if (!preset) {
        console.error(`Preset ${presetName} not found.`);
        return;
    }

    console.log(`Applying preset: ${presetName}`, preset);

    setTargetBitrateKbps(preset.bitrate);
    setCurrentResolutionIndex(preset.resolutionIndex);
    setCurrentFrameRateIndex(preset.fpsIndex);

    debouncedSetBitrate(preset.bitrate);
    applyVideoTrackConstraints();

    // setShowSettingsPanel(false); // This is handled within Meeting component now

  }, [debouncedSetBitrate, applyVideoTrackConstraints]); // Removed setShowSettingsPanel dependency

  const isLoading = isJoining || isCreatingRoom;
  const isConnecting = webSocketState !== 'OPEN' && webSocketState !== 'CLOSED';

  useEffect(() => {
    if (error) {
      toast.error(error, { toastId: `error-${Date.now()}` });
      setError(null);
    }
  }, [error]);

  useEffect(() => {
    if (
      previousWebSocketStateRef.current !== null &&
      previousWebSocketStateRef.current !== 'CLOSED' &&
      webSocketState === 'CLOSED' &&
      !isJoining &&
      !isCreatingRoom &&
      !isJoined
    ) {
      toast.error("Connection failed. Please check internet or try again.", { toastId: 'ws-conn-failed' }); 
    }
    previousWebSocketStateRef.current = webSocketState;
  }, [webSocketState, isJoining, isCreatingRoom, isJoined]);

  return (
    <div className={`min-h-screen flex flex-col ${!isJoined ? 'bg-gray-950 text-gray-200' : 'bg-gray-900 text-gray-200'}`}> 
      <ToastContainer
        position="bottom-right"
        autoClose={5000}
        hideProgressBar={false}
        newestOnTop={false}
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
        theme="dark"
      />

      <main className="flex-grow p-0 flex flex-col">
        {!isJoined ? (
          <Lobby
            isConnecting={isConnecting}
            isLoading={isLoading}
            isCreatingRoom={isCreatingRoom}
            isJoining={isJoining}
            onCreateRoom={handleNewMeeting}
            onJoinRoom={handleJoinRoomRequest}
          />
        ) : (
          <Meeting
            localStream={localStream}
            remoteStreams={remoteStreams}
            userId={userId}
            isMicMuted={isMicMuted}
            isVideoStopped={isVideoStopped}
            hasMultipleCameras={hasMultipleCameras}
            callStats={callStats}
            logs={logs}
            qualityPresets={QUALITY_PRESETS}
            resolutionPresets={RESOLUTION_PRESETS}
            frameRatePresets={FRAME_RATE_PRESETS}
            minBitrateKbps={MIN_BITRATE_KBPS}
            maxBitrateKbps={MAX_BITRATE_KBPS}
            targetBitrateKbps={targetBitrateKbps}
            currentResolutionIndex={currentResolutionIndex}
            currentFrameRateIndex={currentFrameRateIndex}
            onToggleMic={toggleMic}
            onToggleVideo={toggleVideo}
            onSwitchCamera={switchCamera}
            onLeaveRoom={handleLeaveRoom}
            onGetStats={logPeerStats}
            onApplyPreset={handleApplyPreset} // Pass the handler down
            onBitrateChange={handleBitrateChange}
            onResolutionChange={handleResolutionChange}
            onFrameRateChange={handleFrameRateChange}
          />
        )}
      </main>
    </div>
  );
}
