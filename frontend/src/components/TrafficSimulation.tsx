import React, { useEffect, useRef, useState } from 'react';

interface Vehicle {
  id: number;
  lane: string;
  pos: number;
  speed: number;
  color: string;
}

interface LaneConfig {
  id: string;
  name: string;
  greenTime: number;
  vehicleRate: number; // 0 to 1
}

const CANVAS_SIZE = 400;
const ROAD_WIDTH = 80;
const CENTER = CANVAS_SIZE / 2;

export const TrafficSimulation = ({ scenarioId }: { scenarioId: string }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const vehiclesRef = useRef<Vehicle[]>([]);
  const nextVehicleId = useRef(0);
  
  const [currentLaneIndex, setCurrentLaneIndex] = useState(0);
  const [timer, setTimer] = useState(10);
  
  const lanes: LaneConfig[] = [
    { id: 'Lane A', name: 'North', greenTime: 10, vehicleRate: 0.05 },
    { id: 'Lane B', name: 'East', greenTime: 10, vehicleRate: 0.05 },
    { id: 'Lane C', name: 'South', greenTime: 10, vehicleRate: 0.05 },
    { id: 'Lane D', name: 'West', greenTime: 10, vehicleRate: 0.05 },
  ];

  // Adjust lane configs based on scenario
  useEffect(() => {
    // Reset simulation on scenario change if needed
    // vehiclesRef.current = [];
  }, [scenarioId]);

  // Signal Logic
  useEffect(() => {
    const countdown = setInterval(() => {
      setTimer(prev => {
        if (prev <= 1) {
          setCurrentLaneIndex(curr => (curr + 1) % lanes.length);
          return 10; // Reset timer
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(countdown);
  }, []);

  // Animation Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;

    const getLaneState = (laneId: string) => {
      const activeLane = lanes[currentLaneIndex];
      if (activeLane.id === laneId) {
        return timer <= 2 ? 'yellow' : 'green';
      }
      return 'red';
    };

    const updateVehicles = () => {
      const vehicles = vehiclesRef.current;
      
      // Spawn vehicles randomly
      lanes.forEach(lane => {
        // Higher spawn rate for certain scenarios could be added here
        let spawnChance = 0.03;
        if (scenarioId === 'morning_rush' && (lane.id === 'Lane A' || lane.id === 'Lane D')) spawnChance = 0.08;
        if (scenarioId === 'holiday') spawnChance = 0.1;
        if (scenarioId === 'midnight') spawnChance = 0.01;

        if (Math.random() < spawnChance) {
          vehicles.push({
            id: nextVehicleId.current++,
            lane: lane.id,
            pos: -30,
            speed: 1.5 + Math.random() * 1.5,
            color: lane.id === 'Lane A' ? '#33b5e5' : lane.id === 'Lane B' ? '#ffbb33' : lane.id === 'Lane C' ? '#aa66cc' : '#00d4aa'
          });
        }
      });

      // Move vehicles
      vehiclesRef.current = vehicles.filter(v => {
        const state = getLaneState(v.lane);
        const stopLine = CENTER - ROAD_WIDTH / 2 - 20;
        
        let shouldStop = false;
        if (state === 'red' || state === 'yellow') {
          if (v.pos < stopLine && v.pos + v.speed >= stopLine) {
            shouldStop = true;
          }
        }

        // Collision avoidance
        const ahead = vehicles.find(other => other.lane === v.lane && other.pos > v.pos && other.pos < v.pos + 30);
        if (ahead) shouldStop = true;

        if (!shouldStop) {
          v.pos += v.speed;
        }

        return v.pos < CANVAS_SIZE + 50;
      });
    };

    const draw = () => {
      ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
      
      // Background
      ctx.fillStyle = '#0a0e14';
      ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

      // Roads
      ctx.fillStyle = '#1a1f26';
      ctx.fillRect(CENTER - ROAD_WIDTH / 2, 0, ROAD_WIDTH, CANVAS_SIZE);
      ctx.fillRect(0, CENTER - ROAD_WIDTH / 2, CANVAS_SIZE, ROAD_WIDTH);

      // Markings
      ctx.strokeStyle = '#2d333b';
      ctx.setLineDash([10, 10]);
      ctx.beginPath();
      ctx.moveTo(CENTER, 0); ctx.lineTo(CENTER, CANVAS_SIZE);
      ctx.moveTo(0, CENTER); ctx.lineTo(CANVAS_SIZE, CENTER);
      ctx.stroke();
      ctx.setLineDash([]);

      // Traffic Lights
      const drawLight = (x: number, y: number, laneId: string) => {
        const state = getLaneState(laneId);
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, Math.PI * 2);
        ctx.fillStyle = '#1a1f26';
        ctx.fill();
        
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fillStyle = state === 'red' ? '#ff4444' : state === 'yellow' ? '#ffbb33' : '#00d4aa';
        ctx.shadowBlur = 8;
        ctx.shadowColor = ctx.fillStyle;
        ctx.fill();
        ctx.shadowBlur = 0;
      };

      drawLight(CENTER + ROAD_WIDTH / 2 + 10, CENTER - ROAD_WIDTH / 2 - 10, 'Lane A');
      drawLight(CENTER + ROAD_WIDTH / 2 + 10, CENTER + ROAD_WIDTH / 2 + 10, 'Lane B');
      drawLight(CENTER - ROAD_WIDTH / 2 - 10, CENTER + ROAD_WIDTH / 2 + 10, 'Lane C');
      drawLight(CENTER - ROAD_WIDTH / 2 - 10, CENTER - ROAD_WIDTH / 2 - 10, 'Lane D');

      // Vehicles
      updateVehicles();
      vehiclesRef.current.forEach(v => {
        ctx.fillStyle = v.color;
        ctx.shadowBlur = 4;
        ctx.shadowColor = v.color;
        
        let x = 0, y = 0, w = 10, h = 18;
        if (v.lane === 'Lane A') {
          x = CENTER - ROAD_WIDTH / 4 - 5;
          y = v.pos;
        } else if (v.lane === 'Lane C') {
          x = CENTER + ROAD_WIDTH / 4 - 5;
          y = CANVAS_SIZE - v.pos - 18;
        } else if (v.lane === 'Lane B') {
          x = CANVAS_SIZE - v.pos - 18;
          y = CENTER - ROAD_WIDTH / 4 - 5;
          w = 18; h = 10;
        } else if (v.lane === 'Lane D') {
          x = v.pos;
          y = CENTER + ROAD_WIDTH / 4 - 5;
          w = 18; h = 10;
        }
        ctx.fillRect(x, y, w, h);
        ctx.shadowBlur = 0;
      });

      animationFrameId = requestAnimationFrame(draw);
    };

    animationFrameId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animationFrameId);
  }, [currentLaneIndex, timer, scenarioId]);

  return (
    <canvas 
      ref={canvasRef} 
      width={CANVAS_SIZE} 
      height={CANVAS_SIZE}
      className="w-full h-full"
    />
  );
};
