import { z } from 'zod';

/**
 * Product3DSpec — the authoritative data contract for 3D asset generation.
 * MiMo outputs modeling intent and evidence; actual meshes come from
 * CAD import, photogrammetry, self-hosted AI inference, or parametric builders.
 *
 * Fidelity levels (honest labeling):
 *   cad_exact                     — customer CAD/STEP/GLB with verified parts
 *   photogrammetry_reconstruction — multi-view photo reconstruction
 *   ai_image_approximation        — single/few image AI generation (approximate)
 *   parametric_concept            — procedural/concept model (not real scan)
 */

export const FidelityLevel = z.enum([
  'cad_exact',
  'photogrammetry_reconstruction',
  'ai_image_approximation',
  'parametric_concept',
]);
export type FidelityLevelType = z.infer<typeof FidelityLevel>;

export const AssetSourceType = z.enum([
  'customer_cad',
  'customer_glb',
  'multi_view_photos',
  'single_photo',
  'customer_description',
]);
export type AssetSourceTypeType = z.infer<typeof AssetSourceType>;

export const ProductPipeline = z.enum([
  'cad_import',
  'photogrammetry',
  'image_to_3d',
  'parametric',
]);
export type ProductPipelineType = z.infer<typeof ProductPipeline>;

export const SourceEvidence = z
  .object({
    assetId: z.string().min(1).max(200),
    sourceType: AssetSourceType,
    description: z.string().max(500),
    confidence: z.number().min(0).max(1),
  })
  .strict();

export const ProductDimensions = z
  .object({
    width: z.number().positive().max(100_000).optional(),
    height: z.number().positive().max(100_000).optional(),
    depth: z.number().positive().max(100_000).optional(),
    unit: z.enum(['mm', 'cm', 'm', 'unknown']),
    evidence: z.enum(['customer_confirmed', 'cad_metadata', 'estimated', 'unknown']),
  })
  .strict();

export const ModelStrategy = z
  .object({
    pipeline: ProductPipeline,
    builderId: z.string().max(100).optional(),
    modelId: z.string().max(200).optional(),
    reason: z.string().min(1).max(500),
  })
  .strict();

export const PartGeometry = z
  .object({
    builder: z.string().min(1).max(100),
    parameters: z.record(z.string(), z.union([z.number(), z.string(), z.boolean()])),
  })
  .strict();

export const PartTransform = z
  .object({
    position: z.tuple([z.number(), z.number(), z.number()]),
    rotation: z.tuple([z.number(), z.number(), z.number()]),
    scale: z.tuple([z.number(), z.number(), z.number()]),
  })
  .strict();

export const PartMaterial = z
  .object({
    preset: z.enum([
      'wood',
      'brushed_metal',
      'polished_metal',
      'aluminum',
      'stainless_steel',
      'plastic',
      'rubber',
      'leather',
      'fabric',
      'glass',
      'ceramic',
      'paper',
      'cardboard',
      'transparent_acrylic',
      'painted_surface',
      'screen_glass',
      'custom',
    ]),
    color: z
      .string()
      .regex(/^#[a-fA-F0-9]{6}$/)
      .optional(),
    roughness: z.number().min(0).max(1).optional(),
    metalness: z.number().min(0).max(1).optional(),
  })
  .strict();

export const PartSpec = z
  .object({
    id: z.string().min(1).max(100),
    name: z.string().min(1).max(100),
    role: z.string().min(1).max(100),
    parentId: z.string().max(100).optional(),
    geometry: PartGeometry,
    transform: PartTransform,
    material: PartMaterial,
    explodedTransform: z
      .object({
        position: z.tuple([z.number(), z.number(), z.number()]),
        rotation: z.tuple([z.number(), z.number(), z.number()]).optional(),
      })
      .strict()
      .optional(),
    source: z.enum(['cad', 'photo_observed', 'customer_confirmed', 'ai_inferred']),
    confidence: z.number().min(0).max(1),
    isVerified: z.boolean(),
  })
  .strict();

export const Product3DSpec = z
  .object({
    schemaVersion: z.literal('1.0'),
    productId: z.string().min(1).max(200),
    productCategory: z.string().min(1).max(100),
    productType: z.string().min(1).max(100),

    fidelityLevel: FidelityLevel,
    sourceEvidence: z.array(SourceEvidence).min(1).max(20),
    dimensions: ProductDimensions.optional(),
    modelStrategy: ModelStrategy,

    parts: z.array(PartSpec).min(1).max(50),

    unknowns: z.array(z.string().max(300)).max(20),
    warnings: z.array(z.string().max(300)).max(20),
    requiresHumanReview: z.boolean(),
  })
  .strict()
  .refine(
    (spec) => {
      // IDs must be unique
      const ids = spec.parts.map((p) => p.id);
      return new Set(ids).size === ids.length;
    },
    { message: 'Part IDs must be unique', path: ['parts'] },
  )
  .refine(
    (spec) => {
      // Parent-child relationships must not form cycles
      const parentMap = new Map(spec.parts.map((p) => [p.id, p.parentId]));
      for (const part of spec.parts) {
        const visited = new Set<string>();
        let current: string | undefined = part.id;
        while (current) {
          if (visited.has(current)) return false;
          visited.add(current);
          current = parentMap.get(current);
        }
      }
      return true;
    },
    { message: 'Parent-child cycle detected', path: ['parts'] },
  )
  .refine(
    (spec) => {
      // All transform values must be finite
      return spec.parts.every((p) => {
        const numbers = [
          ...p.transform.position,
          ...p.transform.rotation,
          ...p.transform.scale,
          ...Object.values(p.geometry.parameters).filter((v): v is number => typeof v === 'number'),
        ];
        return numbers.every(Number.isFinite);
      });
    },
    { message: 'Transform values must be finite numbers', path: ['parts'] },
  );

export type Product3DSpecType = z.infer<typeof Product3DSpec>;

// --- CapturePlan ---
export const CapturePlan = z
  .object({
    productId: z.string().min(1).max(200),
    requiredAngles: z.array(z.string().max(100)).min(1).max(20),
    completedAngles: z.array(z.string().max(100)).max(20),
    missingAngles: z.array(z.string().max(100)).max(20),
    recommendedCount: z.number().int().min(1).max(200),
    currentCount: z.number().int().min(0).max(200),
    needsScaleReference: z.boolean(),
    surfaceWarnings: z.array(z.string().max(300)).max(10),
    qualityEstimate: z.enum(['insufficient', 'basic', 'good', 'excellent']),
  })
  .strict();
export type CapturePlanType = z.infer<typeof CapturePlan>;

// --- ModelQualityReport ---
export const ModelQualityReport = z
  .object({
    jobId: z.string().min(1).max(200),
    pipeline: ProductPipeline,
    fidelityLevel: FidelityLevel,
    meshCount: z.number().int().nonnegative(),
    hasMultipleMeshes: z.boolean(),
    triangleCount: z.number().int().nonnegative(),
    hasNormals: z.boolean(),
    hasTextures: z.boolean(),
    hasNonManifold: z.boolean(),
    hasHoles: z.boolean(),
    fileSizeBytes: z.number().int().nonnegative(),
    glbRoundTripOk: z.boolean(),
    issues: z.array(z.string().max(300)).max(30),
    passed: z.boolean(),
  })
  .strict();
export type ModelQualityReportType = z.infer<typeof ModelQualityReport>;

// --- 3D Worker Task ---
export const WorkerTaskStatus = z.enum([
  'queued',
  'analyzing',
  'awaiting_customer_input',
  'preprocessing',
  'generating',
  'postprocessing',
  'validating',
  'uploading',
  'completed',
  'failed',
  'fallback_available',
  'cancelled',
]);
export type WorkerTaskStatusType = z.infer<typeof WorkerTaskStatus>;

export const WorkerTask = z
  .object({
    jobId: z.string().min(1).max(200),
    orderId: z.string().max(200).optional(),
    productId: z.string().min(1).max(200),
    productVersion: z.number().int().positive(),
    inputAssetIds: z.array(z.string().max(200)).max(20),
    selectedPipeline: ProductPipeline,
    modelVersion: z.string().max(100),
    workerVersion: z.string().max(100),
    status: WorkerTaskStatus,
    startedAt: z.iso.datetime().optional(),
    finishedAt: z.iso.datetime().optional(),
    logs: z.array(z.string().max(500)).max(100),
    qualityReport: ModelQualityReport.optional(),
    outputAssetId: z.string().max(200).optional(),
    fidelityLevel: FidelityLevel,
    failureReason: z.string().max(500).optional(),
  })
  .strict();
export type WorkerTaskType = z.infer<typeof WorkerTask>;
