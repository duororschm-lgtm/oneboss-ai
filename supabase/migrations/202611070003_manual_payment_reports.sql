create table manual_payment_reports(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null references organizations(id),
 order_id uuid not null references service_orders(id),
 attempt_id uuid not null references payment_attempts(id),
 user_id uuid not null,
 details text not null check(char_length(details) between 1 and 1000),
 created_at timestamptz not null default now()
);
alter table manual_payment_reports enable row level security;
revoke all on manual_payment_reports from anon,authenticated;
create policy member_read on manual_payment_reports for select to authenticated using(public.is_org_member(org_id));
grant select on manual_payment_reports to authenticated;
create index manual_payment_reports_order on manual_payment_reports(order_id,created_at desc);
