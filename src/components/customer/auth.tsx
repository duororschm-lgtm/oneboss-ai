'use client';
import { useState, useEffect, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { browserAuth, useCustomer } from './session';
import { Notice } from './shell';
import { loginEmail } from '../../lib/customer/account';
import { requestCustomerJSON } from '../../lib/customer/request';

const signupErrors: Record<string, string> = {
  ACCOUNT_INVALID: '账号需为 3–32 位中文、字母、数字或下划线，不能使用邮箱。',
  ACCOUNT_EXISTS: '账号已存在。若刚才已提交注册，请用相同账号和密码直接登录。',
  PASSWORD_WEAK: '请使用至少 10 位且不常见的独立密码。',
  REGISTRATION_RATE_LIMITED: '注册尝试较频繁，请稍后再试。',
  VALIDATION_FAILED: '请检查账号和密码，密码需要 10–128 位。',
};

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
      account = String(fields.get('account') || ''),
      password = String(fields.get('password') || '');
    try {
      const auth = browserAuth().auth;
      if (mode === 'login') {
        const result = await auth.signInWithPassword({
          email: await loginEmail(account),
          password,
        });
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
              : '登录失败，请核对账号和密码。已有邮箱账户也可用原邮箱登录。',
          );
        }
        router.replace(target);
      } else if (mode === 'register') {
        const { response, value } = await requestCustomerJSON('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: account, password }),
        });
        if (!response.ok)
          throw new Error(signupErrors[value.error?.code] || '暂时无法注册，请稍后再试。');
        const result = await auth.signInWithPassword({
          email: await loginEmail(account),
          password,
        });
        if (result.error) {
          setMode('login');
          throw new Error('账号已创建，请使用刚才的账号和密码登录。');
        }
        router.replace(target);
      } else if (mode === 'reset') {
        const result = await auth.resetPasswordForEmail(account.trim(), {
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
      setError(
        e instanceof Error ? signupErrors[e.message] || e.message : '暂时无法连接登录服务。',
      );
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
        {mode === 'register' && (
          <p>只需设置账号和密码即可注册，无需邮箱或验证码。账号不区分英文字母大小写。</p>
        )}
        {mode === 'login' && <p className="ob-muted">已有邮箱账户也可使用原邮箱和密码登录。</p>}
        {mode === 'reset' && !emailReady && (
          <Notice>
            邮件找回密码暂未开放。账号密码请妥善保存；忘记密码请联系 BlackCode，微信 18001132767。
          </Notice>
        )}
        <form className="ob-form" onSubmit={submit}>
          {mode !== 'update' && (
            <label>
              {mode === 'reset' ? '邮箱' : '账号'}
              <input
                aria-label={mode === 'reset' ? '邮箱' : '账号'}
                name="account"
                type={mode === 'reset' ? 'email' : 'text'}
                autoComplete={mode === 'reset' ? 'email' : 'username'}
                required
                minLength={mode === 'register' ? 3 : 1}
                maxLength={mode === 'register' ? 32 : 254}
                autoCapitalize="none"
                spellCheck={false}
              />
              {mode === 'register' && (
                <small>3–32 位中文、字母、数字或下划线。不要填写邮箱。</small>
              )}
            </label>
          )}
          {mode !== 'reset' && (
            <label>
              密码
              <input
                aria-label="密码"
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
            <p className="ob-muted">
              点击创建账户即表示你同意{' '}
              <Link href="/terms" target="_blank">
                服务说明
              </Link>{' '}
              和{' '}
              <Link href="/privacy" target="_blank">
                隐私说明
              </Link>
            </p>
          )}
          <button className="ob-button" disabled={busy || (!emailReady && mode === 'reset')}>
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
