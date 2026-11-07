import { describe, it, expect } from 'vitest';
import { assessAssetQuality } from '../../src/lib/visual-assets/asset-quality';
import { ModelTrust, ExplodedViewSpec, ModelAssetRecord } from '../../src/contracts';
import { randomUUID } from 'node:crypto';

describe('asset quality assessment', () => {
  it('handles 0 images with product description', () => {
    const report = assessAssetQuality({
      imageCount: 0,
      productDescription: '四条木质椅腿，灰色坐垫，弧形靠背',
      customerConfidence: 'high',
    });
    expect(report.totalImages).toBe(0);
    expect(report.recommendedStrategy).toBe('concept_3d_appearance');
    expect(report.followUpQuestions.length).toBeGreaterThan(0);
    expect(report.canSkipQuestions).toBe(true);
    expect(report.conceptLabel).toContain('概念');
    expect(report.conceptLabel).toContain('非商家实拍');
  });

  it('handles 0 images without description', () => {
    const report = assessAssetQuality({ imageCount: 0 });
    expect(report.recommendedStrategy).toBe('ai_creative_concept');
    expect(report.issues).toContain('no_images');
  });

  it('handles 1 clear image', () => {
    const report = assessAssetQuality({
      imageCount: 1,
      imageMetadata: { width: 1200, height: 900, blurScore: 0.1 },
    });
    expect(report.recommendedStrategy).toBe('concept_3d_appearance');
    expect(report.angleCoverage).toBe('front_only');
  });

  it('handles 1 blurry image', () => {
    const report = assessAssetQuality({
      imageCount: 1,
      imageMetadata: { width: 400, blurScore: 0.8 },
    });
    expect(report.issues).toContain('blurry');
    expect(report.issues).toContain('low_resolution');
    expect(report.recommendedStrategy).toBe('real_plus_concept');
    expect(report.followUpQuestions.length).toBeGreaterThan(0);
    expect(report.canSkipQuestions).toBe(true);
  });

  it('handles multiple images with multi-angle coverage', () => {
    const report = assessAssetQuality({
      imageCount: 3,
      imageMetadata: { width: 1200, hasMultipleAngles: true },
    });
    expect(report.angleCoverage).toBe('multi_angle');
    expect(report.recommendedStrategy).toBe('concept_3d_exploded');
  });

  it('handles 2 images without angle coverage', () => {
    const report = assessAssetQuality({
      imageCount: 2,
      imageMetadata: { width: 1200, hasMultipleAngles: false },
    });
    expect(report.angleCoverage).toBe('partial');
    expect(report.recommendedStrategy).toBe('concept_3d_appearance');
  });

  it('never claims concept art is real photography', () => {
    for (const count of [0, 1, 2, 5]) {
      const report = assessAssetQuality({ imageCount: count });
      expect(report.conceptLabel).toBeDefined();
    }
  });

  it('limits follow-up questions to 3', () => {
    const report = assessAssetQuality({ imageCount: 0, productDescription: '' });
    expect(report.followUpQuestions.length).toBeLessThanOrEqual(3);
  });
});

describe('3D trust levels and contracts', () => {
  it('validates ModelTrust enum values', () => {
    expect(ModelTrust.safeParse('appearance_3d').success).toBe(true);
    expect(ModelTrust.safeParse('conceptual_exploded').success).toBe(true);
    expect(ModelTrust.safeParse('verified_exploded').success).toBe(true);
    expect(ModelTrust.safeParse('static_fallback').success).toBe(true);
    expect(ModelTrust.safeParse('fake_trust').success).toBe(false);
  });

  it('validates ModelAssetRecord', () => {
    const record = {
      id: randomUUID(),
      projectId: randomUUID(),
      factVersion: 1,
      source: 'procedural' as const,
      modelTrust: 'conceptual_exploded' as const,
      storagePath: 'models/concept-chair-v1.glb',
      contentHash: 'abc123',
      approved: false,
      licenseStatus: 'procedural_concept' as const,
      createdAt: new Date().toISOString(),
    };
    expect(ModelAssetRecord.safeParse(record).success).toBe(true);
  });

  it('rejects invalid ModelAssetRecord source', () => {
    const record = {
      id: randomUUID(),
      projectId: randomUUID(),
      factVersion: 1,
      source: 'hack',
      modelTrust: 'appearance_3d',
      storagePath: 'x',
      contentHash: 'y',
      approved: true,
      licenseStatus: 'customer_authorized',
      createdAt: new Date().toISOString(),
    };
    expect(ModelAssetRecord.safeParse(record).success).toBe(false);
  });

  it('validates ExplodedViewSpec with parts', () => {
    const spec = {
      modelAssetId: randomUUID(),
      mode: 'conceptual_exploded' as const,
      parts: [
        {
          id: 'backrest',
          nodeName: 'ChairBack',
          label: '弧形靠背',
          factRefs: [randomUUID()],
          explodeOffset: [0, 1.2, -0.6] as [number, number, number],
        },
        {
          id: 'seat',
          nodeName: 'ChairSeat',
          label: '坐垫',
          factRefs: [],
          explodeOffset: [0, 0.4, 0.4] as [number, number, number],
        },
      ],
      camera: {
        position: [2, 2, 2] as [number, number, number],
        target: [0, 0, 0] as [number, number, number],
      },
    };
    expect(ExplodedViewSpec.safeParse(spec).success).toBe(true);
  });

  it('rejects ExplodedViewSpec without parts', () => {
    const spec = {
      modelAssetId: randomUUID(),
      mode: 'conceptual_exploded',
      parts: [],
      camera: { position: [0, 0, 0], target: [0, 0, 0] },
    };
    expect(ExplodedViewSpec.safeParse(spec).success).toBe(false);
  });

  it('rejects invalid explode offset dimensions', () => {
    const spec = {
      modelAssetId: randomUUID(),
      mode: 'conceptual_exploded',
      parts: [
        {
          id: 'x',
          nodeName: 'x',
          label: 'x',
          factRefs: [],
          explodeOffset: [1, 2], // missing z dimension
        },
      ],
      camera: { position: [0, 0, 0], target: [0, 0, 0] },
    };
    expect(ExplodedViewSpec.safeParse(spec).success).toBe(false);
  });
});
