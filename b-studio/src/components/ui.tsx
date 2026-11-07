import { useState, type ReactNode } from 'react';
import { Check, CheckCircle2, Clipboard, Info, Loader2, TriangleAlert } from 'lucide-react';

export function Badge({ tone = 'neutral', children }: { tone?: 'neutral' | 'good' | 'warn' | 'accent' | 'dark'; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function Notice({
  tone = 'info',
  title,
  children,
}: {
  tone?: 'info' | 'warn' | 'good' | 'error';
  title?: string;
  children?: ReactNode;
}) {
  const Icon = tone === 'good' ? CheckCircle2 : tone === 'warn' || tone === 'error' ? TriangleAlert : Info;
  return (
    <div className={`notice notice-${tone}`} role={tone === 'error' ? 'alert' : undefined}>
      <Icon size={18} />
      <div>
        {title && <strong>{title}</strong>}
        {children && <div className="notice-body">{children}</div>}
      </div>
    </div>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="section-heading">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="section-heading-actions">{actions}</div>}
    </div>
  );
}

export function Spinner({ label = '加载中' }: { label?: string }) {
  return (
    <span className="spinner" role="status">
      <Loader2 size={18} className="spin" /> {label}
    </span>
  );
}

export function DemoBanner({ children }: { children: ReactNode }) {
  return (
    <div className="demo-banner" role="note">
      <strong>DEMO</strong>
      <span>{children}</span>
    </div>
  );
}

export function Metric({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
      {note && <small>{note}</small>}
    </div>
  );
}

export function CopyButton({ text, label = '复制文案', className = 'button ghost' }: { text: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const area = document.createElement('textarea');
      area.value = text;
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      area.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };
  return (
    <button type="button" className={className} onClick={copy}>
      {copied ? <Check size={16} /> : <Clipboard size={16} />}
      {copied ? '已复制' : label}
    </button>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <h3>{title}</h3>
      <p>{body}</p>
      {action}
    </div>
  );
}

export function formatDateTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Shanghai',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}
