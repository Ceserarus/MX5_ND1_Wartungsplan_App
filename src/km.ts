import type { Eintrag, KmStand } from './plan';

export interface Punkt {
  datum: string;
  km: number;
}

/** All known odometer readings (km log + maintenance entries), one per day, sorted by date. */
export function kmVerlauf(kmStaende: KmStand[], eintraege: Eintrag[]): Punkt[] {
  const proTag = new Map<string, number>();
  for (const p of [...kmStaende, ...eintraege]) {
    if (!p.datum || !Number.isFinite(p.km)) continue;
    proTag.set(p.datum, Math.max(proTag.get(p.datum) ?? 0, p.km));
  }
  return [...proTag.entries()].map(([datum, km]) => ({ datum, km })).sort((a, b) => a.datum.localeCompare(b.datum));
}

const ms = (d: string) => Date.parse(d + 'T00:00:00Z');

/** Odometer at a given date by linear interpolation between readings (null outside the known range). */
export function kmAm(verlauf: Punkt[], datum: string): number | null {
  if (!verlauf.length) return null;
  const t = ms(datum);
  if (t < ms(verlauf[0].datum) || t > ms(verlauf[verlauf.length - 1].datum)) return null;
  for (let i = 1; i < verlauf.length; i++) {
    const a = verlauf[i - 1];
    const b = verlauf[i];
    if (t <= ms(b.datum)) {
      const span = ms(b.datum) - ms(a.datum);
      return span === 0 ? b.km : a.km + ((b.km - a.km) * (t - ms(a.datum))) / span;
    }
  }
  return verlauf[verlauf.length - 1].km;
}

export interface Jahr {
  jahr: number;
  km: number;
  /** true if the year is only partly covered by readings (first/current year) */
  teilweise: boolean;
}

/** Kilometres driven per calendar year, readings interpolated at year boundaries. */
export function kmProJahr(verlauf: Punkt[]): Jahr[] {
  if (verlauf.length < 2) return [];
  const erst = verlauf[0].datum;
  const letzt = verlauf[verlauf.length - 1].datum;
  const von = Number(erst.slice(0, 4));
  const bis = Number(letzt.slice(0, 4));
  const jahre: Jahr[] = [];
  for (let j = von; j <= bis; j++) {
    const start = `${j}-01-01` < erst ? erst : `${j}-01-01`;
    const ende = `${j + 1}-01-01` > letzt ? letzt : `${j + 1}-01-01`;
    const a = kmAm(verlauf, start);
    const b = kmAm(verlauf, ende);
    if (a == null || b == null) continue;
    jahre.push({ jahr: j, km: Math.max(0, Math.round(b - a)), teilweise: start !== `${j}-01-01` || ende !== `${j + 1}-01-01` });
  }
  return jahre;
}

/** Is there a km reading in the month of `heute`? */
export function kmImMonat(kmStaende: KmStand[], heute: string): boolean {
  const monat = heute.slice(0, 7);
  return kmStaende.some((k) => k.datum.slice(0, 7) === monat);
}
