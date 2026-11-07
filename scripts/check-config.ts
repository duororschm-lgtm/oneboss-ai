import { X509Certificate } from 'node:crypto';
import { databaseConfig } from '../src/lib/core/database-config';
import { AppError } from '../src/lib/core/errors';

// Presence/format checks only. Never logs values or connects to external services.
const required = [
  'DATABASE_URL',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'MIMO_API_KEY',
  'MIMO_MODEL',
] as const;
const missing = required.filter((name) => !process.env[name]?.trim());
const issues: string[] = [];
if (process.env.DATABASE_URL) {
  try {
    databaseConfig();
  } catch (error) {
    issues.push(error instanceof AppError ? error.code : 'DATABASE_CONFIG_INVALID');
  }
}
if (process.env.DATABASE_CA_CERT) {
  try {
    const certificate = new X509Certificate(process.env.DATABASE_CA_CERT);
    if (Date.now() > Date.parse(certificate.validTo)) issues.push('DATABASE_CA_EXPIRED');
  } catch {
    issues.push('DATABASE_CA_INVALID');
  }
}
if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
  try {
    const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL);
    if (
      url.username ||
      url.password ||
      (url.protocol !== 'https:' &&
        !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))
    )
      issues.push('SUPABASE_URL_INVALID');
  } catch {
    issues.push('SUPABASE_URL_INVALID');
  }
}
if (process.env.MIMO_BASE_URL && process.env.MIMO_BASE_URL !== 'https://api.xiaomimimo.com/v1')
  issues.push('MIMO_ENDPOINT_NOT_ALLOWED');
const ready = missing.length === 0 && issues.length === 0;
console.log(
  JSON.stringify(
    {
      configurationReady: ready,
      missing,
      issues,
      creativeAdapterConfigured: Boolean(process.env.CREATIVE_ADAPTER_MODULE),
      remoteServicesVerified: false,
    },
    null,
    2,
  ),
);
if (!ready) process.exitCode = 1;
