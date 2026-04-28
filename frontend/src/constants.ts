import { TrafficData } from './types';

export const MOCK_TRAFFIC: TrafficData[] = [
  { lane: 'Lane A', count: 124, congestion: 'HIGH', timing: 45 },
  { lane: 'Lane B', count: 68, congestion: 'MEDIUM', timing: 30 },
  { lane: 'Lane C', count: 32, congestion: 'LOW', timing: 20 },
  { lane: 'Lane D', count: 45, congestion: 'LOW', timing: 25 },
];

export const ANALYTICS_DATA = [
  { name: '08:00', count: 450 },
  { name: '10:00', count: 320 },
  { name: '12:00', count: 280 },
  { name: '14:00', count: 310 },
  { name: '16:00', count: 520 },
  { name: '18:00', count: 640 },
  { name: '20:00', count: 380 },
];
