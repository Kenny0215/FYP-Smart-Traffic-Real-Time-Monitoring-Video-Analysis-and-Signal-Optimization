/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useCallback } from 'react';
import { LandingPage }     from './pages/LandingPage';
import { AuthPage }        from './pages/AuthPage';
import { DashboardHome }   from './pages/DashboardHome';
import { UploadPage }      from './pages/UploadPage';
import { AnalyticsPage }   from './pages/AnalyticsPage';
import { SimulationPage }  from './pages/SimulationPage';
import { FeedbackPage }    from './pages/FeedbackPage';
import { ChatPage }        from './pages/ChatPage';
import { DashboardLayout } from './components/DashboardLayout';
import { Page }            from './types';

const FLASK_URL = 'http://127.0.0.1:5000';

// ── Types ──────────────────────────────────────────────────
export interface LaneStat {
  lane:          string;
  lane_key:      string;
  vehicle_count: number;
  congestion:    string;
  green_time:    number;
  ai_green_time: number;
  priority:      string;
  avg_speed:     number;
  density:       number;
  fps:           number;
  frame:         number;
}

export interface UploadState {
  files:         Record<string, File | null>;
  uploadedFiles: Record<string, string>;
  activeLanes:   string[];
  laneStats:     Record<string, LaneStat>;
  isStreaming:   boolean;
  processing:    boolean;
  progress:      number;
  progressLabel: string;
  error:         string | null;
  uploadingLane: string | null;
}

const DEFAULT_UPLOAD_STATE: UploadState = {
  files:         { 'Lane A': null, 'Lane B': null, 'Lane C': null, 'Lane D': null },
  uploadedFiles: {},
  activeLanes:   [],
  laneStats:     {},
  isStreaming:   false,
  processing:    false,
  progress:      0,
  progressLabel: '',
  error:         null,
  uploadingLane: null,
};

// ── App ────────────────────────────────────────────────────
export default function App() {
  const [page,     setPage]     = useState<Page>('landing');
  const [userName, setUserName] = useState('');

  // ── hasData: single source of truth for dashboard ──────
  const [hasData, setHasData] = useState(false);

  // ── Chat messages lifted here so they survive page nav ─
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'assistant'; content: string; frames?: string[] }[]>([]);

  // ── Upload state lifted here so it survives page nav ───
  const [uploadState, setUploadState] = useState<UploadState>(DEFAULT_UPLOAD_STATE);
  const statsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Start polling Flask /api/live-stats ─────────────────
  const startStatsPoll = useCallback((lanes: string[]) => {
    if (statsIntervalRef.current) clearInterval(statsIntervalRef.current);
    statsIntervalRef.current = setInterval(async () => {
      try {
        const res  = await fetch(`${FLASK_URL}/api/live-stats`);
        const json = await res.json();
        // Flask returns { data: [ { lane_key, lane, vehicle_count, ... } ] }
        if (json.data && Array.isArray(json.data)) {
          const filtered: Record<string, LaneStat> = {};
          json.data.forEach((stat: LaneStat) => {
            if (stat.lane_key && lanes.includes(stat.lane_key)) {
              filtered[stat.lane_key] = stat;
            }
          });
          setUploadState(prev => ({ ...prev, laneStats: filtered }));
        }
      } catch {
        // Flask temporarily unreachable — keep showing last known stats
      }
    }, 2000);
  }, []);

  // ── Clear All Videos ────────────────────────────────────
  // Called by UploadPage "Clear All Videos" button
  // Resets EVERYTHING: Flask streams, upload state, dashboard
  const handleClearAll = useCallback(async () => {
    // Stop Flask YOLO threads + clear live emergency log
    try {
      await fetch(`${FLASK_URL}/api/stop-analysis`, { method: 'POST' });
    } catch { /* ignore if Flask is offline */ }

    // Stop stats polling
    if (statsIntervalRef.current) {
      clearInterval(statsIntervalRef.current);
      statsIntervalRef.current = null;
    }

    // Reset upload page to empty zones
    setUploadState(DEFAULT_UPLOAD_STATE);

    // Reset dashboard to empty — this is the key line
    setHasData(false);
  }, []);

  // ── Analysis Complete ───────────────────────────────────
  // Called by UploadPage after start-analysis succeeds
  // Marks data as live — user stays on upload page to watch streams
  // Dashboard is now unlocked and shows live data whenever user navigates there
  const handleAnalysisComplete = useCallback(() => {
    setHasData(true);
    // No auto-navigate — user can freely go to Dashboard via sidebar
  }, []);

  // ── Router ──────────────────────────────────────────────
  const renderPage = () => {
    switch (page) {
      case 'landing':
        return <LandingPage onStart={() => setPage('login')} />;

      case 'login':
        return (
          <AuthPage
            type="login"
            onAuth={(name) => {
              setUserName(name);
              setHasData(false);
              setUploadState(DEFAULT_UPLOAD_STATE);
              setChatMessages([]); // clear chat on fresh login
              setPage('dashboard');
            }}
            onBack={() => setPage('landing')}
            onToggle={() => setPage('register')}
          />
        );

      case 'register':
        return (
          <AuthPage
            type="register"
            onAuth={(name) => {
              setUserName(name);
              setHasData(false);
              setUploadState(DEFAULT_UPLOAD_STATE);
              setChatMessages([]); // clear chat on fresh register
              setPage('dashboard');
            }}
            onBack={() => setPage('landing')}
            onToggle={() => setPage('login')}
          />
        );

      case 'dashboard':
      case 'upload':
      case 'analytics':
      case 'simulation':
      case 'feedback':
      case 'chat':
        return (
          <>
            <DashboardLayout
              activePage={page}
              setPage={setPage}
              user={{ user_metadata: { full_name: userName }, email: userName }}
            >
              {page === 'dashboard' && (
                <DashboardHome
                  hasData={hasData}
                  onGoUpload={() => setPage('upload')}
                />
              )}
              {page === 'upload' && (
                <UploadPage
                  uploadState={uploadState}
                  setUploadState={setUploadState}
                  startStatsPoll={startStatsPoll}
                  onClearAll={handleClearAll}
                  onAnalysisComplete={handleAnalysisComplete}
                />
              )}
              {page === 'analytics'  && <AnalyticsPage />}
              {page === 'simulation' && <SimulationPage hasData={hasData} />}
              {page === 'feedback'   && <FeedbackPage />}
              {page === 'chat'       && <ChatPage hasData={hasData} messages={chatMessages} setMessages={setChatMessages} />}
            </DashboardLayout>
          </>
        );

      default:
        return <LandingPage onStart={() => setPage('login')} />;
    }
  };

  return (
    <div className="min-h-screen">
      {renderPage()}
    </div>
  );
}