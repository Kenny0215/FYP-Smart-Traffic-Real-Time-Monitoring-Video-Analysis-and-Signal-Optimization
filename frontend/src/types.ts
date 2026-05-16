export type Page = 'landing' | 'login' |'dashboard' | 'upload' | 'analytics' | 'simulation' | 'chat' | 'admin' |'feedback';

export interface TrafficData {
  lane: string;
  count: number;
  congestion: 'LOW' | 'MEDIUM' | 'HIGH';
  timing: number;
}

export interface LaneStats {
  lane: string;
  vehicle_count: number;
  congestion: string;
  ai_green_time: number;
  priority: string;
  avg_speed: number;
  timestamp: string;
}

export interface EmergencyAlert {
  id: string;
  type: 'ambulance' | 'fire truck' | 'police';
  lane: string;
  timestamp: string;
}

export interface PerformanceSummary {
  efficiency_improvement: string;
  cycle_time_reduction: string;
  green_time_saved: string;
}

export interface ComparisonData {
  lane: string;
  avg_vehicles: number;
  congestion: 'Low' | 'Medium' | 'High';
  traditional_green: number;
  ai_green: number;
  ideal_green: number;
  traditional_efficiency: string;
  ai_efficiency: string;
  improvement: string;
  traditional_wait: number;
  ai_wait: number;
}
