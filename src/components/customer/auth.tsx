'use client';
import { useState, useEffect, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { browserAuth, useCustomer } from './session';
import { Notice } from './shell';

export function Login() {
  const router = useRouter(),
    params = useSearchParams();
  const { session, ready, emailReady } = useCustomer();
  const [mode, setMode] = useState<'login' | 'register' | 'reset' | 'update'>('login');
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [error, setError] = useState('');
  const next = params.get('next');
  const target =
    next?.startsWith('/') && !next.startsWith('//') && !next.includes('\\') ? next : '/dashboard';
  useEffect(() => {
    try {
      const auth = browserAuth().auth;
      const { data } = auth.onAuthStateChange((event) => {
        if (event === 'PASSWORD_RECOVERY') setMode('update');
      });
      return () => data.subscription.unsubscribe();
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    if (ready && session && mode !== 'update' && !window.location.hash.includes('recovery'))
      router.replace(target);
  }, [ready, session, mode, router, target]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    const fields = new FormData(event.currentTarget),
      email = String(fields.get('email') || ''),
      password = String(fields.get('password') || '');
    try {
      const auth = browserAuth().auth;
      if (mode === 'login') {
        const result = await auth.signInWithPassword({ email, password });
        if (result.error) {
          console.warn(
            JSON.stringify({
              authError: result.error.name,
              status: result.error.status,
              code: result.error.code,
            }),
          );
          throw new Error(
            result.error.name === 'AuthRetryableFetchError'
              ? '暂时无法连接登录服务，请检查网络后重试。'
              : '登录失败，请核对邮箱和密码；新账户需要先确认邮箱。',
          );
        }
        router.replace(target);
      } else if (mode === 'register') {
        const result = await auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/login` },
        });
        if (result.error) throw new Error('注册暂未完成。请检查邮箱和密码，或稍后重试。');
        setMessage(
          result.data.session
            ? '注册完成，正在进入工作台。'
            : '请查看邮箱中的确认邮件，确认后回到这里登录。如果已有账户，请直接登录。',
        );
      } else if (mode === 'reset') {
        const result = await auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/login`,
        });
        if (result.error) throw new Error('暂时无法发送重置邮件，请稍后重试。');
        setMessage('如果该邮箱有账户，你会收到密码重置邮件。请在本设备中打开链接。');
      } else {
        const result = await auth.updateUser({ password });
        if (result.error) throw new Error('密码更新失败，请重新打开有效的重置链接。');
        setMode('login');
        setMessage('密码已更新。');
        router.replace('/dashboard');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '暂时无法连接登录服务。');
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="ob-container ob-auth">
      <div>
        <span className="ob-eyebrow">YOUR CREATIVE WORKSPACE</span>
        <h1>
          {mode === 'register'
            ? '让下一个作品，从这里开始。'
            : mode === 'reset'
              ? '找回你的工作台。'
              : mode === 'update'
                ? '设置新的登录密码。'
                : '欢迎回来，继续你的创意。'}
        </h1>
        <p>资料、确认记录和每一次交付，都保存在你的账户里。</p>
      </div>
      <section className="ob-card">
        <h2>
          {
            { login: '登录 OneBoss', register: '创建账户', reset: '重置密码', update: '更新密码' }[
              mode
            ]
          }
        </h2>
        {error && <Notice error>{error}</Notice>}
        {message && <Notice>{message}</Notice>}
        {(mode === 'register' || mode === 'reset') && !emailReady && (
          <Notice>
            外部邮箱的注册和找回密码暂未开放。已有账户可直接登录；需要体验请联系 BlackCode，微信
            18001132767。
          </Notice>
        )}
        <form className="ob-form" onSubmit={submit}>
          {mode !== 'update' && (
            <label>
              邮箱
              <input name="email" type="email" autoComplete="email" required maxLength={254} />
            </label>
          )}
          {mode !== 'reset' && (
            <label>
              密码
              <input
                name="password"
                type="password"
                minLength={mode === 'login' ? 1 : 10}
                maxLength={128}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                required
              />
              {mode !== 'login' && <small>至少 10 位，建议使用独立密码。</small>}
            </label>
          )}
          {mode === 'register' && (
            <label className="ob-check">
              <input type="checkbox" required />
              我已阅读并同意{' '}
              <Link href="/terms" target="_blank">
                服务说明
              </Link>{' '}
              和{' '}
              <Link href="/privacy" target="_blank">
                隐私说明
              </Link>
            </label>
          )}
          <button
            className="ob-button"
            disabled={busy || (!emailReady && (mode === 'register' || mode === 'reset'))}
          >
            {busy
              ? '正在处理…'
              : mode === 'login'
                ? '登录并继续'
                : mode === 'register'
                  ? '创建账户'
                  : mode === 'reset'
                    ? '发送重置邮件'
                    : '保存新密码'}
          </button>
        </form>
        <div className="ob-actions">
          <button
            className="ob-link"
            onClick={() => {
              setMode(mode === 'register' ? 'login' : 'register');
              setError('');
              setMessage('');
            }}
          >
            {mode === 'register' ? '已有账户？登录' : '还没有账户？注册'}
          </button>
          <button
            className="ob-link"
            onClick={() => {
              setMode(mode === 'reset' ? 'login' : 'reset');
              setError('');
            }}
          >
            {mode === 'reset' ? '返回登录' : '忘记密码'}
          </button>
        </div>
      </section>
    </main>
  );
}
