import Link from 'next/link';
import { ExampleGallery } from '../../../components/customer/examples';
export const metadata = { title: '作品与服务' };
export default function Page() {
  return (
    <main className="ob-container ob-section">
      <span className="ob-eyebrow">ONE IDEA. A CONNECTED CAMPAIGN.</span>
      <h1>让每个载体，讲同一件事。</h1>
      <ExampleGallery />
      <p className="ob-lead">
        下面是交付形式说明，非真实客户案例。你的作品会根据自己的产品资料和批准方向制作。
      </p>
      <div className="ob-grid ob-three">
        {[
          [
            '01 / WEBSITE',
            '可交互宣传网站',
            '手机也能探索产品资料：切换信息、查看图片、浏览产品与品牌。用一个链接分享，或从海报扫码进入。',
          ],
          [
            '02 / POSTER',
            '高清宣传海报',
            '1080×1350 或 1080×1080 PNG，产品图、事实和文案保持一致。二维码在完成发布后才生成。',
          ],
          [
            '03 / COPY',
            '成套文案与交付包',
            '每张海报绑定标题、正文、标签和引导语。逐条复制，或下载包含网站地址与校验清单的 ZIP。',
          ],
        ].map(([n, t, d]) => (
          <article className="ob-card" key={n}>
            <span className="ob-eyebrow">{n}</span>
            <h2>{t}</h2>
            <p>{d}</p>
          </article>
        ))}
      </div>
      <section className="ob-section ob-split">
        <h2>
          先确认内容，
          <br />
          再创造表达。
        </h2>
        <div>
          <p className="ob-lead">
            已确认的产品事实贯穿网站、海报与文案。你可以比较设计方向、检查实际预览，再决定是否发布。
          </p>
          <Link href="/pricing" className="ob-button">
            开始一个项目 →
          </Link>
        </div>
      </section>
    </main>
  );
}
