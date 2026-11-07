'use client';
import { useEffect, useState } from 'react';
export function usePaymentMethods() {
  const [value, setValue] = useState<{ wechatNative: boolean; ready: boolean }>({
    wechatNative: false,
    ready: false,
  });
  useEffect(() => {
    const abort = new AbortController();
    void fetch('/api/commerce/payment-methods', { signal: abort.signal })
      .then(async (r) => {
        if (!r.ok) throw Error();
        const data = await r.json();
        setValue({ wechatNative: data.wechatNative === true, ready: true });
      })
      .catch(() => {
        if (!abort.signal.aborted) setValue({ wechatNative: false, ready: true });
      });
    return () => abort.abort();
  }, []);
  return value;
}
