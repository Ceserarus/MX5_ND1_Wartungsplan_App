# Einrichtung (einmalig, ca. 15 Minuten)

Die App läuft kostenlos über GitHub Pages unter
**https://&lt;dein-github-name&gt;.github.io/&lt;repo-name&gt;/**
(die genaue Adresse steht nach dem ersten Veröffentlichen unter Settings → Pages) und speichert alle Daten in deinem eigenen Google Drive. Dafür braucht es drei Dinge.

## 1. Repository öffentlich stellen

GitHub Pages ist für private Repositories nur mit GitHub Pro verfügbar.

1. Auf GitHub das Repository öffnen → **Settings** → ganz unten **Danger Zone** → **Change visibility** → **Make public**.

Öffentlich heißt: Jeder kann den **Code** sehen und die App benutzen. Deine **Daten** sind nicht im Repository,
sie liegen nur in deinem Google Drive. Andere Nutzer würden mit ihrem eigenen Google-Konto in ihrem eigenen Drive arbeiten.

## 2. Google-Cloud-Projekt und Client-ID anlegen

1. https://console.cloud.google.com/ öffnen und mit deinem Google-Konto anmelden.
2. Oben links **Projekt auswählen → Neues Projekt**, Name z. B. `MX5 Wartung`, **Erstellen**.
3. **APIs & Dienste → Bibliothek**: nacheinander **Google Drive API** und **Google Sheets API** suchen und jeweils **Aktivieren**.
4. **APIs & Dienste → OAuth-Zustimmungsbildschirm** (heißt teils „Google Auth Platform“):
   - Nutzertyp **Extern**, App-Name `MX-5 Wartung`, deine E-Mail als Support- und Entwickler-Kontakt.
   - Bei **Zielgruppe / Testnutzer** deine eigene Gmail-Adresse hinzufügen.
   - Die App kann im Status **Test** bleiben. Beim ersten Login zeigt Google dann den Hinweis
     „Google hat diese App nicht überprüft“ → **Weiter** klicken. Das ist normal, weil du die App selbst betreibst.
5. **APIs & Dienste → Anmeldedaten → Anmeldedaten erstellen → OAuth-Client-ID**:
   - Anwendungstyp **Webanwendung**
   - **Autorisierte JavaScript-Quellen**: `https://<dein-github-name>.github.io`
     (für lokale Entwicklung zusätzlich `http://localhost:5173`)
   - **Erstellen** und die **Client-ID** kopieren (endet auf `.apps.googleusercontent.com`).
     Ein Client-Secret wird nicht gebraucht.

## 3. Client-ID bei GitHub hinterlegen und Pages einschalten

1. Repository → **Settings → Secrets and variables → Actions → Tab „Variables“ → New repository variable**
   - Name: `GOOGLE_CLIENT_ID`
   - Wert: die kopierte Client-ID
2. Repository → **Settings → Pages → Build and deployment → Source: „GitHub Actions“**.
3. Repository → **Actions → „Veröffentlichen (GitHub Pages)“ → Run workflow**.
   Nach ca. 1 Minute ist die App unter der Adresse oben erreichbar.
   Danach wird sie bei jeder Änderung auf `main` automatisch neu veröffentlicht.

## 4. Aufs Handy holen

- **iPhone (Safari):** Seite öffnen → Teilen → **Zum Home-Bildschirm**.
- **Android (Chrome):** Seite öffnen → Menü ⋮ → **App installieren** bzw. **Zum Startbildschirm hinzufügen**.

Beim ersten Anmelden legt die App in deinem Drive den Ordner **MX-5 Wartung** an, mit der Tabelle
**MX-5 Wartungsbuch** und dem Unterordner **Belege**. Die App darf nur auf Dateien zugreifen, die sie selbst angelegt hat.

## Lokal entwickeln

```bash
cp .env.example .env.local   # Client-ID eintragen
npm install
npm run dev                  # http://localhost:5173
npm test
```
