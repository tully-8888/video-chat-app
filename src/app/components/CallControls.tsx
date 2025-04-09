import { useState, useEffect } from 'react';

type CallControlsProps = {
  onToggleAudio: () => void;
  onToggleVideo: () => void;
  onEndCall: () => void;
  isAudioEnabled: boolean;
  isVideoEnabled: boolean;
};

export default function CallControls({
  onToggleAudio,
  onToggleVideo,
  onEndCall,
  isAudioEnabled,
  isVideoEnabled,
}: CallControlsProps) {
  const [showEndCallConfirm, setShowEndCallConfirm] = useState(false);
  const [animateButtons, setAnimateButtons] = useState(false);

  // Trigger entrance animation on mount
  useEffect(() => {
    setAnimateButtons(true);
  }, []);

  const handleEndCall = () => {
    if (showEndCallConfirm) {
      onEndCall();
      setShowEndCallConfirm(false);
    } else {
      setShowEndCallConfirm(true);
      // Auto-hide confirmation after 3 seconds
      setTimeout(() => setShowEndCallConfirm(false), 3000);
    }
  };

  return (
    <div className="relative">
      <div className="flex items-center justify-center gap-6 px-8 py-5 bg-gray-900/80 backdrop-blur-lg rounded-2xl shadow-xl border border-gray-700/50 transition-all duration-300">
        {/* Audio button */}
        <button
          onClick={onToggleAudio}
          className={`relative p-4 rounded-full transition-all duration-300 ease-in-out transform ${
            animateButtons ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'
          } ${
            isAudioEnabled 
              ? 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 hover:shadow-lg hover:shadow-indigo-500/25' 
              : 'bg-gradient-to-r from-red-600 to-pink-600 hover:from-red-700 hover:to-pink-700 hover:shadow-lg hover:shadow-red-500/25'
          } group`}
          aria-label={isAudioEnabled ? 'Mute microphone' : 'Unmute microphone'}
          style={{ transitionDelay: '100ms' }}
        >
          <span className={`absolute -top-10 left-1/2 -translate-x-1/2 whitespace-nowrap bg-gray-900/90 backdrop-blur-md text-white text-xs py-1 px-2 rounded-md opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none ${isAudioEnabled ? 'after:border-t-indigo-600' : 'after:border-t-red-500'}`}>
            {isAudioEnabled ? 'Mute' : 'Unmute'}
          </span>
          <div className="relative">
            {isAudioEnabled ? (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" clipRule="evenodd" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
              </svg>
            )}
            <span className={`absolute top-0 left-0 right-0 bottom-0 bg-white rounded-full transform scale-0 opacity-20 transition-transform duration-300 ${isAudioEnabled ? 'group-active:scale-150' : ''}`}></span>
          </div>
        </button>
        
        {/* Video button */}
        <button
          onClick={onToggleVideo}
          className={`relative p-4 rounded-full transition-all duration-300 ease-in-out transform ${
            animateButtons ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'
          } ${
            isVideoEnabled 
              ? 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 hover:shadow-lg hover:shadow-indigo-500/25' 
              : 'bg-gradient-to-r from-red-600 to-pink-600 hover:from-red-700 hover:to-pink-700 hover:shadow-lg hover:shadow-red-500/25'
          } group`}
          aria-label={isVideoEnabled ? 'Turn off camera' : 'Turn on camera'}
          style={{ transitionDelay: '200ms' }}
        >
          <span className={`absolute -top-10 left-1/2 -translate-x-1/2 whitespace-nowrap bg-gray-900/90 backdrop-blur-md text-white text-xs py-1 px-2 rounded-md opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none ${isVideoEnabled ? 'after:border-t-indigo-600' : 'after:border-t-red-500'}`}>
            {isVideoEnabled ? 'Turn off camera' : 'Turn on camera'}
          </span>
          <div className="relative">
            {isVideoEnabled ? (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>
            )}
            <span className={`absolute top-0 left-0 right-0 bottom-0 bg-white rounded-full transform scale-0 opacity-20 transition-transform duration-300 ${isVideoEnabled ? 'group-active:scale-150' : ''}`}></span>
          </div>
        </button>

        {/* End call button */}
        <button
          onClick={handleEndCall}
          className={`relative p-4 rounded-full transition-all duration-300 ease-in-out transform ${
            animateButtons ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'
          } ${
            showEndCallConfirm 
              ? 'bg-gradient-to-r from-red-600 to-rose-600 animate-pulse shadow-lg shadow-red-500/30' 
              : 'bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 hover:shadow-lg hover:shadow-red-500/25'
          } group`}
          aria-label="End call"
          style={{ transitionDelay: '300ms' }}
        >
          <span className="absolute -top-10 left-1/2 -translate-x-1/2 whitespace-nowrap bg-gray-900/90 backdrop-blur-md text-white text-xs py-1 px-2 rounded-md opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
            {showEndCallConfirm ? 'Confirm end call' : 'End call'}
          </span>
          <div className="relative">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z" />
            </svg>
            <span className="absolute top-0 left-0 right-0 bottom-0 bg-white rounded-full transform scale-0 opacity-20 transition-transform duration-300 group-active:scale-150"></span>
          </div>
        </button>
      </div>
    </div>
  );
} 