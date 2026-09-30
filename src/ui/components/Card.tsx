import type { ReactNode } from 'react';
import styles from './Card.module.css';

interface Props {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  id?: string;
  className?: string;
  flush?: boolean;
  as?: 'section' | 'div' | 'article';
}

export function Card({ title, subtitle, actions, children, id, className, flush = false, as: Tag = 'section' }: Props) {
  const headingId = id ? `${id}-title` : undefined;
  return (
    <Tag className={`${styles.card} ${className ?? ''}`} id={id} aria-labelledby={title ? headingId : undefined}>
      {(title || actions) && (
        <header className={styles.head}>
          <div className={styles.titles}>
            {title && (
              <h2 className={styles.title} id={headingId}>
                {title}
              </h2>
            )}
            {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
          </div>
          {actions && <div className={styles.actions}>{actions}</div>}
        </header>
      )}
      <div className={flush ? styles.flush : styles.body}>{children}</div>
    </Tag>
  );
}
