import { useEffect, useRef, useState } from 'react';
import anleitungen from './anleitungen.json';
import type { EigeneNotiz } from './google';
import type { Position } from './plan';

interface Link {
  titel: string;
  url: string;
  typ: string;
}

interface Anleitung {
  anleitung_status: string;
  daten: Record<string, unknown>;
  links: Link[];
  hinweise?: string[] | null;
}

const ANLEITUNGEN = anleitungen.positionen as Record<string, Anleitung>;

const LABEL: Record<string, string> = {
  ablassschraube_dichtring: 'Dichtring Ablassschraube',
  anzugsmoment: 'Anzugsmoment',
  anzugsmomente: 'Anzugsmomente',
  batterietyp: 'Batterietyp',
  elektrodenabstand_mm: 'Elektrodenabstand (mm)',
  entlueftung: 'Entlüftung',
  entlueftungsreihenfolge: 'Entlüftungsreihenfolge',
  gewinde: 'Gewinde',
  kuehlmittel: 'Kühlmittel',
  luftdruck_sommer_bar: 'Luftdruck Sommer (bar)',
  luftdruck_winter_bar: 'Luftdruck Winter (bar)',
  menge: 'Menge',
  menge_2_0_schalter_lhd_l: 'Menge 2.0 Schalter (l)',
  menge_l: 'Menge (l)',
  mindeststaerken: 'Mindeststärken',
  oel_spezifikation_eu: 'Ölsorte (EU)',
  oelfilter_teilenummer: 'Ölfilter Teilenummer',
  oelmenge_mit_filter_l: 'Ölmenge mit Filter (l)',
  oelmenge_ohne_filter_l: 'Ölmenge ohne Filter (l)',
  pruefen: 'Prüfen',
  radmutter_anzugsmoment_nm: 'Radmuttern Anzugsmoment (Nm)',
  radmuttern: 'Radmuttern',
  reifengroessen: 'Reifengrößen',
  spezifikation: 'Spezifikation',
  stopfen_drehmomente: 'Drehmomente Stopfen',
  teilenummer: 'Teilenummer',
  typ: 'Typ',
};

function label(key: string): string {
  return LABEL[key] ?? key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ');
}

function wert(v: unknown): string {
  if (v == null) return '–';
  if (typeof v === 'number') return v.toLocaleString('de-DE');
  if (Array.isArray(v)) return v.map(wert).join(', ');
  if (typeof v === 'object') return Object.entries(v as Record<string, unknown>).map(([k, x]) => `${label(k)} ${wert(x)}`).join(', ');
  return String(v);
}

function statusKlasse(status: string): string {
  if (status.startsWith('offiziell')) return 'offiziell';
  if (status.startsWith('teilweise')) return 'teilweise';
  if (status.startsWith('inoffiziell')) return 'inoffiziell';
  return 'werkstatt';
}

const STATUS_ERKLAERUNG = anleitungen.status_legende as Record<string, string>;

function erklaerung(status: string): string | undefined {
  const key = Object.keys(STATUS_ERKLAERUNG).find((k) => status.startsWith(k.split(' (')[0]));
  return key ? STATUS_ERKLAERUNG[key] : undefined;
}

/** YouTube video id from the usual URL shapes, or null. */
export function youtubeId(url: string): string | null {
  try {
    const u = new URL(url.trim());
    const host = u.hostname.replace(/^www\.|^m\./, '');
    let id: string | null = null;
    if (host === 'youtu.be') id = u.pathname.slice(1);
    else if (host === 'youtube.com' || host === 'youtube-nocookie.com' || host === 'music.youtube.com') {
      if (u.pathname === '/watch') id = u.searchParams.get('v');
      else {
        const m = u.pathname.match(/^\/(?:shorts|embed|live|v)\/([^/?#]+)/);
        id = m?.[1] ?? null;
      }
    }
    return id && /^[\w-]{6,20}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

/** Normalises user input to an https URL, or null if it isn't a usable web link. */
export function normalisiereUrl(eingabe: string): string | null {
  const t = eingabe.trim();
  if (!t) return null;
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(t) ? t : `https://${t}`);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    if (!u.hostname.includes('.')) return null;
    return u.toString();
  } catch {
    return null;
  }
}

export function InfoBlatt(props: {
  position: Position;
  notizen: EigeneNotiz[];
  onSpeichern: (n: EigeneNotiz) => Promise<void>;
  onLoeschen: (id: string) => Promise<void>;
  onSchliessen: () => void;
}) {
  const { position } = props;
  const anleitung = ANLEITUNGEN[position.id];
  const notizId = `notiz-${position.id}`;
  const gespeicherteNotiz = props.notizen.find((n) => n.id === notizId)?.inhalt ?? '';
  const links = props.notizen.filter((n) => n.positionId === position.id && n.typ === 'link');

  const [notiz, setNotiz] = useState(gespeicherteNotiz);
  const [notizStatus, setNotizStatus] = useState<'' | 'speichert' | 'gespeichert'>('');
  const [linkTitel, setLinkTitel] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [fehler, setFehler] = useState<string | null>(null);
  const [beschaeftigt, setBeschaeftigt] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal();
  }, []);

  const notizSichern = async () => {
    if (notiz === gespeicherteNotiz) return;
    setNotizStatus('speichert');
    setFehler(null);
    try {
      await props.onSpeichern({ id: notizId, positionId: position.id, typ: 'notiz', titel: 'Notiz', inhalt: notiz });
      setNotizStatus('gespeichert');
    } catch (e) {
      setFehler((e as Error).message);
      setNotizStatus('');
    }
  };

  return (
    <dialog
      ref={dialog}
      className="infoblatt"
      onClose={props.onSchliessen}
      onClick={(e) => {
        if (e.target === dialog.current) dialog.current?.close();
      }}
      aria-labelledby="info-titel"
    >
      <div className="infoblatt-inhalt">
        <div className="infoblatt-kopf">
          <h2 id="info-titel">{position.name}</h2>
          <button className="schliessen" onClick={() => dialog.current?.close()} aria-label="Schließen">
            ✕
          </button>
        </div>

        {anleitung ? (
          <>
            <p className={`quelle quelle-${statusKlasse(anleitung.anleitung_status)}`} title={erklaerung(anleitung.anleitung_status)}>
              Quelle: {anleitung.anleitung_status}
            </p>
            {erklaerung(anleitung.anleitung_status) && <p className="klein">{erklaerung(anleitung.anleitung_status)}</p>}

            {Object.keys(anleitung.daten).length > 0 && (
              <>
                <h3>Kerndaten</h3>
                <dl className="kerndaten">
                  {Object.entries(anleitung.daten).map(([k, v]) => (
                    <div key={k}>
                      <dt>{label(k)}</dt>
                      <dd>{wert(v)}</dd>
                    </div>
                  ))}
                </dl>
              </>
            )}

            {anleitung.hinweise && anleitung.hinweise.length > 0 && (
              <>
                <h3>Hinweise</h3>
                <ul className="hinweisliste">
                  {anleitung.hinweise.map((h) => (
                    <li key={h}>{h}</li>
                  ))}
                </ul>
              </>
            )}

            {anleitung.links.length > 0 && (
              <>
                <h3>Anleitungen</h3>
                <ul className="linkliste">
                  {anleitung.links.map((l) => (
                    <li key={l.url + l.titel}>
                      <a href={l.url} target="_blank" rel="noreferrer">
                        {l.titel}
                      </a>
                      <small>{l.typ}</small>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        ) : (
          <p className="klein">Für diesen Punkt ist noch keine Anleitung hinterlegt.</p>
        )}

        {position.hinweis && <p className="klein">Wartungsplan: {position.hinweis}</p>}

        <h3>Meine Notizen</h3>
        <textarea
          rows={4}
          value={notiz}
          placeholder="Eigene Notizen, z. B. benutztes Werkzeug, Teilenummern, Erfahrungen …"
          onChange={(e) => {
            setNotiz(e.target.value);
            setNotizStatus('');
          }}
          onBlur={notizSichern}
        />
        <div className="zeile">
          <button className="primaer" onClick={notizSichern} disabled={notiz === gespeicherteNotiz || notizStatus === 'speichert'}>
            {notizStatus === 'speichert' ? 'Speichere …' : 'Notiz speichern'}
          </button>
          {notizStatus === 'gespeichert' && notiz === gespeicherteNotiz && <small>Gespeichert</small>}
        </div>

        <h3>Meine Links und Videos</h3>
        {links.length === 0 && <p className="klein">Noch nichts gespeichert. Füge z. B. ein YouTube-Video hinzu.</p>}
        <ul className="linkliste eigene">
          {links.map((l) => {
            const yt = youtubeId(l.inhalt);
            return (
              <li key={l.id}>
                {yt ? (
                  <div className="video">
                    <iframe
                      src={`https://www.youtube-nocookie.com/embed/${yt}`}
                      title={l.titel || 'YouTube-Video'}
                      loading="lazy"
                      allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                      allowFullScreen
                    />
                  </div>
                ) : null}
                <div className="zeile">
                  <a href={l.inhalt} target="_blank" rel="noreferrer">
                    {l.titel || l.inhalt}
                  </a>
                  <button
                    className="link gefahr"
                    disabled={beschaeftigt}
                    onClick={async () => {
                      if (!confirm('Link entfernen?')) return;
                      setBeschaeftigt(true);
                      try {
                        await props.onLoeschen(l.id);
                      } catch (e) {
                        setFehler((e as Error).message);
                      } finally {
                        setBeschaeftigt(false);
                      }
                    }}
                  >
                    Entfernen
                  </button>
                </div>
              </li>
            );
          })}
        </ul>

        <form
          className="link-form"
          onSubmit={async (e) => {
            e.preventDefault();
            const url = normalisiereUrl(linkUrl);
            if (!url) {
              setFehler('Das sieht nicht nach einem gültigen Link aus.');
              return;
            }
            setBeschaeftigt(true);
            setFehler(null);
            try {
              await props.onSpeichern({
                id: crypto.randomUUID(),
                positionId: position.id,
                typ: 'link',
                titel: linkTitel.trim() || (youtubeId(url) ? 'YouTube-Video' : ''),
                inhalt: url,
              });
              setLinkTitel('');
              setLinkUrl('');
            } catch (err) {
              setFehler((err as Error).message);
            } finally {
              setBeschaeftigt(false);
            }
          }}
        >
          <input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="Link oder YouTube-URL" inputMode="url" aria-label="Link" />
          <input value={linkTitel} onChange={(e) => setLinkTitel(e.target.value)} placeholder="Titel (optional)" aria-label="Titel" />
          <button className="primaer" disabled={beschaeftigt || !linkUrl.trim()}>
            Hinzufügen
          </button>
        </form>

        {fehler && <p className="fehler">{fehler}</p>}
      </div>
    </dialog>
  );
}
