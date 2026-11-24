import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ablageVorbereiten,
  abmelden,
  anmelden,
  belegHochladen,
  belegLink,
  CLIENT_ID,
  datenLaden,
  eintragLoeschen,
  eintragSpeichern,
  fahrzeugSpeichern,
  kmSpeichern,
  notizLoeschen,
  notizSpeichern,
  ordnerLink,
  tabelleLink,
  warAngemeldet,
  zeilenImportieren,
  type Ablage,
  type Daten,
} from './google';
import {
  AKTION_TEXT,
  aktuellerKmStand,
  alleFaelligkeiten,
  POSITIONEN,
  type Aktion,
  type Eintrag,
  type Faelligkeit,
  type Position,
} from './plan';
import { kmImMonat } from './km';
import { Kilometer } from './Kilometer';
import { InfoBlatt } from './Info';
import { CsvImport } from './ImportCsv';

type Ansicht = 'uebersicht' | 'neu' | 'verlauf' | 'kilometer' | 'fahrzeug';

const heute = () => new Date().toISOString().slice(0, 10);
const kmFmt = (n: number) => n.toLocaleString('de-DE') + ' km';
const datumFmt = (d: string) => (d ? new Date(d + 'T00:00:00').toLocaleDateString('de-DE') : '–');
const eurFmt = (n: number) => n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });

function positionName(id: string): string {
  return POSITIONEN.find((p) => p.id === id)?.name ?? 'Sonstiges';
}

export default function App() {
  const [ablage, setAblage] = useState<Ablage | null>(null);
  const [daten, setDaten] = useState<Daten | null>(null);
  const [ansicht, setAnsicht] = useState<Ansicht>('uebersicht');
  const [laedt, setLaedt] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [vorauswahl, setVorauswahl] = useState<string | null>(null);
  const [info, setInfo] = useState<Position | null>(null);

  const laden = useCallback(async (prompt: '' | 'consent' | 'select_account' = '') => {
    setLaedt(true);
    setFehler(null);
    try {
      await anmelden(prompt);
      const a = await ablageVorbereiten();
      setAblage(a);
      setDaten(await datenLaden(a));
    } catch (e) {
      setFehler((e as Error).message);
    } finally {
      setLaedt(false);
    }
  }, []);

  const neuLaden = useCallback(async () => {
    if (!ablage) return;
    setDaten(await datenLaden(ablage));
  }, [ablage]);

  useEffect(() => {
    if (warAngemeldet() && CLIENT_ID) void laden('');
  }, [laden]);

  if (!CLIENT_ID) {
    return (
      <main className="leer">
        <h1>MX-5 Wartung</h1>
        <p>Es ist noch keine Google Client-ID hinterlegt. Siehe <code>docs/EINRICHTUNG.md</code>.</p>
      </main>
    );
  }

  if (!ablage || !daten) {
    return (
      <main className="leer">
        <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" width={96} height={96} />
        <h1>MX-5 Wartung</h1>
        <p>Dein Wartungsbuch liegt in deinem Google Drive im Ordner „MX-5 Wartung“. Die App sieht nur diesen Ordner.</p>
        <button className="primaer" onClick={() => laden('select_account')} disabled={laedt}>
          {laedt ? 'Lade …' : 'Mit Google anmelden'}
        </button>
        {fehler && <p className="fehler">{fehler}</p>}
      </main>
    );
  }

  const kmAktuell = aktuellerKmStand(daten.kmStaende, daten.eintraege);
  const erstzulassung = daten.fahrzeug['Erstzulassung'] || null;

  return (
    <div className="app">
      <header>
        <div>
          <h1>MX-5 Wartung</h1>
          <span className="unterzeile">{daten.fahrzeug['Modell'] || 'Mazda MX-5'}</span>
        </div>
        <div className="km-chip">{kmAktuell != null ? kmFmt(kmAktuell) : 'Km-Stand fehlt'}</div>
      </header>

      {fehler && (
        <p className="fehler" onClick={() => setFehler(null)}>
          {fehler}
        </p>
      )}

      <main>
        {ansicht === 'uebersicht' && (
          <Uebersicht
            daten={daten}
            kmAktuell={kmAktuell}
            erstzulassung={erstzulassung}
            onKm={async (km) => {
              try {
                await kmSpeichern(ablage, { datum: heute(), km });
                await neuLaden();
              } catch (e) {
                setFehler((e as Error).message);
              }
            }}
            onErfassen={(id) => {
              setVorauswahl(id);
              setAnsicht('neu');
            }}
            onFahrzeug={() => setAnsicht('fahrzeug')}
            onInfo={setInfo}
          />
        )}
        {ansicht === 'neu' && (
          <NeuerEintrag
            key={vorauswahl ?? 'neu'}
            vorauswahl={vorauswahl}
            kmAktuell={kmAktuell}
            onSpeichern={async (e, dateien) => {
              const belege: string[] = [];
              for (const [i, d] of dateien.entries()) {
                const endung = d.name.includes('.') ? d.name.slice(d.name.lastIndexOf('.')) : '';
                belege.push(await belegHochladen(ablage, d, `${e.datum} ${positionName(e.positionId)} ${i + 1}${endung}`));
              }
              await eintragSpeichern(ablage, { ...e, belege }, positionName(e.positionId));
              await neuLaden();
              setVorauswahl(null);
              setAnsicht('uebersicht');
            }}
            onAbbrechen={() => {
              setVorauswahl(null);
              setAnsicht('uebersicht');
            }}
          />
        )}
        {ansicht === 'verlauf' && (
          <Verlauf
            eintraege={daten.eintraege}
            onLoeschen={async (id) => {
              try {
                await eintragLoeschen(ablage, id);
                await neuLaden();
              } catch (e) {
                setFehler((e as Error).message);
              }
            }}
          />
        )}
        {ansicht === 'kilometer' && <Kilometer kmStaende={daten.kmStaende} eintraege={daten.eintraege} />}
        {ansicht === 'fahrzeug' && (
          <Fahrzeug
            ablage={ablage}
            fahrzeug={daten.fahrzeug}
            daten={daten}
            onImportieren={async (art, zeilen) => {
              await zeilenImportieren(ablage, art, zeilen);
              await neuLaden();
            }}
            onSpeichern={async (werte) => {
              await fahrzeugSpeichern(ablage, { ...daten.fahrzeug, ...werte });
              await neuLaden();
              setAnsicht('uebersicht');
            }}
            onAbmelden={() => {
              abmelden();
              setAblage(null);
              setDaten(null);
            }}
          />
        )}
      </main>

      {info && (
        <InfoBlatt
          key={info.id}
          position={info}
          notizen={daten.notizen}
          onSpeichern={async (n) => {
            await notizSpeichern(ablage, n);
            await neuLaden();
          }}
          onLoeschen={async (id) => {
            await notizLoeschen(ablage, id);
            await neuLaden();
          }}
          onSchliessen={() => setInfo(null)}
        />
      )}

      <nav>
        <button className={ansicht === 'uebersicht' ? 'aktiv' : ''} onClick={() => setAnsicht('uebersicht')}>
          Übersicht
        </button>
        <button
          className={ansicht === 'neu' ? 'aktiv' : ''}
          onClick={() => {
            setVorauswahl(null);
            setAnsicht('neu');
          }}
        >
          + Eintrag
        </button>
        <button className={ansicht === 'verlauf' ? 'aktiv' : ''} onClick={() => setAnsicht('verlauf')}>
          Verlauf
        </button>
        <button className={ansicht === 'kilometer' ? 'aktiv' : ''} onClick={() => setAnsicht('kilometer')}>
          Km
        </button>
        <button className={ansicht === 'fahrzeug' ? 'aktiv' : ''} onClick={() => setAnsicht('fahrzeug')}>
          Fahrzeug
        </button>
      </nav>
    </div>
  );
}

// ---------- Übersicht ----------

function Uebersicht(props: {
  daten: Daten;
  kmAktuell: number | null;
  erstzulassung: string | null;
  onKm: (km: number) => Promise<void>;
  onErfassen: (positionId: string) => void;
  onFahrzeug: () => void;
  onInfo: (p: Position) => void;
}) {
  const { daten, kmAktuell, erstzulassung } = props;
  const [km, setKm] = useState('');
  const [speichert, setSpeichert] = useState(false);
  const liste = useMemo(
    () => alleFaelligkeiten(daten.eintraege, kmAktuell, heute(), erstzulassung),
    [daten.eintraege, kmAktuell, erstzulassung],
  );
  const offen = liste.filter((f) => f.status === 'ueberfaellig' || f.status === 'bald').length;
  const monatFehlt = !kmImMonat(daten.kmStaende, heute());
  const monatName = new Date().toLocaleDateString('de-DE', { month: 'long' });

  return (
    <>
      {!erstzulassung && (
        <div className="hinweis">
          Trag unter <button className="link" onClick={props.onFahrzeug}>Fahrzeug</button> die Erstzulassung ein. Dann
          kann die App auch Positionen ohne bisherigen Eintrag berechnen.
        </div>
      )}

      <form
        className={`karte km-form${monatFehlt ? ' erinnerung' : ''}`}
        onSubmit={async (e) => {
          e.preventDefault();
          const wert = Number(km.replace(/\./g, ''));
          if (!wert) return;
          setSpeichert(true);
          await props.onKm(wert);
          setSpeichert(false);
          setKm('');
        }}
      >
        <label htmlFor="km">{monatFehlt ? `Km-Stand für ${monatName} fehlt noch` : 'Aktueller Km-Stand'}</label>
        <div className="zeile">
          <input
            id="km"
            inputMode="numeric"
            placeholder={kmAktuell != null ? String(kmAktuell) : 'z. B. 45000'}
            value={km}
            onChange={(e) => setKm(e.target.value)}
          />
          <button className="primaer" disabled={speichert || !km}>
            Speichern
          </button>
        </div>
      </form>

      <h2>{offen ? `${offen} ${offen === 1 ? 'Punkt' : 'Punkte'} fällig oder bald fällig` : 'Alles im grünen Bereich'}</h2>
      <ul className="liste">
        {liste.map((f) => (
          <FaelligkeitZeile
            key={f.position.id}
            f={f}
            hatEigenes={daten.notizen.some((n) => n.positionId === f.position.id && (n.typ === 'link' || n.inhalt.trim()))}
            onErfassen={() => props.onErfassen(f.position.id)}
            onInfo={() => props.onInfo(f.position)}
          />
        ))}
      </ul>
    </>
  );
}

const STATUS_TEXT: Record<Faelligkeit['status'], string> = {
  ueberfaellig: 'Überfällig',
  bald: 'Bald fällig',
  ok: 'OK',
  unbekannt: 'Unbekannt',
};

function FaelligkeitZeile({
  f,
  hatEigenes,
  onErfassen,
  onInfo,
}: {
  f: Faelligkeit;
  hatEigenes: boolean;
  onErfassen: () => void;
  onInfo: () => void;
}) {
  const [offen, setOffen] = useState(false);
  const teile: string[] = [];
  if (f.restKm != null) teile.push(f.restKm <= 0 ? `seit ${kmFmt(-f.restKm)}` : `in ${kmFmt(f.restKm)}`);
  if (f.restTage != null) {
    const monate = Math.round(f.restTage / 30.4);
    teile.push(
      f.restTage <= 0
        ? `seit ${Math.abs(monate) || 1} Mon.`
        : f.restTage < 60
          ? `in ${f.restTage} Tagen`
          : `in ${monate} Mon.`,
    );
  }
  return (
    <li className={`karte status-${f.status}`}>
      <div className="zeilenkopf-wrap">
        <button className="zeilenkopf" onClick={() => setOffen(!offen)} aria-expanded={offen}>
          <span className="punkt" aria-hidden />
          <span className="titel">
            <strong>{f.position.name}</strong>
            <small>
              {AKTION_TEXT[f.position.aktion]} · {teile.join(' oder ') || 'kein Intervall berechenbar'}
            </small>
          </span>
          <span className="badge">{STATUS_TEXT[f.status]}</span>
        </button>
        <button
          className={`info-knopf${hatEigenes ? ' hat-eigenes' : ''}`}
          onClick={onInfo}
          aria-label={`Anleitung und Notizen: ${f.position.name}`}
          title="Anleitung und Notizen"
        >
          i
        </button>
      </div>
      {offen && (
        <div className="details">
          <p>
            Intervall:{' '}
            {[f.position.km && kmFmt(f.position.km), f.position.monate && `${f.position.monate} Monate`]
              .filter(Boolean)
              .join(' / ')}
          </p>
          <p>
            Zuletzt:{' '}
            {f.letzter ? `${datumFmt(f.letzter.datum)} bei ${kmFmt(f.letzter.km)}` : 'noch kein Eintrag'}
          </p>
          <p>
            Fällig: {[f.faelligKm != null && kmFmt(f.faelligKm), f.faelligDatum && datumFmt(f.faelligDatum)].filter(Boolean).join(' oder ') || '–'}
          </p>
          {f.position.hinweis && <p className="klein">{f.position.hinweis}</p>}
          <button className="primaer" onClick={onErfassen}>
            Erledigt eintragen
          </button>
        </div>
      )}
    </li>
  );
}

// ---------- Neuer Eintrag ----------

function NeuerEintrag(props: {
  vorauswahl: string | null;
  kmAktuell: number | null;
  onSpeichern: (e: Eintrag, dateien: File[]) => Promise<void>;
  onAbbrechen: () => void;
}) {
  const start = POSITIONEN.find((p) => p.id === props.vorauswahl);
  const [positionId, setPositionId] = useState(start?.id ?? POSITIONEN[0].id);
  const [aktion, setAktion] = useState<Aktion>(start?.aktion ?? POSITIONEN[0].aktion);
  const [datum, setDatum] = useState(heute());
  const [km, setKm] = useState(props.kmAktuell != null ? String(props.kmAktuell) : '');
  const [teile, setTeile] = useState('');
  const [kosten, setKosten] = useState('');
  const [notiz, setNotiz] = useState('');
  const [dateien, setDateien] = useState<File[]>([]);
  const [speichert, setSpeichert] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  return (
    <form
      className="formular"
      onSubmit={async (ev) => {
        ev.preventDefault();
        const kmWert = Number(km.replace(/\./g, ''));
        if (!kmWert) {
          setFehler('Bitte den Km-Stand eintragen.');
          return;
        }
        setSpeichert(true);
        setFehler(null);
        try {
          await props.onSpeichern(
            {
              id: crypto.randomUUID(),
              datum,
              km: kmWert,
              positionId,
              aktion,
              teile: teile.trim(),
              kosten: kosten ? Number(kosten.replace(',', '.')) : null,
              notiz: notiz.trim(),
              belege: [],
            },
            dateien,
          );
        } catch (e) {
          setFehler((e as Error).message);
          setSpeichert(false);
        }
      }}
    >
      <h2>Wartung eintragen</h2>

      <label>
        Position
        <select
          value={positionId}
          onChange={(e) => {
            setPositionId(e.target.value);
            const p = POSITIONEN.find((x) => x.id === e.target.value);
            if (p) setAktion(p.aktion);
          }}
        >
          {POSITIONEN.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
          <option value="sonstiges">Sonstiges</option>
        </select>
      </label>

      <fieldset className="segmente">
        <legend>Was wurde gemacht?</legend>
        {(Object.keys(AKTION_TEXT) as Aktion[]).map((a) => (
          <label key={a} className={aktion === a ? 'aktiv' : ''}>
            <input type="radio" name="aktion" value={a} checked={aktion === a} onChange={() => setAktion(a)} />
            {a === 'I' ? 'Geprüft' : a === 'R' ? 'Getauscht' : 'Nachgezogen'}
          </label>
        ))}
      </fieldset>

      <div className="zwei">
        <label>
          Datum
          <input type="date" value={datum} onChange={(e) => setDatum(e.target.value)} required />
        </label>
        <label>
          Km-Stand
          <input inputMode="numeric" value={km} onChange={(e) => setKm(e.target.value)} required />
        </label>
      </div>

      <label>
        Teile / Material
        <input value={teile} onChange={(e) => setTeile(e.target.value)} placeholder="z. B. Castrol Edge 0W-20, 4,2 l; Ölfilter PE01-14-302A" />
      </label>

      <label>
        Kosten (€)
        <input inputMode="decimal" value={kosten} onChange={(e) => setKosten(e.target.value)} placeholder="optional" />
      </label>

      <label>
        Notiz
        <textarea value={notiz} onChange={(e) => setNotiz(e.target.value)} rows={3} placeholder="Befund, Drehmomente, Auffälligkeiten …" />
      </label>

      <label>
        Belege (Foto oder PDF)
        <input
          type="file"
          accept="image/*,application/pdf"
          multiple
          onChange={(e) => setDateien(Array.from(e.target.files ?? []))}
        />
      </label>
      {dateien.length > 0 && <p className="klein">{dateien.length} Datei(en) werden in „Belege“ gespeichert.</p>}

      {fehler && <p className="fehler">{fehler}</p>}

      <div className="zeile">
        <button type="button" onClick={props.onAbbrechen} disabled={speichert}>
          Abbrechen
        </button>
        <button className="primaer" disabled={speichert}>
          {speichert ? 'Speichere …' : 'Speichern'}
        </button>
      </div>
    </form>
  );
}

// ---------- Verlauf ----------

function Verlauf({ eintraege, onLoeschen }: { eintraege: Eintrag[]; onLoeschen: (id: string) => Promise<void> }) {
  const [filter, setFilter] = useState('alle');
  const liste = useMemo(
    () =>
      eintraege
        .filter((e) => filter === 'alle' || e.positionId === filter)
        .sort((a, b) => b.datum.localeCompare(a.datum) || b.km - a.km),
    [eintraege, filter],
  );
  const summe = liste.reduce((s, e) => s + (e.kosten ?? 0), 0);

  return (
    <>
      <h2>Verlauf</h2>
      <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter">
        <option value="alle">Alle Positionen</option>
        {POSITIONEN.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
        <option value="sonstiges">Sonstiges</option>
      </select>
      <p className="klein">
        {liste.length} Einträge{summe > 0 && ` · Kosten gesamt ${eurFmt(summe)}`}
      </p>
      {liste.length === 0 && <p>Noch keine Einträge.</p>}
      <ul className="liste">
        {liste.map((e) => (
          <li key={e.id} className="karte eintrag">
            <div className="eintrag-kopf">
              <strong>{positionName(e.positionId)}</strong>
              <span className="badge neutral">{e.aktion === 'I' ? 'Geprüft' : e.aktion === 'R' ? 'Getauscht' : 'Nachgezogen'}</span>
            </div>
            <small>
              {datumFmt(e.datum)} · {kmFmt(e.km)}
              {e.kosten != null && ` · ${eurFmt(e.kosten)}`}
            </small>
            {e.teile && <p>{e.teile}</p>}
            {e.notiz && <p className="klein">{e.notiz}</p>}
            <div className="zeile klein">
              {e.belege.map((b, i) => (
                <a key={b} href={belegLink(b)} target="_blank" rel="noreferrer">
                  Beleg {i + 1}
                </a>
              ))}
              <button
                className="link gefahr"
                onClick={() => {
                  if (confirm('Eintrag löschen? Belege bleiben im Drive erhalten.')) void onLoeschen(e.id);
                }}
              >
                Löschen
              </button>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

// ---------- Fahrzeug ----------

const FAHRZEUG_FELDER: { key: string; label: string; typ?: string; placeholder?: string }[] = [
  { key: 'Modell', label: 'Modell', placeholder: 'z. B. MX-5 2.0, Schaltgetriebe' },
  { key: 'Erstzulassung', label: 'Erstzulassung', typ: 'date' },
  { key: 'Kennzeichen', label: 'Kennzeichen' },
  { key: 'FIN', label: 'Fahrgestellnummer (FIN)' },
  { key: 'Öl', label: 'Motoröl (Sorte, Menge)', placeholder: 'z. B. 0W-20, ca. 4,2 l mit Filter' },
];

function Fahrzeug(props: {
  ablage: Ablage;
  fahrzeug: Record<string, string>;
  daten: Daten;
  onImportieren: (art: 'eintraege' | 'kilometer', zeilen: (string | number)[][]) => Promise<void>;
  onSpeichern: (werte: Record<string, string>) => Promise<void>;
  onAbmelden: () => void;
}) {
  const [werte, setWerte] = useState<Record<string, string>>(() =>
    Object.fromEntries(FAHRZEUG_FELDER.map((f) => [f.key, props.fahrzeug[f.key] ?? ''])),
  );
  const [speichert, setSpeichert] = useState(false);
  return (
    <form
      className="formular"
      onSubmit={async (e) => {
        e.preventDefault();
        setSpeichert(true);
        await props.onSpeichern(werte);
        setSpeichert(false);
      }}
    >
      <h2>Fahrzeug</h2>
      {FAHRZEUG_FELDER.map((f) => (
        <label key={f.key}>
          {f.label}
          <input
            type={f.typ ?? 'text'}
            value={werte[f.key]}
            placeholder={f.placeholder}
            onChange={(e) => setWerte({ ...werte, [f.key]: e.target.value })}
          />
        </label>
      ))}
      <button className="primaer" disabled={speichert}>
        {speichert ? 'Speichere …' : 'Speichern'}
      </button>

      <h2>Deine Daten in Google Drive</h2>
      <p className="zeile">
        <a href={tabelleLink(props.ablage.tabelleId)} target="_blank" rel="noreferrer">
          Wartungsbuch (Tabelle)
        </a>
        <a href={ordnerLink(props.ablage.ordnerId)} target="_blank" rel="noreferrer">
          Ordner öffnen
        </a>
      </p>
      <CsvImport daten={props.daten} onImportieren={props.onImportieren} />
      <button type="button" onClick={props.onAbmelden}>
        Abmelden
      </button>
    </form>
  );
}
