import { useFrame } from '@react-three/fiber';
import { useMemo, type RefObject } from 'react';
import * as THREE from 'three';
import styles from './Heatscape3D.module.css';

/**
 * Text labels for the 3D views. They are ordinary HTML in one layer over the
 * canvas; <ProjectLabels> (inside the canvas) moves each to its anchor's
 * screen position whenever a frame is drawn. One layer and plain DOM writes
 * keep this cheap, and the text stays crisp and selectable by nothing.
 */

export type LabelKind = 'side' | 'edge' | 'ruler' | 'now';

export interface SceneLabel {
  id: string;
  /** Anchor in world coordinates. */
  at: readonly [number, number, number];
  text: string;
  kind: LabelKind;
}

export type LabelRefs = RefObject<Map<string, HTMLElement>>;

const KIND_CLASS: Record<LabelKind, string | undefined> = {
  side: styles.sideLabel,
  edge: styles.edgeLabel,
  ruler: styles.rulerLabel,
  now: styles.nowLabel,
};

/** The HTML half: absolutely placed anchors, moved by ProjectLabels. */
export function LabelLayer({ labels, refs }: { labels: SceneLabel[]; refs: LabelRefs }) {
  return (
    <div className={styles.labels} aria-hidden="true">
      {labels.map((label) => (
        <span
          key={label.id}
          className={styles.anchor}
          ref={(el) => {
            if (el) refs.current.set(label.id, el);
            else refs.current.delete(label.id);
          }}
        >
          <span className={KIND_CLASS[label.kind]}>{label.text}</span>
        </span>
      ))}
    </div>
  );
}

/** The canvas half: projects every anchor through the camera after controls have moved it. */
export function ProjectLabels({ labels, refs }: { labels: SceneLabel[]; refs: LabelRefs }) {
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera, size }) => {
    for (const label of labels) {
      const el = refs.current.get(label.id);
      if (!el) continue;
      v.set(label.at[0], label.at[1], label.at[2]).project(camera);
      const x = ((v.x + 1) / 2) * size.width;
      const y = ((1 - v.y) / 2) * size.height;
      el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
      el.style.visibility = v.z > 1 ? 'hidden' : 'visible';
    }
  });
  return null;
}
