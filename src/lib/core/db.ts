import postgres from 'postgres';
import { AppError } from './errors';
let db: ReturnType<typeof postgres> | undefined;
export function database() {
  if (!process.env.DATABASE_URL) throw new AppError('DATABASE_NOT_CONFIGURED', 503);
  return (db ??= postgres(process.env.DATABASE_URL, {
    max: 10,
    prepare: false,
    connect_timeout: 10,
  }));
}
export async function closeDatabase() {
  await db?.end();
  db = undefined;
}
export type Tx = postgres.TransactionSql;
export type Actor = { userId: string };
export async function transaction<T>(actor: Actor, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return (await database().begin(async (sql) => {
    await sql`select set_config('request.jwt.claim.sub',${actor.userId},true)`;
    return fn(sql);
  })) as T;
}
