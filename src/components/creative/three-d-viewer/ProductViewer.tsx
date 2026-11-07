'use client';
import { Suspense, useEffect, useRef, useState, useCallback } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Environment, ContactShadows, PerspectiveCamera } from '@react-three/drei';
import { ConceptChair, CHAIR_PARTS } from './ConceptChair';

type Props = {
  variant?: 'full-width-stage' | 'split-annotation' | 'immersive-section';
  palette?: { accent: string; surface: string; text: string };
  trustLabel?: string;
  height?: number;
};

function WebGLDetector({ children }: { children: React.ReactNode }) {
  const [supported, setSupported] = useState<boolean | null>(null);
  useEffect(() => {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      setSupported(!!gl);
    } catch {
      setSupported(false);
    }
  }, []);
  if (supported === null) return <div style={{ height: 400, background: '#f0f0f0', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span>检测 WebGL…</span></div>;
  if (!supported) return <WebGLFallback />;
  return <>{children}</>;
}

function WebGLFallback() {
  return (
    <div style={{ padding: 32, background: '#f5f5f5', borderRadius: 8, textAlign: 'center', border: '1px solid #ddd' }}>
      <svg width="120" height="90" viewBox="0 0 120 90" fill="none" stroke="#999" strokeWidth="1.5" style={{ marginBottom: 12 }}>
        <rect x="35" y="10" width="50" height="45" rx="4" />
        <line x1="35" y1="55" x2="35" y2="80" />
        <line x1="85" y1="55" x2="85" y2="80" />
        <line x1="35" y1="32" x2="85" y2="32" opacity="0.3" />
      </svg>
      <p style={{ color: '#666', fontSize: 14, lineHeight: 1.6 }}>
        您的浏览器不支持 WebGL，无法显示 3D 互动内容。<br />
        以下是概念结构示意 — <strong>非商家实拍</strong>。
      </p>
      <p style={{ color: '#999', fontSize: 12, marginTop: 8 }}>
        static_fallback · 概念结构示意
      </p>
    </div>
  );
}

function Scene({ explode, selectedPart, onSelectPart, palette }: {
  explode: number;
  selectedPart: string | null;
  onSelectPart: (id: string | null) => void;
  palette: { accent: string; surface: string; text: string };
}) {
  return (
    <>
      <PerspectiveCamera makeDefault position={[2.2, 1.8, 2.4]} fov={40} />
      <ambientLight intensity={0.6} />
      <directionalLight position={[4, 6, 4]} intensity={0.9} castShadow />
      <directionalLight position={[-3, 4, -2]} intensity={0.3} />
      <ConceptChair
        explode={explode}
        selectedPart={selectedPart}
        onSelectPart={onSelectPart}
        palette={palette}
      />
      <ContactShadows position={[0, -0.45, 0]} opacity={0.35} scale={5} blur={2.2} />
      <OrbitControls
        makeDefault
        enablePan={false}
        minDistance={1.8}
        maxDistance={7}
        maxPolarAngle={Math.PI / 1.8}
      />
    </>
  );
}

export default function ProductViewer({
  variant = 'full-width-stage',
  palette = { accent: '#b4552f', surface: '#fbf8f1', text: '#23241e' },
  trustLabel = 'conceptual_exploded · 概念结构示意 · 非商家实拍',
  height = 440,
}: Props) {
  const [explode, setExplode] = useState(0);
  const [selectedPart, setSelectedPart] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);

  const selected = CHAIR_PARTS.find((p) => p.id === selectedPart);

  return (
    <div style={{ display: 'flex', flexDirection: variant === 'split-annotation' ? 'row' : 'column', gap: 16 }}>
      {/* 3D Canvas */}
      <div style={{ flex: 1, minWidth: 0, borderRadius: 12, overflow: 'hidden', background: palette.surface, position: 'relative' }}>
        <WebGLDetector>
          <Canvas
            key={resetKey}
            shadows
            style={{ width: '100%', height }}
            gl={{ antialias: true, alpha: true }}
            onPointerMissed={() => setSelectedPart(null)}
          >
            <Suspense fallback={null}>
              <Scene
                explode={explode}
                selectedPart={selectedPart}
                onSelectPart={setSelectedPart}
                palette={palette}
              />
            </Suspense>
          </Canvas>
        </WebGLDetector>

        {/* Trust badge */}
        <div style={{
          position: 'absolute', top: 12, left: 12,
          background: 'rgba(0,0,0,0.55)', color: '#fff', fontSize: 11,
          padding: '4px 12px', borderRadius: 20, backdropFilter: 'blur(6px)',
        }}>
          {trustLabel}
        </div>

        {/* Reset button */}
        <button
          onClick={() => { setExplode(0); setSelectedPart(null); setResetKey(k => k + 1); }}
          style={{
            position: 'absolute', top: 12, right: 12,
            background: 'rgba(255,255,255,0.8)', border: '1px solid #ddd',
            borderRadius: 8, padding: '6px 14px', fontSize: 12, cursor: 'pointer',
          }}
        >
          重置视角
        </button>
      </div>

      {/* Controls */}
      <div style={{ width: variant === 'split-annotation' ? 260 : '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Explode slider */}
        <div>
          <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6, color: palette.text }}>
            拆解程度 {Math.round(explode * 100)}%
          </label>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={explode}
            onChange={(e) => setExplode(parseFloat(e.target.value))}
            style={{ width: '100%', accentColor: palette.accent }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#888', marginTop: 2 }}>
            <span>组装</span>
            <span>完全拆解</span>
          </div>
        </div>

        {/* Part list */}
        <div>
          <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6, color: palette.text }}>
            部件列表
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {CHAIR_PARTS.map((part) => (
              <button
                key={part.id}
                onClick={() => setSelectedPart(selectedPart === part.id ? null : part.id)}
                style={{
                  textAlign: 'left',
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: `1px solid ${selectedPart === part.id ? palette.accent : '#e0e0e0'}`,
                  background: selectedPart === part.id ? `${palette.accent}15` : '#fff',
                  cursor: 'pointer',
                  fontSize: 13,
                  color: palette.text,
                  fontWeight: selectedPart === part.id ? 600 : 400,
                }}
              >
                {part.label}
              </button>
            ))}
          </div>
        </div>

        {/* Selected part info */}
        {selected && (
          <div style={{
            padding: '12px 16px',
            background: `${palette.accent}10`,
            border: `1px solid ${palette.accent}30`,
            borderRadius: 8,
          }}>
            <strong style={{ fontSize: 13, color: palette.accent }}>{selected.label}</strong>
            <p style={{ fontSize: 12, color: '#666', marginTop: 4, lineHeight: 1.5 }}>
              概念结构部件 · 客户描述的 AI 概念拆解，非工程验证结构。
            </p>
          </div>
        )}

        <p style={{ fontSize: 11, color: '#999', lineHeight: 1.5 }}>
          💡 拖动旋转查看不同角度 · 滑块控制拆解程度 · 点击部件查看说明
        </p>
      </div>
    </div>
  );
}
