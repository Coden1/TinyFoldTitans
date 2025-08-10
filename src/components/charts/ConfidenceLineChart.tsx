import React from "react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip } from "recharts";
import type { ResiduePrediction } from "../ProteinPredictor";

type Props = {
  data: ResiduePrediction[];
  onHover?: (index: number | null) => void;
  onLeave?: () => void;
};

export default function ConfidenceLineChart({ data, onHover, onLeave }: Props) {
  const chartData = data.map((d) => ({
    index: d.index,
    conf: d.conf8,
  }));

  const handleMouseMove = (state: any) => {
    if (state && state.activePayload && state.activePayload[0]) {
      const index = state.activePayload[0].payload.index;
      onHover?.(index);
    }
  };

  const handleMouseLeave = () => {
    onLeave?.();
  };

  return (
    <div className="w-full h-56">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart 
          data={chartData} 
          margin={{ top: 4, right: 8, bottom: 0, left: 8 }}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          <XAxis dataKey="index" tick={false} axisLine={false} label={{ value: "Residue", position: "insideLeft" }} />
          <YAxis domain={[0, 1]} tickFormatter={(v) => v.toFixed(1)} />
          <Tooltip labelFormatter={(l) => `Residue ${l}`} formatter={(v: any) => [v.toFixed(3), "Confidence"]} />
          <Line type="monotone" dataKey="conf" stroke="hsl(var(--primary))" dot={false} strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
