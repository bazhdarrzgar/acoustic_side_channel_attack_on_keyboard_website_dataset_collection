'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, Square, Pause, Play, Keyboard, Sun, Moon, CheckCircle2, History, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import Visualizer from './Visualizer';
import { bufferToWav } from '@/lib/wav-utils';
import { motion, AnimatePresence } from 'framer-motion';

export default function Recorder() {
    const [isRecording, setIsRecording] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [theme, setTheme] = useState<'dark' | 'light'>('dark');
    const [logs, setLogs] = useState<{ id: string; msg: string; type: 'info' | 'success' | 'error'; timestamp: string }[]>([]);
    const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
    const [computerModel, setComputerModel] = useState('');
    const [sessionStartTime, setSessionStartTime] = useState<string>('');
    const [showModelError, setShowModelError] = useState(false);
    const [isDetected, setIsDetected] = useState(false);
    const [activeKey, setActiveKey] = useState<string | null>(null);
    const [keyCounts, setKeyCounts] = useState<Record<string, number>>({});
    const [zoom, setZoom] = useState(0.9);

    const audioCtxRef = useRef<AudioContext | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const bufferRef = useRef<Float32Array | null>(null);
    const writeIndexRef = useRef(0);
    const sampleRateRef = useRef(44100);
    const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
    const lastKeyPressTimesRef = useRef<number[]>([]);

    const addLog = (msg: string, type: 'info' | 'success' | 'error' = 'info') => {
        const timestamp = new Date().toLocaleTimeString();
        setLogs(prev => [{ id: Math.random().toString(36).substr(2, 9), msg, type, timestamp }, ...prev].slice(0, 50));
    };

    const toggleTheme = () => {
        const newTheme = theme === 'dark' ? 'light' : 'dark';
        setTheme(newTheme);
        document.documentElement.setAttribute('data-theme', newTheme);
    };

    useEffect(() => {
        const detectSystem = async () => {
            let model = 'Unknown';
            let name = 'User-PC';

            // Try to get model from User Agent Data (Modern browsers)
            if ((navigator as any).userAgentData) {
                try {
                    const highEntropy = await (navigator as any).userAgentData.getHighEntropyValues(['model', 'platform', 'platformVersion']);
                    if (highEntropy.model) model = highEntropy.model;
                } catch (e) {
                    console.log('UA Data restricted');
                }
            } else {
                // Fallback to basic detection
                model = navigator.platform;
            }

            if (model && model !== 'Unknown' && !computerModel) setComputerModel(model);
            setIsDetected(true);
            addLog(`System detected: ${model}`, 'info');
        };

        detectSystem();
    }, []);

    const isMetadataValid = computerModel.trim() !== '';

    const startRecording = async () => {
        if (!isMetadataValid) {
            setShowModelError(true);
            addLog('Please enter the computer model before starting.', 'error');
            return;
        }
        setShowModelError(false);
        try {
            const now = new Date();
            const date = now.toISOString().split('T')[0];
            const time = now.toTimeString().split(' ')[0].replace(/:/g, '-');
            const timestamp = `${date}_${time}`;
            setSessionStartTime(timestamp);
            setKeyCounts({});
            setIsPaused(false);
            lastKeyPressTimesRef.current = [];

            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;

            const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
            audioCtxRef.current = audioCtx;
            sampleRateRef.current = audioCtx.sampleRate;

            const source = audioCtx.createMediaStreamSource(stream);
            const analyserNode = audioCtx.createAnalyser();
            analyserNode.fftSize = 256;
            setAnalyser(analyserNode);

            // 2 seconds circular buffer
            const bufferSize = audioCtx.sampleRate * 2;
            bufferRef.current = new Float32Array(bufferSize);
            writeIndexRef.current = 0;

            const processor = audioCtx.createScriptProcessor(4096, 1, 1);
            scriptProcessorRef.current = processor;

            processor.onaudioprocess = (e) => {
                const inputData = e.inputBuffer.getChannelData(0);
                const buffer = bufferRef.current;
                if (!buffer) return;

                for (let i = 0; i < inputData.length; i++) {
                    buffer[writeIndexRef.current] = inputData[i];
                    writeIndexRef.current = (writeIndexRef.current + 1) % buffer.length;
                }
            };

            source.connect(analyserNode);
            source.connect(processor);
            processor.connect(audioCtx.destination);

            setIsRecording(true);
            addLog('Recording started. Press any key to capture snippets.', 'info');
        } catch (err) {
            console.error(err);
            addLog('Error accessing microphone.', 'error');
        }
    };

    const stopRecording = () => {
        streamRef.current?.getTracks().forEach(track => track.stop());
        scriptProcessorRef.current?.disconnect();
        audioCtxRef.current?.close();
        setIsRecording(false);
        setIsPaused(false);
        addLog('Recording stopped.', 'info');
    };

    const togglePause = async () => {
        if (!audioCtxRef.current) return;

        if (audioCtxRef.current.state === 'running') {
            await audioCtxRef.current.suspend();
            setIsPaused(true);
            addLog('Recording paused.', 'info');
        } else if (audioCtxRef.current.state === 'suspended') {
            await audioCtxRef.current.resume();
            setIsPaused(false);
            addLog('Recording resumed.', 'info');
        }
    };

    const captureKeyPress = useCallback(async (key: string) => {
        if (!isRecording || isPaused || !bufferRef.current || !audioCtxRef.current) return;

        const now = Date.now();
        const history = lastKeyPressTimesRef.current;
        const prevKeyTime = history.length > 0 ? history[history.length - 1] : 0;
        const timeSinceLast = (prevKeyTime === 0) ? Infinity : (now - prevKeyTime);

        // Record this press in history
        history.push(now);
        if (history.length > 50) history.shift();

        const sampleRate = sampleRateRef.current;
        const buffer = bufferRef.current;
        const captureTime = now;
        const markIndex = writeIndexRef.current;

        addLog(`Key pressed: "${key}". Processing...`, 'info');

        // Wait 500ms to ensure we have the "after" part in the buffer
        setTimeout(async () => {
            const halfSecondSamples = Math.floor(sampleRate * 0.5);
            const totalSamples = halfSecondSamples * 2;

            const snippet = new Float32Array(totalSamples);

            // Start index is markIndex - 0.5s in circular buffer
            let readIndex = (markIndex - halfSecondSamples + buffer.length) % buffer.length;

            for (let i = 0; i < totalSamples; i++) {
                snippet[i] = buffer[readIndex];
                readIndex = (readIndex + 1) % buffer.length;
            }

            // If keys were pressed too close together (less than 500ms), silence the pre-trigger buffer
            // to avoid capturing the previous key's sound in this snippet's 500ms lead-in.
            if (timeSinceLast < 500) {
                for (let i = 0; i < halfSecondSamples; i++) {
                    snippet[i] = 0;
                }
            }

            // Also check if any key was pressed AFTER this one within 500ms.
            // If so, silence the part of the buffer where the next key starts.
            const nextKeyTime = lastKeyPressTimesRef.current.find(t => t > captureTime);
            if (nextKeyTime && (nextKeyTime - captureTime) < 500) {
                const overlapStartOffset = Math.floor((nextKeyTime - captureTime) * (sampleRate / 1000));
                const overlapStartIndex = halfSecondSamples + overlapStartOffset;

                for (let i = overlapStartIndex; i < totalSamples; i++) {
                    snippet[i] = 0;
                }
            }

            // Convert snippet to AudioBuffer for WAV conversion
            const audioBuffer = audioCtxRef.current!.createBuffer(1, totalSamples, sampleRate);
            audioBuffer.getChannelData(0).set(snippet);

            const wavBlob = bufferToWav(audioBuffer);

            // Send to API
            const formData = new FormData();
            formData.append('audio', wavBlob, 'capture.wav');
            formData.append('key', key);
            formData.append('model', computerModel);
            formData.append('sessionTimestamp', sessionStartTime);

            try {
                const res = await fetch('/api/save-key', {
                    method: 'POST',
                    body: formData,
                });
                if (res.ok) {
                    addLog(`Saved "${key}" snippet successfully.`, 'success');
                } else {
                    addLog(`Failed to save "${key}".`, 'error');
                }
            } catch (err) {
                addLog(`Error saving "${key}".`, 'error');
            }
        }, 550); // slightly more than 500ms to be safe
    }, [isRecording, computerModel, sessionStartTime, isPaused]);

    const normalizeKey = (key: string) => {
        let k = key;
        if (k === ' ') k = 'Space';
        else if (k === 'ArrowUp') k = 'Up';
        else if (k === 'ArrowDown') k = 'Down';
        else if (k === 'ArrowLeft') k = 'Left';
        else if (k === 'ArrowRight') k = 'Right';
        else if (k === 'Control') k = 'Ctrl';
        else if (k === 'Meta') k = 'Win';
        else if (k === 'PageUp') k = 'PgUp';
        else if (k === 'PageDown') k = 'PgDn';
        else if (k === 'PrintScreen') k = 'Prt';
        else if (k === 'CapsLock') k = 'Caps';
        else if (k.length === 1) k = k.toUpperCase();
        return k;
    };

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (isRecording && !isPaused) {
                // Prevent default for keys like Space or Arrow keys to avoid scrolling
                if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.key)) {
                    e.preventDefault();
                }

                const k = normalizeKey(e.key);

                setKeyCounts(prev => ({
                    ...prev,
                    [k]: (prev[k] || 0) + 1
                }));

                setActiveKey(k);
                setTimeout(() => setActiveKey(null), 150);

                captureKeyPress(e.key);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isRecording, captureKeyPress, isPaused]);

    return (
        <div className="glass-card" style={{
            maxWidth: '1200px',
            display: 'flex',
            flexDirection: 'column',
            zoom: zoom
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', paddingBottom: '1rem', borderBottom: '1px solid var(--card-border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <img
                        src="/images/Harbin_Institute_of_Technology_(crest).gif"
                        alt="HIT Logo"
                        style={{ height: '50px', width: 'auto' }}
                    />
                    <div>
                        <h2 style={{ fontSize: '1.1rem', margin: 0, fontWeight: 700, color: 'var(--text)' }}>
                            Harbin Institute of Technology
                        </h2>
                        <p style={{ fontSize: '0.75rem', margin: 0, opacity: 0.6 }}>
                            哈尔滨工业大学 | Acoustic Signature Analysis
                        </p>
                    </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        background: 'rgba(255, 255, 255, 0.05)',
                        borderRadius: '16px',
                        padding: '0.4rem',
                        border: '1px solid var(--card-border)',
                        boxShadow: '0 4px 15px rgba(0,0,0,0.1)',
                        backdropFilter: 'blur(10px)'
                    }}>
                        <button
                            onClick={() => setZoom(prev => Math.max(0.5, prev - 0.1))}
                            className="btn-zoom"
                            title="Zoom Out"
                        >
                            <ZoomOut size={14} />
                        </button>

                        <div style={{
                            padding: '0 0.8rem',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            borderLeft: '1px solid rgba(255,255,255,0.1)',
                            borderRight: '1px solid rgba(255,255,255,0.1)',
                            minWidth: '60px'
                        }}>
                            <span style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--primary)', letterSpacing: '0.05em' }}>
                                {Math.round(zoom * 100)}%
                            </span>
                            <span style={{ fontSize: '0.5rem', opacity: 0.4, textTransform: 'uppercase' }}>Zoom</span>
                        </div>

                        <button
                            onClick={() => setZoom(prev => Math.min(2, prev + 0.1))}
                            className="btn-zoom"
                            title="Zoom In"
                        >
                            <ZoomIn size={14} />
                        </button>

                        <button
                            onClick={() => setZoom(0.9)}
                            className="btn-zoom"
                            style={{ marginLeft: '0.2rem', opacity: zoom === 0.9 ? 0.2 : 0.8 }}
                            title="Reset Zoom"
                        >
                            <RotateCcw size={12} />
                        </button>
                    </div>

                    <button
                        onClick={toggleTheme}
                        className="btn btn-secondary"
                        style={{ width: '40px', height: '40px', borderRadius: '12px', padding: 0, display: 'flex', justifyContent: 'center', alignItems: 'center' }}
                    >
                        {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
                    </button>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 1fr)', gap: '2rem', minHeight: '0' }}>
                {/* Left Side: Controls and Visualizer */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                        <div style={{ flex: 1 }}>
                            <h1 style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>AcousticKeys</h1>
                            <div className="metadata-grid" style={{ marginBottom: 0 }}>
                                <div className="input-group">
                                    <label style={{ display: 'block', fontSize: '0.7rem', color: '#888', marginBottom: '0.3rem' }}>Computer Model</label>
                                    <input
                                        type="text"
                                        value={computerModel}
                                        onChange={(e) => {
                                            setComputerModel(e.target.value);
                                            if (e.target.value.trim()) setShowModelError(false);
                                        }}
                                        placeholder="e.g. Dell XPS 15"
                                        disabled={isRecording}
                                        className={`form-input ${showModelError ? 'error' : ''}`}
                                        style={{ padding: '0.6rem 0.8rem', fontSize: '0.9rem' }}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                        {!isRecording && (
                            <button
                                onClick={startRecording}
                                className="btn btn-primary"
                                style={{ padding: '0.8rem 2rem' }}
                            >
                                <Mic size={20} /> Start Session
                            </button>
                        )}
                        {isRecording && (
                            <>
                                <button
                                    onClick={togglePause}
                                    className="btn btn-secondary"
                                    style={{ padding: '0.8rem 1.5rem', borderColor: isPaused ? 'var(--primary)' : 'var(--card-border)' }}
                                >
                                    {isPaused ? <><Play size={20} /> Resume</> : <><Pause size={20} /> Pause</>}
                                </button>
                                <button onClick={stopRecording} className="btn" style={{ background: 'var(--error)', color: '#fff', padding: '0.8rem 1.5rem' }}>
                                    <Square size={20} /> Stop
                                </button>
                            </>
                        )}
                        {isRecording && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: isPaused ? 'var(--secondary)' : 'var(--error)' }}>
                                    <div className={isPaused ? "" : "recording-pulse"} style={{
                                        width: '8px',
                                        height: '8px',
                                        borderRadius: '50%',
                                        background: isPaused ? '#888' : 'currentColor'
                                    }} />
                                    <span style={{ fontWeight: 600, fontSize: '0.8rem' }}>
                                        {isPaused ? 'SESSION PAUSED' : 'LIVE CAPTURING'}
                                    </span>
                                </div>
                                <div style={{ fontSize: '0.6rem', opacity: 0.6, fontFamily: 'monospace' }}>
                                    Saving to: Keyboard/{computerModel.replace(/[^a-z0-9]/gi, '_').toLowerCase()}/...
                                </div>
                            </div>
                        )}
                    </div>

                    <div style={{ flex: 1, minHeight: '200px' }}>
                        <Visualizer analyser={analyser} isRecording={isRecording} />
                    </div>

                    {/* 75% Keyboard Grid Preview */}
                    <div style={{
                        background: 'rgba(0,0,0,0.3)',
                        padding: '1rem',
                        borderRadius: '20px',
                        border: '1px solid var(--card-border)',
                        boxShadow: 'inset 0 0 20px rgba(0,0,0,0.2)'
                    }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                            {[
                                // Row 0
                                [
                                    { k: 'Esc', f: 1.2 }, { k: 'F1', f: 1 }, { k: 'F2', f: 1 }, { k: 'F3', f: 1 }, { k: 'F4', f: 1 },
                                    { k: 'F5', f: 1 }, { k: 'F6', f: 1 }, { k: 'F7', f: 1 }, { k: 'F8', f: 1 },
                                    { k: 'F9', f: 1 }, { k: 'F10', f: 1 }, { k: 'F11', f: 1 }, { k: 'F12', f: 1 },
                                    { k: 'Prt', f: 1 }, { k: 'Del', f: 1 }
                                ],
                                // Row 1
                                [
                                    { k: '`', f: 1 }, { k: '1', f: 1 }, { k: '2', f: 1 }, { k: '3', f: 1 }, { k: '4', f: 1 },
                                    { k: '5', f: 1 }, { k: '6', f: 1 }, { k: '7', f: 1 }, { k: '8', f: 1 }, { k: '9', f: 1 },
                                    { k: '0', f: 1 }, { k: '-', f: 1 }, { k: '=', f: 1 }, { k: 'Backspace', f: 2 }, { k: 'PgUp', f: 1 }
                                ],
                                // Row 2
                                [
                                    { k: 'Tab', f: 1.5 }, { k: 'Q', f: 1 }, { k: 'W', f: 1 }, { k: 'E', f: 1 }, { k: 'R', f: 1 },
                                    { k: 'T', f: 1 }, { k: 'Y', f: 1 }, { k: 'U', f: 1 }, { k: 'I', f: 1 }, { k: 'O', f: 1 },
                                    { k: 'P', f: 1 }, { k: '[', f: 1 }, { k: ']', f: 1 }, { k: '\\', f: 1 }, { k: 'PgDn', f: 1 }
                                ],
                                // Row 3
                                [
                                    { k: 'Caps', f: 1.8 }, { k: 'A', f: 1 }, { k: 'S', f: 1 }, { k: 'D', f: 1 }, { k: 'F', f: 1 },
                                    { k: 'G', f: 1 }, { k: 'H', f: 1 }, { k: 'J', f: 1 }, { k: 'K', f: 1 }, { k: 'L', f: 1 },
                                    { k: ';', f: 1 }, { k: "'", f: 1 }, { k: 'Enter', f: 2.2 }, { k: 'Home', f: 1 }
                                ],
                                // Row 4
                                [
                                    { k: 'Shift', f: 2.4 }, { k: 'Z', f: 1 }, { k: 'X', f: 1 }, { k: 'C', f: 1 }, { k: 'V', f: 1 },
                                    { k: 'B', f: 1 }, { k: 'N', f: 1 }, { k: 'M', f: 1 }, { k: ',', f: 1 }, { k: '.', f: 1 },
                                    { k: '/', f: 1 }, { k: 'Shift', f: 1.6 }, { k: 'Up', f: 1 }, { k: 'End', f: 1 }
                                ],
                                // Row 5
                                [
                                    { k: 'Ctrl', f: 1.25 }, { k: 'Win', f: 1.25 }, { k: 'Alt', f: 1.25 }, { k: 'Space', f: 6.25 },
                                    { k: 'Alt', f: 1.25 }, { k: 'Fn', f: 1 }, { k: 'Ctrl', f: 1.25 }, { k: 'Left', f: 1 },
                                    { k: 'Down', f: 1 }, { k: 'Right', f: 1 }
                                ]
                            ].map((row, i) => (
                                <div key={i} style={{ display: 'flex', gap: '0.35rem' }}>
                                    {row.map((btn, j) => {
                                        const count = keyCounts[btn.k] || 0;
                                        const isPressed = activeKey === btn.k;

                                        let bg = 'rgba(255,255,255,0.03)';
                                        let border = '1px solid rgba(255,255,255,0.08)';
                                        let color = '#777';
                                        let shadow = '0 1px 2px rgba(0,0,0,0.2)';

                                        if (isPressed) {
                                            bg = 'var(--primary)';
                                            border = '1px solid var(--primary)';
                                            color = '#000';
                                            shadow = '0 0 15px var(--primary-glow)';
                                        } else if (count >= 5) {
                                            bg = 'rgba(34, 197, 94, 0.25)';
                                            border = '1px solid rgba(34, 197, 94, 0.5)';
                                            color = '#fff';
                                            shadow = '0 0 10px rgba(34, 197, 94, 0.1)';
                                        } else if (count > 0) {
                                            bg = 'rgba(239, 68, 68, 0.25)';
                                            border = '1px solid rgba(239, 68, 68, 0.5)';
                                            color = '#fff';
                                            shadow = '0 0 10px rgba(239, 68, 68, 0.1)';
                                        }

                                        return (
                                            <div
                                                key={`${i}-${j}`}
                                                style={{
                                                    flex: btn.f,
                                                    height: '30px',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    borderRadius: '6px',
                                                    fontSize: btn.k.length > 2 ? '0.55rem' : '0.75rem',
                                                    fontWeight: 800,
                                                    background: bg,
                                                    color: color,
                                                    border: border,
                                                    boxShadow: shadow,
                                                    transition: 'all 0.05s ease',
                                                    transform: isPressed ? 'translateY(1px)' : 'translateY(0)',
                                                    overflow: 'hidden',
                                                    whiteSpace: 'nowrap',
                                                    position: 'relative'
                                                }}
                                            >
                                                {btn.k}
                                                {count > 0 && !isPressed && (
                                                    <span style={{
                                                        position: 'absolute',
                                                        top: '1px',
                                                        right: '2px',
                                                        fontSize: '0.4rem',
                                                        opacity: 0.6
                                                    }}>
                                                        {count}
                                                    </span>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Right Side: Info, Stats, and Logs */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', overflow: 'hidden' }}>
                    <div style={{ gridTemplateColumns: '1fr 1fr', gap: '1rem', display: 'grid' }}>
                        <div style={{ background: 'rgba(255,255,255,0.03)', padding: '1rem', borderRadius: '16px', border: '1px solid var(--card-border)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.8rem' }}>
                                <Keyboard className="text-primary" size={18} />
                                <h3 style={{ fontSize: '0.95rem' }}>Instructions</h3>
                            </div>
                            <ul style={{ fontSize: '0.75rem', color: '#aaa', listStyle: 'none' }}>
                                <li style={{ marginBottom: '0.3rem' }}>• Grant mic permissions.</li>
                                <li style={{ marginBottom: '0.3rem' }}>• Click "Start Session".</li>
                                <li style={{ marginBottom: '0.3rem' }}>• Press any key to record.</li>
                                <li>• Auto-slices 1s segments.</li>
                            </ul>
                        </div>

                        <div style={{ background: 'rgba(255,255,255,0.03)', padding: '1rem', borderRadius: '16px', border: '1px solid var(--card-border)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.8rem' }}>
                                <History className="text-secondary" size={18} />
                                <h3 style={{ fontSize: '0.95rem' }}>Stats</h3>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.8rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: '#888' }}>Total Keys:</span>
                                    <span style={{ fontWeight: 700 }}>{logs.filter(l => l.type === 'success').length}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: '#888' }}>Rate:</span>
                                    <span style={{ fontWeight: 700 }}>{sampleRateRef.current / 1000} kHz</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.5rem' }}>
                            <CheckCircle2 size={16} style={{ color: 'var(--success)' }} />
                            <span style={{ fontSize: '0.8rem', fontWeight: 600, opacity: 0.8 }}>Timeline Feed</span>
                        </div>
                        <div className="log-container" style={{ margin: 0, height: '300px' }}>
                            <AnimatePresence initial={false}>
                                {logs.map((log) => (
                                    <motion.div
                                        key={log.id}
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        className={`log-entry ${log.type}`}
                                        style={{ fontSize: '0.75rem' }}
                                    >
                                        [{log.timestamp}] {log.msg}
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                            {logs.length === 0 && <div style={{ color: '#555', textAlign: 'center', marginTop: '2rem', fontSize: '0.8rem' }}>No activity logs yet...</div>}
                        </div>
                    </div>
                </div>
            </div>
        </div >
    );
}
