import { useEffect, useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { useResolvedTheme } from '../../app/useDocument';
import { useWidth } from '../charts/useSize';
import styles from './CalendarGrid.module.css';

interface Props {
  /** Level of each cell, row-major; 0 where there is no data. */
  levels: Uint8Array;
  rows: number;
  cols: number;
  years: number[];
  monthLabels: string[];
  selected: { row: number; col: number } | null;
  onSelect: (row: number, col: number) => void;
  label: string;
  describedBy?: string;
}

const GUTTER = 40;
const FILLS = ['--clay', '--level-1', '--level-2', '--level-3', '--level-4', '--level-5'];

/**
 * The flat twin of the 3D model: the newest year on top, the calendar
 * across, each cell in its risk-level colour. Drawn on a canvas (thousands
 * of cells), with the pointer and arrow keys both moving the selection.
 * Rows in the data run oldest first; `line` flips them for display.
 */
export function CalendarGrid({
  levels,
  rows,
  cols,
  years,
  monthLabels,
  selected,
  onSelect,
  label,
  describedBy,
}: Props) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const canvas = useRef<HTMLCanvasElement>(null);
  const theme = useResolvedTheme();
  const plotWidth = Math.max(0, width - GUTTER);
  /** Display line of a data row (and back): newest year on top. */
  const line = (row: number) => rows - 1 - row;
  const rowHeight = width < 480 ? 4 : width < 800 ? 5 : 6;
  const height = rows * rowHeight;

  useEffect(() => {
    const draw = () => {
      const el = canvas.current;
      const ctx = el?.getContext('2d');
      if (!el || !ctx || plotWidth <= 0 || height <= 0) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      el.width = Math.round(plotWidth * dpr);
      el.height = Math.round(height * dpr);
      const style = getComputedStyle(el);
      const token = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
      const fills = FILLS.map((name) => token(name, '#999'));
      // Snap cell edges to whole device pixels so no hairline gaps show.
      const xs = Array.from({ length: cols + 1 }, (_, c) => Math.round((c / cols) * el.width));
      const ys = Array.from({ length: rows + 1 }, (_, r) => Math.round((r / rows) * el.height));
      ctx.clearRect(0, 0, el.width, el.height);
      const line = (row: number) => rows - 1 - row;
      for (let level = 0; level < fills.length; level++) {
        ctx.fillStyle = fills[level]!;
        ctx.beginPath();
        for (let r = 0; r < rows; r++) {
          const l = line(r);
          for (let c = 0; c < cols; c++) {
            if (levels[r * cols + c] === level) ctx.rect(xs[c]!, ys[l]!, xs[c + 1]! - xs[c]!, ys[l + 1]! - ys[l]!);
          }
        }
        ctx.fill();
      }
      if (selected && selected.row < rows && selected.col < cols) {
        const l = line(selected.row);
        const x0 = xs[selected.col]!;
        const y0 = ys[l]!;
        const w = xs[selected.col + 1]! - x0;
        const h = ys[l + 1]! - y0;
        const stroke = Math.max(1, Math.round(1.5 * dpr));
        ctx.lineWidth = stroke;
        ctx.strokeStyle = token('--surface', '#fff');
        ctx.strokeRect(x0 - stroke * 1.5, y0 - stroke * 1.5, w + stroke * 3, h + stroke * 3);
        ctx.strokeStyle = token('--ink', '#000');
        ctx.strokeRect(x0 - stroke * 0.5, y0 - stroke * 0.5, w + stroke, h + stroke);
      }
    };
    // Wait a frame: on a theme switch the colour tokens change after this effect runs.
    const id = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(id);
  }, [levels, rows, cols, plotWidth, height, theme, selected]);

  const cellAt = (e: PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const col = Math.floor(((e.clientX - rect.left) / rect.width) * cols);
    const row = line(Math.floor(((e.clientY - rect.top) / rect.height) * rows));
    if (row >= 0 && row < rows && col >= 0 && col < cols) onSelect(row, col);
  };

  const onKey = (e: KeyboardEvent<HTMLCanvasElement>) => {
    const from = selected ?? { row: rows - 1, col: 0 };
    let { row, col } = from;
    switch (e.key) {
      case 'ArrowLeft':
        col--;
        break;
      case 'ArrowRight':
        col++;
        break;
      case 'ArrowUp':
        row++;
        break;
      case 'ArrowDown':
        row--;
        break;
      case 'PageUp':
        row += 10;
        break;
      case 'PageDown':
        row -= 10;
        break;
      case 'Home':
        col = 0;
        break;
      case 'End':
        col = cols - 1;
        break;
      default:
        return;
    }
    e.preventDefault();
    onSelect(Math.max(0, Math.min(rows - 1, row)), Math.max(0, Math.min(cols - 1, col)));
  };

  const yearTicks = years
    .map((year, row) => ({ year, row }))
    .filter(({ year, row }) => year % 10 === 0 || row === 0 || row === rows - 1)
    // Drop a tick that would sit on top of the next one.
    .filter((tick, i, all) => i === all.length - 1 || (all[i + 1]!.row - tick.row) * rowHeight >= 14);

  return (
    <div ref={ref} className={styles.root}>
      <div className={styles.plot} style={{ height }}>
        <div className={styles.years} aria-hidden="true">
          {yearTicks.map(({ year, row }) => (
            <span key={year} style={{ top: (line(row) + 0.5) * rowHeight }}>
              {year}
            </span>
          ))}
        </div>
        <canvas
          ref={canvas}
          className={styles.canvas}
          style={{ width: plotWidth, height }}
          role="img"
          aria-label={label}
          aria-describedby={describedBy}
          tabIndex={0}
          onPointerDown={cellAt}
          onPointerMove={(e) => e.pointerType === 'mouse' && cellAt(e)}
          onKeyDown={onKey}
        />
      </div>
      <div className={styles.months} aria-hidden="true">
        {monthLabels.map((m, i) => (
          <span key={i} style={{ left: `${((i + 0.5) / 12) * 100}%` }}>
            {m}
          </span>
        ))}
      </div>
    </div>
  );
}
