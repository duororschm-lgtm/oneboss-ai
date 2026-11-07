import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { database, closeDatabase } from '../src/lib/core/db';
const db = database();
try {
  await db.begin(async (sql) => {
    await sql`select pg_advisory_xact_lock(601106)`;
    await sql`create table if not exists public.oneboss_migrations(name text primary key,hash text not null,applied_at timestamptz not null default now())`;
    await sql`alter table public.oneboss_migrations enable row level security`;
    await sql`revoke all on public.oneboss_migrations from anon,authenticated`;
    for (const name of (await readdir('supabase/migrations'))
      .filter((n) => n.endsWith('.sql'))
      .sort()) {
      const body = await readFile(`supabase/migrations/${name}`, 'utf8'),
        // 哈希按 LF 归一后计算：Windows 的 core.autocrlf=true 会把 SQL 检出成 CRLF，
        // 若直接对原始内容取哈希，会和数据库里记录的 LF 哈希不一致，导致迁移被误判为"被修改"。
        hash = createHash('sha256')
          .update(body.replace(/\r\n/g, '\n'))
          .digest('hex');
      const [previous] = await sql`select hash from oneboss_migrations where name=${name}`;
      if (previous) {
        if (previous.hash !== hash) throw new Error(`Migration changed: ${name}`);
        continue;
      }
      await sql.unsafe(body);
      await sql`insert into oneboss_migrations(name,hash) values(${name},${hash})`;
      console.log('Applied', name);
    }
  });
} finally {
  await closeDatabase();
}
