-- Real task attribution; combined production remains one task.
alter table agent_runs add column employee_key text;
alter table agent_runs add column stage text;
alter table agent_runs add column worker_id uuid;
update agent_runs set employee_key=case role when 'intake' then 'product_analyst' when 'design' then 'creative_director' when 'generate' then 'production_team' when 'change' then 'production_team' when 'publish' then 'delivery_specialist' when 'delivery' then 'delivery_specialist' else 'unmapped' end;
create table task_events (
 id bigint generated always as identity primary key,
 org_id uuid not null references organizations(id) on delete cascade,
 run_id uuid not null references agent_runs(id) on delete cascade,
 status text not null, stage text, attempt integer not null,
 error_class text, created_at timestamptz not null default clock_timestamp()
);
create index task_events_run on task_events(run_id,id);
alter table task_events enable row level security;
revoke all on task_events from anon,authenticated;
create table worker_instances (
 id uuid primary key, version text not null, started_at timestamptz not null default now(),
 last_seen_at timestamptz not null default now(), stopped_at timestamptz,
 current_run_id uuid references agent_runs(id) on delete set null
);
alter table worker_instances enable row level security;
revoke all on worker_instances from anon,authenticated;
create function record_task_transition() returns trigger language plpgsql as $$
begin
 new.employee_key=case new.role when 'intake' then 'product_analyst' when 'design' then 'creative_director' when 'generate' then 'production_team' when 'change' then 'production_team' when 'publish' then 'delivery_specialist' when 'delivery' then 'delivery_specialist' else 'unmapped' end;
 if TG_OP='INSERT' then
   insert into task_events(org_id,run_id,status,stage,attempt,error_class) values(new.org_id,new.id,new.status,new.stage,new.attempt,new.error_class);
 elsif new.status is distinct from old.status or new.stage is distinct from old.stage or new.attempt is distinct from old.attempt then
   insert into task_events(org_id,run_id,status,stage,attempt,error_class) values(new.org_id,new.id,new.status,new.stage,new.attempt,new.error_class);
 end if;
 return new;
end $$;
-- AFTER trigger cannot assign NEW; use a separate BEFORE attribution trigger.
create function attribute_task_employee() returns trigger language plpgsql as $$ begin
 new.employee_key=case new.role when 'intake' then 'product_analyst' when 'design' then 'creative_director' when 'generate' then 'production_team' when 'change' then 'production_team' when 'publish' then 'delivery_specialist' when 'delivery' then 'delivery_specialist' else 'unmapped' end; return new; end $$;
create trigger attribute_task_employee before insert or update on agent_runs for each row execute function attribute_task_employee();
create trigger record_task_transition after insert or update on agent_runs for each row execute function record_task_transition();
create function task_events_append_only() returns trigger language plpgsql as $$ begin
 if TG_OP='DELETE' and pg_trigger_depth()>1 then return old; end if;
 raise exception 'TASK_EVENTS_APPEND_ONLY'; end $$;
create trigger task_events_append_only before update or delete on task_events for each row execute function task_events_append_only();
