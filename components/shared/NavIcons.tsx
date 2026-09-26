// components/shared/NavIcons.tsx

import type { SVGProps } from "react";

/**
 * Nav icons, inlined from /public/*.svg so their strokes can pick up
 * `currentColor` and change with the active/inactive nav state.
 * Keep in sync with the source files in /public if those are edited.
 */

export function HomeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" {...props}>
      <path
        d="M3.75 10.55L11.02 4.42C11.58 3.95 12.42 3.95 12.98 4.42L20.25 10.55"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5.25 9.65V18.35C5.25 19.18 5.92 19.85 6.75 19.85H17.25C18.08 19.85 18.75 19.18 18.75 18.35V9.65"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9.15 19.75V15.45C9.15 14.98 9.53 14.6 10 14.6H14C14.47 14.6 14.85 14.98 14.85 15.45V19.75"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M8.05 8.85H8.06" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function ForYouIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" {...props}>
      <rect x="4.25" y="3.75" width="15.5" height="16.5" rx="3.25" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M12 7.15L12.62 8.88L14.35 9.5L12.62 10.12L12 11.85L11.38 10.12L9.65 9.5L11.38 8.88L12 7.15Z"
        fill="currentColor"
      />
      <path d="M7.5 14.25H16.5" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" />
      <path d="M7.5 17.25H13.5" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" />
    </svg>
  );
}

export function MyListIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" {...props}>
      <path
        d="M4.25 7.25C4.25 6.42 4.92 5.75 5.75 5.75H9.35L10.85 7.35H18.25C19.08 7.35 19.75 8.02 19.75 8.85V17.75C19.75 18.58 19.08 19.25 18.25 19.25H5.75C4.92 19.25 4.25 18.58 4.25 17.75V7.25Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path d="M8 11.35H16" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" />
      <path d="M8 14.65H13.5" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" />
      <path
        d="M16.15 14.55L16.85 15.25L18.05 13.95"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function RewardsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" {...props}>
      <path
        d="M4.25 9.1H19.75V18.05C19.75 19.01 18.97 19.75 18.05 19.75H5.95C5.03 19.75 4.25 19.01 4.25 18.05V9.1Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path
        d="M3.75 7.1C3.75 6.55 4.2 6.1 4.75 6.1H19.25C19.8 6.1 20.25 6.55 20.25 7.1V9.1H3.75V7.1Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path d="M12 6.1V19.75" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" />
      <path
        d="M12 6.1C10.95 4.25 9.72 3.45 8.65 3.55C7.72 3.64 7.28 4.4 7.68 5.13C8.18 6.05 9.65 6.1 12 6.1Z"
        stroke="currentColor"
        strokeWidth="1.45"
        strokeLinejoin="round"
      />
      <path
        d="M12 6.1C13.05 4.25 14.28 3.45 15.35 3.55C16.28 3.64 16.72 4.4 16.32 5.13C15.82 6.05 14.35 6.1 12 6.1Z"
        stroke="currentColor"
        strokeWidth="1.45"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ProfileIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" {...props}>
      <path
        d="M5.25 19.25C6.38 15.98 8.65 14.25 12 14.25C15.35 14.25 17.62 15.98 18.75 19.25"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        d="M12 11.9C14.07 11.9 15.75 10.22 15.75 8.15C15.75 6.08 14.07 4.4 12 4.4C9.93 4.4 8.25 6.08 8.25 8.15C8.25 10.22 9.93 11.9 12 11.9Z"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <path
        d="M4.25 7.25V5.75C4.25 4.92 4.92 4.25 5.75 4.25H7.25"
        stroke="currentColor"
        strokeWidth="1.55"
        strokeLinecap="round"
      />
      <path
        d="M19.75 16.75V18.25C19.75 19.08 19.08 19.75 18.25 19.75H16.75"
        stroke="currentColor"
        strokeWidth="1.55"
        strokeLinecap="round"
      />
    </svg>
  );
}
