import { describe, it, expect } from 'vitest';
import {
  resolveCurrentRun,
  hasSucceededRole,
  getLatestTerminalFailure,
  needsCustomerAction,
  getWorkflowStatus,
  computeProgress,
} from '../../src/components/customer/production-progress';
import type { Row } from '../../src/lib/customer/types';

const mkRun = (overrides: Partial<Row> = {}): Row => ({
  id: `run-${Math.random().toString(36).slice(2)}`,
  role: 'design',
  status: 'SUCCEEDED',
  attempt: 1,
  created_at: new Date().toISOString(),
  ...overrides,
});

const WORKFLOW_ROLES = ['intake', 'design', 'generate', 'publish', 'delivery'];

describe('Production Progress — status semantics', () => {
  // --- resolveCurrentRun ---
  describe('resolveCurrentRun', () => {
    it('returns RUNNING run when present', () => {
      const runs = [
        mkRun({ role: 'design', status: 'RUNNING' }),
        mkRun({ role: 'intake', status: 'SUCCEEDED' }),
      ];
      expect(resolveCurrentRun(runs)?.role).toBe('design');
    });

    it('returns QUEUED when no RUNNING', () => {
      const runs = [
        mkRun({ role: 'generate', status: 'QUEUED' }),
        mkRun({ role: 'design', status: 'SUCCEEDED' }),
      ];
      expect(resolveCurrentRun(runs)?.role).toBe('generate');
    });

    it('returns null when all succeeded (no active task)', () => {
      const runs = [
        mkRun({ role: 'design', status: 'SUCCEEDED' }),
        mkRun({ role: 'generate', status: 'SUCCEEDED' }),
      ];
      expect(resolveCurrentRun(runs)).toBeNull();
    });

    it('prefers RUNNING over QUEUED', () => {
      const runs = [
        mkRun({ role: 'design', status: 'QUEUED' }),
        mkRun({ role: 'generate', status: 'RUNNING' }),
      ];
      expect(resolveCurrentRun(runs)?.role).toBe('generate');
    });
  });

  // --- hasSucceededRole ---
  describe('hasSucceededRole', () => {
    it('returns true when role has SUCCEEDED run', () => {
      const runs = [mkRun({ role: 'design', status: 'SUCCEEDED' })];
      expect(hasSucceededRole(runs, 'design')).toBe(true);
    });

    it('returns false when role only has FAILED', () => {
      const runs = [mkRun({ role: 'design', status: 'FAILED' })];
      expect(hasSucceededRole(runs, 'design')).toBe(false);
    });
  });

  // --- getLatestTerminalFailure ---
  describe('getLatestTerminalFailure', () => {
    it('returns null when no failures', () => {
      const runs = [mkRun({ role: 'design', status: 'SUCCEEDED' })];
      expect(getLatestTerminalFailure(runs)).toBeNull();
    });

    it('returns null when failure was retried and succeeded', () => {
      const runs = [
        mkRun({ role: 'design', status: 'FAILED', attempt: 1, created_at: '2026-01-01T00:00:00Z' }),
        mkRun({ role: 'design', status: 'SUCCEEDED', attempt: 2, created_at: '2026-01-01T01:00:00Z' }),
      ];
      expect(getLatestTerminalFailure(runs)).toBeNull();
    });

    it('returns failure when latest attempt failed', () => {
      const runs = [
        mkRun({ role: 'design', status: 'FAILED', attempt: 2, created_at: '2026-01-01T01:00:00Z' }),
        mkRun({ role: 'design', status: 'SUCCEEDED', attempt: 1, created_at: '2026-01-01T00:00:00Z' }),
      ];
      expect(getLatestTerminalFailure(runs)).not.toBeNull();
    });

    it('does NOT show old failure when a newer RUNNING attempt exists', () => {
      const runs = [
        mkRun({ role: 'design', status: 'FAILED', attempt: 1, created_at: '2026-01-01T00:00:00Z' }),
        mkRun({ role: 'design', status: 'RUNNING', attempt: 2, created_at: '2026-01-01T01:00:00Z' }),
      ];
      // Latest is RUNNING, not FAILED — so no terminal failure
      expect(getLatestTerminalFailure(runs)).toBeNull();
    });
  });

  // --- needsCustomerAction ---
  describe('needsCustomerAction', () => {
    it('returns true for BRIEF_APPROVAL state', () => {
      const project = { status: 'BRIEF_APPROVAL' };
      expect(needsCustomerAction(project, [])).toBe(true);
    });

    it('returns true for DESIGN_APPROVAL state', () => {
      const project = { status: 'DESIGN_APPROVAL' };
      expect(needsCustomerAction(project, [])).toBe(true);
    });

    it('returns true when design succeeded but not yet approved', () => {
      const runs = [mkRun({ role: 'design', status: 'SUCCEEDED' })];
      expect(needsCustomerAction({ status: 'DESIGN_APPROVAL' }, runs)).toBe(true);
    });

    it('returns false when generate has started', () => {
      const runs = [
        mkRun({ role: 'design', status: 'SUCCEEDED' }),
        mkRun({ role: 'generate', status: 'RUNNING' }),
      ];
      expect(needsCustomerAction({ status: 'READY_TO_GENERATE' }, runs)).toBe(false);
    });
  });

  // --- getWorkflowStatus ---
  describe('getWorkflowStatus', () => {
    it('marks intake as done when SUCCEEDED', () => {
      const stage = { key: 'intake', label: '资料收集', description: '', role: 'intake' } as any;
      const runs = [mkRun({ role: 'intake', status: 'SUCCEEDED' })];
      expect(getWorkflowStatus(stage, runs, null, null, false)).toBe('done');
    });

    it('marks design as active when RUNNING', () => {
      const stage = { key: 'design', label: '创意设计', description: '', role: 'design' } as any;
      const runs = [mkRun({ role: 'design', status: 'RUNNING' })];
      expect(getWorkflowStatus(stage, runs, runs[0], null, false)).toBe('active');
    });

    it('does NOT auto-complete earlier stages just because a later stage is running', () => {
      // publish is running, but intake was never SUCCEEDED
      const stage = { key: 'intake', label: '资料收集', description: '', role: 'intake' } as any;
      const runs = [mkRun({ role: 'publish', status: 'RUNNING' })];
      expect(getWorkflowStatus(stage, runs, runs[0], null, false)).toBe('pending');
    });

    it('marks awaiting_design as waiting when design is done and needs action', () => {
      const stage = { key: 'awaiting_design', label: '等待选择', description: '', role: null } as any;
      const runs = [mkRun({ role: 'design', status: 'SUCCEEDED' })];
      expect(getWorkflowStatus(stage, runs, null, null, true)).toBe('waiting');
    });

    it('marks awaiting_design as done when generate has started', () => {
      const stage = { key: 'awaiting_design', label: '等待选择', description: '', role: null } as any;
      const runs = [
        mkRun({ role: 'design', status: 'SUCCEEDED' }),
        mkRun({ role: 'generate', status: 'RUNNING' }),
      ];
      expect(getWorkflowStatus(stage, runs, null, null, false)).toBe('done');
    });
  });

  // --- computeProgress ---
  describe('computeProgress', () => {
    it('returns null percentage when nothing done', () => {
      const result = computeProgress([], null, false);
      expect(result.pct).toBeNull();
    });

    it('computes real percentage from verified completions', () => {
      const runs = [
        mkRun({ role: 'intake', status: 'SUCCEEDED' }),
        mkRun({ role: 'design', status: 'SUCCEEDED' }),
      ];
      const result = computeProgress(runs, null, false);
      // intake=done, design=done, awaiting_design=done (no action needed)
      // That's 3 verified completions out of 7 stages
      expect(result.doneCount).toBe(3);
      expect(result.total).toBe(7); // WORKFLOW.length
    });

    it('does NOT double-count retries of the same role', () => {
      const runs = [
        mkRun({ role: 'design', status: 'SUCCEEDED', attempt: 1 }),
        mkRun({ role: 'design', status: 'FAILED', attempt: 1 }),
        mkRun({ role: 'design', status: 'SUCCEEDED', attempt: 2 }),
      ];
      const result = computeProgress(runs, null, false);
      // design counts as 1 done (the role has succeeded once)
      const designStage = { key: 'design', label: '', description: '', role: 'design' } as any;
      expect(getWorkflowStatus(designStage, runs, null, null, false)).toBe('done');
    });
  });
});
