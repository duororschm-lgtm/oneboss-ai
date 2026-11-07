import './admin.css';
import type { ReactNode } from 'react';
import { AuthConfig } from '../../components/admin/auth-config';

export const metadata = {
  title: '管理员平台',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/**
 * /admin 的根布局：引入后台独立样式表，并在运行时把 Supabase 公开配置注入客户端。
 * 真正的会话守卫与侧边栏在 (console)/layout.tsx —— 登录页不套守卫，避免重定向环。
 */
export default function AdminRootLayout({ children }: { children: ReactNode }) {
  const env = process.env;
  return (
    <>
      <AuthConfig
        url={env.NEXT_PUBLIC_SUPABASE_URL}
        publishableKey={env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY}
      />
      {children}
    </>
  );
}
