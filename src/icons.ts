// Simple line icons for the interface (24 × 24, drawn in currentColor): they replace the emojis and unicode glyphs of
// the arcade look. Each is a complete inline <svg>, sized by CSS (1em by default).

const svg = (body: string, fill = false) =>
  `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="${fill ? 'currentColor' : 'none'}" stroke="${fill ? 'none' : 'currentColor'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

export const ICON = {
  chev: svg('<path d="M9 5.5l6.5 6.5L9 18.5"/>'),
  back: svg('<path d="M15 5.5L8.5 12l6.5 6.5"/>'),
  check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  lock: svg('<rect x="5" y="11" width="14" height="9.5" rx="1.5"/><path d="M8.5 11V8a3.5 3.5 0 0 1 7 0v3"/>'),
  play: svg('<path d="M8 5.2v13.6L18.8 12z"/>', true),
  pause: svg('<rect x="6" y="4.5" width="4.2" height="15" rx="1"/><rect x="13.8" y="4.5" width="4.2" height="15" rx="1"/>', true),
  /** the tournament draw: two brackets that meet */
  draw: svg('<path d="M3 4.5h5v6H3M3 13.5h5v6H3M8 7.5h5v9H8M13 12h8"/>'),
  /** how to play */
  help: svg('<circle cx="12" cy="12" r="9"/><path d="M9.6 9.4a2.5 2.5 0 1 1 3.6 2.3c-.7.4-1.2.9-1.2 1.7v.6"/><circle cx="12" cy="17.2" r=".4" fill="currentColor"/>'),
  /** settings: two sliders */
  sliders: svg('<path d="M4 7.5h9M17 7.5h3M4 16.5h3M11 16.5h9"/><circle cx="15" cy="7.5" r="2"/><circle cx="9" cy="16.5" r="2"/>'),
  info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5"/><circle cx="12" cy="7.6" r=".4" fill="currentColor"/>'),
  /** a touch on the screen (the tutorial's hints) */
  tap: svg('<circle cx="12" cy="12" r="3.2" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="7.5" opacity=".55"/>'),
  replay: svg('<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4.5 4.5v4h4"/>'),
  trophy: svg('<path d="M8 4h8v5.5a4 4 0 0 1-8 0zM8 6H5.5v1A3 3 0 0 0 8 10M16 6h2.5v1A3 3 0 0 1 16 10M12 13.5v3.5M9 20h6M10 17h4"/>'),
  /** a player's card: a face over the attribute lines */
  card: svg('<rect x="5" y="2.8" width="14" height="18.4" rx="2"/><circle cx="12" cy="8.6" r="2.6"/><path d="M8.6 14.4h6.8M8.6 17.6h4.4"/>'),
  person: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21c1.4-4.2 4.4-6.2 8-6.2s6.6 2 8 6.2z"/>', true),
  star: svg('<path d="M12 3.2l2.7 5.5 6 .9-4.35 4.25 1.03 6L12 17l-5.38 2.85 1.03-6L3.3 9.6l6-.9z"/>', true),
  ball: svg('<circle cx="12" cy="12" r="8.5"/><path d="M4.6 7.6c3.2 1.4 4.6 4 4.6 4.4s-1.4 3-4.6 4.4M19.4 7.6c-3.2 1.4-4.6 4-4.6 4.4s1.4 3 4.6 4.4"/>'),
} as const;

/** a difficulty meter: five bars, the first `n` lit */
export function levelBars(n: number, max = 5, label = ''): string {
  let s = '';
  for (let i = 0; i < max; i++) s += `<i class="${i < n ? 'on' : ''}"></i>`;
  return `<span class="lvl" role="img" aria-label="${label} ${n}/${max}">${s}</span>`;
}
