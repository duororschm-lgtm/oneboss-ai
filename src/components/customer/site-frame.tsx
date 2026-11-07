'use client';
import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { SiteRenderer } from '../../vendor/creative-b/components/site-renderer/SiteRenderer';
import type { mapSite } from '../../lib/creative/b-mapping';

/** An actual frame viewport isolates renderer styles and makes the mobile preview responsive. */
export function SiteFrame({
  mapped,
  width,
  title = '私有网站预览',
  height = 900,
}: {
  mapped: ReturnType<typeof mapSite>;
  width: number | string;
  title?: string;
  height?: number;
}) {
  const ref = useRef<HTMLIFrameElement>(null),
    [target, setTarget] = useState<HTMLElement>();
  useEffect(() => {
    const iframe = ref.current;
    if (!iframe) return;
    const initialize = () => {
      const doc = iframe.contentDocument;
      if (!doc) return;
      doc.documentElement.lang = 'zh-CN';
      doc.body.style.margin = '0';
      doc.head.replaceChildren(
        ...Array.from(document.head.querySelectorAll('link[rel="stylesheet"],style')).map((node) =>
          node.cloneNode(true),
        ),
      );
      setTarget(doc.body);
    };
    initialize();
    iframe.addEventListener('load', initialize);
    return () => iframe.removeEventListener('load', initialize);
  }, []);
  return (
    <div className="ob-preview-frame" style={{ width }}>
      <iframe
        ref={ref}
        title={title}
        sandbox="allow-same-origin"
        style={{ width: '100%', height, border: 0, display: 'block', background: 'white' }}
      />
      {target &&
        createPortal(
          <SiteRenderer
            spec={mapped.spec}
            designSystem={mapped.design}
            seed={mapped.seed}
            mode="preview"
          />,
          target,
        )}
    </div>
  );
}
