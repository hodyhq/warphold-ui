/** The WarpHold mark from the Kinetic prototypes (Main.dc.html header). */
export function Mark({ size = 26 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--color-ember, #FF6A1A)"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M3 7h13" />
      <path d="M3 12h18" />
      <path d="M3 17h10" />
      <path d="M19 4l2 3-2 3" />
    </svg>
  );
}
