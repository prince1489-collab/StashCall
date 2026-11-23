/**
 * StashCall's look, taken from the "pocket and ping" logo: navy for the
 * brand, amber only for "now" and alerts, warm paper behind everything.
 * Green is for "done" ticks only, never the brand colour.
 */
export const colors = {
  bg: '#F7F3EC',
  card: '#FFFFFF',
  text: '#141B26',
  muted: '#5A5F6B',
  border: '#E8E1D4',
  /** Pocket navy: brand, buttons, links, headers. */
  accent: '#1B2A41',
  /** Linen: soft fills, chips, stepper buttons. */
  accentSoft: '#F4EEE2',
  /** Ping amber: "now", countdowns, warnings. Text on it uses `text`. */
  amber: '#E9A23B',
  amberSoft: '#FBEBD0',
  /** Muted text on a navy background. */
  onAccentMuted: '#C9D1DE',
  /** Ticks and "sorted". */
  done: '#3F7D63',
  warn: '#8A5300',
  danger: '#B42318',
};

export const space = { xs: 4, s: 8, m: 12, l: 16, xl: 24 };

/**
 * Manrope for titles and times (loaded in the root layout); body text keeps
 * the phone's own font. Android ignores fontWeight with a custom font, so
 * each weight is its own family.
 */
export const fonts = {
  display: 'Manrope_800ExtraBold',
  bold: 'Manrope_700Bold',
};
