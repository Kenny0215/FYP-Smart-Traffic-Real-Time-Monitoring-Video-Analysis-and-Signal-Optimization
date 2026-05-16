/**
 * StreamImg.tsx
 * Uses a Web Worker to poll snapshots — completely immune to browser
 * tab throttling. The worker runs in a separate thread and is never
 * suspended, so streams stay live even after long tab absences.
 */
import React, { useEffect, useRef, useState } from 'react';

const FLASK_URL = 'http://127.0.0.1:5000';

interface StreamImgProps {
  laneKey:    string;
  className?: string;
  isActive:   boolean;
}

export const StreamImg = ({ laneKey, className = '', isActive }: StreamImgProps) => {
  const [objectUrl, setObjectUrl] = useState('');
  const [status,    setStatus]    = useState<'connecting' | 'live' | 'stopped'>('connecting');

  const workerRef  = useRef<Worker | null>(null);
  const prevUrlRef = useRef('');
  const mountedRef = useRef(true);
  const fallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const revokePrev = () => {
    if (prevUrlRef.current) {
      URL.revokeObjectURL(prevUrlRef.current);
      prevUrlRef.current = '';
    }
  };

  const stopWorker = () => {
    if (workerRef.current) {
      workerRef.current.postMessage({ type: 'stop' });
      workerRef.current.terminate();
      workerRef.current = null;
    }
  };

  const stopFallback = () => {
    if (fallbackRef.current) {
      clearTimeout(fallbackRef.current);
      fallbackRef.current = null;
    }
  };

  const startFallback = () => {
    stopFallback();
    const fetchFrame = async () => {
      if (!mountedRef.current) return;
      try {
        const res = await fetch(
          `${FLASK_URL}/api/snapshot/${laneKey}?t=${Date.now()}`,
          { cache: 'no-store' }
        );
        if (res.ok && mountedRef.current) {
          const blob = await res.blob();
          const url  = URL.createObjectURL(blob);
          setObjectUrl(prev => { if (prev) URL.revokeObjectURL(prev); return url; });
          setStatus('live');
        }
      } catch { /* retry */ }
      if (mountedRef.current) fallbackRef.current = setTimeout(fetchFrame, 150);
    };
    fetchFrame();
  };

  const startWorker = () => {
    stopWorker();
    stopFallback();
    if (!mountedRef.current) return;

    try {
      const worker = new Worker('/stream.worker.js');
      workerRef.current = worker;

      worker.onmessage = (e) => {
        if (!mountedRef.current) return;
        if (e.data.type === 'frame') {
          const blob = new Blob([e.data.buffer], { type: 'image/jpeg' });
          const url  = URL.createObjectURL(blob);
          setObjectUrl(prev => {
            revokePrev();
            prevUrlRef.current = url;
            return url;
          });
          setStatus('live');
        }
      };

      worker.onerror = () => {
        stopWorker();
        startFallback(); // graceful fallback
      };

      worker.postMessage({ type: 'start', lane: laneKey, url: FLASK_URL, ms: 150 });
    } catch {
      // Web Workers not supported — use fallback
      startFallback();
    }
  };

  // Mount / unmount
  useEffect(() => {
    mountedRef.current = true;
    setStatus('connecting');
    if (isActive) startWorker();

    return () => {
      mountedRef.current = false;
      stopWorker();
      stopFallback();
      revokePrev();
    };
  }, [laneKey]);

  // isActive prop changes
  useEffect(() => {
    if (isActive) {
      setStatus('connecting');
      startWorker();
    } else {
      setStatus('stopped');
      stopWorker();
      stopFallback();
    }
  }, [isActive]);

  // Tab visibility — restart worker if it died
  useEffect(() => {
    const handleVisible = () => {
      if (document.visibilityState === 'visible' && isActive && mountedRef.current) {
        if (!workerRef.current && !fallbackRef.current) {
          setStatus('connecting');
          startWorker();
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisible);
    return () => document.removeEventListener('visibilitychange', handleVisible);
  }, [isActive]);

  if (status === 'stopped') {
    return (
      <div className={`flex items-center justify-center bg-black ${className}`}>
        <p className="text-slate-600 text-xs">Stream stopped</p>
      </div>
    );
  }

  if (!objectUrl) {
    return (
      <div className={`flex flex-col items-center justify-center bg-black ${className}`}>
        <div className="w-8 h-8 border-2 border-slate-700 border-t-emerald-500 rounded-full animate-spin mb-2" />
        <p className="text-slate-600 text-xs">Connecting...</p>
      </div>
    );
  }

  return (
    <img
      src={objectUrl}
      alt={`${laneKey} stream`}
      className={className}
      draggable={false}
    />
  );
};