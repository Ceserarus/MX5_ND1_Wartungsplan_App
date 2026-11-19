import plan1 from './plan1.json';

export type Aktion = 'I' | 'R' | 'T';

export const AKTION_TEXT: Record<Aktion, string> = {
  I: 'Prüfen',
  R: 'Ersetzen',
  T: 'Festziehen',
};

export interface Position {
  id: string;
  name: string;
  aktion: Aktion;
  km: number | null;
  monate: number | null;
  erstmals?: { km: number; monate: number };
  hinweis?: string;
}

export const POSITIONEN: Position[] = plan1.positionen as Position[];

export interface Eintrag {
  id: string;
  datum: string; // YYYY-MM-DD
  km: number;
  positionId: string; // Position.id or "sonstiges"
  aktion: Aktion;
  teile: string;
  kosten: number | null;
  notiz: string;
  belege: string[]; // Drive file ids
}

export interface KmStand {
  datum: string;
  km: number;
}

export type Status = 'ueberfaellig' | 'bald' | 'ok' | 'unbekannt';

export interface Faelligkeit {
  position: Position;
  letzter?: Eintrag;
  faelligKm: number | null;
  faelligDatum: string | null;
  restKm: number | null;
  restTage: number | null;
  status: Status;
}

/** Warn this many km / days before an item is due. */
export const VORWARNUNG_KM = 2000;
export const VORWARNUNG_TAGE = 30;

export function addMonths(datum: string, monate: number): string {
  const [y, m, d] = datum.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + monate, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
}

/**
 * When is a position due next?
 * Base is the last entry for the position; without one, the first registration
 * (Erstzulassung, km 0) is used so the plan works from day one.
 */
export function berechneFaelligkeit(
  position: Position,
  eintraege: Eintrag[],
  aktuellerKm: number | null,
  heute: string,
  erstzulassung: string | null,
): Faelligkeit {
  const letzter = eintraege
    .filter((e) => e.positionId === position.id)
    .sort((a, b) => b.km - a.km || b.datum.localeCompare(a.datum))[0];

  let basisKm: number | null;
  let basisDatum: string | null;
  let intervallKm = position.km;
  let intervallMonate = position.monate;

  if (letzter) {
    basisKm = letzter.km;
    basisDatum = letzter.datum;
  } else {
    basisKm = 0;
    basisDatum = erstzulassung;
    if (position.erstmals) {
      intervallKm = position.erstmals.km;
      intervallMonate = position.erstmals.monate;
    }
  }

  const faelligKm = intervallKm != null && basisKm != null ? basisKm + intervallKm : null;
  const faelligDatum = intervallMonate != null && basisDatum ? addMonths(basisDatum, intervallMonate) : null;
  const restKm = faelligKm != null && aktuellerKm != null ? faelligKm - aktuellerKm : null;
  const restTage = faelligDatum ? daysBetween(heute, faelligDatum) : null;

  let status: Status;
  if (restKm == null && restTage == null) status = 'unbekannt';
  else if ((restKm != null && restKm <= 0) || (restTage != null && restTage <= 0)) status = 'ueberfaellig';
  else if ((restKm != null && restKm <= VORWARNUNG_KM) || (restTage != null && restTage <= VORWARNUNG_TAGE)) status = 'bald';
  else status = 'ok';

  return { position, letzter, faelligKm, faelligDatum, restKm, restTage, status };
}

const RANG: Record<Status, number> = { ueberfaellig: 0, bald: 1, unbekannt: 2, ok: 3 };

export function alleFaelligkeiten(
  eintraege: Eintrag[],
  aktuellerKm: number | null,
  heute: string,
  erstzulassung: string | null,
): Faelligkeit[] {
  return POSITIONEN.map((p) => berechneFaelligkeit(p, eintraege, aktuellerKm, heute, erstzulassung)).sort(
    (a, b) =>
      RANG[a.status] - RANG[b.status] ||
      (a.restKm ?? Infinity) - (b.restKm ?? Infinity) ||
      (a.restTage ?? Infinity) - (b.restTage ?? Infinity),
  );
}

/** Highest known mileage from km log and maintenance entries. */
export function aktuellerKmStand(kmStaende: KmStand[], eintraege: Eintrag[]): number | null {
  const werte = [...kmStaende.map((k) => k.km), ...eintraege.map((e) => e.km)];
  return werte.length ? Math.max(...werte) : null;
}
