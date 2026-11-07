import type {
  FidelityLevelType,
  ProductPipelineType,
  AssetSourceTypeType,
} from '../../contracts/product3d';

/**
 * ModelStrategyRouter — decides which 3D generation pipeline to use
 * based on customer input evidence. MiMo makes the final call, but this
 * router encodes the deterministic decision rules.
 *
 * Route priority (highest to lowest):
 *   A: Customer CAD/GLB → cad_import (verified_exploded possible)
 *   B: Multi-view photos (≥20) → photogrammetry
 *   C: Few photos (2-5) → image_to_3d (AI approximation)
 *   D: Description only → parametric (concept model)
 */

export type RouterInput = {
  hasCustomerCAD: boolean;
  hasCustomerGLB: boolean;
  photoCount: number;
  hasMultiAngle: boolean;
  hasDescription: boolean;
  hasDimensions: boolean;
  productCategory: string;
  customerConfidence: 'high' | 'medium' | 'low' | 'unknown';
};

export type RouterDecision = {
  pipeline: ProductPipelineType;
  fidelityLevel: FidelityLevelType;
  reason: string;
  fallbackPipeline?: ProductPipelineType;
  canExplode: boolean;
  requiresHumanReview: boolean;
  capturePlanNeeded: boolean;
  estimatedQuality: 'high' | 'medium' | 'low' | 'concept';
  label: string;
};

export function routeModelStrategy(input: RouterInput): RouterDecision {
  const {
    hasCustomerCAD,
    hasCustomerGLB,
    photoCount,
    hasMultiAngle,
    hasDescription,
    hasDimensions,
    productCategory,
    customerConfidence,
  } = input;

  // Route A: Customer CAD / GLB — highest priority
  if (hasCustomerCAD) {
    return {
      pipeline: 'cad_import',
      fidelityLevel: 'cad_exact',
      reason: '客户提供 CAD 模型，可保留真实几何和装配关系。',
      canExplode: true,
      requiresHumanReview: false,
      capturePlanNeeded: false,
      estimatedQuality: 'high',
      label: 'CAD 精确资产',
    };
  }

  if (hasCustomerGLB && photoCount >= 1) {
    return {
      pipeline: 'cad_import',
      fidelityLevel: 'cad_exact',
      reason: '客户提供 GLB 模型，包含原始节点和材质信息。',
      canExplode: true, // Only if multi-mesh; verify at import time
      requiresHumanReview: false,
      capturePlanNeeded: false,
      estimatedQuality: 'high',
      label: 'CAD / 客户原始模型',
    };
  }

  // Route B: Multi-view photogrammetry (≥20 overlapping photos)
  if (photoCount >= 20 && hasMultiAngle) {
    return {
      pipeline: 'photogrammetry',
      fidelityLevel: 'photogrammetry_reconstruction',
      reason: `客户提供了 ${photoCount} 张多角度照片，达到摄影测量重建的基本要求。`,
      fallbackPipeline: 'image_to_3d',
      canExplode: false, // Single mesh from photogrammetry; no real parts
      requiresHumanReview: true,
      capturePlanNeeded: false,
      estimatedQuality: 'high',
      label: '实物照片重建',
    };
  }

  // Route C: Few photos (2-5) → AI image-to-3D
  if (photoCount >= 2 && photoCount < 20) {
    return {
      pipeline: 'image_to_3d',
      fidelityLevel: 'ai_image_approximation',
      reason: `客户提供了 ${photoCount} 张照片，使用自部署 AI 图像转 3D 生成近似外观模型。`,
      fallbackPipeline: 'parametric',
      canExplode: false,
      requiresHumanReview: false,
      capturePlanNeeded: photoCount < 5,
      estimatedQuality: photoCount >= 5 ? 'medium' : 'low',
      label: 'AI 生成近似模型',
    };
  }

  // Route C-: Single photo
  if (photoCount === 1) {
    return {
      pipeline: 'image_to_3d',
      fidelityLevel: 'ai_image_approximation',
      reason: '单张照片只能生成 AI 近似模型，背面和内部结构为推测。',
      fallbackPipeline: 'parametric',
      canExplode: false,
      requiresHumanReview: false,
      capturePlanNeeded: true,
      estimatedQuality: 'low',
      label: 'AI 生成近似模型',
    };
  }

  // Route D: Description only / no photos
  return {
    pipeline: 'parametric',
    fidelityLevel: 'parametric_concept',
    reason: hasDescription
      ? '客户提供了文字描述，使用参数化概念模型展示。'
      : '资料不足，使用通用概念模型，并提供拍摄向导。',
    canExplode: true, // Parametric models have real separate meshes
    requiresHumanReview: false,
    capturePlanNeeded: true,
    estimatedQuality: 'concept',
    label: 'AI 参数化概念模型',
  };
}

/**
 * Determine if a given model can support "real" (verified) exploded view.
 * Only CAD assemblies and confirmed multi-part models qualify.
 */
export function canUseVerifiedExplode(decision: RouterDecision): boolean {
  return decision.pipeline === 'cad_import' && decision.fidelityLevel === 'cad_exact';
}

/**
 * Get the display label for a fidelity level (used in UI trust badges).
 */
export function fidelityLabel(level: FidelityLevelType): string {
  switch (level) {
    case 'cad_exact':
      return 'CAD 精确资产 · 真实几何';
    case 'photogrammetry_reconstruction':
      return '实物照片重建 · 真实外观采样';
    case 'ai_image_approximation':
      return 'AI 生成近似模型 · 非精确还原';
    case 'parametric_concept':
      return 'AI 参数化概念模型 · 非商家实拍';
  }
}
