/**
 * The prove screens' own palette. Always dark, whatever the system setting,
 * like the loss screen: proving a habit is a moment, and the camera feed, the
 * radar and the timer's fill all read best on near-black. Brand violet is the
 * one colour that means "Ante is checking".
 */
export const PROOF_INK = {
  background: '#07060F',
  panel: '#16142A',
  panelBorder: 'rgba(255,255,255,0.08)',
  scrim: 'rgba(7,6,15,0.55)',
  chrome: 'rgba(255,255,255,0.14)',
  text: '#FFFFFF',
  soft: '#B6B2CF',
  faint: '#4B4769',
  /** Fills: the timer, the check. */
  primary: '#4121FF',
  /** Glows and beams: the scan line, the radar sweep. */
  violet: '#7C66FF',
  accent: '#FF391F',
} as const;
