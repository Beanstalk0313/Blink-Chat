// Blink theme palette.
//
// A theme is a *spec*, never a stylesheet: a primary colour, an accent colour
// and a background, plus an optional light/dark hint. Everything else the UI
// paints with — the surface ladder, outlines, muted text, hover/active tints,
// brand glows, glass panels, shadows, error/success colours — is derived here
// and published as CSS custom properties on <html>.
//
// Because every component reads those tokens instead of literal colours, a new
// theme (stock or custom) instantly covers the entire interface: there is no
// per-theme CSS and no element that can be "left out" of a theme. Adding one is
// three colours, e.g. `mint: { label: 'Mint', primary: '#6ee7b7',
// accent: '#a7f3d0', base: '#08130f' }`.

const WHITE = { r: 255, g: 255, b: 255 };
const BLACK = { r: 0, g: 0, b: 0 };

export const THEMES = {
  // Blink Blue: the vivid brand blue Blink is known for as the fill colour,
  // with the pale periwinkle kept as the second tone, over a near-black base
  // that carries a faint cool cast so the greys never read as plain grey.
  default: { label: 'Blink', primary: '#4b8eff', accent: '#2563eb', base: '#0f1117' },
  ocean: { label: 'Ocean', primary: '#67e8f9', accent: '#93c5fd', base: '#061820' },
  forest: { label: 'Forest', primary: '#86efac', accent: '#fde68a', base: '#0a1710' },
  sunset: { label: 'Sunset', primary: '#fdba74', accent: '#fda4af', base: '#1b1013' },
  // Mono is genuinely monochrome: both brand colours are greys, so buttons,
  // active rows, mentions, glows and focus rings all desaturate with it.
  monochrome: { label: 'Mono', primary: '#a1a1aa', accent: '#d4d4d8', base: '#101012' }
};

const clamp = value => Math.min(255, Math.max(0, value));

export function parseHex(hex) {
  const clean = String(hex || '#000000').trim().replace(/^#/, '');
  const full = clean.length === 3 ? clean.split('').map(char => char + char).join('') : clean.slice(0, 6);
  const value = Number.parseInt(full.padEnd(6, '0'), 16);
  if (!Number.isFinite(value)) return { ...BLACK };
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}

export function toHex({ r, g, b }) {
  return `#${[r, g, b].map(channel => clamp(Math.round(channel)).toString(16).padStart(2, '0')).join('')}`;
}

function mix(from, to, amount) {
  const t = Math.min(1, Math.max(0, amount));
  return {
    r: from.r + (to.r - from.r) * t,
    g: from.g + (to.g - from.g) * t,
    b: from.b + (to.b - from.b) * t
  };
}

function rgba({ r, g, b }, alpha) {
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${alpha})`;
}

function luminance({ r, g, b }) {
  const channel = value => {
    const scaled = value / 255;
    return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(first, second) {
  const a = luminance(first);
  const b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

// Text/icon colour to place on top of a filled colour (buttons, badges,
// bubbles). Brand fills keep light text the way Blink always looked, so any
// mid-tone colour that clears the large-text threshold stays white-on-fill;
// only genuinely light colours (periwinkle, mint, amber) flip to dark text.
// The result is tinted towards the fill's hue so it never looks like a
// generic pure black/white.
function onColor(color) {
  return contrast(color, WHITE) >= 3
    ? mix(color, WHITE, 0.94)
    : mix(color, BLACK, 0.88);
}

// Builds the complete token set for a theme spec. `highContrast` pushes the
// text colours towards pure white/black, strengthens hairlines and washes and
// makes glass surfaces more opaque, so the same theme reads at higher contrast.
export function buildThemeTokens(spec, options = {}) {
  const highContrast = Boolean(options.highContrast);
  const base = parseHex(spec?.base || THEMES.default.base);
  const primary = parseHex(spec?.primary || THEMES.default.primary);
  const accent = parseHex(spec?.accent || THEMES.default.accent);
  const isLight = spec?.mode ? spec.mode === 'light' : luminance(base) > 0.45;

  // Surface ladder. Dark themes get lighter as they elevate; light themes get
  // whiter, with "dim"/"lowest" reserved for recessed areas (scrims, wells).
  const surfaceDim = isLight ? mix(base, BLACK, 0.1) : mix(base, BLACK, 0.26);
  const surfaceBright = isLight ? mix(base, WHITE, 0.95) : mix(base, WHITE, 0.16);
  const lowest = isLight ? mix(base, WHITE, 0.9) : mix(base, BLACK, 0.26);
  const low = isLight ? mix(base, WHITE, 0.7) : mix(base, WHITE, 0.035);
  const container = isLight ? mix(base, WHITE, 0.55) : mix(base, WHITE, 0.055);
  const high = isLight ? mix(base, WHITE, 0.4) : mix(base, WHITE, 0.1);
  const highest = isLight ? mix(base, WHITE, 0.25) : mix(base, WHITE, 0.145);

  const onSurface = isLight
    ? mix(base, BLACK, highContrast ? 1 : 0.86)
    : mix(base, WHITE, highContrast ? 1 : 0.89);
  const onSurfaceVariant = mix(onSurface, base, isLight ? (highContrast ? 0.2 : 0.32) : (highContrast ? 0.1 : 0.18));
  const tertiary = mix(onSurface, base, isLight ? (highContrast ? 0.3 : 0.45) : (highContrast ? 0.2 : 0.32));
  const outline = mix(onSurface, base, isLight ? (highContrast ? 0.35 : 0.5) : (highContrast ? 0.35 : 0.55));
  const outlineVariant = mix(onSurface, base, highContrast ? 0.55 : 0.74);

  // "Container" colours are fills used with on-container text (buttons in
  // community settings, the login mark's gradient), not washed surfaces.
  const primaryContainer = isLight ? mix(primary, base, 0.15) : mix(primary, base, 0.28);
  const secondaryContainer = isLight ? mix(accent, base, 0.15) : mix(accent, base, 0.28);
  const tertiaryContainer = mix(onSurface, base, isLight ? 0.86 : 0.78);

  // App chrome: three closely related slate tones that share one blue cast.
  // The rail is the darkest, the page sits a step above it, and the content
  // pane is one step lighter again — near enough to read as one surface, far
  // enough apart to see the layering. Only the pane leans on the brand colour,
  // so the accents inside it still pop without the panel itself glowing.
  const chromeTint = (color, amount) => mix(color, primary, amount);
  const railColor = chromeTint(isLight ? mix(base, WHITE, 0.02) : mix(base, BLACK, 0.32), isLight ? 0.01 : 0.03);
  const pageColor = chromeTint(isLight ? mix(base, WHITE, 0.1) : mix(base, WHITE, 0.028), isLight ? 0.01 : 0.04);
  const content = chromeTint(mix(base, WHITE, isLight ? 0.18 : highContrast ? 0.09 : 0.058), isLight ? 0.01 : 0.05);

  const error = isLight ? { r: 179, g: 38, b: 30 } : { r: 255, g: 180, b: 171 };
  const onError = isLight ? mix(error, WHITE, 0.94) : mix(error, BLACK, 0.9);
  const errorContainer = isLight ? { r: 249, g: 222, b: 220 } : { r: 147, g: 0, b: 10 };
  const onErrorContainer = isLight ? { r: 65, g: 14, b: 11 } : { r: 255, g: 218, b: 214 };
  const success = isLight ? { r: 20, g: 108, b: 67 } : { r: 126, g: 226, b: 168 };
  const onSuccess = isLight ? mix(success, WHITE, 0.94) : mix(success, BLACK, 0.88);
  const successContainer = isLight ? { r: 209, g: 250, b: 229 } : { r: 16, g: 79, b: 55 };
  const onSuccessContainer = isLight ? { r: 6, g: 46, b: 30 } : { r: 181, g: 247, b: 213 };

  // Neutral overlays are derived from the text colour, so hairlines and hover
  // washes stay correct on a light theme instead of being hardcoded white.
  const ink = isLight ? BLACK : WHITE;

  return {
    '--color-background': toHex(base),
    // The shell behind the panels: the elevated surface tone, so the app reads
    // as a lighter stage with the dark navigation rail sitting on it.
    '--color-app-background': toHex(pageColor),
    '--color-on-background': toHex(onSurface),
    '--color-surface': toHex(base),
    '--color-surface-dim': toHex(surfaceDim),
    '--color-surface-bright': toHex(surfaceBright),
    '--color-surface-container-lowest': toHex(lowest),
    '--color-surface-container-low': toHex(low),
    '--color-surface-container': toHex(container),
    '--color-surface-container-high': toHex(high),
    '--color-surface-container-highest': toHex(highest),
    '--color-surface-variant': toHex(high),
    '--color-surface-tint': toHex(primary),
    '--color-on-surface': toHex(onSurface),
    '--color-on-surface-variant': toHex(onSurfaceVariant),
    '--color-inverse-surface': toHex(onSurface),
    '--color-inverse-on-surface': toHex(base),
    '--color-outline': toHex(outline),
    '--color-outline-variant': toHex(outlineVariant),

    '--color-primary': toHex(primary),
    '--color-on-primary': toHex(onColor(primary)),
    '--color-primary-container': toHex(primaryContainer),
    '--color-on-primary-container': toHex(onColor(primaryContainer)),
    '--color-inverse-primary': toHex(mix(primary, WHITE, isLight ? 0.2 : 0.3)),
    '--color-secondary': toHex(accent),
    '--color-on-secondary': toHex(onColor(accent)),
    '--color-secondary-container': toHex(secondaryContainer),
    '--color-on-secondary-container': toHex(onColor(secondaryContainer)),
    '--color-tertiary': toHex(tertiary),
    '--color-on-tertiary': toHex(base),
    '--color-tertiary-container': toHex(tertiaryContainer),
    '--color-on-tertiary-container': toHex(onColor(tertiaryContainer)),

    '--color-error': toHex(error),
    '--color-on-error': toHex(onError),
    '--color-error-container': toHex(errorContainer),
    '--color-on-error-container': toHex(onErrorContainer),
    '--color-success': toHex(success),
    '--color-on-success': toHex(onSuccess),
    '--color-success-container': toHex(successContainer),
    '--color-on-success-container': toHex(onSuccessContainer),

    // Neutral overlays: hairlines, hover washes, pressed states, scrims.
    '--tint-faint': rgba(ink, highContrast ? 0.06 : 0.03),
    '--tint-subtle': rgba(ink, highContrast ? 0.1 : 0.05),
    '--tint-hover': rgba(ink, highContrast ? 0.16 : 0.08),
    '--tint-active': rgba(ink, highContrast ? 0.24 : 0.12),
    '--tint-strong': rgba(ink, highContrast ? 0.34 : 0.2),
    '--tint-heavy': rgba(ink, highContrast ? 0.46 : 0.3),
    '--color-border-faint': rgba(ink, highContrast ? 0.14 : 0.05),
    '--color-border-subtle': rgba(ink, highContrast ? 0.26 : 0.1),
    '--color-border-strong': rgba(ink, highContrast ? 0.4 : 0.18),

    // Brand-derived washes (selected rows, mention chips, glows, focus rings).
    '--color-primary-soft': rgba(primary, highContrast ? 0.22 : 0.12),
    '--color-primary-medium': rgba(primary, highContrast ? 0.32 : 0.2),
    '--color-primary-strong': rgba(primary, highContrast ? 0.55 : 0.4),
    '--color-primary-glow': rgba(primary, highContrast ? 0.35 : 0.22),
    '--color-accent-soft': rgba(accent, highContrast ? 0.22 : 0.12),
    '--color-accent-medium': rgba(accent, highContrast ? 0.32 : 0.2),
    '--color-secondary-glow': rgba(accent, highContrast ? 0.35 : 0.22),
    '--color-error-soft': rgba(error, 0.12),
    '--color-error-medium': rgba(error, 0.22),
    '--color-success-soft': rgba(success, 0.14),

    // Depth and glass. Glass keeps its translucency (the page gradient shows
    // through), and only turns solid when high contrast asks for it.
    '--color-scrim': rgba(BLACK, isLight ? 0.45 : 0.55),
    '--color-scrim-strong': rgba(BLACK, 0.78),
    '--color-shadow-weak': rgba(BLACK, isLight ? 0.08 : 0.2),
    '--color-shadow': rgba(BLACK, isLight ? 0.14 : 0.35),
    '--color-shadow-strong': rgba(BLACK, isLight ? 0.22 : 0.5),
    // Content pane, canvas and bubbles are one family: the pane is the blue
    // panel, the canvas is the same tone inside it, and bubbles sit lighter
    // still so messages read against the pane.
    '--color-content': toHex(content),
    '--glass-content': rgba(content, highContrast ? 0.99 : 0.94),
    '--glass-canvas': rgba(content, highContrast ? 0.98 : 0.6),
    '--glass-bubble': rgba(mix(content, WHITE, isLight ? 0.04 : 0.05), highContrast ? 0.95 : 0.88),
    // The navigation rail is the darkest chrome, one step below the page.
    '--glass-sidebar': rgba(railColor, highContrast ? 0.99 : 0.96),
    '--glass-panel': rgba(container, highContrast ? 0.88 : isLight ? 0.78 : 0.6),
    '--glass-strong': rgba(high, highContrast ? 0.97 : isLight ? 0.92 : 0.82),
    '--glass-bar': rgba(base, highContrast ? 0.98 : 0.9),
    '--gradient-app': `radial-gradient(circle at 10% 20%, ${rgba(primary, isLight ? 0.08 : 0.06)} 0%, transparent 40%), radial-gradient(circle at 90% 80%, ${rgba(accent, isLight ? 0.08 : 0.06)} 0%, transparent 40%)`,
    '--gradient-accent': `linear-gradient(135deg, ${toHex(primary)}, ${toHex(accent)})`
  };
}

// Convenience for non-React callers (drag ghosts, canvas text, etc.).
export function themeTokens(themeId) {
  return buildThemeTokens(THEMES[themeId] || THEMES.default);
}
