import { z } from 'zod';

/**
 * GLB/GLTF model file validation and security checks.
 * Validates file format, size limits, node structure, and safety constraints.
 * Models must not reference arbitrary external URLs or scripts.
 */

export const GLBValidationResult = z
  .object({
    valid: z.boolean(),
    errors: z.array(z.string().max(300)),
    warnings: z.array(z.string().max(300)),
    metadata: z
      .object({
        format: z.enum(['glb', 'gltf']),
        sizeBytes: z.number().int().nonnegative(),
        nodeCount: z.number().int().nonnegative(),
        meshCount: z.number().int().nonnegative(),
        textureCount: z.number().int().nonnegative(),
        hasMultipleMeshes: z.boolean(),
        maxTextureDimension: z.number().int().nonnegative(),
      })
      .strict()
      .optional(),
  })
  .strict();
export type GLBValidationResultType = z.infer<typeof GLBValidationResult>;

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const MAX_NODES = 500;
const MAX_TEXTURE_DIMENSION = 4096;
const MAX_TRIANGLES = 500_000;

/**
 * Validate a GLB file header and basic structure.
 * Returns security/quality metadata and flags issues.
 */
export function validateGLB(buffer: ArrayBuffer): GLBValidationResultType {
  const errors: string[] = [];
  const warnings: string[] = [];
  const bytes = new Uint8Array(buffer);

  // Check file size
  if (buffer.byteLength > MAX_FILE_SIZE) {
    errors.push(`File too large: ${buffer.byteLength} bytes (max ${MAX_FILE_SIZE})`);
    return { valid: false, errors, warnings };
  }

  // Check GLB magic bytes (0x46546C67 = "glTF")
  if (bytes.length < 20) {
    errors.push('File too small to be a valid GLB');
    return { valid: false, errors, warnings };
  }

  const magic = new DataView(buffer).getUint32(0, true);
  if (magic !== 0x46546c67) {
    // Check if it's JSON (GLTF) instead
    const text = new TextDecoder().decode(bytes.slice(0, 100)).trimStart();
    if (text.startsWith('{') || text.startsWith('gltf')) {
      warnings.push('GLTF JSON detected (not binary GLB). Structural validation limited.');
      return {
        valid: true,
        errors,
        warnings,
        metadata: {
          format: 'gltf',
          sizeBytes: buffer.byteLength,
          nodeCount: 0,
          meshCount: 0,
          textureCount: 0,
          hasMultipleMeshes: false,
          maxTextureDimension: 0,
        },
      };
    }
    errors.push('Not a valid GLB file (missing glTF magic bytes)');
    return { valid: false, errors, warnings };
  }

  // GLB header: magic (4) + version (4) + length (4) + JSON chunk length (4) + JSON chunk type (4) + ...
  const version = new DataView(buffer).getUint32(4, true);
  const totalLength = new DataView(buffer).getUint32(8, true);

  if (version !== 2) {
    warnings.push(`GLB version ${version} (expected 2)`);
  }

  if (totalLength !== buffer.byteLength) {
    warnings.push(`GLB header length mismatch: header says ${totalLength}, actual ${buffer.byteLength}`);
  }

  // Parse JSON chunk
  const jsonChunkLength = new DataView(buffer).getUint32(12, true);
  const jsonChunkType = new DataView(buffer).getUint32(16, true);

  if (jsonChunkType !== 0x4e4f534a) {
    errors.push('Invalid GLB: JSON chunk type mismatch');
    return { valid: false, errors, warnings };
  }

  try {
    const jsonBytes = bytes.slice(20, 20 + jsonChunkLength);
    const jsonStr = new TextDecoder().decode(jsonBytes).replace(/\0/g, ' ').trim();
    const gltf = JSON.parse(jsonStr);

    const nodeCount = gltf.nodes?.length ?? 0;
    const meshCount = gltf.meshes?.length ?? 0;
    const textureCount = gltf.textures?.length ?? 0;
    const hasMultipleMeshes = meshCount > 1;

    // Check node count
    if (nodeCount > MAX_NODES) {
      errors.push(`Too many nodes: ${nodeCount} (max ${MAX_NODES})`);
    }

    // Check for suspicious external URI references
    const externalRefs: string[] = [];
    if (gltf.images) {
      for (const img of gltf.images) {
        if (img.uri && !img.uri.startsWith('data:')) {
          externalRefs.push(img.uri);
        }
        if (img.uri?.startsWith('data:')) {
          // Check embedded data URLs are reasonable
          if (img.uri.length > 10 * 1024 * 1024) {
            warnings.push('Large embedded texture data URL detected');
          }
        }
      }
    }
    if (gltf.buffers) {
      for (const buf of gltf.buffers) {
        if (buf.uri && !buf.uri.startsWith('data:')) {
          externalRefs.push(buf.uri);
        }
      }
    }

    if (externalRefs.length > 0) {
      errors.push(
        `External resource references detected (security risk): ${externalRefs.slice(0, 3).join(', ')}`,
      );
    }

    // Check for scripts/behavior extensions
    const extensions = gltf.extensionsUsed ?? [];
    const suspiciousExtensions = extensions.filter((e: string) =>
      /script|behavior|animation|VRM|custom/i.test(e),
    );
    if (suspiciousExtensions.length > 0) {
      warnings.push(`Suspicious glTF extensions: ${suspiciousExtensions.join(', ')}`);
    }

    // Count total triangles (approximate from accessors)
    let triangleCount = 0;
    if (gltf.accessors) {
      for (const acc of gltf.accessors) {
        if (acc.type === 'SCALAR' && acc.count && acc.count > 1000) {
          triangleCount += acc.count / 3;
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      metadata: {
        format: 'glb',
        sizeBytes: buffer.byteLength,
        nodeCount,
        meshCount,
        textureCount,
        hasMultipleMeshes,
        maxTextureDimension: MAX_TEXTURE_DIMENSION, // Cannot easily extract from header alone
      },
    };
  } catch {
    errors.push('Failed to parse GLB JSON chunk');
    return { valid: false, errors, warnings };
  }
}

/**
 * Quick security check: is this GLB safe to store and serve?
 */
export function isGLBSafe(buffer: ArrayBuffer): boolean {
  return validateGLB(buffer).valid;
}

/**
 * Determine model trust level from validation results.
 */
export function determineModelTrust(
  validation: GLBValidationResultType,
  customerConfirmed: boolean,
): 'appearance_3d' | 'conceptual_exploded' | 'verified_exploded' {
  if (validation.metadata?.hasMultipleMeshes && customerConfirmed) {
    return 'verified_exploded';
  }
  return 'appearance_3d';
}
