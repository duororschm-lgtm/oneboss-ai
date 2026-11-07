import { mkdir, open, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';

export type AcceptanceState = {
  version: 1;
  purpose: 'temporary-hosted-write-acceptance';
  nonce: string;
  email: string;
  password: string;
  phase: string;
  createdAt: string;
  userId?: string;
  orgId?: string;
  projectId?: string;
  operations: Record<string, string>;
  runs: unknown[];
  cleaned?: boolean;
};
export async function createCheckpoint(path: string, email: string, password: string) {
  await mkdir(dirname(path), { recursive: true });
  const file = await open(path, 'wx', 0o600);
  const state: AcceptanceState = {
    version: 1,
    purpose: 'temporary-hosted-write-acceptance',
    nonce: randomUUID(),
    email,
    password,
    phase: 'identity-planned',
    createdAt: new Date().toISOString(),
    operations: {},
    runs: [],
  };
  try {
    await file.writeFile(JSON.stringify(state));
  } finally {
    await file.close();
  }
  return state;
}
export async function readCheckpoint(path: string): Promise<AcceptanceState> {
  const state = JSON.parse(await readFile(path, 'utf8')) as AcceptanceState;
  assert(
    state.version === 1 &&
      state.purpose === 'temporary-hosted-write-acceptance' &&
      /^[0-9a-f-]{36}$/.test(state.nonce) &&
      state.email.startsWith('oneboss-hosted-write-') &&
      !state.cleaned,
    'VALID_ACTIVE_ACCEPTANCE_CHECKPOINT_REQUIRED',
  );
  return state;
}
export async function saveCheckpoint(path: string, state: AcceptanceState) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(state), { mode: 0o600 });
  await rename(temporary, path);
}
export function operationKey(state: AcceptanceState, route: string, body: unknown) {
  const signature = createHash('sha256')
    .update(JSON.stringify([route, body]))
    .digest('hex');
  return (state.operations[signature] ||= randomUUID());
}
export function assertAcceptanceOwner(
  state: AcceptanceState,
  user: { id: string; email?: string; user_metadata: any },
  ownerId: string,
) {
  assert(
    user.id === state.userId &&
      user.id === ownerId &&
      user.email === state.email &&
      user.user_metadata?.purpose === state.purpose &&
      user.user_metadata?.acceptanceNonce === state.nonce,
    'TEST_IDENTITY_OWNER_MISMATCH',
  );
}
