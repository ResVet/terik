/**
 * The mark is a black globe thermometer seen from the side: the dark sphere
 * that gives WBGT its "G", with a sun-lit highlight. The wordmark is set in
 * the UI face at its heaviest weight.
 */
export function LogoMark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <circle cx="16" cy="16" r="15" fill="var(--sun)" />
      <circle cx="16" cy="16" r="9.5" fill="var(--ink)" />
      <ellipse
        cx="12.6"
        cy="12.4"
        rx="3.2"
        ry="2.3"
        fill="var(--page)"
        opacity="0.5"
        transform="rotate(-32 12.6 12.4)"
      />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span
      style={{
        fontWeight: 800,
        fontSize: 21,
        letterSpacing: '-0.035em',
        lineHeight: 1,
      }}
    >
      terik
    </span>
  );
}
