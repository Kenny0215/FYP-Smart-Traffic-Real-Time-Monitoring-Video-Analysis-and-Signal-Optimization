import React, { useState, useEffect } from 'react';
import { 
  ChevronRight, 
  Car, 
  Clock, 
  AlertTriangle, 
  CheckCircle2, 
  Cpu, 
  BarChart3, 
  ShieldAlert, 
  Layers, 
  Zap, 
  ArrowDown,
  FileText,
  Monitor,
  Activity
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Button } from '../components/Button';
import { TrafficLightIcon } from '../components/TrafficLightIcon';
import { TrafficSimulation } from '../components/TrafficSimulation';

const SCENARIOS = [
  {
    id: 'morning_rush',
    name: 'Morning Rush Hour',
    description: 'Heavy commuter traffic entering the city center from North and West lanes.',
    status: 'SYNCED',
    latency: '8ms',
    laneA: 'HIGH_DENSITY',
    laneB: 'MEDIUM_DENSITY',
    laneC: 'LOW_DENSITY',
    laneD: 'HIGH_DENSITY',
    activeLane: 'Lane A',
    color: 'emerald'
  },
  {
    id: 'emergency',
    name: 'Emergency Priority',
    description: 'Ambulance detected in Lane C. System automatically overrides signal for priority passage.',
    status: 'OVERRIDE',
    latency: '4ms',
    laneA: 'STOPPED',
    laneB: 'STOPPED',
    laneC: 'EMERGENCY_PASS',
    laneD: 'STOPPED',
    activeLane: 'Lane C',
    color: 'rose'
  },
  {
    id: 'midnight',
    name: 'Midnight Optimization',
    description: 'Low traffic volume. System minimizes waiting time by switching to demand-only signals.',
    status: 'POWER_SAVE',
    latency: '15ms',
    laneA: 'CLEAR',
    laneB: 'CLEAR',
    laneC: 'CLEAR',
    laneD: 'CLEAR',
    activeLane: 'DYNAMIC',
    color: 'cyan'
  },
  {
    id: 'rainy',
    name: 'Rainy Weather Mode',
    description: 'Reduced visibility and slippery roads. System increases safety buffers and green light duration.',
    status: 'WEATHER_ADAPT',
    latency: '12ms',
    laneA: 'MEDIUM_DENSITY',
    laneB: 'MEDIUM_DENSITY',
    laneC: 'MEDIUM_DENSITY',
    laneD: 'MEDIUM_DENSITY',
    activeLane: 'Lane B',
    color: 'amber'
  },
  {
    id: 'holiday',
    name: 'Holiday Weekend',
    description: 'Extreme traffic volume across all lanes. AI maximizing throughput using predictive modeling.',
    status: 'MAX_CAPACITY',
    latency: '22ms',
    laneA: 'CRITICAL',
    laneB: 'CRITICAL',
    laneC: 'CRITICAL',
    laneD: 'CRITICAL',
    activeLane: 'Lane D',
    color: 'violet'
  }
];

export const LandingPage = ({ onStart }: { onStart: () => void }) => {
  const [scenario, setScenario] = useState(SCENARIOS[0]);

  useEffect(() => {
    const interval = setInterval(() => {
      const nextIndex = (SCENARIOS.findIndex(s => s.id === scenario.id) + 1) % SCENARIOS.length;
      setScenario(SCENARIOS[nextIndex]);
    }, 5000);
    return () => clearInterval(interval);
  }, [scenario]);

  return (
    <div className="min-h-screen flex flex-col bg-[#0a0e14]">
    {/* Navigation */}
    <nav className="p-6 flex justify-between items-center max-w-7xl mx-auto w-full sticky top-0 z-50 bg-[#0a0e14]/80 backdrop-blur-md">
      <div className="flex items-center gap-2">
        <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center">
          <TrafficLightIcon className="text-white" size={24} colorized />
        </div>
        <span className="text-xl font-bold tracking-tight text-white">SmartTraffic <span className="text-emerald-500">AI</span></span>
      </div>
      <div className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-400">
        <a href="#problem" className="hover:text-white transition-colors">Problem</a>
        <a href="#features" className="hover:text-white transition-colors">Features</a>
        <a href="#workflow" className="hover:text-white transition-colors">Workflow</a>
        <a href="#tech" className="hover:text-white transition-colors">Tech Stack</a>
        <Button variant="outline" onClick={onStart}>Login</Button>
      </div>
    </nav>

    {/* 1. Hero Section */}
    <main className="relative overflow-hidden pt-20 pb-32">
      {/* Background Animation Placeholder Effect */}
      <div className="absolute inset-0 z-0 opacity-20 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-emerald-500/20 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-cyan-500/20 rounded-full blur-[120px] animate-pulse delay-700" />
      </div>

      <div className="max-w-7xl mx-auto px-6 relative z-10 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
        >
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold text-white tracking-tight leading-[1.1]">
            SmartTraffic AI: <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">
              Real-Time Monitoring Video Analysis And Signal Optimization
            </span>
          </h1>
          <div className="mt-12 flex flex-col sm:flex-row gap-4 justify-center">
            <Button className="px-10 py-4 text-lg bg-emerald-600 hover:bg-emerald-500 shadow-lg shadow-emerald-900/20" onClick={onStart}>
              🚀 Start System <ChevronRight size={20} className="ml-2" />
            </Button>
            <Button 
              variant="outline" 
              className="px-10 py-4 text-lg border-slate-700 hover:bg-slate-800"
              onClick={() => document.getElementById('problem')?.scrollIntoView({ behavior: 'smooth' })}
            >
              📄 View Project Details
            </Button>
          </div>
        </motion.div>
      </div>
    </main>

    {/* 2. Problem Statement Section */}
    <section id="problem" className="py-24 bg-slate-900/50 border-y border-slate-800">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-3xl font-bold text-white mb-8">Current Traffic Problems</h2>
            <ul className="space-y-6">
              {[
                "Traffic congestion in urban areas",
                "Fixed traffic signals cause long waiting times",
                "Emergency vehicles are often delayed",
                "Traffic monitoring requires manual observation"
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-4 text-slate-400">
                  <div className="mt-1 p-1 bg-rose-500/10 rounded text-rose-500">
                    <AlertTriangle size={18} />
                  </div>
                  <span className="text-lg">{item}</span>
                </li>
              ))}
            </ul>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="p-8 bg-emerald-500/5 border border-emerald-500/20 rounded-2xl"
          >
            <h2 className="text-3xl font-bold text-emerald-500 mb-8">How Our System Helps</h2>
            <ul className="space-y-6">
              {[
                "AI-based vehicle detection",
                "Automated congestion analysis",
                "Smart signal timing recommendations",
                "Emergency vehicle prioritization"
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-4 text-slate-200">
                  <div className="mt-1 p-1 bg-emerald-500/20 rounded text-emerald-500">
                    <CheckCircle2 size={18} />
                  </div>
                  <span className="text-lg font-medium">{item}</span>
                </li>
              ))}
            </ul>
          </motion.div>
        </div>
      </div>
    </section>

    {/* 3. System Features Section */}
    <section id="features" className="py-24">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">Core System Features</h2>
          <p className="text-slate-400">Advanced capabilities for modern urban management</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {[
            { 
              icon: <Car size={24} />, 
              title: 'AI Vehicle Detection', 
              desc: 'Detect cars, buses, trucks, and motorcycles from traffic videos using deep learning.' 
            },
            { 
              icon: <BarChart3 size={24} />, 
              title: 'Traffic Congestion Analysis', 
              desc: 'Automatically classify traffic density into low, medium, and high congestion levels.' 
            },
            { 
              icon: <Clock size={24} />, 
              title: 'Adaptive Signal Timing', 
              desc: 'Recommend optimal traffic light timings based on real-time traffic conditions.' 
            },
            { 
              icon: <ShieldAlert size={24} />, 
              title: 'Emergency Vehicle Priority', 
              desc: 'Detect ambulances, police cars, and fire trucks and provide priority green signals.' 
            },
            { 
              icon: <Monitor size={24} />, 
              title: 'AI Simulation', 
              desc: 'Display a virtual traffic intersection showing real-time congestion levels.' 
            },
            { 
              icon: <Zap size={24} />, 
              title: 'Real-time Processing', 
              desc: 'High-speed analysis pipeline ensuring minimal latency for critical decisions.' 
            }
          ].map((feature, i) => (
            <motion.div 
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className="p-8 bg-slate-900 border border-slate-800 rounded-2xl hover:border-emerald-500/50 transition-all group"
            >
              <div className="w-12 h-12 bg-slate-800 rounded-xl flex items-center justify-center mb-6 text-emerald-500 group-hover:scale-110 transition-transform">
                {feature.icon}
              </div>
              <h3 className="text-xl font-bold text-white mb-3">{feature.title}</h3>
              <p className="text-slate-400 text-sm leading-relaxed">{feature.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>

    {/* 4. How The System Works */}
    <section id="workflow" className="py-24 bg-slate-900/30">
      <div className="max-w-7xl mx-auto px-6 text-center">
        <h2 className="text-3xl font-bold text-white mb-16">System Workflow Pipeline</h2>
        
        <div className="flex flex-wrap justify-center gap-4 items-center">
          {[
            "Upload Traffic Video",
            "Vehicle Detection (YOLOv8)",
            "Vehicle Tracking (DeepSORT)",
            "Traffic Density Analysis",
            "Congestion Classification",
            "Signal Timing Recommendation",
            "AI Simulation Dashboard"
          ].map((step, i, arr) => (
            <React.Fragment key={i}>
              <div className="p-4 bg-slate-800 border border-slate-700 rounded-xl text-white font-medium shadow-lg">
                {step}
              </div>
              {i < arr.length - 1 && (
                <div className="text-emerald-500 hidden lg:block">
                  <ChevronRight size={24} />
                </div>
              )}
              {i < arr.length - 1 && (
                <div className="text-emerald-500 lg:hidden w-full flex justify-center py-2">
                  <ArrowDown size={24} />
                </div>
              )}
            </React.Fragment>
          ))}
        </div>
      </div>
    </section>

    {/* 5. Technology Stack */}
    <section id="tech" className="py-24 border-y border-slate-800">
      <div className="max-w-7xl mx-auto px-6">
        <h2 className="text-3xl font-bold text-white mb-16 text-center">Technology Stack</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {[
            { category: 'Artificial Intelligence', tech: ['YOLOv8', 'DeepSORT', 'Random Forest'] },
            { category: 'Backend', tech: ['Python', 'OpenCV', 'Express / Node.js'] },
            { category: 'Frontend', tech: ['React', 'TailwindCSS', 'Canvas API'] },
            { category: 'Database', tech: ['Supabase', 'PostgreSQL'] }
          ].map((stack, i) => (
            <div key={i} className="p-6 bg-slate-900/50 rounded-2xl border border-slate-800">
              <h4 className="text-emerald-500 font-bold mb-4 uppercase tracking-wider text-xs">{stack.category}</h4>
              <ul className="space-y-2">
                {stack.tech.map((t, j) => (
                  <li key={j} className="text-white font-medium">{t}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>

    {/* 6. AI Simulation Concept Section */}
    <section className="py-24 bg-gradient-to-b from-slate-900 to-[#0a0e14]">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <div className="relative">
            <motion.div
              key={scenario.id}
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              className="relative aspect-square bg-[#0a0e14] rounded-3xl border-2 border-emerald-500/30 overflow-hidden shadow-2xl shadow-emerald-500/10"
            >
              {/* Traffic Simulation Canvas */}
              <TrafficSimulation scenarioId={scenario.id} />

              {/* Data Panel Overlay */}
              <div className="absolute top-4 left-4 p-4 glass-panel border-emerald-500/20 min-w-[180px]">
                <div className="flex items-center gap-2 mb-3">
                  <Activity size={14} className="text-emerald-500 animate-pulse" />
                  <span className="text-[10px] font-mono text-emerald-500 uppercase tracking-widest">Live Simulation</span>
                </div>
                <div className="space-y-1 font-mono text-[10px]">
                  <div className="flex justify-between">
                    <span className="text-slate-500">SCENARIO:</span>
                    <span className="text-white">{scenario.id.toUpperCase()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">STATE:</span>
                    <span className="text-emerald-400">{scenario.status}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">LATENCY:</span>
                    <span className="text-white">{scenario.latency}</span>
                  </div>
                  <div className="pt-2 mt-2 border-t border-slate-800 space-y-1">
                    <div className="flex justify-between">
                      <span className="text-slate-500">LANE_A:</span>
                      <span className={scenario.laneA === 'HIGH_DENSITY' || scenario.laneA === 'CRITICAL' ? 'text-rose-500' : 'text-slate-300'}>{scenario.laneA}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">LANE_B:</span>
                      <span className={scenario.laneB === 'HIGH_DENSITY' || scenario.laneB === 'CRITICAL' ? 'text-rose-500' : 'text-slate-300'}>{scenario.laneB}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Scenario Badge */}
              <div className="absolute bottom-4 right-4 px-3 py-1 bg-emerald-600 text-white text-[10px] font-bold rounded-full uppercase tracking-tighter">
                {scenario.name}
              </div>
            </motion.div>
          </div>

          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-xs font-bold mb-6 uppercase tracking-widest">
              <Zap size={14} /> Real-time AI Simulation
            </div>
            <h2 className="text-3xl font-bold text-white mb-6">The AI Simulation Concept</h2>
            <p className="text-slate-400 text-lg leading-relaxed mb-8">
              An AI Simulation is a virtual representation of a real-world system. In this project, 
              an AI simulation of a traffic intersection is created to visualize traffic conditions, 
              congestion levels, and signal timing recommendations in real time.
            </p>
            
            {/* Dynamic Scenario Info */}
            <AnimatePresence mode="wait">
              <motion.div
                key={scenario.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="mb-8 p-6 bg-slate-800/30 border-l-4 border-emerald-500 rounded-r-xl"
              >
                <h4 className="text-white font-bold mb-2 flex items-center gap-2">
                  Current Scenario: {scenario.name}
                </h4>
                <p className="text-slate-400 text-sm italic">
                  "{scenario.description}"
                </p>
              </motion.div>
            </AnimatePresence>

            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-slate-800/50 rounded-xl border border-slate-700">
                <Layers className="text-emerald-500 mb-2" size={20} />
                <div className="text-white font-bold text-sm">Intersection Diagram</div>
              </div>
              <div className="p-4 bg-slate-800/50 rounded-xl border border-slate-700">
                <TrafficLightIcon className="text-emerald-500 mb-2" size={20} />
                <div className="text-white font-bold text-sm">Lane Congestion Colors</div>
              </div>
              <div className="p-4 bg-slate-800/50 rounded-xl border border-slate-700">
                <Clock className="text-emerald-500 mb-2" size={20} />
                <div className="text-white font-bold text-sm">Signal Timing Indicators</div>
              </div>
              <div className="p-4 bg-slate-800/50 rounded-xl border border-slate-700">
                <Monitor className="text-emerald-500 mb-2" size={20} />
                <div className="text-white font-bold text-sm">Real-time Visualization</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    {/* 7. System Benefits Section */}
    <section className="py-24 border-t border-slate-800">
      <div className="max-w-7xl mx-auto px-6 text-center">
        <h2 className="text-3xl font-bold text-white mb-16">System Benefits</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {[
            { title: 'Improves Traffic Flow', desc: 'AI analysis helps optimize signal timing to reduce congestion.' },
            { title: 'Supports Smart Cities', desc: 'Provides data-driven traffic management solutions.' },
            { title: 'Enhances Emergency Response', desc: 'Emergency vehicles receive priority signals.' },
            { title: 'Real-Time Visualization', desc: 'Traffic conditions can be monitored through the AI simulation dashboard.' }
          ].map((benefit, i) => (
            <div key={i} className="p-6">
              <div className="text-emerald-500 mb-4 flex justify-center">
                <CheckCircle2 size={32} />
              </div>
              <h4 className="text-white font-bold mb-2">{benefit.title}</h4>
              <p className="text-slate-500 text-sm">{benefit.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>

    {/* 11. Footer Section */}
    <footer className="bg-slate-900 border-t border-slate-800 pt-20 pb-10">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-8 mb-16">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center">
                <TrafficLightIcon className="text-white" size={18} />
              </div>
              <span className="text-lg font-bold text-white">SmartTraffic AI</span>
            </div>
            <p className="text-slate-500 text-sm max-w-xs">
              SmartTraffic AI: Real-Time Monitoring Traffic Video And Signal Optimization
            </p>
          </div>
          <div className="flex gap-12">
            <div>
              <h5 className="text-white font-bold mb-4 text-sm">Project</h5>
              <ul className="space-y-2 text-slate-500 text-sm">
                <li><a href="#problem" className="hover:text-emerald-500">Problem</a></li>
                <li><a href="#features" className="hover:text-emerald-500">Features</a></li>
                <li><a href="#tech" className="hover:text-emerald-500">Technology</a></li>
              </ul>
            </div>
            <div>
              <h5 className="text-white font-bold mb-4 text-sm">Institution</h5>
              <ul className="space-y-2 text-slate-500 text-sm">
                <li>UTeM</li>
                <li>FAIX</li>
              </ul>
            </div>
          </div>
        </div>
        
        <div className="pt-8 border-t border-slate-800 text-center">
          <p className="text-slate-500 text-xs">
            © 2026 Kenny Khow Jiun Xian | UTeM
          </p>
        </div>
      </div>
    </footer>
  </div>
  );
};
