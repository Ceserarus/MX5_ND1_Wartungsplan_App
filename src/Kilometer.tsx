import { useMemo, useRef, useState } from 'react';
import { kmProJahr, kmVerlauf, type Jahr, type Punkt } from './km';
import type { Eintrag, KmStand } from './plan';

const kmFmt = (n: number) => Math.round(n).toLocaleString('de-DE') + ' km';
const datumFmt = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('de-DE');
const ms = (d: string) => Date.parse(d + 'T00:00:00Z');

const B = 640; // viewBox width
const H = 220; // viewBox height
const RAND = { links: 52, rechts: 12, oben: 12, unten: 26 };

function schoeneSkala(max: number, schritte = 4): number[] {
  if (max <= 0) return [0];
  const roh = max / schritte;
  const mag = 10 ** Math.floor(Math.log10(roh));
  const schritt = [1, 2, 2.5, 5, 10].map((f) => f * mag).find((s) => s >= roh)!;
  const werte: number[] = [];
  for (let v = 0; v <= max + schritt * 0.001; v += schritt) werte.push(v);
  if (werte[werte.length - 1] < max) werte.push(werte[werte.length - 1] + schritt);
  return werte;
}

const kurz = (n: number) => (n >= 1000 ? `${(n / 1000).toLocaleString('de-DE')} Tsd.` : String(n));

export function Kilometer({ kmStaende, eintraege }: { kmStaende: KmStand[]; eintraege: Eintrag[] }) {
  const verlauf = useMemo(() => kmVerlauf(kmStaende, eintraege), [kmStaende, eintraege]);
  const jahre = useMemo(() => kmProJahr(verlauf), [verlauf]);
  const [tabelle, setTabelle] = useState(false);

  if (verlauf.length < 2) {
    return (
      <>
        <h2>Kilometer</h2>
        <p>Sobald mindestens zwei Km-Stände erfasst sind, siehst du hier den Verlauf.</p>
      </>
    );
  }

  const erst = verlauf[0];
  const letzt = verlauf[verlauf.length - 1];
  const jahreGesamt = (ms(letzt.datum) - ms(erst.datum)) / (365.25 * 86_400_000);
  const schnitt = jahreGesamt > 0 ? (letzt.km - erst.km) / jahreGesamt : 0;

  return (
    <>
      <h2>Kilometer</h2>
      <div className="kennzahlen">
        <div className="karte kennzahl">
          <small>Aktuell</small>
          <strong>{kmFmt(letzt.km)}</strong>
        </div>
        <div className="karte kennzahl">
          <small>Ø pro Jahr</small>
          <strong>{kmFmt(schnitt)}</strong>
        </div>
      </div>

      <section className="karte diagramm">
        <h3>Km-Stand über die Zeit</h3>
        <Verlaufsdiagramm punkte={verlauf} />
      </section>

      <section className="karte diagramm">
        <h3>Gefahrene Km pro Jahr</h3>
        <Jahresdiagramm jahre={jahre} />
        {jahre.some((j) => j.teilweise) && <p className="klein">Heller: Jahr nur teilweise erfasst.</p>}
      </section>

      <button className="link" onClick={() => setTabelle(!tabelle)}>
        {tabelle ? 'Tabelle ausblenden' : 'Alle Km-Stände als Tabelle'}
      </button>
      {tabelle && (
        <table className="tabelle">
          <thead>
            <tr>
              <th>Datum</th>
              <th>Km-Stand</th>
            </tr>
          </thead>
          <tbody>
            {[...verlauf].reverse().map((p) => (
              <tr key={p.datum}>
                <td>{datumFmt(p.datum)}</td>
                <td>{kmFmt(p.km)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

function useHover() {
  const ref = useRef<SVGSVGElement>(null);
  const zuX = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect();
    return ((clientX - r.left) / r.width) * B;
  };
  return { ref, zuX };
}

function Verlaufsdiagramm({ punkte }: { punkte: Punkt[] }) {
  const { ref, zuX } = useHover();
  const [aktiv, setAktiv] = useState<number | null>(null);

  const t0 = ms(punkte[0].datum);
  const t1 = ms(punkte[punkte.length - 1].datum);
  const skala = schoeneSkala(punkte[punkte.length - 1].km);
  const yMax = skala[skala.length - 1];
  const x = (d: string) => RAND.links + ((ms(d) - t0) / (t1 - t0 || 1)) * (B - RAND.links - RAND.rechts);
  const y = (km: number) => H - RAND.unten - (km / yMax) * (H - RAND.oben - RAND.unten);

  const jahrTicks: number[] = [];
  for (let j = new Date(t0).getUTCFullYear() + 1; j <= new Date(t1).getUTCFullYear(); j++) jahrTicks.push(j);
  const jahrSchritt = Math.ceil(jahrTicks.length / 7);

  const pfad = punkte.map((p, i) => `${i ? 'L' : 'M'}${x(p.datum).toFixed(1)},${y(p.km).toFixed(1)}`).join(' ');
  const p = aktiv != null ? punkte[aktiv] : null;

  return (
    <div className="diagramm-flaeche">
      <svg
        ref={ref}
        viewBox={`0 0 ${B} ${H}`}
        role="img"
        aria-label={`Km-Stand von ${kmFmt(punkte[0].km)} bis ${kmFmt(punkte[punkte.length - 1].km)}`}
        onPointerMove={(e) => {
          const px = zuX(e.clientX);
          let best = 0;
          punkte.forEach((q, i) => {
            if (Math.abs(x(q.datum) - px) < Math.abs(x(punkte[best].datum) - px)) best = i;
          });
          setAktiv(best);
        }}
        onPointerLeave={() => setAktiv(null)}
      >
        {skala.map((v) => (
          <g key={v}>
            <line className="gitter" x1={RAND.links} x2={B - RAND.rechts} y1={y(v)} y2={y(v)} />
            <text className="achse" x={RAND.links - 6} y={y(v)} dy="0.32em" textAnchor="end">
              {kurz(v)}
            </text>
          </g>
        ))}
        {jahrTicks
          .filter((_, i) => i % jahrSchritt === 0)
          .map((j) => (
            <text key={j} className="achse" x={x(`${j}-01-01`)} y={H - 6} textAnchor="middle">
              {j}
            </text>
          ))}
        <path className="linie" d={pfad} />
        {punkte.map((q, i) => (
          <circle key={q.datum} className={`marker${i === aktiv ? ' aktiv' : ''}`} cx={x(q.datum)} cy={y(q.km)} r={i === aktiv ? 5 : 3} />
        ))}
        {p && <line className="fadenkreuz" x1={x(p.datum)} x2={x(p.datum)} y1={RAND.oben} y2={H - RAND.unten} />}
      </svg>
      {p && (
        <div className="tooltip" style={{ left: `${Math.min(88, Math.max(12, (x(p.datum) / B) * 100))}%` }}>
          <strong>{kmFmt(p.km)}</strong>
          <small>{datumFmt(p.datum)}</small>
        </div>
      )}
    </div>
  );
}

function Jahresdiagramm({ jahre }: { jahre: Jahr[] }) {
  const [aktiv, setAktiv] = useState<number | null>(null);
  const skala = schoeneSkala(Math.max(...jahre.map((j) => j.km), 1));
  const yMax = skala[skala.length - 1];
  const breite = (B - RAND.links - RAND.rechts) / jahre.length;
  const balken = Math.min(48, breite - 2);
  const y = (km: number) => H - RAND.unten - (km / yMax) * (H - RAND.oben - RAND.unten);
  const j = aktiv != null ? jahre[aktiv] : null;
  const cx = (i: number) => RAND.links + breite * i + breite / 2;

  return (
    <div className="diagramm-flaeche">
      <svg viewBox={`0 0 ${B} ${H}`} role="img" aria-label="Gefahrene Kilometer pro Kalenderjahr" onPointerLeave={() => setAktiv(null)}>
        {skala.map((v) => (
          <g key={v}>
            <line className="gitter" x1={RAND.links} x2={B - RAND.rechts} y1={y(v)} y2={y(v)} />
            <text className="achse" x={RAND.links - 6} y={y(v)} dy="0.32em" textAnchor="end">
              {kurz(v)}
            </text>
          </g>
        ))}
        {jahre.map((jj, i) => {
          const hoehe = Math.max(0, y(0) - y(jj.km));
          const r = Math.min(4, hoehe / 2);
          const x0 = cx(i) - balken / 2;
          const top = y(jj.km);
          // rounded top, square base
          const d = `M${x0},${y(0)} V${top + r} Q${x0},${top} ${x0 + r},${top} H${x0 + balken - r} Q${x0 + balken},${top} ${x0 + balken},${top + r} V${y(0)} Z`;
          return (
            <g key={jj.jahr} onPointerEnter={() => setAktiv(i)} onClick={() => setAktiv(i)}>
              <rect x={cx(i) - breite / 2} y={RAND.oben} width={breite} height={H - RAND.oben - RAND.unten} fill="transparent" />
              <path className={`balken${jj.teilweise ? ' teilweise' : ''}${i === aktiv ? ' aktiv' : ''}`} d={d} />
              {(jahre.length <= 10 || i % 2 === 0) && (
                <text className="achse" x={cx(i)} y={H - 6} textAnchor="middle">
                  {jj.jahr}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {j && (
        <div className="tooltip" style={{ left: `${Math.min(88, Math.max(12, (cx(aktiv!) / B) * 100))}%` }}>
          <strong>{kmFmt(j.km)}</strong>
          <small>
            {j.jahr}
            {j.teilweise ? ' (teilweise)' : ''}
          </small>
        </div>
      )}
    </div>
  );
}
