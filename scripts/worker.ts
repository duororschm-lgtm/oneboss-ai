import { runOne } from '../src/lib/workflows/runner';
import { closeDatabase } from '../src/lib/core/db';
let stop = false;
process.on('SIGTERM', () => {
  stop = true;
});
process.on('SIGINT', () => {
  stop = true;
});
try {
  while (!stop) {
    if (!(await runOne())) await new Promise((resolve) => setTimeout(resolve, 1000));
  }
} finally {
  await closeDatabase();
}
