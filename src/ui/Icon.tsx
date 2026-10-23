import type { ReactNode } from 'react';
import { cn } from './cn';

/** The design's symbol sheet (design/mockups/*.html, `<symbol id="i-…">`). */
export type IconName =
  | 'files'
  | 'search'
  | 'settings'
  | 'close'
  | 'chevron-right'
  | 'chevron-down'
  | 'folder'
  | 'file'
  | 'arrow-up'
  | 'arrow-down'
  | 'lock'
  | 'warning'
  | 'replace'
  | 'replace-all'
  | 'logo'
  | 'win-min'
  | 'win-max'
  | 'win-close';

const PATHS: Record<IconName, ReactNode> = {
  files: (
    <>
      <path d="M5 2.5h4.5l3 3V11H5z" />
      <path d="M9.5 2.5v3h3" />
      <path d="M3 5.5v8h7" />
    </>
  ),
  search: (
    <>
      <circle cx="7" cy="7" r="4.2" />
      <path d="M10.2 10.2L14 14" />
    </>
  ),
  settings: (
    <>
      <path d="M2 4.5h6M11.5 4.5H14M2 11.5h2.5M8 11.5h6" />
      <circle cx="9.8" cy="4.5" r="1.7" />
      <circle cx="6.2" cy="11.5" r="1.7" />
    </>
  ),
  close: <path d="M4 4l8 8M12 4l-8 8" />,
  'chevron-right': <path d="M6 3.5L10.5 8 6 12.5" />,
  'chevron-down': <path d="M3.5 6L8 10.5 12.5 6" />,
  folder: <path d="M2 4.5a1 1 0 011-1h3l1.5 1.5H13a1 1 0 011 1V12a1 1 0 01-1 1H3a1 1 0 01-1-1z" />,
  file: (
    <>
      <path d="M4 2h5l3 3v9H4z" />
      <path d="M9 2v3h3" />
    </>
  ),
  'arrow-up': <path d="M8 13V3M4 7l4-4 4 4" />,
  'arrow-down': <path d="M8 3v10M4 9l4 4 4-4" />,
  lock: (
    <>
      <rect x="3.5" y="7" width="9" height="6.5" rx="1.2" />
      <path d="M5.5 7V5a2.5 2.5 0 015 0v2" />
    </>
  ),
  warning: (
    <>
      <path d="M8 2.5l6 10.5H2z" />
      <path d="M8 6.5v3M8 11.2v.1" />
    </>
  ),
  replace: <path d="M3 5h8.5L9.5 3M13 11H4.5l2 2" />,
  'replace-all': <path d="M2.5 4h9L9.5 2M13.5 9h-9l2 2M2.5 13h11" />,
  logo: <path d="M6 3.5L2 8l4 4.5M10 3.5L14 8l-4 4.5" />,
  'win-min': <path d="M2 6h8" />,
  'win-max': <rect x="2" y="2" width="8" height="8" />,
  'win-close': <path d="M2 2l8 8M10 2L2 10" />,
};

/** The window-control glyphs are drawn on a 12-unit grid, the rest on 16. */
const VIEWBOX: Partial<Record<IconName, string>> = {
  'win-min': '0 0 12 12',
  'win-max': '0 0 12 12',
  'win-close': '0 0 12 12',
};

export const ICON_NAMES = Object.keys(PATHS) as IconName[];

/** A decorative line icon from the design's symbol sheet. */
export function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg className={cn('icon', className)} viewBox={VIEWBOX[name] ?? '0 0 16 16'} aria-hidden="true" focusable="false">
      {PATHS[name]}
    </svg>
  );
}
