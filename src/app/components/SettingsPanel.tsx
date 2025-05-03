'use client';

import React from 'react';

export type ResolutionPreset = {
    label: string;
    width: number;
    height: number;
};

export type QualityPresetConfig = {
    name: string;
    bitrate: number;
    resolutionIndex: number;
    fpsIndex: number;
};

export type CallStats = {
    totalSent: string;
    totalReceived: string;
    currentBitrate: string;
    packetLoss: string;
};

interface SettingsPanelProps {
    qualityPresets: QualityPresetConfig[];
    resolutionPresets: ResolutionPreset[];
    frameRatePresets: number[];
    minBitrateKbps: number;
    maxBitrateKbps: number;
    targetBitrateKbps: number;
    currentResolutionIndex: number;
    currentFrameRateIndex: number;
    callStats: CallStats | null;
    onApplyPreset: (presetName: 'Low' | 'Medium' | 'High') => void;
    onBitrateChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
    onResolutionChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
    onFrameRateChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
}

export const SettingsPanel = ({
    qualityPresets,
    resolutionPresets,
    frameRatePresets,
    minBitrateKbps,
    maxBitrateKbps,
    targetBitrateKbps,
    currentResolutionIndex,
    currentFrameRateIndex,
    callStats,
    onApplyPreset,
    onBitrateChange,
    onResolutionChange,
    onFrameRateChange,
}: SettingsPanelProps) => {
    return (
        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-3 w-64 bg-gray-800/90 backdrop-blur-sm rounded-lg shadow-xl p-4 flex flex-col gap-4 z-20">
            <h4 className="text-sm font-semibold text-gray-200 border-b border-gray-700 pb-1">Quality Presets</h4>
            <div className="flex justify-between gap-2">
                {qualityPresets.map(preset => (
                    <button
                        key={preset.name}
                        onClick={() => onApplyPreset(preset.name as 'Low' | 'Medium' | 'High')}
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
                        min={minBitrateKbps}
                        max={maxBitrateKbps}
                        value={targetBitrateKbps}
                        onChange={onBitrateChange}
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
                        max={resolutionPresets.length - 1}
                        step={1}
                        value={currentResolutionIndex}
                        onChange={onResolutionChange}
                        className="flex-grow h-1.5 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                        aria-label="Video resolution"
                    />
                    <span className="w-14 text-right font-mono text-gray-300">{resolutionPresets[currentResolutionIndex]?.label || 'N/A'}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-400">
                    <label htmlFor="fpsSlider" className="whitespace-nowrap w-10">FPS:</label>
                    <input
                        type="range"
                        id="fpsSlider"
                        min={0}
                        max={frameRatePresets.length - 1}
                        step={1}
                        value={currentFrameRateIndex}
                        onChange={onFrameRateChange}
                        className="flex-grow h-1.5 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                        aria-label="Video frame rate"
                    />
                    <span className="w-14 text-right font-mono text-gray-300">{frameRatePresets[currentFrameRateIndex]}</span>
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
    );
}; 