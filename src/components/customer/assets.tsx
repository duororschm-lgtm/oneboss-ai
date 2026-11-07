'use client';
import { useState, useEffect, useCallback } from 'react';
import { customerApi, browserAuth } from './session';
import { Notice } from './shell';
import type { Row } from '../../lib/customer/types';
export function AssetPicker({
  id,
  ids,
  selected,
  onChange,
}: {
  id: string;
  ids: string;
  selected: string[];
  onChange: (value: string[]) => void;
}) {
  const [assets, setAssets] = useState<Row[]>([]),
    [error, setError] = useState('');
  const load = useCallback(async () => {
    try {
      setAssets((await customerApi(`core/projects/${id}/assets`)).assets);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id]);
  useEffect(() => {
    void load();
  }, [ids, load]);
  return (
    <>
      {error && <Notice error>{error}</Notice>}
      <p className="ob-muted">勾选本次制作要使用的素材，再保存产品资料。</p>
      <div className="ob-grid ob-two">
        {assets.map((a, i) => (
          <label className="ob-card" key={a.id}>
            <img
              src={a.url}
              alt={`你上传的素材 ${i + 1}`}
              style={{ height: 160, width: '100%', objectFit: 'contain' }}
            />
            <span className="ob-check">
              <input
                type="checkbox"
                checked={selected.includes(a.id)}
                onChange={(e) =>
                  onChange(
                    e.target.checked ? [...selected, a.id] : selected.filter((id) => id !== a.id),
                  )
                }
              />
              素材 {i + 1} · {a.width}×{a.height}
            </span>
          </label>
        ))}
      </div>
      {assets.length > 0 && (
        <button className="ob-link" onClick={() => void load()}>
          刷新素材预览链接
        </button>
      )}
    </>
  );
}
export function DraftPosterCards({
  id,
  revision,
  count,
}: {
  id: string;
  revision: number;
  count: number;
}) {
  const [urls, setUrls] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [urls]);
  useEffect(() => {
    setUrls([]);
  }, [id, revision]);
  async function load() {
    setBusy(true);
    setError('');
    const created: string[] = [];
    try {
      const { data } = await browserAuth().auth.getSession();
      for (let i = 0; i < count; i++) {
        const response = await fetch(
          `/api/core/projects/${id}/poster-preview?revision=${revision}&index=${i}`,
          { headers: { Authorization: `Bearer ${data.session?.access_token}` }, cache: 'no-store' },
        );
        if (!response.ok) throw Error('海报草稿尚未准备好，请刷新或查看制作任务。');
        created.push(URL.createObjectURL(await response.blob()));
      }
      setUrls(created);
    } catch (e) {
      created.forEach((url) => URL.revokeObjectURL(url));
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="ob-card">
      <h2>海报草稿预览</h2>
      <p>这是实际图片渲染，带草稿标识。正式二维码与无草稿标识的高清文件，在网站批准发布后生成。</p>
      {error && <Notice error>{error}</Notice>}
      <button className="ob-button ob-ghost" disabled={busy} onClick={() => void load()}>
        {busy ? '正在渲染海报…' : urls.length ? '刷新海报预览' : '查看海报草稿'}
      </button>
      <div className="ob-grid ob-two">
        {urls.map((url, i) => (
          <img className="ob-poster" key={url} src={url} alt={`海报草稿 ${i + 1}`} />
        ))}
      </div>
    </section>
  );
}
