-- Additive APIv3 Native payment state; existing sandbox/manual records retain their semantics.
alter table service_orders add column checkout_blocked boolean not null default false;
alter table payment_attempts drop constraint payment_attempts_provider_check;
alter table payment_attempts add constraint payment_attempts_provider_check check(provider in ('sandbox','manual_verified','wechat_native'));
alter table payment_events alter column verified_by drop not null;
alter table payment_events add column verification_method text not null default 'actor' check(verification_method in ('actor','provider_signature'));
create table wechat_payments(
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  order_id uuid not null references service_orders(id),
  attempt_id uuid not null unique references payment_attempts(id),
  out_trade_no text not null unique check(out_trade_no ~ '^[a-f0-9]{32}$'),
  state text not null default 'PENDING' check(state in ('PENDING','SUCCESS','CLOSED')),
  code_url text,
  expires_at timestamptz not null,
  transaction_id text unique,
  created_at timestamptz not null default now()
);
create unique index one_pending_wechat_payment on wechat_payments(order_id) where state='PENDING';
alter table wechat_payments enable row level security;
revoke all on wechat_payments from anon,authenticated;
-- Only trusted server handlers can create or reconcile sessions. Account API returns safe fields.
create index wechat_payments_order on wechat_payments(order_id);
