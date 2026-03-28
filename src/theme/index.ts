// src/theme/index.ts
// MAESTRO Design System — Single source of truth
// To RENAME the app: change ONLY app.json "displayName"
// APP_NAME here mirrors that value

export const APP_NAME = 'MAESTRO';

export const Colors = {
  // Core backgrounds
  bg:         '#0B0B12',
  bgCard:     'rgba(255,255,255,0.06)',
  bgSurf:     '#151520',
  bgSurfH:    '#1C1C2C',

  // Brand — Gold
  gold:       '#D4AF37',
  goldLight:  '#F2C84B',
  goldGlow:   'rgba(212,175,55,0.45)',
  goldBg:     'rgba(212,175,55,0.15)',

  // Accent — Teal
  teal:       '#00D9C0',
  tealGlow:   'rgba(0,217,192,0.45)',
  tealBg:     'rgba(0,217,192,0.14)',
  tealBdr:    'rgba(0,217,192,0.5)',

  // Accent — Red (record)
  red:        '#FF3B5C',
  redGlow:    'rgba(255,59,92,0.85)',
  redBg:    'rgba(255,59,92,0.3)',

  // Accent — Purple (glow bg)
  purple:     '#6A2AE6',
  purpleGlow: 'rgba(106,42,230,0.38)',

  // Text
  textPrimary:   '#FFFFFF',
  textSecondary: 'rgba(255,255,255,0.6)',
  textMuted:     'rgba(255,255,255,0.35)',
  textHint:      'rgba(255,255,255,0.2)',

  // Borders
  border:    'rgba(255,255,255,0.12)',
  borderSub: 'rgba(255,255,255,0.06)',
  borderHi:  'rgba(255,255,255,0.22)',
};

export const Spacing = {
  xs:  4,
  sm:  8,
  md:  12,
  lg:  16,
  xl:  24,
  xxl: 32,
};

export const Radius = {
  sm:  8,
  md:  12,
  lg:  16,
  xl:  24,
  pill: 999,
};

export const Typography = {
  appName: {
    fontSize:      24,
    fontWeight:    '800' as const,
    letterSpacing: 3,
    color:         Colors.gold,
  },
  h1:      { fontSize: 22, fontWeight: '700' as const, color: Colors.textPrimary },
  h2:      { fontSize: 18, fontWeight: '600' as const, color: Colors.textPrimary },
  h3:      { fontSize: 15, fontWeight: '600' as const, color: Colors.textPrimary },
  body:    { fontSize: 14, fontWeight: '400' as const, color: Colors.textSecondary },
  caption: { fontSize: 11, fontWeight: '400' as const, color: Colors.textMuted },
  tiny:    { fontSize:  9, fontWeight: '400' as const, color: Colors.textHint },
};

export const Shadows = {
  gold: {
    shadowColor:   Colors.gold,
    shadowOffset:  { width: 0, height: 0 },
    shadowOpacity: 0.85,
    shadowRadius:  16,
    elevation:     10,
  },
  teal: {
    shadowColor:   Colors.teal,
    shadowOffset:  { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius:  12,
    elevation:     8,
  },
  red: {
    shadowColor:   Colors.red,
    shadowOffset:  { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius:  20,
    elevation:     12,
  },
};

export default { APP_NAME, Colors, Spacing, Radius, Typography, Shadows };
