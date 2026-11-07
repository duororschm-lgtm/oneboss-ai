'use client';
import { useCallback, useEffect, useState } from 'react';
import { fetchWorkReviews, type AdminResult } from '../../../../lib/admin/api';
import type { WorkReview } from '../../../../lib/admin/types';
import {
  Banner,
  EmptyState,
  ErrorState,
  SkeletonRows,
  UnsupportedState,
} from '../../../../components/admin/states';
import { Card, Drawer, KeyValue, PageHead, StatusBadge } from '../../../../components/admin/ui';

export default function ReviewsPage() {
  const [result, setResult] = useState<AdminResult<WorkReview[]> | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<WorkReview | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setResult(await fetchWorkReviews());
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const items = result?.ok ? result.data : [];
  const unsupported = result && !result.ok && result.kind === 'unsupported';

  return (
    <>
      <PageHead
        title="作品审核中心"
        description="审核通过不等于正式发布。发布必须遵循服务端状态机与客户确认规则。"
        actions={
          <button className="ad-btn" onClick={() => void load()} disabled={loading}>
            刷新
          </button>
        }
      />

      {unsupported && (
        <Banner tone="warning">
          作品审核队列接口 <code>GET /api/admin/works/reviews</code> 尚未提供（缺口 <strong>A-08</strong>）。
          审核动作同样缺少服务端接口，因此<strong>不提供任何「通过 / 驳回」按钮</strong>，避免无法落库的假操作。
        </Banner>
      )}

      <Card padding={false}>
        {loading && !result ? (
          <SkeletonRows rows={6} />
        ) : result?.ok ? (
          items.length ? (
            <div className="ad-table-wrap">
              <table className="ad-table">
                <thead>
                  <tr>
                    <th scope="col">项目</th>
                    <th scope="col">客户</th>
                    <th scope="col">商品</th>
                    <th scope="col" className="ad-num">价格</th>
                    <th scope="col">版本</th>
                    <th scope="col">正式 URL</th>
                    <th scope="col">客户确认</th>
                    <th scope="col" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td className="ad-code">{item.projectId.slice(0, 8)}</td>
                      <td>{item.organization ?? '—'}</td>
                      <td>{item.productName ?? '—'}</td>
                      <td className="ad-num">{item.price ?? '—'}</td>
                      <td>v{item.revision}</td>
                      <td
                        className="ad-code"
                        style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}
                      >
                        {item.siteUrl ?? '—'}
                      </td>
                      <td>
                        {item.clientConfirmed ? (
                          <StatusBadge label="已确认" tone="success" />
                        ) : (
                          <StatusBadge label="待确认" tone="warning" />
                        )}
                      </td>
                      <td>
                        <button className="ad-btn" data-size="sm" onClick={() => setSelected(item)}>
                          查看
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="没有待审核作品" />
          )
        ) : result && result.kind === 'unsupported' ? (
          <UnsupportedState
            spec={result.spec}
            extra={
              <p style={{ fontSize: 12.5, margin: 0 }}>
                审核视图需要：网站预览与正式 URL、海报 PNG 与尺寸、二维码目标与检测结果、
                小红书文案、版本号、自动质检结果与客户确认状态。
              </p>
            }
          />
        ) : result && result.kind === 'error' ? (
          <ErrorState message={result.message} onRetry={() => void load()} />
        ) : null}
      </Card>

      {selected && (
        <Drawer title={`作品 v${selected.revision}`} onClose={() => setSelected(null)}>
          <KeyValue
            items={[
              { label: '项目', value: <span className="ad-code">{selected.projectId}</span> },
              { label: '客户', value: selected.organization ?? '—' },
              { label: '商品', value: selected.productName ?? '—' },
              { label: '价格', value: selected.price ?? '—' },
              { label: '正式 URL', value: selected.siteUrl ?? '—' },
              {
                label: '海报',
                value:
                  selected.posterWidth && selected.posterHeight
                    ? `${selected.posterWidth}×${selected.posterHeight}`
                    : '—',
              },
              { label: '二维码目标', value: selected.qrTarget ?? '—' },
              { label: '自动质检', value: selected.qaResult ?? '—' },
              { label: '客户确认', value: selected.clientConfirmed ? '已确认' : '未确认' },
            ]}
          />
          <div>
            <h4 style={{ margin: '0 0 6px', fontSize: 13 }}>小红书文案</h4>
            <p style={{ margin: 0, fontSize: 13 }}>{selected.copyTitle ?? '—'}</p>
            <p style={{ margin: '6px 0 0', fontSize: 12.5, color: 'var(--ad-muted)' }}>
              {selected.copyBody ?? '—'}
            </p>
            <p style={{ margin: '8px 0 0', fontSize: 12.5 }}>{selected.hashtags.join(' ')}</p>
          </div>
          <Banner tone="warning">
            审核动作（通过 / 驳回 / 定向返工 / 暂缓发布）需要
            <code> POST /api/admin/works/:workId/review</code>（缺口 A-08），当前不可执行。
          </Banner>
        </Drawer>
      )}
    </>
  );
}
