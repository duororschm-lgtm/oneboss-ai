'use client';
import { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { money } from '../../lib/admin/format';
import type { RevenuePoint } from '../../lib/admin/types';

/**
 * Responsive SVG revenue chart with hover tooltips.
 * Replaces fixed-width stretched SVG with proper responsive scaling.
 * Shows confirmed, refunded, net, and order count (secondary axis).
 */

export function RevenueChart({ points }: { points: RevenuePoint[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const height = 260;
  const pad = { top: 16, right: 56, bottom: 36, left: 72 };

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.max(320, Math.floor(entry.contentRect.width));
        setWidth(w);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;

  const geometry = useMemo(() => {
    if (!points.length) return null;

    const maxMoney = Math.max(
      1,
      ...points.map((p) => Math.max(p.confirmedMinor, p.netMinor, p.refundedMinor)),
    );
    const maxOrders = Math.max(1, ...points.map((p) => p.orderCount));

    const x = (index: number) =>
      pad.left + (points.length === 1 ? plotWidth / 2 : (index / (points.length - 1)) * plotWidth);
    const yMoney = (value: number) => pad.top + plotHeight - (value / maxMoney) * plotHeight;
    const yOrders = (value: number) => pad.top + plotHeight - (value / maxOrders) * plotHeight;

    const line = (key: 'confirmedMinor' | 'netMinor' | 'refundedMinor') =>
      points
        .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${yMoney(p[key]).toFixed(1)}`)
        .join(' ');

    const area = `${line('confirmedMinor')} L${x(points.length - 1).toFixed(1)},${(
      pad.top + plotHeight
    ).toFixed(1)} L${x(0).toFixed(1)},${(pad.top + plotHeight).toFixed(1)} Z`;

    // Money Y-axis ticks (5 lines)
    const moneyTicks = Array.from({ length: 5 }, (_, i) => {
      const value = (maxMoney / 4) * i;
      return { value: Math.round(value), y: yMoney(value) };
    });

    // Order count right-axis ticks
    const orderTicks = Array.from({ length: 3 }, (_, i) => {
      const value = Math.round((maxOrders / 2) * i);
      return { value, y: yOrders(value) };
    });

    // X-axis date labels
    const labelEvery = Math.max(1, Math.ceil(points.length / 8));

    return {
      maxMoney,
      maxOrders,
      x,
      yMoney,
      yOrders,
      confirmedPath: line('confirmedMinor'),
      netPath: line('netMinor'),
      refundedPath: line('refundedMinor'),
      area,
      moneyTicks,
      orderTicks,
      labelEvery,
    };
  }, [points, plotWidth, plotHeight, pad]);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const svg = e.currentTarget;
      const rect = svg.getBoundingClientRect();
      const svgX = ((e.clientX - rect.left) / rect.width) * width;
      const relX = svgX - pad.left;
      const step = points.length > 1 ? plotWidth / (points.length - 1) : plotWidth;
      const idx = Math.round(relX / step);
      setHoverIdx(idx >= 0 && idx < points.length ? idx : null);
    },
    [width, pad.left, plotWidth, points.length],
  );

  if (!geometry) return null;

  const hoverPoint = hoverIdx !== null ? points[hoverIdx] : null;

  return (
    <div ref={containerRef} style={{ width: '100%', position: 'relative' }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{ width: '100%', height: 'auto', display: 'block' }}
        role="img"
        aria-label="收款趋势图"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverIdx(null)}
      >
        {/* Background grid */}
        {geometry.moneyTicks.map((tick) => (
          <g key={`grid-${tick.value}`}>
            <line
              x1={pad.left}
              x2={width - pad.right}
              y1={tick.y}
              y2={tick.y}
              stroke="#eef1f5"
              strokeWidth={1}
            />
            <text x={pad.left - 8} y={tick.y + 4} textAnchor="end" fontSize={11} fill="#8b949e">
              {money(tick.value)}
            </text>
          </g>
        ))}

        {/* Right axis: order count */}
        {geometry.orderTicks.map((tick) => (
          <text
            key={`order-${tick.value}`}
            x={width - pad.right + 8}
            y={tick.y + 4}
            textAnchor="start"
            fontSize={10}
            fill="#d97706"
          >
            {tick.value}
          </text>
        ))}
        <text
          x={width - pad.right + 8}
          y={pad.top - 4}
          textAnchor="start"
          fontSize={9}
          fill="#d97706"
        >
          订单
        </text>

        {/* Order count bars (behind lines) */}
        {points.map((p, i) => {
          const barWidth = Math.max(4, Math.min(16, plotWidth / points.length / 2));
          const barHeight = plotHeight - (geometry.yOrders(p.orderCount) - pad.top);
          return (
            <rect
              key={`bar-${p.date}`}
              x={geometry.x(i) - barWidth / 2}
              y={geometry.yOrders(p.orderCount)}
              width={barWidth}
              height={barHeight}
              fill="#d97706"
              opacity={0.12}
              rx={2}
            />
          );
        })}

        {/* Area fill */}
        <path d={geometry.area} fill="#2563eb" opacity={0.06} />

        {/* Confirmed revenue line */}
        <path
          d={geometry.confirmedPath}
          fill="none"
          stroke="#2563eb"
          strokeWidth={2.5}
          strokeLinecap="round"
        />

        {/* Refunded line (red, dashed) */}
        {points.some((p) => p.refundedMinor > 0) && (
          <path
            d={geometry.refundedPath}
            fill="none"
            stroke="#dc2626"
            strokeWidth={1.5}
            strokeDasharray="6 3"
            strokeLinecap="round"
          />
        )}

        {/* Net revenue line (green) */}
        <path
          d={geometry.netPath}
          fill="none"
          stroke="#16794a"
          strokeWidth={2}
          strokeDasharray="4 3"
          strokeLinecap="round"
        />

        {/* Data points */}
        {points.map((point, index) => (
          <g key={`point-${point.date}`}>
            <circle
              cx={geometry.x(index)}
              cy={geometry.yMoney(point.confirmedMinor)}
              r={hoverIdx === index ? 5 : 3}
              fill="#2563eb"
              stroke="#fff"
              strokeWidth={hoverIdx === index ? 2 : 1}
              style={{ cursor: 'pointer', transition: 'r 0.15s' }}
            />
            {point.refundedMinor > 0 && (
              <circle
                cx={geometry.x(index)}
                cy={geometry.yMoney(point.refundedMinor)}
                r={hoverIdx === index ? 4 : 2.5}
                fill="#dc2626"
                stroke="#fff"
                strokeWidth={1}
              />
            )}
          </g>
        ))}

        {/* Hover indicator line */}
        {hoverIdx !== null && (
          <line
            x1={geometry.x(hoverIdx)}
            x2={geometry.x(hoverIdx)}
            y1={pad.top}
            y2={pad.top + plotHeight}
            stroke="#cbd5e1"
            strokeWidth={1}
            strokeDasharray="3 3"
          />
        )}

        {/* X-axis date labels */}
        {points.map((point, index) =>
          index % geometry.labelEvery === 0 || index === points.length - 1 ? (
            <text
              key={`label-${point.date}`}
              x={geometry.x(index)}
              y={height - 10}
              textAnchor="middle"
              fontSize={11}
              fill={hoverIdx === index ? '#1e293b' : '#8b949e'}
            >
              {point.date.slice(5)}
            </text>
          ) : null,
        )}
      </svg>

      {/* Hover tooltip */}
      {hoverPoint && (
        <div
          style={{
            position: 'absolute',
            top: 8,
            left: Math.min(Math.max(geometry.x(hoverIdx!) - 110, 8), width - 228),
            width: 220,
            padding: '12px 16px',
            background: '#fff',
            borderRadius: 12,
            boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
            border: '1px solid #e5e7eb',
            fontSize: 13,
            pointerEvents: 'none',
            zIndex: 10,
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 8, color: '#1e293b' }}>{hoverPoint.date}</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ color: '#6b7280' }}>已确认到账</span>
            <strong style={{ color: '#2563eb' }}>{money(hoverPoint.confirmedMinor)}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ color: '#6b7280' }}>已成功退款</span>
            <strong style={{ color: '#dc2626' }}>{money(hoverPoint.refundedMinor)}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ color: '#6b7280' }}>净收款</span>
            <strong style={{ color: '#16794a' }}>{money(hoverPoint.netMinor)}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#6b7280' }}>订单数</span>
            <strong style={{ color: '#d97706' }}>{hoverPoint.orderCount}</strong>
          </div>
        </div>
      )}

      {/* Legend */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 16,
          justifyContent: 'center',
          marginTop: 8,
          fontSize: 12,
          color: '#6b7280',
        }}
      >
        <span>
          <i
            style={{
              display: 'inline-block',
              width: 12,
              height: 3,
              borderRadius: 2,
              background: '#2563eb',
              marginRight: 6,
              verticalAlign: 'middle',
            }}
          />
          已确认到账
        </span>
        <span>
          <i
            style={{
              display: 'inline-block',
              width: 12,
              height: 3,
              borderRadius: 2,
              background: '#16794a',
              marginRight: 6,
              verticalAlign: 'middle',
            }}
          />
          净收款
        </span>
        <span>
          <i
            style={{
              display: 'inline-block',
              width: 12,
              height: 3,
              borderRadius: 2,
              background: '#dc2626',
              marginRight: 6,
              verticalAlign: 'middle',
            }}
          />
          已成功退款
        </span>
        <span>
          <i
            style={{
              display: 'inline-block',
              width: 12,
              height: 10,
              borderRadius: 2,
              background: '#d97706',
              opacity: 0.2,
              marginRight: 6,
              verticalAlign: 'middle',
            }}
          />
          订单数
        </span>
      </div>
    </div>
  );
}
