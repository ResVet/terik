import { OrbitControls } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo } from 'react';
import type * as THREE from 'three';
import { frameScene, type Palette } from './shared';

/**
 * Camera placement shared by the 3D views: look from a fixed direction and
 * back off just far enough that `points` (the model plus label anchors) fit.
 * Both arguments must be memoised by the caller.
 */
export function useFraming(points: THREE.Vector3[], direction: THREE.Vector3, margin = 0.9) {
  const fov = useThree((s) => (s.camera as THREE.PerspectiveCamera).fov);
  const width = useThree((s) => s.size.width);
  const height = useThree((s) => s.size.height);
  const get = useThree((s) => s.get);
  const frame = useMemo(
    () => frameScene(fov, width / Math.max(1, height), direction, points, margin),
    [fov, width, height, direction, points, margin],
  );
  useLayoutEffect(() => {
    // The camera is three.js state outside React, so it is fetched and moved here.
    const { camera, invalidate } = get();
    const perspective = camera as THREE.PerspectiveCamera;
    perspective.position.copy(frame.position);
    perspective.near = Math.max(0.05, frame.distance / 60);
    perspective.far = frame.distance * 6;
    perspective.lookAt(frame.target);
    perspective.updateProjectionMatrix();
    invalidate();
  }, [get, frame]);
  return frame;
}

/** Orbit on horizontal drags; vertical swipes still scroll the page on touch screens. */
export function Controls({ target, distance }: { target: THREE.Vector3; distance: number }) {
  const get = useThree((s) => s.get);
  // OrbitControls sets touch-action: none when it connects; put pan-y back
  // after every render so the page still scrolls under a finger.
  useEffect(() => {
    get().gl.domElement.style.touchAction = 'pan-y';
  });
  return (
    <OrbitControls
      target={target}
      enablePan={false}
      enableDamping
      dampingFactor={0.12}
      rotateSpeed={0.6}
      minPolarAngle={0.3}
      maxPolarAngle={1.32}
      minAzimuthAngle={-1.2}
      maxAzimuthAngle={1.2}
      minDistance={distance * 0.5}
      maxDistance={distance * 1.8}
      zoomSpeed={0.6}
      makeDefault
    />
  );
}

/**
 * Soft studio light for the clay: sky fill, a key light with shadows from the
 * camera's side (`side` -1 for left, 1 for right) and a faint rim opposite.
 */
export function StudioLights({ palette, reach, side = 1 }: { palette: Palette; reach: number; side?: -1 | 1 }) {
  return (
    <>
      <hemisphereLight args={[palette.surface, palette.clayDeep, palette.dark ? 0.55 : 0.9]} />
      <ambientLight intensity={palette.dark ? 0.35 : 0.45} />
      <directionalLight
        position={[side * reach * 0.45, reach * 0.95, reach * 0.6]}
        intensity={palette.dark ? 1.9 : 2.3}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
        shadow-camera-left={-reach}
        shadow-camera-right={reach}
        shadow-camera-top={reach}
        shadow-camera-bottom={-reach}
        shadow-camera-far={reach * 4}
      />
      <directionalLight
        position={[-side * reach * 0.6, reach * 0.4, -reach * 0.3]}
        intensity={palette.dark ? 0.3 : 0.45}
      />
    </>
  );
}

/** The slab the model stands on, and a floor that only catches its shadow. */
export function Plinth({ width, depth, palette }: { width: number; depth: number; palette: Palette }) {
  return (
    <>
      <mesh position={[0, -0.06, 0]} receiveShadow>
        <boxGeometry args={[width, 0.12, depth]} />
        <meshStandardMaterial color={palette.clayDeep} roughness={0.9} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.121, 0]} receiveShadow>
        <planeGeometry args={[80, 80]} />
        <shadowMaterial opacity={palette.dark ? 0.35 : 0.12} />
      </mesh>
    </>
  );
}

/** A thin upright scale with tick marks (their labels live in the label layer), so height reads as WBGT. */
export function Ruler({
  x,
  z,
  top,
  ticks,
  palette,
}: {
  x: number;
  z: number;
  top: number;
  ticks: number[];
  palette: Palette;
}) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, top / 2, 0]}>
        <boxGeometry args={[0.014, top, 0.014]} />
        <meshBasicMaterial color={palette.ink} transparent opacity={0.45} />
      </mesh>
      {ticks.map((y) => (
        <mesh key={y} position={[0.07, y, 0]}>
          <boxGeometry args={[0.14, 0.014, 0.014]} />
          <meshBasicMaterial color={palette.ink} transparent opacity={0.45} />
        </mesh>
      ))}
    </group>
  );
}
