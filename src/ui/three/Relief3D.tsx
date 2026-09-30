import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { LabelLayer, ProjectLabels, type LabelRefs, type SceneLabel } from './labels';
import { columnMonth, MONTH_MIDDLES } from './reliefGeometry';
import {
  applyPalette,
  createLevelMaterial,
  createLevelUniforms,
  readPalette,
  rulerTicks,
  viewDirection,
  type Palette,
} from './shared';
import { buildSlices, heightOf, rowAt, rowZ, type SliceLayout } from './sliceGeometry';
import { Controls, Plinth, Ruler, StudioLights, useFraming } from './staging';
import styles from './Heatscape3D.module.css';

export interface ReliefProps {
  /** Row-major grid: rows are years (oldest first), columns are equal steps of the year. */
  grid: Float32Array;
  rows: number;
  cols: number;
  years: number[];
  monthLabels: string[];
  thresholds: readonly [number, number, number, number];
  selected: { row: number; col: number } | null;
  onHover: (row: number, col: number) => void;
  formatTemp: (celsius: number) => string;
  dark: boolean;
  reducedMotion: boolean;
  ariaLabel: string;
}

const WIDTH = 12;
const DEPTH = 8.2;
const HEIGHT = 2.4;
// From the front left, so the year names at the start of each slice face the viewer.
const DIRECTION = viewDirection(-22, 36);

function useLayout(grid: Float32Array, rows: number, cols: number): SliceLayout {
  return useMemo(() => {
    let min = Infinity;
    let max = -Infinity;
    for (const v of grid) {
      if (Number.isFinite(v)) {
        min = Math.min(min, v);
        max = Math.max(max, v);
      }
    }
    if (!Number.isFinite(min)) {
      min = 22;
      max = 30;
    }
    const floor = Math.floor(min) - 1;
    const pitch = DEPTH / Math.max(1, rows);
    return {
      sx: WIDTH / Math.max(1, cols - 1),
      thickness: pitch * 0.7,
      gap: pitch * 0.3,
      floor,
      sy: HEIGHT / Math.max(4, max - floor),
      base: 0.06,
      rows,
    };
  }, [grid, rows, cols]);
}

interface SceneProps extends ReliefProps {
  palette: Palette;
  layout: SliceLayout;
  ticks: number[];
  labels: SceneLabel[];
  refs: LabelRefs;
}

/**
 * Every year as a thin clay slice, oldest at the front, its walls painted in
 * level bands up to that year's daily peaks. A warming climate shows as
 * slices climbing, and turning redder, towards the back.
 */
function Scene(props: SceneProps) {
  const { grid, rows, cols, thresholds, palette, selected, onHover, reducedMotion, layout, ticks, labels, refs } =
    props;
  const invalidate = useThree((s) => s.invalidate);

  const profiles = useMemo(
    () => Array.from({ length: rows }, (_, r) => grid.subarray(r * cols, (r + 1) * cols)),
    [grid, rows, cols],
  );
  const geometry = useMemo(
    () => buildSlices(profiles, layout, { subdivisions: 3, column: (c) => columnMonth(c, cols), wallFace: 2 }),
    [profiles, layout, cols],
  );
  const uniforms = useMemo(() => createLevelUniforms(palette), []); // eslint-disable-line react-hooks/exhaustive-deps
  const material = useMemo(() => createLevelMaterial(uniforms, 1), [uniforms]);
  const group = useRef<THREE.Group>(null);
  const intro = useRef(reducedMotion ? 1 : 0);
  const depth = rows * (layout.thickness + layout.gap);
  const top = layout.base + HEIGHT;

  const points = useMemo(() => {
    const out: THREE.Vector3[] = [];
    for (const x of [-WIDTH / 2 - 1.3, WIDTH / 2 + 1.7]) {
      for (const z of [-depth / 2, depth / 2 + 0.6]) {
        for (const y of [0, top]) out.push(new THREE.Vector3(x, y, z));
      }
    }
    return out;
  }, [depth, top]);
  const frame = useFraming(points, DIRECTION, 0.96);

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
    uniforms.uNow.value.set(0, -1);
    // The selected cell is marked with a pin, not by tinting the surface.
    uniforms.uSelect.value.set(0, 0, 0, 1);
    invalidate();
  }, [thresholds, layout, uniforms, invalidate]);

  useFrame((_, delta) => {
    if (!group.current) return;
    if (intro.current < 1) {
      intro.current = Math.min(1, intro.current + delta / 1.1);
      const e = 1 - Math.pow(1 - intro.current, 3);
      group.current.scale.y = 0.02 + 0.98 * e;
      invalidate();
    } else if (group.current.scale.y !== 1) {
      group.current.scale.y = 1;
    }
  });

  const pick = (e: ThreeEvent<PointerEvent> | ThreeEvent<MouseEvent>) => {
    const col = Math.round(e.point.x / layout.sx + (cols - 1) / 2);
    if (col >= 0 && col < cols) onHover(rowAt(layout, e.point.z), col);
  };

  const pinValue = selected ? grid[selected.row * cols + selected.col]! : Number.NaN;
  const pin =
    selected && Number.isFinite(pinValue)
      ? new THREE.Vector3(
          (selected.col - (cols - 1) / 2) * layout.sx,
          heightOf(layout, pinValue),
          rowZ(layout, selected.row),
        )
      : null;

  return (
    <>
      <Controls target={frame.target} distance={frame.distance} />
      <StudioLights palette={palette} reach={10} side={-1} />
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
          onClick={pick}
        />
      </group>
      <Plinth width={WIDTH + 0.7} depth={depth + 0.6} palette={palette} />
      {pin && (
        <group position={pin}>
          <mesh position={[0, 0.2, 0]}>
            <cylinderGeometry args={[0.012, 0.012, 0.4, 6]} />
            <meshBasicMaterial color={palette.ink} />
          </mesh>
          <mesh position={[0, 0.42, 0]}>
            <sphereGeometry args={[0.055, 14, 10]} />
            <meshBasicMaterial color={palette.ink} />
          </mesh>
        </group>
      )}
      <Ruler
        x={WIDTH / 2 + 0.8}
        z={rowZ(layout, rows - 1)}
        top={top}
        ticks={ticks.map((v) => heightOf(layout, v))}
        palette={palette}
      />
    </>
  );
}

export default function Relief3D(props: ReliefProps) {
  const { grid, rows, cols, years, monthLabels, formatTemp } = props;
  const [palette, setPalette] = useState(() => readPalette(props.dark));
  useEffect(() => {
    const id = requestAnimationFrame(() => setPalette(readPalette(props.dark)));
    return () => cancelAnimationFrame(id);
  }, [props.dark]);

  const layout = useLayout(grid, rows, cols);
  const refs = useRef(new Map<string, HTMLElement>());
  const ticks = useMemo(() => rulerTicks(layout.floor + 0.5, layout.floor + HEIGHT / layout.sy, 4), [layout]);

  const labels = useMemo(() => {
    const depth = rows * (layout.thickness + layout.gap);
    const xOfDay = (day: number) => ((day - 2.5) / (365 / cols) - (cols - 1) / 2) * layout.sx;
    // Decades, plus the first and last year; a label too close to the next one is dropped.
    const years_ = years
      .map((year, r) => ({ year, r }))
      .filter(({ year, r }) => year % 10 === 0 || r === 0 || r === rows - 1)
      .filter((l, i, all) => i === all.length - 1 || all[i + 1]!.r - l.r >= 6);
    const out: SceneLabel[] = years_.map(({ year, r }) => ({
      id: `year${year}`,
      at: [-WIDTH / 2 - 0.25, 0.04, rowZ(layout, r)],
      text: String(year),
      kind: 'side',
    }));
    monthLabels.forEach((text, i) => {
      out.push({ id: `month${i}`, at: [xOfDay(MONTH_MIDDLES[i]!), 0, depth / 2 + 0.36], text, kind: 'edge' });
    });
    for (const v of ticks) {
      out.push({
        id: `tick${v}`,
        at: [WIDTH / 2 + 0.8 + 0.16, heightOf(layout, v), rowZ(layout, rows - 1)],
        text: formatTemp(v),
        kind: 'ruler',
      });
    }
    return out;
  }, [layout, rows, cols, years, monthLabels, ticks, formatTemp]);

  return (
    <div className={styles.frame} role="img" aria-label={props.ariaLabel}>
      <Canvas
        frameloop="demand"
        shadows
        dpr={[1, 2]}
        camera={{ fov: 30, position: [5, 7, 12] }}
        gl={{ antialias: true, alpha: true }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.NeutralToneMapping;
          gl.shadowMap.type = THREE.PCFSoftShadowMap;
        }}
      >
        <Scene {...props} palette={palette} layout={layout} ticks={ticks} labels={labels} refs={refs} />
      </Canvas>
      <LabelLayer labels={labels} refs={refs} />
    </div>
  );
}
