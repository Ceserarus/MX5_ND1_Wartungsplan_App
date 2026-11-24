import { useRef, useState } from 'react';
import type { Daten } from './google';
import { vorschauErstellen, type ImportArt, type ImportVorschau } from './csvImport';

const BLATT_NAME: Record<ImportArt, string> = { eintraege: 'Einträge', kilometer: 'Kilometer' };

interface Datei {
  name: string;
  vorschau: ImportVorschau;
}

/** "CSV importieren": pick files, preview what is new, then append to the sheet. */
export function CsvImport(props: {
  daten: Daten;
  onImportieren: (art: ImportArt, zeilen: (string | number)[][]) => Promise<void>;
}) {
  const eingabe = useRef<HTMLInputElement>(null);
  const [dateien, setDateien] = useState<Datei[]>([]);
  const [laeuft, setLaeuft] = useState(false);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);

  const auswaehlen = async (liste: FileList | null) => {
    setMeldung(null);
    setFehler(null);
    if (!liste?.length) return;
    try {
      const neu: Datei[] = [];
      for (const f of Array.from(liste)) {
        neu.push({ name: f.name, vorschau: vorschauErstellen(await f.text(), props.daten) });
      }
      setDateien(neu);
    } catch (e) {
      setFehler((e as Error).message);
    }
  };

  const importieren = async () => {
    setLaeuft(true);
    setFehler(null);
    try {
      const teile: string[] = [];
      for (const d of dateien) {
        await props.onImportieren(d.vorschau.art, d.vorschau.neu);
        teile.push(`${d.vorschau.neu.length} in „${BLATT_NAME[d.vorschau.art]}“`);
      }
      setMeldung(`Importiert: ${teile.join(', ')}.`);
      setDateien([]);
      if (eingabe.current) eingabe.current.value = '';
    } catch (e) {
      setFehler((e as Error).message);
    } finally {
      setLaeuft(false);
    }
  };

  const summeNeu = dateien.reduce((s, d) => s + d.vorschau.neu.length, 0);

  return (
    <>
      <h2>CSV importieren</h2>
      <p className="leise">
        Hängt Zeilen an die Blätter „Einträge“ oder „Kilometer“ an (gleiche Spaltenreihenfolge, Kopfzeile optional). Was
        schon im Wartungsbuch steht, wird übersprungen.
      </p>
      <input
        ref={eingabe}
        type="file"
        accept=".csv,text/csv,text/plain"
        multiple
        onChange={(e) => void auswaehlen(e.target.files)}
      />
      {dateien.map((d) => (
        <div key={d.name} className="hinweis">
          <strong>{d.name}</strong> → Blatt „{BLATT_NAME[d.vorschau.art]}“
          <br />
          {d.vorschau.neu.length} neu
          {d.vorschau.doppelt > 0 && `, ${d.vorschau.doppelt} schon vorhanden (werden übersprungen)`}
          {d.vorschau.fehlerhaft.length > 0 && (
            <>
              , {d.vorschau.fehlerhaft.length} unlesbar:
              <ul className="hinweisliste">
                {d.vorschau.fehlerhaft.slice(0, 5).map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      ))}
      {dateien.length > 0 && (
        <button type="button" className="primaer" disabled={laeuft || summeNeu === 0} onClick={() => void importieren()}>
          {laeuft ? 'Importiere …' : summeNeu === 0 ? 'Nichts Neues zu importieren' : `${summeNeu} Zeilen importieren`}
        </button>
      )}
      {meldung && <p className="hinweis">{meldung}</p>}
      {fehler && <p className="fehler">{fehler}</p>}
    </>
  );
}
