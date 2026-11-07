import { lookup } from 'node:dns/promises';
import postgres from 'postgres';
import { databaseConfig } from '../../src/lib/core/database-config';
import { databaseTunnel } from './database-tunnel';

/** Fresh bounded connections for operator-only acceptance/cleanup over unreliable local TCP. */
export async function nativeCheck<T>(
  fn: (sql: ReturnType<typeof postgres>) => Promise<T>,
): Promise<T> {
  const config = databaseConfig(),
    target = new URL(config.url);
  const addresses = await lookup(target.hostname, { all: true });
  const proxy = process.env.DATABASE_HTTP_PROXY;
  for (let attempt = 0; attempt < 4; attempt++) {
    const override =
      attempt > 0 && config.options.ssl && addresses.length
        ? {
            host: addresses[(attempt - 1) % addresses.length].address,
            ssl: {
              ...(typeof config.options.ssl === 'object' ? config.options.ssl : {}),
              servername: target.hostname,
              rejectUnauthorized: true,
            },
          }
        : {};
    const sql = postgres(config.url, {
      ...config.options,
      ...override,
      max: 1,
      connect_timeout: 10,
      ...(proxy
        ? {
            socket: () => databaseTunnel(target, proxy),
            ssl: {
              ...(typeof config.options.ssl === 'object' ? config.options.ssl : {}),
              servername: target.hostname,
              rejectUnauthorized: true,
            },
          }
        : {}),
    });
    try {
      return await fn(sql);
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (
        attempt === 3 ||
        !code ||
        !['ECONNRESET', 'CONNECT_TIMEOUT', 'CONNECTION_CLOSED', 'ETIMEDOUT'].includes(code)
      )
        throw error;
      console.log(JSON.stringify({ nativeConnectionRetry: attempt + 1, errorClass: code }));
    } finally {
      await sql.end({ timeout: 2 });
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error('NATIVE_CONNECTION_RETRIES_EXHAUSTED');
}
