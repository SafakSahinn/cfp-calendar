import { useId } from 'react';

/** CFP Calendar logosu: son tarih saatli çağrı kâğıdı ("Call for Papers" + deadline). */
export function Logo({ size = 28 }: { size?: number }) {
  const g = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id={g} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4f6bff" />
          <stop offset="1" stopColor="#7c4dff" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="15" fill={`url(#${g})`} />
      <path d="M18 14h20l10 10v26a4 4 0 0 1-4 4H18a4 4 0 0 1-4-4V18a4 4 0 0 1 4-4z" fill="#fff" />
      <path d="M38 14v8a2 2 0 0 0 2 2h8z" fill="#c3cbff" />
      <g stroke="#c3cbff" strokeWidth="3" strokeLinecap="round">
        <path d="M21 28h12" />
        <path d="M21 34h18" />
      </g>
      <circle cx="40" cy="44" r="10" fill="#ff8a3d" stroke="#fff" strokeWidth="3" />
      <path d="M40 38.5v6l3.5 2.2" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}
