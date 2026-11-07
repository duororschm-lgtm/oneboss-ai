import net from 'node:net';
import { AppError, assert } from '../../src/lib/core/errors';

/** Operator-only CONNECT through an explicitly configured local proxy; Postgres still negotiates
 * and verifies end-to-end TLS with the original database hostname after the tunnel is established. */
export async function databaseTunnel(target: URL, proxyUrl: string): Promise<net.Socket> {
  const proxy = new URL(proxyUrl);
  assert(
    proxy.protocol === 'http:' &&
      ['127.0.0.1', 'localhost', '[::1]'].includes(proxy.hostname) &&
      !proxy.username &&
      !proxy.password,
    'LOCAL_DATABASE_PROXY_REQUIRED',
  );
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: proxy.hostname, port: Number(proxy.port || 80) });
    let data = Buffer.alloc(0),
      settled = false;
    const fail = () => {
      if (settled) return;
      settled = true;
      socket.destroy();
      reject(new AppError('DATABASE_PROXY_FAILED', 503));
    };
    socket.setTimeout(10000, fail);
    socket.once('error', fail);
    socket.once('connect', () =>
      socket.write(
        `CONNECT ${target.hostname}:${target.port || 5432} HTTP/1.1\r\nHost: ${target.hostname}:${target.port || 5432}\r\n\r\n`,
      ),
    );
    const receive = (chunk: Buffer) => {
      data = Buffer.concat([data, chunk]);
      if (data.length > 16384) return fail();
      const end = data.indexOf('\r\n\r\n');
      if (end < 0) return;
      if (!/^HTTP\/1\.[01] 200\b/.test(data.subarray(0, end).toString('ascii'))) return fail();
      settled = true;
      socket.removeListener('data', receive);
      socket.removeListener('error', fail);
      socket.setTimeout(0);
      socket.removeListener('timeout', fail);
      if (data.length > end + 4) socket.unshift(data.subarray(end + 4));
      resolve(socket);
    };
    socket.on('data', receive);
  });
}
