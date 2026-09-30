import { useId, type ReactNode } from 'react';
import styles from './Segmented.module.css';

interface Option<T extends string | number> {
  value: T;
  label: ReactNode;
  /** Accessible name when the label is only an icon. */
  title?: string;
}

interface Props<T extends string | number> {
  label: string;
  hideLabel?: boolean;
  value: T;
  options: readonly Option<T>[];
  onChange: (value: T) => void;
  size?: 's' | 'm';
  stretch?: boolean;
}

/** A radio group drawn as a segmented control; arrow keys move between options. */
export function Segmented<T extends string | number>({
  label,
  hideLabel = false,
  value,
  options,
  onChange,
  size = 'm',
  stretch = false,
}: Props<T>) {
  const name = useId();
  return (
    <fieldset className={`${styles.root} ${stretch ? styles.stretch : ''}`}>
      <legend className={hideLabel ? 'visually-hidden' : styles.legend}>{label}</legend>
      <div className={`${styles.track} ${size === 's' ? styles.small : ''}`}>
        {options.map((o) => (
          <label key={String(o.value)} className={styles.option} title={o.title}>
            <input
              type="radio"
              name={name}
              value={String(o.value)}
              checked={o.value === value}
              onChange={() => onChange(o.value)}
              aria-label={o.title}
            />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
