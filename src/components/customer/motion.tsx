'use client';

/**
 * 零依赖的指针交互组件（Awwwards 层的「手感」部分）。
 *
 * 为什么不引 Framer Motion / Three.js：
 *  - 项目跑在 Render Free 实例，Dockerfile 严格控包
 *  - 375px 是验收宽度，3D 场景是负优化
 *  - 这两个效果本身只需要 transform，动 20 行能解决的事不该引 50KB
 *
 * 纪律：
 *  - 每个用 hook 的效果都是独立组件（不能写在工具函数里，会违反 rules-of-hooks）
 *  - prefers-reduced-motion 下一律 no-op，不产生任何位移
 *  - pointer-events 只在 pointerType === 'mouse' 时响应，避免触屏误触发
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);
  return reduced;
}

/** 磁吸按钮：指针靠近时向指针偏移，离开时弹回（回弹交给 CSS transition）。 */
export function Magnetic({
  children,
  strength = 0.32,
  className,
  style,
}: {
  children: ReactNode;
  /** 0–1，越大越黏。0.3 左右是「有手感」和「点不准」的分界。 */
  strength?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduced = useReducedMotion();

  const onMove = useCallback(
    (event: React.PointerEvent<HTMLSpanElement>) => {
      if (reduced || event.pointerType !== 'mouse') return;
      const node = ref.current;
      if (!node) return;
      const rect = node.getBoundingClientRect();
      const dx = event.clientX - (rect.left + rect.width / 2);
      const dy = event.clientY - (rect.top + rect.height / 2);
      node.style.transform = `translate3d(${dx * strength}px, ${dy * strength}px, 0)`;
    },
    [reduced, strength],
  );

  const onLeave = useCallback(() => {
    const node = ref.current;
    if (node) node.style.transform = 'translate3d(0, 0, 0)';
  }, []);

  return (
    <span
      ref={ref}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      className={className}
      style={{
        display: 'inline-flex',
        transition: 'transform 0.55s cubic-bezier(0.16, 1, 0.3, 1)',
        willChange: 'transform',
        ...style,
      }}
    >
      {children}
    </span>
  );
}

/** 3D 倾斜卡片：指针位置驱动 rotateX/rotateY，离开归位。 */
export function Tilt({
  children,
  max = 6,
  className,
  style,
}: {
  children: ReactNode;
  /** 最大倾角（度）。超过 8 度就开始像玩具。 */
  max?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  const onMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (reduced || event.pointerType !== 'mouse') return;
      const node = ref.current;
      if (!node) return;
      const rect = node.getBoundingClientRect();
      const px = (event.clientX - rect.left) / rect.width - 0.5;
      const py = (event.clientY - rect.top) / rect.height - 0.5;
      node.style.transform = `perspective(900px) rotateX(${-py * max * 2}deg) rotateY(${px * max * 2}deg)`;
    },
    [reduced, max],
  );

  const onLeave = useCallback(() => {
    const node = ref.current;
    if (node) node.style.transform = 'perspective(900px) rotateX(0deg) rotateY(0deg)';
  }, []);

  return (
    <div
      ref={ref}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      className={className}
      style={{
        transformStyle: 'preserve-3d',
        transition: 'transform 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
        willChange: 'transform',
        ...style,
      }}
    >
      {children}
    </div>
  );
}
