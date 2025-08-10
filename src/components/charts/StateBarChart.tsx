import React from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from "recharts";
import type { ResiduePrediction } from "../ProteinPredictor";

const state8Order = ["H", "G", "I", "E", "B", "T", "S", "C"] as const;
const state3Order = ["H", "E", "C"] as const;

const stateNames = {
  "H": "α-helix",
  "G": "3₁₀-helix",
  "I": "π-helix",
  "E": "β-strand",
  "B": "β-bridge",
  "T": "turn",
  "S": "bend",
  "C": "coil"
} as const;

type Props = {
  data: ResiduePrediction[];
  mode: "8" | "3";
  hoveredIndex?: number | null;
};

function colorForState(s: string): string {
  switch (s) {
    case "H":
      return `hsl(var(--ss-h))`;
    case "G":
      return `hsl(var(--ss-g))`;
    case "I":
      return `hsl(var(--ss-i))`;
    case "E":
      return `hsl(var(--ss-e))`;
    case "B":
      return `hsl(var(--ss-b))`;
    case "T":
      return `hsl(var(--ss-t))`;
    case "S":
      return `hsl(var(--ss-s))`;
    default:
      return `hsl(var(--ss-c))`;
  }
}

export default function StateBarChart({ data, mode, hoveredIndex }: Props) {
  const chartData = data.map((d) => ({
    index: d.index,
    state: mode === "8" ? d.state8 : d.state3,
    value: 1,
    isHovered: hoveredIndex === d.index,
  }));

  return (
    <div className="w-full h-14">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
          <XAxis dataKey="index" tick={false} axisLine={false} label={{ value: "Residue", position: "insideLeft" }} />
          <YAxis hide domain={[0, 1]} />
          <Tooltip
            cursor={{ fill: "hsl(var(--muted) / 0.3)" as any }}
            formatter={(val: any, _name: any, p: any) => [p.payload.state, "State"]}
            labelFormatter={(l) => `Residue ${l}`}
          />
          <Bar dataKey="value" isAnimationActive={false}>
            {chartData.map((entry, index) => (
              <Cell 
                key={`cell-${index}`} 
                fill={colorForState(entry.state)} 
                opacity={entry.isHovered ? 1 : hoveredIndex ? 0.3 : 1}
                stroke={entry.isHovered ? "hsl(var(--foreground))" : "none"}
                strokeWidth={entry.isHovered ? 2 : 0}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
        {(mode === "8" ? state8Order : state3Order).map((s) => (
          <span key={s} className="inline-flex items-center gap-2">
            <span
              aria-hidden
              style={{ backgroundColor: colorForState(s) }}
              className="inline-block size-3 rounded-sm border"
            />
            {stateNames[s as keyof typeof stateNames]} ({s})
          </span>
        ))}
      </div>
    </div>
  );
}
