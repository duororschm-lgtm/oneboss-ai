import { describe, it, expect } from 'vitest';
import {
  routeModelStrategy,
  canUseVerifiedExplode,
  fidelityLabel,
} from '../../src/lib/three-d/model-router';
import { buildProduct, createExplodeTransforms } from '../../src/lib/three-d/parametric-builder';
import {
  Product3DSpec,
  FidelityLevel,
  CapturePlan,
  ModelQualityReport,
  WorkerTask,
} from '../../src/contracts/product3d';

describe('ModelStrategyRouter', () => {
  it('routes CAD input to cad_import', () => {
    const decision = routeModelStrategy({
      hasCustomerCAD: true,
      hasCustomerGLB: false,
      photoCount: 0,
      hasMultiAngle: false,
      hasDescription: true,
      hasDimensions: true,
      productCategory: 'furniture',
      customerConfidence: 'high',
    });
    expect(decision.pipeline).toBe('cad_import');
    expect(decision.fidelityLevel).toBe('cad_exact');
    expect(decision.canExplode).toBe(true);
  });

  it('routes multi-view photos (≥20) to photogrammetry', () => {
    const decision = routeModelStrategy({
      hasCustomerCAD: false,
      hasCustomerGLB: false,
      photoCount: 25,
      hasMultiAngle: true,
      hasDescription: true,
      hasDimensions: false,
      productCategory: 'electronics',
      customerConfidence: 'medium',
    });
    expect(decision.pipeline).toBe('photogrammetry');
    expect(decision.fidelityLevel).toBe('photogrammetry_reconstruction');
    expect(decision.canExplode).toBe(false); // No real parts from photogrammetry
  });

  it('routes few photos to image_to_3d', () => {
    const decision = routeModelStrategy({
      hasCustomerCAD: false,
      hasCustomerGLB: false,
      photoCount: 3,
      hasMultiAngle: true,
      hasDescription: true,
      hasDimensions: false,
      productCategory: 'furniture',
      customerConfidence: 'medium',
    });
    expect(decision.pipeline).toBe('image_to_3d');
    expect(decision.fidelityLevel).toBe('ai_image_approximation');
    expect(decision.canExplode).toBe(false);
  });

  it('routes single photo to image_to_3d with capture plan', () => {
    const decision = routeModelStrategy({
      hasCustomerCAD: false,
      hasCustomerGLB: false,
      photoCount: 1,
      hasMultiAngle: false,
      hasDescription: true,
      hasDimensions: false,
      productCategory: 'furniture',
      customerConfidence: 'low',
    });
    expect(decision.pipeline).toBe('image_to_3d');
    expect(decision.capturePlanNeeded).toBe(true);
    expect(decision.estimatedQuality).toBe('low');
  });

  it('routes description-only to parametric', () => {
    const decision = routeModelStrategy({
      hasCustomerCAD: false,
      hasCustomerGLB: false,
      photoCount: 0,
      hasMultiAngle: false,
      hasDescription: true,
      hasDimensions: false,
      productCategory: 'furniture',
      customerConfidence: 'unknown',
    });
    expect(decision.pipeline).toBe('parametric');
    expect(decision.fidelityLevel).toBe('parametric_concept');
    expect(decision.canExplode).toBe(true); // Parametric has real separate meshes
  });

  it('routes no-input to parametric concept', () => {
    const decision = routeModelStrategy({
      hasCustomerCAD: false,
      hasCustomerGLB: false,
      photoCount: 0,
      hasMultiAngle: false,
      hasDescription: false,
      hasDimensions: false,
      productCategory: 'other',
      customerConfidence: 'unknown',
    });
    expect(decision.fidelityLevel).toBe('parametric_concept');
    expect(decision.label).toBe('AI 参数化概念模型');
  });

  it('verifies explode eligibility', () => {
    const cad = routeModelStrategy({
      hasCustomerCAD: true,
      hasCustomerGLB: false,
      photoCount: 0,
      hasMultiAngle: false,
      hasDescription: true,
      hasDimensions: true,
      productCategory: 'furniture',
      customerConfidence: 'high',
    });
    expect(canUseVerifiedExplode(cad)).toBe(true);

    const photo = routeModelStrategy({
      hasCustomerCAD: false,
      hasCustomerGLB: false,
      photoCount: 25,
      hasMultiAngle: true,
      hasDescription: true,
      hasDimensions: false,
      productCategory: 'electronics',
      customerConfidence: 'medium',
    });
    expect(canUseVerifiedExplode(photo)).toBe(false);
  });

  it('provides honest fidelity labels', () => {
    expect(fidelityLabel('cad_exact')).toContain('CAD');
    expect(fidelityLabel('ai_image_approximation')).toContain('近似');
    expect(fidelityLabel('parametric_concept')).toContain('概念');
  });
});

describe('ParametricBuilder — multi-category geometry', () => {
  it('builds furniture with seat, backrest and 4 legs', () => {
    const result = buildProduct('furniture', { width: 0.5, height: 0.8, depth: 0.5 });
    expect(result.parts.length).toBeGreaterThanOrEqual(6); // seat + back + 4 legs
    expect(result.parts.some((p) => p.role === 'seat')).toBe(true);
    expect(result.parts.some((p) => p.role === 'backrest')).toBe(true);
    expect(result.parts.some((p) => p.role === 'leg')).toBe(true);
  });

  it('builds electronics with body and screen', () => {
    const result = buildProduct('electronics', { width: 0.15, height: 0.08, depth: 0.15 });
    expect(result.parts.some((p) => p.role === 'body')).toBe(true);
    expect(result.parts.some((p) => p.role === 'screen')).toBe(true);
  });

  it('builds bottle with body and cap (lathe geometry)', () => {
    const result = buildProduct('bottle_container', { radius: 0.04, height: 0.2 });
    expect(result.parts.some((p) => p.role === 'body')).toBe(true);
    expect(result.parts.some((p) => p.role === 'cap')).toBe(true);
  });

  it('builds vehicle with body, cabin and wheels', () => {
    const result = buildProduct('vehicle', { length: 1.2, width: 0.55, height: 0.35 });
    expect(result.parts.some((p) => p.role === 'body')).toBe(true);
    expect(result.parts.some((p) => p.role === 'cabin')).toBe(true);
    expect(result.parts.filter((p) => p.role === 'wheel').length).toBe(4);
  });

  it('builds shoe with sole, upper and heel', () => {
    const result = buildProduct('footwear', { length: 0.28, width: 0.1, height: 0.12 });
    expect(result.parts.some((p) => p.role === 'sole')).toBe(true);
    expect(result.parts.some((p) => p.role === 'upper')).toBe(true);
    expect(result.parts.some((p) => p.role === 'heel')).toBe(true);
  });

  it('builds generic for unknown categories', () => {
    const result = buildProduct('unknown_category', {});
    expect(result.parts.length).toBeGreaterThan(0);
  });

  it('creates explode transforms for parts', () => {
    const result = buildProduct('furniture', { width: 0.5, height: 0.8, depth: 0.5 });
    const transforms = createExplodeTransforms(result.parts);
    expect(transforms.size).toBeGreaterThan(0);
    // Backrest should explode upward
    const backTransform = transforms.get('靠背');
    expect(backTransform).toBeDefined();
    expect(backTransform![1]).toBeGreaterThan(0);
  });

  it('uses PBR materials with correct properties', () => {
    const result = buildProduct('furniture', {});
    for (const part of result.parts) {
      expect(part.material).toBeDefined();
      // Check material has standard PBR properties
      const mat = part.material as any;
      expect(mat.roughness).toBeGreaterThanOrEqual(0);
      expect(mat.metalness).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('Product3DSpec contracts', () => {
  it('validates FidelityLevel enum', () => {
    expect(FidelityLevel.safeParse('cad_exact').success).toBe(true);
    expect(FidelityLevel.safeParse('photogrammetry_reconstruction').success).toBe(true);
    expect(FidelityLevel.safeParse('ai_image_approximation').success).toBe(true);
    expect(FidelityLevel.safeParse('parametric_concept').success).toBe(true);
    expect(FidelityLevel.safeParse('fake_level').success).toBe(false);
  });

  it('validates a complete Product3DSpec', () => {
    const spec = {
      schemaVersion: '1.0',
      productId: 'chair-001',
      productCategory: 'furniture',
      productType: 'chair',
      fidelityLevel: 'parametric_concept',
      sourceEvidence: [
        {
          assetId: 'desc-1',
          sourceType: 'customer_description',
          description: '木质椅子，灰色坐垫',
          confidence: 0.7,
        },
      ],
      modelStrategy: {
        pipeline: 'parametric',
        builderId: 'furniture',
        reason: '客户仅提供文字描述',
      },
      parts: [
        {
          id: 'seat',
          name: '坐垫',
          role: 'seat',
          geometry: { builder: 'box', parameters: { width: 0.5, height: 0.08, depth: 0.5 } },
          transform: {
            position: [0, 0.4, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
          },
          material: { preset: 'fabric', color: '#8a9a8e' },
          source: 'ai_inferred',
          confidence: 0.6,
          isVerified: false,
        },
      ],
      unknowns: ['背面细节未知', '内部结构未知'],
      warnings: ['参数化概念模型，非真实商品扫描'],
      requiresHumanReview: false,
    };
    expect(Product3DSpec.safeParse(spec).success).toBe(true);
  });

  it('rejects duplicate part IDs', () => {
    const base = {
      schemaVersion: '1.0',
      productId: 'test',
      productCategory: 'other',
      productType: 'test',
      fidelityLevel: 'parametric_concept',
      sourceEvidence: [
        { assetId: 'a', sourceType: 'customer_description', description: 'x', confidence: 0.5 },
      ],
      modelStrategy: { pipeline: 'parametric', reason: 'test' },
      unknowns: [],
      warnings: [],
      requiresHumanReview: false,
    };
    const part = (id: string) => ({
      id,
      name: id,
      role: 'test',
      geometry: { builder: 'box', parameters: {} },
      transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      material: { preset: 'plastic' },
      source: 'ai_inferred',
      confidence: 0.5,
      isVerified: false,
    });
    const spec = { ...base, parts: [part('a'), part('a')] };
    expect(Product3DSpec.safeParse(spec).success).toBe(false);
  });

  it('validates CapturePlan', () => {
    const plan = {
      productId: 'chair-001',
      requiredAngles: ['正面', '背面', '左侧面', '右侧面', '顶部'],
      completedAngles: ['正面', '左侧面'],
      missingAngles: ['背面', '右侧面', '顶部'],
      recommendedCount: 25,
      currentCount: 2,
      needsScaleReference: true,
      surfaceWarnings: [],
      qualityEstimate: 'insufficient',
    };
    expect(CapturePlan.safeParse(plan).success).toBe(true);
  });

  it('validates ModelQualityReport', () => {
    const report = {
      jobId: 'job-1',
      pipeline: 'parametric',
      fidelityLevel: 'parametric_concept',
      meshCount: 7,
      hasMultipleMeshes: true,
      triangleCount: 12000,
      hasNormals: true,
      hasTextures: false,
      hasNonManifold: false,
      hasHoles: false,
      fileSizeBytes: 500000,
      glbRoundTripOk: true,
      issues: [],
      passed: true,
    };
    expect(ModelQualityReport.safeParse(report).success).toBe(true);
  });

  it('validates WorkerTask', () => {
    const task = {
      jobId: 'job-1',
      productId: 'chair-001',
      productVersion: 1,
      inputAssetIds: ['asset-1', 'asset-2'],
      selectedPipeline: 'parametric',
      modelVersion: 'v1',
      workerVersion: 'worker-v1',
      status: 'completed',
      logs: ['started', 'generated', 'validated'],
      fidelityLevel: 'parametric_concept',
    };
    expect(WorkerTask.safeParse(task).success).toBe(true);
    expect(WorkerTask.safeParse({ ...task, status: 'invalid_status' }).success).toBe(false);
  });
});
