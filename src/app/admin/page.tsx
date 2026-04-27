'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  ShieldCheck, LogOut, Folder, Music, Database,
  Cpu, Search, Play, Pause, Square, RefreshCw,
  BarChart2, FileAudio, HardDrive, Layers, ChevronRight, ChevronLeft, ChevronDown,
  X, Volume2, Clock, Filter, Download, Zap, Wand2, Activity, Trash2

} from 'lucide-react';

import Meyda from 'meyda';


interface AudioEntry {
  model: string;
  session: string;
  key: string;
  filename: string;
  relativePath: string;
  size: number;
  createdAt: string;
}

interface Stats {
  totalFiles: number;
  totalSize: number;
  uniqueModels: number;
  uniqueKeys: number;
  models: string[];
  keys: string[];
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

interface TreeFolder {
  name: string;
  type: 'folder';
  children: (TreeFolder | TreeFile)[];
}

interface TreeFile {
  name: string;
  type: 'file';
  entry: AudioEntry;
}

type TreeItem = TreeFolder | TreeFile;

function buildTree(entries: AudioEntry[]): TreeFolder {
  const root: TreeFolder = { name: 'Keyboard', type: 'folder', children: [] };

  entries.forEach(entry => {
    const parts = entry.relativePath.split('/');
    let current = root;

    parts.forEach((part, index) => {
      const isLast = index === parts.length - 1;
      let existing = current.children.find(child => child.name === part);

      if (!existing) {
        if (isLast) {
          const file: TreeFile = { name: part, type: 'file', entry };
          current.children.push(file);
        } else {
          const folder: TreeFolder = { name: part, type: 'folder', children: [] };
          current.children.push(folder);
          current = folder;
        }
      } else if (existing.type === 'folder') {
        current = existing;
      }
    });
  });

  return root;
}

function WaveformBar({ active }: { active: boolean }) {
  return (
    <div className="waveform-bars">
      {[...Array(5)].map((_, i) => (
        <div
          key={i}
          className={`wf-bar ${active ? 'wf-bar--active' : ''}`}
          style={{ animationDelay: `${i * 0.1}s` }}
        />
      ))}
    </div>
  );
}

function TrackAnalysis({ entry, onRemove, onDelete, globalTrigger }: { entry: AudioEntry; onRemove: (e: AudioEntry) => void; onDelete: (e: React.MouseEvent, entry: AudioEntry) => void; globalTrigger?: number }) {

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mfccCanvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [mfccData, setMfccData] = useState<number[][] | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [metrics, setMetrics] = useState<{ peak: number; rms: number; sampleRate: number } | null>(null);

  const src = `/api/audio/${entry.relativePath}`;

  // Handle global trigger
  useEffect(() => {
    if (globalTrigger && globalTrigger > 0 && !mfccData && !isProcessing) {
      convertToMFCC();
    }
  }, [globalTrigger]);

  const drawWaveform = useCallback((buffer: AudioBuffer) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const data = buffer.getChannelData(0);
    const step = Math.ceil(data.length / canvas.width);
    const amp = canvas.height / 2;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw Grid
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 0.5;
    for (let x = 0; x < canvas.width; x += 50) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
    }
    ctx.beginPath(); ctx.moveTo(0, amp); ctx.lineTo(canvas.width, amp); ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, amp);

    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grad.addColorStop(0, '#ff00c8');
    grad.addColorStop(0.5, '#00f2ff');
    grad.addColorStop(1, '#ff00c8');
    ctx.strokeStyle = grad;
    ctx.lineWidth = 1.5;

    let peak = 0;
    let sumSquares = 0;

    for (let i = 0; i < canvas.width; i++) {
      let min = 1.0;
      let max = -1.0;
      for (let j = 0; j < step; j++) {
        const datum = data[(i * step) + j];
        if (datum < min) min = datum;
        if (datum > max) max = datum;

        const abs = Math.abs(datum);
        if (abs > peak) peak = abs;
        sumSquares += datum * datum;
      }
      ctx.lineTo(i, (1 + min) * amp);
      ctx.lineTo(i, (1 + max) * amp);
    }
    ctx.stroke();

    const rms = Math.sqrt(sumSquares / data.length);
    setMetrics({ peak, rms, sampleRate: buffer.sampleRate });
  }, []);

  useEffect(() => {
    const loadAudio = async () => {
      const response = await fetch(src);
      const arrayBuffer = await response.arrayBuffer();
      const audioCtx = new AudioContext();
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

      drawWaveform(audioBuffer);
      setDuration(audioBuffer.duration);
    };
    loadAudio();
  }, [src, drawWaveform]);

  const convertToMFCC = async () => {
    setIsProcessing(true);
    try {
      const response = await fetch(src);
      const arrayBuffer = await response.arrayBuffer();
      const audioCtx = new AudioContext();
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

      const data = audioBuffer.getChannelData(0);

      const bufferSize = 1024;
      const hopSize = 512;
      const mfccs: number[][] = [];

      for (let i = 0; i < data.length - bufferSize; i += hopSize) {
        const frame = data.slice(i, i + bufferSize);
        // Meyda requires a power-of-two buffer size
        const features = Meyda.extract('mfcc', frame as any);
        if (features) mfccs.push(features as number[]);
      }


      setMfccData(mfccs);
      setTimeout(() => drawSpectrogram(mfccs), 100);
    } catch (e) {
      console.error("MFCC extraction failed", e);
    }
    setIsProcessing(false);
  };

  const drawSpectrogram = (data: number[][]) => {
    const canvas = mfccCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const w = canvas.width / data.length;
    const h = canvas.height / data[0].length;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    data.forEach((frame, i) => {
      frame.forEach((val, j) => {
        // Logarithmic scaling for better visibility
        const intensity = Math.min(255, Math.max(0, (val + 30) * 4));

        // Infernal/Thermal Color Palette
        let r = 0, g = 0, b = 0;
        if (intensity < 128) {
          r = intensity * 2;
          g = 0;
          b = 255 - (intensity * 2);
        } else {
          r = 255;
          g = (intensity - 128) * 2;
          b = 0;
        }

        ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
        ctx.fillRect(i * w, canvas.height - (j * h), w, h);
      });
    });
  };


  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) audioRef.current.pause();
      else audioRef.current.play();
      setIsPlaying(!isPlaying);
    }
  };

  return (
    <div className="track-card">
      <div className="track-header">
        <div className="track-info">
          <span className="track-key">{entry.key}</span>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span className="track-name">{entry.filename}</span>
            {metrics && (
              <div className="track-meta-pills">
                <span>{metrics.sampleRate / 1000}kHz</span>
                <span>Peak: {(20 * Math.log10(metrics.peak)).toFixed(1)}dB</span>
                <span>RMS: {(20 * Math.log10(metrics.rms)).toFixed(1)}dB</span>
              </div>
            )}
          </div>
        </div>

        <div className="track-actions">
          <button onClick={togglePlay} className="track-btn">
            {isPlaying ? <Pause size={14} /> : <Play size={14} />}
          </button>
          <button onClick={convertToMFCC} className={`track-btn ${mfccData ? 'active' : ''}`} disabled={isProcessing}>
            {isProcessing ? <RefreshCw size={14} className="spin" /> : <Zap size={14} />}
            <span>MFCC</span>
          </button>
          <button onClick={(evt) => onDelete(evt, entry)} className="track-btn track-btn--delete" title="Delete from disk">
            <Trash2 size={14} />
          </button>
          <button onClick={() => onRemove(entry)} className="track-btn track-btn--close" title="Remove from workbench">
            <X size={14} />
          </button>
        </div>

      </div>

      <div className="track-visuals">
        <div className="visual-group">
          <label>High-Res Waveform</label>
          <div className="canvas-wrap">
            <canvas ref={canvasRef} width={800} height={100} />
            <div className="playhead" style={{ left: `${(currentTime / duration) * 100}%` }} />
            {!duration && (
              <div className="loading-overlay">
                <RefreshCw size={24} className="spin" />
                <span>Decoding...</span>
              </div>
            )}
          </div>

        </div>

        {mfccData && (
          <div className="visual-group animate-in">
            <label>MFCC Spectrogram</label>
            <div className="canvas-wrap">
              <canvas ref={mfccCanvasRef} width={800} height={100} />
            </div>
          </div>
        )}
      </div>

      <audio
        ref={audioRef}
        src={src}
        onTimeUpdate={(e) => setCurrentTime((e.target as HTMLAudioElement).currentTime)}
        onEnded={() => setIsPlaying(false)}
      />
    </div>
  );
}

function CleaningModule({ allEntries, setSelectedFiles, stats: globalStats, formatBytes, formatDate, toggleSelection, selectedFiles, setActiveEntry, setPlayingId, playingId, onDelete }: {
  allEntries: AudioEntry[];
  setSelectedFiles: React.Dispatch<React.SetStateAction<AudioEntry[]>>;
  stats: Stats | null;
  formatBytes: (b: number) => string;
  formatDate: (iso: string) => string;
  toggleSelection: (e: React.MouseEvent, entry: AudioEntry) => void;
  selectedFiles: AudioEntry[];
  setActiveEntry: (e: AudioEntry) => void;
  setPlayingId: (id: string | null) => void;
  playingId: string | null;
  onDelete: (e: React.MouseEvent, entry: AudioEntry) => void;
}) {
  const [search, setSearch] = useState('');
  const [filterModel, setFilterModel] = useState('');
  const [filterKey, setFilterKey] = useState('');
  const [viewMode, setViewMode] = useState<'bench' | 'list'>('bench');
  const [globalMFCCSignal, setGlobalMFCCSignal] = useState(0);

  const scrollToTop = () => {
    const container = document.querySelector('.admin-main');
    if (container) container.scrollTo({ top: 0, behavior: 'smooth' });
  };


  // Pagination State
  const [rowsPerPage, setRowsPerPage] = useState(5);
  const [currentPage, setCurrentPage] = useState(1);

  const handleRemove = (entry: AudioEntry) => {
    setSelectedFiles(prev => prev.filter(f => f.relativePath !== entry.relativePath));
  };

  const filtered = allEntries.filter(e => {
    const q = search.toLowerCase();
    const matchSearch = !q || e.key.toLowerCase().includes(q) || e.model.toLowerCase().includes(q) || e.session.toLowerCase().includes(q) || e.filename.toLowerCase().includes(q);
    const matchModel = !filterModel || e.model === filterModel;
    const matchKey = !filterKey || e.key === filterKey;
    return matchSearch && matchModel && matchKey;
  });

  const totalPages = Math.ceil(filtered.length / rowsPerPage);
  const paginated = filtered.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

  const availableModels = globalStats?.models || [];
  const availableKeys = globalStats?.keys || [];

  // Reset page and scroll on filter change
  useEffect(() => {
    setCurrentPage(1);
    if (window.innerWidth > 768) {
      // Optional: scroll cleaning container
    }
  }, [search, filterModel, filterKey, rowsPerPage]);

  useEffect(() => {
    // When view mode changes, scroll to top of module
    const container = document.querySelector('.admin-main');
    if (container) container.scrollTo({ top: 0, behavior: 'smooth' });
  }, [viewMode]);


  return (
    <div className="cleaning-module">
      <div className="module-header">
        <div>
          <h2 className="module-title">Audio Cleaning Workbench</h2>
          <p className="module-subtitle">Advanced analysis for {selectedFiles.length} staged tracks</p>
        </div>
        <div className="module-controls">
          <div className="view-toggle">
            <button className={`toggle-btn ${viewMode === 'bench' ? 'active' : ''}`} onClick={() => setViewMode('bench')}>
              <Activity size={14} /> Workbench ({selectedFiles.length})
            </button>
            <button className={`toggle-btn ${viewMode === 'list' ? 'active' : ''}`} onClick={() => setViewMode('list')}>
              <BarChart2 size={14} /> Dataset Browser
            </button>
          </div>
          {selectedFiles.length > 0 && (
            <div style={{ display: 'flex', gap: '0.6rem' }}>
              <button className="btn-action btn-action--primary" onClick={() => { setGlobalMFCCSignal(s => s + 1); setViewMode('bench'); }}>
                <Zap size={16} /> Batch MFCC
              </button>
              <button className="btn-action" onClick={() => setSelectedFiles([])}>
                <Trash2 size={16} /> Clear Staged
              </button>
            </div>
          )}
        </div>
      </div>

      {allEntries.length === 0 ? (
        <div className="module-empty">
          <Wand2 size={48} strokeWidth={1} />
          <h3>No tracks available</h3>
          <p>Go to "Audio Files" and select tracks to begin high-resolution cleaning.</p>
        </div>
      ) : (
        <>
          {/* Filters Bar */}
          <div className="filters-bar" style={{ marginTop: 0, marginBottom: '1.5rem' }}>
            <div className="search-wrap">
              <Search size={15} />
              <input
                type="text"
                placeholder="Search within selection..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="filter-input"
              />
              {search && <button className="clear-btn" onClick={() => setSearch('')}><X size={13} /></button>}
            </div>
            <div className="filter-select-wrap">
              <Filter size={14} />
              <select value={filterModel} onChange={e => setFilterModel(e.target.value)} className="filter-select">
                <option value="">All Models</option>
                {availableModels.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div className="filter-select-wrap">
              <Layers size={14} />
              <select value={filterKey} onChange={e => setFilterKey(e.target.value)} className="filter-select">
                <option value="">All Keys</option>
                {availableKeys.map(k => <option key={k} value={k}>{k}</option>)}
              </select>
            </div>
            <span className="result-count">{filtered.length} of {allEntries.length} tracks</span>
            {selectedFiles.length > 0 ? (
              <button
                className="btn-action btn-action--primary"
                style={{ marginLeft: '1rem', padding: '0.4rem 0.8rem', borderRadius: '8px', fontSize: '0.7rem' }}
                onClick={() => { setGlobalMFCCSignal(s => s + 1); setViewMode('bench'); }}
              >
                <Zap size={12} /> Convert Staged ({selectedFiles.length})
              </button>
            ) : (
              paginated.length > 0 && (
                <button
                  className="btn-action btn-action--primary"
                  style={{ marginLeft: '1rem', padding: '0.4rem 0.8rem', borderRadius: '8px', fontSize: '0.7rem', opacity: 0.8 }}
                  onClick={() => {
                    setSelectedFiles(paginated);
                    setGlobalMFCCSignal(s => s + 1);
                    setViewMode('bench');
                  }}
                  title="Analyze only the tracks currently visible in this table"
                >
                  <Activity size={12} /> Analyze Current Page
                </button>
              )
            )}
          </div>


          {viewMode === 'bench' ? (
            <div className="tracks-list">
              {selectedFiles.length === 0 ? (
                <div className="module-empty">
                  <Activity size={48} strokeWidth={1} />
                  <h3>Workbench Empty</h3>
                  <p>Switch to "Dataset Browser" to stage tracks for analysis.</p>
                </div>
              ) : (
                selectedFiles.map(e => (
                  <TrackAnalysis key={e.relativePath} entry={e} onRemove={handleRemove} onDelete={onDelete} globalTrigger={globalMFCCSignal} />
                ))
              )}

              {/* Sequential Batch Navigation */}
              {allEntries.length > rowsPerPage && (
                <div className="batch-navigation animate-in">
                  <button
                    disabled={currentPage === 1}
                    onClick={() => {
                      const newPage = currentPage - 1;
                      setCurrentPage(newPage);
                      const newPaginated = filtered.slice((newPage - 1) * rowsPerPage, newPage * rowsPerPage);
                      setSelectedFiles(newPaginated);
                      setGlobalMFCCSignal(s => s + 1);
                      scrollToTop();
                    }}
                    className="batch-btn"
                  >
                    <ChevronLeft size={16} /> Previous Batch
                  </button>
                  <div className="batch-info">
                    Batch {currentPage} of {totalPages}
                  </div>
                  <button
                    disabled={currentPage >= totalPages}
                    onClick={() => {
                      const newPage = currentPage + 1;
                      setCurrentPage(newPage);
                      const newPaginated = filtered.slice((newPage - 1) * rowsPerPage, newPage * rowsPerPage);
                      setSelectedFiles(newPaginated);
                      setGlobalMFCCSignal(s => s + 1);
                      scrollToTop();
                    }}
                    className="batch-btn"
                  >
                    Next Batch <ChevronRight size={16} />
                  </button>
                </div>
              )}
            </div>


          ) : (

            <div className="detail-card">
              <div className="file-table file-table--files">
                <div className="file-table-head">
                  <span>Select</span>
                  <span>Key</span>
                  <span>Model</span>
                  <span>Session</span>
                  <span>File</span>
                  <span>Size</span>
                  <span>Captured</span>
                  <span></span>
                  <span></span>
                </div>
                {paginated.map(e => {
                  const id = e.relativePath;
                  const isSelected = selectedFiles.find(f => f.relativePath === e.relativePath);
                  return (
                    <div key={id} className={`file-row ${isSelected ? 'file-row--selected' : ''}`} onClick={() => { setActiveEntry(e); setPlayingId(id); }}>
                      <div className="file-row-select" onClick={(evt) => toggleSelection(evt, e)}>
                        <div className={`checkbox ${isSelected ? 'checkbox--active' : ''}`} />
                      </div>
                      <span className="file-key-badge">{e.key}</span>
                      <span className="file-model">{e.model}</span>
                      <span className="file-session">{e.session}</span>
                      <span className="file-name">{e.filename}</span>
                      <span className="file-size">{formatBytes(e.size)}</span>
                      <span className="file-date">{formatDate(e.createdAt)}</span>
                      <button className="file-play-btn" title="Play">
                        <WaveformBar active={playingId === id} />
                        <Play size={13} />
                      </button>
                      <button className="file-delete-btn" onClick={(evt) => onDelete(evt, e)} title="Delete recording">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  );
                })}

              </div>

              {/* Pagination Controls */}
              <div className="pagination-bar">
                <div className="rows-picker">
                  <span>Show</span>
                  <select value={rowsPerPage} onChange={e => setRowsPerPage(Number(e.target.value))}>
                    {[5, 10, 20, 50, 100].map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
                <div className="page-nav">
                  <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)} className="page-btn">
                    Prev
                  </button>
                  <span className="page-info">Page {currentPage} of {totalPages || 1}</span>
                  <button disabled={currentPage >= totalPages} onClick={() => setCurrentPage(p => p + 1)} className="page-btn">
                    Next
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}



function TreeNode({ node, depth, onSelect, selectedId }: { node: TreeItem, depth: number, onSelect: (e: AudioEntry) => void, selectedId?: string }) {
  const [isOpen, setIsOpen] = useState(depth < 2);
  const isSelected = node.type === 'file' && node.entry.relativePath === selectedId;

  if (node.type === 'file') {
    return (
      <div
        className={`tree-node tree-file ${isSelected ? 'active' : ''}`}
        style={{ paddingLeft: `${depth * 1.2}rem` }}
        onClick={() => onSelect(node.entry)}
      >
        <Music size={14} className="node-icon" />
        <span className="node-name">{node.name}</span>
      </div>
    );
  }

  return (
    <div className="tree-folder-group">
      <div
        className="tree-node tree-folder"
        style={{ paddingLeft: `${depth * 1.2}rem` }}
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="chevron-wrap">
          {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </div>
        <Folder size={14} className="node-icon" />
        <span className="node-name">{node.name}</span>
      </div>
      {isOpen && (
        <div className="tree-children">
          {node.children
            .sort((a, b) => {
              if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
              return a.name.localeCompare(b.name);
            })
            .map((child, i) => (
              <TreeNode key={i} node={child} depth={depth + 1} onSelect={onSelect} selectedId={selectedId} />
            ))
          }
        </div>
      )}
    </div>
  );
}

function TreeModule({ entries, formatBytes, formatDate, onDelete }: {
  entries: AudioEntry[];
  formatBytes: (b: number) => string;
  formatDate: (iso: string) => string;
  onDelete: (e: React.MouseEvent, entry: AudioEntry) => void;
}) {
  const [selectedEntry, setSelectedEntry] = useState<AudioEntry | null>(null);
  const tree = buildTree(entries);

  return (
    <div className="tree-module animate-in">
      <div className="module-header">
        <div>
          <h2 className="module-title">Dataset Explorer</h2>
          <p className="module-subtitle">Hierarchical view of the keyboard dataset</p>
        </div>
      </div>

      <div className="tree-layout">
        <aside className="tree-explorer">
          <div className="tree-scroll">
            <TreeNode node={tree} depth={0} onSelect={setSelectedEntry} selectedId={selectedEntry?.relativePath} />
          </div>
        </aside>

        <main className="tree-detail">
          {selectedEntry ? (
            <div className="tree-detail-content">
              <TrackAnalysis
                entry={selectedEntry}
                onRemove={() => setSelectedEntry(null)}
                onDelete={onDelete}
                globalTrigger={0}
              />

              <div className="metadata-card detail-card animate-in" style={{ marginTop: '1.5rem' }}>
                <div className="detail-card-header">
                  <Database size={16} />
                  <h3>File Metadata</h3>
                </div>
                <div className="metadata-grid">
                  <div className="meta-item">
                    <label>Key Content</label>
                    <span className="file-key-badge">{selectedEntry.key}</span>
                  </div>
                  <div className="meta-item">
                    <label>Device Model</label>
                    <span className="model-name-text">{selectedEntry.model}</span>
                  </div>
                  <div className="meta-item">
                    <label>Session Path</label>
                    <span className="session-path-text">{selectedEntry.session}</span>
                  </div>
                  <div className="meta-item">
                    <label>File Size</label>
                    <span>{formatBytes(selectedEntry.size)}</span>
                  </div>
                  <div className="meta-item">
                    <label>Created On</label>
                    <span>{formatDate(selectedEntry.createdAt)}</span>
                  </div>
                  <div className="meta-item">
                    <label>System Path</label>
                    <code className="path-code">{selectedEntry.relativePath}</code>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="module-empty">
              <Folder size={48} strokeWidth={1} />
              <h3>Select a file to inspect</h3>
              <p>Explore the dataset structure and pick a .wav file to see its analysis and metrics.</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function AudioPlayer({ entry, onClose }: { entry: AudioEntry; onClose: () => void }) {

  const audioRef = useRef<HTMLAudioElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(0.8);

  const src = `/api/audio/${entry.relativePath}`;

  const drawWaveform = useCallback(() => {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) return;

    const ctx = canvas.getContext('2d')!;
    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(data);

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const barCount = 60;
    const barWidth = (canvas.width / barCount) - 2;
    const step = Math.floor(data.length / barCount);

    for (let i = 0; i < barCount; i++) {
      const value = data[i * step] / 255;
      const barH = value * canvas.height;
      const x = i * (barWidth + 2);
      const y = canvas.height - barH;

      const grad = ctx.createLinearGradient(x, y, x, canvas.height);
      grad.addColorStop(0, `rgba(0,242,255,${0.4 + value * 0.6})`);
      grad.addColorStop(1, `rgba(112,0,255,${0.2 + value * 0.4})`);

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, barH, 2);
      ctx.fill();
    }

    animRef.current = requestAnimationFrame(drawWaveform);
  }, []);

  const setupAudioContext = useCallback(() => {
    if (audioCtxRef.current || !audioRef.current) return;
    const ctx = new AudioContext();
    const source = ctx.createMediaElementSource(audioRef.current);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    analyser.connect(ctx.destination);
    audioCtxRef.current = ctx;
    analyserRef.current = analyser;
  }, []);

  const handlePlay = async () => {
    if (!audioRef.current) return;
    setupAudioContext();
    if (audioCtxRef.current?.state === 'suspended') {
      await audioCtxRef.current.resume();
    }
    await audioRef.current.play();
    setIsPlaying(true);
    drawWaveform();
  };

  const handlePause = () => {
    audioRef.current?.pause();
    setIsPlaying(false);
    if (animRef.current) cancelAnimationFrame(animRef.current);
  };

  const handleStop = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setIsPlaying(false);
    setCurrentTime(0);
    if (animRef.current) cancelAnimationFrame(animRef.current);
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d')!;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  };

  useEffect(() => {
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      audioCtxRef.current?.close();
    };
  }, []);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="player-overlay">
      <div className="player-modal">
        <button className="player-close" onClick={() => { handleStop(); onClose(); }}>
          <X size={18} />
        </button>

        <div className="player-header">
          <div className="player-icon">
            <FileAudio size={22} strokeWidth={1.5} />
          </div>
          <div>
            <p className="player-key">Key: <strong>{entry.key}</strong></p>
            <p className="player-meta">{entry.model} · {entry.session}</p>
          </div>
        </div>

        <canvas ref={canvasRef} width={440} height={80} className="player-canvas" />

        <div className="player-progress-wrap">
          <div className="player-progress-bar" onClick={e => {
            const rect = e.currentTarget.getBoundingClientRect();
            const pct = (e.clientX - rect.left) / rect.width;
            if (audioRef.current) {
              audioRef.current.currentTime = pct * duration;
            }
          }}>
            <div className="player-progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <div className="player-times">
            <span>{currentTime.toFixed(2)}s</span>
            <span>{duration.toFixed(2)}s</span>
          </div>
        </div>

        <div className="player-controls">
          <button className="player-btn" onClick={isPlaying ? handlePause : handlePlay}>
            {isPlaying ? <Pause size={20} /> : <Play size={20} />}
          </button>
          <button className="player-btn player-btn--stop" onClick={handleStop}>
            <Square size={18} />
          </button>
          <div className="player-volume">
            <Volume2 size={15} />
            <input
              type="range" min="0" max="1" step="0.05" value={volume}
              onChange={e => {
                const v = parseFloat(e.target.value);
                setVolume(v);
                if (audioRef.current) audioRef.current.volume = v;
              }}
              className="volume-slider"
            />
          </div>
          <a
            href={src}
            download={entry.filename}
            className="player-btn player-btn--dl"
            title="Download"
          >
            <Download size={16} />
          </a>
        </div>

        <audio
          ref={audioRef}
          src={src}
          preload="metadata"
          onLoadedMetadata={e => {
            const el = e.target as HTMLAudioElement;
            setDuration(el.duration);
            el.volume = volume;
          }}
          onTimeUpdate={e => setCurrentTime((e.target as HTMLAudioElement).currentTime)}
          onEnded={() => { setIsPlaying(false); if (animRef.current) cancelAnimationFrame(animRef.current); }}
        />
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const router = useRouter();
  const [entries, setEntries] = useState<AudioEntry[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterModel, setFilterModel] = useState('');
  const [filterKey, setFilterKey] = useState('');
  const [activeEntry, setActiveEntry] = useState<AudioEntry | null>(null);
  const [activeSection, setActiveSection] = useState<'overview' | 'files' | 'cleaning' | 'tree'>('overview');
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<AudioEntry[]>([]);


  // Pagination State
  const [rowsPerPage, setRowsPerPage] = useState(5);
  const [overviewPage, setOverviewPage] = useState(1);
  const [filesPage, setFilesPage] = useState(1);

  useEffect(() => {
    const auth = sessionStorage.getItem('amez_admin_auth');
    if (auth !== 'true') {
      router.replace('/amezkey');
    }
  }, [router]);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/list-audio');
      const data = await res.json();
      setEntries(data.entries || []);
      setStats(data.stats || null);
    } catch {
      setEntries([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleLogout = () => {
    sessionStorage.removeItem('amez_admin_auth');
    router.replace('/amezkey');
  };

  const toggleSelection = (e: React.MouseEvent, entry: AudioEntry) => {
    e.stopPropagation();
    setSelectedFiles(prev => {
      const exists = prev.find(f => f.relativePath === entry.relativePath);
      if (exists) return prev.filter(f => f.relativePath !== entry.relativePath);
      return [...prev, entry];
    });
  };

  const handleDelete = async (e: React.MouseEvent, entry: AudioEntry) => {
    e.stopPropagation();
    if (!confirm(`Are you sure you want to delete ${entry.filename}?`)) return;

    try {
      const res = await fetch('/api/delete-audio', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ relativePath: entry.relativePath }),
      });

      if (res.ok) {
        fetchData();
        setSelectedFiles(prev => prev.filter(f => f.relativePath !== entry.relativePath));
      } else {
        alert('Failed to delete file');
      }
    } catch (err) {
      alert('Error deleting file');
    }
  };


  // Paginated Data

  const getPaginated = (data: AudioEntry[], page: number) => {
    const start = (page - 1) * rowsPerPage;
    return data.slice(start, start + rowsPerPage);
  };

  const filtered = entries.filter(e => {
    const q = search.toLowerCase();
    const matchSearch = !q || e.key.toLowerCase().includes(q) || e.model.toLowerCase().includes(q) || e.session.toLowerCase().includes(q) || e.filename.toLowerCase().includes(q);
    const matchModel = !filterModel || e.model === filterModel;
    const matchKey = !filterKey || e.key === filterKey;
    return matchSearch && matchModel && matchKey;
  });

  const paginatedOverview = getPaginated(entries, overviewPage);
  const paginatedFiles = getPaginated(filtered, filesPage);

  const totalOverviewPages = Math.ceil(entries.length / rowsPerPage);
  const totalFilesPages = Math.ceil(filtered.length / rowsPerPage);

  // Group by model
  const byModel: Record<string, AudioEntry[]> = {};
  entries.forEach(e => {
    if (!byModel[e.model]) byModel[e.model] = [];
    byModel[e.model].push(e);
  });

  // Group by key
  const byKey: Record<string, number> = {};
  entries.forEach(e => {
    byKey[e.key] = (byKey[e.key] || 0) + 1;
  });
  const mainRef = useRef<HTMLDivElement>(null);

  const scrollToTop = () => {
    if (mainRef.current) {
      mainRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // Reset page and scroll on filter change or section change
  useEffect(() => { scrollToTop(); }, [activeSection]);

  const topKeys = Object.entries(byKey).sort((a, b) => b[1] - a[1]).slice(0, 8);

  return (
    <div className="admin-root">
      {/* Sidebar */}
      <aside className="admin-sidebar">
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">
            <ShieldCheck size={20} strokeWidth={1.5} />
          </div>
          <div>
            <p className="sidebar-brand">Admin Center</p>
            <p className="sidebar-sub">AcousticKeys v2</p>
          </div>
        </div>

        <nav className="sidebar-nav">
          <button
            className={`nav-item ${activeSection === 'overview' ? 'nav-item--active' : ''}`}
            onClick={() => setActiveSection('overview')}
          >
            <BarChart2 size={18} />
            <span>Overview</span>
          </button>
          <button
            className={`nav-item ${activeSection === 'files' ? 'nav-item--active' : ''}`}
            onClick={() => setActiveSection('files')}
          >
            <FileAudio size={18} />
            <span>Audio Files</span>
            {stats && <span className="nav-badge">{stats.totalFiles}</span>}
          </button>
          <button
            className={`nav-item ${activeSection === 'cleaning' ? 'nav-item--active' : ''}`}
            onClick={() => setActiveSection('cleaning')}
          >
            <Wand2 size={18} />
            <span>Audio Cleaning</span>
            {selectedFiles.length > 0 && <span className="nav-badge nav-badge--cyan" style={{ background: 'rgba(0, 242, 255, 0.1)', color: '#00f2ff' }}>{selectedFiles.length}</span>}
          </button>
          <button
            className={`nav-item ${activeSection === 'tree' ? 'nav-item--active' : ''}`}
            onClick={() => setActiveSection('tree')}
          >
            <Folder size={18} />
            <span>Dataset Tree</span>
          </button>

        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="user-avatar">AM</div>
            <div>
              <p className="user-name">amezamanj</p>
              <p className="user-role">Administrator</p>
            </div>
          </div>
          <button className="logout-btn" onClick={handleLogout} title="Sign out">
            <LogOut size={17} />
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="admin-main" ref={mainRef}>

        <div className="dashboard-content">
          <div className="content-header">
            <div className="header-badge">Admin Dashboard</div>
            <h1 className="main-title">
              {activeSection === 'overview' ? 'System Overview' : activeSection === 'tree' ? 'Dataset Explorer' : 'Audio Browser'}
            </h1>
            <div style={{ display: 'flex', gap: '0.8rem' }}>
              <button
                className="btn-action btn-action--primary"
                style={{ background: 'rgba(0, 242, 255, 0.1)', color: '#00f2ff', border: '1px solid rgba(0, 242, 255, 0.2)' }}
                onClick={() => {
                  window.location.href = '/api/download-all';
                }}
              >
                <Folder size={15} /> Download All (ZIP)
              </button>
              <button
                className="btn-action"
                style={{ background: 'rgba(255, 255, 255, 0.05)', color: '#fff', border: '1px solid rgba(255, 255, 255, 0.1)' }}
                onClick={() => {
                  const manifest = {
                    version: "2.0.0",
                    exportedAt: new Date().toISOString(),
                    totalFiles: entries.length,
                    devices: stats?.models || [],
                    keys: stats?.keys || [],
                    recordings: entries.map(e => ({
                      key: e.key,
                      device: e.model,
                      session: e.session,
                      filename: e.filename,
                      path: e.relativePath,
                      capturedAt: e.createdAt
                    }))
                  };
                  const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `keyboard_dataset_manifest_${new Date().toISOString().split('T')[0]}.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                <Download size={15} /> Export Manifest
              </button>
            </div>
          </div>

          {activeSection === 'overview' && (
            <div className="section-content">
              {/* Stat Cards */}
              <div className="stats-grid">
                <div className="stat-card">
                  <div className="stat-icon stat-icon--cyan"><FileAudio size={20} /></div>
                  <div>
                    <p className="stat-value">{stats?.totalFiles ?? '—'}</p>
                    <p className="stat-label">Audio Files</p>
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-icon stat-icon--purple"><HardDrive size={20} /></div>
                  <div>
                    <p className="stat-value">{stats ? formatBytes(stats.totalSize) : '—'}</p>
                    <p className="stat-label">Total Size</p>
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-icon stat-icon--pink"><Cpu size={20} /></div>
                  <div>
                    <p className="stat-value">{stats?.uniqueModels ?? '—'}</p>
                    <p className="stat-label">Device Models</p>
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-icon stat-icon--green"><Layers size={20} /></div>
                  <div>
                    <p className="stat-value">{stats?.uniqueKeys ?? '—'}</p>
                    <p className="stat-label">Unique Keys</p>
                  </div>
                </div>
              </div>

              {/* Models breakdown */}
              <div className="detail-grid">
                <div className="detail-card">
                  <div className="detail-card-header">
                    <Folder size={16} />
                    <h3>Device Models</h3>
                  </div>
                  {Object.keys(byModel).length === 0 ? (
                    <p className="empty-text">No recordings yet</p>
                  ) : (
                    <div className="model-list">
                      {Object.entries(byModel).map(([model, files]) => (
                        <div key={model} className="model-row">
                          <div className="model-row-left">
                            <Cpu size={13} />
                            <span className="model-name">{model}</span>
                          </div>
                          <div className="model-row-right">
                            <div className="model-bar-wrap">
                              <div
                                className="model-bar"
                                style={{ width: `${(files.length / (stats?.totalFiles || 1)) * 100}%` }}
                              />
                            </div>
                            <span className="model-count">{files.length}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Top keys */}
                <div className="detail-card">
                  <div className="detail-card-header">
                    <Database size={16} />
                    <h3>Top Recorded Keys</h3>
                  </div>
                  {topKeys.length === 0 ? (
                    <p className="empty-text">No recordings yet</p>
                  ) : (
                    <div className="key-chart">
                      {topKeys.map(([key, count]) => (
                        <div key={key} className="key-bar-row">
                          <span className="key-label">{key}</span>
                          <div className="key-bar-wrap">
                            <div
                              className="key-bar"
                              style={{ width: `${(count / (topKeys[0][1] || 1)) * 100}%` }}
                            >
                              <span className="key-bar-val">{count}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Recent files */}
              <div className="detail-card" style={{ marginTop: '1.5rem' }}>
                <div className="detail-card-header">
                  <Clock size={16} />
                  <h3>Recent Captures</h3>
                  <button className="view-all-btn" onClick={() => setActiveSection('files')}>
                    View all <ChevronRight size={13} />
                  </button>
                </div>
                {entries.length === 0 ? (
                  <p className="empty-text">No recordings yet. Start a session on the main page.</p>
                ) : (
                  <>
                    <div className="file-table file-table--overview">
                      <div className="file-table-head">
                        <span>Select</span>
                        <span>Key</span>
                        <span>Model</span>

                        <span>Session</span>
                        <span>Size</span>
                        <span>Time</span>
                        <span></span>
                        <span></span>
                      </div>
                      {paginatedOverview.map(e => {
                        const id = e.relativePath;
                        return (
                          <div key={id} className={`file-row ${selectedFiles.find(f => f.relativePath === e.relativePath) ? 'file-row--selected' : ''}`} onClick={() => { setActiveEntry(e); setPlayingId(id); }}>
                            <div className="file-row-select" onClick={(evt) => toggleSelection(evt, e)}>
                              <div className={`checkbox ${selectedFiles.find(f => f.relativePath === e.relativePath) ? 'checkbox--active' : ''}`} />
                            </div>
                            <span className="file-key-badge">{e.key}</span>

                            <span className="file-model">{e.model}</span>
                            <span className="file-session">{e.session}</span>
                            <span className="file-size">{formatBytes(e.size)}</span>
                            <span className="file-date">{formatDate(e.createdAt)}</span>
                            <button className="file-play-btn">
                              <WaveformBar active={playingId === id} />
                              <Play size={13} />
                            </button>
                            <button className="file-delete-btn" onClick={(evt) => handleDelete(evt, e)} title="Delete recording">
                              <Trash2 size={13} />
                            </button>
                          </div>
                        );
                      })}
                    </div>

                    {/* Pagination Controls */}
                    <div className="pagination-bar">
                      <div className="rows-picker">
                        <span>Show</span>
                        <select value={rowsPerPage} onChange={e => { setRowsPerPage(Number(e.target.value)); setOverviewPage(1); setFilesPage(1); }}>
                          {[5, 10, 20, 50, 100].map(v => <option key={v} value={v}>{v}</option>)}
                        </select>
                      </div>
                      <div className="page-nav">
                        <button disabled={overviewPage === 1} onClick={() => setOverviewPage(p => p - 1)} className="page-btn">
                          Prev
                        </button>
                        <span className="page-info">Page {overviewPage} of {totalOverviewPages || 1}</span>
                        <button disabled={overviewPage >= totalOverviewPages} onClick={() => setOverviewPage(p => p + 1)} className="page-btn">
                          Next
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {activeSection === 'files' && (
            <div className="section-content">
              {/* Filters */}
              <div className="filters-bar">
                <div className="search-wrap">
                  <Search size={15} />
                  <input
                    type="text"
                    placeholder="Search by key, model, session..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="filter-input"
                    id="admin-search"
                  />
                  {search && (
                    <button className="clear-btn" onClick={() => setSearch('')}>
                      <X size={13} />
                    </button>
                  )}
                </div>
                <div className="filter-select-wrap">
                  <Filter size={14} />
                  <select value={filterModel} onChange={e => setFilterModel(e.target.value)} className="filter-select">
                    <option value="">All Models</option>
                    {stats?.models.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div className="filter-select-wrap">
                  <Layers size={14} />
                  <select value={filterKey} onChange={e => setFilterKey(e.target.value)} className="filter-select">
                    <option value="">All Keys</option>
                    {stats?.keys.map(k => <option key={k} value={k}>{k}</option>)}
                  </select>
                </div>
                {(filterModel || filterKey || search) && (
                  <button className="filter-clear-btn" onClick={() => { setSearch(''); setFilterModel(''); setFilterKey(''); }}>
                    <X size={14} /> Clear
                  </button>
                )}
                <span className="result-count">{filtered.length} result{filtered.length !== 1 ? 's' : ''}</span>
              </div>

              {/* File Table */}
              <div className="detail-card">
                {filtered.length === 0 ? (
                  <div className="empty-state">
                    <Music size={40} strokeWidth={1} />
                    <p>{isLoading ? 'Loading audio files...' : 'No files match your filters.'}</p>
                  </div>
                ) : (
                  <>
                    <div className="file-table file-table--files">
                      <div className="file-table-head">
                        <span>Select</span>
                        <span>Key</span>
                        <span>Model</span>

                        <span>Session</span>
                        <span>File</span>
                        <span>Size</span>
                        <span>Captured</span>
                        <span></span>
                        <span></span>
                      </div>
                      {paginatedFiles.map(e => {
                        const id = e.relativePath;
                        const isSelected = selectedFiles.find(f => f.relativePath === e.relativePath);
                        return (
                          <div key={id} className={`file-row ${isSelected ? 'file-row--selected' : ''}`} onClick={() => { setActiveEntry(e); setPlayingId(id); }}>
                            <div className="file-row-select" onClick={(evt) => toggleSelection(evt, e)}>
                              <div className={`checkbox ${isSelected ? 'checkbox--active' : ''}`} />
                            </div>
                            <span className="file-key-badge">{e.key}</span>

                            <span className="file-model">{e.model}</span>
                            <span className="file-session">{e.session}</span>
                            <span className="file-name">{e.filename}</span>
                            <span className="file-size">{formatBytes(e.size)}</span>
                            <span className="file-date">{formatDate(e.createdAt)}</span>
                            <button className="file-play-btn" title="Play">
                              <WaveformBar active={playingId === id} />
                              <Play size={13} />
                            </button>
                            <button className="file-delete-btn" onClick={(evt) => handleDelete(evt, e)} title="Delete recording">
                              <Trash2 size={13} />
                            </button>
                          </div>
                        );
                      })}
                    </div>

                    {/* Pagination for Files */}
                    <div className="pagination-bar">
                      <div className="rows-picker">
                        <span>Show</span>
                        <select value={rowsPerPage} onChange={e => { setRowsPerPage(Number(e.target.value)); setOverviewPage(1); setFilesPage(1); }}>
                          {[5, 10, 20, 50, 100].map(v => <option key={v} value={v}>{v}</option>)}
                        </select>
                      </div>
                      <div className="page-nav">
                        <button disabled={filesPage === 1} onClick={() => setFilesPage(p => p - 1)} className="page-btn">
                          Prev
                        </button>
                        <span className="page-info">Page {filesPage} of {totalFilesPages || 1}</span>
                        <button disabled={filesPage >= totalFilesPages} onClick={() => setFilesPage(p => p + 1)} className="page-btn">
                          Next
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
          {activeSection === 'cleaning' && (
            <div className="section-content">
              <CleaningModule
                allEntries={entries}
                setSelectedFiles={setSelectedFiles}
                stats={stats}
                formatBytes={formatBytes}
                formatDate={formatDate}
                toggleSelection={toggleSelection}
                selectedFiles={selectedFiles}
                setActiveEntry={setActiveEntry}
                setPlayingId={setPlayingId}
                playingId={playingId}
                onDelete={handleDelete}
              />
            </div>
          )}

          {activeSection === 'tree' && (
            <div className="section-content">
              <TreeModule
                entries={entries}
                formatBytes={formatBytes}
                formatDate={formatDate}
                onDelete={handleDelete}
              />
            </div>
          )}

          {/* Selection Bar */}
          {selectedFiles.length > 0 && activeSection !== 'cleaning' && (
            <div className="selection-bar animate-in">
              <div className="selection-bar-left">
                <div className="selection-count">{selectedFiles.length}</div>
                <div className="selection-text">
                  <strong>Tracks Selected</strong>
                  <span>Ready for advanced cleaning and signature analysis</span>
                </div>
              </div>
              <div className="selection-bar-actions">
                <button className="selection-btn selection-btn--ghost" onClick={() => setSelectedFiles([])}>
                  Clear Selection
                </button>
                <button className="selection-btn selection-btn--primary" onClick={() => setActiveSection('cleaning')}>
                  Open Workbench <Activity size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      </main>


      {/* Floating Refresh Button */}
      <button
        className="floating-refresh"
        onClick={fetchData}
        disabled={isLoading}
        title="Refresh datasets"
      >
        <RefreshCw size={22} className={isLoading ? 'spin' : ''} />
      </button>

      {/* Audio Player Modal */}
      {activeEntry && (
        <AudioPlayer
          entry={activeEntry}
          onClose={() => { setActiveEntry(null); setPlayingId(null); }}
        />
      )}

      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }

        .admin-root {
          display: flex;
          height: 100vh;
          background: #050508;
          font-family: 'Inter', system-ui, sans-serif;
          color: #d0d0d8;
          overflow: hidden;
          position: relative;
        }

        .admin-root::before {
          content: "";
          position: absolute;
          inset: 0;
          background: 
            radial-gradient(circle at 0% 0%, rgba(112,0,255,0.08) 0%, transparent 40%),
            radial-gradient(circle at 100% 100%, rgba(0,242,255,0.08) 0%, transparent 40%);
          pointer-events: none;
        }

        /* ── Sidebar ── */
        .admin-sidebar {
          width: 270px;
          flex-shrink: 0;
          background: rgba(8,8,12,0.95);
          backdrop-filter: blur(40px);
          border-right: 1px solid rgba(255,255,255,0.06);
          display: flex;
          flex-direction: column;
          padding: 4rem 1.5rem 2.5rem;
          height: 100vh;
          overflow-y: auto;
          z-index: 20;
        }

        .sidebar-logo {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.5rem 0.5rem 1.5rem;
          border-bottom: 1px solid rgba(255,255,255,0.06);
          margin-bottom: 1.5rem;
        }

        .sidebar-logo-icon {
          width: 38px;
          height: 38px;
          border-radius: 10px;
          background: linear-gradient(135deg, rgba(0,242,255,0.2), rgba(112,0,255,0.2));
          border: 1px solid rgba(0,242,255,0.15);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #00f2ff;
          flex-shrink: 0;
        }

        .sidebar-brand {
          font-size: 0.9rem;
          font-weight: 700;
          color: #eee;
          letter-spacing: -0.01em;
        }

        .sidebar-sub {
          font-size: 0.65rem;
          color: #444;
        }

        .sidebar-nav {
          display: flex;
          flex-direction: column;
          gap: 0.6rem;
          flex: 1;
        }

        .nav-item {
          display: flex;
          align-items: center;
          gap: 0.7rem;
          padding: 0.65rem 0.8rem;
          border-radius: 10px;
          border: none;
          background: transparent;
          color: #666;
          font-size: 0.85rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
          text-align: left;
          width: 100%;
          font-family: inherit;
        }

        .nav-item:hover { 
          background: rgba(255,255,255,0.05); 
          color: #aaa; 
          transform: translateX(4px);
        }

        .nav-item--active {
          background: linear-gradient(90deg, rgba(0,242,255,0.1), transparent) !important;
          color: #00f2ff !important;
          border-left: 2px solid #00f2ff;
          border-radius: 0 10px 10px 0;
        }

        .nav-badge {
          margin-left: auto;
          background: rgba(0,242,255,0.1);
          color: #00f2ff;
          font-size: 0.62rem;
          font-weight: 800;
          padding: 0.25rem 0.6rem;
          border-radius: 8px;
          border: 1px solid rgba(0,242,255,0.15);
        }

        .sidebar-footer {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          padding-top: 1rem;
          border-top: 1px solid rgba(255,255,255,0.06);
          margin-top: 1rem;
        }

        .sidebar-user { display: flex; align-items: center; gap: 0.6rem; flex: 1; min-width: 0; }

        .user-avatar {
          width: 36px;
          height: 36px;
          border-radius: 12px;
          background: linear-gradient(135deg, #00c8ff, #7000ff);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.75rem;
          font-weight: 800;
          color: #fff;
          flex-shrink: 0;
          box-shadow: 0 4px 12px rgba(0,0,0,0.3);
          border: 1px solid rgba(255,255,255,0.1);
        }

        .user-name { font-size: 0.85rem; font-weight: 700; color: #fff; letter-spacing: -0.01em; }
        .user-role { font-size: 0.65rem; color: #555; font-weight: 500; }

        .logout-btn {
          background: rgba(255,51,102,0.1);
          border: 1px solid rgba(255,51,102,0.2);
          color: #ff3366;
          border-radius: 9px;
          padding: 0.5rem;
          cursor: pointer;
          display: flex;
          align-items: center;
          transition: all 0.2s;
          flex-shrink: 0;
        }

        .logout-btn:hover { background: rgba(255,51,102,0.2); transform: scale(1.05); }

        /* ── Main ── */
        .admin-main {
          flex: 1;
          height: 100vh;
          overflow-y: auto;
          overflow-x: hidden;
          display: flex;
          flex-direction: column;
          justify-content: flex-start;
          position: relative;
          padding: 4rem 5rem 6rem 5rem;
          scroll-behavior: smooth;
        }


        .dashboard-content {
          max-width: 1400px;
          margin: 2rem auto 0;
          width: 100%;
        }

        .content-header {
          margin-bottom: 5.5rem;
          animation: slideDownFade 0.7s cubic-bezier(0.16, 1, 0.3, 1);
        }

        @keyframes slideDownFade {
          from { opacity: 0; transform: translateY(-20px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .header-badge {
          display: inline-block;
          padding: 0.3rem 0.8rem;
          background: rgba(0,242,255,0.06);
          border: 1px solid rgba(0,242,255,0.15);
          border-radius: 99px;
          font-size: 0.65rem;
          font-weight: 700;
          color: #00f2ff;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          margin-bottom: 0.8rem;
        }

        .main-title {
          font-size: 2.2rem;
          font-weight: 800;
          color: #fff;
          letter-spacing: -0.04em;
        }

        .refresh-btn {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.55rem 1rem;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 10px;
          color: #888;
          font-size: 0.8rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
          font-family: inherit;
        }

        .refresh-btn:hover:not(:disabled) { color: #00f2ff; border-color: rgba(0,242,255,0.3); }
        .refresh-btn:disabled { opacity: 0.4; cursor: not-allowed; }

        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }

        .section-content {
          flex: 1;
        }

        /* Stats */
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 1rem;
          margin-bottom: 1.5rem;
        }

        @media (max-width: 1100px) { .stats-grid { grid-template-columns: repeat(2, 1fr); } }

        .stat-card {
          background: rgba(255,255,255,0.02);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 20px;
          padding: 1.5rem;
          display: flex;
          align-items: center;
          gap: 1.2rem;
          transition: all 0.3s ease;
        }

        .stat-card:hover { 
          border-color: rgba(255,255,255,0.12);
          background: rgba(255,255,255,0.04);
          transform: translateY(-4px);
          box-shadow: 0 10px 30px rgba(0,0,0,0.2);
        }

        .stat-icon {
          width: 52px;
          height: 52px;
          border-radius: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          box-shadow: 0 4px 15px rgba(0,0,0,0.2);
        }

        .stat-icon--cyan { background: rgba(0,242,255,0.1); color: #00f2ff; }
        .stat-icon--purple { background: rgba(112,0,255,0.1); color: #9b40ff; }
        .stat-icon--pink { background: rgba(255,0,200,0.1); color: #ff40d4; }
        .stat-icon--green { background: rgba(0,255,136,0.1); color: #00ff88; }

        .stat-value {
          font-size: 1.5rem;
          font-weight: 800;
          color: #eee;
          letter-spacing: -0.03em;
        }

        .stat-label {
          font-size: 0.7rem;
          color: #555;
          margin-top: 0.1rem;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }

        /* Detail cards */
        .detail-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1rem;
        }

        @media (max-width: 900px) { .detail-grid { grid-template-columns: 1fr; } }

        .detail-card {
          background: rgba(20,20,30,0.4);
          backdrop-filter: blur(30px);
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 24px;
          padding: 1.8rem;
          box-shadow: 0 10px 40px rgba(0,0,0,0.2);
        }

        .detail-card-header {
          display: flex;
          align-items: center;
          gap: 0.8rem;
          margin-bottom: 1.5rem;
          color: #00f2ff;
        }

        .detail-card-header h3 {
          font-size: 0.85rem;
          font-weight: 600;
          color: #aaa;
          letter-spacing: 0.02em;
        }

        .view-all-btn {
          margin-left: auto;
          background: none;
          border: none;
          color: #00f2ff;
          font-size: 0.75rem;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 0.2rem;
          font-family: inherit;
          opacity: 0.7;
          transition: opacity 0.2s;
        }

        .view-all-btn:hover { opacity: 1; }

        .empty-text {
          font-size: 0.8rem;
          color: #333;
          text-align: center;
          padding: 1.5rem 0;
        }

        /* Model list */
        .model-list { display: flex; flex-direction: column; gap: 0.7rem; }

        .model-row {
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        .model-row-left {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          color: #888;
          font-size: 0.8rem;
          min-width: 130px;
          flex-shrink: 0;
        }

        .model-name {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .model-row-right {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          flex: 1;
        }

        .model-bar-wrap {
          flex: 1;
          height: 6px;
          background: rgba(255,255,255,0.05);
          border-radius: 99px;
          overflow: hidden;
        }

        .model-bar {
          height: 100%;
          background: linear-gradient(90deg, #00c8ff, #7000ff);
          border-radius: 99px;
          transition: width 0.6s ease;
        }

        .model-count { font-size: 0.75rem; color: #555; min-width: 24px; text-align: right; }

        /* Key chart */
        .key-chart { display: flex; flex-direction: column; gap: 0.6rem; }

        .key-bar-row {
          display: flex;
          align-items: center;
          gap: 0.8rem;
        }

        .key-label {
          font-size: 0.75rem;
          font-weight: 700;
          color: #888;
          min-width: 36px;
          text-align: center;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 6px;
          padding: 0.2rem 0.4rem;
        }

        .key-bar-wrap { flex: 1; }

        .key-bar {
          height: 20px;
          background: linear-gradient(90deg, rgba(0,200,255,0.3), rgba(112,0,255,0.3));
          border: 1px solid rgba(0,200,255,0.2);
          border-radius: 6px;
          min-width: 30px;
          display: flex;
          align-items: center;
          justify-content: flex-end;
          padding-right: 0.5rem;
          transition: width 0.6s ease;
        }

        .key-bar-val { font-size: 0.65rem; color: #00f2ff; font-weight: 700; }

        /* File Table */
        .file-table { display: flex; flex-direction: column; }

        .file-table-head {
          padding: 0.8rem 1.2rem;
          font-size: 0.65rem;
          color: #444;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          border-bottom: 1px solid rgba(255,255,255,0.05);
          margin-bottom: 0.3rem;
        }

        /* Distinct Layouts */
        .file-table--overview .file-table-head,
        .file-table--overview .file-row {
          display: grid;
          grid-template-columns: 60px 80px 1.5fr 2.5fr 110px 160px 60px 60px;
        }
 
        .file-table--files .file-table-head,
        .file-table--files .file-row {
          display: grid;
          grid-template-columns: 60px 80px 1.2fr 1.8fr 1.5fr 100px 150px 60px 60px;
        }

        .file-delete-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(255, 51, 102, 0.08);
          border: 1px solid rgba(255, 51, 102, 0.15);
          border-radius: 8px;
          color: #ff3366;
          padding: 0.4rem;
          cursor: pointer;
          transition: all 0.2s;
          width: 38px;
          height: 32px;
          margin-left: 0.5rem;
        }

        .file-delete-btn:hover {
          background: rgba(255, 51, 102, 0.2);
          transform: scale(1.05);
          border-color: rgba(255, 51, 102, 0.4);
        }


        .file-row--selected {
          background: rgba(0, 242, 255, 0.04) !important;
          border-color: rgba(0, 242, 255, 0.2) !important;
        }

        .file-row-select {
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .checkbox {
          width: 18px;
          height: 18px;
          border: 1.5px solid rgba(255,255,255,0.1);
          border-radius: 5px;
          transition: all 0.2s;
          position: relative;
        }

        .checkbox--active {
          background: #00f2ff;
          border-color: #00f2ff;
          box-shadow: 0 0 10px rgba(0, 242, 255, 0.4);
        }

        .checkbox--active::after {
          content: '✓';
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #000;
          font-size: 10px;
          font-weight: 900;
        }

        /* ── Cleaning Module ── */
        .cleaning-module {
          animation: fadeIn 0.4s ease;
        }

        .module-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          margin-bottom: 2rem;
          padding-bottom: 1.5rem;
          border-bottom: 1px solid rgba(255,255,255,0.06);
        }

        .module-title { font-size: 1.3rem; color: #fff; font-weight: 700; margin-bottom: 0.3rem; }
        .module-subtitle { font-size: 0.8rem; color: #555; }

        .module-controls { display: flex; gap: 1rem; }
        
        .btn-action {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          padding: 0.6rem 1.2rem;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 12px;
          color: #888;
          font-size: 0.85rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }

        .btn-action:hover { background: rgba(255,255,255,0.08); color: #ccc; }
        .btn-action--primary { background: rgba(0,242,255,0.1); border-color: rgba(0,242,255,0.2); color: #00f2ff; }
        .btn-action--primary:hover { background: rgba(0,242,255,0.15); color: #00f2ff; }

        .module-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 6rem 0;
          color: #333;
          text-align: center;
        }

        .module-empty h3 { color: #555; margin: 1rem 0 0.5rem; }
        .module-empty p { font-size: 0.85rem; max-width: 300px; }

        .tracks-list { display: flex; flex-direction: column; gap: 1.5rem; }

        .track-card {
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 20px;
          padding: 1.5rem;
          transition: all 0.3s;
        }

        .track-card:hover { background: rgba(255,255,255,0.04); border-color: rgba(255,255,255,0.1); }

        .track-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1.5rem;
        }

        .track-info { display: flex; align-items: center; gap: 1rem; }
        .track-key {
          padding: 0.3rem 0.8rem;
          background: #00f2ff;
          color: #000;
          border-radius: 8px;
          font-weight: 800;
          font-size: 0.8rem;
          height: 32px;
          display: flex;
          align-items: center;
        }
        .track-name { font-size: 0.85rem; color: #eee; font-family: 'JetBrains Mono', monospace; font-weight: 600; margin-bottom: 0.2rem;}
        .track-meta-pills { display: flex; gap: 0.5rem; }
        .track-meta-pills span { 
          font-size: 0.6rem; 
          color: #555; 
          background: rgba(255,255,255,0.03); 
          padding: 0.1rem 0.4rem; 
          border-radius: 4px; 
          border: 1px solid rgba(255,255,255,0.05);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .track-actions { display: flex; gap: 0.6rem; }

        .track-btn {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          padding: 0.5rem 0.8rem;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 8px;
          color: #777;
          font-size: 0.75rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }
        .track-btn:hover { background: rgba(255,255,255,0.1); color: #ccc; }
        .track-btn.active { color: #00f2ff; border-color: rgba(0,242,255,0.3); }
        .track-btn--delete:hover { background: rgba(255,51,102,0.1); color: #ff3366; border-color: rgba(255,51,102,0.2); }
        .track-btn--close:hover { background: rgba(255,255,255,0.1); color: #fff; }


        .track-visuals { display: grid; grid-template-columns: 1fr; gap: 1.5rem; }
        
        .visual-group { display: flex; flex-direction: column; gap: 0.6rem; }
        .visual-group label { font-size: 0.65rem; color: #444; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 700; }
        
        .canvas-wrap {
          position: relative;
          width: 100%;
          height: 100px;
          background: rgba(0,0,0,0.3);
          border-radius: 12px;
          overflow: hidden;
          border: 1px solid rgba(255,255,255,0.03);
        }
        .canvas-wrap canvas { width: 100%; height: 100%; display: block; }
        
        .playhead {
          position: absolute;
          top: 0;
          bottom: 0;
          width: 2px;
          background: #fff;
          box-shadow: 0 0 10px #fff;
          z-index: 10;
          pointer-events: none;
        }

        .animate-in { animation: slideUpFade 0.4s ease; }

        /* View Toggle */
        .view-toggle {
          display: flex;
          background: rgba(255,255,255,0.03);
          padding: 0.3rem;
          border-radius: 12px;
          border: 1px solid rgba(255,255,255,0.06);
          margin-right: 1rem;
        }

        .toggle-btn {
          padding: 0.4rem 0.8rem;
          border-radius: 8px;
          border: none;
          background: transparent;
          color: #555;
          font-size: 0.75rem;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 0.4rem;
          transition: all 0.2s;
          font-family: inherit;
        }

        .toggle-btn.active {
          background: rgba(0,242,255,0.1);
          color: #00f2ff;
        }

        .toggle-btn:hover:not(.active) {
          color: #aaa;
        }

        /* ── Selection Bar ── */

        .selection-bar {
          position: sticky;
          bottom: 2rem;
          left: 0;
          right: 0;
          background: rgba(10,10,25,0.9);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(0,242,255,0.3);
          border-radius: 20px;
          padding: 1.2rem 2rem;
          display: flex;
          justify-content: space-between;
          align-items: center;
          box-shadow: 0 10px 40px rgba(0,0,0,0.4), 0 0 30px rgba(0,242,255,0.1);
          z-index: 100;
          margin-top: 2rem;
        }

        .selection-bar-left { display: flex; align-items: center; gap: 1.2rem; }
        .selection-count {
          width: 40px;
          height: 40px;
          background: #00f2ff;
          color: #000;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 800;
          font-size: 1.2rem;
        }
        .selection-text { display: flex; flex-direction: column; }
        .selection-text strong { font-size: 0.95rem; color: #fff; }
        .selection-text span { font-size: 0.75rem; color: #555; }

        .selection-bar-actions { display: flex; gap: 1rem; }
        .selection-btn {
          padding: 0.7rem 1.4rem;
          border-radius: 12px;
          font-size: 0.85rem;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          gap: 0.6rem;
          font-family: inherit;
        }
        .selection-btn--ghost {
          background: none;
          border: 1px solid rgba(255,255,255,0.1);
          color: #777;
        }
        .selection-btn--ghost:hover { background: rgba(255,255,255,0.05); color: #ccc; }
        .selection-btn--primary {
          background: #00f2ff;
          border: none;
          color: #000;
          box-shadow: 0 4px 15px rgba(0,242,255,0.2);
        }
        .selection-btn--primary:hover { transform: translateY(-2px); box-shadow: 0 8px 25px rgba(0,242,255,0.35); }

        .loading-overlay {
          position: absolute;
          inset: 0;
          background: rgba(0,0,0,0.6);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 0.8rem;
          color: #00f2ff;
          font-size: 0.8rem;
          backdrop-filter: blur(4px);
        }

        /* ── Batch Navigation ── */
        .batch-navigation {
           display: flex;
           justify-content: center;
           align-items: center;
           gap: 2rem;
           margin-top: 3rem;
           padding-top: 2rem;
           border-top: 1px solid rgba(255,255,255,0.06);
        }

        .batch-btn {
           display: flex;
           align-items: center;
           gap: 0.6rem;
           background: rgba(255,255,255,0.04);
           border: 1px solid rgba(255,255,255,0.08);
           color: #888;
           padding: 0.8rem 1.5rem;
           border-radius: 12px;
           font-size: 0.9rem;
           font-weight: 600;
           cursor: pointer;
           transition: all 0.2s;
        }

        .batch-btn:hover:not(:disabled) {
           background: rgba(0,242,255,0.1);
           color: #00f2ff;
           border-color: rgba(0,242,255,0.3);
           transform: translateY(-2px);
        }

        .batch-btn:disabled { opacity: 0.3; cursor: not-allowed; }

        .batch-info {
           font-size: 0.85rem;
           color: #444;
           font-weight: 700;
           letter-spacing: 0.05em;
           text-transform: uppercase;
        }





        .file-table-head span:last-child { text-align: center; }

        .file-row {
          padding: 0.8rem 1.2rem;
          border-radius: 12px;
          align-items: center;
          cursor: pointer;
          transition: background 0.15s;
          border: 1px solid transparent;
          font-size: 0.82rem;
        }

        .file-row:hover {
          background: rgba(0,242,255,0.04);
          border-color: rgba(0,242,255,0.1);
        }

        .file-key-badge {
          background: rgba(0,242,255,0.1);
          color: #00f2ff;
          font-size: 0.75rem;
          font-weight: 800;
          padding: 0.3rem 0.7rem;
          border-radius: 8px;
          border: 1px solid rgba(0,242,255,0.2);
          display: inline-block;
          text-align: center;
          width: 50px;
        }

        .file-model, .file-session { color: #777; font-size: 0.78rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding-right: 0.5rem; }
        .file-name { 
          color: #555; 
          font-size: 0.72rem; 
          font-family: 'JetBrains Mono', 'Fira Code', monospace; 
          overflow: hidden; 
          text-overflow: ellipsis; 
          white-space: nowrap; 
        }
        .file-size { color: #555; font-size: 0.75rem; }
        .file-date { color: #555; font-size: 0.72rem; }

        .file-play-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.3rem;
          background: rgba(0,242,255,0.08);
          border: 1px solid rgba(0,242,255,0.15);
          border-radius: 8px;
          color: #00f2ff;
          padding: 0.4rem;
          cursor: pointer;
          transition: all 0.2s;
          width: 38px;
          height: 32px;
        }

        .file-play-btn:hover {
          background: rgba(0,242,255,0.15);
          transform: scale(1.05);
        }

        /* Waveform bars */
        .waveform-bars {
          display: flex;
          align-items: center;
          gap: 1.5px;
          height: 14px;
        }

        .wf-bar {
          width: 2px;
          height: 4px;
          background: #00f2ff;
          border-radius: 1px;
          opacity: 0.4;
        }

        .wf-bar--active {
          opacity: 1;
          animation: wfAnim 0.5s ease-in-out infinite alternate;
        }

        @keyframes wfAnim {
          from { height: 3px; }
          to { height: 12px; }
        }

        /* Filters bar */
        .filters-bar {
          display: flex;
          align-items: center;
          gap: 1rem;
          margin-top: 1.5rem;
          margin-bottom: 2rem;
          flex-wrap: wrap;
        }

        .search-wrap {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.09);
          border-radius: 10px;
          padding: 0.55rem 0.9rem;
          flex: 1;
          min-width: 200px;
          color: #555;
          transition: border-color 0.2s;
        }

        .search-wrap:focus-within {
          border-color: rgba(0,242,255,0.3);
          color: #00f2ff;
        }

        .filter-input {
          flex: 1;
          background: none;
          border: none;
          outline: none;
          color: #ccc;
          font-size: 0.85rem;
          font-family: inherit;
        }

        .filter-input::placeholder { color: #444; }

        .clear-btn {
          background: none;
          border: none;
          color: #555;
          cursor: pointer;
          display: flex;
          align-items: center;
          padding: 0;
        }

        .filter-select-wrap {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.09);
          border-radius: 10px;
          padding: 0.55rem 0.8rem;
          color: #555;
        }

        .filter-select {
          background: none;
          border: none;
          outline: none;
          color: #ccc;
          font-size: 0.82rem;
          font-family: inherit;
          cursor: pointer;
          appearance: none;
        }

        .filter-select option { background: #111; }

        .filter-clear-btn {
          display: flex;
          align-items: center;
          gap: 0.3rem;
          padding: 0.5rem 0.9rem;
          background: rgba(255,51,102,0.08);
          border: 1px solid rgba(255,51,102,0.2);
          border-radius: 10px;
          color: #ff3366;
          font-size: 0.78rem;
          cursor: pointer;
          font-family: inherit;
          transition: all 0.2s;
        }

        .filter-clear-btn:hover { background: rgba(255,51,102,0.14); }

        .floating-refresh {
          position: fixed;
          bottom: 2.5rem;
          right: 2.5rem;
          z-index: 100;
          width: 56px;
          height: 56px;
          border-radius: 18px;
          background: linear-gradient(135deg, #00c8ff, #7000ff);
          border: 1px solid rgba(255,255,255,0.2);
          color: #fff;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          box-shadow: 0 8px 25px rgba(0,200,255,0.3);
          transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }

        .floating-refresh:hover {
          transform: scale(1.1) rotate(15deg);
          box-shadow: 0 12px 35px rgba(0,200,255,0.45);
        }

        .floating-refresh:active {
          transform: scale(0.95);
        }

        .floating-refresh:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .pagination-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 1rem 0 0 0;
          margin-top: 1.5rem;
          border-top: 1px solid rgba(255,255,255,0.05);
        }

        .rows-picker {
          display: flex;
          align-items: center;
          gap: 0.8rem;
          font-size: 0.8rem;
          color: #555;
        }

        .rows-picker select {
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.1);
          color: #00f2ff;
          padding: 0.3rem 0.6rem;
          border-radius: 8px;
          outline: none;
          cursor: pointer;
        }

        .page-nav {
          display: flex;
          align-items: center;
          gap: 1.2rem;
        }

        .page-btn {
          padding: 0.5rem 1rem;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 10px;
          color: #888;
          font-size: 0.75rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }

        .page-btn:hover:not(:disabled) {
          background: rgba(0,242,255,0.06);
          color: #00f2ff;
          border-color: rgba(0,242,255,0.25);
        }

        .page-btn:disabled {
          opacity: 0.3;
          cursor: not-allowed;
        }

        .page-info {
          font-size: 0.75rem;
          color: #555;
          font-weight: 500;
        }

        .result-count {
          font-size: 0.75rem;
          color: #555;
          margin-left: auto;
        }

        /* Empty state */
        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.8rem;
          padding: 3rem 0;
          color: #333;
          font-size: 0.85rem;
        }

        /* ── Player Modal ── */
        .player-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.7);
          backdrop-filter: blur(8px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          animation: fadeIn 0.2s ease;
        }

        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

        .player-modal {
          position: relative;
          width: 100%;
          max-width: 500px;
          margin: 1rem;
          background: rgba(10,10,22,0.97);
          border: 1px solid rgba(0,242,255,0.15);
          border-radius: 24px;
          padding: 1.8rem;
          box-shadow: 0 20px 60px rgba(0,0,0,0.6), 0 0 60px rgba(0,242,255,0.06);
          animation: slideUp 0.25s ease;
        }

        @keyframes slideUp {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }

        .player-close {
          position: absolute;
          top: 1rem;
          right: 1rem;
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 8px;
          color: #666;
          cursor: pointer;
          padding: 0.35rem;
          display: flex;
          align-items: center;
          transition: all 0.2s;
        }

        .player-close:hover { color: #fff; background: rgba(255,255,255,0.1); }

        .player-header {
          display: flex;
          align-items: center;
          gap: 0.8rem;
          margin-bottom: 1.2rem;
        }

        .player-icon {
          width: 44px;
          height: 44px;
          border-radius: 12px;
          background: rgba(0,242,255,0.08);
          border: 1px solid rgba(0,242,255,0.15);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #00f2ff;
          flex-shrink: 0;
        }

        .player-key {
          font-size: 0.95rem;
          color: #ddd;
          font-weight: 600;
        }

        .player-key strong { color: #00f2ff; }

        .player-meta { font-size: 0.72rem; color: #555; margin-top: 0.15rem; }

        .player-canvas {
          width: 100%;
          height: 80px;
          background: rgba(0,0,0,0.3);
          border-radius: 12px;
          border: 1px solid rgba(255,255,255,0.05);
          display: block;
        }

        .player-progress-wrap { margin: 1rem 0; }

        .player-progress-bar {
          width: 100%;
          height: 4px;
          background: rgba(255,255,255,0.07);
          border-radius: 99px;
          cursor: pointer;
          position: relative;
          overflow: hidden;
        }

        .player-progress-fill {
          height: 100%;
          background: linear-gradient(90deg, #00c8ff, #7000ff);
          border-radius: 99px;
          transition: width 0.1s linear;
        }

        .player-times {
          display: flex;
          justify-content: space-between;
          font-size: 0.68rem;
          color: #555;
          margin-top: 0.4rem;
          font-family: monospace;
        }

        .player-controls {
          display: flex;
          align-items: center;
          gap: 0.7rem;
          margin-top: 1rem;
        }

        .player-btn {
          width: 44px;
          height: 44px;
          border-radius: 12px;
          background: linear-gradient(135deg, rgba(0,200,255,0.15), rgba(112,0,255,0.15));
          border: 1px solid rgba(0,242,255,0.2);
          color: #00f2ff;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
          text-decoration: none;
        }

        .player-btn:hover { transform: scale(1.08); filter: brightness(1.2); }

        .player-btn--stop {
          background: rgba(255,51,102,0.1);
          border-color: rgba(255,51,102,0.2);
          color: #ff3366;
        }

        .player-btn--dl {
          background: rgba(0,255,136,0.08);
          border-color: rgba(0,255,136,0.15);
          color: #00ff88;
        }

        .player-volume {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          flex: 1;
          color: #555;
        }

        .volume-slider {
          flex: 1;
          height: 3px;
          appearance: none;
          background: rgba(255,255,255,0.1);
          border-radius: 99px;
          outline: none;
          cursor: pointer;
        }

        .volume-slider::-webkit-slider-thumb {
          appearance: none;
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: #00f2ff;
          cursor: pointer;
        }

        /* ── Tree Module ── */
        .tree-layout {
          display: grid;
          grid-template-columns: 320px 1fr;
          gap: 1.5rem;
          height: calc(100vh - 250px);
          min-height: 500px;
        }

        @media (max-width: 1000px) {
          .tree-layout { grid-template-columns: 1fr; height: auto; }
        }

        .tree-explorer {
          background: rgba(20,20,30,0.3);
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 20px;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .tree-scroll {
          flex: 1;
          overflow-y: auto;
          padding: 1rem 0;
        }

        .tree-node {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          padding: 0.5rem 1rem;
          cursor: pointer;
          transition: all 0.2s;
          font-size: 0.85rem;
          color: #888;
        }

        .tree-node:hover {
          background: rgba(255,255,255,0.04);
          color: #ccc;
        }

        .tree-node.active {
          background: rgba(0,242,255,0.1);
          color: #00f2ff;
          border-left: 2px solid #00f2ff;
        }

        .node-icon { opacity: 0.6; }
        .active .node-icon { opacity: 1; }

        .chevron-wrap {
          width: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          opacity: 0.4;
        }

        .node-name {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .tree-detail {
          overflow-y: auto;
          border-radius: 20px;
        }

        .metadata-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 1.5rem;
        }

        .meta-item {
          display: flex;
          flex-direction: column;
          gap: 0.3rem;
        }

        .meta-item label {
          font-size: 0.6rem;
          color: #555;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          font-weight: 700;
        }

        .meta-item span {
          font-size: 0.9rem;
          color: #eee;
          font-weight: 500;
        }

        .path-code {
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.7rem;
          background: rgba(0,0,0,0.3);
          padding: 0.2rem 0.5rem;
          border-radius: 4px;
          color: #00f2ff;
          word-break: break-all;
        }

        .model-name-text { color: #9b40ff !important; }
        .session-path-text { color: #aaa !important; font-size: 0.8rem !important; }
      `}</style>
    </div>
  );
}
