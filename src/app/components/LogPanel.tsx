'use client';

import React, { useEffect, useRef } from 'react';
import { BarChartHorizontal, X } from 'lucide-react';

export interface Log {
  type: 'log' | 'error' | 'warn';
  message: string;
  timestamp: number;
}

interface LogPanelProps {
  logs: Log[];
  onClose: () => void;
  onGetStats: () => void;
}

export const LogPanel = ({ logs: currentLogs, onClose, onGetStats }: LogPanelProps) => {
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
    <div className="log-window bg-gray-800 border border-gray-700 rounded-lg shadow-lg text-gray-300 w-full max-w-2xl mx-auto pointer-events-auto">
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
              <span className={`log-message break-all ${log.type === 'error' ? 'text-red-400' : log.type === 'warn' ? 'text-yellow-400' : 'text-gray-300'
                }`}>{log.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}; 