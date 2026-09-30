import * as THREE from 'three';
import { monotoneResample } from './shared';

export interface SliceLayout {
  /** World units per hour along x. */
  sx: number;
  /** Slice thickness and the gap between slices, along z. */
  thickness: number;
  gap: number;
  /** Value mapped to height 0, and world units per °C. */
  floor: number;
  sy: number;
  /** Height added under every slice so the lowest value still shows. */
  base: number;
  rows: number;
}

export const SUBDIVISIONS = 8;

/** Row 0 sits at the front (+z), later rows further back. */
export function rowZ(layout: SliceLayout, row: number): number {
  const pitch = layout.thickness + layout.gap;
  return ((layout.rows - 1) / 2 - row) * pitch;
}

export function heightOf(layout: SliceLayout, value: number): number {
  return layout.base + Math.max(0, value - layout.floor) * layout.sy;
}

/** Row nearest to a z coordinate, clamped to the slices. */
export function rowAt(layout: SliceLayout, z: number): number {
  const pitch = layout.thickness + layout.gap;
  return Math.max(0, Math.min(layout.rows - 1, Math.round((layout.rows - 1) / 2 - z / pitch)));
}

export interface SliceOptions {
  /** Interpolated points between samples along the top edge. */
  subdivisions?: number;
  /** Maps a sample position (0 to n-1) to the coordinate the shader draws grid lines on. */
  column?: (position: number) => number;
  /** Front and back walls in bare clay (1) or painted in level bands (2). */
  wallFace?: 1 | 2;
}

/**
 * One solid slice per profile, side by side: a smooth top surface following
 * the values and flat clay walls. Everything is merged into a single geometry
 * (one draw call) with per-vertex attributes for the level shader. A profile
 * with no values at all becomes a bare clay slab at the floor.
 */
export function buildSlices(
  profiles: ArrayLike<number>[],
  layout: SliceLayout,
  options: SliceOptions = {},
): THREE.BufferGeometry {
  const steps = options.subdivisions ?? SUBDIVISIONS;
  const column = options.column ?? ((position: number) => position);
  const paintedWalls = options.wallFace ?? 1;
  const positions: number[] = [];
  const normals: number[] = [];
  const values: number[] = [];
  const faces: number[] = [];
  const cols: number[] = [];
  const rows: number[] = [];
  const indices: number[] = [];

  const push = (
    x: number,
    y: number,
    z: number,
    nx: number,
    ny: number,
    nz: number,
    v: number,
    face: number,
    col: number,
    row: number,
  ) => {
    positions.push(x, y, z);
    normals.push(nx, ny, nz);
    values.push(v);
    faces.push(face);
    cols.push(col);
    rows.push(row);
    return positions.length / 3 - 1;
  };

  profiles.forEach((profile, row) => {
    let empty = true;
    for (let i = 0; i < profile.length && empty; i++) empty = !Number.isFinite(profile[i]!);
    const samples = empty
      ? new Float32Array((profile.length - 1) * steps + 1).fill(layout.floor)
      : monotoneResample(profile, steps);
    const n = samples.length;
    const hours = (n - 1) / steps;
    const zc = rowZ(layout, row);
    const zf = zc + layout.thickness / 2;
    const zb = zc - layout.thickness / 2;
    const xOf = (i: number) => (i / steps - hours / 2) * layout.sx;
    const yOf = (i: number) => heightOf(layout, samples[i]!);
    const topFace = empty ? 1 : 0;
    const wallFace = empty ? 1 : paintedWalls;

    // Top surface, normals from the local slope.
    const topStart = positions.length / 3;
    for (let i = 0; i < n; i++) {
      const x = xOf(i);
      const y = yOf(i);
      const dy = yOf(Math.min(n - 1, i + 1)) - yOf(Math.max(0, i - 1));
      const dx = xOf(Math.min(n - 1, i + 1)) - xOf(Math.max(0, i - 1));
      const len = Math.hypot(dy, dx);
      const nx = -dy / len;
      const ny = dx / len;
      const col = column(i / steps);
      push(x, y, zf, nx, ny, 0, samples[i]!, topFace, col, row);
      push(x, y, zb, nx, ny, 0, samples[i]!, topFace, col, row);
    }
    for (let i = 0; i < n - 1; i++) {
      const a = topStart + i * 2;
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }

    // Front and back walls.
    for (const [z, nz] of [
      [zf, 1],
      [zb, -1],
    ] as const) {
      const start = positions.length / 3;
      for (let i = 0; i < n; i++) {
        push(xOf(i), 0, z, 0, 0, nz, samples[i]!, wallFace, column(i / steps), row);
        push(xOf(i), yOf(i), z, 0, 0, nz, samples[i]!, wallFace, column(i / steps), row);
      }
      for (let i = 0; i < n - 1; i++) {
        const a = start + i * 2;
        if (nz > 0) indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
        else indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }

    // End caps.
    for (const [i, nx] of [
      [0, -1],
      [n - 1, 1],
    ] as const) {
      const x = xOf(i);
      const y = yOf(i);
      const col = column(i / steps);
      const a = push(x, 0, zb, nx, 0, 0, samples[i]!, 1, col, row);
      const b = push(x, 0, zf, nx, 0, 0, samples[i]!, 1, col, row);
      const c = push(x, y, zf, nx, 0, 0, samples[i]!, 1, col, row);
      const d = push(x, y, zb, nx, 0, 0, samples[i]!, 1, col, row);
      if (nx < 0) indices.push(a, b, c, a, c, d);
      else indices.push(a, c, b, a, d, c);
    }
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('aValue', new THREE.Float32BufferAttribute(values, 1));
  geometry.setAttribute('aFace', new THREE.Float32BufferAttribute(faces, 1));
  geometry.setAttribute('aCol', new THREE.Float32BufferAttribute(cols, 1));
  geometry.setAttribute('aRow', new THREE.Float32BufferAttribute(rows, 1));
  geometry.setIndex(indices);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
