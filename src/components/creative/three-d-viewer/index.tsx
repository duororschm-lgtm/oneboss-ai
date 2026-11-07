'use client';
import dynamic from 'next/dynamic';

/**
 * Lazy-loaded 3D product viewer.
 * R3F / Three.js must never run in SSR — this ensures client-only loading.
 */
export const LazyProductViewer = dynamic(
  () => import('./ProductViewer'),
  {
    ssr: false,
    loading: () => (
      <div
        style={{
          height: 440,
          background: '#f0f0f0',
          borderRadius: 12,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#888',
          fontSize: 14,
        }}
      >
        3D 内容加载中…
      </div>
    ),
  },
);
