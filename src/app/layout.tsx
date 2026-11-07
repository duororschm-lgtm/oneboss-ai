import './globals.css';
import type { ReactNode } from 'react';
export const metadata = {
  title: { default: 'OneBoss · AI 创意宣传制作', template: '%s · OneBoss' },
  description: '为你的产品制作交互宣传网站、高清海报、二维码与配套文案。',
};
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
