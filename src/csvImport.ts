/**
 * CSV import for the "Einträge" and "Kilometer" sheets.
 *
 * Files may or may not have a header row, may use "," or ";" as separator and
 * use the same column order as the sheets:
 *   Einträge:  ID, Datum, Km, PositionId, Position, Aktion, Teile, Kosten, Notiz, Belege
 *   Kilometer: Datum, Km
 * Rows that already exist in the sheet (or appear twice in the file) are skipped.
 */
import type { Aktion, Eintrag, KmStand } from './plan';

export type ImportArt = 'eintraege' | 'kilometer';

export interface ImportVorschau {
  art: ImportArt;
  /** Rows ready to append, already in sheet column order. */
  neu: (string | number)[][];
  doppelt: number;
  fehlerhaft: string[];
}

/** Parses CSV text (RFC 4180 quoting) into rows of strings. */
export function csvLesen(text: string): string[][] {
  text = text.replace(/^﻿/, '');
  const trenner = trennerErkennen(text);
  const zeilen: string[][] = [];
  let zeile: string[] = [];
  let feld = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          feld += '"';
          i++;
        } else inQuotes = false;
      } else feld += c;
    } else if (c === '"') inQuotes = true;
    else if (c === trenner) {
      zeile.push(feld);
      feld = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      zeile.push(feld);
      zeilen.push(zeile);
      zeile = [];
      feld = '';
    } else feld += c;
  }
  if (feld !== '' || zeile.length) {
    zeile.push(feld);
    zeilen.push(zeile);
  }
  return zeilen.filter((z) => z.some((f) => f.trim() !== ''));
}

/** Picks "," or ";" by counting unquoted occurrences in the first line. */
function trennerErkennen(text: string): ',' | ';' {
  let komma = 0;
  let semikolon = 0;
  let inQuotes = false;
  for (const c of text) {
    if (c === '"') inQuotes = !inQuotes;
    else if (!inQuotes && (c === '\n' || c === '\r')) break;
    else if (!inQuotes && c === ',') komma++;
    else if (!inQuotes && c === ';') semikolon++;
  }
  return semikolon > komma ? ';' : ',';
}

/** Accepts YYYY-MM-DD or DD.MM.YYYY, returns YYYY-MM-DD or null. */
export function datumLesen(s: string): string | null {
  s = s.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(s);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}

/** Km values like "35024", "35.024" or "35 024". */
function kmLesen(s: string): number | null {
  const t = s.trim().replace(/[.\s]/g, '');
  if (!/^\d+$/.test(t)) return null;
  return Number(t);
}

/** Money like "12,50", "1.234,50" or "12.50". */
function kostenLesen(s: string): number | '' {
  const t = s.trim().replace(/\s|€/g, '');
  if (!t) return '';
  const norm = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t;
  const n = Number(norm);
  return Number.isFinite(n) ? n : '';
}

const istKopf = (zeile: string[]) => /^(id|datum)$/i.test(zeile[0]?.trim() ?? '');

/** Kilometer files have two columns, Einträge files more. */
export function artErkennen(zeilen: string[][]): ImportArt {
  const daten = zeilen.filter((z) => !istKopf(z));
  const breite = Math.max(0, ...daten.map((z) => z.filter((f) => f.trim() !== '').length));
  return breite <= 2 ? 'kilometer' : 'eintraege';
}

export const kmSchluessel = (datum: string, km: number) => `${datum}|${km}`;

export function vorschauErstellen(
  text: string,
  vorhanden: { eintraege: Eintrag[]; kmStaende: KmStand[] },
  neueId: () => string = () => crypto.randomUUID(),
): ImportVorschau {
  const zeilen = csvLesen(text);
  const art = artErkennen(zeilen);
  const daten = zeilen.filter((z) => !istKopf(z));
  const neu: (string | number)[][] = [];
  const fehlerhaft: string[] = [];
  let doppelt = 0;

  if (art === 'kilometer') {
    const gesehen = new Set(vorhanden.kmStaende.map((k) => kmSchluessel(k.datum, k.km)));
    daten.forEach((z, i) => {
      const datum = datumLesen(z[0] ?? '');
      const km = kmLesen(z[1] ?? '');
      if (!datum || km == null) {
        fehlerhaft.push(`Zeile ${i + 1}: Datum oder Km unlesbar`);
        return;
      }
      const key = kmSchluessel(datum, km);
      if (gesehen.has(key)) {
        doppelt++;
        return;
      }
      gesehen.add(key);
      neu.push([datum, km]);
    });
    return { art, neu, doppelt, fehlerhaft };
  }

  const ids = new Set(vorhanden.eintraege.map((e) => e.id));
  // Rows without ID are matched on content instead
  const inhalt = (datum: string, km: number, positionId: string, aktion: string) => `${datum}|${km}|${positionId}|${aktion}`;
  const inhalte = new Set(vorhanden.eintraege.map((e) => inhalt(e.datum, e.km, e.positionId, e.aktion)));

  daten.forEach((z, i) => {
    const f = (n: number) => (z[n] ?? '').trim();
    const datum = datumLesen(f(1));
    const km = kmLesen(f(2));
    if (!datum || km == null) {
      fehlerhaft.push(`Zeile ${i + 1}: Datum oder Km unlesbar`);
      return;
    }
    const positionId = f(3) || 'sonstiges';
    const aktion: Aktion = (['I', 'R', 'T'] as const).find((a) => a === f(5).toUpperCase()) ?? 'I';
    const key = inhalt(datum, km, positionId, aktion);
    const id = f(0);
    if ((id && ids.has(id)) || (!id && inhalte.has(key))) {
      doppelt++;
      return;
    }
    const neueZeileId = id || neueId();
    ids.add(neueZeileId);
    inhalte.add(key);
    neu.push([neueZeileId, datum, km, positionId, f(4), aktion, f(6), kostenLesen(f(7)), f(8), f(9)]);
  });
  return { art, neu, doppelt, fehlerhaft };
}
