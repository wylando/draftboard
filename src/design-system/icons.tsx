import type { SVGProps } from 'react';

/** Inline 16px stroke icons, so the app has no icon-font or network dependency. */
function Icon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.25}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    />
  );
}

export const icons = {
  select: () => (
    <Icon>
      <path d="M3.5 2.5l9 4.2-3.9 1.1-1.6 3.7z" />
    </Icon>
  ),
  frame: () => (
    <Icon>
      <path d="M5 1.5v13M11 1.5v13M1.5 5h13M1.5 11h13" />
    </Icon>
  ),
  group: () => (
    <Icon>
      <rect x="2.5" y="2.5" width="11" height="11" rx="0.5" strokeDasharray="2 2" />
    </Icon>
  ),
  chevronRight: () => (
    <Icon>
      <path d="M6 4l4 4-4 4" />
    </Icon>
  ),
  rect: () => (
    <Icon>
      <rect x="2.5" y="2.5" width="11" height="11" rx="0.5" />
    </Icon>
  ),
  ellipse: () => (
    <Icon>
      <circle cx="8" cy="8" r="5.5" />
    </Icon>
  ),
  line: () => (
    <Icon>
      <path d="M2.5 13.5l11-11" />
    </Icon>
  ),
  // arrow, polygon, star, pencil, image: lucide (via better-icons), 24px geometry scaled to 16px.
  arrow: () => (
    <Icon>
      <g transform="scale(0.6667)" strokeWidth="1.875">
        <path d="M13 5h6v6m0-6L5 19" />
      </g>
    </Icon>
  ),
  polygon: () => (
    <Icon>
      <g transform="scale(0.6667)" strokeWidth="1.875">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16" />
      </g>
    </Icon>
  ),
  star: () => (
    <Icon>
      <g transform="scale(0.6667)" strokeWidth="1.875">
        <path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.12 2.12 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.12 2.12 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.12 2.12 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.12 2.12 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.12 2.12 0 0 0 1.597-1.16z" />
      </g>
    </Icon>
  ),
  pencil: () => (
    <Icon>
      <g transform="scale(0.6667)" strokeWidth="1.875">
        <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497zM15 5l4 4" />
      </g>
    </Icon>
  ),
  image: () => (
    <Icon>
      <g transform="scale(0.6667)" strokeWidth="1.875">
        <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
        <circle cx="9" cy="9" r="2" />
        <path d="m21 15l-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
      </g>
    </Icon>
  ),
  text: () => (
    <Icon>
      <path d="M3 3.5h10M8 3.5v10M6 13.5h4" />
    </Icon>
  ),
  hand: () => (
    <Icon>
      <path d="M5 8.5V4a1 1 0 012 0v3.5M7 7V3a1 1 0 012 0v4M9 7V4a1 1 0 012 0v4.5M11 6.5a1 1 0 012 0V10a4.5 4.5 0 01-4.5 4.5h-1A4 4 0 014.7 12L3 9.2a1 1 0 011.7-1l.3.3" />
    </Icon>
  ),
  undo: () => (
    <Icon>
      <path d="M5 4L2.5 6.5 5 9M2.5 6.5H10a3.5 3.5 0 010 7H7" />
    </Icon>
  ),
  redo: () => (
    <Icon>
      <path d="M11 4l2.5 2.5L11 9M13.5 6.5H6a3.5 3.5 0 000 7h3" />
    </Icon>
  ),
  eye: () => (
    <Icon>
      <path d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8s-2.4 4.5-6.5 4.5S1.5 8 1.5 8z" />
      <circle cx="8" cy="8" r="2" />
    </Icon>
  ),
  eyeOff: () => (
    <Icon>
      <path d="M2.5 2.5l11 11M6.6 3.7A6.5 6.5 0 018 3.5C12.1 3.5 14.5 8 14.5 8a12 12 0 01-1.8 2.4M10.6 11.9A6 6 0 018 12.5C3.9 12.5 1.5 8 1.5 8a11.7 11.7 0 012.6-3.1" />
    </Icon>
  ),
  trash: () => (
    <Icon>
      <path d="M2.5 4h11M6 4V2.5h4V4M4 4l.7 9.5h6.6L12 4" />
    </Icon>
  ),
  plus: () => (
    <Icon>
      <path d="M8 3v10M3 8h10" />
    </Icon>
  ),
  minus: () => (
    <Icon>
      <path d="M3 8h10" />
    </Icon>
  ),
  settings: () => (
    <Icon>
      <path d="M12.59 6.27L14.31 6.45L14.31 9.55L12.59 9.73L12.46 10.02L13.56 11.37L11.37 13.56L10.02 12.46L9.73 12.59L9.55 14.31L6.45 14.31L6.27 12.59L5.98 12.46L4.63 13.56L2.44 11.37L3.54 10.02L3.41 9.73L1.69 9.55L1.69 6.45L3.41 6.27L3.54 5.98L2.44 4.63L4.63 2.44L5.98 3.54L6.27 3.41L6.45 1.69L9.55 1.69L9.73 3.41L10.02 3.54L11.37 2.44L13.56 4.63L12.46 5.98Z" />
      <circle cx="8" cy="8" r="2" />
    </Icon>
  ),
  search: () => (
    <Icon>
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.5 10.5l3 3" />
    </Icon>
  ),
  close: () => (
    <Icon>
      <path d="M4 4l8 8M12 4l-8 8" />
    </Icon>
  ),
  back: () => (
    <Icon>
      <path d="M10 3L5 8l5 5" />
    </Icon>
  ),
} as const;

export type IconName = keyof typeof icons;
