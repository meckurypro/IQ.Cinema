import type { SVGProps } from "react";

/**
 * Nav icons — bold outline by default, solid/filled when `filled` is true
 * (used for the active tab), matching the reference app's chunkier style.
 * strokeWidth is deliberately heavy (2.3) even in outline mode so inactive
 * tabs don't read as thin/faint next to the filled active one.
 */

type IconProps = SVGProps<SVGSVGElement> & { filled?: boolean };

export function HomeIcon({ filled, ...props }: IconProps) {
  if (filled) {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" {...props}>
        <path
          d="M3.4 10.85L11.15 4.55C11.65 4.14 12.35 4.14 12.85 4.55L20.6 10.85C20.98 11.16 21 11.72 20.65 12.06C20.49 12.21 20.28 12.3 20.06 12.3H19.25V18.25C19.25 19.35 18.35 20.25 17.25 20.25H6.75C5.65 20.25 4.75 19.35 4.75 18.25V12.3H3.94C3.46 12.3 3.07 11.91 3.07 11.43C3.07 11.18 3.18 10.94 3.4 10.85Z"
          fill="currentColor"
        />
        <path
          d="M9.5 20V15.5C9.5 14.95 9.95 14.5 10.5 14.5H13.5C14.05 14.5 14.5 14.95 14.5 15.5V20"
          fill="rgb(var(--bg))"
        />
      </svg>
    );
  }
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" {...props}>
      <path
        d="M3.75 10.55L11.02 4.42C11.58 3.95 12.42 3.95 12.98 4.42L20.25 10.55"
        stroke="currentColor"
        strokeWidth="2.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5.25 9.65V18.35C5.25 19.18 5.92 19.85 6.75 19.85H17.25C18.08 19.85 18.75 19.18 18.75 18.35V9.65"
        stroke="currentColor"
        strokeWidth="2.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9.15 19.75V15.45C9.15 14.98 9.53 14.6 10 14.6H14C14.47 14.6 14.85 14.98 14.85 15.45V19.75"
        stroke="currentColor"
        strokeWidth="2.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ForYouIcon({ filled, ...props }: IconProps) {
  if (filled) {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" {...props}>
        <rect x="3.5" y="5.5" width="14" height="15" rx="3" fill="currentColor" opacity="0.35" />
        <rect x="6.5" y="3.5" width="14" height="15" rx="3" fill="currentColor" />
        <path
          d="M13.5 7.4L14.25 9.4L16.25 10.15L14.25 10.9L13.5 12.9L12.75 10.9L10.75 10.15L12.75 9.4L13.5 7.4Z"
          fill="rgb(var(--bg))"
        />
      </svg>
    );
  }
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" {...props}>
      <rect x="4.25" y="3.75" width="15.5" height="16.5" rx="3.25" stroke="currentColor" strokeWidth="2.2" />
      <path
        d="M12 7.15L12.62 8.88L14.35 9.5L12.62 10.12L12 11.85L11.38 10.12L9.65 9.5L11.38 8.88L12 7.15Z"
        fill="currentColor"
      />
      <path d="M7.5 14.25H16.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M7.5 17.25H13.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function MyListIcon({ filled, ...props }: IconProps) {
  if (filled) {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" {...props}>
        <path
          d="M6 4.25C6 3.56 6.56 3 7.25 3H16.75C17.44 3 18 3.56 18 4.25V20.25C18 20.77 17.39 21.05 17 20.7L12.34 16.63C12.14 16.46 11.86 16.46 11.66 16.63L7 20.7C6.61 21.05 6 20.77 6 20.25V4.25Z"
          fill="currentColor"
        />
      </svg>
    );
  }
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" {...props}>
      <path
        d="M6 4.25C6 3.56 6.56 3 7.25 3H16.75C17.44 3 18 3.56 18 4.25V20.25C18 20.77 17.39 21.05 17 20.7L12.34 16.63C12.14 16.46 11.86 16.46 11.66 16.63L7 20.7C6.61 21.05 6 20.77 6 20.25V4.25Z"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Rewards keeps its gold coin-stack look regardless of active state — it's
 * a brand/currency cue, not a nav-state cue, matching the reference app
 * (their coin icon stays gold on every tab, active or not).
 */
export function RewardsIcon({ filled, ...props }: IconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" {...props}>
      <ellipse cx="9.25" cy="15.5" rx="5.25" ry="4.25" fill="currentColor" />
      <ellipse cx="14.75" cy="10.25" rx="5.75" ry="4.75" fill="currentColor" opacity="0.55" />
      <ellipse cx="14.75" cy="9.25" rx="5.75" ry="4.75" fill="currentColor" />
      <path
        d="M12.7 9.25C12.7 8.53 13.62 7.95 14.75 7.95C15.88 7.95 16.8 8.53 16.8 9.25C16.8 9.97 15.88 10.55 14.75 10.55C13.62 10.55 12.7 9.97 12.7 9.25Z"
        fill="rgb(var(--bg))"
      />
    </svg>
  );
}

export function ProfileIcon({ filled, ...props }: IconProps) {
  if (filled) {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" {...props}>
        <circle cx="12" cy="8.15" r="4.15" fill="currentColor" />
        <path
          d="M4.25 20.25C5.15 16.05 8.1 13.75 12 13.75C15.9 13.75 18.85 16.05 19.75 20.25C19.85 20.7 19.5 21 19.1 21H4.9C4.5 21 4.15 20.7 4.25 20.25Z"
          fill="currentColor"
        />
      </svg>
    );
  }
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" {...props}>
      <path
        d="M5.25 19.25C6.38 15.98 8.65 14.25 12 14.25C15.35 14.25 17.62 15.98 18.75 19.25"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M12 11.9C14.07 11.9 15.75 10.22 15.75 8.15C15.75 6.08 14.07 4.4 12 4.4C9.93 4.4 8.25 6.08 8.25 8.15C8.25 10.22 9.93 11.9 12 11.9Z"
        stroke="currentColor"
        strokeWidth="2.2"
      />
    </svg>
  );
}

