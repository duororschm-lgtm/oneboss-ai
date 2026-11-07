import Link from 'next/link';
const items = [
  [
    '我需要准备什么？',
    '产品名称、真实价格、已确认的特点，以及你有权使用的图片。不清楚的信息可以留空；AI 会提示需要补充的内容。',
  ],
  [
    '网站和海报有什么不同？',
    '网站可以通过链接打开并互动；海报是可以下载和分享的高清 PNG。海报上的二维码指向已发布的网站。',
  ],
  [
    'AI 会自己编写产品卖点吗？',
    '未经你确认的产品信息不能作为正式事实发布。你需要确认产品资料、创意方向和最终版本。',
  ],
  [
    '可以修改吗？',
    '可以在套餐剩余修改次数内提出局部修改，例如只调整网站风格。涉及产品信息变化时，需要重新确认事实和作品。',
  ],
  [
    '如何付款并开始制作？',
    '在订单页查看可用付款方式。使用微信收款码时，请核对收款人、按订单金额付款并备注订单标识，再提交付款说明。管理员核验真实到账后开放制作；提交说明不会自动确认付款。演示订单不产生真实收款。',
  ],
  [
    '交付后我能拿到什么？',
    '网站链接、带二维码的海报、小红书配套文案和包含 manifest 的 ZIP 包。网站托管期限与修改次数以订单快照为准。',
  ],
  [
    '退款如何处理？',
    '可以在订单页提交退款申请。申请不代表已经到账，制作进度与实际退款结果需要核实。',
  ],
];
export const metadata = { title: '常见问题' };
export default function Page() {
  return (
    <main className="ob-container ob-section ob-prose">
      <span className="ob-eyebrow">BEFORE WE START</span>
      <h1>你可能想了解。</h1>
      {items.map(([q, a]) => (
        <details key={q}>
          <summary>{q}</summary>
          <p>{a}</p>
        </details>
      ))}
      <Link className="ob-button" href="/pricing">
        查看服务套餐 →
      </Link>
    </main>
  );
}
