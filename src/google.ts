/**
 * Google login (Google Identity Services) and storage in the user's own Drive.
 *
 * Scope drive.file: the app only sees files it created itself, never the rest of the Drive.
 * Layout in Drive:
 *   MX-5 Wartung/            (folder)
 *     MX-5 Wartungsbuch      (Google Sheet: Einträge, Kilometer, Fahrzeug)
 *     Belege/                (folder with photos/PDFs)
 */
import type { Aktion, Eintrag, KmStand } from './plan';

const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const ORDNER_NAME = 'MX-5 Wartung';
const BELEGE_NAME = 'Belege';
const TABELLE_NAME = 'MX-5 Wartungsbuch';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const SHEET_MIME = 'application/vnd.google-apps.spreadsheet';

const BLATT_EINTRAEGE = 'Einträge';
const BLATT_KM = 'Kilometer';
const BLATT_FAHRZEUG = 'Fahrzeug';
const BLATT_NOTIZEN = 'Notizen';

const KOPF_EINTRAEGE = ['ID', 'Datum', 'Km', 'PositionId', 'Position', 'Aktion', 'Teile', 'Kosten (€)', 'Notiz', 'Belege'];
const KOPF_KM = ['Datum', 'Km'];
const KOPF_FAHRZEUG = ['Feld', 'Wert'];
const KOPF_NOTIZEN = ['ID', 'PositionId', 'Typ', 'Titel', 'Inhalt'];

const BLAETTER: [string, string[]][] = [
  [BLATT_EINTRAEGE, KOPF_EINTRAEGE],
  [BLATT_KM, KOPF_KM],
  [BLATT_FAHRZEUG, KOPF_FAHRZEUG],
  [BLATT_NOTIZEN, KOPF_NOTIZEN],
];

// ---------- Auth ----------

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
}

interface TokenClient {
  callback: (r: TokenResponse) => void;
  requestAccessToken: (opts?: { prompt?: string }) => void;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (cfg: {
            client_id: string;
            scope: string;
            callback: (r: TokenResponse) => void;
          }) => TokenClient;
          revoke: (token: string, done?: () => void) => void;
        };
      };
    };
  }
}

let tokenClient: TokenClient | null = null;
let accessToken: string | null = null;
let ablaufZeit = 0;

export const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

function warteAufGis(): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      if (window.google?.accounts?.oauth2) resolve();
      else if (Date.now() - start > 10_000) reject(new Error('Google-Anmeldung konnte nicht geladen werden. Bist du online?'));
      else setTimeout(check, 100);
    };
    check();
  });
}

/** Opens the Google login (prompt '' = silent if already consented). */
export async function anmelden(prompt: '' | 'consent' | 'select_account' = ''): Promise<void> {
  if (!CLIENT_ID) throw new Error('Keine Google Client-ID konfiguriert (VITE_GOOGLE_CLIENT_ID).');
  await warteAufGis();
  return new Promise((resolve, reject) => {
    if (!tokenClient) {
      tokenClient = window.google!.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPE,
        callback: () => {},
      });
    }
    tokenClient.callback = (r) => {
      if (r.error || !r.access_token) {
        reject(new Error(r.error ?? 'Anmeldung abgebrochen'));
        return;
      }
      accessToken = r.access_token;
      ablaufZeit = Date.now() + (r.expires_in ?? 3600) * 1000 - 60_000;
      try {
        localStorage.setItem('mx5-angemeldet', '1');
      } catch {
        /* ignore */
      }
      resolve();
    };
    tokenClient.requestAccessToken({ prompt });
  });
}

export function abmelden(): void {
  if (accessToken) window.google?.accounts.oauth2.revoke(accessToken);
  accessToken = null;
  ablaufZeit = 0;
  try {
    localStorage.removeItem('mx5-angemeldet');
  } catch {
    /* ignore */
  }
}

export function warAngemeldet(): boolean {
  try {
    return localStorage.getItem('mx5-angemeldet') === '1';
  } catch {
    return false;
  }
}

async function token(): Promise<string> {
  if (!accessToken || Date.now() > ablaufZeit) await anmelden('');
  return accessToken!;
}

async function api<T>(url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${await token()}`, ...(init.headers ?? {}) },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google-Fehler ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

const json = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

// ---------- Drive ----------

interface DriveFile {
  id: string;
  name: string;
  mimeType?: string;
  webViewLink?: string;
}

async function sucheDatei(q: string): Promise<DriveFile | undefined> {
  const params = new URLSearchParams({ q: `${q} and trashed=false`, fields: 'files(id,name)', spaces: 'drive' });
  const r = await api<{ files: DriveFile[] }>(`https://www.googleapis.com/drive/v3/files?${params}`);
  return r.files[0];
}

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

async function ordnerHolen(name: string, parent?: string): Promise<string> {
  const q = `name='${esc(name)}' and mimeType='${FOLDER_MIME}'` + (parent ? ` and '${parent}' in parents` : '');
  const found = await sucheDatei(q);
  if (found) return found.id;
  const created = await api<DriveFile>(
    'https://www.googleapis.com/drive/v3/files?fields=id',
    json({ name, mimeType: FOLDER_MIME, parents: parent ? [parent] : undefined }),
  );
  return created.id;
}

export interface Ablage {
  ordnerId: string;
  belegeId: string;
  tabelleId: string;
  blattIds: Record<string, number>;
}

/** Finds or creates folder, receipts folder and spreadsheet. */
export async function ablageVorbereiten(): Promise<Ablage> {
  const ordnerId = await ordnerHolen(ORDNER_NAME);
  const belegeId = await ordnerHolen(BELEGE_NAME, ordnerId);

  let tabelle = await sucheDatei(`'${ordnerId}' in parents and mimeType='${SHEET_MIME}'`);
  if (!tabelle) {
    const created = await api<{ spreadsheetId: string }>(
      'https://sheets.googleapis.com/v4/spreadsheets',
      json({
        properties: { title: TABELLE_NAME, locale: 'de_DE' },
        sheets: BLAETTER.map(([titel, kopf]) => blattMitKopf(titel, kopf)),
      }),
    );
    // Move the sheet into our folder
    await api(
      `https://www.googleapis.com/drive/v3/files/${created.spreadsheetId}?addParents=${ordnerId}&removeParents=root&fields=id`,
      { method: 'PATCH' },
    );
    tabelle = { id: created.spreadsheetId, name: TABELLE_NAME };
  }

  const blattIds = await blattIdsLaden(tabelle.id);

  // Sheets added in later app versions are created in existing spreadsheets on the fly
  const fehlend = BLAETTER.filter(([titel]) => !(titel in blattIds));
  if (fehlend.length) {
    await api(
      `https://sheets.googleapis.com/v4/spreadsheets/${tabelle.id}:batchUpdate`,
      json({
        requests: fehlend.flatMap(([titel, kopf]) => {
          const b = blattMitKopf(titel, kopf);
          return [{ addSheet: { properties: b.properties } }];
        }),
      }),
    );
    for (const [titel, kopf] of fehlend) {
      await api(
        `https://sheets.googleapis.com/v4/spreadsheets/${tabelle.id}/values/${encodeURIComponent(`'${titel}'!A1`)}?valueInputOption=RAW`,
        { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ values: [kopf] }) },
      );
    }
    Object.assign(blattIds, await blattIdsLaden(tabelle.id));
  }
  return { ordnerId, belegeId, tabelleId: tabelle.id, blattIds };
}

async function blattIdsLaden(tabelleId: string): Promise<Record<string, number>> {
  const meta = await api<{ sheets: { properties: { sheetId: number; title: string } }[] }>(
    `https://sheets.googleapis.com/v4/spreadsheets/${tabelleId}?fields=sheets.properties(sheetId,title)`,
  );
  return Object.fromEntries(meta.sheets.map((s) => [s.properties.title, s.properties.sheetId]));
}

function blattMitKopf(title: string, kopf: string[]) {
  return {
    properties: { title, gridProperties: { frozenRowCount: 1 } },
    data: [{ startRow: 0, startColumn: 0, rowData: [{ values: kopf.map((k) => ({ userEnteredValue: { stringValue: k }, userEnteredFormat: { textFormat: { bold: true } } })) }] }],
  };
}

// ---------- Sheets ----------

export interface EigeneNotiz {
  id: string;
  positionId: string;
  typ: 'notiz' | 'link';
  titel: string;
  inhalt: string; // note text or URL
}

export interface Daten {
  eintraege: Eintrag[];
  kmStaende: KmStand[];
  fahrzeug: Record<string, string>;
  notizen: EigeneNotiz[];
}

/** Dates typed directly into the sheet come back as serial numbers. */
const datum = (v: unknown): string => {
  if (typeof v === 'number') return new Date(Date.UTC(1899, 11, 30) + v * 86_400_000).toISOString().slice(0, 10);
  return String(v ?? '');
};

const num = (v: unknown): number | null => {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v === 'number') return v;
  const n = Number(String(v).replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

export async function datenLaden(ablage: Ablage): Promise<Daten> {
  const ranges = [BLATT_EINTRAEGE, BLATT_KM, BLATT_FAHRZEUG, BLATT_NOTIZEN].map((b) => `ranges=${encodeURIComponent(`'${b}'!A2:J`)}`).join('&');
  const r = await api<{ valueRanges: { values?: (string | number)[][] }[] }>(
    `https://sheets.googleapis.com/v4/spreadsheets/${ablage.tabelleId}/values:batchGet?${ranges}&valueRenderOption=UNFORMATTED_VALUE`,
  );
  const [e, k, f, n] = r.valueRanges.map((v) => v.values ?? []);
  return {
    eintraege: e
      .filter((row) => row[0])
      .map((row) => ({
        id: String(row[0]),
        datum: datum(row[1]),
        km: num(row[2]) ?? 0,
        positionId: String(row[3] ?? 'sonstiges'),
        aktion: (String(row[5] ?? 'I') as Aktion) || 'I',
        teile: String(row[6] ?? ''),
        kosten: num(row[7]),
        notiz: String(row[8] ?? ''),
        belege: String(row[9] ?? '').split(',').map((s) => s.trim()).filter(Boolean),
      })),
    kmStaende: k.filter((row) => row[0] && num(row[1]) != null).map((row) => ({ datum: datum(row[0]), km: num(row[1])! })),
    fahrzeug: Object.fromEntries(f.filter((row) => row[0]).map((row) => [String(row[0]), String(row[1] ?? '')])),
    notizen: (n ?? [])
      .filter((row) => row[0] && row[1])
      .map((row) => ({
        id: String(row[0]),
        positionId: String(row[1]),
        typ: String(row[2]) === 'link' ? 'link' : 'notiz',
        titel: String(row[3] ?? ''),
        inhalt: String(row[4] ?? ''),
      })),
  };
}

async function anhaengen(ablage: Ablage, blatt: string, zeile: (string | number)[]) {
  await api(
    `https://sheets.googleapis.com/v4/spreadsheets/${ablage.tabelleId}/values/${encodeURIComponent(`'${blatt}'!A1`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    json({ values: [zeile] }),
  );
}

export async function eintragSpeichern(ablage: Ablage, e: Eintrag, positionName: string): Promise<void> {
  await anhaengen(ablage, BLATT_EINTRAEGE, [
    e.id, e.datum, e.km, e.positionId, positionName, e.aktion, e.teile, e.kosten ?? '', e.notiz, e.belege.join(','),
  ]);
}

/** Appends many rows at once (CSV import). */
export async function zeilenImportieren(ablage: Ablage, art: 'eintraege' | 'kilometer', zeilen: (string | number)[][]): Promise<void> {
  if (!zeilen.length) return;
  await api(
    `https://sheets.googleapis.com/v4/spreadsheets/${ablage.tabelleId}/values/${encodeURIComponent(`'${art === 'eintraege' ? BLATT_EINTRAEGE : BLATT_KM}'!A1`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    json({ values: zeilen }),
  );
}

export async function kmSpeichern(ablage: Ablage, k: KmStand): Promise<void> {
  await anhaengen(ablage, BLATT_KM, [k.datum, k.km]);
}

export async function fahrzeugSpeichern(ablage: Ablage, werte: Record<string, string>): Promise<void> {
  const zeilen = Object.entries(werte);
  await api(
    `https://sheets.googleapis.com/v4/spreadsheets/${ablage.tabelleId}/values:batchUpdate`,
    json({
      valueInputOption: 'RAW',
      data: [{ range: `'${BLATT_FAHRZEUG}'!A2:B${zeilen.length + 1}`, values: zeilen }],
    }),
  );
}

/** Row index (0-based, header = 0) of the row whose column A equals id, or -1. */
async function zeileFinden(ablage: Ablage, blatt: string, id: string): Promise<number> {
  const r = await api<{ values?: string[][] }>(
    `https://sheets.googleapis.com/v4/spreadsheets/${ablage.tabelleId}/values/${encodeURIComponent(`'${blatt}'!A:A`)}`,
  );
  const index = (r.values ?? []).findIndex((row) => row[0] === id);
  return index < 1 ? -1 : index;
}

export const eintragLoeschen = (ablage: Ablage, id: string) => zeileLoeschen(ablage, BLATT_EINTRAEGE, id);

/** Create or replace a note/link row (matched by id). */
export async function notizSpeichern(ablage: Ablage, n: EigeneNotiz): Promise<void> {
  const zeile = [n.id, n.positionId, n.typ, n.titel, n.inhalt];
  const index = await zeileFinden(ablage, BLATT_NOTIZEN, n.id);
  if (index < 0) {
    await anhaengen(ablage, BLATT_NOTIZEN, zeile);
    return;
  }
  await api(
    `https://sheets.googleapis.com/v4/spreadsheets/${ablage.tabelleId}/values/${encodeURIComponent(`'${BLATT_NOTIZEN}'!A${index + 1}:E${index + 1}`)}?valueInputOption=RAW`,
    { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ values: [zeile] }) },
  );
}

export const notizLoeschen = (ablage: Ablage, id: string) => zeileLoeschen(ablage, BLATT_NOTIZEN, id);

async function zeileLoeschen(ablage: Ablage, blatt: string, id: string): Promise<void> {
  const index = await zeileFinden(ablage, blatt, id);
  if (index < 0) return;
  await api(
    `https://sheets.googleapis.com/v4/spreadsheets/${ablage.tabelleId}:batchUpdate`,
    json({
      requests: [
        { deleteDimension: { range: { sheetId: ablage.blattIds[blatt], dimension: 'ROWS', startIndex: index, endIndex: index + 1 } } },
      ],
    }),
  );
}

// ---------- Belege ----------

export async function belegHochladen(ablage: Ablage, datei: File, name: string): Promise<string> {
  const grenze = 'mx5-' + Math.random().toString(36).slice(2);
  const meta = { name, parents: [ablage.belegeId] };
  const body = new Blob([
    `--${grenze}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n`,
    `--${grenze}\r\nContent-Type: ${datei.type || 'application/octet-stream'}\r\n\r\n`,
    datei,
    `\r\n--${grenze}--`,
  ]);
  const r = await api<DriveFile>('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${grenze}` },
    body,
  });
  return r.id;
}

export const belegLink = (id: string) => `https://drive.google.com/file/d/${id}/view`;
export const tabelleLink = (id: string) => `https://docs.google.com/spreadsheets/d/${id}/edit`;
export const ordnerLink = (id: string) => `https://drive.google.com/drive/folders/${id}`;
