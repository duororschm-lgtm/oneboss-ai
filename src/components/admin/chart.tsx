'use client';
import { useMemo } from 'react';
import { money } from '../../lib/admin/format';
import type { RevenuePoint } from '../../lib/admin/types';

/**
 * 内联 SVG 折线图。
 * 项目当前没有图表依赖，按"先复用再新增"原则不引入 Recharts，
 * 避免为一个页面新增整套依赖树。数据必须来自后端接口。
 */
export function RevenueChart({ points }: { points: RevenuePoint[] }) {
  const width = 720;
  const height = 220;
  const pad = { top: 12, right: 12, bottom: 26, left: 62 };
  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;

  const geometry = useMemo(() => {
    if (!points.length) return null;
    const max = Math.max(1, ...points.flatMap((p) => [p.confirmedMinor,p.netMinor]));
    const min = Math.min(0, ...points.map((p) => p.netMinor));
    const x = (index: number) =>
      pad.left + (points.length === 1 ? plotWidth / 2 : (index / (points.length - 1)) * plotWidth);
    const y = (value: number) => pad.top + plotHeight - ((value - min) / (max - min)) * plotHeight;

    const line = (key: 'confirmedMinor' | 'netMinor') =>
      points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p[key]).toFixed(1)}`).join(' ');

    const area = `${line('confirmedMinor')} L${x(points.length - 1).toFixed(1)},${(
      y(0)
    ).toFixed(1)} L${x(0).toFixed(1)},${y(0).toFixed(1)} Z`;

    const ticks = Array.from({ length: 4 }, (_, i) => {
      const value = min + ((max - min) / 3) * i;
      return { value, y: y(value) };
    });

    return { max, x, y, confirmedPath: line('confirmedMinor'), netPath: line('netMinor'), area, ticks };
  }, [points, plotWidth, plotHeight]);

  if (!geometry) return null;

  const labelEvery = Math.max(1, Math.ceil(points.length / 6));

  return (
    <>
      <svg
        className="ad-chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="收款趋势图"
        preserveAspectRatio="none"
      >
        {geometry.ticks.map((tick) => (
          <g key={tick.value}>
            <line
              x1={pad.left}
              x2={width - pad.right}
              y1={tick.y}
              y2={tick.y}
              stroke="#eef1f5"
              strokeWidth={1}
            />
            <text x={pad.left - 8} y={tick.y + 4} textAnchor="end" fontSize={10} fill="#8b949e">
              {money(Math.round(tick.value))}
            </text>
          </g>
        ))}

        <path d={geometry.area} fill="#2563eb" opacity={0.07} />
        <path d={geometry.confirmedPath} fill="none" stroke="#2563eb" strokeWidth={2} />
        <path
          d={geometry.netPath}
          fill="none"
          stroke="#16794a"
          strokeWidth={1.6}
          strokeDasharray="4 3"
        />

        {points.map((point, index) => (
          <circle
            key={point.date}
            cx={geometry.x(index)}
            cy={geometry.y(point.confirmedMinor)}
            r={2.4}
            fill="#2563eb"
          >
            <title>
              {point.date} · 到账 {money(point.confirmedMinor)} · 退款 {money(point.refundedMinor)}
            </title>
          </circle>
        ))}

        {points.map((point, index) =>
          index % labelEvery === 0 || index === points.length - 1 ? (
            <text
              key={`label-${point.date}`}
              x={geometry.x(index)}
              y={height - 8}
              textAnchor="middle"
              fontSize={10}
              fill="#8b949e"
            >
              {point.date.slice(5)}
            </text>
          ) : null,
        )}
      </svg>
      <div className="ad-chart-legend">
        <span>
          <i className="ad-legend-dot" style={{ background: '#2563eb' }} />
          已确认到账
        </span>
        <span>
          <i className="ad-legend-dot" style={{ background: '#16794a' }} />
          净收款（扣除已成功退款）
        </span>
      </div>
    </>
  );
}
