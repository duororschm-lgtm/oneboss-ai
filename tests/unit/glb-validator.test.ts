import { describe, it, expect } from 'vitest';
import { validateGLB, isGLBSafe, determineModelTrust } from '../../src/lib/three-d/glb-validator';

// Minimal valid GLB magic bytes for testing
function createMockGLB(options?: {
  jsonContent?: string;
  withExternalRefs?: boolean;
  nodeCount?: number;
  meshCount?: number;
}): ArrayBuffer {
  const json = options?.jsonContent ??
    JSON.stringify({
      asset: { version: '2.0' },
      nodes: Array.from({ length: options?.nodeCount ?? 3 }, (_, i) => ({ name: `node-${i}` })),
      meshes: Array.from({ length: options?.meshCount ?? 1 }, (_, i) => ({ name: `mesh-${i}` })),
      ...(options?.withExternalRefs
        ? { images: [{ uri: 'https://evil.example.com/texture.png' }] }
        : {}),
    });
  const jsonBytes = new TextEncoder().encode(json);
  const jsonPadded = new Uint8Array(Math.ceil(jsonBytes.length / 4) * 4);
  jsonPadded.set(jsonBytes);

  const totalLength = 20 + jsonPadded.length;
  const buffer = new ArrayBuffer(totalLength);
  const view = new DataView(buffer);

  // GLB header
  view.setUint32(0, 0x46546c67, true); // magic "glTF"
  view.setUint32(4, 2, true); // version
  view.setUint32(8, totalLength, true); // total length
  view.setUint32(12, jsonPadded.length, true); // JSON chunk length
  view.setUint32(16, 0x4e4f534a, true); // JSON chunk type "JSON"

  // JSON chunk data
  new Uint8Array(buffer, 20).set(jsonPadded);

  return buffer;
}

describe('GLB validation', () => {
  it('rejects empty buffer', () => {
    const result = validateGLB(new ArrayBuffer(0));
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('rejects non-GLB data', () => {
    const buffer = new ArrayBuffer(100);
    new Uint8Array(buffer).set(new TextEncoder().encode('not a glb file'));
    const result = validateGLB(buffer);
    expect(result.valid).toBe(false);
  });

  it('accepts a valid minimal GLB', () => {
    const glb = createMockGLB();
    const result = validateGLB(glb);
    expect(result.valid).toBe(true);
    expect(result.metadata?.format).toBe('glb');
    expect(result.metadata?.nodeCount).toBe(3);
    expect(result.metadata?.meshCount).toBe(1);
    expect(result.metadata?.hasMultipleMeshes).toBe(false);
  });

  it('detects external resource references', () => {
    const glb = createMockGLB({ withExternalRefs: true });
    const result = validateGLB(glb);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('External'))).toBe(true);
  });

  it('flags multiple meshes', () => {
    const glb = createMockGLB({ meshCount: 5 });
    const result = validateGLB(glb);
    expect(result.metadata?.hasMultipleMeshes).toBe(true);
  });

  it('flags too many nodes', () => {
    const glb = createMockGLB({ nodeCount: 600 });
    const result = validateGLB(glb);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Too many nodes'))).toBe(true);
  });

  it('isGLBSafe returns boolean', () => {
    expect(typeof isGLBSafe(createMockGLB())).toBe('boolean');
  });

  it('determines model trust from validation', () => {
    const multiMesh = validateGLB(createMockGLB({ meshCount: 3 }));
    expect(determineModelTrust(multiMesh, true)).toBe('verified_exploded');
    expect(determineModelTrust(multiMesh, false)).toBe('appearance_3d');

    const singleMesh = validateGLB(createMockGLB({ meshCount: 1 }));
    expect(determineModelTrust(singleMesh, true)).toBe('appearance_3d');
  });

  it('detects GLTF JSON format', () => {
    const buffer = new ArrayBuffer(100);
    new Uint8Array(buffer).set(new TextEncoder().encode('{"asset":{"version":"2.0"}}'));
    const result = validateGLB(buffer);
    expect(result.warnings.some((w) => w.includes('GLTF'))).toBe(true);
    expect(result.metadata?.format).toBe('gltf');
  });
});
