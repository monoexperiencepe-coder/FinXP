import {
  Bar,
  BarChart,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Text, View } from 'react-native';

import type { FlowBarRow } from './chartTypes';

const TOOLTIP = {
  contentStyle: {
    backgroundColor: '#141414',
    border: '1px solid #2a2a2a',
    borderRadius: 8,
    color: '#fff',
  },
  labelStyle: { color: '#ccc' },
  itemStyle: { color: '#fff' },
} as const;

function fmtY(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(0)}k`;
  return String(Math.round(n));
}

export function ResumenBarFlowChart({ data }: { data: FlowBarRow[] }) {
  return (
    <View style={{ width: '100%', height: 240 }}>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ left: 0, right: 4, top: 8, bottom: 0 }}>
          <XAxis dataKey="label" tick={{ fill: '#ccc', fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis
            tick={{ fill: '#888', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            width={44}
            tickFormatter={fmtY}
          />
          <Tooltip {...TOOLTIP} cursor={{ fill: 'transparent' }} />
          <Bar dataKey="ingresos" fill="#00D96D" radius={[3, 3, 0, 0]} maxBarSize={22} name="Ingresos" />
          <Bar dataKey="variables" fill="#FF4444" radius={[3, 3, 0, 0]} maxBarSize={22} name="Variables" />
          <Bar dataKey="fijos" fill="#FF9F1C" radius={[3, 3, 0, 0]} maxBarSize={22} name="Fijos" />
        </BarChart>
      </ResponsiveContainer>
    </View>
  );
}

export function ResumenDonutCategories({
  data,
  centerValue,
}: {
  data: { label: string; value: number; color: string }[];
  centerValue: string;
}) {
  return (
    <View style={{ width: '100%', height: 240, position: 'relative' }}>
      <ResponsiveContainer width="100%" height={240}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="label"
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={90}
            paddingAngle={2}>
            {data.map((d) => (
              <Cell key={d.label} fill={d.color} stroke="transparent" />
            ))}
          </Pie>
          <Tooltip {...TOOLTIP} />
        </PieChart>
      </ResponsiveContainer>
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 0,
          bottom: 0,
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none',
        }}>
        <Text style={{ fontSize: 11, color: '#888' }}>Total mes</Text>
        <Text style={{ fontSize: 18, fontWeight: '700', color: '#fff', marginTop: 2 }}>{centerValue}</Text>
      </View>
    </View>
  );
}

export function ResumenLineIncomes({ data }: { data: { label: string; value: number }[] }) {
  return (
    <View style={{ width: '100%', height: 220 }}>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ left: 0, right: 4, top: 8, bottom: 0 }}>
          <XAxis dataKey="label" tick={{ fill: '#ccc', fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis
            tick={{ fill: '#888', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            width={44}
            tickFormatter={fmtY}
          />
          <Tooltip {...TOOLTIP} cursor={{ stroke: '#333', strokeWidth: 1 }} />
          <Line
            type="monotone"
            dataKey="value"
            stroke="#00D96D"
            strokeWidth={2}
            dot={{ r: 4, fill: '#00D96D' }}
            activeDot={{ r: 5, fill: '#00D96D' }}
          />
        </LineChart>
      </ResponsiveContainer>
    </View>
  );
}

/** Barras horizontales: promedio por estado de ánimo. */
export function ResumenBarMoodHorizontal({
  data,
}: {
  data: { name: string; avg: number }[];
}) {
  const h = Math.max(200, data.length * 44 + 48);
  return (
    <View style={{ width: '100%', height: h }}>
      <ResponsiveContainer width="100%" height={h}>
        <BarChart layout="vertical" data={data} margin={{ left: 8, right: 16, top: 8, bottom: 8 }}>
          <XAxis type="number" tick={{ fill: '#888', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={fmtY} />
          <YAxis
            type="category"
            dataKey="name"
            width={100}
            tick={{ fill: '#ddd', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip {...TOOLTIP} cursor={{ fill: 'rgba(255,255,255,0.06)' }} />
          <Bar dataKey="avg" fill="#00D96D" radius={[0, 4, 4, 0]} maxBarSize={18} name="Promedio" />
        </BarChart>
      </ResponsiveContainer>
    </View>
  );
}
