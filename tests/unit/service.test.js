import { EventEmitter } from 'node:events';
import { expect, it, vi } from 'vitest';
import { startService } from '../../scripts/start-service.mjs';
class Child extends EventEmitter {
  kill = vi.fn(() => true);
}
function setup() {
  const children = [new Child(), new Child()];
  let index = 0;
  const spawn = vi.fn(() => children[index++]);
  const onExit = vi.fn();
  const service = startService({
    spawnProcess: spawn,
    onExit,
    env: { PORT: '3101', RENDER_EXTERNAL_URL: 'https://example.onrender.com' },
  });
  return { children, spawn, onExit, service };
}
it('starts both the HTTP server and queue worker with the platform origin', () => {
  const f = setup();
  try {
    expect(f.spawn).toHaveBeenCalledTimes(2);
    expect(f.spawn.mock.calls[0][1]).toContain('3101');
    expect(f.spawn.mock.calls[1][1]).toEqual(['--import', 'tsx', 'scripts/worker.ts']);
    expect(f.spawn.mock.calls[1][2].env.APP_URL).toBe('https://example.onrender.com');
  } finally {
    f.service.stop();
    for (const child of f.children) child.emit('exit', 0);
  }
});
it('stops the surviving process and fails when the worker exits unexpectedly', () => {
  const f = setup();
  f.children[1].emit('exit', 1);
  expect(f.children[0].kill).toHaveBeenCalledWith('SIGTERM');
  f.children[0].emit('exit', 0);
  expect(f.onExit).toHaveBeenCalledWith(1);
});
it('drains both processes on shutdown and returns success', () => {
  const f = setup();
  f.service.stop();
  expect(f.children.every((c) => c.kill.mock.calls[0][0] === 'SIGTERM')).toBe(true);
  for (const child of f.children) child.emit('exit', 0);
  expect(f.onExit).toHaveBeenCalledWith(0);
});
