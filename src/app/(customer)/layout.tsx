import { CustomerSession } from '../../components/customer/session';
import { CustomerShell } from '../../components/customer/shell';
import './customer.css';
export const dynamic = 'force-dynamic';
export default function CustomerLayout({ children }: { children: React.ReactNode }) {
  const env = process.env;
  return (
    <CustomerSession
      config={{
        url: env.NEXT_PUBLIC_SUPABASE_URL,
        key: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
        emailReady: env.CUSTOMER_EMAIL_READY === 'true',
      }}
    >
      <CustomerShell>{children}</CustomerShell>
    </CustomerSession>
  );
}
