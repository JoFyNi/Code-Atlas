# CodeAtlas Compile – Dokumentation

Stand: 16.11.2026 · Oberfläche 5.1 · Bridge 2.1

Die Oberfläche gibt es auf Deutsch und Englisch (⚙ → *Ansicht* → *Sprache*; Standard: Sprache des Browsers). English documentation: [DOCUMENTATION.md](DOCUMENTATION.md).

CodeAtlas Compile ist ein „Compiler zum Vibecoding“. Du beschreibst, was gebaut oder geändert werden soll, Claude Code setzt es um, und du siehst live im Diagramm, was passiert:

- **was die KI liest, ändert und ausführt**,
- **was neu hinzukommt, sich ändert oder verschwindet** – bis auf die einzelne Funktion und Variable,
- **welche Verbindungen neu entstehen und wo** (Aufrufe, Variablenzugriffe, Includes, Vererbung …),
- **wie das Programm danach läuft** (Ausführen mit Live-Trace),
- **und planvoll statt blind:** Claude fragt den Graphen, arbeitet eine Pipeline ab, das Qualitätstor prüft vor „fertig“, mehrere Agenten arbeiten parallel (Kapitel 4A).

Selbst eingreifen bleibt jederzeit möglich: Werte und Code im Editor ändern, Build und Programm von Hand starten, alles zurücksetzen.

---

## Inhalt

1. [Schnellstart](#1-schnellstart)
2. [Aufbau: Bridge und Oberfläche](#2-aufbau-bridge-und-oberfläche)
3. [Die Oberfläche im Überblick](#3-die-oberfläche-im-überblick)
4. [Vibecoding mit Claude Code](#4-vibecoding-mit-claude-code)
4A. [Planvoll vibecoden: Graph, Pipeline, Qualitätstor, Team](#4a-planvoll-vibecoden-graph-pipeline-qualitätstor-team-seit-40--bridge-20)
5. [Änderungen sehen: die Änderungsebene](#5-änderungen-sehen-die-änderungsebene)
6. [Kontrollpunkte, Vergleich und Zurücksetzen](#6-kontrollpunkte-vergleich-und-zurücksetzen)
7. [Das Diagramm](#7-das-diagramm)
8. [Rechte Leiste: Details](#8-rechte-leiste-details)
9. [Konsole: die Reiter unten](#9-konsole-die-reiter-unten)
10. [Build, Ausführen, Live-Trace und Tests](#10-build-ausführen-live-trace-und-tests)
11. [Claude Code im Terminal mitlesen (Hooks)](#11-claude-code-im-terminal-mitlesen-hooks)
12. [Wo was gespeichert wird](#12-wo-was-gespeichert-wird)
13. [Sicherheit](#13-sicherheit)
14. [Startparameter der Bridge](#14-startparameter-der-bridge)
15. [Schnittstelle der Bridge (HTTP)](#15-schnittstelle-der-bridge-http)
16. [Unterstützte Sprachen](#16-unterstützte-sprachen)
17. [Oberfläche selbst bauen](#17-oberfläche-selbst-bauen)
18. [Tastenkürzel](#18-tastenkürzel)
19. [Grenzen, bekannte Punkte, offene Arbeiten](#19-grenzen-bekannte-punkte-offene-arbeiten)
20. [Fehlersuche](#20-fehlersuche)

---

## 1. Schnellstart

**Voraussetzungen**

- Python 3.8 oder neuer (nur Standardbibliothek, keine Pakete nötig)
- Claude Code, einmal im Terminal mit `claude` angemeldet
- Edge oder Chrome (für das eigene Fenster; sonst jeder Browser)

**Starten**

```
python codeatlas_bridge.py "C:\Pfad\zum\Projekt" --desktop
```

Unter Windows alternativ: den Projektordner auf `CodeAtlas-starten.bat` ziehen (oder doppelklicken und den Pfad eingeben). `CodeAtlas.html` muss neben `codeatlas_bridge.py` liegen.

Ohne `--desktop` gibt die Bridge im Terminal die Adresse aus (Zeile „App“, inklusive Token). Mit `--open` öffnet sie den Standardbrowser.

**Erster Auftrag**

1. Links ist der Reiter **✦ KI** offen.
2. Arbeitsweise wählen: **Planen**, **Nachfragen** oder **Ändern**.
3. Auftrag eintippen, **Enter** (Umschalt+Enter = neue Zeile).
4. Zusehen: Links laufen die Schritte mit, im Diagramm leuchten die Stellen auf, an denen die KI arbeitet.
5. Danach: Leiste über dem Diagramm und Reiter **Δ Änderungen** zeigen, was sich geändert hat. **▶ ausführen** startet das Programm.

Ein leerer Ordner geht auch – Claude Code legt die Dateien dann an, das Diagramm füllt sich live.

### 1.1 Anderes Projekt öffnen (seit 3.8 / Bridge 1.11)

Die Bridge muss dafür nicht neu gestartet werden: Oben **Projekt öffnen** (oder **Strg+O**) schickt den neuen Pfad an die Bridge.

- **Durchsuchen …** öffnet den normalen Ordner-Dialog des Betriebssystems (Windows-Explorer-Dialog, auf dem Mac der Finder-Dialog). Er erscheint auf dem Rechner der Bridge und kann hinter dem Browserfenster liegen.
- Oder den **Pfad eintippen** / einfügen und **Enter**.
- **Zuletzt geöffnet:** die letzten 12 Projekte (gespeichert in `~/.codeatlas_recent.json`).
- **Ordner durchsuchen:** eingebauter Ordner-Browser (↑ übergeordnet, ⌂ Benutzerordner, Laufwerke). Klick wählt, Doppelklick oder → wechselt hinein, **Öffnen** öffnet. Ordner mit `.git`, `.cbp`, `pyproject.toml`, `package.json`, `CMakeLists.txt` oder `Makefile` tragen das Etikett **Projekt**. Er funktioniert auch, wenn Python ohne tkinter installiert ist (dann fehlt nur *Durchsuchen …*).

Beim Wechsel baut die Bridge alles für den neuen Ordner neu auf – gleiche Adresse, gleiches Token – und die Oberfläche lädt das Projekt nach etwa einer Sekunde neu. Läuft gerade ein KI-Auftrag oder ein Programm, fragt der Dialog vorher nach (**Trotzdem wechseln** beendet beides). Der KI-Verlauf und die Kontrollpunkte gehören zum jeweiligen Projekt (`.codeatlas/` im Projektordner) und sind nach dem Zurückwechseln wieder da.

Aus Sicherheitsgründen geht der Wechsel nur am Rechner der Bridge selbst (Zugriff über 127.0.0.1), nicht über VPN/Netzwerk. Ohne Bridge heißt der Knopf weiter **Ordner** und öffnet den Ordner im Browser (nur ansehen).

---

## 2. Aufbau: Bridge und Oberfläche

```
┌──────────────────────────┐   HTTP + Ereignisströme (SSE)   ┌──────────────────────────────┐
│ Oberfläche               │ ◄─────────────────────────────► │ Bridge (codeatlas_bridge.py) │
│ CodeAtlas.html (React)   │   nur 127.0.0.1, mit Token      │ Python, nur Standardbibliothek│
│ Diagramm, KI-Verlauf,    │                                 │ Dateien, Build, Ausführen,    │
│ Änderungen, Editor       │                                 │ Kontrollpunkte, Claude Code   │
└──────────────────────────┘                                 └──────────────┬───────────────┘
                                                                            │ startet / liest mit
                                                     ┌──────────────────────┴───────────────┐
                                                     │ claude -p … --output-format stream-json│
                                                     │ (oder Claude Code im Terminal + Hooks) │
                                                     └────────────────────────────────────────┘
```

**Bridge** (`codeatlas_bridge.py`) – der lokale Kern:

- liest den Projektordner, beobachtet Dateiänderungen und meldet sie an die Oberfläche,
- startet Build und Programm (nur vorab festgelegte Konfigurationen, „nur Presets“),
- schreibt Dateien (einzeln oder als Patch über mehrere Dateien, ganz oder gar nicht),
- legt Kontrollpunkte an und setzt auf sie zurück,
- startet Claude Code, übersetzt dessen Ereignisstrom in verständliche Schritte und vermittelt Freigaben,
- liefert die Oberfläche aus (`CodeAtlas.html`).

**Oberfläche** (`CodeAtlas.html`, gebaut aus `CodeAtlasLab.jsx`):

- analysiert den Quelltext heuristisch (Muster, keine echten Compiler-Parser) und baut daraus das Modell: Bausteine, Funktionen, Variablen, Verbindungen,
- zeichnet das Diagramm auf einer Canvas-Zeichenfläche (eine Ebene für das Diagramm, eine Überlagerung für Live-Effekte),
- vergleicht Modelle (vorher/nachher) und zeigt die Unterschiede,
- funktioniert eingeschränkt auch ohne Bridge (Datei direkt öffnen, Ordner/ZIP laden, Code einfügen) – dann ohne KI, Build und Live-Überwachung.

**Warum das Dateisystem die Wahrheit ist:** Claude Code ändert Dateien nicht immer über sein Edit-Werkzeug, sondern oft auch über Shell-Befehle. Deshalb liest der Atlas Änderungen aus dem Dateisystem (Kontrollpunkt vorher ↔ jetziger Stand), nicht aus den Werkzeug-Meldungen. Die Meldungen nutzt er nur, um zu zeigen, *wo die KI gerade arbeitet*.

---

## 3. Die Oberfläche im Überblick

### 3.0 Zwei Ansichten: Einfach und Erweitert (seit 5.0)

Der Atlas startet in der **einfachen Ansicht**: links der Chat mit Claude Code, rechts das Diagramm mit allen Funktionen – sonst nichts.

```
┌ CodeAtlas · ● Projektname ▾                                   [Erweitert]  ⚙ ┐
├───────────────────────┬──────────────────────────────────────────────────────┤
│ Chat                  │                                                      │
│ Verlauf, Freigaben,   │                    Diagramm                          │
│ Eingabefeld           │  Zoomstufen                              Übersicht   │
└───────────────────────┴──────────────────────────────────────────────────────┘
```

- **Projektname** oben öffnet den Dialog „Projekt öffnen“.
- **Erweitert** (oben rechts) blendet alles Weitere ein: die Reiter Plan, Team und Struktur, die Details-Leiste, die Konsole (Änderungen, Ausführen, Tests, Analyse, Editor …), die Werkzeugknöpfe (Verbindungen, Ausführen, Dateien/ZIP, Code einfügen, Demo) und die Statuszeile. Ein zweiter Klick führt zurück. Die Wahl bleibt gespeichert.
- Brauchst du in der einfachen Ansicht etwas aus der Konsole – etwa über „Δ vergleichen“ unter einem Auftrag oder die Taste K –, **klappt sie auf** und verschwindet wieder, wenn du sie mit ▾ schließt.
- Solange die KI arbeitet, läuft ein Lauflicht unter der Kopfzeile, und daneben steht, was sie gerade tut.

### 3.0.1 Einstellungen (⚙ oben rechts oder Strg+,)

| Bereich | Inhalt |
|---|---|
| **Ansicht** | Einfach/Erweitert, Sprache (Deutsch/Englisch), Farbschema (Dunkel/Hell/System), Akzentfarbe (Türkis, Limette, Rosa, Eisblau – gilt auch im Diagramm), Breite des Chats, Übersichtskarte, Zoomstufen-Leiste, Animationen |
| **KI** | Agent, Aufwand, Kamera folgt der KI, Auswahl als Kontext, Claude Code im Terminal mitlesen, Konto |
| **Automatik** | Build prüfen, Build-Fehler zurückgeben, Tests nach jedem Auftrag, Qualitätstor (Tests/Build/Regeln), Commit pro Auftrag, Projektkarte in CLAUDE.md |
| **Projekt** | Projekt öffnen, Verbindungen, Dateien/ZIP, Code einfügen, Demo, Stresstest |
| **Tastatur** | alle Tastenkürzel |

Die KI- und Automatik-Schalter sind dieselben wie unter ⚙ in der KI-Leiste der erweiterten Ansicht; beide Stellen ändern denselben Wert. Gespeichert wird im Browser (`cal-ui`, `cal-vopt`, `cal-theme`, `cal-lang`).

### 3.1 Erweiterte Ansicht

```
┌ Kopfzeile: Logo · ✦ KI · Projekt öffnen · Dateien/ZIP · Code einfügen · Verbindungen · Ausführen · Demo · Zoomstufen · Erweitert · ⚙ · Theme ┐
├──────────────┬─────────────────────────────────────────────────────────────┬─────────────────┤
│ Linke Leiste │ Leiste: Δ seit … · Zähler · Markieren · Nur Δ · KI folgen   │ Rechte Leiste   │
│ ✦ KI         │                                                             │ Details zur     │
│ Struktur     │                 Diagramm                         [›]        │ Auswahl         │
│              │                                                             │ (einklappbar)   │
│              │ Zoomleiter                                  Minimap         │                 │
│              ├─────────────────────────────────────────────────────────────┤                 │
│              │ Konsole: Δ Änderungen · Ausführen · Editor · Dateien · …     │                 │
├──────────────┴─────────────────────────────────────────────────────────────┴─────────────────┤
│ Statuszeile: Projekt · Verbindung · Dateien · Knoten · Kanten · Stufe · Zoom · Version      │
└────────────────────────────────────────────────────────────────────────────────────────────┘
```

- **Linke Leiste:** Reiter **✦ KI** (Aufträge, Verlauf, Freigaben) und **Struktur** (Dateibaum, Suche, Filter).
- **Mitte:** das Diagramm. Darüber die Änderungsleiste, unten links die Zoomleiter, unten rechts die Minimap.
- **Rechte Leiste:** Details zur Auswahl. Abschnitte per Klick auf die Überschrift einklappbar, die ganze Leiste über **›** oben rechts am Diagramm.
- **Konsole unten:** Reiter für Änderungen, Ausführen, Editor, Dateien, Suche, Probleme, Symbole, Export. Taste **K** klappt sie auf und zu.
- **Schmale Fenster (≤ 900 px):** Die Seitenleisten werden zu Schubladen, erreichbar über die Knöpfe in der Kopfzeile.
- **Farbschema:** dunkel, hell oder automatisch (Knopf rechts in der Kopfzeile).

---

## 4. Vibecoding mit Claude Code

### 4.1 Auftrag stellen

Im Reiter **✦ KI**:

- **Eingabefeld:** Was soll gebaut oder geändert werden? **Enter** sendet, **Umschalt+Enter** macht eine neue Zeile. Taste **I** springt von überall ins Feld.
- **Kontext:** Ist im Diagramm etwas ausgewählt (Baustein, Funktion, Variable), erscheint unter dem Feld „Kontext: …“. Beim Senden wird dem Auftrag eine Zeile vorangestellt, z. B. `[Kontext aus dem Diagramm: Funktion tor_zyklus in src/tor.c, Zeile 23]`. So bezieht sich „mach das schneller“ auf genau diese Stelle. Mit **×** entfernst du den Kontext.
- **Senden / Stopp:** Während ein Auftrag läuft, stehen **➤ Senden** und **■ Stopp** nebeneinander. Stopp unterbricht Claude Code (erst sanft, dann hart).

### 4.1a Nachrichten während der Arbeit

Wie im Terminal kannst du Claude Code schreiben, während es arbeitet – z. B. „nimm lieber eine Funktion statt eines Makros“ oder „die Datei io.c nicht anfassen“.

- Einfach ins Feld tippen und **Enter**. Die Nachricht erscheint im Verlauf mit violettem Rand.
- Status darunter: *an Claude Code gesendet – wird beim nächsten Schritt aufgenommen …* → **✓ von Claude Code aufgenommen**. Claude Code berücksichtigt sie im selben Auftrag, es entsteht kein neuer.
- Kommt die Nachricht erst, wenn der Auftrag schon abschließt, wird sie automatisch zum **nächsten Auftrag** in derselben Sitzung („kommt als nächster Auftrag dran“).
- Bei **Stopp** werden wartende Nachrichten verworfen (Hinweis im Verlauf).

So funktioniert es: Die Bridge startet Claude Code mit `--input-format stream-json --replay-user-messages`. Die Eingabe bleibt während des Auftrags offen; jede Nachricht geht als weitere Nutzer-Nachricht hinein. Claude Code meldet mit einer „Replay“-Bestätigung, wann es sie aufgenommen hat. Den Auftrag schließt die Bridge erst, wenn alle gesendeten Nachrichten bestätigt sind und das Ergebnis vorliegt – dann schließt sie die Eingabe, und Claude Code beendet sich.

### 4.1b Bilder und Dateien anhängen

- **📎** neben Senden, Dateien ins Eingabefeld **ziehen** oder ein Bild mit **Strg+V** einfügen (z. B. einen Screenshot).
- Die Anhänge erscheinen als Kärtchen über dem Feld (Bilder mit Vorschau, ✕ zum Entfernen) und werden sofort zur Bridge hochgeladen. Senden geht, sobald der Upload fertig ist; auch ohne Text.
- Geht beim neuen Auftrag und bei Nachrichten während der Arbeit.
- **Bilder** (PNG, JPEG, GIF, WebP bis ca. 3,7 MB) bekommt Claude Code **direkt als Bild** – es sieht sie also wirklich.
- **Alle Dateien** (auch PDFs, Datenblätter, Logs, größere Bilder) werden unter `.codeatlas/uploads/` im Projekt gespeichert; im Auftrag steht ein Hinweis mit dem Pfad, Claude Code liest sie dann mit seinem Read-Werkzeug (das kann auch PDFs).
- Höchstens 10 MB je Datei, bis zu 20 Anhänge je Nachricht. Dateinamen werden bereinigt.
- Anhänge zählen nicht als Projektänderung und landen nicht in den Kontrollpunkten.
- Die Vorschaubilder im Verlauf gibt es nur in der laufenden Sitzung; nach dem Neuladen steht dort der Dateiname.

### 4.1c Skills auswählen und anlegen

Claude Code benutzt Skills von selbst, wenn ihre Beschreibung zum Auftrag passt. Mit der Auswahl kannst du einen Skill gezielt vorgeben.

**Auswählen**

- **／** neben der Büroklammer öffnet die Liste – oder einfach **/** am Anfang des Eingabefelds tippen (wie in Claude Code) und weiterschreiben, die Liste filtert mit.
- Gruppiert nach **Projekt**, **Persönlich**, **Plugins** und **Eingebaut**, mit Beschreibung. Suchen über das Feld oben, **↑↓** und **Enter** zum Wählen, **Esc** schließt.
- Gewählte Skills erscheinen als Kärtchen über dem Eingabefeld (✕ entfernt, **Rücktaste** im leeren Feld entfernt den letzten).
- Beim Senden wird der erste Skill als `/name` an den Anfang gestellt – so ruft Claude Code ihn direkt auf, dein Text dahinter sind seine Argumente. Weitere Skills kommen als Hinweis „Verwende außerdem den Skill …“ dazu. Bei Nachrichten während der Arbeit stehen alle als Hinweis im Text.
- Befehle (`.claude/commands/*.md`) erscheinen mit der Marke „Befehl“ und ggf. ihrem Argument-Hinweis.
- Benutzt Claude Code einen Skill, steht im Verlauf **✦ nutzt Skill /name**.

**Woher die Liste kommt**

| Ort | Pfad | bearbeitbar |
|---|---|---|
| Projekt | `<Projekt>\.claude\skills\<name>\SKILL.md`, Befehle in `.claude\commands\` | ja |
| Persönlich | `%USERPROFILE%\.claude\skills\<name>\SKILL.md`, Befehle in `%USERPROFILE%\.claude\commands\` | ja |
| Plugins | aus `%USERPROFILE%\.claude\plugins\installed_plugins.json` und den Plugin-Pfaden, die Claude Code beim Start meldet | nur ansehen |
| Eingebaut | Namen, die Claude Code beim Start meldet, ohne eigene Datei | nein |

Die Bridge liest die Dateien bei jedem Öffnen der Liste neu (↻ erzwingt es). Zusätzlich merkt sie sich, welche Skills Claude Code beim letzten Start als aktiv gemeldet hat (`.codeatlas\claude-init.json`). Vor dem ersten Auftrag fehlen deshalb eventuell eingebaute Skills; Skills, die Claude Code nicht gemeldet hat (z. B. deaktiviertes Plugin), sind als „inaktiv“ markiert.

**Neu anlegen** – „＋ Neuer Skill“ unten in der Liste:

- **Name** (wird zu `/name`; Kleinbuchstaben, Ziffern, Bindestriche), **Ort** (Projekt oder Persönlich), **Wann benutzen?** (die Beschreibung – danach entscheidet Claude Code, wann es den Skill verwendet) und die **Anleitung** in Markdown.
- **Anlegen** schreibt sofort `…\skills\<name>\SKILL.md` mit YAML-Kopf. Ein bestehender Skill wird nicht überschrieben.
- **✦ Von Claude Code schreiben lassen** schickt stattdessen einen Auftrag: Claude Code formuliert den Skill aus deiner Idee selbst aus (und nutzt dafür einen Skill-Ersteller, falls vorhanden). Du siehst es live im Verlauf.

**Bearbeiten** – ✎ an einem Projekt- oder persönlichen Skill öffnet die komplette SKILL.md zum Ändern; 👁 zeigt Plugin-Skills schreibgeschützt.

### 4.1d Modell und Aufwand

- **Modell:** Auswahl neben den Arbeitsweisen – *Standard*, *Fable*, *Opus*, *Sonnet*, *Haiku* oder *Eigenes …* (voller Modellname, z. B. `claude-opus-5-5`). Gilt ab dem nächsten Auftrag, auch mitten in einer Sitzung; Claude Code setzt den Verlauf mit dem neuen Modell fort.
- *Standard* heißt: das Modell aus dem Startparameter `--model` der Bridge (steht dann in Klammern dahinter), sonst die Voreinstellung von Claude Code.
- **Aufwand** (⚙ → Aufwand): *Standard*, niedrig, mittel, hoch, sehr hoch, maximal – wie gründlich Claude Code nachdenkt (`--effort`).
- Jeder Auftrag zeigt im Kopf das Modell, das Claude Code tatsächlich gemeldet hat (z. B. `haiku-5-5 · low`).
- Technisch: `--model <name>` und `--effort <stufe>` beim Start von Claude Code. Erlaubt sind nur Modellnamen aus Buchstaben, Ziffern und `. _ - : [ ]`.

### 4.1e Konto

Unter ⚙ → **Konto (Claude Code)** siehst du, ob und womit Claude Code angemeldet ist: E-Mail, Organisation und Abo (soweit Claude Code sie meldet), sonst Anmeldeart und Anbieter.

- **Neu anmelden / Anmelden:** wählbar *Claude-Abo* (Pro, Max, Team …) oder *Console* (Abrechnung nach API-Nutzung). Claude Code öffnet die Anmeldeseite im Browser; über **Anmeldeseite öffnen ↗** geht es auch von Hand. Zeigt die Seite einen Code, fügst du ihn ins Feld ein und klickst **Senden**. Abbrechen jederzeit möglich, nach 15 Minuten bricht die Bridge selbst ab.
- **Abmelden** (mit Rückfrage) – nicht, während ein Auftrag läuft.
- ↻ fragt den Status neu ab.

Technisch ruft die Bridge die offiziellen Befehle `claude auth status --json`, `claude auth login [--claudeai|--console]` und `claude auth logout` auf. Zugangsdaten bleiben bei Claude Code; die Bridge sieht nur die Statusangaben und reicht den Code an `claude auth login` weiter.

### 4.2 Die drei Arbeitsweisen

| Arbeitsweise | Was Claude Code darf | Wann sinnvoll |
|---|---|---|
| **Planen** | nur lesen und einen Plan vorlegen, keine Änderung | vor größeren Umbauten; danach erscheint **Plan umsetzen** |
| **Nachfragen** | jede Datei-Änderung und jeder Befehl braucht deine Freigabe | heikle Stellen, fremder Code, wenn du jeden Schritt sehen willst |
| **Ändern** | Dateien frei ändern; Shell-Befehle brauchen deine Freigabe | normales Arbeiten |

Technisch: Planen = `--permission-mode plan`, Ändern = `--permission-mode acceptEdits`, Nachfragen = ohne Modus (jede Aktion löst eine Freigabe-Anfrage aus).

**▶ Plan umsetzen** schickt in derselben Sitzung den Folgeauftrag „Setze den vorgelegten Plan jetzt um.“ in der Arbeitsweise „Ändern“. Alternativ schreibst du unten Änderungswünsche zum Plan.

### 4.3 Freigaben

Will Claude Code etwas tun, das deine Zustimmung braucht, erscheint eine **Freigabe-Karte** im Verlauf:

- zeigt Werkzeug und Inhalt (Befehl, Datei, alter/neuer Text),
- **Erlauben** / **Ablehnen**,
- **Immer erlauben** merkt sich die Art für die laufende Bridge-Sitzung, z. B. `Bash:make` (alle `make`-Aufrufe) oder ein Werkzeug,
- ohne Antwort wird nach 5 Minuten automatisch abgelehnt.

So funktioniert es: Die Bridge startet Claude Code mit einer eigenen Einstellungsdatei (`.codeatlas/agent-settings.json`), die einen `PermissionRequest`-Hook einträgt. Will Claude Code etwas Freigabepflichtiges tun, ruft es den Hook auf; der fragt bei der Bridge nach und wartet, bis du in der Oberfläche entschieden hast.

### 4.4 Der Verlauf

Jeder Auftrag ist ein Block mit Nummer, Agent, Arbeitsweise, Uhrzeit und deinem Auftragstext. Darin, in zeitlicher Reihenfolge:

| Zeile | Bedeutung |
|---|---|
| ◉ **liest** `datei` · Zeile a–b | Claude Code liest eine Datei |
| ⌕ **sucht** `muster` | Suche im Projekt |
| ✎ **ändert** `datei` · Zeile … | Änderung an einer bestehenden Datei, mit Mini-Diff (aufklappbar ▸) |
| ✚ **schreibt** `datei` | neue Datei oder komplett neu geschrieben |
| ▸ **führt aus** `befehl` | Shell-Befehl, mit Beschreibung und Ausgabe (aufklappbar) |
| **Δ** + `name()` ~ `name()` − `name()` | Vermerk der Änderungsebene: was sich im Modell tatsächlich geändert hat, plus neue Verbindungen |
| Text | Antworten von Claude Code (Markdown: fett, `Code`, Listen) |

Ein **Klick auf einen Schritt** springt im Diagramm an die Stelle und öffnet bei Änderungen den Diff der Datei. Ein Klick auf einen Δ-Vermerk zeigt den Baustein.

Am Ende jedes Auftrags steht die Bilanz: **✓ fertig** / **abgebrochen** / **Fehler**, Anzahl Schritte, Dauer, geschätzte Kosten, abgelehnte Freigaben. Dazu:

- **▶ ausführen** – Programm mit Live-Trace starten (nur nach dem letzten erfolgreichen Auftrag, wenn eine Start-Konfiguration existiert),
- **Δ vergleichen** – Diagramm und Änderungsliste mit dem Stand *vor diesem Auftrag* vergleichen.

Während Claude Code arbeitet, zeigt der Kopf des Verlaufs den Zustand: *fragt an*, *denkt nach*, *arbeitet* mit Details.

### 4.5 Sitzungen

- Der nächste Auftrag setzt die laufende Claude-Code-Sitzung fort (`--resume`), Claude Code kennt also den bisherigen Verlauf. Der Kopf zeigt dann „bereit · mit Verlauf“.
- **Neu** beginnt eine frische Sitzung und leert den Verlauf in der Oberfläche.
- Der Verlauf überlebt das Neuladen der Seite (die Bridge spielt ihn neu ab), aber nicht das Beenden der Bridge (siehe [Abschnitt 12](#12-wo-was-gespeichert-wird)).

### 4.6 Einstellungen (⚙)

| Einstellung | Wirkung |
|---|---|
| **Agent** | Auswahl, falls mit `--agent` weitere Agenten eingerichtet sind (z. B. Claude Code mit Haiku) |
| **Kamera folgt der KI** | Kamera fährt dorthin, wo die KI arbeitet – einmal pro Schritt, höchstens alle 2,5 s; pausiert, solange du selbst schiebst, zoomst oder die Maus übers Diagramm bewegst (5 s). Siehe 5.4 |
| **Auswahl im Diagramm als Kontext mitgeben** | Diagramm-Auswahl automatisch dem Auftrag voranstellen |
| **Nach jedem Auftrag Build prüfen** | startet nach erfolgreichem Auftrag die gewählte Build-Konfiguration |
| **Build-Fehler automatisch an die KI zurückgeben** | bei Build-Fehlern automatisch einen Korrekturauftrag senden (Reparaturschleife, höchstens 3 Versuche, dann Stopp) |
| **Qualitätstor** | Tests (betroffene) / Build / Architekturregeln vor „fertig“ prüfen, siehe 4A.5 |
| **Nach jedem Auftrag committen** | Git-Commit je Auftrag mit Änderungen, siehe 4A.9 |
| **Projektkarte in CLAUDE.md aktuell halten** | siehe 4A.8 |
| **Claude Code im Terminal mitlesen** | Hooks in `.claude/settings.local.json` ein-/austragen (siehe [Abschnitt 11](#11-claude-code-im-terminal-mitlesen-hooks)) |

Die Einstellungen werden im Browser gemerkt.

### 4.7 Fehler an die KI geben

Im Reiter **Probleme** gibt **✦ Fehler an KI geben** die aktuellen Compiler-Fehler als Auftrag an Claude Code (Datei, Zeile, Meldung, mit der Bitte, nur das Nötige zu ändern). Das ist derselbe Text, den die automatische Reparaturschleife verwendet.

### 4.8 Was im Hintergrund passiert (Ablauf eines Auftrags)

1. Oberfläche sendet `POST /api/agent/start` mit Agent, Auftrag und Arbeitsweise.
2. Bridge legt einen **Kontrollpunkt** an (Stand aller Textdateien) – benannt nach dem Auftrag.
3. Bridge startet `claude -p --output-format stream-json --verbose --include-partial-messages --input-format stream-json --replay-user-messages [--permission-mode …] [--resume <id>] --settings .codeatlas/agent-settings.json`. Der Auftrag (Text + Bilder) geht als JSON-Nachricht über die Standardeingabe, die für Nachrichten während der Arbeit offen bleibt.
4. Jede Zeile des Ereignisstroms wird in ein normiertes Ereignis übersetzt (`turn`, `text`, `tool`, `perm`, `status`, `note`, `idle`) und über `GET /api/agent/events` an die Oberfläche geschickt.
5. Die Oberfläche zeigt die Schritte, setzt im Diagramm Blickpunkte (wo liest/ändert die KI?) und lädt geänderte Dateien nach, sobald der Datei-Beobachter sie meldet.
6. Nach jedem Neuladen vergleicht sie altes und neues Modell → Δ-Vermerke, Markierungen, neue Verbindungen.
7. Am Ende: Bilanz, Datei-Beobachter wird sofort angestoßen, Build-/Start-Konfigurationen werden neu erkannt (neue Dateien!), optional Build und Reparaturschleife.

---

## 4A. Planvoll vibecoden: Graph, Pipeline, Qualitätstor, Team (seit 4.0 / Bridge 2.0)

Ab Version 4 arbeitet Claude nicht mehr nur *unter* dem Atlas, sondern *mit* ihm: Das Diagramm, die Testzuordnung, Regeln und Pläne stehen Claude als Werkzeuge zur Verfügung, und der Atlas prüft Ergebnisse, bevor Claude „fertig“ melden darf.

### 4A.1 Der Graph als Werkzeug für Claude

Nach jedem Neuaufbau schickt die Oberfläche das Diagramm (Bausteine, Funktionen, Aufrufer/Aufgerufene, Zeilen) an die Bridge (`POST /api/graph`, gespeichert in `.codeatlas/graph.json`). Der MCP-Server `codeatlas` bietet Claude damit:

| Werkzeug | Liefert |
|---|---|
| `atlas_orient` | Überblick: Module, zentrale Bausteine, Einstiegspunkte, Testlage – statt viele Dateien zu lesen |
| `atlas_find` | Symbol suchen (Name, Teilname, `Datei:Zeile` oder Zeile aus einem Stacktrace) |
| `atlas_impact` | Wirkungsbereich: wer hängt (in Ebenen) von einer Funktion ab, welche Dateien, **welche Tests** |
| `atlas_trace` | Aufrufpfad von A nach B |
| `atlas_read` | Quelltext genau einer Funktion + ihre Aufrufer und Aufgerufenen |
| `atlas_rules` | Architekturregeln und aktuelle Verstöße |
| `plan_get`, `plan_set_spec`, `plan_set_plan`, `plan_set_tasks`, `plan_task_update` | Pipeline lesen und füllen (4A.3) |
| `tests_run` mit `betroffene` | nur die Tests, die geänderten Code ausführen |

Claude bekommt im Systemhinweis gesagt, dass es diese Werkzeuge vor dem Lesen ganzer Dateien nutzen soll. Ohne Oberfläche (nur Terminal) liegt der zuletzt gesendete Graph in `graph.json`; ist er veraltet, sagt das Werkzeug es dazu.

### 4A.2 Wirkungsbereich und betroffene Tests

- **Rechte Leiste → ◎ Wirkungsbereich von …** färbt alle abhängigen Stellen im Diagramm (Ebene 1 kräftig, weitere blasser) und zeigt oben eine Leiste „n abhängige Stellen · m Dateien“ mit den betroffenen Tests.
- **Freigabekarte:** Will Claude eine Datei ändern, steht in der Freigabe, wie viele Stellen davon abhängen und welche Tests es trifft.
- **Testzuordnung:** Bei jedem Testlauf merkt sich die Bridge, welcher Test welche Funktionen ausführt (`.codeatlas/test-map.json`). „Nach KI-Auftrag automatisch testen“ und das Qualitätstor laufen danach nur noch die betroffenen Tests; ist die Zuordnung noch leer, laufen alle.

### 4A.3 Pipeline: Idee → Spezifikation → Plan → Aufgaben → Umsetzen

Reiter **◆ Plan** links. Du schreibst die Idee; Claude erstellt nacheinander Spezifikation, Plan und Aufgaben und speichert sie über die Plan-Werkzeuge (`.codeatlas/pipeline.json`). Jede Stufe gibst du frei, überarbeitest sie mit einem Hinweis oder bearbeitest sie selbst. Aufgaben haben Dateien, Symbole, Abhängigkeiten und eine Prüfung; ein Klick auf eine Aufgabe zeigt ihre Stellen im Diagramm.

- **▶ Nächste** setzt die nächste freie Aufgabe um (Arbeitsweise „Ändern“). Claude setzt den Status selbst (in Arbeit → erledigt/blockiert mit Notiz).
- **alle nacheinander** startet nach jeder erledigten Aufgabe automatisch die nächste und stoppt bei Fehlern oder blockierten Aufgaben.
- **Neu beginnen** leert die Pipeline.

### 4A.4 Architekturregeln

**Konsole → ◈ Analyse → Regeln & Zyklen**: Regeln der Form „Muster ↛ Muster“ (Modul/Ordner, Datei oder Glob, z. B. `src/gui ↛ src/db`). Der Atlas prüft sie bei jedem Neuaufbau, zeigt Verstöße mit Datei/Zeile unter **Probleme** und findet Abhängigkeitszyklen zwischen Modulen. Gespeichert in `.codeatlas/rules.json`; Claude liest sie über `atlas_rules`.

### 4A.5 Qualitätstor (Stop-Hook)

⚙ → **Qualitätstor**: Tests (betroffene), Build, Architekturregeln – jeweils abschaltbar. Will Claude den Auftrag beenden, ruft Claude Code den Stop-Hook auf; die Bridge prüft das Gewählte. Scheitert etwas, bekommt Claude den Bericht (fehlgeschlagene Tests mit Ort, Build-Fehler, Regelverstöße) und arbeitet weiter – höchstens 3 Runden, dann gibt das Tor auf und meldet es. Im Verlauf erscheinen die Runden als Einträge „QUALITÄTSTOR · Runde n“ mit aufklappbarem Bericht.

### 4A.6 Team: parallele Agenten in Git-Worktrees

Reiter **⇉ Team** (Projekt muss ein Git-Repository mit mindestens einem Commit sein). Jeder weitere Agent bekommt einen eigenen Worktree unter `.codeatlas/team/<name>` auf dem Branch `atlas/<name>` – Ausgangspunkt wahlweise der aktuelle Stand (inkl. nicht committeter Änderungen) oder der letzte Commit.

- Seine Schritte erscheinen im Diagramm **in seiner Farbe**; Freigaben beantwortest du in seiner Karte.
- Die Karte zeigt geänderte Dateien, Kosten und **Konflikte** (Datei auch von einem anderen Agenten oder im Hauptprojekt geändert).
- **Δ Änderungen** zeigt den Diff, **⇢ Zusammenführen** committet im Worktree und führt mit `--no-ff` zusammen. Gibt es Konflikte, wird der Merge abgebrochen und das Hauptprojekt bleibt unverändert; die Konfliktdateien werden genannt. **✕ Verwerfen** entfernt Worktree und Branch.
- Die Team-Agenten haben keine Atlas-Werkzeuge (der Graph gehört zum Hauptprojekt).

### 4A.7 Aufträge abspielen

Unter jedem beendeten Auftrag startet **▶ abspielen** eine Wiedergabe: Die Schritte laufen nacheinander über das Diagramm (Kamera folgt), mit Leiste für Pause, Einzelschritt, Tempo (1×, 2×, 4×) und Ende.

### 4A.8 Analyse: Kosten, Brennpunkte, toter Code, Architekturkarte

Konsole → **◈ Analyse**:

| Unterreiter | Inhalt |
|---|---|
| **Kosten** | Summe und Kosten je Auftrag; Kosten je Datei – die Kosten eines Auftrags werden auf die berührten Dateien verteilt (Ändern zählt dreifach, Lesen einfach). Als Wärmekarte im Diagramm einblendbar. Schätzwerte von Claude Code. |
| **Brennpunkte** | aus der Git-Historie (90 Tage / 1 Jahr / alles): wie oft und von wie vielen geändert × Größe, dazu Dateien, die oft gemeinsam geändert werden. Wärmekarte im Diagramm. |
| **Toter Code** | Funktionen ohne Aufrufer im statischen Graphen (ohne Einstiegspunkte, Tests, Handler) – nur ein Hinweis. |
| **Regeln & Zyklen** | siehe 4A.4 |
| **Architekturkarte** | kompakte Projektkarte (Module, Abhängigkeiten, zentrale Bausteine, Einstiegspunkte, Regeln, Tests); **In CLAUDE.md schreiben** legt sie zwischen `<!-- codeatlas:start -->` und `<!-- codeatlas:end -->` ab – der Rest der Datei bleibt unberührt. ⚙ → „Projektkarte in CLAUDE.md aktuell halten“ erneuert sie nach jedem Auftrag mit Änderungen. |

### 4A.9 Commit pro Auftrag

⚙ → **Nach jedem Auftrag committen**: Hat ein Auftrag Dateien geändert, committet der Atlas danach (Nachricht „KI: <Auftrag>“ plus Liste der Änderungen; ohne eingerichtete Git-Identität als „CodeAtlas“). Der Hash steht unter dem Auftrag im Verlauf – damit ist jeder Auftrag mit Git einzeln rückgängig zu machen (`git revert <hash>`).

---

## 5. Änderungen sehen: die Änderungsebene

### 5.1 Farben und Marken

| Darstellung | Bedeutung |
|---|---|
| Rahmen **blau**, Etikett „✦ LIEST“ / „SUCHT“ | die KI liest dort gerade |
| Rahmen **gelb/orange**, „✦ ÄNDERT“ / „SCHREIBT“ | die KI ändert dort gerade (pulsiert, solange der Schritt läuft) |
| Rahmen **violett**, „✦ FÜHRT AUS“ | Shell-Befehl läuft |
| feine gepunktete Linie | Blickpfad: woher die KI zuletzt kam |
| grüne Marke **NEU** + grüner Rahmen | Baustein ist neu |
| gelbe Marke **GEÄNDERT +n ~n −n** | Baustein geändert (neue / geänderte / entfernte Funktionen und Variablen) |
| rot gestrichelt **ENTFERNT** | Baustein existiert nicht mehr (als „Geist“ an seiner letzten Stelle) |
| Zeile mit grünem / gelbem Grund | einzelne Funktion oder Variable neu / geändert (ab Zoomstufe 2) |
| Kante grün mit **+** | neue Verbindung |
| Kante gelb | Verbindung geändert (z. B. weitere Aufrufe) |
| Kante rot gestrichelt mit **−** | Verbindung entfernt |

### 5.2 Die Leiste über dem Diagramm

- **Δ seit …** – womit verglichen wird (letzter Auftrag, Start der Bridge oder ein Kontrollpunkt). Ein Klick öffnet die Änderungsliste.
- **Zähler** – neue / geänderte / entfernte Bausteine und neue Verbindungen.
- **Markieren** – Änderungsebene ein/aus.
- **Nur Δ** – alles Unveränderte abblenden.
- **KI folgen** – Kamera folgt der KI.

### 5.3 Wie der Vergleich funktioniert

- Jeder Baustein bekommt einen **stabilen Schlüssel** aus Sprache, Art, Datei und Name. Er bleibt gleich, auch wenn sich Zeilennummern verschieben oder das Projekt neu analysiert wird – deshalb flackern die Marken nicht.
- Jede Verbindung hat den Schlüssel `von > nach > Art`.
- Funktionen und Variablen werden über ihren Namen verglichen, ihr Inhalt über den Quelltextausschnitt. So erkennt der Atlas „Funktion geändert“, auch wenn nur der Rumpf anders ist.
- Verbindungen auf Zeilenebene (Funktion A ruft B auf, liest/schreibt Variable X) werden einzeln verglichen.
- Zeilen-Diffs nutzen den Myers-Algorithmus (wie git diff).

Es gibt zwei Vergleiche gleichzeitig:

1. **schrittweise** (vorheriges Modell ↔ neues Modell, bei jedem Neuladen) → Δ-Vermerke im Verlauf und das kurze Aufleuchten,
2. **gegen eine Basis** (Kontrollpunkt ↔ jetzt) → die bleibenden Marken, Zähler und die Änderungsliste.

---

### 5.4 KI-Kamera und Bild im Bild

**Hauptkamera („KI folgen“):**
- Die Kamera zielt **einmal pro Werkzeug-Schritt**, sobald die Zieldatei feststeht – nicht mehr bei jedem Stück der gestreamten Eingabe (das war die Ursache für das Zittern).
- Höchstens **eine Fahrt alle 2,5 s**; weitere Schritte an *derselben* Struktur dürfen sofort nachziehen.
- Liegt die Stelle schon lesbar im Bild, bewegt sich nichts.
- Bei *Ändern* sucht der Atlas die Zeilen über den **alten** Text (der neue steht noch nicht in der Datei) – dadurch landet die Kamera auf der richtigen Funktion.
- Nach dem Neuaufbau des Modells springt die Kamera nur noch zu **neu entstandenen** Bausteinen, nicht mehr zu jedem geänderten.
- **Du hast Vorrang:** Schieben, Zoomen, Minimap oder Mausbewegung über dem Diagramm pausieren die Verfolgung für 5 s.

**Bild im Bild (unten links):**
- Greift die KI auf eine **andere Struktur** zu, die gerade nicht im Bild ist, und die Hauptkamera darf nicht fahren (du arbeitest selbst, *KI folgen* ist aus, oder die letzte Fahrt ist < 2,5 s her), öffnet sich unten links ein kleines Fenster.
- Es ist eine **zweite, vollwertige Ansicht** derselben Visualisierung: gleiche Darstellung, Änderungsebene und KI-Markierungen (LIEST / ÄNDERT / Fokuslinien), zentriert auf den Baustein bzw. die Funktion.
- Kopfzeile: farbiger Punkt nach Art (blau = liest, gelb = ändert, grün = erstellt, violett = führt aus) und Text wie „ändert rechnung.py › rechnung_schritt_6“.
- **Klick ins Fenster oder ⤢** springt im großen Diagramm dorthin und schließt das Fenster; **✕** schließt es.
- Schließt sich 6 s nach Ende des Schritts von selbst (nicht, solange die Maus darauf liegt). Fährt die Hauptkamera selbst zu dieser Struktur, verschwindet es.
- Unter 760 px Breite ausgeblendet.

## 6. Kontrollpunkte, Vergleich und Zurücksetzen

### 6.1 Was ein Kontrollpunkt ist

Ein Kontrollpunkt hält den Stand **aller Textdateien** des Projekts fest. Die Bridge legt automatisch einen an:

- beim Start der Bridge („Start der Bridge“),
- vor jedem Auftrag an die KI (benannt nach dem Auftrag, ohne Kontextzeile).

Dazu kannst du jederzeit selbst einen setzen (**＋ Kontrollpunkt**).

Speicherung: inhaltsadressiert in `.codeatlas/objects/` (jede Dateiversion nur einmal, Name = SHA-1), Beschreibung in `.codeatlas/checkpoints/<id>.json`. Es bleiben die letzten 80 Kontrollpunkte; nicht mehr gebrauchte Dateiversionen werden aufgeräumt. Binärdateien und versteckte Werkzeug-Ordner (`.git`, `.claude`, `.vscode` …) werden nicht erfasst.

### 6.2 Reiter „Δ Änderungen“

Oben die **Vergleichsbasis**: *seit dem letzten Auftrag* (Standard), *seit Start der Bridge* oder ein beliebiger Kontrollpunkt.

Links drei Listen:

- **Bausteine** – mit + ~ − und den einzelnen Funktionen/Variablen,
- **Verbindungen** – neu/entfernt, mit Art (ruft auf, liest, schreibt, Include, erbt …),
- **Dateien** – mit Zeilenbilanz (+n −n).

Rechts der **Diff** der gewählten Datei (mit Kontextzeilen).

Ein Klick auf einen **Baustein** zeigt ihn im Diagramm. Ein Klick auf eine **Verbindung** fährt beide Enden ins Bild und **hebt die Verbindung einige Sekunden lang hervor** – von der aufrufenden Funktion bis zur Ziel-Funktion oder -Variable.

### 6.3 Zurücksetzen

- **↶ an einer Datei** – nur diese Datei auf den Stand der Basis zurücksetzen.
- **↶ Alles zurücksetzen** – alle Dateien auf den Stand der Basis (mit Rückfrage „Wirklich?“). Neue Dateien werden gelöscht, gelöschte wiederhergestellt.
- **Zurücksetzen aufheben** – macht das letzte Zurücksetzen rückgängig. Das geht, weil jedes Zurücksetzen vorher selbst einen Schnappschuss anlegt.

Technisch läuft Zurücksetzen über denselben Patch-Mechanismus wie alle Schreibzugriffe: ganz oder gar nicht, mit Prüfung auf zwischenzeitliche Änderungen, unter Erhalt von Zeilenenden und Zeichensatz.

### 6.4 Handänderungen

Änderst du eine Datei selbst (im Atlas-Editor oder in deiner IDE), erscheint die Änderung genauso in der Änderungsliste und im Diagramm – der Atlas unterscheidet nicht, wer geändert hat, sondern zeigt den Unterschied zur Basis.

---

## 7. Das Diagramm

### 7.1 Was dargestellt wird

- **Bausteine (Knoten):** Klassen, Interfaces, Enums, Structs – und in prozeduralen Sprachen (C, Python-Module, ST …) **Module**: eine `.c` mit ihrer `.h` bildet einen Baustein «modul» mit Funktionen und globalen Variablen.
- **Ordnerrahmen:** Bausteine aus demselben Ordner liegen in einem gemeinsamen Rahmen (z. B. `src · 7`).
- **Zeilen:** Felder/Variablen oben, Methoden/Funktionen unten, mit Sichtbarkeit (`+` öffentlich, `-` privat/static, `#` geschützt).

### 7.2 Verbindungsarten

| Art | Bedeutung |
|---|---|
| erbt | Vererbung |
| implementiert | Interface |
| besitzt (Komposition/Assoziation) | Feld vom Typ einer anderen Klasse |
| ruft auf | Funktionsaufruf in einen anderen Baustein |
| greift zu (liest/schreibt) | Zugriff auf Variablen eines anderen Bausteins |
| Include / Import | `#include`, `import`, `use` … |
| verwendet (Typ) | Typ wird als Parameter, Rückgabe o. ä. verwendet |

Ab Zoomstufe 2 zeigen Kanten, **welche Funktion welche Funktion/Variable** nutzt (Zeile zu Zeile).

### 7.3 Zoomstufen

| Stufe | Name | Inhalt |
|---|---|---|
| 0 | Architektur | Ordner und Bausteine als Blöcke |
| 1 | Beziehungen | Bausteine mit Verbindungen und Beschriftungen |
| 2 | Detail | Variablen und Funktionen einzeln, anklickbar |
| 3 | Analyse | zusätzlich Zugriffe auf Zeilenebene, Muster |

Die Stufe wechselt automatisch mit dem Zoom (Mausrad, Pinch, Zoomleiter unten links) oder per Taste **0–3**.

### 7.4 Bedienung

- **Klick** wählt einen Baustein, **Doppelklick** fliegt hinein, im Detail-Zoom sind Zeilen einzeln wählbar.
- **Ziehen** verschiebt die Ansicht, einzelne Bausteine oder (am Rahmen-Etikett) ganze Ordner.
- **Minimap** unten rechts zum Springen.
- **F** passt alles ein, **Esc** löst die Auswahl.
- Das Layout bleibt beim Neuladen erhalten: neue Bausteine werden in die Nähe ihrer Nachbarn gesetzt, bestehende behalten ihren Platz.

### 7.5 Muster-Erkennung

Der Atlas erkennt heuristisch Entwurfsmuster (Singleton, Factory, Builder, Observer, Strategy, Decorator, Composite, Adapter) und zeigt sie als Plakette in der rechten Leiste. Das ist ein Hinweis, keine Garantie.

---

### 7.6 Leistung in großen Projekten

Die Kosten eines Bildes stecken fast nur in den **Kanten** – genauer: in der Pixellänge aller gezeichneten Kurven, die die Grafikkarte rastern muss. Gestrichelte Linien sind am teuersten, weil jeder Strich einzeln berechnet wird. Knoten und Text fallen kaum ins Gewicht. Deshalb (seit 3.5):

- **Zuschnitt auf den sichtbaren Teil:** Jede Kurve wird rekursiv geteilt (de Casteljau). Gezeichnet werden nur die Stücke im Bild, Kanten, deren Hülle das Bild nur streift, fallen ganz weg. Beim Reinzoomen ragten früher tausende Kanten zehntausende Pixel über den Rand, die trotzdem gestrichelt und gerastert wurden.
- **Längenbudget:** Zusätzlich zur Anzahl gibt es eine Grenze für die sichtbare Gesamtlänge (Stand ≈ 700 000 px, beim Navigieren ≈ 260 000 px). Wichtige Arten zuerst (Vererbung → … → Typ-Abhängigkeit), innerhalb einer Art die **kurzen, lesbaren Verbindungen zuerst**. Ausgewählte, hervorgehobene und geänderte Verbindungen werden immer gezeichnet. Der Budget-Schalter rechts (2k … 60k) skaliert die Grenze mit, **„alle“** schaltet sie ab. Die Statuszeile zeigt „Kanten x / y im Bild (lange/überzählige ausgeblendet)“.
- **Leichtes Bild während der Bewegung:** Beim Schieben, Zoomen und bei Kamerafahrten weniger Kanten, keine Kantenbeschriftungen, und bei mehr als 250 Kanten einer gestrichelten Art durchgezogene, blassere Linien statt Strichelung. 170 ms nach der Bewegung folgt einmal das volle Bild.
- **Strichelung nur, wo sie lesbar ist:** Ist die gestrichelte Gesamtlänge einer Art größer als ≈ 90 000 px, wird auch im Stand durchgezogen gezeichnet (die Farbe unterscheidet die Art weiterhin).
- **Echte Bildzeit:** Gemessen wird der Abstand aufeinanderfolgender Bilder, nicht nur die JavaScript-Zeit. Damit zählt die Rasterung auf der Grafikkarte mit. Ist selbst das leichte Bild zu langsam (> 30 ms), wird während der Bewegung das letzte Bild verschoben/skaliert gezeigt und danach scharf nachgezeichnet.
- Kleinere Einsparungen: Punktraster als ein einziger Pfad, Knotenköpfe ohne Clip-Pfade.

Messung (Chromium mit Software-Rasterung, 1 344 Klassen / 15 550 Kanten, volles Bild inkl. Rasterung; auf echter Grafikkarte sind alle Werte um ein Vielfaches kleiner, entscheidend ist das Verhältnis):

| Zoom | vorher | 3.5 |
|---|---|---|
| 20 % | 1 243 ms | 229 ms |
| 45 % | 1 194 ms | 264 ms |
| 100 % | 645 ms | 248 ms |
| 250 % | 236 ms | 131 ms |

**Python oder C?** Python steckt nur in der Bridge: Dateien lesen und schreiben, Claude Code starten, dessen Ausgabe weiterreichen. Gerechnet und gezeichnet wird im Browser (Parser und Diagramm in JavaScript, Rasterung auf der Grafikkarte). Eine Bridge in C würde am Ruckeln nichts ändern.

## 8. Rechte Leiste: Details

**Ohne Auswahl:** Projektname, Sprachen, **Zentrale Klassen** (die Bausteine mit den meisten Verbindungen), Bedienhilfe, Parser-Warnungen.

**Mit Auswahl eines Bausteins:**

- Kopf: Art, Sprache, Name, Datei und Zeilen, Muster; **✎ Bearbeiten** (interner Editor) und **↗ IDE** (externe IDE an der Zeile),
- Live-Block während eines Programmlaufs (Aufrufe, Haltepunkte),
- Probleme dieses Bausteins aus dem letzten Build,
- Kennzahlen: Felder/Variablen, Methoden/Funktionen, eingehende und ausgehende Verbindungen,
- bei gewählter Funktion/Variable: Signatur, Sichtbarkeit, **ruft auf / aufgerufen von / schreibt / liest**, bei Variablen **schreibend/lesend von** (mit Warnung, wenn mehrere Module dieselbe Variable schreiben),
- Beziehungsabschnitte: Erbt von, Implementiert, Besitzt, Ruft Funktionen auf in, Wird aufgerufen von, Greift auf Variablen zu in, Include/Import, Eingebunden von, Verwendet …,
- Felder/Variablen und Methoden/Funktionen als Liste,
- Quelltextausschnitt (Klick auf eine Zeile öffnet den Editor dort).

**Einklappen:**

- Ein Klick auf eine **Abschnittsüberschrift** klappt den Abschnitt ein oder aus (▾/▸). Der Zustand gilt für alle Bausteine gleich und bleibt nach dem Neuladen erhalten. Bedienbar auch per Tastatur (Tab, Enter/Leertaste).
- **›** oben rechts am Diagramm blendet die ganze Leiste aus, **‹ Details** wieder ein. Das Diagramm nutzt dann die volle Breite.

---

## 9. Konsole: die Reiter unten

| Reiter | Inhalt |
|---|---|
| **Δ Änderungen** | Vergleich, Diff, Zurücksetzen ([Abschnitt 6](#6-kontrollpunkte-vergleich-und-zurücksetzen)) |
| **Ausführen** | Programm starten, Konsole mit Ein-/Ausgabe, Live-Trace, Haltepunkte |
| **✓ Tests** | Tests ausführen, Ergebnis je Test mit Fehlerort, Aufrufpfad, Variablen, ausgeführten Funktionen, Abdeckung (siehe 10.4) |
| **Editor** | interner Editor mit Speichern, Konflikterkennung (Datei wurde zwischenzeitlich geändert), Sprung in die IDE |
| **Dateien** | alle Dateien des Projekts |
| **Suche** | Text oder Regex in allen Dateien (über die Bridge) |
| **Probleme** | Build starten, Compiler-Meldungen und Testfehler, Sprung zur Stelle, **✦ Fehler an KI geben** |
| **Symbole** | alle Klassen, Funktionen, Variablen als durchsuchbare Liste |
| **Export** | Diagramm als PNG, Modell als JSON u. a. |

---

## 10. Build, Ausführen, Live-Trace und Tests

### 10.1 Build-Konfigurationen

Die Bridge erkennt Build-Möglichkeiten automatisch, z. B.:

- **C/C++:** `make`, CMake, Code::Blocks-Projekt (`.cbp`), gcc-Syntaxprüfung über alle `.c`-Dateien,
- **Python:** Syntaxprüfung,
- **JavaScript/TypeScript:** `tsc --noEmit`, `npm run build`,
- **C#:** `dotnet build`, **Go:** `go vet`, **Rust:** `cargo check`.

Eigene Konfigurationen: `--build "Name=Befehl"`.

Die Konfigurationen werden **bei jeder Abfrage neu erkannt** – legt die KI Dateien an oder löscht welche, sind sie sofort in Build und Start enthalten, ohne Neustart der Bridge.

### 10.2 Ausführen

- Start-Konfigurationen werden ebenfalls erkannt (C/C++: übersetzen und starten; Python: Skript starten). Eigene: `--run "Name=Befehl"` (ohne Trace).
- **▶ ausführen** am Ende eines Auftrags nutzt die zuletzt gewählte Start-Konfiguration mit Live-Trace.
- Im Reiter **Ausführen**: Konfiguration wählen, Argumente, Eingabe an das laufende Programm (stdin), Stopp.

### 10.3 Live-Trace

Mit Trace zeigt das Diagramm, **wie das Programm abläuft**: welche Funktionen aufgerufen werden (Aufrufzähler am Baustein), welche Verbindungen gerade benutzt werden (Kanten leuchten), Laufzeiten. Haltepunkte und Einzelschritt sind über die Steuerung im Reiter und in der rechten Leiste möglich.

- **C/C++:** über Instrumentierung beim Übersetzen,
- **Python:** über einen mitgelieferten Tracer (`atlas_tracer.py`, von der Bridge erzeugt).

Andere Sprachen: Start ja (eigener Befehl), Live-Trace nein.

### 10.4 Tests im Atlas (seit 3.6 / Bridge 1.9, erweitert in 3.7 / 1.10)

Tests laufen **im Atlas mit Trace** – für dich im Reiter **✓ Tests** und im Diagramm, für Claude als Werkzeug mit strukturierter Rückmeldung. Statt Konsolentext bekommt man je Fehler:

- **Fehlerort im Programm** – tiefste Stelle im Traceback, die nicht in einer Testdatei liegt (Datei:Zeile, Funktion, Codezeile) mit **Variablenwerten** dort,
- **Prüfung im Test** – die scheiternde Zeile im Test (bei C jede fehlgeschlagene `CHECK`-Zeile mit Ist ≠ Soll),
- **Aufrufpfad** vom Test bis zum Fehler,
- **ausgeführte Programmfunktionen** dieses einen Tests mit Aufrufzahl – wichtig, wenn das Programm nur einen falschen Wert liefert und kein Programmcode im Traceback steht,
- **Abstürze und Endlosschleifen** werden dem Test zugeordnet (Signal bzw. „Zeitlimit“, Stelle beim Abbruch); das Testprogramm startet neu und macht hinter diesem Test weiter,
- **Abdeckung:** wie viele Programmfunktionen mindestens ein Test erreicht hat, und welche nicht.

**Tests schreiben**

| Sprache | Dateien | Inhalt | Ausgeführt mit |
|---|---|---|---|
| Python | `test_*.py`, `*_test.py` | Funktionen `test_*()` mit `assert`, Klassen `Test*`, `unittest.TestCase` | pytest, wenn installiert (auch Fixtures), sonst eingebauter Runner (unittest + einfache Funktionen) |
| C/C++ | `test_*.c`, `*_test.c` (auch .cpp) | `#include "atlas_test.h"`, `TEST(name) { CHECK(…); CHECK_EQ_INT(a, b); CHECK_EQ_STR(a, b); CHECK_NEAR(a, b, eps); REQUIRE(…); }` – **kein `main()`** | ein Testprogramm aus allen Testdateien + allen Programmdateien **ohne** `main()` + dem `main()` des Atlas; Compiler-Optionen/Includes aus der `.cbp`, falls vorhanden |
| andere | – | eigener Befehl `--test "Jest=npx jest"` | nur Exit-Code und Ausgabe, ohne Fehlerort |

`atlas_test.h` legt die Bridge in `.codeatlas/` ab; beim Übersetzen der Tests wird es automatisch gefunden. Hilfsfunktionen in C-Testdateien `static` deklarieren (alle Testdateien landen in einem Programm). Zeitlimit je Test: 30 s (Umgebungsvariable `CODEATLAS_TEST_TIMEOUT`); im Debugger (Pause, Haltepunkte, Zeitlupe) gilt es nicht.

**Im Atlas**

- Reiter **✓ Tests**: *▶ Tests ausführen*, Filter (Name/Datei), *nur Fehler*, Zähler (✓ ✗ ! ○), je Sprache der letzte Lauf mit Dauer und **Abdeckung** (aufklappbar: nicht erreichte Funktionen, anklickbar).
- Fehlgeschlagene Tests zeigen ihre Details direkt; Klick auf Dateiangaben öffnet den Editor, Klick auf Funktionen springt im Diagramm dorthin.
- **Klick auf einen Test** markiert im Diagramm alles, was dieser Test ausgeführt hat (gestrichelt), und rot den **Fehlerort** bzw. die **Prüfung**. Mit Fehlerort fliegt die Kamera dorthin, sonst zeigt sie Prüfung und ausgeführte Funktionen gemeinsam.
- Während des Laufs: Live-Trace wie bei ▶ Ausführen (Aufrufzähler, leuchtende Kanten).
- Testfehler erscheinen zusätzlich unter **Probleme** und als rote Zeilen/Markierungen im Diagramm.
- **✦ Fehler an KI geben** legt den vollständigen Testbericht als Auftrag in das Eingabefeld (zum Prüfen, dann Senden).

**Schneller Kreislauf (seit 3.7)**

- **↻ Nur fehlgeschlagene** wiederholt genau die Tests, die zuletzt scheiterten; **▶ an einer Zeile** (beim Überfahren) wiederholt einen einzelnen Test. Die übrigen Tests bleiben mit ihrem letzten Stand in der Liste (leicht abgeblendet), die Abdeckung bleibt die des letzten vollständigen Laufs.
- **Vergleich mit dem vorigen Lauf:** Tests, die vorher durchliefen und jetzt scheitern, tragen **NEU KAPUTT**; vorher gescheiterte, die jetzt durchlaufen, **REPARIERT**. Oben steht die Summe (▼ n neu kaputt · ▲ n repariert), ebenso in der Meldung am Ende des Laufs und im Bericht an Claude. Der Vergleich gilt, solange die Bridge läuft.
- **nach KI-Auftrag automatisch:** Hat ein Auftrag Dateien geändert, laufen danach alle Tests von selbst (ohne den Reiter zu wechseln; nicht, wenn Claude am Ende selbst getestet hat). So fällt sofort auf, wenn eine Änderung etwas anderes kaputt macht.
- **Abdeckung im Diagramm:** Im aufgeklappten Abdeckungs-Feld markiert *im Diagramm zeigen* alle Funktionen, die kein Test erreicht (gelb gestrichelt).
- Nach einem Absturz oder Zeitlimit in Python-Tests zählt der neu gestartete Prozess die Funktionen hinter den bisherigen weiter – die Zuordnung „welcher Test hat was ausgeführt“ bleibt auch danach richtig.

**Für Claude: Werkzeuge (MCP-Server `codeatlas`)**

Startet der Atlas Claude Code, gibt er ihm drei Werkzeuge mit (`--mcp-config .codeatlas/mcp.json`) und einen kurzen Hinweis, sie zu benutzen (`--append-system-prompt`). Sie sind ohne Rückfrage erlaubt (`permissions.allow: mcp__codeatlas` in `.codeatlas/agent-settings.json`), weil sie nur Tests im Atlas starten.

| Werkzeug | Zweck |
|---|---|
| `tests_info` | welche Testdateien es gibt, welches Framework, wie man Tests schreibt |
| `tests_run` | Tests ausführen (optional `filter`, `sprache` = alle/python/c, `nur_fehlgeschlagene`), wartet auf das Ergebnis (bis 280 s) und liefert den Bericht wie oben |
| `tests_last` | Bericht des letzten Laufs (auch wenn du selbst getestet hast) |

Im KI-Verlauf erscheint der Schritt als **„testet im Atlas“**; der Lauf selbst ist live im Reiter und im Diagramm zu sehen.

So läuft es intern: `python codeatlas_bridge.py --mcp` ist ein kleiner MCP-Server (stdio), den Claude Code selbst startet. Er findet die Bridge über die Umgebung bzw. `.codeatlas/bridge.json` und reicht jeden Aufruf an `POST /api/mcp/call` weiter (nur von 127.0.0.1, mit dem Hook-Token). Python-Tests laufen unter dem Tracer über `.codeatlas/atlas_testrun.py`, C-Tests als instrumentiertes Programm; Test-Runner und Tracer markieren die Testgrenzen im Trace, daher lassen sich die Aufrufe jedem einzelnen Test zuordnen.

Claude im **Terminal** (statt aus dem Atlas) bekommt die Werkzeuge mit einmal, im Projektordner:

    claude mcp add codeatlas -- python "C:\Pfad\zu\codeatlas_bridge.py" --mcp

Ausschalten: Bridge mit `--no-mcp` starten.

---

## 11. Claude Code im Terminal mitlesen (Hooks)

Wer lieber im Terminal oder in VS Code mit Claude Code arbeitet, bekommt trotzdem die Live-Ansicht.

**Einschalten:** ⚙ → **Claude Code im Terminal mitlesen**. Die Bridge trägt dann in `.claude/settings.local.json` des Projekts Hooks ein (`UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `Stop`, `SubagentStop`, `Notification`, `SessionEnd`). Vorhandene fremde Einträge bleiben erhalten; Ausschalten entfernt nur die eigenen.

**Wie es funktioniert:**

1. Claude Code ruft bei jedem Ereignis `python codeatlas_bridge.py --hook codeatlas` auf (asynchron, blockiert nichts).
2. Dieser schnelle Hook-Modus liest das Ereignis, findet die Bridge über `.codeatlas/bridge.json` (Adresse und Hook-Token) und schickt es an `POST /api/agent/hook`.
3. Die Bridge macht daraus dieselben Ereignisse wie bei Aufträgen aus dem Atlas. Im Verlauf erscheint die Sitzung als eigener Block mit der Marke **TERMINAL**.

Läuft die Bridge nicht, endet der Hook still – Claude Code wird nicht gestört. Freigaben laufen bei Terminal-Sitzungen weiterhin im Terminal, nicht im Atlas.

---

## 12. Wo was gespeichert wird

| Was | Wo | Wie lange |
|---|---|---|
| Verlauf links (Aufträge, Schritte, Antworten) | Arbeitsspeicher der Bridge | bis zum Beenden der Bridge; Neuladen der Seite übersteht er |
| komplettes Gespräch mit Claude Code | `%USERPROFILE%\.claude\projects\<Projektpfad>\<Sitzungs-ID>.jsonl` (Linux/macOS `~/.claude/projects/…`) | dauerhaft, nach der Aufbewahrungsregel von Claude Code |
| Pläne aus „Planen“ | `%USERPROFILE%\.claude\plans\*.md` | dauerhaft |
| Anhänge (Bilder, Dateien) | `.codeatlas\uploads\` im Projekt | bis du sie löschst |
| Skills | `.claude\skills\` (Projekt), `%USERPROFILE%\.claude\skills\` (persönlich) | dauerhaft |
| zuletzt gemeldete aktive Skills | `.codeatlas\claude-init.json` | wird bei jedem Auftrag aktualisiert |
| Kontrollpunkte (Dateistände) | `.codeatlas\checkpoints\`, `.codeatlas\objects\` im Projekt | die letzten 80 |
| Schnappschüsse vor Patches/Zurücksetzen | `.codeatlas\snapshots\` | die letzten 200 |
| Einstellungen für gestartete Agenten | `.codeatlas\agent-settings.json` | wird bei jedem Start neu geschrieben |
| Adresse der laufenden Bridge (für Hooks) | `.codeatlas\bridge.json` | wird beim Beenden entfernt |
| Zuletzt geöffnete Projekte | `%USERPROFILE%\.codeatlas_recent.json` | höchstens 12 |
| Test-Werkzeuge für Claude | `.codeatlas\mcp.json` | wird bei jedem Start neu geschrieben |
| Test-Hilfsdateien | `.codeatlas\atlas_test.h`, `atlas_test_main.c`, `atlas_testrun.py` | werden bei Bedarf erneuert |
| Testergebnisse eines Laufs | `.codeatlas\tests_<Lauf>.jsonl` | bis zum nächsten Lauf mit gleicher Nummer |
| Diagramm für Claudes Werkzeuge | `.codeatlas\graph.json` | bei jedem Neuaufbau |
| Pipeline (Idee, Spezifikation, Plan, Aufgaben) | `.codeatlas\pipeline.json` | bis „Neu beginnen“ |
| Architekturregeln | `.codeatlas\rules.json` | dauerhaft |
| Zuordnung Test → Funktionen | `.codeatlas\test-map.json` | wird bei jedem Testlauf ergänzt |
| Team-Worktrees | `.codeatlas\team\<name>` + Branch `atlas/<name>` | bis Zusammenführen/Verwerfen |
| Projektkarte | Abschnitt in `CLAUDE.md` zwischen den codeatlas-Markern | bis du ihn löschst |
| Hooks fürs Mitlesen | `.claude\settings.local.json` | bis du sie ausschaltest |
| Token | `~/.codeatlas_token` (bzw. `--token`) | dauerhaft |
| Oberflächen-Einstellungen (Arbeitsweise, Optionen, eingeklappte Abschnitte, Theme …) | localStorage des Browsers | dauerhaft im jeweiligen Browser |

`.codeatlas\` enthält eine eigene `.gitignore` (`*`) und landet daher nicht in Git.

**Alte Sitzung fortsetzen:** Im Projektordner `claude --resume` aufrufen und die Sitzung wählen. Ist „im Terminal mitlesen“ an, siehst du sie live im Atlas.

---

## 13. Sicherheit

- **Nur dieser PC:** Die Bridge lauscht standardmäßig auf `127.0.0.1`. Fernzugriff nur bewusst mit `--listen` und `--allow` (z. B. VPN-Netz). Die Verbindung ist dann unverschlüsselt (HTTP).
- **Token:** Jede Anfrage braucht das Token (`X-Atlas-Token` oder `#token=` in der Adresse). Die Hook-Endpunkte haben ein eigenes Token und nehmen nur Anfragen von `127.0.0.1` an.
- **Nur Presets:** Der Browser kann keine beliebigen Befehle starten. Build-, Start- und Agent-Befehle stehen beim Start der Bridge fest; der Browser schickt nur die Auswahl und den Auftragstext.
- **Freigaben:** Shell-Befehle der KI laufen nur nach deiner Zustimmung (außer du hast „immer erlauben“ gewählt). Ohne Antwort: Ablehnung nach 5 Minuten. Bei Planen werden Versuche, den Plan-Modus zu verlassen, automatisch abgelehnt.
- **Test-Werkzeuge:** Claude darf Tests ohne Rückfrage starten. Tests sind Code aus dem Projekt und laufen mit deinen Rechten – wie ▶ Ausführen. Wer das nicht will: `--no-mcp`.
- **KI-Code läuft mit deinen Rechten.** Ausführen startet Programme auf deinem Rechner – vor dem ersten Start eines unbekannten Programms den Code ansehen.
- **Rückweg:** Vor jedem Auftrag ein Kontrollpunkt, jedes Zurücksetzen selbst wieder aufhebbar.

---

## 14. Startparameter der Bridge

```
python codeatlas_bridge.py [PROJEKTORDNER] [Optionen]
```

| Option | Bedeutung |
|---|---|
| `PROJEKTORDNER` | zu öffnender Ordner (Standard: aktueller Ordner) |
| `--desktop` | Oberfläche als eigenes Fenster (Edge/Chrome im App-Modus), sofort verbunden |
| `--open` | Oberfläche im Standardbrowser öffnen |
| `--port N` | Port (Standard 7878) |
| `--token TEXT` | festes Token (sonst aus `~/.codeatlas_token` oder neu erzeugt) |
| `--test "NAME=BEFEHL"` | zusätzlicher Testbefehl (ohne Fehlerort-Auswertung), mehrfach möglich |
| `--no-mcp` | Claude Code keine Test-Werkzeuge mitgeben |
| `--model MODELL` | Standardmodell für Claude Code (`fable`, `opus`, `sonnet`, `haiku` oder voller Name); in der Oberfläche umschaltbar |
| `--agent "Name=Befehl"` | weiteren Agenten anbieten, mehrfach möglich, z. B. `--agent "Haiku=claude --model haiku"` |
| `--build "Name=Befehl"` | zusätzliche Build-Konfiguration, mehrfach möglich |
| `--run "Name=Befehl"` | zusätzliche Start-Konfiguration (ohne Trace), mehrfach möglich |
| `--editor ID` | Standard-IDE: vscode, cursor, vscodium, codeblocks, notepadpp, sublime, clion, pycharm, idea, devenv, gedit, kate … oder custom |
| `--editor-cmd "…"` | eigener Editor-Befehl, z. B. `"notepad++ -n{line} {file}"` |
| `--editor-path ID=PFAD` | Pfad zu einer IDE vorgeben |
| `--include-libs` | Bibliotheken (venv, site-packages, third_party …) nicht ausblenden |
| `--listen ADRESSE` | 127.0.0.1 (Standard), 0.0.0.0 oder VPN-IP |
| `--allow NETZ` | nur diese Netze zulassen, z. B. `10.8.0.0/24` |
| `--host-name NAME` | zusätzlich erlaubter Hostname |
| `--app PFAD` | Pfad zu `CodeAtlas.html` (Standard: neben der Bridge) |
| `--hook codeatlas` | interner Hook-Modus (wird von Claude Code aufgerufen, nicht von Hand) |

Claude Code wird automatisch gefunden (Agent „Claude Code“). Unter Windows werden `claude.cmd`/`claude.exe` über `cmd /d /s /c` gestartet.

---

## 15. Schnittstelle der Bridge (HTTP)

Alle Anfragen mit Header `X-Atlas-Token: <token>` (oder `?token=`). Antworten JSON; Ereignisströme als Server-Sent Events.

**Projekt und Dateien**

| Methode | Pfad | Zweck |
|---|---|---|
| GET | `/api/info` | Version, Fähigkeiten, Build-/Start-Konfigurationen, Editoren, Agent-Zustand |
| GET | `/api/tree` | Dateiliste |
| GET/PUT | `/api/file` | Datei lesen / schreiben (atomar, mit Konfliktprüfung) |
| GET | `/api/events` | Ereignisstrom: Dateien geändert/neu/gelöscht |
| GET | `/api/search` | Volltext-/Regex-Suche |
| POST | `/api/open` | Datei in der IDE öffnen |
| POST | `/api/patch` | mehrere Dateien ändern/anlegen/löschen/umbenennen, ganz oder gar nicht, optional Git-Commit |
| GET | `/api/snapshots` | Schnappschüsse |
| POST | `/api/snapshot/restore` | Schnappschuss zurückspielen |

**Build und Ausführen**

| Methode | Pfad | Zweck |
|---|---|---|
| POST | `/api/build` | Build-Konfiguration ausführen |
| POST | `/api/run` | Programm starten (optional mit Trace) |
| GET | `/api/run/events` | Ereignisstrom: Ausgabe, Trace |
| POST | `/api/run/stdin` | Eingabe an das laufende Programm |
| POST | `/api/run/ctl` | Haltepunkte, Pause, Einzelschritt |
| GET | `/api/stream?topics=files,run,agent` | ein gemeinsamer Ereignisstrom (SSE, `event:` = Thema) statt drei – ab Bridge 1.9.1 |
| GET | `/api/project/recent` | aktuelles und zuletzt geöffnete Projekte, ob Wechsel/Dialog möglich |
| GET | `/api/project/browse?path=` | Unterordner eines Ordners (nur lokal) |
| POST | `/api/project/pick` | nativen Ordner-Dialog auf dem Rechner der Bridge zeigen (nur lokal) |
| POST | `/api/project/open` | Projekt wechseln (`path`, `force`; nur lokal; 409, wenn noch etwas läuft) |
| GET | `/api/test/info` | gefundene Testdateien, Framework, letzter Lauf |
| POST | `/api/test/run` | Testlauf starten (`filter`, `kinds`: py / c / cmd, `failed`: nur zuletzt fehlgeschlagene, `only`: Liste von Test-Kennungen) |
| POST | `/api/test/stop` | Testlauf abbrechen |
| GET | `/api/test/result` | Ergebnis des letzten Laufs (Daten + Bericht als Text) |
| POST | `/api/mcp/call` | Werkzeugaufruf des MCP-Servers (Hook-Token, nur 127.0.0.1) |
| POST | `/api/run/stop` | Programm beenden |

**Graph, Pipeline, Regeln, Git, Team (ab Bridge 2.0)**

| Methode | Pfad | Zweck |
|---|---|---|
| GET/POST | `/api/graph`, `/api/graph/info` | Diagramm von der Oberfläche übernehmen / Stand abfragen |
| GET/POST | `/api/pipeline` | Pipeline lesen / ändern (`idea`, `spec`, `plan`, `stage`, `approve`, `tasks`, `reset`) |
| GET/POST | `/api/rules` | Architekturregeln |
| GET | `/api/git/status`, `/api/git/hotspots?days=` | Git-Zustand, Brennpunkte |
| POST | `/api/git/commit` | alles committen: `{message}` |
| GET/POST | `/api/claudemd` | Atlas-Abschnitt in CLAUDE.md lesen / schreiben |
| GET | `/api/team`, `/api/team/diff?name=` | Team-Agenten, Diff eines Worktrees |
| POST | `/api/team/start\|send\|stop\|decide\|merge\|discard` | Team-Agent steuern |
| POST | `/api/agent/gate` | Stop-Hook des Qualitätstors (nur lokal, Hook-Token) |
| POST | `/api/test/run` mit `affected` | nur betroffene Tests |

**Kontrollpunkte**

| Methode | Pfad | Zweck |
|---|---|---|
| GET | `/api/checkpoints` | Liste + ID des Start-Kontrollpunkts |
| POST | `/api/checkpoint` | Kontrollpunkt setzen (`label`) |
| GET | `/api/checkpoint/diff?id=` | geändert / neu / gelöscht seit Kontrollpunkt |
| GET | `/api/checkpoint/file?id=&path=` | Dateiinhalt im Kontrollpunkt |
| POST | `/api/checkpoint/restore` | alles oder einzelne Pfade zurücksetzen; liefert Schnappschuss-ID zum Aufheben |

**Agent (Claude Code)**

| Methode | Pfad | Zweck |
|---|---|---|
| GET | `/api/agent/state` | Zustand (läuft, Sitzung, Agenten) |
| GET | `/api/agent/events` | Ereignisstrom (zuerst Zustand, dann gesamter Verlauf, dann live) |
| POST | `/api/agent/start` | Auftrag starten: `{agent, prompt, mode, fresh, attachments, model, effort, gate, lang}` (409, wenn schon einer läuft) |
| POST | `/api/agent/send` | Nachricht während der Arbeit: `{prompt, attachments}`; läuft nichts, wird ein neuer Auftrag gestartet |
| POST | `/api/agent/upload` | Anhang hochladen: `{name, mime, data}` (Base64) → `{id, path, img, …}` |
| POST | `/api/agent/stop` | Auftrag abbrechen |
| GET | `/api/account` | Kontostatus von Claude Code + laufende Anmeldung (`?fresh=1` ohne Zwischenspeicher) |
| POST | `/api/account/login` | Anmeldung starten: `{console}` |
| POST | `/api/account/code` | Code aus der Anmeldeseite übergeben: `{code}` |
| POST | `/api/account/cancel` | Anmeldung abbrechen |
| POST | `/api/account/logout` | abmelden |
| GET | `/api/skills` | alle Skills und Befehle: Name, Beschreibung, Ort, Pfad, bearbeitbar, aktiv |
| GET | `/api/skills/file?name=` | SKILL.md eines Skills lesen |
| POST | `/api/skills/create` | Skill anlegen: `{scope: projekt\|persönlich, name, description, body}` |
| POST | `/api/skills/save` | SKILL.md speichern (nur Projekt/Persönlich): `{name, content}` |
| POST | `/api/agent/permission` | Freigabe beantworten: `{id, allow, always}` |
| POST | `/api/agent/reset` | neue Sitzung, Verlauf leeren |
| POST | `/api/agent/hooks` | Mitlesen ein/aus: `{install}` |
| POST | `/api/agent/hook` | Hook-Ereignis von Claude Code (nur lokal, Hook-Token) |
| POST | `/api/agent/permit` | blockierende Freigabe-Anfrage des Hooks (nur lokal, Hook-Token) |

**Ereignisse im Agent-Strom** (jedes mit laufender Nummer `n` und Zeit `t`):

| `k` | Inhalt |
|---|---|
| `turn` | Auftrag Beginn (`ph: start`, Quelle atlas/terminal, Auftrag, Kontrollpunkt, Arbeitsweise) oder Ende (`ph: end`, ok, Text, Dauer, Kosten, Schritte, Ablehnungen) |
| `text` | Antworttext, stückweise (`d`) oder ganz (`full`) |
| `tool` | Werkzeug-Schritt: `draft` (wird gerade formuliert), `start`, `end`; mit Pfad, Befehl, alt/neu, Zeilenbereichen, Ergebnis |
| `user` | Nachricht während der Arbeit: `sent` (gesendet), `ack` (von Claude Code aufgenommen), `queued` (kommt als nächster Auftrag) |
| `perm` | Freigabe angefragt (`ask`) / entschieden (`done`: allow, deny, timeout, auto) |
| `status` | fragt an / denkt nach / Teilaufgabe (nicht im Verlauf gespeichert) |
| `note` | Hinweis oder Fehlermeldung |
| `idle` | Agent wieder bereit |
| `reset` | Verlauf geleert |

---

## 16. Unterstützte Sprachen

**Analyse und Diagramm** (Bausteine, Funktionen, Variablen, Verbindungen):

- Klammersprachen: C, C++ (inkl. `.ino`, CUDA), Java, C#, JavaScript, TypeScript, Kotlin, Swift, PHP, Scala, Dart, Groovy, Rust, Solidity, D, Vala, Haxe, Zig, Go
- Python
- Strukturierter Text (IEC 61131-3: `.st`, `.scl`, TwinCAT-Dateien)
- SQL
- vereinfacht: Ruby, Lua, Perl, Shell, PowerShell, R, Julia, Elixir, Nim, Crystal, Tcl, Haskell, Elm, VHDL, Ada, Verilog, MATLAB, Erlang, Fortran, Visual Basic, Pascal, OCaml/F# und weitere

**Build-Prüfung, Start, Live-Trace:**

| Sprache | Build-Prüfung | Start | Live-Trace |
|---|---|---|---|
| C / C++ | gcc, make, CMake, Code::Blocks | ja | ja |
| Python | Syntaxprüfung | ja | ja |
| JavaScript / TypeScript | tsc, npm | eigener Befehl | nein |
| C# | dotnet | eigener Befehl | nein |
| Go | go vet | eigener Befehl | nein |
| Rust | cargo check | eigener Befehl | nein |
| Java | – (eigener Befehl) | eigener Befehl | nein |

---

## 17. Oberfläche selbst bauen

`CodeAtlas.html` ist ein fertiges Bündel aus `src/CodeAtlasLab.jsx` und React 18.3.1.

```
cd build
npm install
node build.mjs          # Auslieferungsfassung (~500 kB)
node build.mjs --dev    # Entwicklungsfassung mit lesbaren Fehlermeldungen
```

Das Ergebnis landet als `CodeAtlas.html` im übergeordneten Ordner. Die Bridge liefert es unter `/` aus und setzt dabei `window.__ATLAS_BRIDGE__ = true`; die Oberfläche verbindet sich dann mit dem Token aus `#token=` selbst.

Die JSX ist (noch) eine einzige Datei mit rund 9.000 Zeilen. Die Aufteilung in Module ist eingeplant.

**Sprachen:** Die Oberfläche ist auf Deutsch geschrieben. Für Englisch übersetzt eine Schicht am Anfang von `src/CodeAtlasLab.jsx` (`I18N_EN`, `tr()`) alles Sichtbare: Textknoten, Tooltips, Platzhalter, Beschriftungen auf der Zeichenfläche und den Seitentitel. Benutzerinhalte (Code, Diffs, Antworten von Claude, Eingaben) bleiben unberührt. Texte, die an Claude gehen (Pipeline-Aufträge, Build-Korrektur, Kontextzeile), werden je Sprache ausdrücklich gewählt, und die Bridge gibt Claude eine englische Systemanweisung (`lang` bei `/api/agent/start`). Neue Oberflächentexte brauchen einen Eintrag in `I18N_EN`; `#` steht für eine Zahl, `{}` für einen beliebigen Teil.

---

## 18. Tastenkürzel

| Taste | Wirkung |
|---|---|
| **Strg+O** | Projekt öffnen (mit Bridge: Projekt wechseln, sonst Ordner im Browser) |
| **Strg+,** | Einstellungen |
| **I** | zum Auftragsfeld springen |
| **Enter** / **Umschalt+Enter** | Auftrag senden / neue Zeile |
| **/** | Suche (Reiter Struktur) |
| **F** | alles einpassen |
| **0 – 3** | Zoomstufe |
| **+** / **−** | zoomen |
| **Esc** | Auswahl lösen (im Eingabefeld: Fokus verlassen) |
| **E** / **Umschalt+E** | Auswahl in externer IDE / im internen Editor öffnen |
| **K** | Konsole auf/zu |
| **B** | Build mit der zuletzt gewählten Konfiguration |

---

## 19. Grenzen, bekannte Punkte, offene Arbeiten

**Grenzen**

- Der Parser ist heuristisch. Ungewöhnlich formatierter Code kann im Diagramm fehlen, obwohl er korrekt ist. Maßgeblich bleibt der Build.
- Die Kostenangabe je Auftrag ist die Schätzung von Claude Code, nicht die Abrechnung.
- Der Verlauf in der Oberfläche überlebt das Beenden der Bridge nicht (das Gespräch selbst speichert Claude Code).
- Freigaben für Terminal-Sitzungen laufen im Terminal, nicht im Atlas.

**Getestet**

- Modellwechsel (Haiku, Aufwand niedrig) und Kontostatus mit dem echten Claude Code – die Anmeldung selbst nur nachgestellt,
- Skill-Aufruf per `/name` und Erkennung der aktiven Skills mit dem echten Claude Code,
- Nachrichten während der Arbeit und Bild-Anhang auch mit dem echten Claude Code über die Bridge (Bild erkannt, Nachricht im selben Auftrag berücksichtigt),
- 113 automatische Prüfungen der Bridge (inkl. Skill-Verzeichnis, Modellwahl, Konto),
- Oberflächentests im Browser mit nachgestellten Claude-Code-Ereignissen (Auftrag, Freigabe, Ablehnen, Stopp, Absturz, Neuladen mitten im Auftrag, Entfernen, Zurücksetzen/Aufheben, Planen, Hooks, Build-Schleife, leerer Ordner, schmale Fenster, helles Schema, Einklappen),
- echte Durchläufe mit Claude Code über die Oberfläche unter Linux.

- Version 4: Pipeline über alle Stufen, Qualitätstor (blockiert, Claude bessert nach, besteht), Commit pro Auftrag, Abspielen, Team (Start, Konflikterkennung, Diff, Zusammenführen, Konflikt-Abbruch, Verwerfen), Regeln, Wirkungsbereich, CLAUDE.md – mit nachgestelltem Claude Code (gleiche Ereignisse, Hooks und MCP-Aufrufe wie das echte).

- Version 5: einfache Ansicht, Erweitert-Schalter, Einstellungsdialog, Akzentfarben, helles Schema, schmale Fenster; 5.1: englische Oberfläche (alle Bereiche im Browser durchgespielt, englische Claude-Anweisung).

**Nicht getestet:** Version 4 mit dem echten Claude Code (insbesondere wie oft das echte Modell die Atlas-Werkzeuge von sich aus nutzt und wie der Stop-Hook in der aktuellen CLI-Version reagiert).  Windows – Start von `claude.cmd`, Hooks mit `python.exe`, Edge-Fenster, `CodeAtlas-starten.bat`. Scheitert dort der Freigabe-Hook, werden Shell-Befehle der KI abgelehnt statt nachgefragt.

**Offen**

- Verlauf dauerhaft speichern und frühere Sitzungen aus dem Atlas fortsetzen,
- geplante Bausteine aus der Pipeline gestrichelt im Diagramm,
- Adapter für Chat-Modelle (Ollama, Claude API),
- Werte direkt im Detailfenster ändern, Bereiche für die KI sperren,
- `CodeAtlasLab.jsx` in Module aufteilen, Analyse in einen Hintergrund-Thread,
- Code-Kommentare auf Englisch, weitere Sprachen.

---

## 20. Fehlersuche

| Problem | Ursache / Lösung |
|---|---|
| ▶ Starten (oder anderes) tut gar nichts, keine Meldung | Vor 3.6.1: zu viele offene CodeAtlas-Fenster – jedes hielt drei Dauerverbindungen, der Browser erlaubt nur ~6 je Adresse, weitere Anfragen hingen wortlos. Ab 3.6.1 eine Verbindung je Fenster; dauert ein Start > 8 s, erscheint ein Hinweis. Sonst: überzählige Fenster schließen, neu laden. |
| „Claude Code nicht gefunden“ | `claude` ist nicht im PATH. Im Terminal `claude --version` prüfen; ggf. mit `--agent "Claude Code=C:\…\claude.cmd"` angeben. |
| Auftrag endet sofort mit Fehler zu Login/API-Key | Claude Code ist nicht angemeldet: einmal im Terminal `claude` starten und anmelden. |
| Shell-Befehle werden immer abgelehnt | Freigabe-Hook erreicht die Bridge nicht (z. B. Python-Pfad). Arbeitsweise „Ändern“ funktioniert für Dateiänderungen trotzdem; Bridge-Ausgabe im Terminal prüfen. |
| Oberfläche zeigt „getrennt“ | Bridge beendet oder Port belegt. Bridge neu starten; Seite lädt den Verlauf beim Wiederverbinden neu. |
| Diagramm bleibt nach einer Änderung gleich | Datei wird nicht als Code erkannt (Endung) oder liegt in einem ausgeblendeten Ordner (`build`, `dist`, versteckte Ordner, Bibliotheken → `--include-libs`). |
| „▶ ausführen“ fehlt | keine Start-Konfiguration erkannt (z. B. kein `main`). Im Reiter Ausführen prüfen oder `--run` angeben. |
| Desktop-Fenster öffnet nicht | Edge/Chrome nicht gefunden → Standardbrowser wird genutzt; Adresse steht im Terminal. |
| `.claude`-Einträge stören | ⚙ → „im Terminal mitlesen“ ausschalten entfernt nur die Atlas-Einträge. |
