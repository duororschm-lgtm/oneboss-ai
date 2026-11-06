-- Local/hosted Supabase has storage.buckets. Plain PostgreSQL integration tests do not.
-- No public bucket or anonymous client storage policies: all signing is server-authorized.
do $$ begin
 if to_regclass('storage.buckets') is not null then
  insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
  values('oneboss-private','oneboss-private',false,52428800,array['image/png','application/zip'])
  on conflict(id) do nothing;
 end if;
end $$;
