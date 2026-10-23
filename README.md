# Code Editor

Code Editor ist ein eigenständiger Desktop-Code-Editor für Windows 10/11, gebaut mit Electron, React, TypeScript und CodeMirror 6. Er ist kein Nachbau von VS Code, sondern konzentriert sich auf einen schnellen, tastaturgesteuerten Arbeitsablauf: Workspace-Explorer, Tabs, Schnellöffnen, Befehlspalette, Suchen und Ersetzen in der Datei und im ganzen Workspace, helles und dunkles Theme sowie Einstellungen und Sitzung, die über Neustarts erhalten bleiben. Der Editor arbeitet vollständig lokal: keine Telemetrie, keine Schriften oder Skripte aus dem Netz.

## Tech-Stack

| Bereich | Technik |
| --- | --- |
| Laufzeit | Electron (Hauptprozess `electron/`, sandboxed Renderer) |
| Oberfläche | React 19 + TypeScript, gebaut mit Vite |
| Editor-Engine | CodeMirror 6 mit Sprachpaketen für JavaScript, TypeScript, JSON, HTML, CSS, Markdown, Python, C/C++, Java, Go und Rust |
| Tests | Vitest mit jsdom und Testing Library |
| Persistenz | JSON-Dateien im Electron-Ordner `userData` (keine Datenbank) |
| Paketierung | electron-builder (NSIS-Installer für Windows) |
| Schriften | Space Grotesk, Inter und JetBrains Mono als lokale Dateien (`public/fonts`, SIL Open Font License) |

## Voraussetzungen

- Node.js 22.12 oder neuer (bzw. 20.19+) mit npm
- Windows 10/11 für die Desktop-App; der Renderer läuft zusätzlich in jedem aktuellen Browser

## Installation

```bash
git clone <repository-url> code-editor
cd code-editor
npm ci
```

`npm ci` lädt dabei auch die passende Electron-Laufzeit herunter.

## Starten (Entwicklung)

### Desktop-App

```bash
npm start
```

`npm start` baut den Renderer nach `dist/` und startet danach Electron mit genau einem Fenster. Umgebungsvariablen werden nicht benötigt.

### Renderer im Browser (Demo-Workspace)

Ohne Electron gibt es keine Preload-Brücke; die Oberfläche greift dann automatisch auf ein In-Memory-Demo-Dateisystem zurück (ein Beispielprojekt `weather-cli` unter `C:\Demo\weather-cli`). So lässt sich die komplette Oberfläche im Browser ausprobieren:

```bash
npm run dev
```

Danach `http://127.0.0.1:5173` im Browser öffnen. Alternativ den Produktions-Build ansehen:

```bash
npm run build
npx vite preview
```

und die angezeigte Adresse öffnen. Die Datei `dist/index.html` bitte nicht per Doppelklick (`file://`) im Browser öffnen – ES-Module werden dort vom Browser blockiert; Electron selbst lädt sie dagegen direkt.

Einstellungen und Sitzung speichert der Browser-Modus im `localStorage`.

## Bauen (Produktion)

```bash
npm run build   # nur den Renderer nach dist/ bauen
npm run dist    # Renderer bauen und den Windows-Installer erzeugen
```

`npm run dist` legt den NSIS-Installer im Ordner `release/` ab.

## Tests und Prüfungen

```bash
npm test            # alle Vitest-Tests einmal ausführen
npm run typecheck   # TypeScript-Prüfung ohne Ausgabe
```

## Bedienung

### Aufbau des Fensters

- **Titel- und Menüleiste**: Menüs *File*, *Edit*, *View* und *Help*; der Fenstertitel zeigt die aktive Datei (mit `●`, wenn sie ungespeicherte Änderungen hat). In der Desktop-App ist das die native Windows-Menüleiste, im Browser-Modus eine gleichwertige Leiste im Fenster.
- **Aktivitätsleiste** (links): wechselt die Seitenleiste zwischen *Explorer*, *Search* und *Settings*. Auf schmalen Fenstern (bis 720 px) blendet ein Klick die Seitenleiste anstelle des Editors ein; ein zweiter Klick auf denselben Knopf kehrt zum Editor zurück.
- **Seitenleiste**: Breite per Ziehen am Trenner oder per Tastatur (Pfeil links/rechts, Pos1/Ende) änderbar; die Breite wird gespeichert.
- **Tab-Leiste und Editor**: eine Datei pro Tab, darunter der CodeMirror-Editor.
- **Statusleiste**: Zeile, Spalte und Auswahllänge, Sprachmodus, Einrückung, Zeilenende und Kodierung (UTF-8).

### Willkommensbildschirm

Ohne geöffneten Ordner erscheinen *Open Folder*, *Open File* und die Liste der zuletzt geöffneten Workspaces. *Clear list* löscht diese Liste vollständig – danach enthält die Sitzungsdatei keine Workspace-Pfade mehr.

### Explorer

- Zeigt den geöffneten Ordner als Baum, der beim Aufklappen nachlädt: Ordner zuerst, dann Dateien, jeweils alphabetisch; `node_modules` und `.git` sind ausgeblendet. Der Ordnername steht als Überschrift.
- Kontextmenü (Rechtsklick): neue Datei, neuer Ordner, umbenennen, löschen (mit Rückfrage, in den Papierkorb), im Windows-Explorer anzeigen, Pfad kopieren. Änderungen auf der Festplatte erscheinen sofort im Baum.

### Tabs

- Einfacher Klick auf eine Datei öffnet sie als Vorschau-Tab (kursiv); Doppelklick oder die erste Änderung macht den Tab dauerhaft.
- Ein Punkt im Tab zeigt ungespeicherte Änderungen. Schließen per ×-Knopf, mittlerer Maustaste oder `Ctrl+W`; Reihenfolge per Drag & Drop ändern; mit `Ctrl+Tab` / `Ctrl+Shift+Tab` wechseln.
- Beim Schließen eines geänderten Tabs oder des Fensters fragt der Editor *Save* / *Don't Save* / *Cancel*; *Cancel* lässt alles offen.
- Ändert sich eine geöffnete Datei auf der Festplatte, wird sie neu geladen, wenn sie unverändert ist; bei eigenen Änderungen erscheint ein Hinweis mit *Reload* und *Keep mine*.
- Dateien über 5 MB öffnen schreibgeschützt mit einem sichtbaren Hinweis.

### Editor

Syntaxhervorhebung nach Dateiendung, Zeilennummern, Klammerhervorhebung, automatisches Schließen von Klammern, automatisches Einrücken, Code-Faltung und Mehrfach-Cursor. Beim Speichern bleibt das Zeilenende der Datei erhalten (CRLF bleibt CRLF, LF bleibt LF); das Entfernen von Leerzeichen am Zeilenende und der abschließende Zeilenumbruch werden nur angewendet, wenn sie in den Einstellungen aktiviert sind. Sprachmodus, Einrückung und Zeilenende lassen sich per Klick in der Statusleiste ändern.

### Schnellöffnen, Befehlspalette, Gehe zu Zeile

- `Ctrl+P` öffnet *Quick Open*: unscharfe Suche über alle Dateinamen des Workspace, bessere Treffer zuerst, Navigation mit den Pfeiltasten, `Enter` öffnet. Bei leerer Eingabe stehen die zuletzt geöffneten Dateien in der Liste.
- `Ctrl+Shift+P` öffnet die Befehlspalette: filtert alle Befehle unscharf, zeigt deren Tastenkürzel und führt den gewählten Befehl mit `Enter` aus.
- `Ctrl+G` springt zu einer eingegebenen Zeile.

### Suchen

- `Ctrl+F` / `Ctrl+H`: Suchen bzw. Ersetzen in der aktuellen Datei mit Schaltern für Groß-/Kleinschreibung, ganzes Wort und regulären Ausdruck, Trefferzähler, nächster/vorheriger Treffer, Ersetzen und Alle ersetzen. Ein ungültiger regulärer Ausdruck wird erst nach der Eingabe als Fehler angezeigt.
- `Ctrl+Shift+F`: Suche im ganzen Workspace mit denselben Schaltern sowie Include-/Exclude-Globs (z. B. `src/**, *.ts`). Ergebnisse sind nach Datei gruppiert und zeigen die Zeile als Vorschau; ein Klick öffnet die Datei mit markiertem Treffer. Die Suche läuft im Hintergrund, ist auf 5000 Treffer und 10 Sekunden begrenzt und bricht reguläre Ausdrücke bei Zeitüberschreitung ab.

### Einstellungen

Die Ansicht *Settings* bearbeitet Theme (*System*, *Dark*, *Light*), Schriftart, Schriftgröße (8–32 px), Tabulatorbreite, Leerzeichen statt Tabs, Zeilenumbruch, Zeilennummern, Leerzeichen am Zeilenende entfernen und abschließenden Zeilenumbruch. Jede Änderung wirkt sofort in allen offenen Editoren. Das Theme lässt sich außerdem über die Befehlspalette (*View: Toggle Theme*) umschalten.

### Tastenkürzel

| Kürzel | Befehl |
| --- | --- |
| `Ctrl+K` `Ctrl+O` | Ordner öffnen |
| `Ctrl+S` | Speichern |
| `Ctrl+Shift+S` | Speichern unter |
| `Ctrl+W` | Tab schließen |
| `Ctrl+Tab` / `Ctrl+Shift+Tab` | Nächster / vorheriger Tab |
| `Ctrl+P` | Quick Open |
| `Ctrl+Shift+P` | Befehlspalette |
| `Ctrl+G` | Gehe zu Zeile |
| `Ctrl+F` | Suchen |
| `Ctrl+H` | Ersetzen |
| `Ctrl+Shift+F` | Im Workspace suchen |
| `Ctrl+/` | Zeilenkommentar umschalten (passend zur Sprache) |
| `Alt+Up` / `Alt+Down` | Zeile nach oben / unten verschieben |
| `Ctrl+D` | Nächstes Vorkommen zur Auswahl hinzufügen (Mehrfach-Cursor) |
| `Ctrl+Plus` / `Ctrl+Minus` / `Ctrl+0` | Editorschrift vergrößern / verkleinern / zurücksetzen |

Weitere Befehle ohne Kürzel (Alle speichern, Datei öffnen, Zeile duplizieren, Theme und Zeilenumbruch umschalten, Sprachmodus, Einrückung, Zeilenende, Einstellungen, *Help > About*) sind über die Menüs und die Befehlspalette erreichbar. *Help > About* zeigt App-Name und Version.

## Funktionsumfang

- Ein Fenster mit Willkommensbildschirm, Statusleiste und nativer Menüleiste
- Workspace-Explorer mit nachladendem Baum, Kontextmenü für Dateien und Ordner und Aktualisierung bei Änderungen auf der Festplatte
- Vorschau-Tabs, dauerhafte Tabs, Dirty-Markierung, Schließen per Knopf/Mittelklick/`Ctrl+W`, Drag & Drop, `Ctrl+Tab`
- Syntaxhervorhebung für JavaScript, TypeScript, JSON, HTML, CSS, Markdown, Python, C/C++, Java, Go und Rust
- Zeilenkommentare, Zeilen verschieben, Zeile duplizieren, Mehrfach-Cursor
- Speichern, Speichern unter und Alle speichern mit Erhalt von CRLF/LF
- Schutz ungespeicherter Änderungen und Konflikthinweis bei externen Änderungen
- Quick Open mit unscharfer Suche, Befehlspalette, Gehe zu Zeile
- Suchen und Ersetzen in der Datei, Workspace-Suche mit Globs, Vorschau und Begrenzungen
- Klickbare Statusleiste für Sprachmodus, Einrückung und Zeilenende
- Helles und dunkles Theme, live wirksame Einstellungen, Zoom der Editorschrift
- Schreibgeschützter Modus mit Warnhinweis für Dateien über 5 MB
- Persistente Einstellungen und Sitzung (letzter Workspace, offene Tabs mit aktivem Tab, Seitenleistenbreite, Fenstergröße und -position)
- Browser-Modus mit In-Memory-Demo-Workspace für Prüfungen ohne Electron

## Daten, Datenschutz und Sicherheit

- **Speicherorte**: `settings.json` und `session.json` im Ordner `userData` der App, unter Windows `%APPDATA%\Code Editor\`. Gespeichert werden nur Einstellungen, Workspace-Pfade, Tab-Pfade und Fenstergeometrie – keine Dateiinhalte und keine ungespeicherten Puffer. Eine beschädigte Datei wird durch die Standardwerte ersetzt, ohne dass die App abstürzt.
- **Keine Telemetrie, keine Netzwerkzugriffe**: Schriften liegen lokal bei, der Renderer lädt nichts aus dem Netz, und der Hauptprozess bricht jede HTTP(S)- und WebSocket-Anfrage des Renderers ab. Externe Links öffnen ausschließlich als `https:`-Adresse im Standardbrowser.
- **Logs**: Log- und Fehlermeldungen enthalten weder Dateiinhalte noch vollständige Dateipfade (Pfade werden durch `<path>` ersetzt); über die Prozessgrenze gehen nur kurze Fehlercodes wie `not-found`.
- **Abschottung**: `contextIsolation` an, `nodeIntegration` aus, `sandbox: true`; Navigation und neue Fenster sind gesperrt. Der Renderer erreicht das Dateisystem nur über die typisierte Preload-API (`window.api`), deren Argumente der Hauptprozess auf Typ und Form prüft; Dateizugriffe sind auf den gewählten Workspace und per Dialog gewählte Pfade beschränkt. Die Content-Security-Policy erlaubt nur eigene Skripte (`script-src 'self'`, kein `unsafe-eval`).

## Projektstruktur

```
electron/            Hauptprozess: Fenster, Sicherheit, Logging, IPC-Handler, Menü, Fenstergeometrie
  main.cjs           Einstiegspunkt (package.json "main")
  preload.cjs        typisierte Brücke window.api
  ipc/               Dateisystem, Dateiüberwachung, Suche (Worker), Einstellungen/Sitzung
public/fonts/        lokale Schriften
src/
  App.tsx            Fensterrahmen: Titelleiste, Aktivitätsleiste, Seitenleiste, Tabs, Editor, Statusleiste
  platform.ts        Zugriff auf window.api bzw. den Demo-Workspace (platform/demoFs.ts)
  state/             App-Zustand (AppStore), Öffnen, Speichern, externe Änderungen, Sitzung
  commands/          Befehlsliste und globale Tastenkürzel
  core/              reine Logik (Fuzzy-Suche, Sprache, Zeilenenden, Tabs, Suche, Globs, Einstellungen, Sitzung)
  editor/            CodeMirror-Erweiterungen
  views/, components/ Ansichten und Bedienelemente
index.html           Renderer-HTML mit Content-Security-Policy
RUN.json             maschinenlesbare Start-Beschreibung (Installieren, Bauen, Starten, Testen)
```
