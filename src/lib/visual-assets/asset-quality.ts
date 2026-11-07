import { z } from 'zod';

/**
 * Asset quality assessment for product images.
 * Analyzes customer-uploaded images to determine display strategy and
 * guide follow-up questions without fabricating missing details.
 */

export const AssetQualityReport = z
  .object({
    totalImages: z.number().int().min(0),
    usableImages: z.number().int().min(0),
    issues: z.array(
      z.enum([
        'no_images',
        'low_resolution',
        'blurry',
        'occluded',
        'background_interference',
        'single_angle',
        'unverified_product_identity',
      ]),
    ),
    angleCoverage: z.enum(['none', 'front_only', 'partial', 'multi_angle']),
    recommendedStrategy: z.enum([
      'real_product_display',
      'real_plus_concept',
      'ai_creative_concept',
      'concept_3d_appearance',
      'concept_3d_exploded',
      'static_concept_only',
    ]),
    followUpQuestions: z.array(z.string().max(300)).max(3),
    canSkipQuestions: z.boolean(),
    conceptLabel: z.string().max(100),
  })
  .strict();
export type AssetQualityReportType = z.infer<typeof AssetQualityReport>;

/**
 * Assess asset quality from image count and basic metadata.
 * In a production system this would also analyze image resolution, blur,
 * and content using the multimodal MiMo API or a dedicated vision model.
 */
export function assessAssetQuality(input: {
  imageCount: number;
  imageMetadata?: {
    width?: number;
    height?: number;
    blurScore?: number;
    hasMultipleAngles?: boolean;
  };
  productDescription?: string;
  customerConfidence?: 'high' | 'medium' | 'low' | 'unknown';
}): AssetQualityReportType {
  const { imageCount, imageMetadata, productDescription, customerConfidence } = input;
  const issues: AssetQualityReportType['issues'] = [];
  const questions: string[] = [];

  if (imageCount === 0) {
    issues.push('no_images');
    questions.push('能否描述商品的外形轮廓和主要颜色？');
    questions.push('商品的使用场景是什么？');
    if (productDescription && productDescription.length > 10) {
      return {
        totalImages: 0,
        usableImages: 0,
        issues,
        angleCoverage: 'none',
        recommendedStrategy: customerConfidence === 'high' ? 'concept_3d_appearance' : 'ai_creative_concept',
        followUpQuestions: questions.slice(0, 3),
        canSkipQuestions: true,
        conceptLabel: '概念结构示意 · 依据客户描述的 AI 概念 · 非商家实拍',
      };
    }
    return {
      totalImages: 0,
      usableImages: 0,
      issues,
      angleCoverage: 'none',
      recommendedStrategy: 'ai_creative_concept',
      followUpQuestions: questions.slice(0, 3),
      canSkipQuestions: true,
      conceptLabel: '概念视觉 · AI 创意示意 · 非商家实拍',
    };
  }

  if (imageCount === 1) {
    if (imageMetadata?.width && imageMetadata.width < 800) issues.push('low_resolution');
    if (imageMetadata?.blurScore && imageMetadata.blurScore > 0.5) issues.push('blurry');
    issues.push('single_angle');
    questions.push('这张图展示的是商品的哪个角度？还有其他角度的照片吗？');
    if (issues.includes('blurry') || issues.includes('low_resolution')) {
      questions.push('如果方便，能否补拍一张更清晰的正面图？（也可以跳过，使用概念展示）');
    }

    const hasQualityIssues = issues.includes('blurry') || issues.includes('low_resolution');
    return {
      totalImages: 1,
      usableImages: hasQualityIssues ? 0 : 1,
      issues,
      angleCoverage: 'front_only',
      recommendedStrategy: hasQualityIssues
        ? 'real_plus_concept'
        : 'concept_3d_appearance',
      followUpQuestions: questions.slice(0, 3),
      canSkipQuestions: true,
      conceptLabel: hasQualityIssues
        ? '概念补充展示 · 部分为 AI 概念 · 非商家实拍'
        : 'AI 近似外观 3D · 概念展示 · 非商家实拍',
    };
  }

  // 2+ images
  const multiAngle = imageMetadata?.hasMultipleAngles ?? imageCount >= 3;
  if (!multiAngle) issues.push('single_angle');
  if (imageMetadata?.width && imageMetadata.width < 600) issues.push('low_resolution');

  return {
    totalImages: imageCount,
    usableImages: imageCount - (issues.includes('low_resolution') ? 1 : 0),
    issues,
    angleCoverage: multiAngle ? 'multi_angle' : 'partial',
    recommendedStrategy: multiAngle
      ? 'concept_3d_exploded'
      : 'concept_3d_appearance',
    followUpQuestions: multiAngle
      ? ['这些照片是同一个商品的不同角度吗？']
      : ['能否补充侧面或背面的照片？（也可以跳过）'],
    canSkipQuestions: true,
    conceptLabel: multiAngle
      ? '概念拆解 · 多角度参考 · 非工程验证结构'
      : '外观 3D · 多角度参考 · 非商家实拍',
  };
}
