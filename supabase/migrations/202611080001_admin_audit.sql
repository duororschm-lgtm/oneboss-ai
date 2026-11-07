-- 管理员操作审计。
-- 只记录管理员的敏感动作（收款核验、退款核验），不记录客户请求。
create table if not exists admin_audit_logs(
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null,
  actor_email text,
  action text not null,
  target text not null,
  result text not null check(result in ('success','failure')),
  reason text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_logs_created on admin_audit_logs(created_at desc);

alter table admin_audit_logs enable row level security;
revoke all on admin_audit_logs from anon, authenticated;
