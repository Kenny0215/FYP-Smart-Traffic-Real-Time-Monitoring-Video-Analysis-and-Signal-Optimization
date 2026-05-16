import React, { useRef, useEffect, useCallback } from 'react';
import {
  Upload, Play, CheckCircle2, X, Trash2,
  Loader2, Wifi, WifiOff, AlertTriangle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Card }            from '../components/Card';
import { Button }          from '../components/Button';
import { cn }              from '../utils';
import { TrafficLightIcon } from '../components/TrafficLightIcon';
// import { GoogleGenAI, Type } from '@google/genai'; // AI validation disabled — quota exceeded
import { UploadState, LaneStat } from '../App';

const FLASK_URL = 'http://127.0.0.1:5000';

const toLaneKey = (lane: string) => lane.replace(' ', '');

const congestionColor = (level: string) => {
  if (level === 'High')   return 'text-rose-400';
  if (level === 'Medium') return 'text-amber-400';
  return 'text-emerald-400';
};

const LANE_CONFIG_DISPLAY: Record<string, string> = {
  LaneA: 'Lane A', LaneB: 'Lane B', LaneC: 'Lane C', LaneD: 'Lane D',
};

// ── Props ──────────────────────────────────────────────────
interface UploadPageProps {
  uploadState:       UploadState;
  setUploadState:    React.Dispatch<React.SetStateAction<UploadState>>;
  startStatsPoll:    (lanes: string[]) => void;
  onClearAll:        () => Promise<void>;  // from App.tsx — also sets hasData=false
  onAnalysisComplete: () => void;          // from App.tsx — sets hasData=true + nav to dashboard
}

// ── Component ──────────────────────────────────────────────
export const UploadPage = ({
  uploadState,
  setUploadState,
  startStatsPoll,
  onClearAll,
  onAnalysisComplete,
}: UploadPageProps) => {

  // Destructure all state from App.tsx
  const {
    files, uploadedFiles, activeLanes, laneStats,
    isStreaming, processing, progress, progressLabel,
    error, uploadingLane,
  } = uploadState;

  // Helper — update one or more fields without touching others
  const set = (patch: Partial<UploadState>) =>
    setUploadState(prev => ({ ...prev, ...patch }));

  // File input refs are local (DOM refs, not persisted state)
  const fileInputRefs = {
    'Lane A': useRef<HTMLInputElement>(null),
    'Lane B': useRef<HTMLInputElement>(null),
    'Lane C': useRef<HTMLInputElement>(null),
    'Lane D': useRef<HTMLInputElement>(null),
  };

  // Flask health check — local UI state only
  const [flaskOnline, setFlaskOnline] = React.useState<boolean | null>(null);

  useEffect(() => {
    fetch(`${FLASK_URL}/api/health`)
      .then(r => r.ok ? setFlaskOnline(true) : setFlaskOnline(false))
      .catch(() => setFlaskOnline(false));
  }, []);

  // ── AI Frame Validation via Gemini (DISABLED — quota exceeded) ──
  // Re-enable by uncommenting below and restoring the import at the top
  // const captureFrame = (file: File): Promise<string> => { ... };
  // const validateWithAI = async (lane: string, file: File) => { ... };

  const handleFileChange = (lane: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0] || null;
    set({ error: null });
    if (!selectedFile) {
      set({ files: { ...files, [lane]: null } });
      return;
    }

    // ── Manual validation (AI validation temporarily disabled) ──
    const allowed = ['.mp4', '.avi', '.mov'];
    const ext = selectedFile.name.toLowerCase();
    if (!allowed.some(e => ext.endsWith(e))) {
      set({ error: 'Invalid file type. Only MP4, AVI or MOV files are accepted.' });
      e.target.value = '';
      return;
    }
    if (selectedFile.size > 300 * 1024 * 1024) {
      set({ error: 'File size exceeds 300MB limit.' });
      e.target.value = '';
      return;
    }

    // File passed — accept it directly
    set({ files: { ...files, [lane]: selectedFile }, error: null });
  };

  const removeFile = (lane: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newFiles = { ...files, [lane]: null };
    const newUploaded = { ...uploadedFiles };
    delete newUploaded[toLaneKey(lane)];
    set({ files: newFiles, uploadedFiles: newUploaded });
    if (fileInputRefs[lane as keyof typeof fileInputRefs].current) {
      fileInputRefs[lane as keyof typeof fileInputRefs].current!.value = '';
    }
  };

  // ── Upload + Start Analysis ─────────────────────────────
  const handleStart = async () => {
    const lanesToProcess = Object.entries(files).filter(([, f]) => f !== null);
    if (lanesToProcess.length === 0) return;

    set({ processing: true, error: null, progress: 0 });

    const totalSteps = lanesToProcess.length + 1;
    let stepsDone    = 0;
    const newUploaded: Record<string, string> = {};

    try {
      // Step 1 — Upload each file to Flask
      for (const [lane, file] of lanesToProcess) {
        set({ uploadingLane: lane, progressLabel: `Uploading ${lane}...` });

        const formData = new FormData();
        formData.append('video', file as File);
        formData.append('lane_name', lane);

        const res = await fetch(`${FLASK_URL}/api/upload-video`, {
          method: 'POST',
          body: formData,
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || `Upload failed for ${lane}`);
        }

        const data = await res.json();
        newUploaded[toLaneKey(lane)] = data.filename;

        stepsDone++;
        set({
          uploadedFiles: { ...uploadedFiles, ...newUploaded },
          progress: Math.round((stepsDone / totalSteps) * 80),
        });
      }

      set({ uploadingLane: null });

      // Step 2 — Tell Flask to start analysis
      set({ progressLabel: 'Starting AI analysis...' });

      const res = await fetch(`${FLASK_URL}/api/start-analysis`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ lanes: newUploaded }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to start analysis');
      }

      // Step 3 — Animate to 100%
      set({ progressLabel: 'Initializing streams...' });
      for (let p = Math.round((stepsDone / totalSteps) * 80); p <= 100; p += 5) {
        set({ progress: p });
        await new Promise(r => setTimeout(r, 60));
      }

      // Step 4 — Switch to stream view
      const laneKeys = Object.keys(newUploaded);
      set({
        activeLanes:   laneKeys,
        processing:    false,
        isStreaming:   true,
        uploadedFiles: newUploaded,
      });
      startStatsPoll(laneKeys);

      // Auto-set hasData=true so dashboard is live immediately
      onAnalysisComplete();

    } catch (err: any) {
      console.error('Analysis error:', err);
      set({
        error:         err.message || 'Something went wrong. Is Flask running?',
        processing:    false,
        uploadingLane: null,
        progress:      0,
      });
    }
  };

  const hasFiles   = Object.values(files).some(f => f !== null);
  const laneLabels = ['Lane A', 'Lane B', 'Lane C', 'Lane D'];

  // ── STREAM VIEW ────────────────────────────────────────
  if (isStreaming) {
    return (
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <div className="flex items-center gap-3">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500" />
              </span>
              <h2 className="text-2xl font-bold text-white">Live AI Analysis</h2>
            </div>
            <p className="text-slate-400 mt-1">
              {activeLanes.length} lane{activeLanes.length > 1 ? 's' : ''} streaming · YOLO detection active
            </p>
          </div>
          <Button
            variant="outline"
            onClick={onClearAll}
            className="border-rose-800 hover:bg-rose-900/40 text-rose-400"
          >
            <Trash2 size={16} className="mr-2" /> Clear All Videos
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {activeLanes.map((laneKey) => {
            const stats       = laneStats[laneKey];
            const displayName = LANE_CONFIG_DISPLAY[laneKey] || laneKey;
            return (
              <motion.div
                key={laneKey}
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4 }}
              >
                <Card className="p-0 overflow-hidden">
                  <div className="relative bg-black aspect-video">
                    <img
                      src={`${FLASK_URL}/api/stream-local/${laneKey}`}
                      alt={`${displayName} stream`}
                      className="w-full h-full object-cover"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                    <div className="absolute top-3 left-3 bg-black/70 text-white text-xs font-bold px-2 py-1 rounded">
                      {displayName}
                    </div>
                    {stats && (
                      <div className="absolute top-3 right-3 bg-black/70 text-emerald-400 text-xs font-mono px-2 py-1 rounded">
                        {stats.fps} FPS
                      </div>
                    )}
                  </div>
                  <div className="p-4">
                    {stats ? (
                      <div className="grid grid-cols-4 gap-3">
                        <div className="text-center">
                          <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1">Vehicles</p>
                          <p className="text-lg font-bold text-white">{stats.vehicle_count}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1">Speed</p>
                          <p className="text-lg font-bold text-white">{stats.avg_speed}<span className="text-xs text-slate-500 ml-1">km/h</span></p>
                        </div>
                        <div className="text-center">
                          <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1">Green</p>
                          <p className="text-lg font-bold text-emerald-400">{stats.green_time}<span className="text-xs text-slate-500 ml-1">s</span></p>
                        </div>
                        <div className="text-center">
                          <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1">Status</p>
                          <p className={cn('text-sm font-bold', congestionColor(stats.congestion))}>{stats.congestion}</p>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center gap-2 py-2 text-slate-500">
                        <Loader2 size={14} className="animate-spin" />
                        <span className="text-xs">Waiting for stats...</span>
                      </div>
                    )}
                  </div>
                </Card>
              </motion.div>
            );
          })}
        </div>


      </div>
    );
  }

  // ── UPLOAD VIEW ────────────────────────────────────────
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold text-white">Video Analysis</h2>
            {flaskOnline === true  && <span className="flex items-center gap-1 text-xs text-emerald-500"><Wifi size={12} /> Flask connected</span>}
            {flaskOnline === false && <span className="flex items-center gap-1 text-xs text-rose-500"><WifiOff size={12} /> Flask offline</span>}
          </div>
          <p className="text-slate-400">Upload traffic footage for AI processing</p>
          {error && (
            <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-2 mt-2">
              <AlertTriangle size={13} className="text-rose-500 shrink-0" />
              <p className="text-xs text-rose-500 font-medium">{error}</p>
            </motion.div>
          )}
        </div>

        {!processing && (
          <div className="flex gap-3">
            {hasFiles && (
              <Button variant="outline" onClick={onClearAll} className="border-slate-700 hover:bg-slate-800 text-slate-300">
                <Trash2 size={16} className="mr-2" /> Clear All
              </Button>
            )}
            <Button
              onClick={handleStart}
              disabled={!hasFiles || flaskOnline === false}
              className={cn((!hasFiles || flaskOnline === false) && 'opacity-50 cursor-not-allowed')}
            >
              <Play size={16} className="mr-2" /> Start AI Analysis
            </Button>
          </div>
        )}
      </div>

      {/* Upload Zones */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {laneLabels.map((lane) => (
          <Card key={lane} className="relative overflow-hidden group p-0">
            <input
              type="file"
              ref={fileInputRefs[lane as keyof typeof fileInputRefs]}
              className="hidden"
              accept=".mp4,.avi,.mov"
              onChange={(e) => handleFileChange(lane, e)}
            />
            <div
              onClick={() => !processing && fileInputRefs[lane as keyof typeof fileInputRefs].current?.click()}
              className={cn(
                'flex flex-col items-center justify-center py-12 border-2 border-dashed rounded-xl transition-all cursor-pointer m-6',
                files[lane] ? 'border-emerald-500/50 bg-emerald-500/5'
                : 'border-brand-border group-hover:border-emerald-500/50',
                processing && 'cursor-not-allowed opacity-60'
              )}
            >
              {files[lane] ? (
                <div className="flex flex-col items-center text-center px-4">
                  <div className="w-12 h-12 bg-emerald-500/20 rounded-full flex items-center justify-center mb-4 text-emerald-500">
                    <CheckCircle2 size={24} />
                  </div>
                  <p className="text-sm font-semibold text-white truncate max-w-[200px]">{files[lane]?.name}</p>
                  <p className="text-xs text-slate-500 mt-1">{(files[lane]!.size / (1024 * 1024)).toFixed(2)} MB</p>
                  {!processing && (
                    <button onClick={(e) => removeFile(lane, e)} className="mt-4 text-xs text-rose-500 hover:text-rose-400 flex items-center gap-1">
                      <X size={12} /> Remove Video
                    </button>
                  )}
                </div>
              ) : (
                <>
                  <Upload className="text-slate-500 mb-4 group-hover:text-emerald-500 transition-colors" size={32} />
                  <p className="text-sm font-medium text-slate-300">{lane} — Upload Traffic Video</p>
                  <p className="text-xs text-slate-500 mt-1">MP4, AVI or MOV (Max 300MB)</p>
                </>
              )}
            </div>
          </Card>
        ))}
      </div>

      {/* Progress Bar */}
      <AnimatePresence>
        {processing && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="glass-panel p-8"
          >
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-3">
                <div className="animate-spin text-emerald-500">
                  <TrafficLightIcon size={20} colorized />
                </div>
                <div>
                  <h3 className="font-semibold text-white">AI Processing in Progress...</h3>
                  <p className="text-xs text-slate-500 mt-0.5">{progressLabel}</p>
                </div>
              </div>
              <span className="text-sm font-mono text-emerald-500">{progress}%</span>
            </div>
            <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-emerald-500"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.3 }}
              />
            </div>
            <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
              {laneLabels.map((lane) => {
                const laneKey  = toLaneKey(lane);
                const hasFile  = !!files[lane];
                const uploaded = !!uploadedFiles[laneKey];
                const isActive = uploadingLane === lane;
                if (!hasFile) return null;
                return (
                  <div key={lane} className="text-center">
                    <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1">{lane}</p>
                    <p className={cn('text-xs font-medium', uploaded ? 'text-emerald-500' : isActive ? 'text-blue-400' : 'text-slate-600')}>
                      {uploaded ? '✓ Uploaded' : isActive ? 'Uploading...' : 'Pending'}
                    </p>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};