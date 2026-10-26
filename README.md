# BBC Stendal – Vereinskalender & Editor-App

Besteht aus drei Teilen, die zusammen auf **einem** kleinen Node-Server laufen (keine Abhängigkeiten, kein `npm install`):

| Teil | Adresse | Zweck |
|---|---|---|
| Öffentlicher Kalender | `/kalender/` | Monats- und Listenansicht, Filter, Klick auf Termin → Details. Wird in WordPress eingebettet. |
| Editor-App (PWA) | `/app/` | Login für ausgewählte Mitglieder, Termine anlegen/ändern/löschen, Google-Verbindungstool. Auf dem Handy installierbar. |
| API | `/api/…` | Liest/schreibt den Google-Kalender. Zugangsdaten bleiben ausschließlich auf dem Server. |

**Datenquelle ist Google Kalender.** Es gibt keine eigene Datenbank: Termine, die in der App angelegt werden, landen im Google-Kalender, und Termine, die direkt in Google angelegt werden, erscheinen im Vereinskalender. Kategorie und Mannschaft werden als Zusatzfeld am Google-Termin gespeichert (ohne Zuordnung gilt „Vereinsleben“ / „Gesamtverein“).

Kategorien: Heimspiel, Auswärtsspiel, Camps & Turniere, Vereinsleben, Sponsoren & Presse. Mannschaften: Gesamtverein, Herren, Jugend (anpassbar in `server.js`, Konstanten `CATEGORIES` und `TEAMS`).

## 1. Lokal ausprobieren (Demo-Modus)
```
node server.js
```
Ohne Google-Zugang startet der Demo-Modus mit Beispieltterminen. Login in der App: `demo` / `demo1234`. Aufruf: http://localhost:3000/kalender/ und http://localhost:3000/app/

## 2. Google-Kalender anbinden
1. In der [Google Cloud Console](https://console.cloud.google.com) ein Projekt anlegen, **Google Calendar API** aktivieren.
2. *IAM & Verwaltung → Dienstkonten* → Dienstkonto erstellen → *Schlüssel → Neuer Schlüssel → JSON* herunterladen.
3. In Google Kalender (Web) beim Vereinskalender: *Einstellungen und Freigabe → Für bestimmte Personen freigeben* → die `client_email` des Dienstkontos hinzufügen, Recht **„Änderungen an Terminen vornehmen“**.
4. Dort auch die **Kalender-ID** kopieren (Abschnitt „Kalender integrieren“).
5. Beim Hoster die Variablen `GOOGLE_SERVICE_ACCOUNT_JSON` (kompletter Inhalt der JSON-Datei) und `GOOGLE_CALENDAR_ID` setzen.
6. In der App unter **Google-Kalender → Verbindung testen** prüfen.

Der verbundene Kalender kann auch weiterhin direkt in Google bearbeitet werden. Er sollte **nicht** als „öffentlich“ geschaltet sein, die Webseite liest über den Server.

## 3. Editoren anlegen
```
node scripts/add-user.js carsten "Carsten" EinSicheresPasswort
```
Gibt eine JSON-Zeile aus. Alle Nutzer kommen als JSON-Array in die Variable `USERS`:
```
USERS=[{"username":"carsten","name":"Carsten","hash":"scrypt$…"},{"username":"anna","name":"Anna","hash":"scrypt$…"}]
```
Neuer Editor oder Passwortwechsel = neue Zeile erzeugen, `USERS` aktualisieren, Dienst neu starten. Passwörter werden nur als scrypt-Hash gespeichert, Login ist gegen Durchprobieren gedrosselt (10 Versuche / 15 Min.).

Außerdem `JWT_SECRET` auf eine lange Zufallszeichenfolge setzen (`openssl rand -hex 32`); wechselt der Wert, müssen sich alle neu anmelden.

## 4. Kostenlos hosten (z. B. Render.com)
1. Ordner in ein (privates) GitHub-Repository hochladen.
2. Render → *New → Blueprint* (liest `render.yaml`) oder *Web Service*: Start-Befehl `node server.js`, Build-Befehl leer.
3. Umgebungsvariablen aus `.env.example` eintragen.
4. Eine eigene Subdomain wie `kalender.bbc-stendal.de` ist über *Custom Domains* möglich (CNAME beim Domain-Anbieter).

Hinweis: Kostenlose Tarife schlafen nach Inaktivität ein; der erste Aufruf braucht dann ~30–60 Sek. Ein Pingdienst (z. B. UptimeRobot auf `/api/config`) oder ein günstiger Tarif behebt das. Da alle Daten bei Google liegen, geht beim Neustart nichts verloren.

## 5. In WordPress einbinden (Elementor)
Auf der Seite „Events“ oder „Kalender“ ein **HTML-Widget** einfügen:
```html
<div id="bbc-kalender"></div>
<script src="https://DEIN-SERVER/kalender/embed.js" async></script>
```
Das Skript legt einen iframe an, der sich automatisch in der Höhe anpasst. Wichtig: `ALLOWED_EMBED_ORIGINS` muss die Adresse der Webseite enthalten (Standard: `bbc-stendal.de` mit und ohne `www`). Den Link zur Editor-App (`https://DEIN-SERVER/app/`) am besten nur intern weitergeben, die Seite ist für Suchmaschinen gesperrt (`noindex`).

Besucher können den Kalender über **Abonnieren** in Google/Apple/Outlook einbinden (`/api/calendar.ics`) oder einzelne Termine per „In Kalender speichern“ übernehmen.

## Design
Farben stammen aus dem Vereinslogo (`/shared/brand.css`: Navy `#031029`, Orange `#E04412`, Amber `#F09C00`, Creme `#F9F4C4`). Die Überschriften nutzen eine Condensed-Schrift. Die Webseite lädt keine Google Fonts (Datenschutz), daher gilt ein Systemfont-Stapel. Wenn du die Schrift der Webseite lokal hast, in `brand.css` bei `--font-head` an erster Stelle eintragen und per `@font-face` einbinden.

## Datenschutz
Der öffentliche Kalender lädt keine externen Ressourcen; nur der Link „Karte“ führt (per Klick) zu Google Maps. Es werden keine Cookies gesetzt; die App speichert den Login-Token im lokalen Speicher des Browsers. In der Datenschutzerklärung die Verarbeitung über den Kalender-Server erwähnen.
