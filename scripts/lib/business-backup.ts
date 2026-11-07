import assert from 'node:assert/strict';
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname, sep } from 'node:path';
import postgres from 'postgres';
import JSZip from 'jszip';

// Ordered by FK dependencies. Unknown tables fail closed instead of silently disappearing.
export const businessTables = [
  'organizations',
  'memberships',
  'service_plans',
  'service_addons',
  'quotes',
  'service_orders',
  'service_order_items',
  'payment_attempts',
  'payment_events',
  'refunds',
  'projects',
  'project_entitlements',
  'products',
  'product_facts',
  'media_assets',
  'creative_briefs',
  'design_systems',
  'artifact_versions',
  'change_requests',
  'agent_runs',
  'deliveries',
  'api_idempotency',
  'rate_limits',
  'platform_admins',
  'wechat_payments',
  'manual_payment_reports',
  'oneboss_migrations',
] as const;
export type BusinessBackup = {
  version: 1;
  createdAt: string;
  bucket: string;
  snapshot: string;
  tables: Record<string, string[]>;
  files: { path: string; size: number; sha256: string; base64: string }[];
};
export const digest = (data: string | Uint8Array) =>
  createHash('sha256').update(data).digest('hex');
const magic = Buffer.from('ONEBOSS-BACKUP-1\n');
export function encryptBackup(backup: BusinessBackup, key: Buffer) {
  assert(key.length === 32, 'BACKUP_KEY_INVALID');
  const iv = randomBytes(12),
    cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(magic);
  const bytes = Buffer.concat([cipher.update(JSON.stringify(backup)), cipher.final()]);
  return Buffer.concat([magic, iv, cipher.getAuthTag(), bytes]);
}
export function decryptBackup(bytes: Buffer, key: Buffer): BusinessBackup {
  assert(
    bytes.subarray(0, magic.length).equals(magic) && key.length === 32,
    'BACKUP_FORMAT_INVALID',
  );
  const offset = magic.length;
  const decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(offset, offset + 12));
  decipher.setAAD(magic);
  decipher.setAuthTag(bytes.subarray(offset + 12, offset + 28));
  const data = Buffer.concat([decipher.update(bytes.subarray(offset + 28)), decipher.final()]);
  const backup = JSON.parse(data.toString()) as BusinessBackup;
  assert(
    backup.version === 1 && backup.tables && Array.isArray(backup.files),
    'BACKUP_SCHEMA_INVALID',
  );
  assert.deepEqual(
    Object.keys(backup.tables).sort(),
    [...businessTables].sort(),
    'BACKUP_TABLE_SET_MISMATCH',
  );
  for (const file of backup.files) {
    safeObjectPath(file.path);
    const data = Buffer.from(file.base64, 'base64');
    assert(data.length === file.size && digest(data) === file.sha256, 'BACKUP_FILE_CORRUPT');
  }
  assert(
    new Set(backup.files.map((f) => f.path)).size === backup.files.length,
    'BACKUP_DUPLICATE_PATH',
  );
  for (const [path, expected] of referencedFiles(backup.tables)) {
    const file = backup.files.find((f) => f.path === path);
    assert(file && (!expected || file.sha256 === expected), 'BACKUP_REFERENCE_FILE_MISSING');
  }
  return backup;
}
export function safeObjectPath(path: string) {
  assert(
    path.length < 1000 &&
      /^[a-zA-Z0-9._/-]+$/.test(path) &&
      !path.startsWith('/') &&
      path.split('/').every((p) => p && p !== '.' && p !== '..'),
    'BACKUP_PATH_INVALID',
  );
  return path;
}
export function restoreTarget(url: string) {
  const target = new URL(url);
  assert(
    ['postgres:', 'postgresql:'].includes(target.protocol) &&
      target.hostname === '127.0.0.1' &&
      !target.search &&
      !target.hash &&
      target.port === '55432' &&
      /^\/oneboss_restore_[a-z0-9_]+$/.test(target.pathname),
    'ISOLATED_RESTORE_TARGET_REQUIRED',
  );
  return target.pathname.slice(1);
}
export async function trustedMigrations(tables: BusinessBackup['tables']) {
  const rows = tables.oneboss_migrations.map((row) => JSON.parse(row));
  const names = (await readdir('supabase/migrations')).filter((n) => n.endsWith('.sql')).sort();
  assert.deepEqual(rows.map((r) => r.name).sort(), names, 'BACKUP_MIGRATION_SET_MISMATCH');
  for (const name of names)
    assert(
      rows.find((r) => r.name === name)?.hash ===
        digest(await readFile(`supabase/migrations/${name}`)),
      'BACKUP_MIGRATION_HASH_MISMATCH',
    );
}
export async function snapshotBusiness(db: postgres.Sql) {
  return db.begin('isolation level repeatable read read only', async (tx) => {
    await tx`set local timezone='UTC'`;
    const existing =
      await tx`select tablename from pg_tables where schemaname='public' order by tablename`;
    assert.deepEqual(
      existing.map((r) => r.tablename),
      [...businessTables].sort(),
      'UNEXPECTED_PUBLIC_TABLES',
    );
    const tables: BusinessBackup['tables'] = {};
    for (const table of businessTables) {
      const rows = await tx.unsafe(
        `select row_to_json(t)::text as row from public.${table} t order by row_to_json(t)::text`,
      );
      tables[table] = rows.map((r) => r.row);
    }
    const [stamp] = await tx`select pg_current_snapshot()::text as snapshot`;
    await trustedMigrations(tables);
    return { tables, snapshot: stamp.snapshot as string };
  });
}
export function referencedFiles(tables: BusinessBackup['tables']) {
  const references = new Map<string, string | undefined>();
  for (const row of tables.media_assets.map((r) => JSON.parse(r)))
    references.set(safeObjectPath(row.storage_path), row.sha256);
  for (const row of tables.deliveries.map((r) => JSON.parse(r))) {
    const prefix = row.zip_path.slice(0, row.zip_path.lastIndexOf('/'));
    references.set(safeObjectPath(row.zip_path), undefined);
    for (const file of row.manifest.files) {
      if (file.storagePath) references.set(safeObjectPath(file.storagePath), file.sha256);
      if (file.path.startsWith('posters/'))
        references.set(safeObjectPath(`${prefix}/${file.path}`), file.sha256);
    }
  }
  return references;
}
export async function collectFiles(
  tables: BusinessBackup['tables'],
  download: (path: string) => Promise<Buffer>,
) {
  const files: BusinessBackup['files'] = [];
  for (const [path, expected] of referencedFiles(tables)) {
    const data = await download(path),
      sha256 = digest(data);
    assert(!expected || sha256 === expected, 'SOURCE_FILE_HASH_MISMATCH');
    files.push({ path, size: data.length, sha256, base64: data.toString('base64') });
  }
  for (const row of tables.deliveries.map((r) => JSON.parse(r))) {
    const source = files.find((f) => f.path === row.zip_path)!;
    const zip = await JSZip.loadAsync(Buffer.from(source.base64, 'base64'));
    for (const file of row.manifest.files) {
      const entry = zip.file(file.path);
      assert(entry, 'BACKUP_DELIVERY_ZIP_ENTRY_MISSING');
      const bytes = await entry.async('nodebuffer');
      assert(
        bytes.length === file.size && digest(bytes) === file.sha256,
        'BACKUP_DELIVERY_ZIP_HASH_MISMATCH',
      );
    }
  }
  // Verify each object again: a same-path replacement during download fails the backup.
  for (const file of files)
    assert(digest(await download(file.path)) === file.sha256, 'SOURCE_FILE_CHANGED');
  return files;
}
export async function restoreBusiness(backup: BusinessBackup, url: string) {
  const name = restoreTarget(url);
  await trustedMigrations(backup.tables);
  const root = resolve('.cache/restore', name);
  // A completed/failed restore must never silently overwrite an earlier directory.
  await mkdir(resolve('.cache/restore'), { recursive: true });
  await mkdir(root);
  const db = postgres(url, { max: 1, ssl: false, connect_timeout: 5 });
  try {
    await db`set timezone='UTC'`;
    const existing =
      await db`select tablename from pg_tables where schemaname in ('public','auth')`;
    assert(existing.length === 0, 'EMPTY_RESTORE_DATABASE_REQUIRED');
    await db.unsafe(
      "create schema auth; do $$ begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if; if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if; end $$; create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth to anon,authenticated; grant execute on function auth.uid() to authenticated;",
    );
    await db.unsafe(await readFile('docs/setup-supabase.sql', 'utf8'));
    await db.begin(async (tx) => {
      await tx`set local timezone='UTC'`;
      await tx.unsafe(`truncate ${businessTables.map((t) => `public.${t}`).join(',')}`);
      for (const table of businessTables) {
        const json = `[${backup.tables[table].join(',')}]`;
        await tx.unsafe(
          `insert into public.${table} select * from json_populate_recordset(null::public.${table},$1::text::json)`,
          [json],
        );
      }
    });
    for (const table of businessTables) {
      const rows = await db.unsafe(
        `select row_to_json(t)::text as row from public.${table} t order by row_to_json(t)::text`,
      );
      assert.deepEqual(
        rows.map((r) => r.row),
        backup.tables[table],
        `RESTORED_TABLE_MISMATCH_${table}`,
      );
    }
    for (const file of backup.files) {
      const path = resolve(root, 'files', safeObjectPath(file.path));
      assert(path.startsWith(root + sep), 'RESTORE_PATH_ESCAPE');
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, Buffer.from(file.base64, 'base64'), { flag: 'wx', mode: 0o600 });
      assert(digest(await readFile(path)) === file.sha256, 'RESTORED_FILE_MISMATCH');
    }
    const stranger = randomUUID();
    await db.begin(async (tx) => {
      await tx`select set_config('request.jwt.claim.sub',${stranger},true)`;
      await tx.unsafe('set local role authenticated');
      const rows = await tx`select id from organizations`;
      assert(rows.length === 0, 'RESTORED_TENANT_ISOLATION_FAILED');
    });
    const memberships = backup.tables.memberships.map((r) => JSON.parse(r));
    for (const userId of new Set<string>(memberships.map((m) => m.user_id))) {
      await db.begin(async (tx) => {
        await tx`select set_config('request.jwt.claim.sub',${userId},true)`;
        await tx.unsafe('set local role authenticated');
        const actual = (await tx`select id from organizations order by id`).map((r) => r.id);
        assert.deepEqual(
          actual,
          [...new Set(memberships.filter((m) => m.user_id === userId).map((m) => m.org_id))].sort(),
          'RESTORED_MEMBERSHIP_MISMATCH',
        );
      });
    }
    const result = {
      passed: true,
      database: name,
      tables: businessTables.length,
      rows: Object.values(backup.tables).reduce((n, rows) => n + rows.length, 0),
      files: backup.files.length,
      tenantIsolationVerified: true,
      authCredentialsIncluded: false,
      productionWrites: false,
      workerStarted: false,
      modelCalled: false,
      paymentCalled: false,
    };
    await writeFile(resolve(root, 'result.json'), JSON.stringify(result, null, 2));
    return result;
  } finally {
    await db.end({ timeout: 2 });
  }
}
