'use client';
import { useEffect, useState } from 'react';
import { requestCustomerJSON } from '../../lib/customer/request';
export type PaymentMethods = {
  wechatNative: boolean;
  manualVerified: boolean;
  manual?: { qrUrl: string; payeeDisplayName: string; instructions: string };
  ready: boolean;
};
export function usePaymentMethods() {
  const [value, setValue] = useState<PaymentMethods>({
    wechatNative: false,
    ready: false,
    manualVerified: false,
  });
  useEffect(() => {
    const abort = new AbortController();
    void requestCustomerJSON('/api/commerce/payment-methods', { signal: abort.signal })
      .then(({ response, value: data }) => {
        if (!response.ok) throw Error();
        setValue({
          wechatNative: data.wechatNative === true,
          manualVerified: data.manualVerified === true,
          manual: data.manual,
          ready: true,
        });
      })
      .catch(() => {
        if (!abort.signal.aborted)
          setValue({ wechatNative: false, manualVerified: false, ready: true });
      });
    return () => abort.abort();
  }, []);
  return value;
}
