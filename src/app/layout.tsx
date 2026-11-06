import './globals.css';
import type { ReactNode } from 'react';
export const metadata = { title: 'OneBoss Core', description: 'OneBoss A-group backend' };
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
