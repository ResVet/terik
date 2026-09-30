import * as THREE from 'three';

/** Colours read from the CSS tokens, so the 3D views follow the theme exactly. */
export interface Palette {
  levels: [THREE.Color, THREE.Color, THREE.Color, THREE.Color, THREE.Color];
  clay: THREE.Color;
  clayDeep: THREE.Color;
  ink: THREE.Color;
  surface: THREE.Color;
  page: THREE.Color;
  dark: boolean;
}

export function readPalette(dark: boolean): Palette {
  const style = getComputedStyle(document.documentElement);
  const color = (name: string, fallback: string) => new THREE.Color(style.getPropertyValue(name).trim() || fallback);
  return {
    levels: [
      color('--level-1', '#70c39b'),
      color('--level-2', '#bd9600'),
      color('--level-3', '#ca5000'),
      color('--level-4', '#b01c30'),
      color('--level-5', '#711744'),
    ],
    clay: color('--clay', '#ddd6ca'),
    clayDeep: color('--clay-deep', '#cbc2b3'),
    ink: color('--ink', '#1e1a15'),
    surface: color('--surface', '#fcfaf6'),
    page: color('--page', '#f6f3ed'),
    dark,
  };
}

/**
 * Monotone cubic interpolation (Fritsch-Carlson) of evenly spaced samples.
 * It never overshoots, so a smoothed curve cannot show a risk level that no
 * actual hourly value reached. NaN samples take their nearest valid neighbour.
 */
export function monotoneResample(values: ArrayLike<number>, perStep: number): Float32Array {
  const n = values.length;
  const y = new Float64Array(n);
  let last = Number.NaN;
  for (let i = 0; i < n; i++) {
    const v = values[i]!;
    y[i] = Number.isFinite(v) ? v : last;
    if (Number.isFinite(v)) last = v;
  }
  let next = Number.NaN;
  for (let i = n - 1; i >= 0; i--) {
    if (Number.isFinite(y[i]!)) next = y[i]!;
    else y[i] = next;
  }
  for (let i = 0; i < n; i++) if (!Number.isFinite(y[i]!)) y[i] = 0;

  const delta = new Float64Array(n - 1);
  for (let i = 0; i < n - 1; i++) delta[i] = y[i + 1]! - y[i]!;
  const m = new Float64Array(n);
  m[0] = delta[0] ?? 0;
  m[n - 1] = delta[n - 2] ?? 0;
  for (let i = 1; i < n - 1; i++) {
    m[i] = delta[i - 1]! * delta[i]! <= 0 ? 0 : (delta[i - 1]! + delta[i]!) / 2;
  }
  for (let i = 0; i < n - 1; i++) {
    const d = delta[i]!;
    if (d === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i]! / d;
    const b = m[i + 1]! / d;
    const s = a * a + b * b;
    if (s > 9) {
      const tau = 3 / Math.sqrt(s);
      m[i] = tau * a * d;
      m[i + 1] = tau * b * d;
    }
  }

  const out = new Float32Array((n - 1) * perStep + 1);
  for (let i = 0; i < n - 1; i++) {
    for (let k = 0; k < perStep; k++) {
      const t = k / perStep;
      const t2 = t * t;
      const t3 = t2 * t;
      out[i * perStep + k] =
        (2 * t3 - 3 * t2 + 1) * y[i]! +
        (t3 - 2 * t2 + t) * m[i]! +
        (-2 * t3 + 3 * t2) * y[i + 1]! +
        (t3 - t2) * m[i + 1]!;
    }
  }
  out[out.length - 1] = y[n - 1]!;
  return out;
}

export interface LevelUniforms {
  uLevels: { value: THREE.Color[] };
  uThresholds: { value: THREE.Vector4 };
  uThresholdY: { value: THREE.Vector4 };
  uClay: { value: THREE.Color };
  uClayDeep: { value: THREE.Color };
  uSelect: { value: THREE.Vector4 };
  uNow: { value: THREE.Vector2 };
  uDim: { value: number };
}

/** Half-width, in column units, of the highlight around a selected column. */
export const SELECT_HALF_WIDTH = 0.45;

const UP = new THREE.Vector3(0, 1, 0);

/** Unit vector pointing from the target towards the camera. */
export function viewDirection(azimuthDeg: number, elevationDeg: number): THREE.Vector3 {
  const az = THREE.MathUtils.degToRad(azimuthDeg);
  const el = THREE.MathUtils.degToRad(elevationDeg);
  return new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
}

/**
 * Camera target and position that fit every point in view from the given
 * direction, centred on screen. `margin` is the share of the half-frame the
 * points may use; the rest is room for HTML labels drawn around anchors.
 */
export function frameScene(
  fovDeg: number,
  aspect: number,
  direction: THREE.Vector3,
  points: THREE.Vector3[],
  margin = 0.9,
): { target: THREE.Vector3; position: THREE.Vector3; distance: number } {
  const dir = direction.clone().normalize();
  const forward = dir.clone().negate();
  const right = new THREE.Vector3().crossVectors(forward, UP).normalize();
  const up = new THREE.Vector3().crossVectors(right, forward).normalize();
  const tanV = Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2) * margin;
  const tanH = tanV * aspect;

  const box = new THREE.Box3().setFromPoints(points);
  const target = box.getCenter(new THREE.Vector3());
  const rel = new THREE.Vector3();
  let distance = 1;
  for (let pass = 0; pass < 4; pass++) {
    distance = 0;
    for (const p of points) {
      rel.subVectors(p, target);
      const z = rel.dot(forward);
      distance = Math.max(distance, Math.abs(rel.dot(right)) / tanH - z, Math.abs(rel.dot(up)) / tanV - z);
    }
    // Where the points land on screen at that distance; shift the target to centre them.
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of points) {
      rel.subVectors(p, target);
      const depth = Math.max(1e-3, distance + rel.dot(forward));
      const sx = rel.dot(right) / (depth * tanH);
      const sy = rel.dot(up) / (depth * tanV);
      minX = Math.min(minX, sx);
      maxX = Math.max(maxX, sx);
      minY = Math.min(minY, sy);
      maxY = Math.max(maxY, sy);
    }
    target
      .addScaledVector(right, ((minX + maxX) / 2) * distance * tanH)
      .addScaledVector(up, ((minY + maxY) / 2) * distance * tanV);
  }
  return { target, position: target.clone().addScaledVector(dir, distance), distance };
}

/** Round values between `from` and `to`, about `count` of them, for a height ruler. */
export function rulerTicks(from: number, to: number, count = 4): number[] {
  const span = Math.max(1e-6, to - from);
  const raw = span / count;
  const steps = [0.5, 1, 2, 2.5, 5, 10];
  const step = steps.find((s) => s >= raw) ?? 10;
  const out: number[] = [];
  for (let v = Math.ceil(from / step) * step; v <= to + 1e-9; v += step) out.push(Math.round(v * 100) / 100);
  return out;
}

export function createLevelUniforms(palette: Palette): LevelUniforms {
  return {
    uLevels: { value: palette.levels.map((c) => c.clone()) },
    uThresholds: { value: new THREE.Vector4(99, 99, 99, 99) },
    uThresholdY: { value: new THREE.Vector4(-9, -9, -9, -9) },
    uClay: { value: palette.clay.clone() },
    uClayDeep: { value: palette.clayDeep.clone() },
    // x = selected column, y = selected row, z = 1 when active, w = highlight half-width
    uSelect: { value: new THREE.Vector4(0, 0, 0, SELECT_HALF_WIDTH) },
    // x = row the "now" line is on, y = column of now (negative = none)
    uNow: { value: new THREE.Vector2(0, -1) },
    uDim: { value: 0.45 },
  };
}

export function applyPalette(uniforms: LevelUniforms, palette: Palette): void {
  palette.levels.forEach((c, i) => uniforms.uLevels.value[i]!.copy(c));
  uniforms.uClay.value.copy(palette.clay);
  uniforms.uClayDeep.value.copy(palette.clayDeep);
  uniforms.uDim.value = palette.dark ? 0.55 : 0.45;
}

/**
 * A standard material whose top faces take the risk-level colour of the
 * interpolated WBGT (attribute aValue), with anti-aliased contour lines where
 * a level boundary is crossed. Faces with aFace = 1 are bare clay with thin
 * strata at the threshold heights; aFace = 2 walls are painted in level bands
 * by height.
 *
 * Attributes: aValue (°C), aFace (0 top, 1 clay, 2 painted wall), aCol
 * (column coordinate), aRow (row index).
 */
export function createLevelMaterial(uniforms: LevelUniforms, gridStep: number): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ roughness: 0.82, metalness: 0, color: 0xffffff });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute float aValue;
        attribute float aFace;
        attribute float aCol;
        attribute float aRow;
        varying float vValue;
        varying float vFace;
        varying float vCol;
        varying float vRow;
        varying float vY;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vValue = aValue;
        vFace = aFace;
        vCol = aCol;
        vRow = aRow;
        vY = position.y;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform vec3 uLevels[5];
        uniform vec4 uThresholds;
        uniform vec4 uThresholdY;
        uniform vec3 uClay;
        uniform vec3 uClayDeep;
        uniform vec4 uSelect;
        uniform vec2 uNow;
        uniform float uDim;
        varying float vValue;
        varying float vFace;
        varying float vCol;
        varying float vRow;
        varying float vY;

        vec3 colourOfLevel(float l) {
          vec3 c = uLevels[0];
          c = mix(c, uLevels[1], step(0.5, l));
          c = mix(c, uLevels[2], step(1.5, l));
          c = mix(c, uLevels[3], step(2.5, l));
          c = mix(c, uLevels[4], step(3.5, l));
          return c;
        }

        vec3 levelColour(float v) {
          return colourOfLevel(step(uThresholds.x, v) + step(uThresholds.y, v) + step(uThresholds.z, v) + step(uThresholds.w, v));
        }

        float lineAt(float x, float target, float width) {
          return 1.0 - smoothstep(0.0, width, abs(x - target));
        }

        float selection() {
          if (uSelect.z < 0.5 || abs(vRow - uSelect.y) >= 0.5) return 0.0;
          return 1.0 - smoothstep(uSelect.w * 0.78, uSelect.w * 1.22, abs(vCol - uSelect.x));
        }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        if (vFace < 0.5) {
          // Top: the level of the value, with contour lines where a level begins.
          vec3 c = levelColour(vValue);
          float w = max(fwidth(vValue) * 1.4, 1e-4);
          float contour = max(max(lineAt(vValue, uThresholds.x, w), lineAt(vValue, uThresholds.y, w)),
                              max(lineAt(vValue, uThresholds.z, w), lineAt(vValue, uThresholds.w, w)));
          c *= 1.0 - 0.38 * contour;
          float g = abs(fract(vCol / ${gridStep.toFixed(1)} + 0.5) - 0.5) * ${gridStep.toFixed(1)};
          float grid = 1.0 - smoothstep(0.0, fwidth(vCol) * 1.1, g);
          c *= 1.0 - 0.07 * grid;
          if (uNow.y >= 0.0 && abs(vRow - uNow.x) < 0.5 && vCol < uNow.y) {
            c = mix(c, vec3(dot(c, vec3(0.299, 0.587, 0.114))), uDim);
          }
          c = mix(c, vec3(1.0), 0.28 * selection());
          diffuseColor.rgb = c;
        } else if (vFace > 1.5) {
          // Painted wall: every height takes the colour of its level, like layered clay.
          float l = step(uThresholdY.x, vY) + step(uThresholdY.y, vY) + step(uThresholdY.z, vY) + step(uThresholdY.w, vY);
          vec3 c = colourOfLevel(l);
          float w = max(fwidth(vY) * 1.2, 1e-4);
          float strata = max(max(lineAt(vY, uThresholdY.x, w), lineAt(vY, uThresholdY.y, w)),
                             max(lineAt(vY, uThresholdY.z, w), lineAt(vY, uThresholdY.w, w)));
          c *= (1.0 - 0.22 * strata) * mix(0.8, 0.95, smoothstep(0.0, 0.8, vY));
          diffuseColor.rgb = c;
        } else {
          // Bare clay, with thin strata at the level heights.
          float w = max(fwidth(vY) * 1.2, 1e-4);
          float strata = max(max(lineAt(vY, uThresholdY.x, w), lineAt(vY, uThresholdY.y, w)),
                             max(lineAt(vY, uThresholdY.z, w), lineAt(vY, uThresholdY.w, w)));
          vec3 c = mix(uClay, uClayDeep, 0.85 * strata);
          c *= mix(0.86, 1.0, smoothstep(0.0, 0.5, vY));
          diffuseColor.rgb = c;
        }`,
      );
  };
  material.customProgramCacheKey = () => `terik-level-${gridStep}`;
  return material;
}
