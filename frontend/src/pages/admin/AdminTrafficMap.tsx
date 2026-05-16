import React from 'react';
import { MapPin } from 'lucide-react';

export const AdminTrafficMap = () => (
  <div className="space-y-4">
    <div>
      <h1 className="text-2xl font-bold text-white">Live Traffic Map</h1>
      <p className="text-slate-400 text-sm mt-1">Google Maps + AI congestion overlay</p>
    </div>
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-10 flex flex-col items-center justify-center text-center gap-3">
      <div className="w-14 h-14 bg-slate-800 rounded-full flex items-center justify-center">
        <MapPin size={24} className="text-slate-500" />
      </div>
      <p className="text-white font-semibold">Google Maps integration coming Day 12</p>
      <p className="text-slate-500 text-sm max-w-sm">
        Will show lane markers color-coded by congestion level,
        toggle between AI data and Google's live traffic layer.
      </p>
    </div>
  </div>
);