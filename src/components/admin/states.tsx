'use client';
import type { ReactNode } from 'react';
import type { EndpointSpec } from '../../lib/admin/api';

export function SkeletonRows({ rows = 5 }: { rows?: number }) {
  return (
    <div style={{ display: 'grid', gap: 10, padding: '18px' }} role="status" aria-label="加载中">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="ad-skeleton" style={{ width: `${60 + ((index * 13) % 35)}%` }} />
      ))}
    </div>
  );
}

export function EmptyState({ title, detail }: { title: string; detail?: ReactNode }) {
  return (
    <div className="ad-state">
      <strong>{title}</strong>
      {detail ?? '当前筛选条件下没有记录。'}
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
  requestId,
}: {
  message: string;
  onRetry?: () => void;
  requestId?: string;
}) {
  return (
    <div className="ad-state">
      <strong>请求失败</strong>
      <p style={{ margin: '0 0 12px' }}>{message}</p>
      {requestId && (
        <p className="ad-code" style={{ marginBottom: 12 }}>
          requestId: {requestId}
        </p>
      )}
      {onRetry && (
        <button className="ad-btn" onClick={onRetry}>
          重试
        </button>
      )}
    </div>
  );
}

export function ForbiddenState({ message }: { message?: string }) {
  return (
    <div className="ad-state">
      <strong>无权限访问</strong>
      <p style={{ margin: 0 }}>
        {message ?? '你的账号不是已授权的平台管理员。如需开通，请联系项目负责人。'}
      </p>
    </div>
  );
}

export function SessionExpiredState() {
  return (
    <div className="ad-state">
      <strong>登录已过期</strong>
      <p style={{ margin: '0 0 14px' }}>为保证数据安全，请重新登录管理员平台。</p>
      <a className="ad-btn" data-variant="primary" href="/admin/login">
        重新登录
      </a>
    </div>
  );
}

/**
 * 后端接口尚未提供时的标准展示。
 * 不显示任何数字，只说明缺口编号与端点，避免把"没有数据"误解成"数据为零"。
 */
export function UnsupportedState({ spec, extra }: { spec: EndpointSpec; extra?: ReactNode }) {
  return (
    <div className="ad-state">
      <strong>后端接口尚未提供</strong>
      <p style={{ margin: '0 0 8px' }}>
        <code>
          {spec.method} {spec.path}
        </code>
      </p>
      <p style={{ margin: 0 }}>
        {spec.note} · 缺口编号 <strong>{spec.gap ?? '—'}</strong>
      </p>
      {extra && <div style={{ marginTop: 12 }}>{extra}</div>}
    </div>
  );
}

export function Banner({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'warning' | 'danger';
  children: ReactNode;
}) {
  return (
    <div className="ad-banner" data-tone={tone} role={tone === 'danger' ? 'alert' : 'status'}>
      <span>{children}</span>
    </div>
  );
}

export function MockBanner() {
  return (
    <Banner tone="warning">
      <strong>开发模拟数据</strong> · 当前页面使用 <code>NEXT_PUBLIC_ADMIN_MODE=mock</code>{' '}
      的演示数据，<strong>不是真实经营数据</strong>，不得用于对账、结算或对外汇报。
    </Banner>
  );
}
