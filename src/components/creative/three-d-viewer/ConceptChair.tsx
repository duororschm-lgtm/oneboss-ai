'use client';
import { useRef, useState, useCallback } from 'react';
import * as THREE from 'three';

export type ChairPart = {
  id: string;
  label: string;
  explodeOffset: [number, number, number];
};

export const CHAIR_PARTS: ChairPart[] = [
  { id: 'backrest', label: '弧形靠背', explodeOffset: [0, 1.2, -0.6] },
  { id: 'seat', label: '坐垫', explodeOffset: [0, 0.4, 0.4] },
  { id: 'frame', label: '支撑结构', explodeOffset: [0, -0.2, -0.8] },
  { id: 'leg-fl', label: '前左椅腿', explodeOffset: [-0.8, -1.0, 0.6] },
  { id: 'leg-fr', label: '前右椅腿', explodeOffset: [0.8, -1.0, 0.6] },
  { id: 'leg-bl', label: '后左椅腿', explodeOffset: [-0.8, -1.0, -0.6] },
  { id: 'leg-br', label: '后右椅腿', explodeOffset: [0.8, -1.0, -0.6] },
];

type Props = {
  explode: number; // 0 = assembled, 1 = fully exploded
  selectedPart: string | null;
  onSelectPart: (id: string | null) => void;
  palette: { accent: string; surface: string; text: string };
};

/**
 * Procedural concept chair built from real Three.js meshes.
 * Each part is a separate Mesh with its own explode offset.
 * Explicitly labelled as concept structure, not a verified product.
 */
export function ConceptChair({ explode, selectedPart, onSelectPart, palette }: Props) {
  const groupRef = useRef<THREE.Group>(null);
  const accentColor = new THREE.Color(palette.accent);
  const woodColor = new THREE.Color('#a67c52');
  const woodDark = new THREE.Color('#7a5a3a');
  const fabricColor = new THREE.Color(palette.surface).lerp(new THREE.Color(palette.text), 0.15);

  const partPosition = (part: ChairPart): [number, number, number] => {
    const t = explode;
    return [
      part.explodeOffset[0] * t,
      part.explodeOffset[1] * t,
      part.explodeOffset[2] * t,
    ];
  };

  const partMaterial = (partId: string, base: THREE.Color) => {
    const isSelected = selectedPart === partId;
    return {
      color: isSelected ? accentColor : base,
      roughness: 0.65,
      metalness: 0.08,
      emissive: isSelected ? accentColor : new THREE.Color('#000000'),
      emissiveIntensity: isSelected ? 0.25 : 0,
    };
  };

  const handleClick = useCallback(
    (id: string) => (e: any) => {
      e.stopPropagation();
      onSelectPart(selectedPart === id ? null : id);
    },
    [selectedPart, onSelectPart],
  );

  return (
    <group ref={groupRef}>
      {/* Backrest — curved plank */}
      <mesh
        position={[0, 1.05, -0.28]}
        onClick={handleClick('backrest')}
        {...partMaterial('backrest', woodColor)}
      >
        <boxGeometry args={[0.88, 0.72, 0.06]} />
        <meshStandardMaterial {...partMaterial('backrest', woodColor)} />
        <group position={[0, 0, 0.035]}>
          <mesh>
            <boxGeometry args={[0.78, 0.6, 0.015]} />
            <meshStandardMaterial {...partMaterial('backrest', woodDark)} />
          </mesh>
        </group>
      </mesh>

      {/* Seat cushion */}
      <mesh
        position={[0, 0.48, 0]}
        onClick={handleClick('seat')}
        {...partMaterial('seat', fabricColor)}
      >
        <boxGeometry args={[0.84, 0.1, 0.78]} />
        <meshStandardMaterial {...partMaterial('seat', fabricColor)} />
      </mesh>

      {/* Seat frame / platform */}
      <mesh
        position={[0, 0.38, 0]}
        onClick={handleClick('frame')}
        {...partMaterial('frame', woodDark)}
      >
        <boxGeometry args={[0.9, 0.06, 0.84]} />
        <meshStandardMaterial {...partMaterial('frame', woodDark)} />
      </mesh>

      {/* Legs — 4 separate meshes */}
      {(
        [
          ['leg-fl', -0.36, 0.36],
          ['leg-fr', 0.36, 0.36],
          ['leg-bl', -0.36, -0.36],
          ['leg-br', 0.36, -0.36],
        ] as const
      ).map(([id, x, z]) => {
        const part = CHAIR_PARTS.find((p) => p.id === id)!;
        return (
          <mesh
            key={id}
            position={[x, 0.16, z]}
            onClick={handleClick(id)}
            {...partMaterial(id, woodColor)}
          >
            <boxGeometry args={[0.07, 0.36, 0.07]} />
            <meshStandardMaterial {...partMaterial(id, woodColor)} />
          </mesh>
        );
      })}
    </group>
  );
}
