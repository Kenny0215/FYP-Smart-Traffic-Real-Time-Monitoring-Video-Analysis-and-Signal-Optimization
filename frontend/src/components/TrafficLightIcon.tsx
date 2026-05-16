import React from 'react';

export const TrafficLightIcon = ({ size = 24, className = "", colorized = false }: { size?: number, className?: string, colorized?: boolean }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    className={className}
  >
    <rect x="9" y="2" width="6" height="20" rx="1" />
    <circle cx="12" cy="7" r="2" fill={colorized ? "#ff4444" : "currentColor"} stroke={colorized ? "none" : "currentColor"} />
    <circle cx="12" cy="12" r="2" fill={colorized ? "#ffbb33" : "currentColor"} stroke={colorized ? "none" : "currentColor"} />
    <circle cx="12" cy="17" r="2" fill={colorized ? "#00d4aa" : "currentColor"} stroke={colorized ? "none" : "currentColor"} />
  </svg>
);
