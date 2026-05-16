/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useCallback } from 'react';
import { LandingPage }      from './pages/LandingPage';
import { AuthPage }         from './pages/AuthPage';
import { DashboardHome }    from './pages/DashboardHome';
import { UploadPage }       from './pages/UploadPage';
import { AnalyticsPage }    from './pages/AnalyticsPage';
import { SimulationPage }   from './pages/SimulationPage';
import { FeedbackPage }     from './pages/FeedbackPage';
import { ChatPage }         from './pages/ChatPage';
import { AdminDashboard }   from './pages/admin/AdminDashboard';
import { DashboardLayout }  from './components/DashboardLayout';
import { Page }             from './types';

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
  const [userRole, setUserRole] = useState<'user' | 'admin'>('user');
  const [hasData,  setHasData]  = useState(false);

  const [chatMessages, setChatMessages] = useState<
    { role: 'user' | 'assistant'; content: string; frames?: string[] }[]
  >([]);

  const [uploadState, setUploadState] = useState<UploadState>(DEFAULT_UPLOAD_STATE);
  const statsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Stats polling ──────────────────────────────────────
  const startStatsPoll = useCallback((lanes: string[]) => {
    if (statsIntervalRef.current) clearInterval(statsIntervalRef.current);
    statsIntervalRef.current = setInterval(async () => {
      try {
        const res  = await fetch(`${FLASK_URL}/api/live-stats`);
        const json = await res.json();
        if (json.data && Array.isArray(json.data)) {
          const filtered: Record<string, LaneStat> = {};
          json.data.forEach((stat: LaneStat) => {
            if (stat.lane_key && lanes.includes(stat.lane_key)) {
              filtered[stat.lane_key] = stat;
            }
          });
          setUploadState(prev => ({ ...prev, laneStats: filtered }));
        }
      } catch { /* ignore */ }
    }, 2000);
  }, []);

  // ── Clear all ──────────────────────────────────────────
  const handleClearAll = useCallback(async () => {
    try {
      await fetch(`${FLASK_URL}/api/stop-analysis`, { method: 'POST' });
    } catch { /* ignore */ }
    if (statsIntervalRef.current) {
      clearInterval(statsIntervalRef.current);
      statsIntervalRef.current = null;
    }
    setUploadState(DEFAULT_UPLOAD_STATE);
    setHasData(false);
  }, []);

  // ── Analysis complete ──────────────────────────────────
  const handleAnalysisComplete = useCallback(() => {
    setHasData(true);
  }, []);

  // ── Auth — routes by role ──────────────────────────────
  const handleAuth = useCallback((name: string, role: 'user' | 'admin') => {
    setUserName(name);
    setUserRole(role);
    setHasData(false);
    setUploadState(DEFAULT_UPLOAD_STATE);
    setChatMessages([]);
    setPage(role === 'admin' ? 'admin' : 'dashboard');
  }, []);

  // ── Logout ─────────────────────────────────────────────
  const handleLogout = useCallback(() => {
    setPage('landing');
    setUserName('');
    setUserRole('user');
    setHasData(false);
    setUploadState(DEFAULT_UPLOAD_STATE);
    setChatMessages([]);
    if (statsIntervalRef.current) {
      clearInterval(statsIntervalRef.current);
      statsIntervalRef.current = null;
    }
  }, []);

  // ── Router ─────────────────────────────────────────────
  const renderPage = () => {
    switch (page) {
      case 'landing':
        return <LandingPage onStart={() => setPage('login')} />;

      case 'login':
        return (
          <AuthPage
            onAuth={handleAuth}
            onBack={() => setPage('landing')}
          />
        );

      // ── Admin ────────────────────────────────────────
      case 'admin':
        return (
          <AdminDashboard
            userName={userName}
            onLogout={handleLogout}
          />
        );

      // ── User ─────────────────────────────────────────
      case 'dashboard':
      case 'upload':
      case 'analytics':
      case 'simulation':
      case 'feedback':
      case 'chat':
        return (
          <DashboardLayout
            activePage={page}
            setPage={setPage}
            user={{ user_metadata: { full_name: userName }, email: userName }}
            onLogout={handleLogout}
          >
            {page === 'dashboard'  && <DashboardHome hasData={hasData} onGoUpload={() => setPage('upload')} />}
            {page === 'upload'     && (
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
        );

      default:
        return <LandingPage onStart={() => setPage('login')} />;
    }
  };

  return <div className="min-h-screen">{renderPage()}</div>;
}