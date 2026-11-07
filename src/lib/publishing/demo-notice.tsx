export function DemoNotice({ demo }: { demo?: { expiresAt: string } }) {
  if (!demo) return null;
  const expiry = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(demo.expiresAt));
  return (
    <aside
      data-oneboss-demo="true"
      style={{
        padding: '12px 18px',
        background: '#fff3cd',
        color: '#40320b',
        font: '14px/1.6 sans-serif',
        textAlign: 'center',
      }}
    >
      DEMO 演示项目 · 无真实收款 · 托管至 {expiry}（北京时间），到期可联系服务方续期。
    </aside>
  );
}
