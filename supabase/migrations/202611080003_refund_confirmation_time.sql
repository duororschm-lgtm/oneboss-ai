-- Historical confirmed refunds have no provable confirmation timestamp.
-- Leave NULL and report as undated; never substitute request time.
alter table refunds add column if not exists confirmed_at timestamptz;
create index if not exists refunds_confirmed_at on refunds(confirmed_at) where status='CONFIRMED';
