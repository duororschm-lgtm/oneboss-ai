/** Sensitive mutations and their audit record commit or roll back together. */
import { randomUUID } from 'node:crypto';
import type { Actor, Tx } from './db';
export interface AuditEntry {
 action: string; target: string; targetId?: string;
 result: 'success'|'failure'; reason?: string|null; details?: Record<string,unknown>;
}
export async function recordAudit(tx:Tx,actor:Actor,entry:AuditEntry){
 await tx`insert into admin_audit_logs(actor_user_id,action,target,target_id,request_id,result,reason,details)
 values(${actor.userId},${entry.action},${entry.target},${entry.targetId ?? null},${actor.requestId ?? randomUUID()},${entry.result},${entry.reason ?? null},${tx.json((entry.details ?? {}) as never)})`;
 return true;
}
