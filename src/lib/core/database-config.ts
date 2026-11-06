import type postgres from 'postgres';
import { AppError } from './errors';

/** Server-only configuration. Error messages never contain URLs or credentials. */
export function databaseConfig(env: Record<string, string | undefined> = process.env) {
  const raw = env.DATABASE_URL;
  if (!raw) throw new AppError('DATABASE_NOT_CONFIGURED', 503);
  let url: URL;
  let uriPassword: string;
  try {
    url = new URL(raw);
    if (
      !['postgres:', 'postgresql:'].includes(url.protocol) ||
      !url.hostname ||
      !url.username ||
      !url.pathname.slice(1)
    )
      throw new Error();
    uriPassword = decodeURIComponent(url.password);
  } catch {
    throw new AppError('DATABASE_URL_INVALID', 503);
  }
  const loopback = ['localhost', '127.0.0.1', '[::1]', '::1'].includes(url.hostname);
  const override = env.DATABASE_PASSWORD;
  if (
    !override &&
    (/\[YOUR[-_]PASSWORD\]|\[PASSWORD\]|<YOUR[-_]PASSWORD>/i.test(uriPassword) ||
      (!loopback && !uriPassword))
  ) {
    throw new AppError('DATABASE_PASSWORD_REQUIRED', 503);
  }
  const options: postgres.Options<{}> = {
    max: 10,
    prepare: false,
    connect_timeout: 10,
    // postgres.js 'require' disables certificate validation. Always supply strict options remotely.
    ssl: loopback
      ? false
      : { rejectUnauthorized: true, ...(env.DATABASE_CA_CERT ? { ca: env.DATABASE_CA_CERT } : {}) },
    ...(override ? { password: override } : {}),
  };
  return { url: raw, options };
}
