'use client';

/**
 * Tiny dependency-free SVG sparkline. Renders an area+line for a small series.
 * Much lighter than a Recharts instance when we need many of them.
 */
export function Sparkline({
  data, width = 96, height = 30, stroke = 'rgb(var(--brand))', fill = 'rgb(var(--brand) / 0.16)', strokeWidth = 1.75,
}: {
  data: number[];
  width?: number;
  height?: number;
  stroke?: string;
  fill?: string;
  strokeWidth?: number;
}) {
  const pts = data.length ? data : [0, 0];
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const span = max - min || 1;
  const dx = pts.length > 1 ? width / (pts.length - 1) : width;
  const pad = strokeWidth + 1;
  const y = (v: number) => height - pad - ((v - min) / span) * (height - pad * 2);
  const coords = pts.map((v, i) => [i * dx, y(v)] as const);
  const line = coords.map(([x, yy], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${yy.toFixed(1)}`).join(' ');
  const area = `${line} L${width},${height} L0,${height} Z`;
  const [lastX, lastY] = coords[coords.length - 1];

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible" aria-hidden>
      <path d={area} fill={fill} stroke="none" />
      <path d={line} fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lastX} cy={lastY} r={strokeWidth + 0.5} fill={stroke} />
    </svg>
  );
}
