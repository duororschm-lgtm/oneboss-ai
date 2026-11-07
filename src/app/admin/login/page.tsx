'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { browserAuth } from '../../../components/customer/session';

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { error: failure } = await browserAuth().auth.signInWithPassword({ email, password });
      if (failure) {
        setError('账号或密码不正确，请重试。');
        return;
      }
      // 登录成功不等于有管理员权限，权限由 /api/core/admin 在服务端判定。
      router.replace('/admin');
    } catch {
      setError('登录服务暂不可用，请稍后再试。');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ad-login">
      <form className="ad-login-card" onSubmit={submit}>
        <div>
          <h1>OneBoss 管理员平台</h1>
          <p>仅限已授权的内部管理员。登录成功后仍会由服务端校验平台管理员权限。</p>
        </div>
        {error && (
          <div className="ad-banner" data-tone="danger" role="alert">
            {error}
          </div>
        )}
        <label className="ad-field">
          管理员邮箱
          <input
            className="ad-input"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label className="ad-field">
          密码
          <input
            className="ad-input"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <button className="ad-btn" data-variant="primary" type="submit" disabled={busy}>
          {busy ? '登录中…' : '登录管理员平台'}
        </button>
        <p style={{ fontSize: 11.5, color: '#8b949e' }}>
          忘记密码请联系项目负责人重置。此入口与客户站登录互不影响。
        </p>
      </form>
    </div>
  );
}
