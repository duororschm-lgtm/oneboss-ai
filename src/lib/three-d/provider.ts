import { z } from 'zod';

/**
 * Pluggable 3D generation provider abstraction.
 * Supports image-to-3D tasks via external providers (e.g. Meshy).
 * Without real credentials, Mock3DProvider is used for testing.
 * Real provider calls require user authorization and budget approval.
 */

export const ThreeDTaskStatus = z.enum([
  'pending',
  'processing',
  'succeeded',
  'failed',
  'cancelled',
  'timeout',
]);
export type ThreeDTaskStatusType = z.infer<typeof ThreeDTaskStatus>;

export const ThreeDTaskRecord = z
  .object({
    taskId: z.string().min(1).max(200),
    provider: z.string().min(1).max(50),
    status: ThreeDTaskStatus,
    modelUrl: z.string().url().optional(),
    modelTrust: z.enum(['appearance_3d', 'conceptual_exploded', 'verified_exploded']),
    progress: z.number().min(0).max(100),
    costEstimate: z.number().min(0),
    error: z.string().max(500).optional(),
    createdAt: z.iso.datetime(),
    completedAt: z.iso.datetime().optional(),
  })
  .strict();
export type ThreeDTaskRecordType = z.infer<typeof ThreeDTaskRecord>;

export interface ThreeDGenerationProvider {
  readonly name: string;
  readonly isConfigured: boolean;
  /** Create an image-to-3D task from 1–4 product images */
  createTask(input: {
    imageUrls: string[];
    projectId: string;
    factVersion: number;
  }): Promise<{ taskId: string; costEstimate: number }>;
  /** Poll task status */
  getTask(taskId: string): Promise<ThreeDTaskRecordType>;
  /** Cancel a running task */
  cancel(taskId: string): Promise<void>;
}

/**
 * Mock provider for testing and development.
 * Does NOT connect to any external service and does NOT generate real 3D models.
 */
export class Mock3DProvider implements ThreeDGenerationProvider {
  readonly name = 'mock-3d';
  readonly isConfigured = true;
  private tasks = new Map<string, ThreeDTaskRecordType>();

  async createTask(input: {
    imageUrls: string[];
    projectId: string;
    factVersion: number;
  }): Promise<{ taskId: string; costEstimate: number }> {
    const taskId = `mock-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const record: ThreeDTaskRecordType = {
      taskId,
      provider: this.name,
      status: 'pending',
      modelTrust: 'appearance_3d',
      progress: 0,
      costEstimate: 0, // Mock is free
      createdAt: new Date().toISOString(),
    };
    this.tasks.set(taskId, record);
    // Simulate processing
    setTimeout(() => {
      const t = this.tasks.get(taskId);
      if (t && t.status === 'pending') {
        this.tasks.set(taskId, {
          ...t,
          status: 'succeeded',
          progress: 100,
          modelUrl: undefined, // Mock produces no real model URL
          completedAt: new Date().toISOString(),
        });
      }
    }, 2000);
    return { taskId, costEstimate: 0 };
  }

  async getTask(taskId: string): Promise<ThreeDTaskRecordType> {
    const record = this.tasks.get(taskId);
    if (!record) throw new Error(`Mock task not found: ${taskId}`);
    return record;
  }

  async cancel(taskId: string): Promise<void> {
    const record = this.tasks.get(taskId);
    if (record && ['pending', 'processing'].includes(record.status)) {
      this.tasks.set(taskId, { ...record, status: 'cancelled' });
    }
  }
}

/**
 * Meshy image-to-3D provider adapter.
 * Requires MESHY_API_KEY to be configured. Without it, isConfigured returns false.
 * See: https://docs.meshy.ai/en/api/image-to-3d
 */
export class MeshyProvider implements ThreeDGenerationProvider {
  readonly name = 'meshy';
  private apiKey: string | undefined;
  private baseUrl = 'https://api.meshy.ai/openapi/v1';

  constructor() {
    this.apiKey = process.env.MESHY_API_KEY;
  }

  get isConfigured(): boolean {
    return !!this.apiKey;
  }

  async createTask(input: {
    imageUrls: string[];
    projectId: string;
    factVersion: number;
  }): Promise<{ taskId: string; costEstimate: number }> {
    if (!this.isConfigured) throw new Error('MESHY_API_KEY not configured');
    // Meshy supports 1-4 images per task
    const images = input.imageUrls.slice(0, 4);
    const response = await fetch(`${this.baseUrl}/image-to-3d`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        image_urls: images,
        // Request GLB output with moderate quality for web
        target_polycount: 30000,
        topology: 'triangle',
      }),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Meshy API error ${response.status}: ${text}`);
    }
    const data = (await response.json()) as { result: string };
    return {
      taskId: data.result,
      costEstimate: 0.5, // Approximate; actual cost depends on Meshy pricing
    };
  }

  async getTask(taskId: string): Promise<ThreeDTaskRecordType> {
    if (!this.isConfigured) throw new Error('MESHY_API_KEY not configured');
    const response = await fetch(`${this.baseUrl}/image-to-3d/${taskId}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    if (!response.ok) throw new Error(`Meshy API error ${response.status}`);
    const data = (await response.json()) as {
      id: string;
      status: string;
      model_urls?: { glb?: string };
      progress?: number;
    };
    return {
      taskId: data.id,
      provider: this.name,
      status: (data.status as ThreeDTaskStatusType) ?? 'processing',
      modelUrl: data.model_urls?.glb,
      modelTrust: 'appearance_3d',
      progress: data.progress ?? 0,
      costEstimate: 0.5,
      createdAt: new Date().toISOString(),
    };
  }

  async cancel(taskId: string): Promise<void> {
    if (!this.isConfigured) throw new Error('MESHY_API_KEY not configured');
    await fetch(`${this.baseUrl}/image-to-3d/${taskId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
  }
}

/**
 * Get the configured 3D provider, falling back to Mock when no credentials exist.
 */
export function getThreeDProvider(): ThreeDGenerationProvider {
  const meshy = new MeshyProvider();
  return meshy.isConfigured ? meshy : new Mock3DProvider();
}
