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
  connector: () => (
    <Icon>
      <path d="M4 11.5h4v-7h4" />
      <circle cx="2.75" cy="11.5" r="1.25" />
      <circle cx="13.25" cy="4.5" r="1.25" />
    </Icon>
  ),
  table: () => (
    <Icon>
      <rect x="2" y="2.5" width="12" height="11" rx="1.5" />
      <path d="M2 6h12M2 9.75h12M7 6v7.5" />
    </Icon>
  ),
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
  chevronDown: () => (
    <Icon>
      <path d="M4 6l4 4 4-4" />
    </Icon>
  ),
  importFile: () => (
    <Icon>
      <path d="M8 2v7.5M5 6.75l3 3 3-3M2.5 10.5v3h11v-3" />
    </Icon>
  ),
  exportFile: () => (
    <Icon>
      <path d="M8 9.5V2M5 4.75l3-3 3 3M2.5 10.5v3h11v-3" />
    </Icon>
  ),
  /** The app mark: two tables joined by a connector. */
  logo: () => (
    <Icon>
      <rect x="1.5" y="1.5" width="6" height="5" rx="1" />
      <rect x="8.5" y="9.5" width="6" height="5" rx="1" />
      <path d="M4.5 6.5v5.5h4" />
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
  check: () => (
    <Icon>
      <path d="M13 4.5L6.25 11.25 3 8" />
    </Icon>
  ),
  back: () => (
    <Icon>
      <path d="M10 3L5 8l5 5" />
    </Icon>
  ),
  expandAll: () => (
    <Icon>
      <path d="M5 10l3 3 3-3M5 6l3-3 3 3" />
    </Icon>
  ),
  collapseAll: () => (
    <Icon>
      <path d="M5 13l3-3 3 3M5 3l3 3 3-3" />
    </Icon>
  ),
  panelLeft: () => (
    <Icon>
      <rect x="2" y="2" width="12" height="12" rx="1.5" />
      <path d="M6 2v12" />
    </Icon>
  ),
  panelRight: () => (
    <Icon>
      <rect x="2" y="2" width="12" height="12" rx="1.5" />
      <path d="M10 2v12" />
    </Icon>
  ),
  alignLeft: () => (
    <Icon>
      <path d="M2.5 2v12" />
      <rect x="4.5" y="4" width="9" height="3" />
      <rect x="4.5" y="9" width="5.5" height="3" />
    </Icon>
  ),
  alignCenterX: () => (
    <Icon>
      <path d="M8 2v12" />
      <rect x="3" y="4" width="10" height="3" />
      <rect x="5" y="9" width="6" height="3" />
    </Icon>
  ),
  alignRight: () => (
    <Icon>
      <path d="M13.5 2v12" />
      <rect x="2.5" y="4" width="9" height="3" />
      <rect x="6" y="9" width="5.5" height="3" />
    </Icon>
  ),
  alignTop: () => (
    <Icon>
      <path d="M2 2.5h12" />
      <rect x="4" y="4.5" width="3" height="9" />
      <rect x="9" y="4.5" width="3" height="5.5" />
    </Icon>
  ),
  alignCenterY: () => (
    <Icon>
      <path d="M2 8h12" />
      <rect x="4" y="3" width="3" height="10" />
      <rect x="9" y="5" width="3" height="6" />
    </Icon>
  ),
  alignBottom: () => (
    <Icon>
      <path d="M2 13.5h12" />
      <rect x="4" y="2.5" width="3" height="9" />
      <rect x="9" y="6" width="3" height="5.5" />
    </Icon>
  ),
  distributeH: () => (
    <Icon>
      <path d="M2.5 2v12M13.5 2v12" />
      <rect x="6.5" y="4" width="3" height="8" />
    </Icon>
  ),
  distributeV: () => (
    <Icon>
      <path d="M2 2.5h12M2 13.5h12" />
      <rect x="4" y="6.5" width="8" height="3" />
    </Icon>
  ),
  bringToFront: () => (
    <Icon>
      <path d="M9.5 6.5v-4h-7v7h4" />
      <rect x="6.5" y="6.5" width="7" height="7" />
    </Icon>
  ),
  sendToBack: () => (
    <Icon>
      <path d="M6.5 9.5v4h7v-7h-4" />
      <rect x="2.5" y="2.5" width="7" height="7" />
    </Icon>
  ),
  duplicate: () => (
    <Icon>
      <rect x="5.5" y="5.5" width="8" height="8" rx="1" />
      <path d="M10.5 5.5v-2h-7v7h2" />
    </Icon>
  ),
  ungroup: () => (
    <Icon>
      <path d="M2.5 5.5v-3h3M10.5 2.5h3v3M13.5 10.5v3h-3M5.5 13.5h-3v-3" />
      <rect x="5.5" y="5.5" width="5" height="5" />
    </Icon>
  ),
  strokeWidth: () => (
    <Icon>
      <path d="M2.5 3.5h11" strokeWidth={0.75} />
      <path d="M2.5 7.5h11" strokeWidth={1.5} />
      <path d="M2.5 12h11" strokeWidth={2.5} />
    </Icon>
  ),
  opacity: () => (
    <Icon>
      <circle cx="8" cy="8" r="5.5" />
      <path d="M4.5 11.5l7-7M8 13.5l5-5M3 8l5-5" />
    </Icon>
  ),
} as const;

export type IconName = keyof typeof icons;
