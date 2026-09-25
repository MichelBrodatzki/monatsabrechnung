# Monatsabrechnung

Eine selbst hostbare SvelteKit-Webapp für die monatliche Verteilung gemeinsamer Einnahmen auf Gemeinschaftskosten, Sparziele, persönliche Bedarfe und Taschengeld.

## Funktionen

- Personen werden zentral unter **Einstellungen** verwaltet.
- Jede aktive Person erhält automatisch feste Zeilen für Einkommen und persönlichen Bedarf.
- Frei benennbare Sondereinnahmen und Sparziele.
- Gleiches Taschengeld oder Ausgleich auf denselben persönlichen Gesamtbetrag.
- Centgenaue Berechnung; nicht teilbare Centbeträge gehen ans Gemeinschaftskonto.
- Monatsarchiv, Abschlussstatus und A4-Druckansicht.
- SQLite-Datenbank und JSON-Sicherung.
- Optionaler OIDC-Login mit Zugriff über Gruppen-Claims.
- Optionaler HTTP-Basisschutz über Umgebungsvariablen.

## Lokale Entwicklung

Voraussetzungen: Node.js 22 oder neuer.

```bash
npm ci
cp .env.example .env
npm run dev
```

Die App läuft anschließend normalerweise unter `http://localhost:5173`.

## Produktion ohne Docker

```bash
npm ci
npm run build
DATABASE_PATH=./data/monatsabrechnung.db \
APP_USERNAME=mein-benutzer \
APP_PASSWORD=ein-langes-passwort \
npm start
```

Der Node-Server lauscht standardmäßig auf Port 3000. Die SQLite-Datei liegt im konfigurierten `DATABASE_PATH`.

## Produktion mit Docker Compose

Optional eine `.env` neben `compose.yaml` erstellen:

```dotenv
APP_USERNAME=mein-benutzer
APP_PASSWORD=ein-langes-passwort
```

Danach:

```bash
docker compose up -d --build
```

Die App ist unter `http://localhost:3000` erreichbar. Die Datenbank wird im lokalen Ordner `data/` gespeichert und bleibt bei Container-Updates erhalten.

## OIDC-Anmeldung

Die App kann über einen beliebigen OpenID-Connect-Provider geschützt werden.
Beim Provider muss folgende Callback-URL registriert werden:

```text
https://abrechnung.example.org/auth/callback
```

Beispiel für die `.env` neben `compose.yaml`:

```dotenv
OIDC_ISSUER=https://login.example.org/application/o/monatsabrechnung/
OIDC_CLIENT_ID=monatsabrechnung
OIDC_CLIENT_SECRET=ein-langes-client-secret
OIDC_REDIRECT_URI=https://abrechnung.example.org/auth/callback

# Einfacher Claim, zum Beispiel: { "groups": ["familie", "finanzen"] }
OIDC_GROUPS_CLAIM=groups
OIDC_ALLOWED_GROUPS=familie,finanzen

OIDC_SCOPES=openid profile email
OIDC_CLIENT_AUTH_METHOD=client_secret_basic
OIDC_SESSION_TTL_SECONDS=43200
```

`OIDC_GROUPS_CLAIM` unterstützt auch verschachtelte Claim-Pfade. Für einen
Keycloak-Claim wie `{ "realm_access": { "roles": ["familie"] } }` kann
beispielsweise `realm_access.roles` verwendet werden.

Ein Benutzer erhält Zugriff, wenn mindestens eine seiner Gruppen exakt mit
einem Eintrag in `OIDC_ALLOWED_GROUPS` übereinstimmt. Mehrere erlaubte Gruppen
werden durch Kommas getrennt. Der Gruppen-Claim muss im ID-Token oder am
UserInfo-Endpunkt des Providers verfügbar sein; falls dafür ein zusätzlicher
Scope nötig ist, wird er zu `OIDC_SCOPES` ergänzt.

OIDC hat Vorrang vor `APP_USERNAME` und `APP_PASSWORD`. Sind keine OIDC-Werte
gesetzt, bleibt der bisherige optionale HTTP-Basisschutz verfügbar. Für den
Produktivbetrieb sollte `OIDC_REDIRECT_URI` ausdrücklich mit der öffentlichen
HTTPS-Adresse gesetzt werden.

## Sicherung

Es gibt zwei unabhängige Möglichkeiten:

1. Unter **Einstellungen → Datensicherung** eine JSON-Datei exportieren.
2. Bei gestopptem Server die Datei `data/monatsabrechnung.db` kopieren.

Vor einem JSON-Import sollte zusätzlich eine Kopie der SQLite-Datei angelegt werden.

## Prüfungen

```bash
npm run check
npm test
npm run build
```
