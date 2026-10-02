/**
 * Small line icons of the game modes, shown on the summary page (js/home.js).
 *
 * Drawn for this site (24x24 viewBox, stroke = currentColor), not taken from
 * the game files. Keyed by mode id; a mode without an entry gets FALLBACK.
 */
const svg = (body) =>
  `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

const ICONS = {
  // Comparison table.
  classic: svg('<rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M3 9.5h18M3 14.5h18M9 4v16M15 4v16"/>'),
  // Bust in a round medallion.
  portrait: svg('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="10" r="3"/><path d="M6.5 18.2c1.2-2.5 3.2-3.7 5.5-3.7s4.3 1.2 5.5 3.7"/>'),
  // Filled bust: a silhouette.
  silhouette: svg('<path d="M12 3.5a4 4 0 1 1 0 8 4 4 0 0 1 0-8zM4.5 20.5c.6-4.3 3.7-6.8 7.5-6.8s6.9 2.5 7.5 6.8z" fill="currentColor"/>'),
  // Eye.
  regard: svg('<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>'),
  // Quoted text lines.
  description: svg('<path d="M4 6.5h16M4 11h16M4 15.5h10"/><path d="M17 15v4.5M20 15v4.5" stroke-width="2.2"/>'),
  // Flag on a pole.
  citystates: svg('<path d="M5 21V3.5"/><path d="M5 4.5h12l-2.5 4 2.5 4H5"/>'),
  // Flask.
  techscivics: svg('<path d="M9.5 3.5h5M10.5 3.5v5.5L5 19a1.5 1.5 0 0 0 1.3 2h11.4A1.5 1.5 0 0 0 19 19l-5.5-10V3.5"/><path d="M7.5 15h9"/>'),
  // Hexagonal tile with ploughed rows.
  improvements: svg('<path d="M12 2.5l8.2 4.75v9.5L12 21.5l-8.2-4.75v-9.5z"/><path d="M7.5 10.5l9 0M6.5 14l11 0M8.5 17.5l7 0"/>'),
};

const FALLBACK = svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 8v4.5M12 15.5v.5"/>');

/** SVG markup of a mode's icon (trusted, static strings defined above). */
export function iconFor(modeId) {
  return ICONS[modeId] ?? FALLBACK;
}
