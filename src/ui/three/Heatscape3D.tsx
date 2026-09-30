import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { LabelLayer, ProjectLabels, type LabelRefs, type SceneLabel } from './labels';
import {
  applyPalette,
  createLevelMaterial,
  createLevelUniforms,
  readPalette,
  rulerTicks,
  SELECT_HALF_WIDTH,
  viewDirection,
  type Palette,
} from './shared';
import { buildSlices, heightOf, rowAt, rowZ, type SliceLayout } from './sliceGeometry';
import { Controls, Plinth, Ruler, StudioLights, useFraming } from './staging';
import styles from './Heatscape3D.module.css';

export interface HeatscapeProps {
  /** One 25-value profile (00:00 to 24:00) per day. */
  profiles: Float32Array[];
  dayLabels: string[];
  thresholds: readonly [number, number, number, number];
  /** Hours since the first day's midnight, or null. */
  nowOffset: number | null;
  nowLabel: string;
  selected: { day: number; hour: number } | null;
  onSelect: (day: number, hour: number) => void;
  formatTemp: (celsius: number) => string;
  dark: boolean;
  reducedMotion: boolean;
  ariaLabel: string;
}

const SX = 0.5;
const HEIGHT = 2.5;
// From the front left, so the day names at the start of each slice face the viewer.
const DIRECTION = viewDirection(-24, 36);

function useLayout(profiles: Float32Array[], thresholds: readonly number[]): SliceLayout {
  return useMemo(() => {
    let min = Infinity;
    let max = -Infinity;
    for (const p of profiles) {
      for (const v of p) {
        if (Number.isFinite(v)) {
          min = Math.min(min, v);
          max = Math.max(max, v);
        }
      }
    }
    if (!Number.isFinite(min)) {
      min = 20;
      max = 30;
    }
    const floor = Math.floor(min) - 2;
    const top = Math.max(max, floor + 6, Math.min(thresholds[1]!, max + 2));
    return { sx: SX, thickness: 0.56, gap: 0.26, floor, sy: HEIGHT / (top - floor), base: 0.12, rows: profiles.length };
  }, [profiles, thresholds]);
}

function interpolate(profile: Float32Array, hour: number): number {
  const i = Math.min(23, Math.max(0, Math.floor(hour)));
  const a = profile[i]!;
  const b = profile[i + 1]!;
  if (!Number.isFinite(a)) return b;
  if (!Number.isFinite(b)) return a;
  return a + (b - a) * (hour - i);
}

interface SceneProps extends HeatscapeProps {
  palette: Palette;
  layout: SliceLayout;
  ticks: number[];
  nowPoint: THREE.Vector3 | null;
  labels: SceneLabel[];
  refs: LabelRefs;
}

function Scene(props: SceneProps) {
  const {
    profiles,
    thresholds,
    palette,
    selected,
    onSelect,
    nowOffset,
    reducedMotion,
    layout,
    ticks,
    nowPoint,
    labels,
    refs,
  } = props;
  const geometry = useMemo(() => buildSlices(profiles, layout), [profiles, layout]);
  const uniforms = useMemo(() => createLevelUniforms(palette), []); // eslint-disable-line react-hooks/exhaustive-deps
  const material = useMemo(() => createLevelMaterial(uniforms, 3), [uniforms]);
  const group = useRef<THREE.Group>(null);
  const invalidate = useThree((s) => s.invalidate);
  const intro = useRef(reducedMotion ? 1 : 0);

  const width = 24 * layout.sx;
  const depth = layout.rows * (layout.thickness + layout.gap);
  const top = layout.base + HEIGHT;

  // The model plus room for the day names on the left, the ruler on the
  // right and the hours along the front.
  const points = useMemo(() => {
    const out: THREE.Vector3[] = [];
    for (const x of [-width / 2 - 1.1, width / 2 + 1.1]) {
      for (const z of [-depth / 2, depth / 2 + 0.7]) {
        for (const y of [0, top]) out.push(new THREE.Vector3(x, y, z));
      }
    }
    return out;
  }, [width, depth, top]);
  const frame = useFraming(points, DIRECTION, 0.94);

  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);
  useEffect(() => invalidate(), [labels, invalidate]);

  useEffect(() => {
    applyPalette(uniforms, palette);
    invalidate();
  }, [palette, uniforms, invalidate]);

  useEffect(() => {
    uniforms.uThresholds.value.set(...(thresholds as [number, number, number, number]));
    const ys = thresholds.map((t) => (t > layout.floor ? heightOf(layout, t) : -9));
    uniforms.uThresholdY.value.set(ys[0]!, ys[1]!, ys[2]!, ys[3]!);
    uniforms.uNow.value.set(0, nowOffset ?? -1);
    if (selected) uniforms.uSelect.value.set(selected.hour, selected.day, 1, SELECT_HALF_WIDTH);
    else uniforms.uSelect.value.set(0, 0, 0, SELECT_HALF_WIDTH);
    invalidate();
  }, [thresholds, layout, nowOffset, selected, uniforms, invalidate]);

  // Slices rise from flat on first render.
  useFrame((_, delta) => {
    if (!group.current) return;
    if (intro.current < 1) {
      intro.current = Math.min(1, intro.current + delta / 0.9);
      const e = 1 - Math.pow(1 - intro.current, 3);
      group.current.scale.y = 0.02 + 0.98 * e;
      invalidate();
    } else if (group.current.scale.y !== 1) {
      group.current.scale.y = 1;
    }
  });

  const pick = (e: ThreeEvent<PointerEvent> | ThreeEvent<MouseEvent>) => {
    const hour = Math.round(e.point.x / layout.sx + 12);
    if (hour >= 0 && hour <= 24) onSelect(rowAt(layout, e.point.z), Math.min(23, hour));
  };

  // The "now" pin already marks the current hour, so a second pin there would only clutter it.
  const onNow = !!selected && selected.day === 0 && nowOffset !== null && Math.abs(selected.hour - nowOffset) < 1;
  const selectedPoint =
    selected && !onNow
      ? new THREE.Vector3(
          (selected.hour - 12) * layout.sx,
          heightOf(layout, profiles[selected.day]?.[selected.hour] ?? layout.floor),
          rowZ(layout, selected.day),
        )
      : null;

  return (
    <>
      <Controls target={frame.target} distance={frame.distance} />
      <StudioLights palette={palette} reach={9} side={-1} />
      <ProjectLabels labels={labels} refs={refs} />

      <group ref={group}>
        <mesh
          geometry={geometry}
          material={material}
          castShadow
          receiveShadow
          onPointerMove={(e) => {
            if (e.pointerType === 'mouse') pick(e);
          }}
          onClick={(e) => pick(e)}
        />
      </group>
      <Plinth width={width + 0.9} depth={depth + 0.7} palette={palette} />
      <Ruler
        x={width / 2 + 0.45}
        z={rowZ(layout, layout.rows - 1)}
        top={top}
        ticks={ticks.map((v) => heightOf(layout, v))}
        palette={palette}
      />

      {nowPoint && (
        <group position={nowPoint}>
          <mesh position={[0, 0.3, 0]}>
            <cylinderGeometry args={[0.014, 0.014, 0.6, 8]} />
            <meshBasicMaterial color={palette.ink} />
          </mesh>
          <mesh position={[0, 0.62, 0]}>
            <sphereGeometry args={[0.06, 16, 12]} />
            <meshBasicMaterial color={palette.ink} />
          </mesh>
        </group>
      )}

      {selectedPoint && (
        <group position={selectedPoint}>
          <mesh position={[0, 0.22, 0]}>
            <cylinderGeometry args={[0.01, 0.01, 0.44, 6]} />
            <meshBasicMaterial color={palette.ink} />
          </mesh>
          <mesh position={[0, 0.46, 0]}>
            <sphereGeometry args={[0.045, 14, 10]} />
            <meshBasicMaterial color={palette.ink} />
          </mesh>
        </group>
      )}
    </>
  );
}

export default function Heatscape3D(props: HeatscapeProps) {
  const { profiles, thresholds, dayLabels, nowOffset, nowLabel, formatTemp } = props;
  const [palette, setPalette] = useState(() => readPalette(props.dark));
  useEffect(() => {
    // Wait a frame so the new theme's CSS variables are applied before reading them.
    const id = requestAnimationFrame(() => setPalette(readPalette(props.dark)));
    return () => cancelAnimationFrame(id);
  }, [props.dark]);

  const layout = useLayout(profiles, thresholds);
  const refs = useRef(new Map<string, HTMLElement>());
  const ticks = useMemo(() => rulerTicks(layout.floor + 1, layout.floor + HEIGHT / layout.sy, 4), [layout]);
  const nowPoint = useMemo(
    () =>
      nowOffset !== null && profiles[0]
        ? new THREE.Vector3(
            (nowOffset - 12) * layout.sx,
            heightOf(layout, interpolate(profiles[0], nowOffset)),
            rowZ(layout, 0) + layout.thickness / 2 + 0.02,
          )
        : null,
    [nowOffset, profiles, layout],
  );

  const labels = useMemo(() => {
    const width = 24 * layout.sx;
    const depth = layout.rows * (layout.thickness + layout.gap);
    const out: SceneLabel[] = dayLabels.map((text, d) => ({
      id: `day${d}`,
      at: [-width / 2 - 0.3, 0.06, rowZ(layout, d)],
      text,
      kind: 'side',
    }));
    for (const h of [0, 6, 12, 18, 24]) {
      out.push({
        id: `hour${h}`,
        at: [(h - 12) * layout.sx, 0, depth / 2 + 0.42],
        text: String(h).padStart(2, '0'),
        kind: 'edge',
      });
    }
    for (const v of ticks) {
      out.push({
        id: `tick${v}`,
        at: [width / 2 + 0.45 + 0.16, heightOf(layout, v), rowZ(layout, layout.rows - 1)],
        text: formatTemp(v),
        kind: 'ruler',
      });
    }
    if (nowPoint) out.push({ id: 'now', at: [nowPoint.x, nowPoint.y + 0.72, nowPoint.z], text: nowLabel, kind: 'now' });
    return out;
  }, [layout, dayLabels, ticks, formatTemp, nowPoint, nowLabel]);

  return (
    <div className={styles.frame} role="img" aria-label={props.ariaLabel}>
      <Canvas
        frameloop="demand"
        shadows
        dpr={[1, 2]}
        camera={{ fov: 30, position: [6, 6, 10] }}
        gl={{ antialias: true, alpha: true, powerPreference: 'default' }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.NeutralToneMapping;
          gl.shadowMap.type = THREE.PCFSoftShadowMap;
        }}
      >
        <Scene
          {...props}
          palette={palette}
          layout={layout}
          ticks={ticks}
          nowPoint={nowPoint}
          labels={labels}
          refs={refs}
        />
      </Canvas>
      <LabelLayer labels={labels} refs={refs} />
    </div>
  );
}
