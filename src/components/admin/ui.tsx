'use client';
import { useEffect, useRef, type ReactNode } from 'react';
import type { Tone } from '../../lib/admin/format';

export function PageHead({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="ad-page-head">
      <div>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="ad-page-actions">{actions}</div>}
    </div>
  );
}

export function Card({
  title,
  subtitle,
  actions,
  children,
  padding = true,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  padding?: boolean;
}) {
  return (
    <section className="ad-card">
      {(title || actions) && (
        <div className="ad-card-head">
          <div>
            <h3>{title}</h3>
            {subtitle && <div className="ad-sub">{subtitle}</div>}
          </div>
          {actions && <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>{actions}</div>}
        </div>
      )}
      {padding ? <div className="ad-card-body">{children}</div> : children}
    </section>
  );
}

export function MetricCard({
  label,
  value,
  note,
  unsupported,
  tone,
}: {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  unsupported?: ReactNode;
  tone?: Tone;
}) {
  return (
    <div className="ad-metric" data-state={unsupported ? 'unsupported' : 'ready'}>
      <span className="ad-metric-label">{label}</span>
      <span
        className="ad-metric-value"
        style={tone === 'danger' ? { color: 'var(--ad-danger)' } : undefined}
      >
        {unsupported ?? value}
      </span>
      {note && <span className="ad-metric-note">{note}</span>}
    </div>
  );
}

export function StatusBadge({ label, tone }: { label: ReactNode; tone: Tone }) {
  return (
    <span className="ad-badge" data-tone={tone}>
      {label}
    </span>
  );
}

export interface Column<T> {
  key: string;
  header: ReactNode;
  align?: 'left' | 'right';
  width?: string;
  render: (row: T) => ReactNode;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  caption,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  caption?: string;
}) {
  return (
    <div className="ad-table-wrap">
      <table className="ad-table">
        {caption && <caption className="ad-visually-hidden">{caption}</caption>}
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                style={column.width ? { width: column.width } : undefined}
                className={column.align === 'right' ? 'ad-num' : undefined}
                scope="col"
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              style={onRowClick ? { cursor: 'pointer' } : undefined}
            >
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={column.align === 'right' ? 'ad-num' : undefined}
                >
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Pagination({
  page,
  pageSize,
  total,
  onChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 18px',
        borderTop: '1px solid var(--ad-border)',
        fontSize: 12.5,
        color: 'var(--ad-muted)',
      }}
    >
      <span>
        共 {total} 条 · 第 {page} / {pages} 页
      </span>
      <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
        <button
          className="ad-btn"
          data-size="sm"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
        >
          上一页
        </button>
        <button
          className="ad-btn"
          data-size="sm"
          disabled={page >= pages}
          onClick={() => onChange(page + 1)}
        >
          下一页
        </button>
      </div>
    </div>
  );
}

export function Drawer({
  title,
  onClose,
  children,
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    ref.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="ad-overlay" onClick={onClose} role="presentation">
      <aside
        className="ad-drawer"
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        ref={ref}
        onClick={(event) => event.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h3>{title}</h3>
          <button
            className="ad-btn"
            data-variant="ghost"
            data-size="sm"
            style={{ marginLeft: 'auto' }}
            onClick={onClose}
          >
            关闭
          </button>
        </div>
        {children}
      </aside>
    </div>
  );
}

export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  busy,
  danger,
  onConfirm,
  onCancel,
}: {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  busy?: boolean;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="ad-overlay" style={{ justifyContent: 'center' }} role="presentation">
      <div className="ad-modal" role="dialog" aria-modal="true" aria-label={title}>
        <h3>{title}</h3>
        <div style={{ fontSize: 13, color: 'var(--ad-muted)' }}>{children}</div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="ad-btn" onClick={onCancel} disabled={busy}>
            取消
          </button>
          <button
            className="ad-btn"
            data-variant={danger ? 'danger' : 'primary'}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? '处理中…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function KeyValue({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="ad-kv">
      {items.map((item) => (
        <div key={item.label} style={{ display: 'contents' }}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
