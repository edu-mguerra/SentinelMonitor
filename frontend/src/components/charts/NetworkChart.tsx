'use client';

import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { ServerMetric } from '@/types/server';
import { formatTimeBR } from '@/lib/date';

interface NetworkChartProps {
  metrics: ServerMetric[];
}

export function NetworkChart({ metrics }: NetworkChartProps) {
  const data = [...metrics]
    .reverse()
    .map((m) => {
      const timeStr = formatTimeBR(m.recorded_at);
      return {
        time: timeStr,
        recv: m.network_data?.rate_recv_kbps || 0,
        sent: m.network_data?.rate_sent_kbps || 0,
      };
    });

  if (data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-sm text-slate-500 border border-dashed border-slate-800 rounded-xl">
        Nenhum dado de tráfego de rede registrado ainda.
      </div>
    );
  }

  return (
    <div className="w-full h-72">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis dataKey="time" stroke="#64748b" fontSize={11} tickLine={false} />
          <YAxis stroke="#64748b" fontSize={11} tickLine={false} tickFormatter={(val) => `${val} KB/s`} />
          <Tooltip
            contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '0.75rem', fontSize: '12px' }}
            formatter={(value: any, name: any) => [`${value} KB/s`, name === 'recv' ? 'Download (Entrada)' : 'Upload (Saída)']}
          />
          <Legend
            verticalAlign="top"
            height={36}
            formatter={(value) => (value === 'recv' ? 'Download (KB/s)' : 'Upload (KB/s)')}
          />
          <Line type="monotone" dataKey="recv" stroke="#06b6d4" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="sent" stroke="#a855f7" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
