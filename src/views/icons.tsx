import type { ReactNode } from 'react';

/**
 * Iconos de la app: trazos sencillos de 24×24 que heredan el color del texto.
 * Todos comparten grosor y estilo para que la interfaz se vea como un solo producto.
 */
const PATHS = {
  home: <><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5" /></>,
  receipt: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" /><path d="M9 8h6M9 12h6M9 16h3" /></>,
  pie: <><path d="M21 12A9 9 0 1 1 12 3v9z" /><path d="M15 3.5A9 9 0 0 1 20.5 9H15z" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></>,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c0-3.5 3-5.5 6.5-5.5s6.5 2 6.5 5.5" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.8c2 .6 3.5 2.3 3.5 5.2" /></>,
  settings: <><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  bell: <><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></>,
  minus: <path d="M5 12h14" />,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  chevronLeft: <path d="m15 18-6-6 6-6" />,
  chevronRight: <path d="m9 18 6-6-6-6" />,
  chevronDown: <path d="m6 9 6 6 6-6" />,
  close: <path d="M18 6 6 18M6 6l12 12" />,
  camera: <><path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" /><circle cx="12" cy="13.5" r="3.5" /></>,
  repeat: <><path d="m17 2 4 4-4 4" /><path d="M3 11V9a3 3 0 0 1 3-3h15" /><path d="m7 22-4-4 4-4" /><path d="M21 13v2a3 3 0 0 1-3 3H3" /></>,
  fileIn: <><path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z" /><path d="M14 3v5h5" /><path d="M12 11v6M9 14l3 3 3-3" /></>,
  bank: <><path d="M3 10 12 4l9 6" /><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8" /><path d="M3 21h18" /></>,
  piggy: <><path d="M4.5 11.5c0-3.6 3.4-6 7.5-6 2.4 0 4.5.8 5.9 2.2L20.5 7l-.6 3.3c.4.6.6 1.2.6 1.9v1.3l-1.8.7a6.6 6.6 0 0 1-2.2 2.7V20h-3v-2.2a9 9 0 0 1-3 0V20h-3v-3.1a5.6 5.6 0 0 1-3-5.4z" /><path d="M10 8.5h3.5" /><path d="M16.5 11h.01" /></>,
  check: <path d="M20 6 9 17l-5-5" />,
  alert: <><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4M12 17h.01" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 16v-4M12 8h.01" /></>,
  trash: <><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" /><path d="M10 10.5v6M14 10.5v6" /></>,
  lock: <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>,
  sparkles: <><path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /><path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" /></>,
  swap: <><path d="M7 4 3 8l4 4" /><path d="M3 8h14" /><path d="m17 20 4-4-4-4" /><path d="M21 16H7" /></>,
  chart: <path d="M4 20V11M10 20V5M16 20v-6M2 20h20" />,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>,
  logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></>,
  download: <><path d="M12 3v12M7 10l5 5 5-5" /><path d="M5 21h14" /></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>,
  edit: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></>,
  archive: <><rect x="3" y="4" width="18" height="4" rx="1" /><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8M10 12h4" /></>,
  undo: <><path d="M9 14 4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 0 10h-3" /></>,
  phone: <><rect x="7" y="2" width="10" height="20" rx="2" /><path d="M11 18h2" /></>,
  heart: <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />,
  pause: <path d="M9 5v14M15 5v14" />,
  play: <path d="m7 4 13 8-13 8z" />,
  arrowUp: <path d="M12 19V5M5 12l7-7 7 7" />,
  arrowDown: <path d="M12 5v14M19 12l-7 7-7-7" />,
  arrowRight: <path d="M5 12h14M13 5l7 7-7 7" />,
  target: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></>,
  list: <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  sliders: <><path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1" /><circle cx="15" cy="6" r="2" /><circle cx="9" cy="12" r="2" /><circle cx="17" cy="18" r="2" /></>,
  grid: <><rect x="3.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.5" /></>,
  star: <path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />,
  // Categorías de la lista de la compra
  apple: <><path d="M12 7.5c-1.4-1-3.4-1.4-5-.6-2.6 1.3-3 4.6-2 7.6 1.1 3.3 3.6 6.8 6 6.4.4-.1.6-.3 1-.3s.6.2 1 .3c2.4.4 4.9-3.1 6-6.4 1-3 .6-6.3-2-7.6-1.6-.8-3.6-.4-5 .6z" /><path d="M12 7.5c0-2 .8-3.6 2.8-4.5" /></>,
  fish: <><path d="M6 12c2.4-3.4 5.7-5 8.7-5 2.8 0 5.2 2 6.3 5-1.1 3-3.5 5-6.3 5-3 0-6.3-1.6-8.7-5z" /><path d="M6 12 2.5 8.5v7z" /><path d="M16.5 10.5h.01" /></>,
  milk: <><path d="M8.5 2.5h7v3l2.5 4V20a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 20V9.5l2.5-4z" /><path d="M6 9.5h12M8.5 5.5h7" /></>,
  bread: <><path d="M6 11.2A3.8 3.8 0 0 1 4.5 4.5C6.5 3 9.2 3 12 3s5.5 0 7.5 1.5A3.8 3.8 0 0 1 18 11.2V20a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1z" /><path d="M10 9.5l-1.5 2M15 9.5l-1.5 2" /></>,
  jar: <><rect x="5.5" y="7.5" width="13" height="13.5" rx="2.5" /><path d="M7.5 3h9v4.5h-9z" /><path d="M5.5 12.5h13" /></>,
  bottle: <><path d="M10 2.5h4V6l2 3v11a1.5 1.5 0 0 1-1.5 1.5h-5A1.5 1.5 0 0 1 8 20V9l2-3z" /><path d="M8 13h8" /></>,
  snowflake: <><path d="M12 2.5v19M3.8 7.2l16.4 9.6M20.2 7.2 3.8 16.8" /><path d="m9.5 4.5 2.5 2 2.5-2M9.5 19.5l2.5-2 2.5 2" /></>,
  spray: <><path d="M8.5 10h6v10.5a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1z" /><path d="M9.5 10V6.5h4V10" /><path d="M9.5 6.5V3.5h5.5l-1.5 3" /><path d="M18 4h.01M20.5 6.5h.01M18 9h.01" /></>,
  droplet: <path d="M12 2.8S5.5 9.8 5.5 14.3a6.5 6.5 0 0 0 13 0C18.5 9.8 12 2.8 12 2.8z" />,
  // Categorías
  cart: <><circle cx="9" cy="20" r="1.3" /><circle cx="18" cy="20" r="1.3" /><path d="M2 3h3l2.5 12h11.5l2-8H6.2" /></>,
  bolt: <path d="M13 2 4 14h7l-1 8 9-12h-7z" />,
  wifi: <><path d="M2 9a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0" /><path d="M12 19.5h.01" /></>,
  car: <><path d="M5 17H3v-5l2-5h14l2 5v5h-2" /><path d="M3 12h18" /><circle cx="7.5" cy="17" r="2" /><circle cx="16.5" cy="17" r="2" /><path d="M9.5 17h5" /></>,
  utensils: <><path d="M7 2v20M4 2v6a3 3 0 0 0 6 0V2" /><path d="M17 22V2c-2.5 1-4 4-4 8h4" /></>,
  coffee: <><path d="M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z" /><path d="M17 10h1.5a2.5 2.5 0 0 1 0 5H17" /><path d="M8 3v3M12 3v3" /></>,
  ticket: <><path d="M3 7h18v3a2 2 0 0 0 0 4v3H3v-3a2 2 0 0 0 0-4z" /><path d="M14 7v2M14 11v2M14 15v2" /></>,
  health: <><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" /><path d="M7.5 11.5h2.5l1-2 2 4 1-2h2.5" /></>,
  suitcase: <><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M9 7V4h6v3M3 13h18" /></>,
  shirt: <path d="M8 3 3 6l2 4 2-1v12h10V9l2 1 2-4-5-3c0 1.7-1.8 3-4 3S8 4.7 8 3z" />,
  gift: <><rect x="3" y="8" width="18" height="4" rx="1" /><path d="M5 12v9h14v-9M12 8v13" /><path d="M12 8S10.5 3 8 4s0 4 4 4zM12 8s1.5-5 4-4 0 4-4 4z" /></>,
  paw: <><circle cx="6.5" cy="10" r="1.8" /><circle cx="10" cy="5.8" r="1.8" /><circle cx="14.5" cy="5.8" r="1.8" /><circle cx="18" cy="10" r="1.8" /><path d="M12 11.5c-3 0-5.5 4-5.5 6.2 0 1.6 1.3 2.3 2.7 2 1-.2 1.8-.7 2.8-.7s1.8.5 2.8.7c1.4.3 2.7-.4 2.7-2 0-2.2-2.5-6.2-5.5-6.2z" /></>,
  book: <><path d="M4 4h6a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H4z" /><path d="M20 4h-6a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h6z" /></>,
  dumbbell: <path d="M6 7v10M3 9.5v5M18 7v10M21 9.5v5M6 12h12" />,
  coins: <><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /><path d="M6 12h.01M18 12h.01" /></>,
  percent: <><path d="M19 5 5 19" /><circle cx="7" cy="7" r="2.5" /><circle cx="17" cy="17" r="2.5" /></>,
  tag: <><path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z" /><circle cx="7.5" cy="7.5" r="1.3" /></>,
  card: <><rect x="2.5" y="5" width="19" height="14" rx="2.5" /><path d="M2.5 10h19M6.5 15h4" /></>,
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20, className, label }: { name: IconName; size?: number; className?: string; label?: string }) {
  return (
    <svg
      className={'icon' + (className ? ' ' + className : '')}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}
