'use client';

import React from 'react';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useDebouncedCallback } from 'use-debounce'; // Import debounce hook
import { useWebRTC } from './hooks/useWebRTC';
import type { Instance as PeerInstance } from 'simple-peer'; // Import PeerInstance type
import { v4 as uuidv4 } from 'uuid'; // Import UUID for generating room IDs
import { 
  Video, 
  Keyboard, 
  Mic,             // Added
  MicOff,          // Added
  VideoOff,        // Added
  LogOut,          // Added
  ListFilter,      // Added
  BarChartHorizontal, // Added
  X,               // Added
  RefreshCw,       // Added
  Settings        // Added Settings icon
} from 'lucide-react'; // Import icons
import { ToastContainer, toast } from 'react-toastify'; // Import react-toastify
import 'react-toastify/dist/ReactToastify.css'; // Import default CSS

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
type QualityPresetConfig = {
  name: string;
  bitrate: number;
  resolutionIndex: number;
  fpsIndex: number;
};

const QUALITY_PRESETS: QualityPresetConfig[] = [
  { name: 'Low', bitrate: 300, resolutionIndex: 0, fpsIndex: 0 }, // 360p, 15fps, 300kbps
  { name: 'Medium', bitrate: 800, resolutionIndex: 1, fpsIndex: 1 }, // 480p, 30fps, 800kbps (Default)
  { name: 'High', bitrate: 1500, resolutionIndex: 2, fpsIndex: 1 }, // 720p, 30fps, 1500kbps
];
// ------------------------------

export default function Home() {
  const [roomId, setRoomId] = useState('');
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
  const [showLogs, setShowLogs] = useState(false);
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

  // --- State for new Settings Panel ---
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
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
    if (currentVideoDeviceId && localStream && hasMultipleCameras) {
      const currentTrackDeviceId = localStream.getVideoTracks()[0]?.getSettings().deviceId;
      if (currentTrackDeviceId && currentTrackDeviceId !== currentVideoDeviceId) {
        console.log(`Switching camera device. Re-acquiring media for device: ${currentVideoDeviceId}`);
        getMedia().catch(err => {
            console.error("Error getting media after device switch:", err);
            setError(`Failed to switch camera: ${err.message}`);
        });
      }
    }
  }, [currentVideoDeviceId, localStream, hasMultipleCameras, getMedia]);

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

      setRoomId(targetRoomId);
      console.log(`Media acquired, calling rtcJoinRoom for room: ${targetRoomId}, user: ${currentUserId}`);
      rtcJoinRoom({ roomId: targetRoomId, userId: currentUserId });

      debouncedSetBitrate(targetBitrateKbps);

    } catch (err) {
      console.error(`Failed to join room ${targetRoomId}:`, err);
       if (!error) {
           const errorMessage = err instanceof Error ? err.message : String(err);
           setError(`Failed to join room: ${errorMessage}. Check permissions?`);
       }
      setIsJoining(false);
      setIsCreatingRoom(false);
    }
  }, [userId, isJoining, isJoined, getMedia, rtcJoinRoom, setRoomId, setError, error, setUserId, debouncedSetBitrate, targetBitrateKbps]);

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

  const handleJoinExistingRoom = useCallback(async () => {
     if (webSocketState !== 'OPEN') {
         setError("Cannot join meeting: Connection issue. Please wait.");
         return;
     }
    if (isJoining || !roomId.trim()) return;
    await initiateJoin(roomId);
  }, [webSocketState, isJoining, roomId, initiateJoin, setError]);

  const handleLeaveRoom = () => {
    rtcLeaveRoom();
    setIsJoining(false);
    setRemoteStreams(new Map());
    setIsMicMuted(false);
    setIsVideoStopped(false);
    localStream?.getTracks().forEach(track => track.stop());
    setLocalStream(null);
    setShowLogs(false);
    setShowSettingsPanel(false);
    setCallStats(null);
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

  const LogWindow = ({
    logs: currentLogs,
    onClose,
    onGetStats,
  }: {
    logs: { type: 'log' | 'error' | 'warn', message: string, timestamp: number }[];
    onClose: () => void;
    onGetStats: () => void;
  }) => {
    const logContentRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      if (logContentRef.current) {
        logContentRef.current.scrollTop = logContentRef.current.scrollHeight;
      }
    }, [currentLogs]);

    const formatTimestamp = (timestamp: number) => {
      const date = new Date(timestamp);
      return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}.${date.getMilliseconds().toString().padStart(3, '0')}`;
    };

    return (
      <div className="log-window bg-gray-800 border border-gray-700 rounded-lg shadow-lg text-gray-300 w-full max-w-2xl mx-auto"> 
        <div className="log-header flex justify-between items-center p-2 border-b border-gray-700">
          <h3 className="text-base font-semibold text-gray-100 ml-2">Console Logs & Stats</h3>
          <div className="flex items-center gap-1">
             <button 
                onClick={onGetStats} 
                className="p-1.5 rounded-full text-gray-400 hover:bg-gray-700/50 hover:text-emerald-400 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 focus:ring-offset-gray-800 transition-colors" 
                title="Fetch WebRTC Stats"
             >
                <BarChartHorizontal size={18} />
             </button>
             <button 
                onClick={onClose} 
                className="p-1.5 rounded-full text-gray-400 hover:bg-gray-700/50 hover:text-red-400 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 focus:ring-offset-gray-800 transition-colors" 
                title="Close Logs"
             >
                <X size={18} />
             </button>
          </div>
        </div>
        <div className="log-content p-3 text-xs max-h-48 overflow-y-auto font-mono" ref={logContentRef}>
          {currentLogs.length === 0 ? (
            <p className="no-logs text-gray-500 italic">No logs yet. Join a room and click Get Stats.</p>
          ) : (
            currentLogs.map((log, index) => (
              <div key={index} className={`log-entry flex gap-2 mb-0.5`}>
                <span className="log-timestamp text-gray-500 flex-shrink-0">{formatTimestamp(log.timestamp)}</span>
                <span className={`log-message break-all ${
                  log.type === 'error' ? 'text-red-400' : log.type === 'warn' ? 'text-yellow-400' : 'text-gray-300'
                }`}>{log.message}</span>
              </div>
            ))
          )}
        </div>
      </div>
    );
  };

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

      setShowSettingsPanel(false);

  }, [debouncedSetBitrate, applyVideoTrackConstraints]);

  const participantCount = remoteStreams.size + 1;
  let gridCols = 'grid-cols-1';
  let gridRows = 'grid-rows-1';
  const videoHeightClass = 'h-full';
  const aspectRatioClass = 'aspect-video';

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
  } else {
      gridCols = 'grid-cols-4';
      gridRows = 'grid-rows-auto';
  }

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
          <div className="flex-grow flex flex-col items-center justify-center text-center px-4">
            <h1 className="text-4xl sm:text-5xl text-gray-100 font-semibold mb-3">
              Connect with friends, instantly.
            </h1>
            <p className="text-base sm:text-lg text-gray-400 mb-10 sm:mb-12 max-w-xl">
              Simple, secure P2P video calls powered by WebRTC. No servers involved in media transmission.
            </p>
            <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-4">
              <button
                onClick={handleNewMeeting}
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
                      value={roomId}
                      onChange={(e) => setRoomId(e.target.value.trim().toLowerCase())}
                      className="w-full sm:w-64 pl-10 pr-4 py-3 border border-gray-700 rounded-xl bg-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-gray-100 placeholder-gray-500 transition duration-150 ease-in-out"
                      disabled={isConnecting || isLoading}
                      onKeyDown={(e) => { if (e.key === 'Enter' && roomId.trim()) handleJoinExistingRoom(); }}
                    />
                </div>
                 <button
                    onClick={handleJoinExistingRoom}
                    disabled={!roomId.trim() || isConnecting || isLoading}
                    className={`ml-2 px-4 py-3 rounded-full font-semibold transition-colors duration-200 ease-in-out active:scale-95 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 focus:ring-offset-gray-950 ${
                      !roomId.trim() || isConnecting || isLoading
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
        ) : (
          <div className="flex-grow flex flex-col bg-gray-900 relative"> 
            <div className={`flex-grow grid gap-1 sm:gap-2 ${gridCols} ${gridRows} content-center items-center overflow-hidden`}>
                <div className={`relative bg-black rounded-md overflow-hidden shadow-md ${videoHeightClass} w-full flex items-center justify-center`}>
                    <VideoPlayer stream={localStream} muted={true} className={`w-full h-full object-cover transform -scale-x-100 ${aspectRatioClass}`} />
                    <div className="absolute bottom-1 left-1 sm:bottom-2 sm:left-2 bg-black bg-opacity-60 text-white text-[0.6rem] sm:text-xs px-1.5 py-0.5 sm:px-2 sm:py-1 rounded"> 
                    {userId} (You) {isMicMuted ? ' [MUTED]' : ''}{isVideoStopped ? ' [CAM OFF]' : ''}
                    </div>
                </div>

                {Array.from(remoteStreams.entries()).map(([peerId, stream]) => (
                    <div key={peerId} className={`relative bg-black rounded-md overflow-hidden shadow-md ${videoHeightClass} w-full flex items-center justify-center`}>
                    <VideoPlayer stream={stream} className={`w-full h-full object-cover ${aspectRatioClass}`} />
                    <div className="absolute bottom-1 left-1 sm:bottom-2 sm:left-2 bg-black bg-opacity-60 text-white text-[0.6rem] sm:text-xs px-1.5 py-0.5 sm:px-2 sm:py-1 rounded">
                        {peerId.substring(0, 8)}
                    </div>
                    </div>
                ))}
            </div>

            <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-30">
                {showSettingsPanel && (
                    <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-3 w-64 bg-gray-800/90 backdrop-blur-sm rounded-lg shadow-xl p-4 flex flex-col gap-4 z-20">
                        <h4 className="text-sm font-semibold text-gray-200 border-b border-gray-700 pb-1">Quality Presets</h4>
                         <div className="flex justify-between gap-2">
                             {QUALITY_PRESETS.map(preset => (
                                <button
                                    key={preset.name}
                                    onClick={() => handleApplyPreset(preset.name as 'Low' | 'Medium' | 'High')}
                                    className="flex-1 px-2 py-1.5 text-xs rounded-md bg-gray-700 hover:bg-emerald-700 text-gray-200 hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-gray-800"
                                >
                                    {preset.name}
                                </button>
                             ))}
                         </div>

                         <h4 className="text-sm font-semibold text-gray-200 border-b border-gray-700 pb-1 pt-2">Advanced Settings</h4>
                         <div className="flex flex-col gap-3">
                            <div className="flex items-center gap-2 text-xs text-gray-400"> 
                                <label htmlFor="bitrateSlider" className="whitespace-nowrap w-10">Bitrate:</label>
                                <input
                                type="range"
                                id="bitrateSlider"
                                min={MIN_BITRATE_KBPS}
                                max={MAX_BITRATE_KBPS}
                                value={targetBitrateKbps}
                                onChange={handleBitrateChange}
                                className="flex-grow h-1.5 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                                aria-label="Maximum video bitrate"
                                />
                                <span className="w-14 text-right font-mono text-gray-300">{targetBitrateKbps} kbps</span>
                             </div>
                            <div className="flex items-center gap-2 text-xs text-gray-400">
                                <label htmlFor="resolutionSlider" className="whitespace-nowrap w-10">Res:</label>
                                <input
                                type="range"
                                id="resolutionSlider"
                                min={0}
                                max={RESOLUTION_PRESETS.length - 1}
                                step={1}
                                value={currentResolutionIndex}
                                onChange={handleResolutionChange}
                                className="flex-grow h-1.5 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-emerald-500" 
                                aria-label="Video resolution"
                                />
                                <span className="w-14 text-right font-mono text-gray-300">{RESOLUTION_PRESETS[currentResolutionIndex]?.label || 'N/A'}</span>
                             </div>
                            <div className="flex items-center gap-2 text-xs text-gray-400">
                                <label htmlFor="fpsSlider" className="whitespace-nowrap w-10">FPS:</label>
                                <input
                                type="range"
                                id="fpsSlider"
                                min={0}
                                max={FRAME_RATE_PRESETS.length - 1}
                                step={1}
                                value={currentFrameRateIndex}
                                onChange={handleFrameRateChange}
                                className="flex-grow h-1.5 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-emerald-500" 
                                aria-label="Video frame rate"
                                />
                                <span className="w-14 text-right font-mono text-gray-300">{FRAME_RATE_PRESETS[currentFrameRateIndex]}</span>
                             </div>
                         </div>

                         {callStats && (
                            <div className="text-xs text-gray-400 border-t border-gray-700 pt-2 mt-2 flex flex-col items-start">
                                <span>TX: {callStats.totalSent} | RX: {callStats.totalReceived}</span>
                                <span>Bitrate (Available Out): {callStats.currentBitrate}</span>
                                <span>Packet Loss (In): {callStats.packetLoss}</span>
                            </div>
                         )}
                    </div>
                )}

                <div className="flex items-center justify-center gap-3 sm:gap-4 bg-gray-900/70 backdrop-blur-sm p-2 sm:p-3 rounded-full shadow-lg border border-gray-700/50">
                    <button
                        onClick={toggleMic}
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
                        onClick={toggleVideo}
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
                        onClick={() => setShowSettingsPanel(!showSettingsPanel)}
                        title="Quality Settings"
                        className={`p-2 sm:p-3 rounded-full transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 focus:ring-offset-gray-900/80 ${
                            showSettingsPanel ? 'bg-emerald-700 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-200'
                        }`}
                    >
                        <Settings size={18} />
                    </button>

                    {hasMultipleCameras && (
                        <button
                        onClick={switchCamera}
                        title="Switch Camera"
                        className="p-2 sm:p-3 rounded-full bg-gray-700 hover:bg-gray-600 text-gray-200 transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 focus:ring-offset-gray-900/80"
                        >
                        <RefreshCw size={18} />
                        </button>
                    )}

                     <button
                        onClick={() => setShowLogs(!showLogs)}
                        title={showLogs ? 'Hide Logs' : 'Show Logs'}
                        className="p-2 sm:p-3 rounded-full bg-gray-700 hover:bg-gray-600 text-gray-200 transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 focus:ring-offset-gray-900/80"
                     >
                        <ListFilter size={18} />
                     </button>

                    <button
                        onClick={handleLeaveRoom}
                        title="Leave Room"
                        className="p-2 sm:p-3 rounded-full bg-red-600 hover:bg-red-500 text-white transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 focus:ring-offset-gray-900/80"
                    >
                        <LogOut size={18} />
                    </button>
                </div>
             </div>

            {showLogs && (
                <div className="absolute bottom-0 left-0 right-0 p-4 z-20 pointer-events-none">
                   <div className="pointer-events-auto">
                       <LogWindow
                           logs={logs}
                           onClose={() => setShowLogs(false)}
                           onGetStats={logPeerStats}
                       />
                   </div>
                </div>
            )}

          </div>
        )}
      </main>
    </div>
  );
}
