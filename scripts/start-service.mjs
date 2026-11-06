import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';

/** One web container hosts the HTTP server and a durable database queue worker. */
export function startService({
  spawnProcess = spawn,
  env = process.env,
  onExit = (code) => {
    process.exitCode = code;
  },
  shutdownMs = 20000,
} = {}) {
  const port = env.PORT || '10000';
  if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535)
    throw new Error('PORT_INVALID');
  const childEnv = {
    ...env,
    NODE_ENV: 'production',
    PORT: port,
    APP_URL: env.APP_URL || env.RENDER_EXTERNAL_URL || '',
  };
  const children = [];
  const exited = new Set();
  let stopping = false,
    finished = false,
    finalCode = 0,
    timer;
  function finish() {
    if (finished || exited.size !== children.length) return;
    finished = true;
    clearTimeout(timer);
    process.off('SIGTERM', terminate);
    process.off('SIGINT', terminate);
    onExit(finalCode);
  }
  function stop(code) {
    if (stopping) return;
    stopping = true;
    finalCode = code;
    for (const child of children) if (!exited.has(child)) child.kill('SIGTERM');
    timer = setTimeout(() => {
      for (const child of children) if (!exited.has(child)) child.kill('SIGKILL');
    }, shutdownMs);
    timer.unref();
    finish();
  }
  function terminate() {
    stop(0);
  }
  process.on('SIGTERM', terminate);
  process.on('SIGINT', terminate);
  const commands = [
    ['web', ['node_modules/next/dist/bin/next', 'start', '--hostname', '0.0.0.0', '--port', port]],
    ['worker', ['--import', 'tsx', 'scripts/worker.ts']],
  ];
  for (const [name, args] of commands) {
    const child = spawnProcess(process.execPath, args, { env: childEnv, stdio: 'inherit' });
    children.push(child);
    child.once('error', () => {
      console.error(`${name}: PROCESS_START_FAILED`);
      exited.add(child);
      stop(1);
      finish();
    });
    child.once('exit', () => {
      exited.add(child);
      if (!stopping) {
        console.error(`${name}: PROCESS_EXITED`);
        stop(1);
      }
      finish();
    });
  }
  return { stop: terminate, children };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) startService();
