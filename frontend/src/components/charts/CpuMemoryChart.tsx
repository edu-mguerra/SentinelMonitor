'use client';

import React from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { ServerMetric } from '@/types/server';
import { formatTimeBR } from '@/lib/date';

interface CpuMemoryChartProps {
  metrics: ServerMetric[];
}

export function CpuMemoryChart({ metrics }: CpuMemoryChartProps) {

  const data = [...metrics]
    .reverse()
    .map((m) => {
      const timeStr = formatTimeBR(m.recorded_at);
      return {
        time: timeStr,
        cpu: m.cpu_percent,
        ram: m.ram_percent,
      };
    });

  if (data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-sm text-slate-500 border border-dashed border-slate-800 rounded-xl">
        Nenhum dado de métrica registrado ainda.
      </div>
    );
  }

  return (
    <div className="w-full h-72">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="cpuGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.0} />
            </linearGradient>
            <linearGradient id="ramGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
              <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis dataKey="time" stroke="#64748b" fontSize={11} tickLine={false} />
          <YAxis domain={[0, 100]} stroke="#64748b" fontSize={11} tickLine={false} tickFormatter={(val) => `${val}%`} />
          <Tooltip
            contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '0.75rem', fontSize: '12px' }}
            formatter={(value: any, name: any) => [`${value}%`, name === 'cpu' ? 'CPU' : 'Memória RAM']}
          />
          <Legend
            verticalAlign="top"
            height={36}
            formatter={(value) => (value === 'cpu' ? 'Uso de CPU (%)' : 'Uso de Memória RAM (%)')}
          />
          <Area type="monotone" dataKey="cpu" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#cpuGradient)" />
          <Area type="monotone" dataKey="ram" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#ramGradient)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
