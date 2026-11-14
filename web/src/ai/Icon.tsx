// Small inline SVG icon set for the AI components (no emoji as icons, no icon library). 24x24 grid, 1.7 stroke, currentColor,
// so an icon takes the color of its text. Icons next to text are decorative (aria-hidden); icon-only buttons keep their aria-label.

import type { SVGProps } from 'react'

const PATHS = {
  bell: 'M6 9a6 6 0 1 1 12 0c0 5 2 6 2 7H4c0-1 2-2 2-7ZM10 20a2 2 0 0 0 4 0',
  volume: 'M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4ZM15.5 9a4.5 4.5 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11',
  mute: 'M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4ZM16 9.5l5 5M21 9.5l-5 5',
  gear: 'M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4ZM19.4 13.5l1.5 1.2-1.6 2.8-1.8-.6a7 7 0 0 1-1.6.9l-.3 1.9h-3.2l-.3-1.9a7 7 0 0 1-1.6-.9l-1.8.6-1.6-2.8 1.5-1.2a7 7 0 0 1 0-1.8L5.1 10.5l1.6-2.8 1.8.6a7 7 0 0 1 1.6-.9l.3-1.9h3.2l.3 1.9a7 7 0 0 1 1.6.9l1.8-.6 1.6 2.8-1.5 1.2a7 7 0 0 1 0 1.8Z',
  sparkle: 'M12 3.5l1.7 5.1 5.1 1.7-5.1 1.7L12 17.1l-1.7-5.1L5.2 10.3l5.1-1.7L12 3.5ZM18.5 15.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7.7-2Z',
  phone: 'M8 3.5h8a1.5 1.5 0 0 1 1.5 1.5v14a1.5 1.5 0 0 1-1.5 1.5H8A1.5 1.5 0 0 1 6.5 19V5A1.5 1.5 0 0 1 8 3.5ZM10.5 18h3',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  checkCircle: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM8 12.3l2.7 2.7L16 9.5',
  inbox: 'M4 13l2.4-6.2A1.5 1.5 0 0 1 7.8 6h8.4a1.5 1.5 0 0 1 1.4.8L20 13v4.5A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5V13Zm0 0h4.5l1 2h5l1-2H20',
  dot: 'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z',
  play: 'M8 5.5v13l10-6.5-10-6.5Z',
  stop: 'M7 7h10v10H7V7Z',
  refresh: 'M20 12a8 8 0 1 1-2.4-5.7M20 4v4.5h-4.5',
  alert: 'M12 4l9 15.5H3L12 4ZM12 10v4.5M12 17.2v.1',
  siren: 'M7 18v-5a5 5 0 0 1 10 0v5M5 18h14M12 4v2.5M4.5 7.5l1.7 1.5M19.5 7.5L17.8 9',
} as const

export type IconName = keyof typeof PATHS

export function Icon({ name, size = 16, ...rest }: { name: IconName; size?: number } & Omit<SVGProps<SVGSVGElement>, 'name'>) {
  return (
    <svg
      className="ai-icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      <path d={PATHS[name]} />
    </svg>
  )
}
