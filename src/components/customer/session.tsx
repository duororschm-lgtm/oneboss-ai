'use client';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { createClient, type SupabaseClient, type Session } from '@supabase/supabase-js';

let client: SupabaseClient | undefined;
let publicConfig: { url?: string; key?: string; emailReady?: boolean } | undefined;
export const publicAuthUrl = () =>
  publicConfig ? publicConfig.url : process.env.NEXT_PUBLIC_SUPABASE_URL;
export function browserAuth() {
  if (client) return client;
  const url = publicConfig ? publicConfig.url : process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = publicConfig ? publicConfig.key : process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error('登录服务尚未配置，请稍后再试。');
  return (client = createClient(url, key));
}
const SessionContext = createContext<{
  session: Session | null;
  ready: boolean;
  emailReady: boolean;
}>({
  session: null,
  ready: false,
  emailReady: false,
});
export function CustomerSession({
  children,
  config,
}: {
  children: ReactNode;
  config?: { url?: string; key?: string; emailReady?: boolean };
}) {
  publicConfig = config;
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let live = true;
    try {
      const auth = browserAuth().auth;
      void auth.getSession().then(({ data }) => {
        if (live) {
          setSession(data.session);
          setReady(true);
        }
      });
      const { data } = auth.onAuthStateChange((_event, value) => {
        if (live) {
          setSession(value);
          setReady(true);
        }
      });
      return () => {
        live = false;
        data.subscription.unsubscribe();
      };
    } catch {
      setReady(true);
    }
    return () => {
      live = false;
    };
  }, []);
  return (
    <SessionContext.Provider value={{ session, ready, emailReady: config?.emailReady === true }}>
      {children}
    </SessionContext.Provider>
  );
}
export const useCustomer = () => useContext(SessionContext);

const messages: Record<string, string> = {
  UNAUTHENTICATED: '登录已过期，请重新登录。',
  FORBIDDEN: '你没有权限访问这项内容。',
  PLATFORM_ADMIN_REQUIRED: '此页面仅供已授权的服务管理员使用。',
  PAYMENT_REQUIRED: '订单尚未确认付款，请先完成支付。',
  LIVE_PROVIDER_NOT_CONFIGURED: '在线支付尚未开通，请稍后再试。',
  SANDBOX_DISABLED: '此环境未开放模拟支付。',
  WECHAT_PAY_NOT_CONFIGURED: '微信商户尚未配置，请稍后再试。',
  WECHAT_CONFIG_INVALID: '微信商户配置尚未完成，请联系客服。',
  WECHAT_REQUEST_FAILED: '微信暂时未能完成请求，请查询订单状态后重试。',
  ORDER_CLOSING: '订单正在关闭或等待核对，请完成关闭后重新创建订单。',
  ORDER_NOT_PAYABLE: '当前订单无法继续付款，请刷新检查最新状态。',
  ENTITLEMENT_REQUIRED: '此订单暂时没有有效制作权益。',
  STALE_REVISION: '资料或版本已更新，请刷新后继续。',
  STALE_DELIVERY: '资料已更新，请按当前版本重新生成并发布交付文件。',
  NO_REVISIONS_LEFT: '套餐修改次数已用完。',
  PLAN_LIMIT: '提交的产品或海报数量超出套餐权益。',
  DELIVERY_NOT_READY: '交付包还在准备，请稍后刷新。',
  RATE_LIMITED: '操作较频繁，请稍后再试。',
  APPROVAL_REQUIRED: '请先批准当前作品。',
  BROWSER_VERIFICATION_REQUIRED: '网站交互检查尚未完成，请稍后重试。',
  BROWSER_QA_REQUIRED: '网站交互检查尚未通过，请查看发布任务结果。',
};
export class CustomerError extends Error {
  constructor(
    public code: string,
    public requestId?: string,
  ) {
    super(messages[code] || `操作未完成（${code}），请刷新或稍后重试。`);
  }
}
export async function customerApi<T = any>(
  path: string,
  body?: unknown,
  options: RequestInit = {},
): Promise<T> {
  const { data } = await browserAuth().auth.getSession();
  const headers = new Headers(options.headers);
  if (data.session) headers.set('Authorization', `Bearer ${data.session.access_token}`);
  if (body !== undefined) {
    headers.set('Content-Type', 'application/json');
    headers.set('Idempotency-Key', crypto.randomUUID());
  }
  const response = await fetch(`/api/${path}`, {
    ...options,
    method: body === undefined ? 'GET' : 'POST',
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    cache: 'no-store',
  });
  const value = await response.json();
  if (!response.ok)
    throw new CustomerError(value.error?.code || 'REQUEST_FAILED', value.error?.requestId);
  return value;
}
