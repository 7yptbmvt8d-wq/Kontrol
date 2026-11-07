/** Logo K-coche aux couleurs du thème courant. */
export function Logo({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 180 180" aria-hidden>
      <rect width="180" height="180" rx="44" fill="var(--surface2)" />
      <path d="M58 40V140" stroke="var(--ink)" strokeWidth="22" strokeLinecap="round" fill="none" />
      <path d="M66 96L122 40" stroke="var(--ink)" strokeWidth="22" strokeLinecap="round" fill="none" />
      <path d="M84 96L106 126L146 70" stroke="var(--accent)" strokeWidth="22" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}
