# MX-5 Wartung

Wartungsplan und digitales Wartungsbuch für den **Mazda MX-5 ND**.
Läuft als Web-App im Browser und lässt sich aufs Handy installieren. Alle Daten liegen im eigenen Google Drive.

## Funktionen

- **Übersicht „Was ist fällig?“** nach Km-Stand und Datum, je nachdem was zuerst eintritt (rot = überfällig, gelb = bald fällig).
- **Wartung eintragen:** geprüft / getauscht / nachgezogen, Datum, Km-Stand, Teile, Kosten, Notiz.
- **Belege** (Foto oder PDF) direkt vom Handy anhängen, landen im Drive-Ordner `MX-5 Wartung/Belege`.
- **Verlauf** pro Position mit Kostensumme.
- **Km-Verlauf** mit Diagrammen (Km-Stand über die Zeit, Km pro Jahr) und Erinnerung, wenn der Km-Stand des Monats fehlt.
- **Info-Symbol (i)** je Wartungspunkt: Anleitung mit Kerndaten, Hinweisen und Links samt Kennzeichnung, wie offiziell die Quelle ist ([`src/anleitungen.json`](src/anleitungen.json)), dazu eigene Notizen, Links und YouTube-Videos.
- **Daten als Google-Tabelle** (`MX-5 Wartungsbuch`), auch ohne App lesbar und bearbeitbar.

## Wartungsplan

Hinterlegt ist der offizielle Mazda **Plan 1** (Grundintervall 20.000 km / 12 Monate) aus der Betriebsanleitung,
umgerechnet in Intervalle je Position: [`src/plan1.json`](src/plan1.json).
Positionen, die nur für Zypern/Malta oder die Ukraine gelten, sind nicht enthalten.

## Technik

React + TypeScript + Vite, PWA (`vite-plugin-pwa`), Google Identity Services, Google Drive & Sheets API
(Scope `drive.file`). Veröffentlichung über GitHub Pages per GitHub Actions.

Einrichtung: siehe [docs/EINRICHTUNG.md](docs/EINRICHTUNG.md).
