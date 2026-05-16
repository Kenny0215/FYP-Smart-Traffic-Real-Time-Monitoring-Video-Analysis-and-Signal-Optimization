import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Chart as ChartJS, CategoryScale, LinearScale,
  BarElement, Title, Tooltip, Legend,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import {
  ChevronUp, ChevronDown, ListFilter,
  BarChart2, Loader2, RefreshCw, Download,
  Zap,
} from 'lucide-react';
import { Card }   from '../components/Card';
import { Button } from '../components/Button';
import { Badge }  from '../components/Badge';
import { cn }     from '../utils';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const FLASK_URL = 'http://127.0.0.1:5000';

// ── Types ────────────────────────────────────────────────────
interface ComparisonRow {
  lane:                   string;
  avg_vehicles:           number;
  congestion:             string;
  traditional_green:      number;
  ai_green:               number;
  ideal_green:            number;
  traditional_efficiency: number;
  ai_efficiency:          number;
  improvement:            number;
  traditional_wait:       number;
  ai_wait:                number;
  high_frames:            number;
  medium_frames:          number;
  low_frames:             number;
}

interface PerformanceRow {
  metric:      string;
  traditional: number | string;
  ai_adaptive: number | string;
  difference:  number | string;
}

// ── Chart colours ────────────────────────────────────────────
const C = {
  red:   '#ef4444',
  green: '#00d4aa',
  blue:  '#60a5fa',
  amber: '#f59e0b',
  grid:  '#1e2d3d',
  text:  '#e2e8f0',
};

const baseOpts = {
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: 'index' as const, intersect: false },
  plugins: {
    legend: {
      position: 'top' as const,
      labels: { color: C.text, font: { size: 12, weight: 'bold' as const }, padding: 20, usePointStyle: true, pointStyle: 'circle' as const },
    },
    tooltip: {
      backgroundColor: 'rgba(15,23,42,0.95)', titleColor: '#fff',
      titleFont: { size: 13, weight: 'bold' as const }, bodyColor: '#cbd5e1',
      bodyFont: { size: 12 }, borderColor: 'rgba(255,255,255,0.1)',
      borderWidth: 1, padding: 12, cornerRadius: 8, usePointStyle: true,
    },
  },
  scales: {
    x: { grid: { color: C.grid, display: false }, ticks: { color: C.text, font: { size: 11 } } },
    y: { grid: { color: C.grid },                 ticks: { color: C.text, font: { size: 11 } } },
  },
};

const stackedOpts = {
  ...baseOpts,
  scales: {
    x: { ...baseOpts.scales.x, stacked: true },
    y: { ...baseOpts.scales.y, stacked: true },
  },
};

// ── Helpers ──────────────────────────────────────────────────
const toNum  = (v: any) => parseFloat(String(v).replace('%', '')) || 0;
const fmtNum = (v: any, suffix = '') => `${toNum(v).toFixed(1)}${suffix}`;
const avg    = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

// ── Performance metric row ────────────────────────────────────
const PerfRow: React.FC<{ row: PerformanceRow }> = ({ row }) => {
  const diff         = toNum(row.difference);
  const isEfficiency = row.metric.toLowerCase().includes('efficiency');
  const isGood       = isEfficiency ? diff > 0 : diff <= 0;
  return (
    <div className="grid grid-cols-4 items-center px-4 py-3 border-b border-brand-border/40 hover:bg-slate-800/30 transition-colors text-sm">
      <span className="text-slate-300 font-medium">{row.metric}</span>
      <span className="text-right text-slate-400">{row.traditional}</span>
      <span className="text-right text-emerald-400 font-semibold">{row.ai_adaptive}</span>
      <span className={cn('text-right font-bold', isGood ? 'text-emerald-500' : 'text-rose-500')}>
        {diff > 0 ? '+' : ''}{row.difference}
      </span>
    </div>
  );
};

// ── Loading / Empty ───────────────────────────────────────────
const LoadingState = () => (
  <div className="flex flex-col items-center justify-center py-24 gap-4 text-slate-500">
    <Loader2 size={36} className="animate-spin text-emerald-500" />
    <p className="text-sm font-medium">Loading analytics data...</p>
  </div>
);

const EmptyState = ({ onRetry }: { onRetry: () => void }) => (
  <div className="flex flex-col items-center justify-center py-24 gap-4 text-slate-500">
    <BarChart2 size={48} className="text-slate-700" />
    <p className="text-base font-semibold text-slate-400">No Comparison Data Available</p>
    <p className="text-sm text-slate-600 text-center max-w-sm">
      Ensure <code className="mx-1 px-1 bg-slate-800 rounded text-xs text-slate-300">comparison_table.csv</code>
      and <code className="mx-1 px-1 bg-slate-800 rounded text-xs text-slate-300">performance_metrics.csv</code>
      exist in your model output folder, then retry.
    </p>
    <Button variant="outline" onClick={onRetry} className="flex items-center gap-2 mt-2">
      <RefreshCw size={14} /> Retry
    </Button>
  </div>
);

// ── PDF Export ────────────────────────────────────────────────
const exportReport = (rows: ComparisonRow[], perfRows: PerformanceRow[], chartImages: (string | null)[] = []) => {
  const date = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
  const time = new Date().toLocaleTimeString();
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
<title>SmartTraffic AI — Analytics Report</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Arial,sans-serif;color:#1a1a2e;padding:40px;font-size:13px}
.header{border-bottom:3px solid #00d4aa;padding-bottom:20px;margin-bottom:28px}
.header h1{font-size:24px;color:#00d4aa;font-weight:700}
.header p{color:#666;margin-top:4px;font-size:12px}
.section-title{font-size:14px;font-weight:700;color:#1a1a2e;border-left:4px solid #00d4aa;padding-left:10px;margin:24px 0 12px}
table{width:100%;border-collapse:collapse;margin-bottom:20px;font-size:12px}
th{background:#00d4aa;color:white;padding:8px 10px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.5px}
th.r{text-align:right}td{padding:8px 10px;border-bottom:1px solid #e5e7eb}td.r{text-align:right}
tr:nth-child(even){background:#f9fafb}.avg-row{background:#f0fdf9!important;font-weight:700}
.good{color:#059669;font-weight:700}.bad{color:#dc2626;font-weight:700}
.badge{display:inline-block;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:700}
.badge-high{background:#fee2e2;color:#dc2626}.badge-medium{background:#fef3c7;color:#d97706}.badge-low{background:#d1fae5;color:#059669}
.footer{margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:11px;color:#999;display:flex;justify-content:space-between}
</style></head><body>
<div class="header"><h1>🚦 SmartTraffic AI — Analytics Report</h1>
<p>Generated: ${date} at ${time} &nbsp;|&nbsp; System: AI-Powered Adaptive Traffic Signal Control &nbsp;|&nbsp; Lanes: 4</p></div>
${chartImages.some(Boolean) ? `<div class="section-title">Performance Charts</div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px;">
${chartImages.map((img,i)=>{const titles=['Green Time (s)','Signal Efficiency (%)','Wait Time (s)','Congestion Distribution'];return img?`<div style="border:1px solid #e5e7eb;border-radius:8px;padding:12px;"><div style="font-size:11px;font-weight:700;color:#374151;margin-bottom:8px;">${titles[i]}</div><img src="${img}" style="width:100%;height:auto;border-radius:4px;"/></div>`:''}).join('')}</div>`:'' }
${perfRows.length>0?`<div class="section-title">AI vs Traditional — Overall Performance</div><table><thead><tr><th>Metric</th><th class="r">Traditional</th><th class="r">AI Adaptive</th><th class="r">Difference</th></tr></thead><tbody>${perfRows.map(r=>{const diff=toNum(r.difference);const isEff=String(r.metric).toLowerCase().includes('efficiency');const good=isEff?diff>0:diff<=0;return`<tr><td>${r.metric}</td><td class="r">${r.traditional}</td><td class="r" style="color:#059669;font-weight:700">${r.ai_adaptive}</td><td class="r ${good?'good':'bad'}">${diff>0?'+':''}${r.difference}</td></tr>`}).join('')}</tbody></table>`:''}
<div class="section-title">Lane-by-Lane Comparison</div>
<table><thead><tr><th>Lane</th><th class="r">Vehicles</th><th>Congestion</th><th class="r">Trad Green</th><th class="r">AI Green</th><th class="r">Ideal</th><th class="r">Trad Eff</th><th class="r">AI Eff</th><th class="r">Improvement</th><th class="r">Trad Wait</th><th class="r">AI Wait</th></tr></thead>
<tbody>${rows.map(r=>{const imp=toNum(r.improvement);const badge=r.congestion==='High'?'badge-high':r.congestion==='Medium'?'badge-medium':'badge-low';return`<tr><td><strong>${r.lane}</strong></td><td class="r">${r.avg_vehicles}</td><td><span class="badge ${badge}">${r.congestion}</span></td><td class="r">${r.traditional_green}s</td><td class="r" style="color:#059669;font-weight:700">${r.ai_green}s</td><td class="r" style="color:#3b82f6">${r.ideal_green}s</td><td class="r">${fmtNum(r.traditional_efficiency,'%')}</td><td class="r" style="color:#059669;font-weight:700">${fmtNum(r.ai_efficiency,'%')}</td><td class="r ${imp>=0?'good':'bad'}">${imp>=0?'+':''}${fmtNum(r.improvement,'%')}</td><td class="r">${r.traditional_wait}s</td><td class="r" style="color:#059669;font-weight:700">${r.ai_wait}s</td></tr>`}).join('')}
<tr class="avg-row"><td>Averages</td><td class="r">${avg(rows.map(r=>r.avg_vehicles)).toFixed(1)}</td><td>—</td><td class="r">${avg(rows.map(r=>r.traditional_green)).toFixed(1)}s</td><td class="r" style="color:#059669">${avg(rows.map(r=>r.ai_green)).toFixed(1)}s</td><td class="r" style="color:#3b82f6">${avg(rows.map(r=>r.ideal_green)).toFixed(1)}s</td><td class="r">${fmtNum(avg(rows.map(r=>toNum(r.traditional_efficiency))),'%')}</td><td class="r" style="color:#059669">${fmtNum(avg(rows.map(r=>toNum(r.ai_efficiency))),'%')}</td><td class="r good">+${fmtNum(avg(rows.map(r=>toNum(r.improvement))),'%')}</td><td class="r">${avg(rows.map(r=>r.traditional_wait)).toFixed(1)}s</td><td class="r" style="color:#059669">${avg(rows.map(r=>r.ai_wait)).toFixed(1)}s</td></tr>
</tbody></table>
<div class="footer"><span>SmartTraffic AI — Final Year Project</span><span>AI-Powered Adaptive Traffic Signal Control System</span></div>
</body></html>`;
  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.onload = () => { win.focus(); win.print(); };
};

// ── Fuzzy Membership Function Chart ──────────────────────────
const FUZZY_VARS = [
  {
    name: 'Vehicle Count', unit: '', min: 0, max: 50, step: 1, defaultVal: 12,
    sets: [
      { label: 'Low',    color: '#00d4aa', points: [[0,1],[0,1],[15,1],[25,0],[50,0]] },
      { label: 'Medium', color: '#f59e0b', points: [[0,0],[10,0],[20,1],[30,1],[40,0],[50,0]] },
      { label: 'High',   color: '#ef4444', points: [[0,0],[25,0],[35,1],[50,1]] },
    ],
  },
  {
    name: 'Avg Speed', unit: ' km/h', min: 0, max: 120, step: 1, defaultVal: 35,
    sets: [
      { label: 'Slow',   color: '#00d4aa', points: [[0,1],[0,1],[20,1],[40,0],[120,0]] },
      { label: 'Medium', color: '#f59e0b', points: [[0,0],[20,0],[50,1],[80,0],[120,0]] },
      { label: 'Fast',   color: '#ef4444', points: [[0,0],[60,0],[80,1],[120,1]] },
    ],
  },
  {
    name: 'Green Time', unit: ' s', min: 10, max: 60, step: 1, defaultVal: 30,
    sets: [
      { label: 'Short',  color: '#00d4aa', points: [[10,1],[10,1],[20,1],[30,0],[60,0]] },
      { label: 'Medium', color: '#f59e0b', points: [[10,0],[20,0],[35,1],[45,0],[60,0]] },
      { label: 'Long',   color: '#ef4444', points: [[10,0],[35,0],[50,1],[60,1]] },
    ],
  },
  {
    name: 'Heavy Ratio', unit: '', min: 0, max: 1, step: 0.01, defaultVal: 0.2,
    sets: [
      { label: 'Low',    color: '#00d4aa', points: [[0,1],[0,1],[0.2,1],[0.4,0],[1,0]] },
      { label: 'Medium', color: '#f59e0b', points: [[0,0],[0.2,0],[0.5,1],[0.7,0],[1,0]] },
      { label: 'High',   color: '#ef4444', points: [[0,0],[0.5,0],[0.7,1],[1,1]] },
    ],
  },
];

function lerp(pts: number[][], x: number): number {
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
    if (x >= x0 && x <= x1) return y0 + (y1 - y0) * ((x - x0) / (x1 - x0));
  }
  return 0;
}

const FuzzyChart: React.FC = () => {
  const [varIdx, setVarIdx] = useState(0);
  const [sliderVal, setSliderVal] = useState(FUZZY_VARS[0].defaultVal);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const v = FUZZY_VARS[varIdx];

  const draw = useCallback((xVal: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const W = canvas.offsetWidth || 600;
    const dpr = window.devicePixelRatio || 1;
    canvas.width  = W * dpr;
    canvas.height = 220 * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    const H = 220;
    const pad = { l: 44, r: 20, t: 24, b: 40 };
    const w = W - pad.l - pad.r;
    const h = H - pad.t - pad.b;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#0d1424';
    ctx.fillRect(0, 0, W, H);

    const toX = (val: number) => pad.l + (val - v.min) / (v.max - v.min) * w;
    const toY = (mu: number)  => pad.t + (1 - mu) * h;

    // Grid
    for (let i = 0; i <= 4; i++) {
      const y = pad.t + (h / 4) * i;
      ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l + w, y); ctx.stroke();
      ctx.fillStyle = '#6b7280'; ctx.font = '10px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText((1 - i / 4).toFixed(1), pad.l - 6, y + 4);
    }
    for (let i = 0; i <= 5; i++) {
      const xp = pad.l + (w / 5) * i;
      ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.moveTo(xp, pad.t); ctx.lineTo(xp, pad.t + h); ctx.stroke();
      const val = v.min + (v.max - v.min) * i / 5;
      ctx.fillStyle = '#6b7280'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(v.max <= 1 ? val.toFixed(1) : Math.round(val).toString(), xp, pad.t + h + 16);
    }

    // Axes
    ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pad.l, pad.t); ctx.lineTo(pad.l, pad.t + h); ctx.lineTo(pad.l + w, pad.t + h); ctx.stroke();

    // Membership sets
    v.sets.forEach(set => {
      ctx.beginPath();
      set.points.forEach(([px, py], i) => {
        const cx = toX(px), cy = toY(py);
        i === 0 ? ctx.moveTo(cx, cy) : ctx.lineTo(cx, cy);
      });
      ctx.strokeStyle = set.color; ctx.lineWidth = 2.5; ctx.stroke();
      ctx.fillStyle = set.color + '22'; ctx.fill();

      // Label at peak
      const peak = set.points.reduce((a, b) => b[1] > a[1] ? b : a);
      ctx.fillStyle = set.color; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(set.label, toX(peak[0]), toY(peak[1]) - 9);
    });

    // Vertical slider line
    const xp = toX(xVal);
    ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.moveTo(xp, pad.t); ctx.lineTo(xp, pad.t + h); ctx.stroke();
    ctx.setLineDash([]);

    // Intersection dots
    v.sets.forEach(set => {
      const mu = lerp(set.points, xVal);
      if (mu > 0.01) {
        ctx.fillStyle = set.color;
        ctx.beginPath(); ctx.arc(xp, toY(mu), 5, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#0d1424'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(xp, toY(mu), 5, 0, Math.PI * 2); ctx.stroke();
      }
    });

    // Axis label
    ctx.fillStyle = '#9ca3af'; ctx.font = '11px sans-serif'; ctx.textAlign = 'left';
    ctx.fillText('μ (membership)', 4, pad.t + 4);
    ctx.textAlign = 'center';
    ctx.fillText(`${v.name}${v.unit}`, pad.l + w / 2, H - 6);
  }, [v]);

  useEffect(() => {
    setSliderVal(v.defaultVal);
    draw(v.defaultVal);
  }, [varIdx, v.defaultVal, draw]);

  useEffect(() => {
    draw(sliderVal);
  }, [sliderVal, draw]);

  useEffect(() => {
    const ro = new ResizeObserver(() => draw(sliderVal));
    if (canvasRef.current) ro.observe(canvasRef.current);
    return () => ro.disconnect();
  }, [sliderVal, draw]);

  const memberships = v.sets.map(s => ({ label: s.label, color: s.color, mu: lerp(s.points, sliderVal) }));

  return (
    <div className="space-y-4">
      {/* Variable selector tabs */}
      <div className="flex flex-wrap gap-2">
        {FUZZY_VARS.map((fv, i) => (
          <button
            key={fv.name}
            onClick={() => setVarIdx(i)}
            className={cn(
              'px-3 py-1.5 rounded-full text-xs font-medium border transition-all',
              varIdx === i
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                : 'bg-slate-900 text-slate-400 border-slate-700 hover:border-slate-500'
            )}
          >
            {fv.name}
          </button>
        ))}
      </div>

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '220px', borderRadius: '8px', display: 'block' }}
      />

      {/* Slider */}
      <div className="flex items-center gap-3">
        <span className="text-slate-500 text-xs w-24 shrink-0">{v.name}</span>
        <input
          type="range"
          min={v.min} max={v.max} step={v.step}
          value={sliderVal}
          onChange={e => setSliderVal(parseFloat(e.target.value))}
          className="flex-1 accent-emerald-500"
        />
        <span className="text-white text-sm font-mono font-bold w-16 text-right">
          {v.max <= 1 ? sliderVal.toFixed(2) : Math.round(sliderVal)}{v.unit}
        </span>
      </div>

      {/* Membership values */}
      <div className="flex flex-wrap gap-4">
        {memberships.map(m => (
          <div key={m.label} className="flex items-center gap-2 bg-slate-800 rounded-lg px-3 py-2">
            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: m.color }} />
            <span className="text-slate-400 text-xs">{m.label}:</span>
            <span className="text-white text-xs font-bold font-mono">μ = {m.mu.toFixed(3)}</span>
            <div className="w-16 h-1.5 bg-slate-700 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-150" style={{ width: `${m.mu * 100}%`, background: m.color }} />
            </div>
          </div>
        ))}
      </div>

      <p className="text-slate-600 text-xs">
        Drag the slider to see how each input value maps to fuzzy membership degrees (μ). These membership functions define the fuzzy logic controller's green time calculation.
      </p>
    </div>
  );
};


// ── Main page ─────────────────────────────────────────────────
export const AnalyticsPage = () => {
  const [rows,         setRows]         = useState<ComparisonRow[]>([]);
  const [perfRows,     setPerfRows]     = useState<PerformanceRow[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState(false);
  const [exporting,    setExporting]    = useState(false);
  const [sortConfig,   setSortConfig]   = useState<{ key: keyof ComparisonRow; direction: 'asc' | 'desc' }>({ key: 'lane', direction: 'asc' });
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [activeTab,    setActiveTab]    = useState<'comparison' | 'fuzzy'>('comparison');

  const chartRef1 = useRef<any>(null);
  const chartRef2 = useRef<any>(null);
  const chartRef3 = useRef<any>(null);
  const chartRef4 = useRef<any>(null);

  const fetchAll = async () => {
    setLoading(true); setError(false);
    try {
      const [compRes, perfRes] = await Promise.all([
        fetch(`${FLASK_URL}/api/comparison`),
        fetch(`${FLASK_URL}/api/performance`),
      ]);
      if (compRes.ok) {
        const j = await compRes.json();
        const raw = j.data || j;
        setRows(raw.map((r: any) => ({
          ...r,
          traditional_green:      Number(r.traditional_green),
          ai_green:               Number(r.ai_green),
          ideal_green:            Number(r.ideal_green),
          traditional_wait:       Number(r.traditional_wait),
          ai_wait:                Number(r.ai_wait),
          traditional_efficiency: Number(r.traditional_efficiency),
          ai_efficiency:          Number(r.ai_efficiency),
          improvement:            Number(r.improvement),
          avg_vehicles:           Number(r.avg_vehicles),
          high_frames:            Number(r.high_frames   || 0),
          medium_frames:          Number(r.medium_frames || 0),
          low_frames:             Number(r.low_frames    || 0),
        })));
      } else { setError(true); }
      if (perfRes.ok) {
        const j = await perfRes.json();
        setPerfRows(j.data || []);
      }
    } catch { setError(true); }
    finally  { setLoading(false); }
  };

  useEffect(() => { fetchAll(); }, []);

  const handleExport = () => {
    setExporting(true);
    setTimeout(() => {
      const chartImages = [chartRef1, chartRef2, chartRef3, chartRef4].map(ref => {
        try { const c = ref.current?.canvas; return c ? c.toDataURL('image/png') : null; }
        catch { return null; }
      });
      exportReport(rows, perfRows, chartImages);
      setExporting(false);
    }, 200);
  };

  const labels        = rows.map(r => r.lane);
  const greenTimeChart = { labels, datasets: [
    { label: 'Traditional (Fixed 60s)', data: rows.map(r => r.traditional_green), backgroundColor: C.red   },
    { label: 'AI Adaptive',             data: rows.map(r => r.ai_green),          backgroundColor: C.green },
    { label: 'Ideal (Vehicle-based)',   data: rows.map(r => r.ideal_green),       backgroundColor: C.blue  },
  ]};
  const efficiencyChart = { labels, datasets: [
    { label: 'Traditional', data: rows.map(r => toNum(r.traditional_efficiency)), backgroundColor: C.red   },
    { label: 'AI Adaptive', data: rows.map(r => toNum(r.ai_efficiency)),          backgroundColor: C.green },
  ]};
  const waitTimeChart = { labels, datasets: [
    { label: 'Traditional', data: rows.map(r => r.traditional_wait), backgroundColor: C.red   },
    { label: 'AI Adaptive', data: rows.map(r => r.ai_wait),          backgroundColor: C.green },
  ]};
  const congestionChart = { labels, datasets: [
    { label: 'High',   data: rows.map(r => r.high_frames   || 0), backgroundColor: C.red   },
    { label: 'Medium', data: rows.map(r => r.medium_frames || 0), backgroundColor: C.amber },
    { label: 'Low',    data: rows.map(r => r.low_frames    || 0), backgroundColor: C.green },
  ]};

  const handleSort = (key: keyof ComparisonRow) =>
    setSortConfig(prev => ({ key, direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc' }));

  const sortedRows = [...rows].sort((a, b) => {
    const { key, direction } = sortConfig;
    const va = toNum(a[key]), vb = toNum(b[key]);
    return direction === 'asc' ? (va < vb ? -1 : va > vb ? 1 : 0) : (va > vb ? -1 : va < vb ? 1 : 0);
  });

  const summaryRow = rows.length > 0 ? {
    avg_vehicles:           avg(rows.map(r => r.avg_vehicles)).toFixed(1),
    traditional_green:      avg(rows.map(r => r.traditional_green)).toFixed(1),
    ai_green:               avg(rows.map(r => r.ai_green)).toFixed(1),
    ideal_green:            avg(rows.map(r => r.ideal_green)).toFixed(1),
    traditional_efficiency: fmtNum(avg(rows.map(r => toNum(r.traditional_efficiency))), '%'),
    ai_efficiency:          fmtNum(avg(rows.map(r => toNum(r.ai_efficiency))), '%'),
    improvement:            fmtNum(avg(rows.map(r => toNum(r.improvement))), '%'),
    traditional_wait:       avg(rows.map(r => r.traditional_wait)).toFixed(1),
    ai_wait:                avg(rows.map(r => r.ai_wait)).toFixed(1),
  } : null;

  const sortKeys: { key: keyof ComparisonRow; label: string }[] = [
    { key: 'lane',                   label: 'Lane'          },
    { key: 'avg_vehicles',           label: 'Avg Vehicles'  },
    { key: 'ai_green',               label: 'AI Green Time' },
    { key: 'improvement',            label: 'Improvement %' },
    { key: 'ai_efficiency',          label: 'AI Efficiency' },
    { key: 'ai_wait',                label: 'AI Wait Time'  },
  ];

  const TH = ({ col, label, right }: { col: keyof ComparisonRow; label: string; right?: boolean }) => (
    <th className={cn('px-4 py-3 cursor-pointer select-none group', right && 'text-right')} onClick={() => handleSort(col)}>
      <span className={cn('inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-slate-500 font-bold hover:text-slate-300 transition-colors', right && 'flex-row-reverse')}>
        {label}
        {sortConfig.key === col
          ? sortConfig.direction === 'asc' ? <ChevronUp size={12} className="text-emerald-500" /> : <ChevronDown size={12} className="text-emerald-500" />
          : <ChevronUp size={12} className="opacity-0 group-hover:opacity-30 transition-opacity" />}
      </span>
    </th>
  );

  const SortMenu = () => (
    <div className="relative">
      <Button variant="ghost" onClick={() => setShowSortMenu(v => !v)}
        className={cn('flex items-center gap-2 text-slate-400 hover:text-white', showSortMenu && 'text-emerald-500')}>
        <ListFilter size={16} />
        <span className="text-xs font-bold uppercase tracking-wider">Sort</span>
      </Button>
      <AnimatePresence>
        {showSortMenu && (
          <motion.div initial={{ opacity: 0, y: 8, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.97 }}
            className="absolute right-0 mt-2 w-52 glass-panel p-2 z-50 shadow-2xl border border-white/10 rounded-xl">
            <p className="px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-white/5 mb-1">Sort by</p>
            {sortKeys.map(({ key, label }) => (
              <button key={key} onClick={() => handleSort(key)}
                className={cn('w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-colors',
                  sortConfig.key === key ? 'bg-emerald-500/10 text-emerald-400' : 'text-slate-400 hover:bg-white/5 hover:text-white')}>
                {label}
                {sortConfig.key === key && (sortConfig.direction === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );

  if (loading) return <LoadingState />;

  const TABS = [
    { id: 'comparison', label: 'AI vs Traditional', icon: <BarChart2 size={14} /> },
    { id: 'fuzzy',      label: 'Fuzzy Membership',  icon: <Zap size={14} /> },
  ] as const;

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white">Analytics</h2>
          <p className="text-xs text-slate-500 mt-0.5">AI vs Traditional comparison · Fuzzy logic membership functions</p>
        </div>
        {activeTab === 'comparison' && !error && rows.length > 0 && (
          <button onClick={handleExport} disabled={exporting}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-white text-sm font-bold transition-colors">
            {exporting ? <><Loader2 size={14} className="animate-spin" /> Generating...</> : <><Download size={14} /> Export Report</>}
          </button>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex gap-2 border-b border-slate-800 pb-0">
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-all -mb-px',
              activeTab === tab.id
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-500 hover:text-slate-300'
            )}>
            {tab.icon}{tab.label}
          </button>
        ))}
      </div>

      {/* ── TAB: Comparison ── */}
      {activeTab === 'comparison' && (
        <>
          {error || rows.length === 0
            ? <EmptyState onRetry={fetchAll} />
            : <>
              {perfRows.length > 0 && (
                <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
                  <Card title="AI vs Traditional — Overall Performance" subtitle="Pre-computed summary from trained model">
                    <div className="grid grid-cols-4 px-4 py-2 mt-4 border-b border-brand-border">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Metric</span>
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right">Traditional</span>
                      <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider text-right">AI Adaptive</span>
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right">Difference</span>
                    </div>
                    {perfRows.map((row, i) => <PerfRow key={i} row={row} />)}
                  </Card>
                </motion.div>
              )}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card title="Green Time per Lane (seconds)" subtitle="Traditional fixed 60s vs AI adaptive vs Ideal target">
                  <div className="h-[280px] mt-4"><Bar ref={chartRef1} options={baseOpts} data={greenTimeChart} /></div>
                </Card>
                <Card title="Signal Efficiency per Lane (%)" subtitle="How well green time matches actual vehicle demand">
                  <div className="h-[280px] mt-4"><Bar ref={chartRef2} options={baseOpts} data={efficiencyChart} /></div>
                </Card>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card title="Wait Time per Lane (seconds)" subtitle="Sum of green time given to other 3 lanes">
                  <div className="h-[280px] mt-4"><Bar ref={chartRef3} options={baseOpts} data={waitTimeChart} /></div>
                </Card>
                <Card title="Congestion Distribution per Lane" subtitle="Frame count per congestion level">
                  <div className="h-[280px] mt-4"><Bar ref={chartRef4} options={stackedOpts} data={congestionChart} /></div>
                </Card>
              </div>
              <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
                <Card title="Detailed Comparison Table" subtitle="Lane-by-lane breakdown — click any column header to sort" actions={<SortMenu />}>
                  <div className="overflow-x-auto mt-4">
                    <table className="w-full text-left border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-brand-border">
                          <TH col="lane" label="Lane" />
                          <TH col="avg_vehicles" label="Vehicles" right />
                          <th className="px-4 py-3 text-center text-[10px] font-bold text-slate-500 uppercase tracking-wider">Congestion</th>
                          <TH col="traditional_green" label="Trad Green" right />
                          <TH col="ai_green" label="AI Green" right />
                          <TH col="ideal_green" label="Ideal" right />
                          <TH col="traditional_efficiency" label="Trad Eff" right />
                          <TH col="ai_efficiency" label="AI Eff" right />
                          <TH col="improvement" label="Improvement" right />
                          <TH col="traditional_wait" label="Trad Wait" right />
                          <TH col="ai_wait" label="AI Wait" right />
                        </tr>
                      </thead>
                      <tbody>
                        {sortedRows.map((row, i) => {
                          const imp = toNum(row.improvement);
                          return (
                            <motion.tr key={row.lane} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}
                              className="border-b border-brand-border/40 hover:bg-slate-800/30 transition-colors">
                              <td className="px-4 py-3 font-bold text-white">{row.lane}</td>
                              <td className="px-4 py-3 text-right text-slate-300">{row.avg_vehicles}</td>
                              <td className="px-4 py-3 text-center">
                                <Badge variant={row.congestion === 'High' ? 'danger' : row.congestion === 'Medium' ? 'warning' : 'success'}>{row.congestion}</Badge>
                              </td>
                              <td className="px-4 py-3 text-right text-slate-400">{row.traditional_green}s</td>
                              <td className="px-4 py-3 text-right text-emerald-400 font-medium">{row.ai_green}s</td>
                              <td className="px-4 py-3 text-right text-blue-400">{row.ideal_green}s</td>
                              <td className="px-4 py-3 text-right text-slate-400">{fmtNum(row.traditional_efficiency, '%')}</td>
                              <td className="px-4 py-3 text-right text-emerald-400 font-medium">{fmtNum(row.ai_efficiency, '%')}</td>
                              <td className={cn('px-4 py-3 text-right font-bold', imp >= 0 ? 'text-emerald-500' : 'text-rose-500')}>
                                {imp >= 0 ? '+' : ''}{fmtNum(row.improvement, '%')}
                              </td>
                              <td className="px-4 py-3 text-right text-slate-400">{row.traditional_wait}s</td>
                              <td className="px-4 py-3 text-right text-emerald-400 font-medium">{row.ai_wait}s</td>
                            </motion.tr>
                          );
                        })}
                        {summaryRow && (
                          <tr className="bg-slate-800/60 border-t-2 border-slate-600">
                            <td className="px-4 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Averages</td>
                            <td className="px-4 py-4 text-right font-bold text-white">{summaryRow.avg_vehicles}</td>
                            <td className="px-4 py-4 text-center text-slate-500">—</td>
                            <td className="px-4 py-4 text-right font-bold text-white">{summaryRow.traditional_green}s</td>
                            <td className="px-4 py-4 text-right font-bold text-emerald-400">{summaryRow.ai_green}s</td>
                            <td className="px-4 py-4 text-right font-bold text-blue-400">{summaryRow.ideal_green}s</td>
                            <td className="px-4 py-4 text-right font-bold text-white">{summaryRow.traditional_efficiency}</td>
                            <td className="px-4 py-4 text-right font-bold text-emerald-400">{summaryRow.ai_efficiency}</td>
                            <td className="px-4 py-4 text-right font-bold text-emerald-500">+{summaryRow.improvement}</td>
                            <td className="px-4 py-4 text-right font-bold text-white">{summaryRow.traditional_wait}s</td>
                            <td className="px-4 py-4 text-right font-bold text-emerald-400">{summaryRow.ai_wait}s</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </motion.div>
            </>
          }
        </>
      )}

      {/* ── TAB: Fuzzy Membership ── */}
      {activeTab === 'fuzzy' && (
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          <Card title="Fuzzy Logic Membership Functions" subtitle="Interactive visualisation of fuzzy sets used in the green time controller">
            <div className="mt-4"><FuzzyChart /></div>
          </Card>
        </motion.div>
      )}

    </div>
  );
};