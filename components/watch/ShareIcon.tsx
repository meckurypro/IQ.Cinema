// components/watch/ShareIcon.tsx

// Solid share arrow: a filled head on the right with a curved tail swooping
// in from the lower left. Drawn as one filled path (a thin same-colour stroke
// rounds the corners), so it takes its colour from `currentColor`.
export function ShareIcon({ size = 30, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth={0.9}
      strokeLinejoin="round"
      strokeLinecap="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M11.9 1.7 L22.4 12 L11.9 22.3 V17.3 C7.5 17.2 4 18.3 1.9 20.3 C1.4 20.4 1.2 19.9 1.3 19.4 C1.9 13.6 5.7 7.6 11.9 7.1 Z" />
    </svg>
  );
}
