import './admin.css';
import type { ReactNode } from 'react';

export const metadata = {
  title: '管理员平台',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/**
 * /admin 的根布局：只负责引入后台独立样式表。
 * 真正的会话守卫与侧边栏在 (console)/layout.tsx —— 登录页不套守卫，避免重定向环。
 */
export default function AdminRootLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
