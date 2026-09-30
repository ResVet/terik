import { useId, type CSSProperties } from 'react';
import styles from './Slider.module.css';

interface Props {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  /** The value as shown, with units. */
  display: string;
  hint?: string | undefined;
}

/** A labelled range input with its value on the right; the filled part of the track follows the thumb. */
export function Slider({ label, value, min, max, step, onChange, display, hint }: Props) {
  const id = useId();
  const fill = `${((value - min) / (max - min)) * 100}%`;
  return (
    <div className={styles.slider}>
      <div className={styles.head}>
        <label htmlFor={id}>{label}</label>
        <output htmlFor={id} className={styles.value}>
          {display}
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuetext={display}
        style={{ '--fill': fill } as CSSProperties}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {hint && <p className={styles.hint}>{hint}</p>}
    </div>
  );
}
