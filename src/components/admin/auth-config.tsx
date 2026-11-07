'use client';
import { setAuthConfig } from '../customer/session';

/**
 * 把服务端运行时读到的 Supabase 公开配置注入浏览器端认证客户端。
 *
 * 为什么需要它：`NEXT_PUBLIC_*` 是构建期内联的，Docker 构建阶段如果没拿到
 * 构建参数，打包进浏览器的就是 undefined，管理员登录页会直接报"登录服务尚未配置"。
 * 客户站一直是靠服务端布局传 config 解决的，管理员平台用同一个办法。
 */
export function AuthConfig({ url, publishableKey }: { url?: string; publishableKey?: string }) {
  // 幂等赋值：同一配置重复渲染不会重建客户端，也不会踢掉已有会话。
  setAuthConfig({ url, key: publishableKey });
  return null;
}
