import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import type { Signal } from '@/types/domain'

const COLORS = ['#74b524', '#c9922e', '#2a3f66', '#abdd5e', '#df9a3c', '#5c749d']

export function SignalTypeChart({ signaux }: { signaux: Signal[] }) {
  const counts = new Map<string, number>()
  signaux.forEach((s) => counts.set(s.type_signal, (counts.get(s.type_signal) ?? 0) + 1))
  const data = [...counts.entries()].map(([name, value]) => ({ name, value }))

  if (data.length === 0) {
    return <p className="text-sm text-navy-400">Pas encore de signal à afficher.</p>
  }

  return (
    <div className="flex items-center gap-4">
      <div className="h-40 w-40 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={45} outerRadius={70} paddingAngle={3}>
              {data.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} stroke="none" />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ borderRadius: 8, border: '1px solid #eef1f6', fontSize: 12 }}
              formatter={(value, name) => [`${value}`, `${name}`] as [string, string]}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="space-y-1.5 text-xs">
        {data.map((d, i) => (
          <li key={d.name} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
            <span className="text-navy-600">{d.name}</span>
            <span className="ml-auto font-medium text-navy-800">{d.value}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
