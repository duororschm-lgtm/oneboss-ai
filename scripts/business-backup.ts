import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { nativeCheck } from './lib/native-check';
import { outboundFetch } from '../src/lib/security/http';
import {
  snapshotBusiness,
  collectFiles,
  encryptBackup,
  decryptBackup,
  restoreBusiness,
  digest,
} from './lib/business-backup';

const command = process.argv[2];
try {
  if (command === 'create') {
    assert(process.env.RUN_BUSINESS_BACKUP === 'true', 'BACKUP_EXPLICIT_OPT_IN_REQUIRED');
    assert(
      process.env.NEXT_PUBLIC_SUPABASE_URL === 'https://mxyocfnzrfpujnkqikbp.supabase.co',
      'EXPECTED_BACKUP_SOURCE_REQUIRED',
    );
    const bucket = process.env.STORAGE_BUCKET || 'oneboss-private';
    const storage = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        global: { fetch: outboundFetch },
        auth: { persistSession: false, autoRefreshToken: false },
      },
    ).storage.from(bucket);
    const snapshot = await nativeCheck(snapshotBusiness);
    const files = await collectFiles(snapshot.tables, async (path) => {
      const result = await storage.download(path);
      assert(!result.error && result.data, 'BACKUP_SOURCE_FILE_UNAVAILABLE');
      return Buffer.from(await result.data.arrayBuffer());
    });
    const createdAt = new Date().toISOString();
    const id = createdAt.replace(/[^0-9]/g, '');
    const backup = { version: 1 as const, createdAt, bucket, ...snapshot, files };
    const key = randomBytes(32),
      encrypted = encryptBackup(backup, key);
    decryptBackup(encrypted, key);
    await mkdir('.secrets/backup-keys', { recursive: true });
    await mkdir('.cache/business-backups', { recursive: true });
    await writeFile(`.secrets/backup-keys/${id}.key`, key, { flag: 'wx', mode: 0o600 });
    const archive = `.cache/business-backups/${id}.oneboss`;
    await writeFile(archive, encrypted, { flag: 'wx', mode: 0o600 });
    const result = {
      passed: true,
      id,
      archive,
      archiveSha256: digest(encrypted),
      tables: Object.keys(snapshot.tables).length,
      rows: Object.values(snapshot.tables).reduce((n, rows) => n + rows.length, 0),
      files: files.length,
      encrypted: true,
      authCredentialsIncluded: false,
      restoreVerified: false,
    };
    await writeFile(`.cache/business-backups/${id}.json`, JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
  } else if (command === 'restore') {
    assert(process.env.RUN_BUSINESS_RESTORE === 'true', 'RESTORE_EXPLICIT_OPT_IN_REQUIRED');
    const id = process.argv[3];
    assert(/^\d{17}$/.test(id || ''), 'BACKUP_ID_REQUIRED');
    const bytes = await readFile(`.cache/business-backups/${id}.oneboss`);
    const key = await readFile(`.secrets/backup-keys/${id}.key`);
    const backup = decryptBackup(bytes, key);
    const restored = await restoreBusiness(backup, process.env.RESTORE_DATABASE_URL || '');
    const reportPath = `.cache/business-backups/${id}.json`;
    const report = JSON.parse(await readFile(reportPath, 'utf8'));
    assert(report.archiveSha256 === digest(bytes), 'BACKUP_REPORT_ARCHIVE_MISMATCH');
    await writeFile(
      reportPath,
      JSON.stringify(
        {
          ...report,
          restoreVerified: true,
          lastRestore: restored.database,
          restoredAt: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
    console.log(JSON.stringify(restored));
  } else throw Error('USE_CREATE_OR_RESTORE');
} catch (error) {
  // Database/Storage SDK error messages may contain sensitive details; emit only a safe code.
  const message = error instanceof Error ? error.message : '';
  console.error(
    JSON.stringify({
      passed: false,
      error: /^[A-Z0-9_]+$/.test(message) ? message : 'BUSINESS_BACKUP_OPERATION_FAILED',
      code: /^[A-Z0-9_]+$/.test((error as any)?.code || '') ? (error as any).code : undefined,
      errorName: error instanceof Error ? error.name : 'Unknown',
      trace:
        error instanceof Error
          ? error.stack
              ?.split('\n')
              .filter((line) => /^\s+at /.test(line))
              .slice(0, 3)
          : undefined,
    }),
  );
  process.exitCode = 1;
}
