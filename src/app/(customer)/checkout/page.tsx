import { Suspense } from 'react';
import { Checkout } from '../../../components/customer/checkout';
export const metadata = { title: '确认订单' };
export default function Page() {
  return (
    <Suspense fallback={<p>正在读取套餐…</p>}>
      <Checkout />
    </Suspense>
  );
}
