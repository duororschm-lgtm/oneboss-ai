import { Suspense } from 'react';
import { Login } from '../../../components/customer/auth';
export const metadata = { title: '登录与注册' };
export default function Page() {
  return (
    <Suspense fallback={<p>正在准备登录…</p>}>
      <Login />
    </Suspense>
  );
}
