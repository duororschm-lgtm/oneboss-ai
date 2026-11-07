'use client';
import Link from 'next/link';
import { useCustomer, browserAuth } from './session';
import type { ReactNode } from 'react';
import { business } from '../../lib/customer/business';
export function CustomerShell({ children }: { children: ReactNode }) {
  const { session } = useCustomer();
  return (
    <div className="ob-app">
      <header className="ob-header">
        <Link className="ob-logo" href="/">
          oneboss<span>®</span>
        </Link>
        <nav aria-label="主导航">
          <Link href="/pricing">服务套餐</Link>
          <Link href="/examples">作品与服务</Link>
          <Link href="/faq">常见问题</Link>
          <Link href={session ? '/dashboard' : '/login'} className="ob-button ob-small">
            {session ? '我的工作台' : '登录 / 开始制作'}
          </Link>
          {session && (
            <button className="ob-link" onClick={() => void browserAuth().auth.signOut()}>
              退出
            </button>
          )}
        </nav>
      </header>
      {children}
      <footer className="ob-footer">
        <Link className="ob-logo" href="/">
          oneboss®
        </Link>
        <p>AI 创意宣传制作 · 网站 / 海报 / 文案</p>
        <p>
          {business.name} · 微信 {business.wechat} ·{' '}
          <a href={`mailto:${business.email}`}>{business.email}</a>
        </p>
        <Link href="/terms">服务范围与退款说明</Link>
        <Link href="/privacy">隐私与素材使用</Link>
      </footer>
    </div>
  );
}
export function Notice({ children, error = false }: { children: ReactNode; error?: boolean }) {
  return (
    <div className={`ob-notice ${error ? 'ob-error' : ''}`} role={error ? 'alert' : 'status'}>
      {children}
    </div>
  );
}
export function Loading() {
  return (
    <p className="ob-loading" role="status">
      正在读取你的资料…
    </p>
  );
}
export const money = (minor: number) =>
  new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY' }).format(minor / 100);
export const statusLabel = (state: string) =>
  ({
    UNPAID: '待付款',
    PENDING_CONFIRMATION: '待确认付款',
    PAID: '已确认付款',
    CLOSED: '已关闭',
    REFUND_PENDING: '退款审核中',
    REFUNDED: '已退款',
    PARTIALLY_REFUNDED: '部分退款',
    QUEUED: '排队中',
    RUNNING: '执行中',
    SUCCEEDED: '已完成',
    FAILED: '执行失败',
    DRAFT: '草稿',
    APPROVED: '已批准',
    PUBLISHED: '已发布',
    BRIEF_APPROVAL: '待确认资料',
    DESIGN_APPROVAL: '待选择设计',
    WAITING_INPUT: '待提交资料',
    READY_TO_GENERATE: '设计已批准，待制作',
    QA_REVIEW: '作品待检查与批准',
    GENERATION_FAILED: '任务失败，待处理',
    DELIVERED: '已交付，待验收',
    ACCEPTED: '已验收',
    REQUESTED: '待审核',
    CONFIRMED: '已核实',
    REJECTED: '未通过',
  })[state] || state;
