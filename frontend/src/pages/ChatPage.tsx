import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion } from 'motion/react';
import {
  Send, Bot, User, Loader2, Brain,
  RefreshCw, Zap, BarChart2, AlertTriangle,
  Activity, Wifi, WifiOff, Camera,
} from 'lucide-react';
import { cn } from '../utils';

const FLASK_URL   = 'http://127.0.0.1:5000';
const GEMINI_BASE = 'https://generativelanguage.googleapis.com';
const API_KEY     = import.meta.env.VITE_GEMINI_API_KEY as string;

const GEMINI_MODELS = [
  'v1beta/models/gemini-2.5-flash-preview-04-17',
  'v1beta/models/gemini-2.5-flash',
  'v1beta/models/gemini-2.0-flash',
];

const LANE_KEYS = ['LaneA', 'LaneB', 'LaneC', 'LaneD'];

interface Message {
  role:    'user' | 'assistant';
  content: string;
  frames?: string[];
}

// ── Capture a single JPEG snapshot per lane ───────────────────
const captureFrame = (laneKey: string): Promise<string | null> => {
  return new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width  = img.naturalWidth  || 320;
        canvas.height = img.naturalHeight || 240;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/jpeg', 0.7).split(',')[1]);
      } catch { resolve(null); }
    };
    img.onerror = () => resolve(null);
    img.src = `${FLASK_URL}/api/snapshot/${laneKey}?t=${Date.now()}`;
    setTimeout(() => resolve(null), 4000);
  });
};

const captureAllFrames = async (): Promise<string[]> => {
  const frames = await Promise.all(LANE_KEYS.map(k => captureFrame(k)));
  return frames.filter(Boolean) as string[];
};

// ── Fetch traffic context from Flask ─────────────────────────
const fetchTrafficContext = async (): Promise<string> => {
  const [liveRes, compRes, perfRes, emRes] = await Promise.allSettled([
    fetch(`${FLASK_URL}/api/live-stats`).then(r => r.json()),
    fetch(`${FLASK_URL}/api/comparison`).then(r => r.json()),
    fetch(`${FLASK_URL}/api/performance`).then(r => r.json()),
    fetch(`${FLASK_URL}/api/emergency`).then(r => r.json()),
  ]);

  let ctx = '=== SmartTraffic System — Current Data ===\n\n';

  if (liveRes.status === 'fulfilled') {
    const lanes = liveRes.value?.data || [];
    if (lanes.length > 0 && lanes.some((l: any) => l.vehicle_count > 0)) {
      ctx += '--- LIVE LANE STATUS ---\n';
      lanes.forEach((l: any) => {
        ctx += `${l.lane}: vehicles=${l.vehicle_count}, congestion=${l.congestion}, ` +
               `AI green=${l.ai_green_time}s (traditional=60s), priority=${l.priority}, ` +
               `speed=${l.avg_speed?.toFixed(1)}km/h, density=${(l.density*100)?.toFixed(1)}%\n`;
      });
    } else {
      ctx += '--- LIVE LANE STATUS ---\nNo analysis currently running.\n';
    }
    ctx += '\n';
  }

  if (emRes.status === 'fulfilled') {
    const alerts = emRes.value?.data || emRes.value || [];
    const recent = Array.isArray(alerts)
      ? alerts.filter((e: any) => Date.now() - new Date(e.timestamp).getTime() < 30000)
      : [];
    if (recent.length > 0) {
      ctx += '--- EMERGENCY ALERTS (last 30s) ---\n';
      recent.forEach((e: any) => {
        ctx += `${e.type || 'Emergency'} in ${e.lane} at ${e.timestamp} — ${e.action}\n`;
      });
      ctx += '\n';
    }
  }

  if (compRes.status === 'fulfilled') {
    const rows = compRes.value?.data || [];
    if (rows.length > 0) {
      ctx += '--- AI vs TRADITIONAL COMPARISON ---\n';
      rows.forEach((r: any) => {
        ctx += `${r.lane}: AI green=${r.ai_green}s vs trad=${r.traditional_green}s, ` +
               `improvement=${r.improvement}%, AI efficiency=${r.ai_efficiency}% vs trad=${r.traditional_efficiency}%, ` +
               `AI wait=${r.ai_wait}s vs trad wait=${r.traditional_wait}s, congestion=${r.congestion}\n`;
      });
      ctx += '\n';
    }
  }

  if (perfRes.status === 'fulfilled') {
    const rows = perfRes.value?.data || [];
    if (rows.length > 0) {
      ctx += '--- OVERALL PERFORMANCE SUMMARY ---\n';
      rows.forEach((r: any) => {
        ctx += `${r.metric}: Traditional=${r.traditional}, AI=${r.ai_adaptive}, Difference=${r.difference}\n`;
      });
      ctx += '\n';
    }
  }

  return ctx;
};

// ── Build Gemini request ──────────────────────────────────────
const buildGeminiRequest = (
  history:  Message[],
  ctx:      string,
  frames:   string[],
  userText: string,
) => {
  const systemText = `You are TrafficAI Assistant — an intelligent assistant inside SmartTraffic, an AI-powered adaptive traffic signal control system (Final Year Project).

The system uses YOLOv8n for vehicle detection, DeepSORT for tracking, and a trained Random Forest model to predict lane priority. Green time is dynamically allocated per lane based on vehicle count, density, speed, and heavy vehicle ratio. Emergency vehicles trigger immediate signal override.

You have access to real-time data and live camera snapshots from the intersection.

CURRENT SYSTEM DATA:
${ctx}

When camera frames are provided:
- Count vehicles visible (cars, motorcycles, buses, trucks)
- Identify congestion level (Low / Medium / High)
- Describe lane activity and traffic flow
- Note any emergency vehicles
- Suggest what AI green time this lane would receive

Be concise (2-4 sentences) unless a detailed breakdown is requested. Base answers on the data and frames provided.`;

  const contents = [];

  for (const msg of history.slice(1)) {
    contents.push({
      role:  msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }],
    });
  }

  const currentParts: any[] = [];

  if (frames.length > 0) {
    currentParts.push({ text: `[${frames.length} live camera frame(s) attached]` });
    frames.forEach((frame, i) => {
      currentParts.push({ inlineData: { mimeType: 'image/jpeg', data: frame } });
      currentParts.push({ text: `Frame ${i + 1}: Lane ${['A','B','C','D'][i] ?? i+1}` });
    });
  }

  currentParts.push({ text: userText });
  contents.push({ role: 'user', parts: currentParts });

  return {
    system_instruction: { parts: [{ text: systemText }] },
    contents,
    generationConfig: { maxOutputTokens: 1000, temperature: 0.7 },
  };
};

const SUGGESTIONS = [
  { icon: '🚦', text: 'Which lane is most congested right now?' },
  { icon: '📷', text: 'Analyse the live camera feeds and describe the traffic' },
  { icon: '🧠', text: 'Explain how the RF model decides signal priority' },
  { icon: '📊', text: 'How much better is AI vs traditional timing?' },
  { icon: '🚨', text: 'Any emergency vehicles detected?' },
  { icon: '📈', text: 'Summarise the overall system performance' },
];

// ── ChatPage ──────────────────────────────────────────────────
export const ChatPage = ({
  hasData,
  messages,
  setMessages,
}: {
  hasData:     boolean;
  messages:    Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
}) => {
  const [input,      setInput]      = useState('');
  const [loading,    setLoading]    = useState(false);
  const [capturing,  setCapturing]  = useState(false);
  const [withFrames, setWithFrames] = useState(false);
  const [ctxLoaded,  setCtxLoaded]  = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const init = async () => {
      await fetchTrafficContext();
      setCtxLoaded(true);
      if (messages.length === 0) {
        setMessages([{
          role: 'assistant',
          content: hasData
            ? "Hello! I'm TrafficAI Assistant powered by Gemini. I can see your live traffic data and analyse camera feeds. Toggle 'Include live frames' to send camera snapshots with your question."
            : "Hello! I'm TrafficAI Assistant powered by Gemini. No live analysis running yet — but I can answer questions about your trained model results and comparison data. Start an analysis for live insights.",
        }]);
      }
      inputRef.current?.focus();
    };
    init();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const send = useCallback(async (text?: string) => {
    const userText = (text ?? input).trim();
    if (!userText || loading) return;

    if (!API_KEY) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'VITE_GEMINI_API_KEY is not set in your .env file. Add it and restart the dev server.',
      }]);
      return;
    }

    setInput('');
    setLoading(true);

    let frames: string[] = [];
    if (withFrames && hasData) {
      setCapturing(true);
      frames = await captureAllFrames();
      setCapturing(false);
    }

    const userMsg: Message = { role: 'user', content: userText, frames };
    setMessages(prev => [...prev, userMsg]);

    const freshCtx = await fetchTrafficContext();

    try {
      const body = buildGeminiRequest(messages, freshCtx, frames, userText);

      let reply = '';
      let lastError = '';
      for (const model of GEMINI_MODELS) {
        try {
          const url = `${GEMINI_BASE}/${model}:generateContent?key=${API_KEY}`;
          const res = await fetch(url, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(body),
          });
          const data = await res.json();
          if (!res.ok) {
            lastError = data?.error?.message ?? 'API error';
            if (lastError.includes('quota') || lastError.includes('RESOURCE_EXHAUSTED')) break;
            continue;
          }
          reply = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
          if (reply) break;
        } catch (e: any) {
          lastError = e.message;
        }
      }

      if (!reply) throw new Error(lastError || 'All models failed');
      setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
    } catch (err: any) {
      setMessages(prev => [...prev, {
        role:    'assistant',
        content: `Error: ${err.message ?? 'Unknown error'}. Check your Gemini API key and quota.`,
      }]);
    } finally {
      setLoading(false);
    }
  }, [input, messages, loading, withFrames, hasData]);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const clearChat = () => {
    setMessages([{
      role: 'assistant',
      content: hasData
        ? "Chat cleared. I have the latest traffic data ready. What would you like to know?"
        : "Chat cleared. Ask me anything about the SmartTraffic system.",
    }]);
  };

  const userMessages = messages.filter(m => m.role === 'user').length;

  return (
    <div className="flex flex-col h-[calc(100vh-80px)] max-h-[calc(100vh-80px)]">

      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Brain size={20} className="text-emerald-400" />
            TrafficAI Assistant
            <span className="text-[10px] font-normal px-2 py-0.5 rounded-full bg-blue-500/20 border border-blue-500/30 text-blue-400">
              Gemini 2.5 Flash
            </span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            RAG-powered chat with live traffic data and camera feed analysis
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border',
            hasData
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              : 'bg-slate-800 border-slate-700 text-slate-500'
          )}>
            {hasData
              ? <><Wifi size={11} className="animate-pulse" />Live data active</>
              : <><WifiOff size={11} />No analysis running</>
            }
          </div>
          <button
            onClick={clearChat}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white border border-brand-border hover:border-slate-600 transition-colors"
          >
            <RefreshCw size={12} /> Clear
          </button>
        </div>
      </div>

      {/* Data source chips */}
      {ctxLoaded && (
        <div className="flex items-center gap-2 mb-4 flex-shrink-0 flex-wrap">
          <span className="text-[10px] text-slate-600 uppercase tracking-wider">Data:</span>
          {[
            { icon: <Activity size={10} />,      label: 'Live Stats',  active: hasData },
            { icon: <BarChart2 size={10} />,     label: 'Comparison',  active: true   },
            { icon: <Zap size={10} />,           label: 'Performance', active: true   },
            { icon: <AlertTriangle size={10} />, label: 'Emergency',   active: hasData },
            { icon: <Camera size={10} />,        label: 'Live Frames', active: hasData && withFrames },
          ].map(chip => (
            <span key={chip.label} className={cn(
              'flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] border',
              chip.active
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : 'bg-slate-800/60 border-slate-700 text-slate-600'
            )}>
              {chip.icon} {chip.label}
            </span>
          ))}
        </div>
      )}

      <div className="flex flex-1 gap-4 min-h-0">

        {/* Messages */}
        <div className="flex-1 flex flex-col min-w-0 rounded-xl border border-brand-border bg-slate-900/40 overflow-hidden">
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((m, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn('flex gap-3', m.role === 'user' ? 'flex-row-reverse' : 'flex-row')}
              >
                <div className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 border',
                  m.role === 'assistant'
                    ? 'bg-emerald-500/15 border-emerald-500/30'
                    : 'bg-blue-500/15 border-blue-500/30'
                )}>
                  {m.role === 'assistant'
                    ? <Bot  size={15} className="text-emerald-400" />
                    : <User size={15} className="text-blue-400" />
                  }
                </div>
                <div className={cn(
                  'max-w-[75%] px-4 py-3 rounded-2xl text-sm leading-relaxed',
                  m.role === 'assistant'
                    ? 'bg-slate-800 text-slate-200 rounded-tl-sm border border-slate-700/50'
                    : 'bg-blue-600/25 text-slate-100 rounded-tr-sm border border-blue-500/20'
                )}>
                  {m.frames && m.frames.length > 0 && (
                    <div className="flex items-center gap-1 mb-2 text-[10px] text-emerald-400">
                      <Camera size={10} />
                      {m.frames.length} camera frame{m.frames.length > 1 ? 's' : ''} attached
                    </div>
                  )}
                  {m.content.split('\n').map((line, li, arr) => (
                    <span key={li}>{line}{li < arr.length - 1 && <br />}</span>
                  ))}
                </div>
              </motion.div>
            ))}

            {(loading || capturing) && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center flex-shrink-0">
                  <Bot size={15} className="text-emerald-400" />
                </div>
                <div className="bg-slate-800 border border-slate-700/50 px-4 py-3 rounded-2xl rounded-tl-sm flex items-center gap-2">
                  <Loader2 size={13} className="animate-spin text-emerald-400" />
                  <span className="text-xs text-slate-400">
                    {capturing ? 'Capturing camera frames...' : 'Analysing with Gemini...'}
                  </span>
                </div>
              </motion.div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input bar */}
          <div className="border-t border-brand-border bg-slate-800/50">
            {/* Live frames toggle */}
            {hasData && (
              <div className="flex items-center gap-2 px-4 pt-2.5">
                <button
                  onClick={() => setWithFrames(v => !v)}
                  className={cn(
                    'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all',
                    withFrames
                      ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                      : 'bg-slate-700/50 border-slate-600 text-slate-500 hover:text-slate-300'
                  )}
                >
                  <Camera size={11} />
                  {withFrames ? 'Live frames ON — Gemini sees cameras' : 'Include live camera frames'}
                </button>
                {withFrames && (
                  <span className="text-[10px] text-slate-600">
                    Captures 1 frame per lane and sends to Gemini
                  </span>
                )}
              </div>
            )}
            <div className="flex items-center gap-3 px-4 py-3">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder={
                  withFrames
                    ? 'Ask about traffic + Gemini will analyse camera frames...'
                    : 'Ask about traffic conditions, signal timing, AI performance...'
                }
                disabled={loading || capturing}
                className="flex-1 bg-slate-700/50 border border-slate-600 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50 disabled:opacity-50 transition-colors"
              />
              <button
                onClick={() => send()}
                disabled={!input.trim() || loading || capturing}
                className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-emerald-400 transition-colors"
              >
                <Send size={15} className="text-white" />
              </button>
            </div>
          </div>
        </div>

        {/* Suggestions sidebar */}
        {userMessages === 0 && (
          <motion.div
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            className="w-56 flex-shrink-0 space-y-2"
          >
            <p className="text-[10px] text-slate-500 uppercase tracking-wider px-1 mb-3">
              Try asking...
            </p>
            {SUGGESTIONS.map((s, i) => (
              <motion.button
                key={i}
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                onClick={() => send(s.text)}
                className="w-full text-left px-3 py-2.5 rounded-xl border border-brand-border bg-slate-800/40 hover:border-emerald-500/40 hover:bg-emerald-500/5 transition-all duration-200 group"
              >
                <span className="text-base mr-2">{s.icon}</span>
                <span className="text-xs text-slate-400 group-hover:text-slate-200 transition-colors leading-snug">
                  {s.text}
                </span>
              </motion.button>
            ))}
          </motion.div>
        )}
      </div>
    </div>
  );
};