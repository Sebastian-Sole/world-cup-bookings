/**
 * Maps a team's ISO3-ish code (as stored in matches.json) to a flagcdn.com
 * slug so we can render real country flags as images — reliable across every
 * platform (unlike flag emoji, which don't render on Windows/Chrome).
 *
 * Knockout placeholder codes ("2A", "1F", "W97", "L101", "3A/B/C/D/F") have no
 * country yet, so they resolve to `null` and callers render a neutral chip.
 *
 * Flag slugs are lowercase ISO 3166-1 alpha-2, except the four UK home nations
 * which flagcdn exposes as `gb-eng` / `gb-sct` / `gb-wls` / `gb-nir`.
 */

const FLAG_SLUGS: Record<string, string> = {
  ALG: "dz", // Algeria
  ARG: "ar", // Argentina
  AUS: "au", // Australia
  AUT: "at", // Austria
  BEL: "be", // Belgium
  BIH: "ba", // Bosnia & Herzegovina
  BRA: "br", // Brazil
  CAN: "ca", // Canada
  CIV: "ci", // Ivory Coast
  COD: "cd", // DR Congo
  COL: "co", // Colombia
  CPV: "cv", // Cape Verde
  CRO: "hr", // Croatia
  CUW: "cw", // Curaçao
  CZE: "cz", // Czech Republic
  ECU: "ec", // Ecuador
  EGY: "eg", // Egypt
  ENG: "gb-eng", // England
  ESP: "es", // Spain
  FRA: "fr", // France
  GER: "de", // Germany
  GHA: "gh", // Ghana
  HAI: "ht", // Haiti
  IRN: "ir", // Iran
  IRQ: "iq", // Iraq
  JOR: "jo", // Jordan
  JPN: "jp", // Japan
  KOR: "kr", // South Korea
  KSA: "sa", // Saudi Arabia
  MAR: "ma", // Morocco
  MEX: "mx", // Mexico
  NED: "nl", // Netherlands
  NOR: "no", // Norway
  NZL: "nz", // New Zealand
  PAN: "pa", // Panama
  PAR: "py", // Paraguay
  POR: "pt", // Portugal
  QAT: "qa", // Qatar
  RSA: "za", // South Africa
  SCO: "gb-sct", // Scotland
  SEN: "sn", // Senegal
  SUI: "ch", // Switzerland
  SWE: "se", // Sweden
  TUN: "tn", // Tunisia
  TUR: "tr", // Turkey
  URU: "uy", // Uruguay
  USA: "us", // USA
  UZB: "uz", // Uzbekistan
};

/** flagcdn slug for a team code, or null for unresolved/placeholder teams. */
export function flagSlug(code: string): string | null {
  return FLAG_SLUGS[code] ?? null;
}

/**
 * A flagcdn PNG URL for a slug at a given pixel width (flagcdn serves
 * w20/w40/w80/w160…). We request 2× the rendered size for crispness on
 * retina displays.
 */
export function flagUrl(slug: string, width: 20 | 40 | 80 | 160 = 40): string {
  return `https://flagcdn.com/w${width}/${slug}.png`;
}
