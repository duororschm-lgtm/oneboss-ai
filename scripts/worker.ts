import { runOne } from '../src/lib/workflows/runner';
import { randomUUID } from 'node:crypto';
import { database, closeDatabase } from '../src/lib/core/db';
const workerId = randomUUID();
let stop = false;
await database()`insert into worker_instances(id,version) values(${workerId},${process.env.DEPLOY_COMMIT_SHA || 'local-unknown'})`;
const pulse = setInterval(()=>{
 void database()`update worker_instances set last_seen_at=now(),current_run_id=(select id from agent_runs where worker_id=${workerId} and status='RUNNING' limit 1) where id=${workerId}`.catch(()=>{console.error('WORKER_HEARTBEAT_FAILED');});
},15000);
process.on('SIGTERM', () => {
  stop = true;
});
process.on('SIGINT', () => {
  stop = true;
});
try {
  while (!stop) {
    if (!(await runOne(workerId))) await new Promise((resolve) => setTimeout(resolve, 1000));
  }
} finally {
  clearInterval(pulse);
  await database()`update worker_instances set stopped_at=now(),last_seen_at=now(),current_run_id=null where id=${workerId}`;
  await closeDatabase();
}
