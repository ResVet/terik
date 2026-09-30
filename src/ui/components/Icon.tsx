import type { SVGProps } from 'react';

/**
 * A small hand-drawn icon set on a 24 px grid, 1.6 px strokes, so the
 * interface does not lean on a generic icon pack.
 */
const paths = {
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m15.5 15.5 5 5" />
    </>
  ),
  locate: (
    <>
      <circle cx="12" cy="12" r="6.5" />
      <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
      <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7" />
    </>
  ),
  shade: (
    <>
      <path d="M3.5 11a8.5 8.5 0 0 1 17 0Z" />
      <path d="M12 11v8.2a1.8 1.8 0 0 1-3.6 0" />
    </>
  ),
  wind: (
    <>
      <path d="M3 8.5h10.5a2.7 2.7 0 1 0-2.6-3.4" />
      <path d="M3 12.5h15a2.8 2.8 0 1 1-2.7 3.6" />
      <path d="M3 16.5h7" />
    </>
  ),
  drop: <path d="M12 3.2c3.2 4 5.8 7.2 5.8 10.4a5.8 5.8 0 0 1-11.6 0C6.2 10.4 8.8 7.2 12 3.2Z" />,
  thermometer: (
    <>
      <path d="M14 13.6V5a2 2 0 1 0-4 0v8.6a4 4 0 1 0 4 0Z" />
      <path d="M12 9v7" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="11" r="6.8" fill="currentColor" stroke="none" />
      <circle cx="9.6" cy="8.6" r="1.6" fill="var(--surface, #fff)" stroke="none" opacity=".55" />
      <path d="M12 17.8V21M8.5 21h7" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 9.5h17M8 3v4M16 3v4M12 12.5v5M9.5 15h5" />
    </>
  ),
  chevronDown: <path d="m6 9.5 6 6 6-6" />,
  chevronRight: <path d="m9.5 6 6 6-6 6" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  sliders: (
    <>
      <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="9" cy="17" r="2" />
    </>
  ),
  forecast: (
    <>
      <path d="M3 18h18" />
      <path d="M6.5 18a5.5 5.5 0 0 1 11 0" />
      <path d="M12 5.5v2.3M4.3 9.3l1.6 1.6M19.7 9.3l-1.6 1.6" />
    </>
  ),
  climate: (
    <>
      <path d="M3 20.5h18" />
      <path d="m3.5 17 4.5-5.5 3.5 3 4-6.5 5 5" />
    </>
  ),
  method: (
    <>
      <path d="M9 3.5h6M10 3.5v5.2L4.8 18.3A1.5 1.5 0 0 0 6.1 20.5h11.8a1.5 1.5 0 0 0 1.3-2.2L14 8.7V3.5" />
      <path d="M7.5 14h9" />
    </>
  ),
  github: (
    <path
      d="M12 2.8a9.2 9.2 0 0 0-2.9 17.9c.5.1.6-.2.6-.4v-1.6c-2.6.6-3.1-1.1-3.1-1.1-.4-1.1-1-1.4-1-1.4-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .8 1.5 2.3 1 2.8.8.1-.6.3-1 .6-1.2-2-.2-4.2-1-4.2-4.5 0-1 .4-1.8 1-2.4-.1-.2-.4-1.2.1-2.5 0 0 .8-.2 2.5.9a8.6 8.6 0 0 1 4.6 0c1.7-1.1 2.5-.9 2.5-.9.5 1.3.2 2.3.1 2.5.6.6 1 1.5 1 2.4 0 3.5-2.2 4.3-4.2 4.5.3.3.6.8.6 1.6v2.4c0 .2.2.5.6.4A9.2 9.2 0 0 0 12 2.8Z"
      fill="currentColor"
      stroke="none"
    />
  ),
  external: (
    <>
      <path d="M13.5 4.5h6v6" />
      <path d="M19.5 4.5 11 13" />
      <path d="M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5.5" />
      <circle cx="12" cy="7.8" r=".9" fill="currentColor" stroke="none" />
    </>
  ),
  alert: (
    <>
      <path d="M10.4 4.3 2.9 17.5a1.8 1.8 0 0 0 1.6 2.7h15a1.8 1.8 0 0 0 1.6-2.7L13.6 4.3a1.8 1.8 0 0 0-3.2 0Z" />
      <path d="M12 9.5v4.5" />
      <circle cx="12" cy="17" r=".9" fill="currentColor" stroke="none" />
    </>
  ),
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  cube: (
    <>
      <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9Z" />
      <path d="m4 7.5 8 4.5 8-4.5M12 12v9" />
    </>
  ),
  grid: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.2" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.2" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.2" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.2" />
    </>
  ),
  refresh: (
    <>
      <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" />
      <path d="M19.5 4.5v4h-4" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  water: (
    <>
      <path d="M7 3.5h10l-1.2 16a1.5 1.5 0 0 1-1.5 1.4H9.7a1.5 1.5 0 0 1-1.5-1.4Z" />
      <path d="M7.6 10.5c1.5-.9 3-.9 4.4 0s2.9.9 4.4 0" />
    </>
  ),
  phone: (
    <path d="M6.6 3.5h2.3l1.4 4.1-2 1.4a11 11 0 0 0 6.7 6.7l1.4-2 4.1 1.4v2.3a2 2 0 0 1-2.2 2A15.9 15.9 0 0 1 4.6 5.7a2 2 0 0 1 2-2.2Z" />
  ),
  download: (
    <>
      <path d="M12 4v11M7.5 11 12 15.5 16.5 11" />
      <path d="M5 19.5h14" />
    </>
  ),
} as const;

export type IconName = keyof typeof paths;

interface Props extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName;
  size?: number;
  label?: string;
}

export function Icon({ name, size = 20, label, ...rest }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={label ? undefined : true}
      role={label ? 'img' : undefined}
      aria-label={label}
      focusable="false"
      {...rest}
    >
      {paths[name]}
    </svg>
  );
}
