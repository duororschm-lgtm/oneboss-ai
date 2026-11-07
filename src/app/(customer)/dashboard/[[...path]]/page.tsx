import { Dashboard } from '../../../../components/customer/dashboard';
export const metadata = { title: '客户工作台', robots: { index: false, follow: false } };
export default async function Page({ params }: { params: Promise<{ path?: string[] }> }) {
  return <Dashboard path={(await params).path || []} />;
}
