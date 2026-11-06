import { expect, it } from 'vitest';
import postgres from 'postgres';
import { databaseConfig } from '../../src/lib/core/database-config';
it('accepts a separate raw password without URI encoding or logging it', async () => {
  const password = 'fixture-only:@/%?#';
  const config = databaseConfig({
    DATABASE_URL: 'postgresql://postgres.test:[YOUR-PASSWORD]@db.example.test:5432/postgres',
    DATABASE_PASSWORD: password,
  });
  const client = postgres(config.url, config.options);
  try {
    expect(client.options.pass).toBe(password);
    expect(client.options.ssl).toEqual({ rejectUnauthorized: true });
  } finally {
    await client.end();
  }
});
it('rejects a password placeholder unless a separate password is supplied', () => {
  expect(() =>
    databaseConfig({
      DATABASE_URL: 'postgresql://postgres:[YOUR-PASSWORD]@db.example.test/postgres',
    }),
  ).toThrow('DATABASE_PASSWORD_REQUIRED');
});
it('does not allow URI sslmode to weaken remote certificate verification', async () => {
  const config = databaseConfig({
    DATABASE_URL: 'postgres://postgres:fixture-only@db.example.test/postgres?sslmode=disable',
  });
  const client = postgres(config.url, config.options);
  try {
    expect(client.options.ssl).toEqual({ rejectUnauthorized: true });
  } finally {
    await client.end();
  }
});
it('supports a provider CA and loopback development without changing verification remotely', () => {
  const remote = databaseConfig({
    DATABASE_URL: 'postgres://postgres:fixture-only@db.example.test/postgres',
    DATABASE_CA_CERT: 'fixture-ca',
  });
  expect(remote.options.ssl).toEqual({ rejectUnauthorized: true, ca: 'fixture-ca' });
  expect(
    databaseConfig({ DATABASE_URL: 'postgres://postgres@127.0.0.1:5432/local' }).options.ssl,
  ).toBe(false);
});
it.each([
  'https://example.test',
  'not-a-database-url',
  'postgres://postgres:bad%value@db.example.test/postgres',
])('returns a safe error for invalid connection configuration', (url) => {
  expect(() => databaseConfig({ DATABASE_URL: url })).toThrow('DATABASE_URL_INVALID');
});
