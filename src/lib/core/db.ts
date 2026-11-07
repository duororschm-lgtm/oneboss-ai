import postgres from 'postgres';
import { databaseConfig } from './database-config';
let db: ReturnType<typeof postgres> | undefined;
export function database() {
  if (!db) {
    const config = databaseConfig();
    db = postgres(config.url, config.options);
  }
  return db;
}
export async function closeDatabase() {
  await db?.end({ timeout: 5 });
  db = undefined;
}
export type Tx = postgres.TransactionSql;
export type Actor = { userId: string; requestId?: string };
export async function transaction<T>(actor: Actor, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return (await database().begin(async (sql) => {
    await sql`select set_config('request.jwt.claim.sub',${actor.userId},true)`;
    return fn(sql);
  })) as T;
}
