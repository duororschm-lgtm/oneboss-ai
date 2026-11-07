-- Preserve existing authorized administrators as owners. No new administrators are granted.
alter table platform_admins add column role text not null default 'owner' check(role in ('owner','finance','operations','reviewer'));
alter table admin_audit_logs add column request_id text;
alter table admin_audit_logs add column target_id uuid;
