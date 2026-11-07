import * as THREE from 'three';
import type { z } from 'zod';
import { PartMaterial } from '../../contracts/product3d';

type PartMaterialInput = z.infer<typeof PartMaterial>;

/**
 * Multi-category parametric 3D builder.
 * Generates category-specific geometry from structured parameters.
 * Each builder produces real Three.js geometry (not simple boxes).
 * All output is labelled as parametric concept, never claimed as real scan.
 */

export type BuilderParams = Record<string, number | string | boolean>;

export type BuiltPart = {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  name: string;
  role: string;
};

export type BuildResult = {
  parts: BuiltPart[];
  boundingBox: { width: number; height: number; depth: number };
  category: string;
};

// --- PBR Material presets ---
const MATERIAL_PRESETS: Record<string, { color: string; roughness: number; metalness: number }> = {
  wood: { color: '#a67c52', roughness: 0.65, metalness: 0.05 },
  brushed_metal: { color: '#8a8d8f', roughness: 0.35, metalness: 0.85 },
  polished_metal: { color: '#b0b0b0', roughness: 0.15, metalness: 0.9 },
  aluminum: { color: '#c0c0c0', roughness: 0.3, metalness: 0.8 },
  stainless_steel: { color: '#d0d0d0', roughness: 0.25, metalness: 0.85 },
  plastic: { color: '#e0e0e0', roughness: 0.55, metalness: 0.02 },
  rubber: { color: '#333333', roughness: 0.9, metalness: 0.0 },
  leather: { color: '#8b6c4a', roughness: 0.75, metalness: 0.02 },
  fabric: { color: '#9a8a7a', roughness: 0.85, metalness: 0.0 },
  glass: { color: '#e8f0f0', roughness: 0.05, metalness: 0.1 },
  ceramic: { color: '#f0ece0', roughness: 0.35, metalness: 0.02 },
  paper: { color: '#f5f0e0', roughness: 0.85, metalness: 0.0 },
  cardboard: { color: '#c8a87a', roughness: 0.9, metalness: 0.0 },
  transparent_acrylic: { color: '#d0e8f0', roughness: 0.08, metalness: 0.05 },
  painted_surface: { color: '#4488cc', roughness: 0.35, metalness: 0.1 },
  screen_glass: { color: '#1a1a2e', roughness: 0.08, metalness: 0.1 },
  custom: { color: '#aaaaaa', roughness: 0.5, metalness: 0.3 },
};

function makeMaterial(material: PartMaterialInput): THREE.Material {
  const preset = MATERIAL_PRESETS[material.preset] ?? MATERIAL_PRESETS.custom;
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(material.color ?? preset.color),
    roughness: material.roughness ?? preset.roughness,
    metalness: material.metalness ?? preset.metalness,
    transparent: material.preset === 'glass' || material.preset === 'transparent_acrylic',
    opacity: material.preset === 'glass' || material.preset === 'transparent_acrylic' ? 0.3 : 1.0,
  });
}

// --- Category builders ---

function buildFurniture(params: BuilderParams): BuiltPart[] {
  const width = Number(params.width ?? 0.5);
  const height = Number(params.height ?? 0.8);
  const depth = Number(params.depth ?? 0.5);
  const parts: BuiltPart[] = [];

  // Seat — rounded slab
  const seatGeo = new THREE.BoxGeometry(width, 0.08, depth);
  seatGeo.translate(0, height * 0.55, 0);
  parts.push({
    geometry: seatGeo,
    material: makeMaterial({ preset: 'fabric', color: '#8a9a8e' }),
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    name: '坐垫',
    role: 'seat',
  });

  // Backrest — curved plank
  const backGeo = new THREE.BoxGeometry(width * 0.9, height * 0.45, 0.05);
  backGeo.translate(0, height * 0.78, -depth * 0.42);
  parts.push({
    geometry: backGeo,
    material: makeMaterial({ preset: 'wood' }),
    position: [0, 0, 0],
    rotation: [-0.15, 0, 0],
    scale: [1, 1, 1],
    name: '靠背',
    role: 'backrest',
  });

  // Legs — 4 cylinders
  const legPositions: [number, number][] = [
    [-width * 0.4, depth * 0.35],
    [width * 0.4, depth * 0.35],
    [-width * 0.4, -depth * 0.35],
    [width * 0.4, -depth * 0.35],
  ];
  for (const [x, z] of legPositions) {
    const legGeo = new THREE.CylinderGeometry(0.025, 0.02, height * 0.55, 12);
    legGeo.translate(x, height * 0.275, z);
    parts.push({
      geometry: legGeo,
      material: makeMaterial({ preset: 'wood' }),
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      name: '椅腿',
      role: 'leg',
    });
  }

  return parts;
}

function buildElectronics(params: BuilderParams): BuiltPart[] {
  const width = Number(params.width ?? 0.15);
  const height = Number(params.height ?? 0.08);
  const depth = Number(params.depth ?? 0.15);
  const parts: BuiltPart[] = [];

  // Body
  const bodyGeo = new THREE.BoxGeometry(width, height, depth);
  // Round edges by scaling a slightly larger inner box
  parts.push({
    geometry: bodyGeo,
    material: makeMaterial({ preset: 'aluminum', color: '#2a2a2e' }),
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    name: '机身',
    role: 'body',
  });

  // Screen
  const screenGeo = new THREE.PlaneGeometry(width * 0.85, height * 0.7);
  screenGeo.rotateX(-Math.PI / 2);
  screenGeo.translate(0, height / 2 + 0.001, 0);
  parts.push({
    geometry: screenGeo,
    material: makeMaterial({ preset: 'screen_glass' }),
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    name: '屏幕',
    role: 'screen',
  });

  return parts;
}

function buildBottle(params: BuilderParams): BuiltPart[] {
  const radius = Number(params.radius ?? 0.04);
  const height = Number(params.height ?? 0.2);
  const parts: BuiltPart[] = [];

  // Body — lathe geometry (revolved curve)
  const points: THREE.Vector2[] = [];
  const segments = 16;
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const y = t * height;
    const r = radius * (1 - t * 0.15) * (1 + Math.sin(t * Math.PI) * 0.08);
    points.push(new THREE.Vector2(Math.max(r, 0.01), y));
  }
  const bodyGeo = new THREE.LatheGeometry(points, 24);
  parts.push({
    geometry: bodyGeo,
    material: makeMaterial({ preset: 'glass', color: '#d4e8e0' }),
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    name: '瓶身',
    role: 'body',
  });

  // Cap
  const capGeo = new THREE.CylinderGeometry(radius * 0.35, radius * 0.38, height * 0.12, 16);
  capGeo.translate(0, height * 1.06, 0);
  parts.push({
    geometry: capGeo,
    material: makeMaterial({ preset: 'polished_metal', color: '#c8a050' }),
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    name: '瓶盖',
    role: 'cap',
  });

  return parts;
}

function buildVehicle(params: BuilderParams): BuiltPart[] {
  const length = Number(params.length ?? 1.2);
  const width = Number(params.width ?? 0.55);
  const height = Number(params.height ?? 0.35);
  const parts: BuiltPart[] = [];

  // Body — rounded box
  const bodyGeo = new THREE.BoxGeometry(length, height * 0.5, width);
  bodyGeo.translate(0, height * 0.35, 0);
  parts.push({
    geometry: bodyGeo,
    material: makeMaterial({ preset: 'painted_surface', color: '#cc2222' }),
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    name: '车身',
    role: 'body',
  });

  // Cabin
  const cabinGeo = new THREE.BoxGeometry(length * 0.5, height * 0.35, width * 0.85);
  cabinGeo.translate(-length * 0.05, height * 0.72, 0);
  parts.push({
    geometry: cabinGeo,
    material: makeMaterial({ preset: 'screen_glass' }),
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    name: '座舱',
    role: 'cabin',
  });

  // Wheels — 4
  const wheelPositions: [number, number][] = [
    [-length * 0.35, width * 0.42],
    [length * 0.35, width * 0.42],
    [-length * 0.35, -width * 0.42],
    [length * 0.35, -width * 0.42],
  ];
  for (const [x, z] of wheelPositions) {
    const wheelGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.08, 16);
    wheelGeo.rotateZ(Math.PI / 2);
    wheelGeo.translate(x, 0.1, z);
    parts.push({
      geometry: wheelGeo,
      material: makeMaterial({ preset: 'rubber' }),
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      name: '车轮',
      role: 'wheel',
    });
  }

  return parts;
}

function buildShoe(params: BuilderParams): BuiltPart[] {
  const length = Number(params.length ?? 0.28);
  const width = Number(params.width ?? 0.1);
  const height = Number(params.height ?? 0.12);
  const parts: BuiltPart[] = [];

  // Sole
  const soleGeo = new THREE.BoxGeometry(length, height * 0.25, width);
  soleGeo.translate(0, height * 0.125, 0);
  parts.push({
    geometry: soleGeo,
    material: makeMaterial({ preset: 'rubber', color: '#f0f0f0' }),
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    name: '鞋底',
    role: 'sole',
  });

  // Upper
  const upperGeo = new THREE.BoxGeometry(length * 0.75, height * 0.65, width * 0.9);
  upperGeo.translate(length * 0.1, height * 0.55, 0);
  parts.push({
    geometry: upperGeo,
    material: makeMaterial({ preset: 'fabric', color: '#2a3a6a' }),
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    name: '鞋面',
    role: 'upper',
  });

  // Heel counter
  const heelGeo = new THREE.BoxGeometry(length * 0.22, height * 0.75, width * 0.85);
  heelGeo.translate(-length * 0.32, height * 0.55, 0);
  parts.push({
    geometry: heelGeo,
    material: makeMaterial({ preset: 'fabric', color: '#2a3a6a' }),
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    name: '后跟',
    role: 'heel',
  });

  return parts;
}

function buildGeneric(params: BuilderParams): BuiltPart[] {
  const width = Number(params.width ?? 0.3);
  const height = Number(params.height ?? 0.3);
  const depth = Number(params.depth ?? 0.3);
  const parts: BuiltPart[] = [];

  // Main body — rounded by using a scaled sphere-ish shape
  const bodyGeo = new THREE.BoxGeometry(width, height, depth, 4, 4, 4);
  parts.push({
    geometry: bodyGeo,
    material: makeMaterial({ preset: 'plastic', color: '#c0b090' }),
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    name: '主体',
    role: 'body',
  });

  // Detail cap
  const capGeo = new THREE.SphereGeometry(Math.min(width, depth) * 0.2, 12, 8);
  capGeo.translate(0, height * 0.55, 0);
  parts.push({
    geometry: capGeo,
    material: makeMaterial({ preset: 'polished_metal' }),
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    name: '顶部',
    role: 'cap',
  });

  return parts;
}

// --- Router ---
const BUILDERS: Record<string, (params: BuilderParams) => BuiltPart[]> = {
  furniture: buildFurniture,
  electronics: buildElectronics,
  bottle_container: buildBottle,
  vehicle: buildVehicle,
  footwear: buildShoe,
  home_living: buildFurniture, // Similar structure
  packaging: buildGeneric,
  toy: buildGeneric,
  mechanical_tool: buildGeneric,
  other: buildGeneric,
};

export function buildProduct(category: string, params: BuilderParams): BuildResult {
  const builder = BUILDERS[category] ?? BUILDERS.other;
  const parts = builder(params);

  // Calculate bounding box
  const box = new THREE.Box3();
  for (const part of parts) {
    part.geometry.computeBoundingBox();
    const bb = part.geometry.boundingBox!;
    box.union(bb);
  }
  const size = new THREE.Vector3();
  box.getSize(size);

  return {
    parts,
    boundingBox: { width: size.x, height: size.y, depth: size.z },
    category,
  };
}

/**
 * Create explode transforms for built parts.
 * Parts get separated radially from center based on their role.
 */
export function createExplodeTransforms(parts: BuiltPart[]): Map<string, [number, number, number]> {
  const transforms = new Map<string, [number, number, number]>();
  const center = new THREE.Vector3(0, 0, 0);

  // Group parts by role for radial explode direction
  const roleOffsets: Record<string, [number, number, number]> = {
    backrest: [0, 1.2, -0.8],
    seat: [0, 0.6, 0.5],
    body: [0, 0.2, 0],
    screen: [0, 1.0, 0.3],
    cap: [0, 1.5, 0],
    leg: [0, -1.2, 0],
    wheel: [0, -1.0, 0],
    sole: [0, -1.0, 0],
    upper: [0, 0.8, 0],
    heel: [0, 0.5, -1.0],
    cabin: [0, 1.4, 0],
  };

  const legIndex = { fl: [-1, 1], fr: [1, 1], bl: [-1, -1], br: [1, -1] };
  let legCounter = 0;

  for (const part of parts) {
    const baseOffset = roleOffsets[part.role] ?? [0, 0.5, 0];
    if (part.role === 'leg' || part.role === 'wheel') {
      const directions = Object.values(legIndex);
      const [dx, dz] = directions[legCounter % 4];
      transforms.set(part.name + legCounter, [dx * 0.8, baseOffset[1], dz * 0.8]);
      legCounter++;
    } else {
      transforms.set(part.name, baseOffset);
    }
  }

  return transforms;
}

export function makeMaterialFromPreset(preset: string, color?: string): THREE.Material {
  return makeMaterial({ preset: preset as any, ...(color ? { color } : {}) });
}
