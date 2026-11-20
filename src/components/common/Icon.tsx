import type { SVGProps } from 'react';

/** Small hand-drawn line icon set (1.5px strokes, 20px grid). */
const PATHS = {
  keyboard: 'M3 6h14a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Zm2 3h1m2 0h1m2 0h1m2 0h1M6 12h8',
  hand: 'M7 10V4.5a1.25 1.25 0 0 1 2.5 0V9m0-1V3.5a1.25 1.25 0 0 1 2.5 0V9m0-.5V4.75a1.25 1.25 0 0 1 2.5 0V11c0 3.5-2.2 6-5.5 6-2.4 0-3.7-1.2-4.9-3.1L2.7 11a1.2 1.2 0 0 1 2-1.3L7 12',
  phone: 'M7 2.5h6a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1Zm2 12.5h2',
  target: 'M10 2.5v3m0 9v3M2.5 10h3m9 0h3M10 7a3 3 0 1 1 0 6 3 3 0 0 1 0-6Z',
  gauge: 'M3.5 14a7 7 0 1 1 13 0M10 14l3.5-4.5',
  settings:
    'M10 7.25a2.75 2.75 0 1 1 0 5.5 2.75 2.75 0 0 1 0-5.5ZM10 2.5l1.3 1.9 2.3-.4.4 2.3 1.9 1.3-1 2.1 1 2.1-1.9 1.3-.4 2.3-2.3-.4L10 17.5l-1.3-1.9-2.3.4-.4-2.3-1.9-1.3 1-2.1-1-2.1 1.9-1.3.4-2.3 2.3.4L10 2.5Z',
  info: 'M10 2.75a7.25 7.25 0 1 1 0 14.5 7.25 7.25 0 0 1 0-14.5ZM10 9v5m0-7.5v.5',
  copy: 'M7 7h8.5a.5.5 0 0 1 .5.5V16a.5.5 0 0 1-.5.5H7a.5.5 0 0 1-.5-.5V7.5A.5.5 0 0 1 7 7Zm-2.5 6H4a.5.5 0 0 1-.5-.5V4a.5.5 0 0 1 .5-.5h8.5a.5.5 0 0 1 .5.5v.5',
  download: 'M10 3v9.5m0 0L6.5 9M10 12.5 13.5 9M4 15.5v1h12v-1',
  trash: 'M4 5.5h12M8 5.5V4h4v1.5m-6 0 .7 10.5h6.6l.7-10.5',
  undo: 'M6 6.5H12a4 4 0 0 1 0 8H8M6 6.5 8.5 4M6 6.5 8.5 9',
  redo: 'M14 6.5H8a4 4 0 0 0 0 8h4M14 6.5 11.5 4M14 6.5 11.5 9',
  selectAll: 'M3.5 6V3.5H6M14 3.5h2.5V6M16.5 14v2.5H14M6 16.5H3.5V14M7 7h6v6H7z',
  fullscreen: 'M3.5 7.5v-4h4m5 0h4v4m0 5v4h-4m-5 0h-4v-4',
  exitFullscreen: 'M7.5 3.5v4h-4m13 0h-4v-4m0 13v-4h4m-13 0h4v4',
  theme: 'M10 2.75a7.25 7.25 0 1 0 0 14.5V2.75Z M10 2.75a7.25 7.25 0 0 1 0 14.5',
  camera: 'M3 6.5h3l1.5-2h5L14 6.5h3a.5.5 0 0 1 .5.5v8.5a.5.5 0 0 1-.5.5H3a.5.5 0 0 1-.5-.5V7a.5.5 0 0 1 .5-.5ZM10 8.5a3 3 0 1 1 0 6 3 3 0 0 1 0-6Z',
  lock: 'M6 9V6.5a4 4 0 0 1 8 0V9M5 9h10v8H5z',
  check: 'M4.5 10.5 8 14l7.5-8',
  arrowRight: 'M4 10h12m0 0-4-4m4 4-4 4',
  shield: 'M10 2.5 16 5v4.5c0 4-2.6 6.8-6 8-3.4-1.2-6-4-6-8V5l6-2.5Z',
  close: 'M5 5l10 10M15 5 5 15',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 18, ...rest }: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
