import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Chart as ChartJS, CategoryScale, LinearScale,
  BarElement, Title, Tooltip, Legend,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import {
  ChevronUp, ChevronDown, ListFilter,
  BarChart2, Loader2, RefreshCw, Download,
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
      labels: {
        color: C.text,
        font: { size: 12, weight: 'bold' as const },
        padding: 20, usePointStyle: true, pointStyle: 'circle' as const,
      },
    },
    tooltip: {
      backgroundColor: 'rgba(15,23,42,0.95)',
      titleColor: '#fff', titleFont: { size: 13, weight: 'bold' as const },
      bodyColor: '#cbd5e1', bodyFont: { size: 12 },
      borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1,
      padding: 12, cornerRadius: 8, usePointStyle: true,
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
    <Button variant="outline" size="sm" onClick={onRetry} className="flex items-center gap-2 mt-2">
      <RefreshCw size={14} /> Retry
    </Button>
  </div>
);

// ── PDF Export ────────────────────────────────────────────────
const exportReport = (rows: ComparisonRow[], perfRows: PerformanceRow[], chartImages: (string | null)[] = []) => {
  const date = new Date().toLocaleDateString('en-GB', {
    day: '2-digit', month: 'long', year: 'numeric',
  });
  const time = new Date().toLocaleTimeString();

  // Build HTML content for PDF
  const html = `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<title>SmartTraffic AI — Analytics Report</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, sans-serif; color: #1a1a2e; padding: 40px; font-size: 13px; }
  .header { border-bottom: 3px solid #00d4aa; padding-bottom: 20px; margin-bottom: 28px; }
  .header h1 { font-size: 24px; color: #00d4aa; font-weight: 700; }
  .header p  { color: #666; margin-top: 4px; font-size: 12px; }
  .section-title { font-size: 14px; font-weight: 700; color: #1a1a2e;
                   border-left: 4px solid #00d4aa; padding-left: 10px;
                   margin: 24px 0 12px; }

  table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 12px; }
  th { background: #00d4aa; color: white; padding: 8px 10px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
  th.r { text-align: right; }
  td { padding: 8px 10px; border-bottom: 1px solid #e5e7eb; }
  td.r { text-align: right; }
  tr:nth-child(even) { background: #f9fafb; }
  .avg-row { background: #f0fdf9 !important; font-weight: 700; }
  .good  { color: #059669; font-weight: 700; }
  .bad   { color: #dc2626; font-weight: 700; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 700; }
  .badge-high   { background: #fee2e2; color: #dc2626; }
  .badge-medium { background: #fef3c7; color: #d97706; }
  .badge-low    { background: #d1fae5; color: #059669; }
  .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e7eb;
            font-size: 11px; color: #999; display: flex; justify-content: space-between; }
</style>
</head>
<body>

<div class="header">
  <h1>🚦 SmartTraffic AI — Analytics Report</h1>
  <p>Generated: ${date} at ${time} &nbsp;|&nbsp; System: AI-Powered Adaptive Traffic Signal Control &nbsp;|&nbsp; Lanes: 4</p>
</div>


${chartImages.some(Boolean) ? `
<div class="section-title">Performance Charts</div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px;">
  ${chartImages.map((img, i) => {
    const titles = [
      'Green Time per Lane (seconds)',
      'Signal Efficiency per Lane (%)',
      'Wait Time per Lane (seconds)',
      'Congestion Distribution per Lane',
    ];
    return img ? `
      <div style="border:1px solid #e5e7eb;border-radius:8px;padding:12px;">
        <div style="font-size:11px;font-weight:700;color:#374151;margin-bottom:8px;">${titles[i]}</div>
        <img src="${img}" style="width:100%;height:auto;border-radius:4px;" />
      </div>` : '';
  }).join('')}
</div>` : ''}

${perfRows.length > 0 ? `
<div class="section-title">AI vs Traditional — Overall Performance</div>
<table>
  <thead><tr>
    <th>Metric</th>
    <th class="r">Traditional</th>
    <th class="r">AI Adaptive</th>
    <th class="r">Difference</th>
  </tr></thead>
  <tbody>
    ${perfRows.map(r => {
      const diff = toNum(r.difference);
      const isEff = String(r.metric).toLowerCase().includes('efficiency');
      const good  = isEff ? diff > 0 : diff <= 0;
      return `<tr>
        <td>${r.metric}</td>
        <td class="r">${r.traditional}</td>
        <td class="r" style="color:#059669;font-weight:700">${r.ai_adaptive}</td>
        <td class="r ${good ? 'good' : 'bad'}">${diff > 0 ? '+' : ''}${r.difference}</td>
      </tr>`;
    }).join('')}
  </tbody>
</table>` : ''}

<div class="section-title">Lane-by-Lane Comparison</div>
<table>
  <thead><tr>
    <th>Lane</th>
    <th class="r">Vehicles</th>
    <th>Congestion</th>
    <th class="r">Trad Green</th>
    <th class="r">AI Green</th>
    <th class="r">Ideal</th>
    <th class="r">Trad Eff</th>
    <th class="r">AI Eff</th>
    <th class="r">Improvement</th>
    <th class="r">Trad Wait</th>
    <th class="r">AI Wait</th>
  </tr></thead>
  <tbody>
    ${rows.map(r => {
      const imp = toNum(r.improvement);
      const badge = r.congestion === 'High'
        ? 'badge-high' : r.congestion === 'Medium'
        ? 'badge-medium' : 'badge-low';
      return `<tr>
        <td><strong>${r.lane}</strong></td>
        <td class="r">${r.avg_vehicles}</td>
        <td><span class="badge ${badge}">${r.congestion}</span></td>
        <td class="r">${r.traditional_green}s</td>
        <td class="r" style="color:#059669;font-weight:700">${r.ai_green}s</td>
        <td class="r" style="color:#3b82f6">${r.ideal_green}s</td>
        <td class="r">${fmtNum(r.traditional_efficiency, '%')}</td>
        <td class="r" style="color:#059669;font-weight:700">${fmtNum(r.ai_efficiency, '%')}</td>
        <td class="r ${imp >= 0 ? 'good' : 'bad'}">${imp >= 0 ? '+' : ''}${fmtNum(r.improvement, '%')}</td>
        <td class="r">${r.traditional_wait}s</td>
        <td class="r" style="color:#059669;font-weight:700">${r.ai_wait}s</td>
      </tr>`;
    }).join('')}
    <tr class="avg-row">
      <td>Averages</td>
      <td class="r">${avg(rows.map(r => r.avg_vehicles)).toFixed(1)}</td>
      <td>—</td>
      <td class="r">${avg(rows.map(r => r.traditional_green)).toFixed(1)}s</td>
      <td class="r" style="color:#059669">${avg(rows.map(r => r.ai_green)).toFixed(1)}s</td>
      <td class="r" style="color:#3b82f6">${avg(rows.map(r => r.ideal_green)).toFixed(1)}s</td>
      <td class="r">${fmtNum(avg(rows.map(r => toNum(r.traditional_efficiency))), '%')}</td>
      <td class="r" style="color:#059669">${fmtNum(avg(rows.map(r => toNum(r.ai_efficiency))), '%')}</td>
      <td class="r good">+${fmtNum(avg(rows.map(r => toNum(r.improvement))), '%')}</td>
      <td class="r">${avg(rows.map(r => r.traditional_wait)).toFixed(1)}s</td>
      <td class="r" style="color:#059669">${avg(rows.map(r => r.ai_wait)).toFixed(1)}s</td>
    </tr>
  </tbody>
</table>

<div class="footer">
  <span>SmartTraffic AI — Final Year Project</span>
  <span>AI-Powered Adaptive Traffic Signal Control System</span>
</div>

</body>
</html>`;

  // Open in new tab and trigger print-to-PDF
  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.onload = () => {
    win.focus();
    win.print();
  };
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

  // Refs to capture chart canvases for PDF export
  const chartRef1 = useRef<any>(null);
  const chartRef2 = useRef<any>(null);
  const chartRef3 = useRef<any>(null);
  const chartRef4 = useRef<any>(null);

  const fetchAll = async () => {
    setLoading(true);
    setError(false);
    try {
      const [compRes, perfRes] = await Promise.all([
        fetch(`${FLASK_URL}/api/comparison`),
        fetch(`${FLASK_URL}/api/performance`),
      ]);
      if (compRes.ok) {
        const j = await compRes.json();
        const raw = j.data || j;
        const coerced = raw.map((r: any) => ({
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
        }));
        setRows(coerced);
      } else {
        setError(true);
      }
      if (perfRes.ok) {
        const j = await perfRes.json();
        setPerfRows(j.data || []);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  const handleExport = () => {
    setExporting(true);
    setTimeout(() => {
      // Capture each chart canvas as base64 image
      const chartImages = [chartRef1, chartRef2, chartRef3, chartRef4].map(ref => {
        try {
          const canvas = ref.current?.canvas;
          return canvas ? canvas.toDataURL('image/png') : null;
        } catch { return null; }
      });
      exportReport(rows, perfRows, chartImages);
      setExporting(false);
    }, 200);
  };

  // ── Chart data ─────────────────────────────────────────────
  const labels = rows.map(r => r.lane);

  const greenTimeChart = {
    labels,
    datasets: [
      { label: 'Traditional (Fixed 60s)', data: rows.map(r => r.traditional_green), backgroundColor: C.red   },
      { label: 'AI Adaptive',             data: rows.map(r => r.ai_green),          backgroundColor: C.green },
      { label: 'Ideal (Vehicle-based)',   data: rows.map(r => r.ideal_green),        backgroundColor: C.blue  },
    ],
  };

  const efficiencyChart = {
    labels,
    datasets: [
      { label: 'Traditional', data: rows.map(r => toNum(r.traditional_efficiency)), backgroundColor: C.red   },
      { label: 'AI Adaptive', data: rows.map(r => toNum(r.ai_efficiency)),          backgroundColor: C.green },
    ],
  };

  const waitTimeChart = {
    labels,
    datasets: [
      { label: 'Traditional', data: rows.map(r => r.traditional_wait), backgroundColor: C.red   },
      { label: 'AI Adaptive', data: rows.map(r => r.ai_wait),          backgroundColor: C.green },
    ],
  };

  const congestionChart = {
    labels,
    datasets: [
      { label: 'High',   data: rows.map(r => r.high_frames   || 0), backgroundColor: C.red   },
      { label: 'Medium', data: rows.map(r => r.medium_frames || 0), backgroundColor: C.amber },
      { label: 'Low',    data: rows.map(r => r.low_frames    || 0), backgroundColor: C.green },
    ],
  };

  // ── Sort ──────────────────────────────────────────────────
  const handleSort = (key: keyof ComparisonRow) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  const sortedRows = [...rows].sort((a, b) => {
    const { key, direction } = sortConfig;
    const va = toNum(a[key]);
    const vb = toNum(b[key]);
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
    { key: 'lane',                   label: 'Lane'            },
    { key: 'avg_vehicles',           label: 'Avg Vehicles'    },
    { key: 'ai_green',               label: 'AI Green Time'   },
    { key: 'improvement',            label: 'Improvement %'   },
    { key: 'ai_efficiency',          label: 'AI Efficiency'   },
    { key: 'ai_wait',                label: 'AI Wait Time'    },
  ];

  const TH = ({ col, label, right }: { col: keyof ComparisonRow; label: string; right?: boolean }) => (
    <th className={cn('px-4 py-3 cursor-pointer select-none group', right && 'text-right')} onClick={() => handleSort(col)}>
      <span className={cn('inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-slate-500 font-bold hover:text-slate-300 transition-colors', right && 'flex-row-reverse')}>
        {label}
        {sortConfig.key === col
          ? sortConfig.direction === 'asc'
            ? <ChevronUp size={12} className="text-emerald-500" />
            : <ChevronDown size={12} className="text-emerald-500" />
          : <ChevronUp size={12} className="opacity-0 group-hover:opacity-30 transition-opacity" />}
      </span>
    </th>
  );

  const SortMenu = () => (
    <div className="relative">
      <Button variant="ghost" size="sm" onClick={() => setShowSortMenu(v => !v)}
        className={cn('flex items-center gap-2 text-slate-400 hover:text-white', showSortMenu && 'text-emerald-500')}>
        <ListFilter size={16} />
        <span className="text-xs font-bold uppercase tracking-wider">Sort</span>
      </Button>
      <AnimatePresence>
        {showSortMenu && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.97 }}
            className="absolute right-0 mt-2 w-52 glass-panel p-2 z-50 shadow-2xl border border-white/10 rounded-xl"
          >
            <p className="px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-white/5 mb-1">Sort by</p>
            {sortKeys.map(({ key, label }) => (
              <button key={key} onClick={() => handleSort(key)}
                className={cn(
                  'w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-colors',
                  sortConfig.key === key ? 'bg-emerald-500/10 text-emerald-400' : 'text-slate-400 hover:bg-white/5 hover:text-white'
                )}>
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
  if (error || rows.length === 0) return <EmptyState onRetry={fetchAll} />;

  return (
    <div className="space-y-6 pb-12">

      {/* ── Page header with export button ── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white">Analytics</h2>
          <p className="text-xs text-slate-500 mt-0.5">AI vs Traditional comparison from trained model</p>
        </div>
        <button
          onClick={handleExport}
          disabled={exporting}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold transition-colors"
        >
          {exporting
            ? <><Loader2 size={14} className="animate-spin" /> Generating...</>
            : <><Download size={14} /> Export Report</>
          }
        </button>
      </div>

      {/* ── Performance metrics table ── */}
      {perfRows.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          <Card
            title="AI vs Traditional — Overall Performance"
            subtitle="Pre-computed summary from trained model (performance_metrics.csv)"
          >
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

      {/* ── Charts row 1 ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <Card title="Green Time per Lane (seconds)" subtitle="Traditional fixed 60s vs AI adaptive vs Ideal target">
            <div className="h-[280px] mt-4"><Bar ref={chartRef1} options={baseOpts} data={greenTimeChart} /></div>
          </Card>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card title="Signal Efficiency per Lane (%)" subtitle="How well green time matches actual vehicle demand">
            <div className="h-[280px] mt-4"><Bar ref={chartRef2} options={baseOpts} data={efficiencyChart} /></div>
          </Card>
        </motion.div>
      </div>

      {/* ── Charts row 2 ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <Card title="Wait Time per Lane (seconds)" subtitle="Sum of green time given to other 3 lanes">
            <div className="h-[280px] mt-4"><Bar ref={chartRef3} options={baseOpts} data={waitTimeChart} /></div>
          </Card>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card title="Congestion Distribution per Lane" subtitle="Frame count per congestion level">
            <div className="h-[280px] mt-4"><Bar ref={chartRef4} options={stackedOpts} data={congestionChart} /></div>
          </Card>
        </motion.div>
      </div>

      {/* ── Comparison table ── */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
        <Card
          title="Detailed Comparison Table"
          subtitle="Lane-by-lane breakdown — click any column header to sort"
          actions={<SortMenu />}
        >
          <div className="overflow-x-auto mt-4">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-brand-border">
                  <TH col="lane"                   label="Lane"        />
                  <TH col="avg_vehicles"           label="Vehicles"    right />
                  <th className="px-4 py-3 text-center text-[10px] font-bold text-slate-500 uppercase tracking-wider">Congestion</th>
                  <TH col="traditional_green"      label="Trad Green"  right />
                  <TH col="ai_green"               label="AI Green"    right />
                  <TH col="ideal_green"            label="Ideal"       right />
                  <TH col="traditional_efficiency" label="Trad Eff"    right />
                  <TH col="ai_efficiency"          label="AI Eff"      right />
                  <TH col="improvement"            label="Improvement" right />
                  <TH col="traditional_wait"       label="Trad Wait"   right />
                  <TH col="ai_wait"                label="AI Wait"     right />
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((row, i) => {
                  const imp = toNum(row.improvement);
                  return (
                    <motion.tr
                      key={row.lane}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.04 }}
                      className="border-b border-brand-border/40 hover:bg-slate-800/30 transition-colors"
                    >
                      <td className="px-4 py-3 font-bold text-white">{row.lane}</td>
                      <td className="px-4 py-3 text-right text-slate-300">{row.avg_vehicles}</td>
                      <td className="px-4 py-3 text-center">
                        <Badge variant={row.congestion === 'High' ? 'danger' : row.congestion === 'Medium' ? 'warning' : 'success'}>
                          {row.congestion}
                        </Badge>
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

    </div>
  );
};