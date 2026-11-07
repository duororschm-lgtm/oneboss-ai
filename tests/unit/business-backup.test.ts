import { describe, it, expect } from 'vitest';
import { randomBytes } from 'node:crypto';
import {
  businessTables,
  encryptBackup,
  decryptBackup,
  collectFiles,
  digest,
  restoreTarget,
  safeObjectPath,
  type BusinessBackup,
} from '../../scripts/lib/business-backup';

const backup = (): BusinessBackup => ({
  version: 1,
  createdAt: new Date().toISOString(),
  bucket: 'private',
  snapshot: '1:2:',
  tables: Object.fromEntries(businessTables.map((t) => [t, []])),
  files: [],
});
describe('encrypted business recovery guards', () => {
  it('authenticates archive contents, header and key without plaintext leakage', () => {
    const data = backup();
    data.tables.organizations = ['{"name":"private customer"}'];
    const key = randomBytes(32),
      encrypted = encryptBackup(data, key);
    expect(encrypted.includes(Buffer.from('private customer'))).toBe(false);
    expect(decryptBackup(encrypted, key)).toEqual(data);
    expect(() => decryptBackup(encrypted, randomBytes(32))).toThrow();
    const corrupt = Buffer.from(encrypted);
    corrupt[corrupt.length - 1] ^= 1;
    expect(() => decryptBackup(corrupt, key)).toThrow();
    const badHeader = Buffer.from(encrypted);
    badHeader[0] ^= 1;
    expect(() => decryptBackup(badHeader, key)).toThrow();
  });
  it('rejects missing, hash-mismatched or changing referenced files', async () => {
    const data = backup(),
      bytes = Buffer.from('image bytes');
    data.tables.media_assets = [
      JSON.stringify({ storage_path: 'org/project/asset.png', sha256: digest(bytes) }),
    ];
    await expect(
      collectFiles(data.tables, async () => {
        throw Error('missing');
      }),
    ).rejects.toThrow();
    await expect(collectFiles(data.tables, async () => Buffer.from('bad'))).rejects.toThrow(
      'SOURCE_FILE_HASH_MISMATCH',
    );
    let calls = 0;
    await expect(
      collectFiles(data.tables, async () => (++calls === 1 ? bytes : Buffer.from('replaced'))),
    ).rejects.toThrow('SOURCE_FILE_CHANGED');
    expect(await collectFiles(data.tables, async () => bytes)).toEqual([
      {
        path: 'org/project/asset.png',
        size: bytes.length,
        sha256: digest(bytes),
        base64: bytes.toString('base64'),
      },
    ]);
  });
  it('rejects production targets and connection-string host overrides before connecting', () => {
    for (const url of [
      'postgres://postgres@db.example.com:55432/oneboss_restore_test',
      'postgres://postgres@127.0.0.1:55432/postgres',
      'postgres://postgres@127.0.0.1:5432/oneboss_restore_test',
      'postgres://postgres@127.0.0.1:55432/oneboss_restore_test?host=production',
    ])
      expect(() => restoreTarget(url)).toThrow();
    expect(restoreTarget('postgres://postgres@127.0.0.1:55432/oneboss_restore_test')).toBe(
      'oneboss_restore_test',
    );
    for (const path of [
      '../secret',
      'org/../../key',
      '/absolute',
      'C:/secret',
      'org\\file',
      'org//file',
    ])
      expect(() => safeObjectPath(path)).toThrow();
  });
  it('refuses incomplete table sets and internally corrupt files even inside an authenticated archive', () => {
    const key = randomBytes(32),
      data = backup();
    delete data.tables.projects;
    expect(() => decryptBackup(encryptBackup(data, key), key)).toThrow('BACKUP_TABLE_SET_MISMATCH');
    const wrongFile = backup();
    wrongFile.files.push({ path: 'org/file.png', size: 3, sha256: 'bad', base64: 'YWJj' });
    expect(() => decryptBackup(encryptBackup(wrongFile, key), key)).toThrow('BACKUP_FILE_CORRUPT');
  });
});
