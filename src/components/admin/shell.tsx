'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Bot,
  ClipboardCheck,
  Image as ImageIcon,
  LayoutDashboard,
  LogOut,
  Package,
  ScrollText,
  ShoppingCart,
  Users,
  Wallet,
} from 'lucide-react';
import { browserAuth } from '../customer/session';
import { fetchWorkspace, MOCK_MODE, type AdminResult } from '../../lib/admin/api';
import type { AdminWorkspacePayload } from '../../lib/admin/types';
import { ROLE_LABEL, resolveRole } from '../../lib/admin/permissions';
import { ErrorState, ForbiddenState, MockBanner, SkeletonRows } from './states';

interface AdminContextValue {
  email: string | null;
  workspace: AdminResult<AdminWorkspacePayload> | null;
  reload: () => Promise<void>;
}

const AdminContext = createContext<AdminContextValue>({
  email: null,
  workspace: null,
  reload: async () => {},
});

export const useAdmin = () => useContext(AdminContext);

const NAV = [
  { href: '/admin', label: '经营总览', icon: LayoutDashboard },
  { href: '/admin/orders', label: '订单管理', icon: ShoppingCart },
  { href: '/admin/finance', label: '财务与收入', icon: Wallet },
  { href: '/admin/approvals', label: '放行与审批', icon: ClipboardCheck },
  { href: '/admin/agents', label: 'AI 员工', icon: Bot },
  { href: '/admin/reviews', label: '作品审核', icon: ImageIcon },
  { href: '/admin/customers', label: '客户管理', icon: Users },
  { href: '/admin/plans', label: '套餐管理', icon: Package },
  { href: '/admin/audit-logs', label: '审计日志', icon: ScrollText },
];

type Phase = 'checking' | 'ready' | 'forbidden' | 'anonymous' | 'failed';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** 权限探测超时：避免一次请求挂住就把整页卡在骨架屏。 */
const PROBE_TIMEOUT_MS = 12_000;

export function AdminShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [phase, setPhase] = useState<Phase>('checking');
  const [email, setEmail] = useState<string | null>(null);
  const [workspace, setWorkspace] = useState<AdminResult<AdminWorkspacePayload> | null>(null);

  const load = useCallback(async () => {
    setPhase('checking');
    // 刚登录完成时，第一次带的 token 可能还没就绪（401），或请求超时；
    // 这类瞬时失败不能直接判定成「无权限」，否则要手动刷新才能恢复。
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (attempt > 0) await sleep(400 * attempt);
      try {
        const { data } = await browserAuth().auth.getSession();
        const session = data.session ?? (await browserAuth().auth.refreshSession()).data.session;
        if (!session) {
          setPhase('anonymous');
          router.replace('/admin/login');
          return;
        }
        setEmail(session.user.email ?? null);
        const result = await Promise.race([
          fetchWorkspace(),
          new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error('PROBE_TIMEOUT')), PROBE_TIMEOUT_MS);
          }),
        ]);
        setWorkspace(result);
        if (result.ok) {
          setPhase('ready');
          return;
        }
        if (result.kind === 'forbidden') {
          setPhase('forbidden');
          return;
        }
        // unauthorized / unsupported / error 都允许重试一轮再下结论。
      } catch {
        /* 超时或网络异常：继续重试 */
      }
    }
    setPhase('failed');
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  const value = useMemo<AdminContextValue>(
    () => ({ email, workspace, reload: load }),
    [email, workspace, load],
  );

  const role = resolveRole(workspace?.ok === true);
  const current = NAV.find(
    (item) => pathname === item.href || (item.href !== '/admin' && pathname.startsWith(item.href)),
  );

  if (phase === 'anonymous') {
    return (
      <div className="ad-root" style={{ gridTemplateColumns: '1fr' }}>
        <div className="ad-content">
          <SkeletonRows rows={3} />
        </div>
      </div>
    );
  }

  return (
    <AdminContext.Provider value={value}>
      <div className="ad-root">
        <aside className="ad-sidebar">
          <div className="ad-brand">
            <strong>oneboss</strong>
            <span>admin</span>
          </div>
          <nav className="ad-nav" aria-label="管理员导航">
            <div className="ad-nav-group">运营</div>
            {NAV.slice(0, 6).map((item) => {
              const Icon = item.icon;
              const active =
                pathname === item.href ||
                (item.href !== '/admin' && pathname.startsWith(item.href));
              return (
                <Link key={item.href} href={item.href} aria-current={active ? 'page' : undefined}>
                  <Icon size={16} strokeWidth={1.8} aria-hidden />
                  {item.label}
                </Link>
              );
            })}
            <div className="ad-nav-group">配置</div>
            {NAV.slice(6).map((item) => {
              const Icon = item.icon;
              const active = pathname.startsWith(item.href);
              return (
                <Link key={item.href} href={item.href} aria-current={active ? 'page' : undefined}>
                  <Icon size={16} strokeWidth={1.8} aria-hidden />
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="ad-sidebar-foot">
            内部运营控制台
            <br />
            与客户平台共用业务数据
            <br />
            <Link href="/" style={{ color: '#8ea6c8' }}>
              ← 返回客户站
            </Link>
          </div>
        </aside>

        <div className="ad-main">
          <header className="ad-header">
            <h1>{current?.label ?? '管理员平台'}</h1>
            <span className="ad-crumb">/admin</span>
            <div className="ad-header-right">
              <span
                className="ad-badge"
                data-tone={phase === 'forbidden' || phase === 'failed' ? 'danger' : 'info'}
              >
                {phase === 'ready' ? ROLE_LABEL[role] : phase === 'checking' ? '校验中' : '未知'}
              </span>
              <span title={email ?? ''}>{email ?? '—'}</span>
              <span className="ad-avatar" aria-hidden>
                {(email ?? 'A').slice(0, 1).toUpperCase()}
              </span>
              <button
                className="ad-btn"
                data-variant="ghost"
                data-size="sm"
                onClick={async () => {
                  await browserAuth().auth.signOut();
                  router.replace('/admin/login');
                }}
              >
                <LogOut size={14} aria-hidden />
                退出
              </button>
            </div>
          </header>

          <main className="ad-content">
            {MOCK_MODE && <MockBanner />}
            {phase === 'checking' ? (
              <SkeletonRows rows={6} />
            ) : phase === 'forbidden' ? (
              <ForbiddenState
                message={
                  workspace && !workspace.ok && workspace.kind === 'forbidden'
                    ? workspace.message
                    : undefined
                }
              />
            ) : phase === 'failed' ? (
              <ErrorState
                message="连续三次都无法完成管理员权限校验，可能是网络或认证服务波动。"
                onRetry={() => void load()}
              />
            ) : (
              children
            )}
          </main>
        </div>
      </div>
    </AdminContext.Provider>
  );
}
