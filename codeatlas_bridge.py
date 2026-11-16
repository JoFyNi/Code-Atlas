#!/usr/bin/env python3
"""
CodeAtlas Bridge – der lokale Kern von CodeAtlas: verbindet die Oberfläche mit deinem Projektordner und mit Claude Code.

  python codeatlas_bridge.py "E:\\Dev\\Torsteuerung" --desktop      (eigenes Fenster, sofort verbunden)
  python codeatlas_bridge.py . --port 7878 --editor codeblocks
  python codeatlas_bridge.py . --build "Release=make -j4" --editor-cmd "notepad++ -n{line} {file}"
  python codeatlas_bridge.py . --agent "Claude Sonnet=claude --model sonnet"

Funktionen
  * Dateibaum, Lesen und Schreiben (Encoding UTF-8 / Windows-1252 und CRLF bleiben erhalten)
  * Datei im Editor/IDE an Zeile öffnen (VS Code, Cursor, Code::Blocks, Notepad++, Sublime, JetBrains, Visual Studio, eigener Befehl)
  * Build-/Compiler-Presets ausführen (u. a. gcc-Syntaxprüfung aus der Code::Blocks-.cbp)
  * Volltextsuche über alle Textdateien
  * Live-Änderungen per Server-Sent Events
  * Patches über mehrere Dateien (schreiben, löschen, umbenennen) – ganz oder gar nicht, mit Schnappschuss zum Zurücksetzen
  * optional: Patch als Git-Commit festhalten (nur die betroffenen Dateien)
  * KI live verfolgen: Claude Code aus der Oberfläche starten (Ereignisstrom) oder eine Terminal-Sitzung über Hooks mitlesen;
    vor jedem Auftrag entsteht ein Kontrollpunkt – Änderungen werden vom Dateisystem gelesen und lassen sich zurücksetzen

Sicherheit
  * lauscht nur auf 127.0.0.1, jede Anfrage braucht das Token (wird in ~/.codeatlas_token gespeichert)
  * Zugriff nur innerhalb des Projektordners, Build-Befehle nur aus Presets (nicht frei aus dem Browser)
  * KI-Agenten ebenfalls nur als Preset (Claude Code bzw. --agent); der Browser liefert nur den Auftragstext
Nur Python-Standardbibliothek, ab Python 3.8.
"""
import sys


def _hook_relay():
    """`python codeatlas_bridge.py --hook` – wird von Claude Code als Hook aufgerufen und reicht das Ereignis (JSON auf stdin)
    an die laufende Bridge weiter. Bewusst vor allen schweren Importen und ohne jede Ausgabe im Fehlerfall: Claude Code darf
    davon nie gebremst oder gestört werden. Nur bei einer Freigabe-Anfrage aus einem vom Atlas gestarteten Lauf wird gewartet
    und die Entscheidung auf stdout zurückgegeben."""
    import json, os, socket
    raw = sys.stdin.buffer.read()
    try:
        ev = json.loads(raw.decode("utf-8", "replace") or "{}")
    except ValueError:
        return
    url, tok = os.environ.get("CODEATLAS_HOOK_URL"), os.environ.get("CODEATLAS_HOOK_TOKEN")
    if not url:
        for start in (os.environ.get("CLAUDE_PROJECT_DIR"), ev.get("cwd"), os.getcwd()):
            d = os.path.abspath(start) if start else None
            for _ in range(8):
                if not d:
                    break
                f = os.path.join(d, ".codeatlas", "bridge.json")
                if os.path.isfile(f):
                    try:
                        with open(f, encoding="utf-8") as fh:
                            cfg = json.load(fh)
                        url, tok = cfg.get("url"), cfg.get("hook")
                    except (OSError, ValueError):
                        pass
                    break
                up = os.path.dirname(d)
                d = None if up == d else up
            if url:
                break
    if not url or not tok:
        return
    gate = ev.get("hook_event_name") == "Stop" and os.environ.get("CODEATLAS_GATE") == "1"
    block = (ev.get("hook_event_name") == "PermissionRequest" and os.environ.get("CODEATLAS_HOOK_BLOCK") == "1") or gate
    hostport = url.split("://", 1)[-1].strip("/")
    host, _, port = hostport.rpartition(":")
    path = "/api/agent/gate" if gate else "/api/agent/permit" if block else "/api/agent/hook"
    head = (f"POST {path} HTTP/1.0\r\nHost: {hostport}\r\nContent-Type: application/json\r\nContent-Length: {len(raw)}\r\n"
            f"X-Atlas-Hook: {tok}\r\n\r\n").encode("ascii")
    with socket.create_connection((host.strip("[]") or "127.0.0.1", int(port)), timeout=3) as so:
        so.settimeout(900 if block else 3)
        so.sendall(head + raw)
        if not block:
            return
        buf = b""
        while True:
            chunk = so.recv(65536)
            if not chunk:
                break
            buf += chunk
    headers, _, body = buf.partition(b"\r\n\r\n")
    if headers.split(b"\r\n", 1)[0].split(b" ")[1:2] == [b"200"] and body.strip():
        sys.stdout.write(body.decode("utf-8", "replace"))


if len(sys.argv) > 1 and sys.argv[1] == "--hook":
    try:
        _hook_relay()
    except BaseException:
        pass
    sys.exit(0)


def _mcp_server():
    """`python codeatlas_bridge.py --mcp` – MCP-Server (stdio) für Claude Code: Werkzeuge tests_info / tests_run / tests_last.
    Reicht jeden Aufruf an die laufende Bridge des Projekts weiter (Adresse + Hook-Kennwort aus der Umgebung oder .codeatlas/bridge.json)."""
    import json, os, http.client
    url, tok = os.environ.get("CODEATLAS_HOOK_URL"), os.environ.get("CODEATLAS_HOOK_TOKEN")
    if not url or not tok:
        for start in (os.environ.get("CODEATLAS_PROJECT"), os.environ.get("CLAUDE_PROJECT_DIR"), os.getcwd()):
            d = os.path.abspath(start) if start else None
            for _ in range(8):
                if not d:
                    break
                f = os.path.join(d, ".codeatlas", "bridge.json")
                if os.path.isfile(f):
                    try:
                        with open(f, encoding="utf-8") as fh:
                            cfg = json.load(fh)
                        url, tok = cfg.get("url"), cfg.get("hook")
                    except (OSError, ValueError):
                        pass
                    break
                up = os.path.dirname(d)
                d = None if up == d else up
            if url and tok:
                break
    flt = {"type": "string", "description": "Nur Tests, deren Name oder Datei diesen Text enthält (leer = alle)"}
    tools = [
        {"name": "tests_run", "description": "Führt die Tests des Projekts im CodeAtlas aus – mit Trace, live im Diagramm des Nutzers sichtbar – und meldet je "
         "fehlgeschlagenem Test den Fehlerort im Programm (Datei:Zeile, Funktion, Code), die Prüfung im Test, den Aufrufpfad, Variablenwerte, die vom Test "
         "ausgeführten Programmfunktionen sowie, welche Funktionen kein Test erreicht. Abstürze und Endlosschleifen werden dem Test zugeordnet, die übrigen "
         "Tests laufen weiter. Statt pytest/gcc über Bash verwenden.",
         "inputSchema": {"type": "object", "properties": {"filter": flt, "sprache": {"type": "string", "enum": ["alle", "python", "c"], "description": "Nur Tests dieser Sprache"},
                                                          "nur_fehlgeschlagene": {"type": "boolean", "description": "Nur die im letzten Lauf fehlgeschlagenen Tests wiederholen (schneller Check nach einer Korrektur; danach einmal alle laufen lassen)"},
                                                          "betroffene": {"type": "boolean", "description": "Nur Tests, die seit dem letzten Lauf geänderte Dateien ausführen (schnell nach einer Änderung)"}}}},
        {"name": "tests_info", "description": "Zeigt, welche Testdateien der CodeAtlas im Projekt findet, welches Test-Framework genutzt wird und wie Tests geschrieben werden "
         "(Python: test_*.py; C: test_*.c mit atlas_test.h).", "inputSchema": {"type": "object", "properties": {}}},
        {"name": "tests_last", "description": "Liefert das Ergebnis des letzten Testlaufs im CodeAtlas noch einmal (z. B. nachdem der Nutzer selbst getestet hat).",
         "inputSchema": {"type": "object", "properties": {"filter": flt}}},
        {"name": "atlas_orient", "description": "Überblick über das Projekt aus dem Code-Graphen des CodeAtlas: Module, Einstiegspunkte, zentrale Bausteine, "
         "meistgerufene Funktionen, Zyklen, Regelverstöße. Als ERSTES aufrufen, statt das Projekt per Glob/Grep/Read zu erkunden.", "inputSchema": {"type": "object", "properties": {}}},
        {"name": "atlas_find", "description": "Findet Funktionen/Klassen/Module im Code-Graphen: Name, Teilwort, Klasse.methode, Datei:Zeile oder ein ganzer Stacktrace "
         "→ Treffer mit Datei:Zeile und Zahl der Aufrufer. Spart das Durchsuchen vieler Dateien.",
         "inputSchema": {"type": "object", "properties": {"suche": {"type": "string"}}, "required": ["suche"]}},
        {"name": "atlas_impact", "description": "Wirkungsbereich: wer ruft/benutzt eine Funktion oder Klasse (transitiv), welche Dateien und welche Tests sind betroffen. "
         "VOR einer Änderung an viel genutztem Code aufrufen.",
         "inputSchema": {"type": "object", "properties": {"symbol": {"type": "string"}, "tiefe": {"type": "integer", "minimum": 1, "maximum": 6},
                                                          "richtung": {"type": "string", "enum": ["aufrufer", "aufgerufen", "beide"]}}, "required": ["symbol"]}},
        {"name": "atlas_trace", "description": "Kürzester Aufrufweg von A nach B im Code-Graphen (z. B. vom Einstiegspunkt bis zu einer Funktion).",
         "inputSchema": {"type": "object", "properties": {"von": {"type": "string"}, "nach": {"type": "string"}}, "required": ["von", "nach"]}},
        {"name": "atlas_read", "description": "Quelltext genau einer Funktion/Klasse (statt der ganzen Datei) plus ihre Aufrufer und Aufgerufenen.",
         "inputSchema": {"type": "object", "properties": {"symbol": {"type": "string"}}, "required": ["symbol"]}},
        {"name": "atlas_rules", "description": "Architekturregeln des Projekts (wer darf auf wen zugreifen, keine Zyklen) und aktuelle Verstöße.", "inputSchema": {"type": "object", "properties": {}}},
        {"name": "plan_get", "description": "Pipeline des CodeAtlas lesen: Idee, Spezifikation, Plan, Aufgaben mit Status.", "inputSchema": {"type": "object", "properties": {}}},
        {"name": "plan_set_spec", "description": "Spezifikation (Markdown: Ziel, Nutzer, Anforderungen, Akzeptanzkriterien, offene Fragen) in der Pipeline speichern. Der Nutzer gibt sie im Atlas frei.",
         "inputSchema": {"type": "object", "properties": {"text": {"type": "string"}}, "required": ["text"]}},
        {"name": "plan_set_plan", "description": "Technischen Plan (Markdown: Architektur, betroffene Module/Dateien, Datenfluss, Risiken, Teststrategie) in der Pipeline speichern.",
         "inputSchema": {"type": "object", "properties": {"text": {"type": "string"}}, "required": ["text"]}},
        {"name": "plan_set_tasks", "description": "Plan in kleine, einzeln prüfbare Aufgaben zerlegen und speichern.",
         "inputSchema": {"type": "object", "properties": {"aufgaben": {"type": "array", "items": {"type": "object", "properties": {
             "id": {"type": "string"}, "titel": {"type": "string"}, "beschreibung": {"type": "string"}, "dateien": {"type": "array", "items": {"type": "string"}},
             "symbole": {"type": "array", "items": {"type": "string"}}, "abhaengig_von": {"type": "array", "items": {"type": "string"}}, "pruefung": {"type": "string"}},
             "required": ["titel"]}}}, "required": ["aufgaben"]}},
        {"name": "plan_task_update", "description": "Status einer Pipeline-Aufgabe setzen (in_arbeit beim Beginnen, erledigt wenn fertig und geprüft, blockiert mit Notiz).",
         "inputSchema": {"type": "object", "properties": {"id": {"type": "string"}, "status": {"type": "string", "enum": ["offen", "in_arbeit", "erledigt", "blockiert"]},
                                                          "notiz": {"type": "string"}}, "required": ["id", "status"]}},
    ]

    def call(name, args):
        if not url or not tok:
            return "Die CodeAtlas-Bridge für dieses Projekt läuft nicht (keine .codeatlas/bridge.json gefunden).", True
        hostport = url.split("://", 1)[-1].strip("/")
        host, _, port = hostport.rpartition(":")
        c = http.client.HTTPConnection(host.strip("[]") or "127.0.0.1", int(port), timeout=900)
        c.request("POST", "/api/mcp/call", json.dumps({"tool": name, "args": args}).encode("utf-8"), {"Content-Type": "application/json", "X-Atlas-Hook": tok})
        resp = c.getresponse()
        try:
            data = json.loads(resp.read().decode("utf-8") or "{}")
        except ValueError:
            data = {}
        return data.get("text") or data.get("error") or f"Antwort {resp.status}", resp.status != 200

    def send(o):
        sys.stdout.write(json.dumps(o) + "\n")
        sys.stdout.flush()

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            m = json.loads(line)
        except ValueError:
            continue
        mid, meth, p = m.get("id"), m.get("method"), m.get("params") or {}
        if meth == "initialize":
            res = {"protocolVersion": p.get("protocolVersion") or "2025-06-18", "capabilities": {"tools": {}},
                   "serverInfo": {"name": "codeatlas", "version": "1.9.1"},
                   "instructions": "Code-Graph (atlas_orient/find/impact/trace/read) statt Dateien durchsuchen; Tests im CodeAtlas ausführen (tests_run) statt über Bash; Pipeline-Werkzeuge plan_* für Spezifikation, Plan und Aufgaben."}
        elif meth == "tools/list":
            res = {"tools": tools}
        elif meth == "tools/call":
            try:
                text, err = call(p.get("name"), p.get("arguments") or {})
            except Exception as e:
                text, err = f"CodeAtlas nicht erreichbar: {e}", True
            res = {"content": [{"type": "text", "text": text}], "isError": bool(err)}
        elif meth == "ping":
            res = {}
        elif mid is None:
            continue
        else:
            send({"jsonrpc": "2.0", "id": mid, "error": {"code": -32601, "message": "Methode unbekannt: " + str(meth)}})
            continue
        if mid is not None:
            send({"jsonrpc": "2.0", "id": mid, "result": res})


if len(sys.argv) > 1 and sys.argv[1] == "--mcp":
    try:
        _mcp_server()
    except (KeyboardInterrupt, BrokenPipeError):
        pass
    sys.exit(0)

import argparse, base64, collections, hashlib, json, mimetypes, os, queue, re, secrets, shlex, shutil, subprocess, threading, time, xml.etree.ElementTree as ET
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs

VERSION = "2.0"
IGNORE_DIRS = {".codeatlas", "node_modules", ".git", ".svn", ".hg", "dist", "build", "out", "target", "bin", "obj", "Debug", "Release", "x64",
               "venv", ".venv", "env", "__pycache__", ".next", ".nuxt", "coverage", "vendor", ".idea", ".vscode", ".vs", ".gradle", "Pods"}
KEEP_DOT_DIRS = {".github", ".gitlab", ".circleci", ".devcontainer", ".husky", ".storybook"}   # versteckt, aber Teil des Projekts


def tool_dir(d):
    """Versteckte Ordner sind fast immer Arbeitsstand von Werkzeugen (.git, .vscode, .claude, Datenbanken von KI-Agenten …) und
    gehören nicht zum Projekt: nicht ins Diagramm, nicht in die Änderungsliste, nicht in Kontrollpunkte."""
    return d.startswith(".") and d not in KEEP_DOT_DIRS


BINARY_EXT = {"png", "jpg", "jpeg", "gif", "bmp", "ico", "icns", "webp", "tif", "tiff", "psd", "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx",
              "odt", "exe", "dll", "so", "dylib", "a", "lib", "o", "obj", "ilk", "pdb", "exp", "class", "jar", "war", "pyc", "pyo", "whl", "bin",
              "elf", "dat", "db", "sqlite", "mdb", "woff", "woff2", "ttf", "otf", "eot", "mp3", "mp4", "wav", "ogg", "avi", "mov", "mkv", "zip",
              "gz", "tgz", "bz2", "xz", "tar", "7z", "rar", "iso", "dmg", "pkl", "npy", "onnx", "pt", "ckpt"}
LIB_RE = re.compile(r"^(site-packages|dist-packages|\.?venv[\w.-]*|virtualenvs?|\.tox|\.nox|\.eggs|[\w.-]+\.egg-info|bower_components|jspm_packages|"
                    r"\.mypy_cache|\.pytest_cache|\.ruff_cache|\.dart_tool|\.pub-cache|third[_-]?party)$", re.I)
INCLUDE_LIBS = False
MAX_TEXT = 1_500_000
MAX_FILES = 20000
IS_WIN = os.name == "nt"


# ------------------------------------------------------------------ Dateien
class Project:
    def __init__(self, root: Path):
        self.root = root.resolve()
        self.name = self.root.name or "projekt"

    def rel(self, p: Path) -> str:
        return self.name + "/" + p.relative_to(self.root).as_posix()

    def resolve(self, client_path: str) -> Path:
        p = client_path.replace("\\", "/")
        if p.startswith(self.name + "/"):
            p = p[len(self.name) + 1:]
        full = (self.root / p).resolve()
        if full != self.root and self.root not in full.parents:
            raise PermissionError("Pfad liegt außerhalb des Projektordners")
        return full

    def keep_dir(self, dp, d):
        if d in IGNORE_DIRS or d.startswith("cmake-build-") or tool_dir(d):
            return False
        if not INCLUDE_LIBS and (LIB_RE.match(d) or os.path.isfile(os.path.join(dp, d, "pyvenv.cfg"))):
            return False
        return True

    def walk(self):
        out = []
        for dp, dns, fns in os.walk(self.root):
            dns[:] = sorted(d for d in dns if self.keep_dir(dp, d))
            for fn in sorted(fns):
                full = Path(dp) / fn
                try:
                    st = full.stat()
                except OSError:
                    continue
                ext = fn.rsplit(".", 1)[-1].lower() if "." in fn else ""
                out.append({"path": self.rel(full), "size": st.st_size, "mtime": st.st_mtime_ns // 1_000_000,
                            "bin": ext in BINARY_EXT or st.st_size > MAX_TEXT})
                if len(out) >= MAX_FILES:
                    return out
        return out


def decode_text(raw: bytes):
    if raw.startswith(b"\xef\xbb\xbf"):
        enc, text = "utf-8-sig", raw[3:].decode("utf-8", "replace")
    else:
        try:
            enc, text = "utf-8", raw.decode("utf-8")
        except UnicodeDecodeError:
            enc, text = "windows-1252", raw.decode("cp1252", "replace")
    eol = "\r\n" if "\r\n" in text else "\n"
    return {"text": text.replace("\r\n", "\n"), "encoding": enc, "eol": eol}


def read_text(full: Path):
    raw = full.read_bytes()
    if b"\x00" in raw[:8000]:
        raise ValueError("Binärdatei")
    return dict(decode_text(raw), mtime=full.stat().st_mtime_ns // 1_000_000)


def write_text(full: Path, text: str, encoding: str, eol: str):
    data = text.replace("\r\n", "\n")
    if eol == "\r\n":
        data = data.replace("\n", "\r\n")
    codec = {"utf-8-sig": "utf-8-sig", "windows-1252": "cp1252"}.get(encoding, "utf-8")
    raw = data.encode(codec, "replace")
    tmp = full.with_name("." + full.name + ".atlas-tmp")
    tmp.write_bytes(raw)
    os.replace(tmp, full)
    return full.stat().st_mtime_ns // 1_000_000


# ------------------------------------------------------------------ Editoren
def find_exe(names, extra=()):
    for n in names:
        p = shutil.which(n)
        if p:
            return p
    for p in extra:
        p = os.path.expandvars(p)
        if os.path.isfile(p):
            return p
    return None


PF, PF86, LAD = r"%ProgramFiles%", r"%ProgramFiles(x86)%", r"%LOCALAPPDATA%"
EDITORS = {
    "vscode":     ("VS Code", ["code"], [LAD + r"\Programs\Microsoft VS Code\bin\code.cmd", PF + r"\Microsoft VS Code\bin\code.cmd"],
                   lambda f, l, c: ["-g", f"{f}:{l}:{c}"]),
    "cursor":     ("Cursor", ["cursor"], [LAD + r"\Programs\cursor\resources\app\bin\cursor.cmd"], lambda f, l, c: ["-g", f"{f}:{l}:{c}"]),
    "vscodium":   ("VSCodium", ["codium"], [LAD + r"\Programs\VSCodium\bin\codium.cmd"], lambda f, l, c: ["-g", f"{f}:{l}:{c}"]),
    "codeblocks": ("Code::Blocks", ["codeblocks"], [PF + r"\CodeBlocks\codeblocks.exe", PF86 + r"\CodeBlocks\codeblocks.exe", r"C:\CodeBlocks\codeblocks.exe",
                    LAD + r"\Programs\CodeBlocks\codeblocks.exe", r"%USERPROFILE%\scoop\apps\codeblocks\current\codeblocks.exe", r"%ChocolateyInstall%\lib\codeblocks\tools\codeblocks.exe"],
                   lambda f, l, c: [f"--file={f}:{l}"]),
    "notepadpp":  ("Notepad++", ["notepad++"], [PF + r"\Notepad++\notepad++.exe", PF86 + r"\Notepad++\notepad++.exe"],
                   lambda f, l, c: [f"-n{l}", f"-c{c}", f]),
    "sublime":    ("Sublime Text", ["subl"], [PF + r"\Sublime Text\subl.exe", PF + r"\Sublime Text 3\subl.exe"], lambda f, l, c: [f"{f}:{l}:{c}"]),
    "clion":      ("CLion", ["clion", "clion64", "clion.sh"], [], lambda f, l, c: ["--line", str(l), "--column", str(c), f]),
    "pycharm":    ("PyCharm", ["pycharm", "pycharm64", "charm"], [], lambda f, l, c: ["--line", str(l), "--column", str(c), f]),
    "idea":       ("IntelliJ IDEA", ["idea", "idea64"], [], lambda f, l, c: ["--line", str(l), "--column", str(c), f]),
    "devenv":     ("Visual Studio", ["devenv"], [], lambda f, l, c: ["/Edit", f]),
    "gedit":      ("gedit", ["gedit"], [], lambda f, l, c: [f"+{l}:{c}", f]),
    "kate":       ("Kate", ["kate"], [], lambda f, l, c: ["-l", str(l), "-c", str(c), f]),
}


def win_app_path(exe_name, uninstall_hint=None):
    """Sucht installierte Programme in der Windows-Registry (App Paths / Uninstall)."""
    if not IS_WIN:
        return None
    try:
        import winreg
    except ImportError:
        return None
    for hive in (winreg.HKEY_LOCAL_MACHINE, winreg.HKEY_CURRENT_USER):
        try:
            with winreg.OpenKey(hive, "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\" + exe_name) as k:
                p = winreg.QueryValue(k, None)
                if p and os.path.isfile(p.strip('"')):
                    return p.strip('"')
        except OSError:
            pass
        if uninstall_hint:
            for base in (r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall", r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall"):
                try:
                    with winreg.OpenKey(hive, base) as root:
                        for i in range(winreg.QueryInfoKey(root)[0]):
                            try:
                                with winreg.OpenKey(root, winreg.EnumKey(root, i)) as sk:
                                    name = winreg.QueryValueEx(sk, "DisplayName")[0]
                                    if uninstall_hint.lower() not in str(name).lower():
                                        continue
                                    for val in ("InstallLocation", "DisplayIcon", "UninstallString"):
                                        try:
                                            v = str(winreg.QueryValueEx(sk, val)[0]).strip('"').split(",")[0]
                                        except OSError:
                                            continue
                                        cand = v if v.lower().endswith(exe_name) else os.path.join(os.path.dirname(v) if v.lower().endswith(".exe") else v, exe_name)
                                        if os.path.isfile(cand):
                                            return cand
                            except OSError:
                                continue
                except OSError:
                    pass
    return None


REG_HINTS = {"codeblocks": ("codeblocks.exe", "CodeBlocks"), "notepadpp": ("notepad++.exe", "Notepad++"), "devenv": ("devenv.exe", None)}


def detect_editors(custom, paths):
    """Alle bekannten Editoren melden – gefundene mit Pfad, fehlende mit found=False."""
    out = []
    for key, (label, names, extra, _) in EDITORS.items():
        exe = paths.get(key)
        if exe and not os.path.isfile(exe):
            exe = find_exe([exe])
        if not exe:
            exe = find_exe(names, extra if IS_WIN else ())
        if not exe and key in REG_HINTS:
            exe = win_app_path(*REG_HINTS[key])
        out.append({"id": key, "label": label, "exe": exe, "found": bool(exe)})
    if custom:
        out.insert(0, {"id": "custom", "label": "Eigener Befehl", "exe": custom, "found": True})
    return out


def launch(argv):
    exe = argv[0]
    if IS_WIN and exe.lower().endswith((".cmd", ".bat")):
        if any(ch in a for a in argv for ch in '"%&|<>^'):
            raise ValueError("Pfad enthält Sonderzeichen, die über .cmd nicht sicher übergeben werden können")
        argv = ["cmd", "/c", subprocess.list2cmdline(argv)]
    flags = 0x00000008 | 0x00000200 if IS_WIN else 0  # DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP
    subprocess.Popen(argv, cwd=None, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                     creationflags=flags, start_new_session=not IS_WIN)


# ------------------------------------------------------------------ Build-Presets
def skip_parts(parts, root=None):
    if set(parts[:-1]) & IGNORE_DIRS or any(tool_dir(x) for x in parts[:-1]):
        return True
    if INCLUDE_LIBS:
        return False
    if any(LIB_RE.match(x) for x in parts[:-1]):
        return True
    return bool(root) and any((root.joinpath(*parts[:i + 1]) / "pyvenv.cfg").is_file() for i in range(len(parts) - 1))


def cbp_preset(cbp: Path, gcc):
    try:
        tree = ET.parse(cbp)
    except ET.ParseError:
        return None
    proj = tree.getroot().find("Project")
    if proj is None:
        return None
    opts, incs = [], []
    for el in proj.findall("./Compiler/Add") + proj.findall("./Build/Target[1]/Compiler/Add"):
        if el.get("option"):
            opts += shlex.split(el.get("option"), posix=not IS_WIN)
        if el.get("directory"):
            incs.append("-I" + el.get("directory"))
    units = [u.get("filename") for u in proj.findall("Unit") if u.get("filename", "").lower().endswith((".c", ".cpp", ".cc", ".cxx"))]
    if not units:
        return None
    base = cbp.parent
    cxx = any(u.lower().endswith((".cpp", ".cc", ".cxx")) for u in units)
    comp = gcc.replace("gcc", "g++") if cxx and gcc.endswith(("gcc", "gcc.exe")) else gcc
    keep = [o for o in opts if o.startswith(("-W", "-std", "-D", "-I", "-f", "-pedantic", "-m"))]
    return {"label": f"gcc-Syntaxprüfung ({cbp.name})", "argv": [comp, "-fsyntax-only", "-fdiagnostics-color=never", *keep, *incs, *units], "cwd": str(base)}


_SCAN = {"t": 0.0, "root": None, "files": []}
_SCAN_LOCK = threading.Lock()


def scan_files(prj, ttl=0.0):
    """Alle Projektdateien ohne Bibliotheks- und Werkzeugordner. rglob lief vorher durch jedes venv und node_modules –
    unter Windows dauerte das bei großen Projekten so lange, dass „Starten“ scheinbar nichts tat."""
    with _SCAN_LOCK:
        if _SCAN["root"] == prj.root and time.time() - _SCAN["t"] < ttl:
            return _SCAN["files"]
        out = []
        for dp, dns, fns in os.walk(prj.root):
            dns[:] = [d for d in dns if prj.keep_dir(dp, d)]
            out.extend(Path(dp) / fn for fn in fns)
            if len(out) > 200000:
                break
        _SCAN.update(t=time.time(), root=prj.root, files=out)
        return out


def files_ext(prj, *exts):
    ex = {e.lower() for e in exts}
    return [p for p in scan_files(prj) if p.suffix.lower() in ex]


def detect_presets(prj: Project, extra):
    presets = []
    root = prj.root
    gcc = find_exe(["gcc", "cc", "clang"], [PF + r"\CodeBlocks\MinGW\bin\gcc.exe", PF86 + r"\CodeBlocks\MinGW\bin\gcc.exe", r"C:\MinGW\bin\gcc.exe", r"C:\msys64\ucrt64\bin\gcc.exe"] if IS_WIN else ())
    cbps = sorted(files_ext(prj, ".cbp"))[:4]
    if gcc:
        for cbp in cbps:
            pr = cbp_preset(cbp, gcc)
            if pr:
                presets.append(pr)
    cb = find_exe(["codeblocks"], [PF + r"\CodeBlocks\codeblocks.exe", PF86 + r"\CodeBlocks\codeblocks.exe"] if IS_WIN else ())
    if cb:
        for cbp in cbps:
            presets.append({"label": f"Code::Blocks Build ({cbp.name})", "argv": [cb, "--no-splash-screen", "--build", str(cbp)], "cwd": str(cbp.parent)})
    if gcc and not any(p["label"].startswith("gcc") for p in presets):
        cs = [str(p.relative_to(root)) for p in sorted(files_ext(prj, ".c"))][:400]
        if cs:
            presets.append({"label": "gcc-Syntaxprüfung (alle .c)", "argv": [gcc, "-fsyntax-only", "-Wall", "-Wextra", "-fdiagnostics-color=never", *cs], "cwd": str(root)})
    if (root / "Makefile").exists() and shutil.which("make"):
        presets.append({"label": "make", "argv": ["make"], "cwd": str(root)})
    if (root / "CMakeLists.txt").exists() and shutil.which("cmake"):
        presets.append({"label": "CMake Build", "shell": "cmake -S . -B build && cmake --build build", "cwd": str(root)})
    if (root / "Cargo.toml").exists() and shutil.which("cargo"):
        presets.append({"label": "cargo check", "argv": ["cargo", "check", "--message-format=short"], "cwd": str(root)})
    if (root / "go.mod").exists() and shutil.which("go"):
        presets.append({"label": "go vet", "argv": ["go", "vet", "./..."], "cwd": str(root)})
    if (root / "tsconfig.json").exists() and shutil.which("npx"):
        presets.append({"label": "tsc --noEmit", "argv": [shutil.which("npx"), "tsc", "--noEmit", "--pretty", "false"], "cwd": str(root)})
    pkg = root / "package.json"
    if pkg.exists() and shutil.which("npm"):
        try:
            if "build" in json.loads(pkg.read_text("utf-8")).get("scripts", {}):
                presets.append({"label": "npm run build", "argv": [shutil.which("npm"), "run", "build"], "cwd": str(root)})
        except Exception:
            pass
    pys = [str(p.relative_to(root)) for p in sorted(files_ext(prj, ".py"))][:400]
    if pys:
        presets.append({"label": "Python-Syntaxprüfung", "argv": [sys.executable, "-m", "py_compile", *pys], "cwd": str(root)})
    if list(root.glob("*.sln")) + list(root.glob("*.csproj")) and shutil.which("dotnet"):
        presets.append({"label": "dotnet build", "argv": ["dotnet", "build", "-nologo"], "cwd": str(root)})
    for spec in extra:
        name, _, cmd = spec.partition("=")
        if not cmd:
            name, cmd = spec, spec
        presets.insert(0, {"label": name.strip(), "shell": cmd.strip(), "cwd": str(root)})
    for i, p in enumerate(presets):
        p["id"] = str(i)
        p["cmd"] = p.get("shell") or subprocess.list2cmdline(p["argv"])
    return presets


def run_preset(p, timeout=300):
    t0 = time.time()
    try:
        r = subprocess.run(p["shell"] if "shell" in p else p["argv"], shell="shell" in p, cwd=p["cwd"], stdout=subprocess.PIPE,
                           stderr=subprocess.STDOUT, timeout=timeout, stdin=subprocess.DEVNULL)
        out, code = r.stdout, r.returncode
    except subprocess.TimeoutExpired as e:
        out, code = (e.stdout or b"") + b"\n[Abbruch: Zeitlimit]", -1
    except FileNotFoundError as e:
        out, code = str(e).encode(), -1
    try:
        text = out.decode("utf-8")
    except UnicodeDecodeError:
        text = out.decode("cp1252" if IS_WIN else "latin-1", "replace")
    return {"code": code, "output": text, "ms": int((time.time() - t0) * 1000), "cmd": p["cmd"], "cwd": p["cwd"]}


# ------------------------------------------------------------------ Ausführen mit Live-Trace
SIGNAMES = {11: "SIGSEGV – Speicherzugriffsfehler", 8: "SIGFPE – Rechenfehler (z. B. Division durch 0)", 4: "SIGILL – ungültige Instruktion",
            6: "SIGABRT – Abbruch (assert/abort)", 0xC0000005: "Zugriffsverletzung (0xC0000005)", 0xC0000094: "Division durch 0 (0xC0000094)",
            0xC00000FD: "Stacküberlauf (0xC00000FD)", 0xC000001D: "Ungültige Instruktion (0xC000001D)", 0xC0000409: "Stack-Pufferüberlauf (0xC0000409)"}


def cbp_full(cbp: Path):
    """Liest aus einer Code::Blocks-.cbp alles, was zum Übersetzen und Linken nötig ist."""
    try:
        proj = ET.parse(cbp).getroot().find("Project")
    except ET.ParseError:
        return None
    if proj is None:
        return None
    opts, incs, libs, ldirs, lopts = [], [], [], [], []
    tgt = proj.find("./Build/Target")
    for scope in [proj] + ([tgt] if tgt is not None else []):
        for el in scope.findall("./Compiler/Add"):
            if el.get("option"):
                opts += shlex.split(el.get("option"), posix=not IS_WIN)
            if el.get("directory"):
                incs.append("-I" + el.get("directory"))
        for el in scope.findall("./Linker/Add"):
            if el.get("library"):
                lib = el.get("library")
                libs.append(lib if ("/" in lib or "\\" in lib or lib.endswith((".a", ".lib", ".dll", ".so"))) else "-l" + re.sub(r"^lib|\.a$", "", lib))
            if el.get("directory"):
                ldirs.append("-L" + el.get("directory"))
            if el.get("option"):
                lopts += shlex.split(el.get("option"), posix=not IS_WIN)
    units = [u.get("filename") for u in proj.findall("Unit") if u.get("filename", "").lower().endswith((".c", ".cpp", ".cc", ".cxx"))]
    if not units:
        return None
    keep = [o for o in opts if o.startswith(("-W", "-std", "-D", "-I", "-f", "-pedantic", "-m", "-U"))]
    return {"units": units, "opts": keep, "incs": incs, "libs": libs + lopts, "ldirs": ldirs, "cwd": str(cbp.parent)}


def detect_run_presets(prj: Project, extra):
    out, root = [], prj.root
    gcc = find_exe(["gcc", "cc", "clang"], [PF + r"\CodeBlocks\MinGW\bin\gcc.exe", PF86 + r"\CodeBlocks\MinGW\bin\gcc.exe", r"C:\MinGW\bin\gcc.exe", r"C:\msys64\ucrt64\bin\gcc.exe"] if IS_WIN else ())
    if gcc:
        cbps = sorted(files_ext(prj, ".cbp"))[:6]
        for cbp in cbps:
            info = cbp_full(cbp)
            if info:
                out.append({"label": f"C/C++: {cbp.name}", "kind": "c", "gcc": gcc, **info})
        if not cbps:
            cs = files_ext(prj, ".c")
            if cs and any(re.search(r"\bint\s+main\s*\(", p.read_text("utf-8", "replace")) for p in cs[:400]):
                out.append({"label": "C: alle .c-Dateien", "kind": "c", "gcc": gcc, "units": [str(p) for p in cs], "opts": ["-Wall"], "incs": [], "libs": [], "ldirs": [], "cwd": str(root)})
    pys = []
    for p in sorted(files_ext(prj, ".py")):
        if skip_parts(p.relative_to(root).parts, root) or ".codeatlas" in p.parts:
            continue
        try:
            txt = p.read_text("utf-8", "replace")[:300000]
        except OSError:
            continue
        if re.search(r"^if\s+__name__\s*==\s*['\"]__main__['\"]", txt, re.M):
            pys.append(p)
        if len(pys) >= 30:
            break
    pys.sort(key=lambda p: (p.name not in ("main.py", "app.py", "__main__.py", "run.py"), len(p.parts), str(p)))
    for p in pys:
        out.append({"label": "Python: " + p.relative_to(root).as_posix(), "kind": "py", "script": str(p), "cwd": str(p.parent)})
    for spec in extra:
        name, _, cmd = spec.partition("=")
        if not cmd:
            name, cmd = spec, spec
        out.insert(0, {"label": name.strip(), "kind": "cmd", "shell": cmd.strip(), "cwd": str(root)})
    for i, p in enumerate(out):
        p["id"] = str(i)
    return out


class Presets:
    """Build- und Start-Konfigurationen. Viele enthalten feste Dateilisten („alle .c“, die Units einer .cbp) und veralten,
    sobald Dateien hinzukommen oder verschwinden – beim Arbeiten mit einer KI also ständig. Deshalb wird bei jeder Abfrage und
    vor jedem Benutzen neu erkannt. Die beiden Listen werden an Ort und Stelle ersetzt; ein Preset wird über seine Bezeichnung
    wiedergefunden, weil sich die Nummern verschieben können."""

    def __init__(self, prj, build_extra, run_extra):
        self.prj, self.build_extra, self.run_extra, self.lock = prj, build_extra, run_extra, threading.Lock()
        self.build, self.run = detect_presets(prj, build_extra), detect_run_presets(prj, run_extra)

    def refresh(self):
        with self.lock:
            try:
                b, r = detect_presets(self.prj, self.build_extra), detect_run_presets(self.prj, self.run_extra)
            except Exception:
                return   # z. B. Datei gerade gesperrt – dann gilt der letzte Stand
            self.build[:], self.run[:] = b, r

    def pick(self, lst, pid):
        cur = next((x for x in lst if x["id"] == str(pid)), None)
        if not cur:
            return None
        self.refresh()
        return next((x for x in lst if x["label"] == cur["label"]), None) or cur


def tool_next_to(gcc, name):
    d = os.path.dirname(gcc)
    for cand in (os.path.join(d, name + (".exe" if IS_WIN else "")), os.path.join(d, name)):
        if os.path.isfile(cand):
            return cand
    return shutil.which(name)


class RunState:
    def __init__(self, rid, pr, args, trace):
        self.rid, self.pr, self.args, self.trace = rid, pr, args, bool(trace)
        self.proc, self.status, self.codes, self.history = None, "start", [], []
        self.sym = None            # C: Adresse ↔ Code-Index
        self.ctl_seq, self.ctl_file = 0, None
        self.stop_flag = threading.Event()
        self.test, self.build_log_err, self.fh, self.part = None, None, None, ""   # Testlauf (Ergebnisse je Test) · Build-Fehlertext


class Runner:
    """Verwaltet beliebig viele gleichzeitige Läufe (z. B. Server + mehrere Clients)."""

    def __init__(self, prj: Project):
        self.prj, self.clients, self.lock = prj, [], threading.Lock()
        self.runs, self.next_id = {}, 0
        self.ctl = {"mode": "run", "slow": 0, "bp": []}   # zuletzt gesetzte Debug-Steuerung (gilt für neue Läufe mit)

    # --- Abonnenten (SSE)
    def subscribe(self):
        q = queue.Queue(maxsize=8000)
        with self.lock:
            self.clients.append(q)
            for r in self.runs.values():
                for m in r.history:
                    q.put(m)
                if r.codes:
                    q.put(json.dumps({"k": "w", "run": r.rid, "codes": r.codes}))
        return q

    def unsubscribe(self, q):
        with self.lock:
            if q in self.clients:
                self.clients.remove(q)

    def send(self, r, obj, keep=False):
        obj["run"] = r.rid
        msg = json.dumps(obj, ensure_ascii=False, separators=(",", ":"))
        with self.lock:
            if keep:
                r.history.append(msg)
            for q in self.clients:
                try:
                    q.put_nowait(msg)
                except queue.Full:
                    pass

    # --- Steuerung
    def start(self, preset, args, trace):
        with self.lock:
            self.next_id += 1
            r = RunState(self.next_id, preset, args, trace)
            self.runs[r.rid] = r
            # beendete Läufe aufräumen (höchstens 12 behalten)
            done = [x for x in self.runs.values() if x.status == "ended"]
            for x in done[:-12]:
                self.runs.pop(x.rid, None)
        threading.Thread(target=self._run, args=(r,), daemon=True).start()
        return r.rid

    def _targets(self, rid):
        with self.lock:
            return [r for r in self.runs.values() if (rid is None or r.rid == rid) and r.status != "ended"]

    def stop(self, rid=None):
        for r in self._targets(rid):
            r.stop_flag.set()
            p = r.proc
            if p and p.poll() is None:
                try:
                    if IS_WIN:
                        subprocess.run(["taskkill", "/F", "/T", "/PID", str(p.pid)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                    else:
                        os.killpg(os.getpgid(p.pid), 15)
                except Exception:
                    try:
                        p.kill()
                    except Exception:
                        pass

    def stdin(self, rid, text):
        for r in self._targets(rid):
            p = r.proc
            if p and p.poll() is None and p.stdin:
                try:
                    p.stdin.write((text + "\n").encode("utf-8"))
                    p.stdin.flush()
                except OSError:
                    pass

    # --- Debugger: Pause / Schritt / Zeitlupe / Haltepunkte
    def control(self, rid, mode="run", slow=0, step=0, bp=()):
        self.ctl = {"mode": mode, "slow": int(slow or 0), "bp": list(bp or [])}
        for r in self._targets(rid):
            self._write_ctl(r, mode, slow, step, bp)

    def _bp_abs(self, bp):
        out = []
        for b in bp or []:
            try:
                out.append((str(self.prj.resolve(b.get("path", ""))), int(b.get("line") or 0), str(b.get("name") or "")))
            except (PermissionError, ValueError):
                pass
        return out

    def _write_ctl(self, r, mode, slow, step, bp):
        if not r.trace or not r.ctl_file:
            return
        r.ctl_seq += 1
        bps = self._bp_abs(bp)
        if r.pr["kind"] == "py":
            data = json.dumps({"seq": r.ctl_seq, "mode": mode, "slow": int(slow or 0), "step": int(step or 0), "bp": [list(b) for b in bps]})
        else:
            addrs = []
            if r.sym:
                for idx, name, path, line in r.codes:
                    for bp_path, bl, bn in bps:
                        try:
                            same = Path(self.prj.resolve(path)) == Path(bp_path)
                        except (PermissionError, ValueError):
                            same = False
                        if same and (abs(int(line or 0) - bl) <= 3 or name == bn):
                            a = r.sym["rev"].get(idx)
                            if a is not None:
                                addrs.append("%x" % (a + r.sym["offset"]))
            data = f"{r.ctl_seq} {1 if mode == 'pause' else 0} {int(slow or 0)} {int(step or 0)} {len(addrs)} " + " ".join(addrs) + "\n"
        tmp = r.ctl_file.with_suffix(".tmp")
        tmp.write_text(data, "utf-8")
        os.replace(tmp, r.ctl_file)

    # --- C/C++ übersetzen (mit -finstrument-functions) und Symbole auflösen
    def _build_c(self, r, tdir):
        pr, trace = r.pr, r.trace
        gcc = pr["gcc"]
        units = pr["units"]
        cxx = any(u.lower().endswith((".cpp", ".cc", ".cxx")) for u in units)
        comp = tool_next_to(gcc, "g++") if cxx else gcc
        exe = tdir / (f"atlas_run_{r.rid}.exe" if IS_WIN else f"atlas_run_{r.rid}")
        libs_txt = " ".join(pr["libs"]).lower()
        # send/recv mitschneiden: POSIX immer, Windows nur 64-bit + Winsock
        net = False
        if trace:
            if not IS_WIN:
                net = True
            elif ("ws2_32" in libs_txt or "wsock32" in libs_txt):
                try:
                    net = "x86_64" in subprocess.run([gcc, "-dumpmachine"], stdout=subprocess.PIPE).stdout.decode()
                except OSError:
                    net = False
        cmds = []
        rt_o = tdir / f"atlas_trace_{r.rid}.o"
        if trace:
            (tdir / "atlas_trace.c").write_text(RUNTIME_C, "utf-8")
            cmds.append([gcc, "-c", "-O2", str(tdir / "atlas_trace.c"), "-o", str(rt_o)] + (["-DATLAS_NET"] if net else []) + ([] if IS_WIN else ["-pthread"]))
        excl = "/usr/include,/usr/lib,mingw,MinGW,mingw64,c++/,bits/"
        main = [comp, "-g", "-O0", "-fno-omit-frame-pointer", "-fdiagnostics-color=never"]
        if trace:
            main += ["-finstrument-functions", "-finstrument-functions-exclude-file-list=" + excl]
        main += pr["opts"] + pr["incs"] + units + ([str(rt_o)] if trace else []) + ["-o", str(exe)] + pr["ldirs"] + pr["libs"]
        if net:
            main.append("-Wl,--wrap=send,--wrap=recv")
            if IS_WIN and "ws2_32" not in libs_txt:
                main.append("-lws2_32")
        if not IS_WIN:
            main.append("-pthread")
        cmds.append(main)
        log = []
        for c in cmds:
            p = subprocess.run(c, cwd=pr["cwd"], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL)
            txt = p.stdout.decode("utf-8", "replace") if p.stdout else ""
            log.append("$ " + subprocess.list2cmdline(c) + "\n" + txt)
            if p.returncode != 0:
                r.build_log_err = "\n".join(log)
                self.send(r, {"k": "build", "ok": False, "output": "\n".join(log)}, keep=True)
                return None
        self.send(r, {"k": "build", "ok": True, "output": "\n".join(log)}, keep=True)
        sym = {"offset": 0, "anchor": None, "map": {}, "rev": {}}
        r.sym = sym
        if not trace:
            return exe
        nm, a2l = tool_next_to(gcc, "nm"), tool_next_to(gcc, "addr2line")
        if not nm:
            self.send(r, {"k": "o", "lines": [["sys", "nm nicht gefunden – Funktionen können nicht zugeordnet werden"]]})
            return exe
        p = subprocess.run([nm, "--defined-only", str(exe)], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
        addrs = {}
        for line in p.stdout.decode("utf-8", "replace").splitlines():
            parts = line.split()
            if len(parts) >= 3 and parts[1] in ("T", "t"):
                try:
                    addrs[int(parts[0], 16)] = parts[2]
                except ValueError:
                    pass
                if parts[2].lstrip("_") == "atlas_anchor":
                    sym["anchor"] = int(parts[0], 16)
        files = {}
        if a2l and addrs:
            keys = list(addrs.keys())
            p = subprocess.run([a2l, "-f", "-C", "-e", str(exe)], input="\n".join("%x" % a for a in keys).encode(), stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
            lines = p.stdout.decode("utf-8", "replace").splitlines()
            for j, a in enumerate(keys):
                if 2 * j + 1 < len(lines):
                    fl = lines[2 * j + 1].rsplit(":", 1)
                    files[a] = (lines[2 * j], fl[0], int(re.sub(r"\D.*$", "", fl[1]) or 0) if len(fl) > 1 else 0)
        codes = []
        for a, name in addrs.items():
            fn, f, ln = files.get(a, (name, "??", 0))
            if f in ("??", ""):
                continue
            full = Path(f) if os.path.isabs(f) else Path(pr["cwd"]) / f
            try:
                full = full.resolve()
                if self.prj.root not in full.parents or ".codeatlas" in full.parts or not full.is_file():
                    continue
            except OSError:
                continue
            idx = len(codes)
            codes.append([idx, fn if fn and fn != "??" else name, self.prj.rel(full), ln])
            sym["map"][a] = idx
            sym["rev"][idx] = a
        r.codes = codes
        self.send(r, {"k": "w", "codes": codes})
        return exe

    # --- Trace-Zeilen der C-Laufzeit in Code-Indizes umsetzen
    def _conv_c(self, r, obj):
        sym = r.sym
        k = obj.get("k")
        if k == "base":
            if sym["anchor"] is not None:
                sym["offset"] = int(obj["anchor"], 16) - sym["anchor"]
            # Haltepunkte erst jetzt (mit bekanntem Adress-Offset) setzen
            c = self.ctl
            if c["mode"] != "run" or c["slow"] or c["bp"]:
                self._write_ctl(r, c["mode"], c["slow"], 0, c["bp"])
            return None
        A = lambda h: -1 if h in ("0", "") else sym["map"].get(int(h, 16) - sym["offset"])
        if k == "w":
            calls = [[A(c[0])] + c[1:] for c in obj.get("calls", []) if A(c[0]) is not None]
            edges = [[A(e[0]) if A(e[0]) is not None else -1, A(e[1])] + e[2:] for e in obj.get("edges", []) if A(e[1]) is not None]
            stacks = []
            for s in obj.get("stacks", []):
                st = [x for x in (A(h) for h in s[2]) if x is not None and x >= 0]
                pz = s[3] if len(s) > 3 else None
                if pz:
                    top = A(pz[0])
                    pz = [top if top is not None else (st[-1] if st else -1), "", [], pz[3]]
                stacks.append([s[0], s[1], st, pz])
            ev = []
            for e in obj.get("ev", []):
                fi = A(e[2])
                if fi is None:
                    if e[0] == "e":
                        fi = -1
                    else:
                        continue
                if e[0] == "c":
                    p = A(e[3])
                    ev.append(["c", e[1], fi, p if p is not None else -1, e[4], ""])
                elif e[0] == "e":
                    ev.append(["e", e[1], fi, e[3], e[4], e[5], e[6], e[7]])
                else:
                    ev.append(["r", e[1], fi, e[3], e[4], ""])
            out = {"k": "w", "t": obj.get("t"), "calls": calls, "edges": edges, "stacks": stacks, "ev": ev}
            if "dbg" in obj:
                out["dbg"] = obj["dbg"]
            return out
        if k == "crash":
            st = [x for x in (A(h) for h in obj.get("stack", [])) if x is not None and x >= 0]
            sig = int(obj.get("sig", 0))
            msg = "Absturz: " + SIGNAMES.get(sig, f"Signal/Code {sig}")
            return {"k": "w", "ev": [["F", obj.get("th", 0), st[0] if st else -1, 0, 0, msg, [[i, 0] for i in reversed(st)]]]}
        return None

    def _conv_py(self, r, obj):
        if obj.get("codes"):
            conv = []
            for i, name, f, line in obj["codes"]:
                try:
                    p = Path(f).resolve()
                    rel = self.prj.rel(p) if self.prj.root in p.parents else None
                except (OSError, ValueError):
                    rel = None
                conv.append([i, name, rel, line])
            obj["codes"] = conv
            with self.lock:
                r.codes.extend(conv)
        return obj

    # --- eigentlicher Lauf
    def _kill(self, p):
        if p and p.poll() is None:
            try:
                if IS_WIN:
                    subprocess.run(["taskkill", "/F", "/T", "/PID", str(p.pid)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                else:
                    os.killpg(os.getpgid(p.pid), 9)
            except Exception:
                try:
                    p.kill()
                except Exception:
                    pass

    def _run(self, r):
        pr, rid, trace = r.pr, r.rid, r.trace
        t0 = time.time()
        tdir = self.prj.root / ".codeatlas"
        tdir.mkdir(exist_ok=True)
        tfile = tdir / f"trace_{rid}.jsonl"
        r.ctl_file = tdir / f"ctl_{rid}.txt"
        tout = tdir / f"tests_{rid}.jsonl"
        for f in (tfile, r.ctl_file, tout):
            try:
                f.unlink()
            except OSError:
                pass
        argl = list(pr["argl"]) if pr.get("argl") is not None else shlex.split(r.args or "", posix=not IS_WIN)
        env = dict(os.environ, PYTHONUNBUFFERED="1", PYTHONIOENCODING="utf-8")
        if trace:
            env["ATLAS_CTL_FILE"] = str(r.ctl_file)
        if pr.get("test"):
            write_test_support(tdir)
            env["ATLAS_TEST_OUT"] = str(tout)
            r.test = {"kind": pr["test"], "out": tout, "by": {}, "order": [], "raw": {}, "pending": None, "pending_raw": None, "pending_t": 0,
                      "hits": {}, "cur": None, "per": {}, "crash": None, "stack": [], "info": {}, "restarts": 0, "after": None, "timeout": False,
                      "t0": t0, "fh": None, "part": "", "tail": collections.deque(maxlen=200), "done": False}
        shell = False
        self.send(r, {"k": "start", "label": pr["label"], "kind": pr["kind"], "trace": trace, "preset": pr["id"], "args": r.args, "test": pr.get("test"), "partial": bool(pr.get("partial"))}, keep=True)
        if trace and pr["kind"] == "py":
            c = self.ctl
            if c["mode"] != "run" or c["slow"] or c["bp"]:
                self._write_ctl(r, c["mode"], c["slow"], 0, c["bp"])
        if pr["kind"] == "py":
            if trace:
                (tdir / "atlas_tracer.py").write_text(TRACER_PY, "utf-8")
                argv = [sys.executable, "-u", str(tdir / "atlas_tracer.py"), str(self.prj.root), str(tfile), pr["script"]] + argl
            else:
                argv = [sys.executable, "-u", pr["script"]] + argl
        elif pr["kind"] == "c":
            r.status = "building"
            self.send(r, {"k": "phase", "phase": "build"})
            exe = self._build_c(r, tdir)
            if not exe:
                r.status = "ended"
                if r.test:
                    r.test["ms"] = int((time.time() - t0) * 1000)
                    self._test_finish(r)
                self.send(r, {"k": "end", "code": -1, "ms": int((time.time() - t0) * 1000), "reason": "Build fehlgeschlagen"}, keep=True)
                return
            argv = [str(exe)] + argl
            env["ATLAS_TRACE_FILE"] = str(tfile) if trace else ""
        else:
            argv, shell = pr["shell"] + ((" " + r.args) if r.args else ""), True
        if r.stop_flag.is_set():
            r.status = "ended"
            self.send(r, {"k": "end", "code": None, "ms": 0, "reason": "abgebrochen"}, keep=True)
            return
        r.fh, r.part = None, ""
        T = r.test
        while True:
            now_argv = argv + ["--after", T["after"]] if (T and T["after"] and isinstance(argv, list)) else argv
            code = self._exec(r, now_argv, shell, env, tfile, tout)
            if code is None and r.proc is None and r.status == "ended":
                return   # Start fehlgeschlagen (bereits gemeldet)
            if not T or not T["pending"]:
                break
            # ein Test hat das Programm abstürzen lassen oder hing → als Fehler werten und hinter ihm weitermachen
            raw = T["pending_raw"]
            self._test_crashed(r, code)
            if r.stop_flag.is_set() or T["restarts"] >= 60 or not isinstance(argv, list):
                break
            T["after"], T["restarts"] = raw, T["restarts"] + 1
            if pr["kind"] == "py":   # der neue Prozess zählt Funktionen wieder ab 0 – hinter den bisherigen weiterzählen, sonst vermischen sich die Zähler
                env["ATLAS_IDX0"] = str(max([c[0] for c in r.codes] or [-1]) + 1)
            self.send(r, {"k": "o", "lines": [["sys", "— Testprogramm neu gestartet, weiter nach dem abgebrochenen Test —"]]})
        r.proc = None
        if code is not None and code < 0 and not IS_WIN and pr["kind"] == "c":
            reason = SIGNAMES.get(-code, f"Signal {-code}")
        elif IS_WIN and code is not None and code & 0xFFFFFFFF in SIGNAMES:
            reason = SIGNAMES[code & 0xFFFFFFFF]
        else:
            reason = "abgebrochen" if r.stop_flag.is_set() else ""
        for fh in (r.fh, T and T["fh"]):
            if fh:
                try:
                    fh.close()
                except OSError:
                    pass
        if T:
            T["code"], T["ms"] = code, int((time.time() - t0) * 1000)
            if T.get("restarts"):
                reason = ""   # Abstürze sind den einzelnen Tests zugeordnet
            self._test_finish(r)
        r.status = "ended"
        self.send(r, {"k": "end", "code": code, "ms": int((time.time() - t0) * 1000), "reason": reason}, keep=True)

    def _exec(self, r, argv, shell, env, tfile, tout):
        pr, trace, T = r.pr, r.trace, r.test
        self.send(r, {"k": "phase", "phase": "run", "cmd": argv if isinstance(argv, str) else subprocess.list2cmdline(argv)})
        try:
            flags = 0x00000200 if IS_WIN else 0
            proc = subprocess.Popen(argv, cwd=pr["cwd"], shell=shell, env=env, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                    stderr=subprocess.PIPE, creationflags=flags, start_new_session=not IS_WIN)
        except OSError as e:
            r.status, r.proc = "ended", None
            self.send(r, {"k": "o", "lines": [["err", str(e)]]})
            if T:
                T["note"] = "Start fehlgeschlagen: " + str(e)
                self._test_finish(r)
            self.send(r, {"k": "end", "code": -1, "ms": 0}, keep=True)
            return None
        r.proc, r.status = proc, "running"
        buf, blk = [], threading.Lock()

        def reader(stream, kind):
            for raw in iter(stream.readline, b""):
                try:
                    txt = raw.decode("utf-8")
                except UnicodeDecodeError:
                    txt = raw.decode("cp1252" if IS_WIN else "latin-1", "replace")
                with blk:
                    buf.append([kind, txt.rstrip("\r\n")])
            stream.close()

        rs = [threading.Thread(target=reader, args=(proc.stdout, "out"), daemon=True), threading.Thread(target=reader, args=(proc.stderr, "err"), daemon=True)]
        for t in rs:
            t.start()

        def pump(final=False):
            with blk:
                lines = buf[:]
                del buf[:]
            if lines:
                if T:
                    T["tail"].extend(l[1] for l in lines)
                if len(lines) > 800:
                    lines = lines[:400] + [["sys", f"… {len(lines) - 800} Zeilen ausgelassen …"]] + lines[-400:]
                self.send(r, {"k": "o", "lines": lines})
            if trace:
                if r.fh is None and tfile.exists():
                    r.fh = open(tfile, "r", encoding="utf-8", errors="replace")
                if r.fh is not None:
                    data = r.part + r.fh.read()
                    rows = data.split("\n")
                    r.part = "" if final else rows.pop()
                    for row in rows:
                        if not row.strip():
                            continue
                        try:
                            obj = json.loads(row)
                        except ValueError:
                            continue
                        if obj.get("k") == "mark":
                            if T:
                                self._test_mark(r, obj)
                            continue
                        conv = self._conv_c(r, obj) if pr["kind"] == "c" else self._conv_py(r, obj)
                        if conv:
                            if T:
                                self._test_hits(r, conv)
                            self.send(r, conv)
            if T:
                if T["fh"] is None and tout.exists():
                    T["fh"] = open(tout, "r", encoding="utf-8", errors="replace")
                if T["fh"] is not None:
                    data = T["part"] + T["fh"].read()
                    rows = data.split("\n")
                    T["part"] = "" if final else rows.pop()
                    for row in rows:
                        if row.strip():
                            try:
                                self._test_ev(r, json.loads(row))
                            except ValueError:
                                pass

        while proc.poll() is None:
            pump()
            c = self.ctl
            if T and T["pending"] and c["mode"] == "run" and not c["slow"] and not c["bp"] and time.time() - T["pending_t"] > TEST_TIMEOUT:
                T["timeout"] = True
                self._kill(proc)
            time.sleep(0.05)
        for t in rs:
            t.join(timeout=1.5)
        time.sleep(0.15)
        pump(final=True)
        return proc.returncode   # Dateien bleiben offen: nach einem Neustart (Absturz im Test) wird an derselben Stelle weitergelesen

    # --- Tests: Ereignisse des Test-Runners, Markierungen im Trace, Abstürze, Zusammenfassung
    def _tid(self, raw):
        p, sep, rest = str(raw).partition("::")
        if not sep:
            return raw
        try:
            q = Path(p)
            full = q if q.is_absolute() else (self.prj.root / q)
            full = full.resolve()
            if full == self.prj.root or self.prj.root in full.parents:
                return self.prj.rel(full) + "::" + rest
        except (OSError, ValueError):
            pass
        return raw

    def _rel(self, f):
        try:
            full = Path(f).resolve()
            if self.prj.root in full.parents and ".codeatlas" not in full.parts:
                return self.prj.rel(full)
        except (OSError, ValueError):
            pass
        return None

    def _entry(self, r, tid, raw=None, **kw):
        T = r.test
        e = T["by"].get(tid)
        if not e:
            nm = tid.split("::", 1)[-1]
            e = T["by"][tid] = {"id": tid, "name": nm, "file": tid.split("::", 1)[0] if "::" in tid else None, "line": 0, "status": "queued"}
            T["order"].append(tid)
        if raw:
            T["raw"][tid] = raw
        e.update({k: v for k, v in kw.items() if v is not None})
        return e

    def _test_ev(self, r, o):
        T, t = r.test, o.get("t")
        if t == "info":
            T["info"].update({k: v for k, v in o.items() if k != "t"})
            self.send(r, {"k": "test", "ev": "info", "info": T["info"]}, keep=True)
        elif t == "collect":
            out = []
            for x in o.get("tests") or []:
                tid = self._tid(x["id"])
                e = self._entry(r, tid, x["id"], name=x.get("name"), file=self._rel(x.get("file") or "") or None, line=x.get("line"))
                out.append({k: e.get(k) for k in ("id", "name", "file", "line", "status")})
            self.send(r, {"k": "test", "ev": "collect", "tests": out}, keep=True)
        elif t == "start":
            tid = self._tid(o["id"])
            self._entry(r, tid, o["id"], status="running")
            T["pending"], T["pending_raw"], T["pending_t"] = tid, o["id"], time.time()
            self.send(r, {"k": "test", "ev": "start", "id": tid}, keep=True)
        elif t == "end":
            tid = self._tid(o["id"])
            e = self._entry(r, tid, o["id"])
            e.update(self._result(r, o))
            if tid in T["per"]:
                e["ran"] = self._ran(r, T["per"][tid])
            if T["pending"] == tid:
                T["pending"] = None
            self.send(r, {"k": "test", "ev": "end", "test": e}, keep=True)

    def _frame(self, f, loc=None):
        rel = self._rel(f[0])
        if not rel:
            return None
        d = {"path": rel, "line": f[1], "func": f[2], "code": f[3] if len(f) > 3 else ""}
        if loc:
            d["locals"] = loc
        return d

    def _result(self, r, o):
        res = {"status": o.get("status", "error"), "ms": o.get("ms", 0)}
        for k in ("etype", "msg", "out", "phase"):
            if o.get(k):
                res[k] = o[k]
        frames = []
        for j, f in enumerate(o.get("frames") or []):
            d = self._frame(f, (o.get("locals") or {}).get(str(j)))
            if d:
                frames.append(d)
        if frames:
            res["frames"] = frames
            prog = [f for f in frames if not is_test_path(f["path"])]
            tst = [f for f in frames if is_test_path(f["path"])]
            if prog:
                res["where"] = prog[-1]
            if tst:
                res["at"] = tst[-1]
        if o.get("checks"):
            res["checks"] = []
            for c in o["checks"]:
                res["checks"].append({"expr": c.get("expr", ""), "detail": c.get("detail", ""), "path": self._rel(c.get("file", "")) or c.get("file", ""), "line": c.get("line", 0)})
            c0 = res["checks"][0]
            res["at"] = {"path": c0["path"], "line": c0["line"], "code": "CHECK(" + c0["expr"] + ")"}
            res.setdefault("etype", "Prüfung fehlgeschlagen")
            res.setdefault("msg", c0["expr"] + ("  →  " + c0["detail"] if c0["detail"] else "") + (f"  (+{o.get('nfail', 1) - 1} weitere)" if o.get("nfail", 1) > 1 else ""))
        return res

    def _codes_by_idx(self, r):
        return {c[0]: c for c in r.codes}

    def _ran(self, r, hits):
        cb, out = self._codes_by_idx(r), []
        for idx, n in hits.items():
            c = cb.get(idx)
            if not c or not c[2] or is_test_path(c[2]):
                continue
            out.append({"name": c[1], "path": c[2], "line": c[3], "n": n})
        return out[:60]

    def _test_hits(self, r, conv):
        T = r.test
        for c in conv.get("calls") or []:
            idx, n = c[0], c[1] if len(c) > 1 else 0
            if idx is None or idx < 0 or not n:
                continue
            T["hits"][idx] = T["hits"].get(idx, 0) + n
            if T["cur"] is not None:
                T["cur"][idx] = T["cur"].get(idx, 0) + n
        st = conv.get("stacks") or []
        if st and st[0][2]:
            T["stack"] = list(st[0][2])
        for e in conv.get("ev") or []:
            if e and e[0] == "F":
                T["crash"] = e

    def _test_mark(self, r, obj):
        T, tid = r.test, self._tid(obj.get("id", ""))
        if obj.get("t") == "start":
            T["cur"], T["cur_id"] = {}, tid
        elif obj.get("t") == "end" and T["cur"] is not None:
            T["per"][tid] = T["cur"]
            T["cur"] = None
            codes = [[i, n] for i, n in T["per"][tid].items()]
            self.send(r, {"k": "test", "ev": "hits", "id": tid, "codes": codes}, keep=True)
            e = T["by"].get(tid)
            if e and e.get("status") not in ("queued", "running"):
                e["ran"] = self._ran(r, T["per"][tid])
                self.send(r, {"k": "test", "ev": "end", "test": e}, keep=True)   # Ergebnis kam vor der Markierung an → mit Funktionsliste nachreichen

    def _test_crashed(self, r, code):
        T = r.test
        tid = T["pending"]
        if T["cur"] is not None:
            T["per"][tid] = T["cur"]
            T["cur"] = None
        cb = self._codes_by_idx(r)
        if T["timeout"]:
            etype, msg, stack = "Zeitlimit", f"Der Test lief länger als {TEST_TIMEOUT} s und wurde abgebrochen (Endlosschleife? wartet auf Eingabe?). Stelle beim Abbruch: siehe Aufrufpfad.", T["stack"]
        else:
            if code is not None and code < 0 and not IS_WIN:
                why = SIGNAMES.get(-code, f"Signal {-code}")
            elif IS_WIN and code is not None and code & 0xFFFFFFFF in SIGNAMES:
                why = SIGNAMES[code & 0xFFFFFFFF]
            else:
                why = f"Programm beendet sich mitten im Test (Exit-Code {code})"
            etype, msg = "Absturz", why
            stack = [x[0] for x in (T["crash"][6] if T["crash"] and len(T["crash"]) > 6 else [])] or T["stack"]
        frames = []
        for idx in stack:
            c = cb.get(idx)
            if c and c[2]:
                code = ""
                try:
                    with open(self.prj.resolve(c[2]), encoding="utf-8", errors="replace") as fh:
                        for i, ln in enumerate(fh, 1):
                            if i == c[3]:
                                code = ln.strip()[:200]
                                break
                except (OSError, PermissionError, ValueError):
                    pass
                frames.append({"path": c[2], "line": c[3], "func": c[1], "code": code})
        o = {"status": "error", "etype": etype, "msg": msg, "ms": int((time.time() - T["pending_t"]) * 1000), "out": "\n".join(list(T["tail"])[-30:])}
        e = self._entry(r, tid)
        e.update(o)
        if frames:
            e["frames"] = frames
            prog = [f for f in frames if not is_test_path(f["path"])]
            tst = [f for f in frames if is_test_path(f["path"])]
            if prog:
                e["where"] = prog[-1]
            if tst:
                e["at"] = tst[-1]
        if tid in T["per"]:
            e["ran"] = self._ran(r, T["per"][tid])
        T["pending"], T["timeout"], T["crash"] = None, False, None
        self.send(r, {"k": "test", "ev": "end", "test": e}, keep=True)

    def _test_counts(self, r):
        cnt = {"passed": 0, "failed": 0, "error": 0, "skipped": 0}
        for e in r.test["by"].values():
            if e.get("status") in cnt:
                cnt[e["status"]] += 1
        return cnt

    def _test_finish(self, r):
        T = r.test
        if T.get("done"):
            return
        for tid in T["order"]:   # nie gestartet (z. B. Abbruch)
            e = T["by"][tid]
            if e["status"] in ("queued", "running"):
                e["status"] = "skipped"
                e["msg"] = "nicht ausgeführt (Lauf abgebrochen)"
        cov = None
        try:
            if T["kind"] == "c":
                prog = [c for c in r.codes if c[2] and not is_test_path(c[2]) and not str(c[1]).startswith("atlas_")]
                miss = [{"name": c[1], "path": c[2], "line": c[3]} for c in prog if not T["hits"].get(c[0])]
                cov = {"reached": len(prog) - len(miss), "total": len(prog), "missing": miss[:60]}
            elif T["kind"] == "py":
                fns = py_functions(self.prj)
                done = {}
                for c in r.codes:
                    if c[2] and T["hits"].get(c[0]):
                        done.setdefault(c[2], []).append(c[3] or 0)
                miss = [f for f in fns if not any(f["first"] <= ln <= f["line"] for ln in done.get(self.prj.name + "/" + f["path"], []))]
                cov = {"reached": len(fns) - len(miss), "total": len(fns), "missing": [{"name": m["name"], "path": self.prj.name + "/" + m["path"], "line": m["line"]} for m in miss[:60]]}
        except Exception as e:   # Abdeckung ist Zusatz – nie den Lauf daran scheitern lassen
            cov = {"reached": 0, "total": 0, "missing": [], "error": str(e)}
        if r.build_log_err:
            T["build_error"] = r.build_log_err
        if T["kind"] != "cmd" and not T["order"] and not T.get("build_error"):
            T["note"] = "Keine Tests gefunden. " + TEST_HOWTO
        # Vergleich mit dem vorigen Lauf: was ist neu kaputt, was repariert
        hist, was = self.__dict__.setdefault("test_hist", {}), {}
        for tid in T["order"]:
            e = T["by"][tid]
            st = e["status"]
            if st in ("passed", "failed", "error") and e.get("msg") != "nicht ausgeführt (Lauf abgebrochen)":
                w = hist.get(tid)
                if w and (w == "passed") != (st == "passed"):
                    e["was"] = was[tid] = w
                hist[tid] = st
        T["cov"], T["done"] = cov, True
        self.send(r, {"k": "tests", "ev": "done", "summary": self._test_counts(r), "cov": cov, "ms": T.get("ms"), "code": T.get("code"), "was": was, "partial": bool(r.pr.get("partial"))}, keep=True)


TRACER_PY = r'''"""CodeAtlas Python-Tracer – wird von der Bridge gestartet: python -u atlas_tracer.py ROOT OUT skript.py [args…]
Schreibt alle 100 ms ein JSON-Fenster mit Aufrufen, Kanten, Stacks, Ereignissen und Fehlern nach OUT."""
import sys, os, threading, time, json, reprlib, runpy, traceback, re, atexit

ROOT = os.path.normcase(os.path.realpath(sys.argv[1]))
OUT = sys.argv[2]
TARGET = sys.argv[3:]
LIB = re.compile(r"[\\/](site-packages|dist-packages|\.?venv[^\\/]*|virtualenvs?|\.tox|\.nox|third[_-]?party|__pycache__|\.codeatlas)[\\/]", re.I)
PREFIXES = {os.path.normcase(os.path.realpath(p)) for p in (sys.prefix, sys.base_prefix, sys.exec_prefix) if p}
PREFIXES = {p for p in PREFIXES if not (ROOT == p or ROOT.startswith(p + os.sep))}
SELF = os.path.normcase(os.path.realpath(__file__))
# „Signale“: Übergaben an Kanäle (Queue, Socket, Event, Serial, MQTT, Qt …)
CHAN_MOD = re.compile(r"^_?(queue|multiprocessing|asyncio|socket|ssl|threading|serial|requests|http|urllib|paho|zmq|PySide6|PyQt5|PyQt6|tkinter|can|pymodbus|opcua|asyncua|websocket|websockets)\b")
CHAN_FN = re.compile(r"(^|\.)(put|put_nowait|get|get_nowait|send|sendall|sendto|recv|recvfrom|recv_into|connect|write|read|readline|emit|publish|subscribe|set|wait|notify|notify_all|post|request|urlopen|after|send_message|recv_message|read_holding_registers|write_register|write_coil)$")
SEND = re.compile(r"(put|send|emit|publish|set|notify|write|post|after)", re.I)
IGN = (StopIteration, StopAsyncIteration, GeneratorExit)
DETAIL, WIN = 300, 0.1

rep = reprlib.Repr()
rep.maxstring, rep.maxother, rep.maxlevel, rep.maxlist, rep.maxdict, rep.maxtuple, rep.maxset = 60, 40, 2, 6, 4, 6, 6
lock = threading.Lock()
T0 = time.perf_counter()
codes, newcodes, nidx = {}, [], [int(os.environ.get("ATLAS_IDX0") or 0)]
calls, edges, ext, ev, budget = {}, {}, {}, [], [DETAIL]
stacks, tnames = {}, {}
out = open(OUT, "a", encoding="utf-8", buffering=1)
get_ident = threading.get_ident

# ---------------------------------------------------------------- Debugger: Pause / Schritt / Zeitlupe / Haltepunkte
CTL_FILE = os.environ.get("ATLAS_CTL_FILE", "")


class _Ctl:
    on, mode, slow, tokens, seq, reason = False, "run", 0, 0, None, ""
    bp, bpc = [], {}


CTL = _Ctl()
cond = threading.Condition()
paused = {}  # tid -> [idx, args, caller-locals, grund]


def ctl_reader():
    last = None
    while True:
        time.sleep(0.04)
        try:
            st = os.stat(CTL_FILE)
        except OSError:
            continue
        key = (st.st_mtime_ns, st.st_size)
        if key == last:
            continue
        last = key
        try:
            with open(CTL_FILE, encoding="utf-8") as fh:
                d = json.load(fh)
        except Exception:
            continue
        if d.get("seq") == CTL.seq:
            continue
        with cond:
            CTL.seq = d.get("seq")
            CTL.mode = "pause" if d.get("step") else d.get("mode", "run")
            CTL.slow = int(d.get("slow") or 0)
            CTL.tokens += int(d.get("step") or 0)
            bp = [(os.path.normcase(os.path.realpath(p)), int(l), n) for p, l, n in d.get("bp", [])]
            if bp != CTL.bp:
                CTL.bp, CTL.bpc = bp, {}
            CTL.reason = "" if CTL.mode != "pause" else (CTL.reason or "Pause")
            CTL.on = CTL.mode == "pause" or CTL.slow > 0 or bool(CTL.bp)
            cond.notify_all()


def bp_hit(code):
    r = CTL.bpc.get(code)
    if r is None:
        p, nm = os.path.normcase(os.path.realpath(code.co_filename)), code.co_name
        r = any(p == bp_p and (abs(code.co_firstlineno - bl) <= 3 or nm == bn) for bp_p, bl, bn in CTL.bp)
        CTL.bpc[code] = r
    return r


def locals_of(frame, limit=16):
    out = []
    try:
        for k, v in list(frame.f_locals.items()):
            if k.startswith("__") or callable(v) and not hasattr(v, "__self__") and type(v).__name__ in ("function", "type", "module", "builtin_function_or_method"):
                continue
            try:
                out.append([k, rep.repr(v)])
            except Exception:
                out.append([k, "?"])
            if len(out) >= limit:
                break
    except Exception:
        pass
    return out


def gate(i, code, frame):
    if CTL.slow and CTL.mode != "pause":
        time.sleep(CTL.slow / 1000.0)
    hit = bool(CTL.bp) and bp_hit(code)
    if CTL.mode != "pause" and not hit:
        return
    t = get_ident()
    with cond:
        if hit and CTL.mode != "pause":
            CTL.mode, CTL.reason, CTL.on = "pause", "Haltepunkt", True
        if CTL.mode != "pause":
            return
        try:
            info = [i, args_of(frame), locals_of(frame.f_back) if frame.f_back is not None else [], "Haltepunkt" if hit else "Pause"]
        except Exception:
            info = [i, "", [], "Pause"]
        paused[t] = info
        while CTL.mode == "pause" and CTL.tokens <= 0:
            cond.wait(0.25)
        if CTL.mode == "pause":
            CTL.tokens -= 1
        paused.pop(t, None)


if CTL_FILE:
    threading.Thread(target=ctl_reader, name="codeatlas-ctl", daemon=True).start()


# ---------------------------------------------------------------- Netzwerk-Kanäle: prozessübergreifend gleicher Schlüssel
def _host(a):
    h = str(a[0]) if isinstance(a, tuple) else str(a)
    if h in ("localhost", "::1", "::ffff:127.0.0.1", "0.0.0.0", "::"):
        h = "127.0.0.1"
    if h.startswith("::ffff:"):
        h = h[7:]
    return h + (":" + str(a[1]) if isinstance(a, tuple) and len(a) >= 2 else "")


def net_key(obj):
    try:
        if hasattr(obj, "getsockname") and hasattr(obj, "getpeername"):
            l = obj.getsockname()
            try:
                r = obj.getpeername()
            except OSError:
                r = None
            kind = "udp" if getattr(obj, "type", 1) == 2 else "tcp"
        else:
            tr = obj if hasattr(obj, "get_extra_info") else getattr(obj, "_transport", None)
            if tr is None or not hasattr(tr, "get_extra_info"):
                return None
            l, r, kind = tr.get_extra_info("sockname"), tr.get_extra_info("peername"), "tcp"
        if not r:
            return ("udp:" + str(l[1])) if kind == "udp" and isinstance(l, tuple) else None
        a, b = sorted([_host(l), _host(r)])
        return kind + ":" + a + "|" + b
    except Exception:
        return None


def now_us():
    return int((time.perf_counter() - T0) * 1e6)


def reg(code):
    i = codes.get(code, -2)
    if i != -2:
        return i
    f, i = code.co_filename, None
    if f and not f.startswith("<"):
        p = os.path.normcase(os.path.realpath(f))
        if p.startswith(ROOT + os.sep) and p != SELF and not LIB.search(p[len(ROOT):]) and not any(p.startswith(x + os.sep) for x in PREFIXES):
            i = nidx[0]
            nidx[0] += 1
            with lock:
                newcodes.append([i, getattr(code, "co_qualname", code.co_name), os.path.realpath(f), code.co_firstlineno])
    codes[code] = i
    return i


def stat(i):
    c = calls.get(i)
    if c is None:
        c = calls[i] = [0, 0, 0, 0]
    return c


def args_of(frame):
    co = frame.f_code
    n = co.co_argcount + co.co_kwonlyargcount + (1 if co.co_flags & 4 else 0) + (1 if co.co_flags & 8 else 0)
    loc, parts = frame.f_locals, []
    for name in co.co_varnames[:n]:
        if name in ("self", "cls"):
            continue
        try:
            parts.append(name + "=" + rep.repr(loc.get(name)))
        except Exception:
            parts.append(name + "=?")
    return ", ".join(parts)[:220]


def push(i, count, frame=None):
    t = get_ident()
    st = stacks.get(t)
    if st is None:
        st = stacks[t] = []
        tnames[t] = threading.current_thread().name
    par = st[-1][0] if st else -1
    ts = now_us()
    st.append([i, ts])
    if not count:
        return
    with lock:
        stat(i)[0] += 1
        e = edges.get((par, i))
        if e is None:
            e = edges[(par, i)] = [0, 0]
        e[0] += 1
        if budget[0] > 0:
            budget[0] -= 1
            try:
                a = args_of(frame) if frame is not None else ""
            except Exception:
                a = ""
            ev.append(["c", t, i, par, ts, a])


def pop(i):
    t = get_ident()
    st = stacks.get(t)
    if not st:
        return None, -1, t
    for k in range(len(st) - 1, -1, -1):
        if st[k][0] == i:
            fr = st[k]
            del st[k:]
            return fr, (st[-1][0] if st else -1), t
    return None, -1, t


def fatal(etype, exc, tb, t):
    items = []
    while tb is not None:
        i = reg(tb.tb_frame.f_code)
        if i is not None:
            items.append([i, tb.tb_lineno])
        tb = tb.tb_next
    with lock:
        ev.append(["F", t, items[-1][0] if items else -1, items[-1][1] if items else 0, now_us(), (etype.__name__ + ": " + str(exc))[:300], items])


def flush():
    with lock:
        nc = newcodes[:]
        del newcodes[:]
        c = [[k] + v for k, v in calls.items() if v[0] or v[1] or v[2] or v[3]]
        calls.clear()
        e = [[a, b] + v for (a, b), v in edges.items()]
        edges.clear()
        x = [[i, n] + v for (i, n), v in ext.items()]
        ext.clear()
        evs = ev[:]
        del ev[:]
        budget[0] = DETAIL
    stk = [[t, tnames.get(t, str(t)), [f[0] for f in st], paused.get(t)] for t, st in list(stacks.items()) if st]
    line = {"k": "w", "t": int((time.perf_counter() - T0) * 1000), "codes": nc, "calls": c, "edges": e, "ext": x, "stacks": stk, "ev": evs}
    if CTL_FILE:
        line["dbg"] = {"mode": CTL.mode, "slow": CTL.slow, "reason": CTL.reason, "seq": CTL.seq, "paused": len(paused)}
    out.write(json.dumps(line, separators=(",", ":"), default=str) + "\n")


WLOCK = threading.Lock()


def mark(obj):
    """Testgrenze: aktuelles Fenster schreiben, dann die Markierung – so lassen sich Aufrufe genau einem Test zuordnen."""
    with WLOCK:
        flush()
        out.write(json.dumps(dict(obj, k="mark"), separators=(",", ":"), default=str) + "\n")


def writer():
    while True:
        time.sleep(WIN)
        try:
            with WLOCK:
                flush()
        except Exception:
            pass


# ---------------------------------------------------------------- Python ≥ 3.12: sys.monitoring (schnell, exakt)
if hasattr(sys, "monitoring"):
    MON = sys.monitoring
    E = MON.events
    DISABLE, MISSING = MON.DISABLE, MON.MISSING
    TOOL = MON.PROFILER_ID
    try:
        MON.use_tool_id(TOOL, "codeatlas")
    except ValueError:
        TOOL = 5
        MON.use_tool_id(TOOL, "codeatlas")

    def on_start(code, off):
        i = reg(code)
        if i is None:
            return DISABLE
        f = sys._getframe(1)
        push(i, True, f)
        if CTL.on:
            gate(i, code, f)

    def on_resume(code, off):
        i = reg(code)
        if i is None:
            return DISABLE
        push(i, False)

    def on_return(code, off, ret):
        i = codes.get(code, -2)
        if i is None:
            return DISABLE
        if i == -2:
            return
        fr, par, t = pop(i)
        if fr is None:
            return
        ts = now_us()
        d = ts - fr[1]
        with lock:
            stat(i)[3] += d
            if budget[0] > 0:
                budget[0] -= 1
                try:
                    rv = "" if ret is None else rep.repr(ret)
                except Exception:
                    rv = "?"
                ev.append(["r", t, i, ts, d, rv])

    def on_yield(code, off, val):
        i = codes.get(code, -2)
        if i is None:
            return DISABLE
        if i != -2:
            pop(i)

    pending = {}  # tid -> (id(exc), Text): Ausnahme aus Fremdcode, noch nicht im Projekt angekommen
    lastx = {}    # tid -> id(exc) der zuletzt gemeldeten Ursprungs-Ausnahme (Durchreichen nicht erneut melden)

    def arrived(i, exc, line):
        p = pending.pop(get_ident(), None)
        if p and p[0] is exc and lastx.get(get_ident()) is not exc:
            lastx[get_ident()] = exc
            ev.append(["x", get_ident(), i, line, now_us(), p[1]])

    def on_unwind(code, off, exc):
        i = codes.get(code)
        if i is None:
            return
        with lock:
            arrived(i, exc, sys._getframe(1).f_lineno)
        fr, par, t = pop(i)
        if fr is None:
            return
        with lock:
            stat(i)[1] += 1
            e = edges.get((par, i))
            if e is None:
                e = edges[(par, i)] = [0, 0]
            e[1] += 1
            ev.append(["u", t, i, par, now_us(), (type(exc).__name__ + ": " + str(exc))[:200]])

    def on_raise(code, off, exc):
        if isinstance(exc, IGN):
            return
        i = reg(code)
        f = sys._getframe(1)
        if i is None:
            # erst melden, wenn die Ausnahme im Projektcode ankommt (sonst nur interne Kontrollfluss-Ausnahmen)
            pending[get_ident()] = (exc, (type(exc).__name__ + ": " + str(exc))[:200] + "  (in " + getattr(code, "co_qualname", code.co_name) + ")")
            return
        where = ""
        t = get_ident()
        if lastx.get(t) is exc:
            return
        lastx[t] = exc
        p = pending.pop(t, None)
        if p and p[0] is exc:
            with lock:
                ev.append(["x", t, i, f.f_lineno, now_us(), p[1]])
            return
        with lock:
            ev.append(["x", get_ident(), i, f.f_lineno if f is not None else 0, now_us(),
                       (type(exc).__name__ + ": " + str(exc))[:200] + (f"  (in {where})" if where else "")])

    def on_handled(code, off, exc):
        if isinstance(exc, IGN):
            return
        i = codes.get(code)
        if i is None:
            return
        with lock:
            line = sys._getframe(1).f_lineno
            arrived(i, exc, line)
            stat(i)[2] += 1
            ev.append(["h", get_ident(), i, line, now_us(), type(exc).__name__])

    def on_call(code, off, func, arg0):
        i = codes.get(code)
        if i is None:
            return DISABLE
        fc = getattr(func, "__code__", None)
        if fc is not None and reg(fc) is not None:
            return
        obj = getattr(func, "__self__", None)
        if isinstance(obj, type(sys)):
            obj = None
        qn = getattr(func, "__qualname__", None) or getattr(type(func), "__qualname__", "?")
        short = qn.rsplit(".", 1)[-1]
        oc = getattr(func, "__objclass__", None)
        mod = getattr(func, "__module__", None) or (oc.__module__ if oc is not None else "") or (type(obj).__module__ if obj is not None else "")
        selfarg = False
        if obj is None and arg0 is not MISSING and hasattr(type(arg0), short) and (oc is None or isinstance(arg0, oc)):
            obj, selfarg = arg0, True
            mod = mod or type(arg0).__module__
        if not ((CHAN_MOD.match(mod or "") or (obj is not None and CHAN_MOD.match(type(obj).__module__ or ""))) and CHAN_FN.search(qn)):
            return DISABLE
        a, chan = "", 0
        if obj is not None:
            chan = net_key(obj) or id(obj)
            if arg0 is not MISSING and not selfarg:
                try:
                    a = rep.repr(arg0)
                except Exception:
                    a = "?"
        elif arg0 is not MISSING:
            chan = id(arg0)
        t = get_ident()
        with lock:
            k = (i, qn)
            x = ext.get(k)
            if x is None:
                x = ext[k] = [0, 0]
            x[0] += 1
            if budget[0] > 0:
                budget[0] -= 1
                ev.append(["e", t, i, now_us(), qn, a, chan, 1 if SEND.search(qn.rsplit(".", 1)[-1]) else 0])

    for evt, fn in ((E.PY_START, on_start), (E.PY_RESUME, on_resume), (E.PY_RETURN, on_return), (E.PY_YIELD, on_yield),
                    (E.PY_UNWIND, on_unwind), (E.RAISE, on_raise), (E.EXCEPTION_HANDLED, on_handled), (E.CALL, on_call)):
        MON.register_callback(TOOL, evt, fn)

    def start_tracing():
        MON.set_events(TOOL, E.PY_START | E.PY_RESUME | E.PY_RETURN | E.PY_YIELD | E.PY_UNWIND | E.RAISE | E.EXCEPTION_HANDLED | E.CALL)

    def stop_tracing():
        try:
            MON.set_events(TOOL, 0)
        except Exception:
            pass

# ---------------------------------------------------------------- Python < 3.12: sys.settrace (Fallback, Ausnahmen heuristisch)
else:
    flagged = {}

    def tr_local(frame, event, arg):
        i = codes.get(frame.f_code)
        if event == "exception":
            if not isinstance(arg[1], IGN):
                flagged[id(frame)] = arg[1]
                with lock:
                    ev.append(["x", get_ident(), i, frame.f_lineno, now_us(), (arg[0].__name__ + ": " + str(arg[1]))[:200]])
        elif event == "return":
            exc = flagged.pop(id(frame), None)
            fr, par, t = pop(i)
            if fr is None:
                return
            ts = now_us()
            with lock:
                if exc is not None and arg is None:
                    stat(i)[1] += 1
                    e = edges.get((par, i))
                    if e is None:
                        e = edges[(par, i)] = [0, 0]
                    e[1] += 1
                    ev.append(["u", t, i, par, ts, (type(exc).__name__ + ": " + str(exc))[:200]])
                else:
                    stat(i)[3] += ts - fr[1]
                    if budget[0] > 0:
                        budget[0] -= 1
                        try:
                            rv = "" if arg is None else rep.repr(arg)
                        except Exception:
                            rv = "?"
                        ev.append(["r", t, i, ts, ts - fr[1], rv])
        return tr_local

    def tr_global(frame, event, arg):
        if event != "call":
            return None
        i = reg(frame.f_code)
        if i is None:
            return None
        push(i, True, frame)
        if CTL.on:
            gate(i, frame.f_code, frame)
        frame.f_trace_lines = False
        return tr_local

    def start_tracing():
        threading.settrace(tr_global)
        sys.settrace(tr_global)

    def stop_tracing():
        sys.settrace(None)
        threading.settrace(None)


def thread_hook(a):
    fatal(a.exc_type, a.exc_value, a.exc_traceback, a.thread.ident if a.thread else 0)
    threading.__excepthook__(a)


threading.excepthook = thread_hook


def at_end():
    stop_tracing()
    try:
        flush()
        out.flush()
    except Exception:
        pass


atexit.register(at_end)
threading.Thread(target=writer, name="codeatlas-writer", daemon=True).start()

code = 0
import builtins
builtins.__atlas_mark__ = mark
sys.argv = TARGET[:] if TARGET[0] != "-m" else TARGET[1:]
try:
    start_tracing()
    if TARGET[0] == "-m":
        runpy.run_module(TARGET[1], run_name="__main__", alter_sys=True)
    else:
        sys.path.insert(0, os.path.dirname(os.path.abspath(TARGET[0])))
        runpy.run_path(TARGET[0], run_name="__main__")
except SystemExit as e:
    code = e.code if isinstance(e.code, int) else (0 if e.code is None else 1)
except BaseException as e:
    fatal(type(e), e, e.__traceback__, get_ident())
    traceback.print_exc()
    code = 1
sys.exit(code)
'''

RUNTIME_C = r'''/* CodeAtlas Trace-Laufzeit für C/C++ – wird von der Bridge dazugelinkt.
   Das Programm wird mit  gcc -finstrument-functions  übersetzt; gcc ruft dann bei jedem
   Funktionsein- und -austritt __cyg_profile_func_enter/exit auf. Alle 100 ms wird ein
   JSON-Fenster (Aufrufe, Kanten, Thread-Stacks, Ereignisse) nach $ATLAS_TRACE_FILE geschrieben.
   Abstürze (SIGSEGV, SIGFPE, SIGABRT, Windows-Ausnahmen) werden mit Aufrufstack gemeldet. */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include <signal.h>

#ifdef _WIN32
#ifdef ATLAS_NET
#include <winsock2.h>
#include <ws2tcpip.h>
#endif
#include <windows.h>
typedef CRITICAL_SECTION at_mtx;
static void mtx_init(at_mtx *m) { InitializeCriticalSection(m); }
static void mtx_lock(at_mtx *m) { EnterCriticalSection(m); }
static void mtx_unlock(at_mtx *m) { LeaveCriticalSection(m); }
static double at_us(void) { static LARGE_INTEGER f; LARGE_INTEGER c; if (!f.QuadPart) QueryPerformanceFrequency(&f); QueryPerformanceCounter(&c); return (double)c.QuadPart * 1e6 / (double)f.QuadPart; }
static void at_sleep_ms(int ms) { Sleep(ms); }
static DWORD WINAPI at_writer(LPVOID p);
static void start_writer(void) { HANDLE h = CreateThread(NULL, 0, at_writer, NULL, 0, NULL); if (h) CloseHandle(h); }
#else
#include <pthread.h>
#include <time.h>
#include <unistd.h>
#ifdef ATLAS_NET
#include <sys/types.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#endif
typedef pthread_mutex_t at_mtx;
static void mtx_init(at_mtx *m) { pthread_mutex_init(m, NULL); }
static void mtx_lock(at_mtx *m) { pthread_mutex_lock(m); }
static void mtx_unlock(at_mtx *m) { pthread_mutex_unlock(m); }
static double at_us(void) { struct timespec t; clock_gettime(CLOCK_MONOTONIC, &t); return (double)t.tv_sec * 1e6 + (double)t.tv_nsec / 1e3; }
static void at_sleep_ms(int ms) { usleep((useconds_t)ms * 1000); }
static void *at_writer(void *p);
static void start_writer(void) { pthread_t th; if (pthread_create(&th, NULL, at_writer, NULL) == 0) pthread_detach(th); }
#endif

#define MAXD 512
#define NTH 128
#define FH 8192
#define EH 16384
#define NDET 400

typedef struct { uintptr_t fn; unsigned long n; double us; } FS;
typedef struct { uintptr_t a, b; unsigned long n; int used; } ES;
typedef struct { int used, depth; volatile int paused; uintptr_t fn[MAXD]; double t0[MAXD]; } TS;
typedef struct { char k; int th; uintptr_t fn, par; double ts, d; char op[12]; char key[80]; int send; long n; } DT;

static FS fs[FH];
static ES es[EH];
static TS ts_[NTH];
static DT dt[NDET];
static int ndt;
static at_mtx mu;
static FILE *out;
static double T0;
static volatile int on;
static __thread int my_th = -1;
/* Debugger-Steuerung (aus $ATLAS_CTL_FILE, vom Writer-Thread gelesen) */
static volatile int g_ctl_on, g_pause, g_slow, g_tokens, g_bphit;
static volatile long g_seq = -1;
static uintptr_t g_bp[64];
static volatile int g_nbp;
static const char *ctl_path;

void atlas_anchor(void) {}

static int slot(void) {
  if (my_th >= 0) return my_th;
  mtx_lock(&mu);
  for (int i = 0; i < NTH; i++) if (!ts_[i].used) { ts_[i].used = 1; ts_[i].depth = 0; my_th = i; break; }
  mtx_unlock(&mu);
  return my_th;
}
static FS *fget(uintptr_t fn) {
  unsigned h = (unsigned)((fn >> 4) ^ (fn >> 15)) & (FH - 1);
  for (int k = 0; k < FH; k++) { FS *e = &fs[(h + k) & (FH - 1)]; if (e->fn == fn) return e; if (!e->fn) { e->fn = fn; return e; } }
  return NULL;
}
static ES *eget(uintptr_t a, uintptr_t b) {
  unsigned h = (unsigned)((a >> 4) * 31u ^ (b >> 4) ^ (b >> 15)) & (EH - 1);
  for (int k = 0; k < EH; k++) {
    ES *e = &es[(h + k) & (EH - 1)];
    if (e->used && e->a == a && e->b == b) return e;
    if (!e->used) { e->used = 1; e->a = a; e->b = b; e->n = 0; return e; }
  }
  return NULL;
}

void __cyg_profile_func_enter(void *f, void *site) {
  (void)site;
  if (!on) return;
  int s = slot(); if (s < 0) return;
  TS *t = &ts_[s];
  uintptr_t fn = (uintptr_t)f, par = (t->depth > 0 && t->depth <= MAXD) ? t->fn[t->depth - 1] : 0;
  double now = at_us();
  if (t->depth < MAXD) { t->fn[t->depth] = fn; t->t0[t->depth] = now; }
  t->depth++;
  if (g_ctl_on) {
    if (g_slow && !g_pause) at_sleep_ms(g_slow);
    int hit = 0;
    for (int b = 0; b < g_nbp; b++) if (g_bp[b] == fn) { hit = 1; break; }
    if (hit && !g_pause) { g_pause = 1; g_bphit = 1; }
    if (g_pause) {
      t->paused = hit ? 2 : 1;
      for (;;) {
        if (!g_pause) break;
        if (g_tokens > 0) { mtx_lock(&mu); if (g_tokens > 0) { g_tokens--; mtx_unlock(&mu); break; } mtx_unlock(&mu); }
        at_sleep_ms(5);
      }
      t->paused = 0;
    }
  }
  mtx_lock(&mu);
  FS *e = fget(fn); if (e) e->n++;
  ES *x = eget(par, fn); if (x) x->n++;
  if (ndt < NDET) { DT *d = &dt[ndt++]; d->k = 'c'; d->th = s + 1; d->fn = fn; d->par = par; d->ts = now - T0; d->d = 0; }
  mtx_unlock(&mu);
}
void __cyg_profile_func_exit(void *f, void *site) {
  (void)site;
  if (!on || my_th < 0) return;
  TS *t = &ts_[my_th];
  if (t->depth <= 0) return;
  t->depth--;
  double now = at_us(), d = t->depth < MAXD ? now - t->t0[t->depth] : 0;
  mtx_lock(&mu);
  FS *e = fget((uintptr_t)f); if (e) e->us += d;
  if (ndt < NDET) { DT *q = &dt[ndt++]; q->k = 'r'; q->th = my_th + 1; q->fn = (uintptr_t)f; q->par = 0; q->ts = now - T0; q->d = d; }
  mtx_unlock(&mu);
}

static void dump(void) {
  if (!out) return;
  mtx_lock(&mu);
  int first = 1;
  fprintf(out, "{\"k\":\"w\",\"t\":%.0f,\"calls\":[", (at_us() - T0) / 1000.0);
  for (int i = 0; i < FH; i++) if (fs[i].fn && (fs[i].n || fs[i].us > 0)) {
    fprintf(out, "%s[\"%llx\",%lu,0,0,%.0f]", first ? "" : ",", (unsigned long long)fs[i].fn, fs[i].n, fs[i].us); first = 0; fs[i].n = 0; fs[i].us = 0;
  }
  fprintf(out, "],\"edges\":["); first = 1;
  for (int i = 0; i < EH; i++) if (es[i].n) {
    fprintf(out, "%s[\"%llx\",\"%llx\",%lu,0]", first ? "" : ",", (unsigned long long)es[i].a, (unsigned long long)es[i].b, es[i].n); first = 0; es[i].n = 0;
  }
  fprintf(out, "],\"stacks\":["); first = 1;
  for (int i = 0; i < NTH; i++) if (ts_[i].used && ts_[i].depth > 0) {
    int n = ts_[i].depth < MAXD ? ts_[i].depth : MAXD;
    fprintf(out, "%s[%d,\"Thread %d\",[", first ? "" : ",", i + 1, i + 1); first = 0;
    for (int j = 0; j < n; j++) fprintf(out, "%s\"%llx\"", j ? "," : "", (unsigned long long)ts_[i].fn[j]);
    if (ts_[i].paused) fprintf(out, "],[\"%llx\",\"\",[],\"%s\"]]", (unsigned long long)ts_[i].fn[n - 1], ts_[i].paused == 2 ? "Haltepunkt" : "Pause");
    else fprintf(out, "],null]");
  }
  fprintf(out, "],\"ev\":[");
  for (int i = 0; i < ndt; i++) {
    DT *d = &dt[i];
    if (d->k == 'e') fprintf(out, "%s[\"e\",%d,\"%llx\",%.0f,\"%s\",\"%ld Bytes\",\"%s\",%d]", i ? "," : "", d->th, (unsigned long long)d->fn, d->ts, d->op, d->n, d->key, d->send);
    else if (d->k == 'c') fprintf(out, "%s[\"c\",%d,\"%llx\",\"%llx\",%.0f,\"\"]", i ? "," : "", d->th, (unsigned long long)d->fn, (unsigned long long)d->par, d->ts);
    else fprintf(out, "%s[\"r\",%d,\"%llx\",%.0f,%.0f,\"\"]", i ? "," : "", d->th, (unsigned long long)d->fn, d->ts, d->d);
  }
  ndt = 0;
  fprintf(out, "]");
  if (ctl_path) fprintf(out, ",\"dbg\":{\"mode\":\"%s\",\"slow\":%d,\"reason\":\"%s\",\"seq\":%ld}", g_pause ? "pause" : "run", g_slow, g_pause ? (g_bphit ? "Haltepunkt" : "Pause") : "", g_seq);
  fprintf(out, "}\n");
  fflush(out);
  mtx_unlock(&mu);
}

/* Steuerdatei: "seq mode slow step n addr1 addr2 …"  (mode 0=run 1=pause) */
static void read_ctl(void) {
  if (!ctl_path) return;
  FILE *f = fopen(ctl_path, "r");
  if (!f) return;
  long seq; int mode, slow, step, n;
  if (fscanf(f, "%ld %d %d %d %d", &seq, &mode, &slow, &step, &n) == 5 && seq != g_seq) {
    uintptr_t bp[64]; int k = 0;
    for (int i = 0; i < n && i < 64; i++) { unsigned long long a; if (fscanf(f, "%llx", &a) == 1) bp[k++] = (uintptr_t)a; }
    mtx_lock(&mu);
    for (int i = 0; i < k; i++) g_bp[i] = bp[i];
    g_nbp = k; g_slow = slow; g_tokens += step; g_pause = (mode == 1 || step > 0); if (!g_pause) g_bphit = 0;
    g_ctl_on = g_pause || g_slow > 0 || g_nbp > 0; g_seq = seq;
    mtx_unlock(&mu);
  }
  fclose(f);
}

#ifdef ATLAS_NET
/* send/recv über Linker --wrap: Kanalschlüssel aus lokaler+entfernter Adresse (gleich in Server und Client) */
static void addr_str(struct sockaddr *sa, char *o, size_t n) {
  char h[64] = "?"; int port = 0;
  if (sa->sa_family == AF_INET) { struct sockaddr_in *a = (struct sockaddr_in *)sa; inet_ntop(AF_INET, &a->sin_addr, h, sizeof h); port = ntohs(a->sin_port); }
  else if (sa->sa_family == AF_INET6) { struct sockaddr_in6 *a = (struct sockaddr_in6 *)sa; inet_ntop(AF_INET6, &a->sin6_addr, h, sizeof h); port = ntohs(a->sin6_port); }
  if (!strcmp(h, "::1") || !strcmp(h, "0.0.0.0") || !strcmp(h, "::")) strcpy(h, "127.0.0.1");
  if (!strncmp(h, "::ffff:", 7)) memmove(h, h + 7, strlen(h + 7) + 1);
  snprintf(o, n, "%s:%d", h, port);
}
#ifdef _WIN32
typedef SOCKET at_sock; typedef int at_len;
#else
typedef int at_sock; typedef socklen_t at_len;
#endif
static void net_ev(at_sock s, const char *op, int send, long n) {
  if (!on || n < 0) return;
  struct sockaddr_storage l, r; at_len ll = sizeof l, rl = sizeof r; char a[36], b[36], key[80];
  if (getsockname(s, (struct sockaddr *)&l, &ll) != 0) return;
  if (getpeername(s, (struct sockaddr *)&r, &rl) != 0) return;
  addr_str((struct sockaddr *)&l, a, sizeof a); addr_str((struct sockaddr *)&r, b, sizeof b);
  if (strcmp(a, b) < 0) snprintf(key, sizeof key, "tcp:%s|%s", a, b); else snprintf(key, sizeof key, "tcp:%s|%s", b, a);
  int sl = slot(); if (sl < 0) return;
  TS *t = &ts_[sl];
  uintptr_t fn = (t->depth > 0 && t->depth <= MAXD) ? t->fn[t->depth - 1] : 0;
  mtx_lock(&mu);
  if (ndt < NDET) { DT *d = &dt[ndt++]; d->k = 'e'; d->th = sl + 1; d->fn = fn; d->par = 0; d->ts = at_us() - T0; d->d = 0; d->send = send; d->n = n; strncpy(d->op, op, sizeof d->op - 1); d->op[sizeof d->op - 1] = 0; strncpy(d->key, key, sizeof d->key - 1); d->key[sizeof d->key - 1] = 0; }
  mtx_unlock(&mu);
}
#ifdef _WIN32
int WSAAPI __real_send(SOCKET s, const char *b, int n, int f);
int WSAAPI __real_recv(SOCKET s, char *b, int n, int f);
int WSAAPI __wrap_send(SOCKET s, const char *b, int n, int f) { int r = __real_send(s, b, n, f); net_ev(s, "send", 1, r); return r; }
int WSAAPI __wrap_recv(SOCKET s, char *b, int n, int f) { int r = __real_recv(s, b, n, f); net_ev(s, "recv", 0, r); return r; }
#else
ssize_t __real_send(int s, const void *b, size_t n, int f);
ssize_t __real_recv(int s, void *b, size_t n, int f);
ssize_t __wrap_send(int s, const void *b, size_t n, int f) { ssize_t r = __real_send(s, b, n, f); net_ev(s, "send", 1, (long)r); return r; }
ssize_t __wrap_recv(int s, void *b, size_t n, int f) { ssize_t r = __real_recv(s, b, n, f); net_ev(s, "recv", 0, (long)r); return r; }
#endif
#endif

/* Testgrenze (aus dem main() der C-Tests): Fenster schreiben, dann Markierung */
void atlas_trace_mark(const char *json) {
  if (!out) return;
  dump();
  mtx_lock(&mu); fprintf(out, "{\"k\":\"mark\",%s}\n", json); fflush(out); mtx_unlock(&mu);
}
static void crash(unsigned long sig) {
  if (!out) return;
  int s = my_th;
  fprintf(out, "{\"k\":\"crash\",\"sig\":%lu,\"th\":%d,\"stack\":[", sig, s + 1);
  if (s >= 0) { TS *t = &ts_[s]; int n = t->depth < MAXD ? t->depth : MAXD; for (int i = n - 1; i >= 0; i--) fprintf(out, "%s\"%llx\"", i == n - 1 ? "" : ",", (unsigned long long)t->fn[i]); }
  fprintf(out, "]}\n");
  fflush(out);
}
static void on_sig(int sig) { on = 0; dump(); crash((unsigned long)sig); signal(sig, SIG_DFL); raise(sig); }
#ifdef _WIN32
static LONG WINAPI on_seh(EXCEPTION_POINTERS *e) { on = 0; dump(); crash((unsigned long)e->ExceptionRecord->ExceptionCode); return EXCEPTION_CONTINUE_SEARCH; }
static DWORD WINAPI at_writer(LPVOID p) { (void)p; for (int i = 0;; i++) { at_sleep_ms(50); read_ctl(); if (i & 1) dump(); } return 0; }
#else
static void *at_writer(void *p) { (void)p; for (int i = 0;; i++) { at_sleep_ms(50); read_ctl(); if (i & 1) dump(); } return NULL; }
#endif
static void at_end(void) { on = 0; dump(); if (out) { fprintf(out, "{\"k\":\"exit\"}\n"); fflush(out); } }

__attribute__((constructor)) static void at_init(void) {
  const char *p = getenv("ATLAS_TRACE_FILE");
  if (!p) return;
  out = fopen(p, "a");
  if (!out) return;
  ctl_path = getenv("ATLAS_CTL_FILE");
  if (ctl_path && !*ctl_path) ctl_path = NULL;
  setvbuf(stdout, NULL, _IONBF, 0);
  setvbuf(stderr, NULL, _IONBF, 0);
  mtx_init(&mu);
  T0 = at_us();
  fprintf(out, "{\"k\":\"base\",\"anchor\":\"%llx\"}\n", (unsigned long long)(uintptr_t)&atlas_anchor);
  fflush(out);
  signal(SIGSEGV, on_sig); signal(SIGFPE, on_sig); signal(SIGILL, on_sig); signal(SIGABRT, on_sig);
#ifdef _WIN32
  SetUnhandledExceptionFilter(on_seh);
#endif
  atexit(at_end);
  on = 1;
  start_writer();
}
'''


TESTRUN_PY = r'''"""CodeAtlas Test-Runner – von der Bridge unter dem Tracer gestartet:
python atlas_testrun.py ROOT [-k FILTER] [--after ID] [--no-pytest] DATEI…
Ergebnisse als JSON-Zeilen nach $ATLAS_TEST_OUT (info / collect / start / end / done); Testgrenzen werden im Trace markiert,
damit der Atlas weiß, welche Funktionen jeder einzelne Test ausgeführt hat."""
import sys, os, io, time, json, traceback, linecache, importlib.util, unittest, inspect, reprlib, builtins, re

ROOT = os.path.normcase(os.path.realpath(sys.argv[1]))
OPT = {"k": "", "after": "", "pytest": True, "files": [], "only": set()}
_a, _i = sys.argv[2:], 0
while _i < len(_a):
    if _a[_i] == "-k" and _i + 1 < len(_a):
        OPT["k"] = _a[_i + 1]; _i += 2
    elif _a[_i] == "--after" and _i + 1 < len(_a):
        OPT["after"] = _a[_i + 1]; _i += 2
    elif _a[_i] == "--only" and _i + 1 < len(_a):
        OPT["only"].add(_a[_i + 1]); _i += 2
    elif _a[_i] == "--no-pytest":
        OPT["pytest"] = False; _i += 1
    else:
        OPT["files"].append(_a[_i]); _i += 1
LIB = re.compile(r"[\\/](site-packages|dist-packages|\.?venv[^\\/]*|\.codeatlas|_pytest|pluggy)[\\/]", re.I)
OUT = open(os.environ.get("ATLAS_TEST_OUT") or os.devnull, "a", encoding="utf-8")
MARK = getattr(builtins, "__atlas_mark__", None)
rep = reprlib.Repr()
rep.maxstring, rep.maxother, rep.maxlevel, rep.maxlist, rep.maxdict, rep.maxtuple = 80, 60, 2, 6, 5, 6
REAL_OUT, REAL_ERR = sys.stdout, sys.stderr


def emit(o):
    OUT.write(json.dumps(o, ensure_ascii=False, default=str) + "\n")
    OUT.flush()


def mark(t, tid):
    if MARK:
        try:
            MARK({"t": t, "id": tid})
        except Exception:
            pass


def proj(f):
    f = os.path.normcase(os.path.realpath(f))
    return (f == ROOT or f.startswith(ROOT + os.sep)) and not LIB.search(f)


def describe(et, ev, tb):
    frs = [(fr, ln) for fr, ln in traceback.walk_tb(tb) if proj(fr.f_code.co_filename)][-25:]
    frames, loc = [], {}
    for fr, ln in frs:
        co = fr.f_code
        frames.append([os.path.realpath(co.co_filename), ln, getattr(co, "co_qualname", co.co_name), linecache.getline(co.co_filename, ln).strip()[:200]])
    for j in range(max(0, len(frs) - 3), len(frs)):
        try:
            loc[str(j)] = {k: rep.repr(v) for k, v in list(frs[j][0].f_locals.items())[:16] if not k.startswith(("__", "@"))}
        except Exception:
            pass
    try:
        msg = str(ev)
    except Exception:
        msg = "?"
    if not msg and isinstance(ev, AssertionError) and frames:
        msg = frames[-1][3]
    return {"etype": getattr(et, "__name__", "Fehler"), "msg": msg[:2500], "frames": frames, "locals": loc}


class Tee(io.TextIOBase):
    def __init__(self, real):
        self.real, self.buf = real, []

    def write(self, t):
        self.buf.append(t)
        try:
            self.real.write(t)
        except Exception:
            pass
        return len(t)

    def flush(self):
        try:
            self.real.flush()
        except Exception:
            pass

    def text(self):
        return "".join(self.buf)[-3000:]


def _line(o):
    try:
        return inspect.getsourcelines(o)[1]
    except (OSError, TypeError):
        return 1


# ---------------------------------------------------------------- ohne pytest: unittest + einfache test_*-Funktionen
def collect_builtin(files):
    items, loader = [], unittest.TestLoader()
    for f in files:
        path = os.path.realpath(f)
        for p in (ROOT, os.path.dirname(path)):
            if p not in sys.path:
                sys.path.insert(0, p)
        name = os.path.splitext(os.path.basename(path))[0]
        if name in sys.modules:
            name = "atlas_t%d_%s" % (len(items), name)
        try:
            spec = importlib.util.spec_from_file_location(name, path)
            mod = importlib.util.module_from_spec(spec)
            sys.modules[name] = mod
            spec.loader.exec_module(mod)
        except BaseException as e:
            items.append({"id": f + "::<import>", "name": "Import " + os.path.basename(f), "file": path, "line": 1, "err": describe(type(e), e, e.__traceback__)})
            continue
        for attr, obj in list(vars(mod).items()):
            if getattr(obj, "__module__", None) != mod.__name__:
                continue
            if inspect.isclass(obj) and issubclass(obj, unittest.TestCase):
                for case in loader.loadTestsFromTestCase(obj):
                    m = getattr(obj, case._testMethodName)
                    items.append({"id": f"{f}::{attr}::{case._testMethodName}", "name": f"{attr}.{case._testMethodName}", "file": path, "line": _line(m), "case": case})
            elif inspect.isclass(obj) and attr.startswith("Test"):
                for mn, m in inspect.getmembers(obj, inspect.isfunction):
                    if mn.startswith("test"):
                        items.append({"id": f"{f}::{attr}::{mn}", "name": f"{attr}.{mn}", "file": path, "line": _line(m), "cls": obj, "meth": mn})
            elif inspect.isfunction(obj) and attr.startswith("test"):
                try:
                    req = [p.name for p in inspect.signature(obj).parameters.values() if p.default is p.empty and p.kind in (p.POSITIONAL_ONLY, p.POSITIONAL_OR_KEYWORD)]
                except (TypeError, ValueError):
                    req = []
                items.append({"id": f"{f}::{attr}", "name": attr, "file": path, "line": _line(obj), "fn": obj, "fixtures": req})
    items.sort(key=lambda i: (i["file"], i["line"]))
    return items


class Res(unittest.TestResult):
    def __init__(self):
        super().__init__()
        self.st, self.err, self.why = "passed", None, ""

    def addFailure(self, t, e):
        self.st, self.err = "failed", e

    def addError(self, t, e):
        self.st, self.err = ("failed" if issubclass(e[0], AssertionError) else "error"), e

    def addSkip(self, t, r):
        self.st, self.why = "skipped", r

    def addUnexpectedSuccess(self, t):
        self.st, self.why = "failed", "unerwartet bestanden (expectedFailure)"

    def addSubTest(self, t, sub, e):
        if e is not None:
            self.st, self.err = ("failed" if issubclass(e[0], AssertionError) else "error"), e


def run_one(it):
    emit({"t": "start", "id": it["id"]})
    mark("start", it["id"])
    o, e = Tee(REAL_OUT), Tee(REAL_ERR)
    sys.stdout, sys.stderr = o, e
    t0, st, err, why, info = time.perf_counter(), "passed", None, "", None
    try:
        if "err" in it:
            st, info = "error", it["err"]
        elif "case" in it:
            r = Res()
            it["case"].run(r)
            st, err, why = r.st, r.err, r.why
        elif "cls" in it:
            inst = it["cls"]()
            if hasattr(inst, "setup_method"):
                inst.setup_method(getattr(inst, it["meth"]))
            try:
                getattr(inst, it["meth"])()
            finally:
                if hasattr(inst, "teardown_method"):
                    inst.teardown_method(getattr(inst, it["meth"]))
        elif it.get("fixtures"):
            st, why = "skipped", "braucht pytest-Fixtures (" + ", ".join(it["fixtures"]) + ") – pytest installieren"
        else:
            it["fn"]()
    except unittest.SkipTest as x:
        st, why = "skipped", str(x)
    except KeyboardInterrupt:
        raise
    except BaseException as x:
        if type(x).__name__ == "Skipped":
            st, why = "skipped", str(x)
        else:
            st, err = ("failed" if isinstance(x, AssertionError) else "error"), sys.exc_info()
    finally:
        sys.stdout, sys.stderr = REAL_OUT, REAL_ERR
    res = {"t": "end", "id": it["id"], "status": st, "ms": round((time.perf_counter() - t0) * 1000, 2)}
    if info:
        res.update(info)
    if err:
        res.update(describe(*err))
    if why:
        res["msg"] = why
    if st in ("failed", "error"):
        res["out"] = (o.text() + e.text())[-3000:]
    mark("end", it["id"])
    emit(res)


def select(items):
    k = OPT["k"].lower()
    if k:
        items = [i for i in items if k in i["id"].lower()]
    if OPT["only"]:
        items = [i for i in items if i["id"] in OPT["only"]]
    if OPT["after"]:
        ids = [i["id"] for i in items]
        if OPT["after"] in ids:
            items = items[ids.index(OPT["after"]) + 1:]
    return items


def run_builtin():
    items = select(collect_builtin(OPT["files"]))
    if not OPT["after"]:
        emit({"t": "collect", "tests": [{"id": i["id"], "name": i["name"], "file": i["file"], "line": i["line"]} for i in items]})
    for it in items:
        run_one(it)


# ---------------------------------------------------------------- mit pytest
def run_pytest():
    import pytest

    class P:
        def __init__(self):
            self.ex, self.st = {}, {}

        def pytest_collection_modifyitems(self, session, config, items):
            if OPT["only"]:
                items[:] = [i for i in items if i.nodeid in OPT["only"]]
            ids = [i.nodeid for i in items]
            if OPT["after"] and OPT["after"] in ids:
                del items[:ids.index(OPT["after"]) + 1]
            elif not OPT["after"]:
                emit({"t": "collect", "tests": [{"id": i.nodeid, "name": i.name, "file": os.path.realpath(str(getattr(i, "path", None) or i.fspath)),
                                                  "line": (i.location[1] or 0) + 1} for i in items]})

        def pytest_collectreport(self, report):
            if report.failed:
                nid = report.nodeid or "<sammeln>"
                emit({"t": "start", "id": nid})
                emit({"t": "end", "id": nid, "status": "error", "ms": 0, "etype": "Sammelfehler", "msg": str(report.longreprtext)[-2500:]})

        def pytest_runtest_logstart(self, nodeid, location):
            emit({"t": "start", "id": nodeid})
            mark("start", nodeid)

        def pytest_runtest_makereport(self, item, call):
            if call.excinfo is not None and not call.excinfo.errisinstance(pytest.skip.Exception):
                self.ex.setdefault(item.nodeid, (call.when, call.excinfo))

        def pytest_runtest_logreport(self, report):
            d = self.st.setdefault(report.nodeid, {"status": "passed", "ms": 0.0, "out": ""})
            d["ms"] += (report.duration or 0) * 1000
            if report.failed:
                if d["status"] != "failed":
                    d["status"] = "failed" if report.when == "call" else "error"
            elif report.skipped and d["status"] == "passed":
                d["status"] = "skipped"
                lr = report.longrepr
                d["msg"] = str(lr[2] if isinstance(lr, tuple) and len(lr) > 2 else lr)
            d["out"] += (getattr(report, "capstdout", "") or "") + (getattr(report, "capstderr", "") or "")
            if report.when != "teardown":
                return
            res = {"t": "end", "id": report.nodeid, "status": d["status"], "ms": round(d["ms"], 2)}
            if d.get("msg"):
                res["msg"] = d["msg"]
            x = self.ex.get(report.nodeid)
            if x and d["status"] in ("failed", "error"):
                res.update(describe(x[1].type, x[1].value, x[1].tb))
                res["phase"] = x[0]
            if d["status"] in ("failed", "error"):
                res["out"] = d["out"][-3000:]
            mark("end", report.nodeid)
            emit(res)

    args = list(OPT["files"]) + ["-q", "-p", "no:cacheprovider", "--rootdir", ROOT]
    if OPT["k"]:
        args += ["-k", OPT["k"]]
    return pytest.main(args, plugins=[P()])


use = OPT["pytest"]
if use:
    try:
        import pytest  # noqa: F401
    except ImportError:
        use = False
emit({"t": "info", "framework": "pytest" if use else "eingebaut", "python": sys.version.split()[0]})
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)
if use:
    run_pytest()
else:
    run_builtin()
emit({"t": "done"})
sys.exit(0)
'''

ATLAS_TEST_H = r'''/* atlas_test.h – kleine Testbibliothek für C/C++, vom CodeAtlas bereitgestellt (liegt in .codeatlas/).
   In einer Datei test_*.c:

       #include "atlas_test.h"
       #include "rechner.h"
       TEST(addiert) { CHECK(add(1, 2) == 3); CHECK_EQ_INT(add(2, 2), 4); }

   Kein main() schreiben – das liefert der Atlas und linkt alle Programmdateien ohne main() dazu.
   Hilfsfunktionen in Testdateien als static deklarieren. Prüfungen:
     CHECK(bed)  REQUIRE(bed) (bricht den Test ab)  CHECK_EQ_INT(a, b)  CHECK_EQ_STR(a, b)  CHECK_NEAR(a, b, eps) */
#ifndef ATLAS_TEST_H
#define ATLAS_TEST_H
#include <stdio.h>
#include <string.h>
#ifdef __cplusplus
extern "C" {
#endif
typedef void (*atlas_test_fn)(void);
void atlas_test_add(const char *name, const char *file, int line, atlas_test_fn fn);
int atlas_check(int ok, const char *expr, const char *file, int line, const char *detail);
#ifdef __cplusplus
}
#endif
#define ATLAS_CAT_(a, b) a##b
#define TEST(name) \
  static void ATLAS_CAT_(atlas_test_, name)(void); \
  __attribute__((constructor)) static void ATLAS_CAT_(atlas_reg_, name)(void) { atlas_test_add(#name, __FILE__, __LINE__, ATLAS_CAT_(atlas_test_, name)); } \
  static void ATLAS_CAT_(atlas_test_, name)(void)
#define CHECK(c) atlas_check(!!(c), #c, __FILE__, __LINE__, NULL)
#define REQUIRE(c) do { if (!CHECK(c)) return; } while (0)
#define CHECK_EQ_INT(a, b) do { long long a_ = (long long)(a), b_ = (long long)(b); char d_[96]; \
  snprintf(d_, sizeof d_, "%lld != %lld", a_, b_); atlas_check(a_ == b_, #a " == " #b, __FILE__, __LINE__, d_); } while (0)
#define CHECK_NEAR(a, b, eps) do { double a_ = (double)(a), b_ = (double)(b), e_ = (double)(eps); char d_[128]; \
  snprintf(d_, sizeof d_, "%g != %g (Toleranz %g)", a_, b_, e_); atlas_check((a_ > b_ ? a_ - b_ : b_ - a_) <= e_, #a " ~= " #b, __FILE__, __LINE__, d_); } while (0)
#define CHECK_EQ_STR(a, b) do { const char *a_ = (a), *b_ = (b); char d_[200]; \
  snprintf(d_, sizeof d_, "\"%.80s\" != \"%.80s\"", a_ ? a_ : "(NULL)", b_ ? b_ : "(NULL)"); \
  atlas_check((a_ && b_) ? strcmp(a_, b_) == 0 : a_ == b_, #a " == " #b, __FILE__, __LINE__, d_); } while (0)
#endif
'''

ATLAS_TEST_MAIN_C = r'''/* main() für die C-Tests des CodeAtlas – von der Bridge erzeugt und dazugelinkt. */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include "atlas_test.h"
#ifdef ATLAS_TRACE_MARK
void atlas_trace_mark(const char *json);
#else
static void atlas_trace_mark(const char *json) { (void)json; }
#endif
#define AT_MAXT 4096
#define AT_MAXF 8
typedef struct { const char *name, *file; int line; atlas_test_fn fn; } AT;
typedef struct { char expr[240], detail[240], file[400]; int line; } AF;
static AT at_[AT_MAXT];
static int nt_ = 0, nf_ = 0;
static AF af_[AT_MAXF];
void atlas_test_add(const char *name, const char *file, int line, atlas_test_fn fn) {
  if (nt_ < AT_MAXT) { at_[nt_].name = name; at_[nt_].file = file; at_[nt_].line = line; at_[nt_].fn = fn; nt_++; }
}
int atlas_check(int ok, const char *expr, const char *file, int line, const char *detail) {
  if (ok) return 1;
  if (nf_ < AT_MAXF) {
    AF *f = &af_[nf_];
    snprintf(f->expr, sizeof f->expr, "%s", expr ? expr : "");
    snprintf(f->detail, sizeof f->detail, "%s", detail ? detail : "");
    snprintf(f->file, sizeof f->file, "%s", file ? file : "");
    f->line = line;
  }
  nf_++;
  fprintf(stderr, "%s:%d: Pruefung fehlgeschlagen: %s%s%s\n", file, line, expr, detail ? "  ->  " : "", detail ? detail : "");
  return 0;
}
static void jsn(char *d, size_t n, const char *s) {
  size_t j = 0;
  if (n < 3) return;
  d[j++] = '"';
  for (; s && *s && j + 7 < n; s++) {
    unsigned char c = (unsigned char)*s;
    if (c == '"' || c == '\\') { d[j++] = '\\'; d[j++] = (char)c; }
    else if (c < 0x20) j += (size_t)snprintf(d + j, n - j, "\\u%04x", c);
    else d[j++] = (char)c;
  }
  d[j++] = '"'; d[j] = 0;
}
#define AT_MAXO 256
static const char *only_[AT_MAXO];
static int no_ = 0;
static int want_(const char *id, const char *k) {
  int j;
  if (k && !strstr(id, k)) return 0;
  if (!no_) return 1;
  for (j = 0; j < no_; j++) if (!strcmp(only_[j], id)) return 1;
  return 0;
}
static int cmp_(const void *a, const void *b) {
  const AT *x = (const AT *)a, *y = (const AT *)b;
  int c = strcmp(x->file, y->file);
  return c ? c : x->line - y->line;
}
static double ms_(void) { return (double)clock() * 1000.0 / CLOCKS_PER_SEC; }
int main(int argc, char **argv) {
  const char *after = NULL, *k = NULL, *p = getenv("ATLAS_TEST_OUT");
  static char id[900], q[2000], q2[2000], q3[1000];
  int skip, failed = 0, i, j;
  FILE *o;
  for (i = 1; i < argc; i++) {
    if (!strcmp(argv[i], "--after") && i + 1 < argc) after = argv[++i];
    else if (!strcmp(argv[i], "-k") && i + 1 < argc) k = argv[++i];
    else if (!strcmp(argv[i], "--only") && i + 1 < argc) { if (no_ < AT_MAXO) only_[no_++] = argv[++i]; else i++; }
  }
  o = (p && *p) ? fopen(p, "a") : NULL;
  setvbuf(stdout, NULL, _IONBF, 0);
  qsort(at_, (size_t)nt_, sizeof at_[0], cmp_);
  if (o && !after) {
    fputs("{\"t\":\"info\",\"framework\":\"atlas_test.h\"}\n{\"t\":\"collect\",\"tests\":[", o);
    for (i = 0, j = 0; i < nt_; i++) {
      snprintf(id, sizeof id, "%s::%s", at_[i].file, at_[i].name);
      if (!want_(id, k)) continue;
      jsn(q, sizeof q, id); jsn(q2, sizeof q2, at_[i].name); jsn(q3, sizeof q3, at_[i].file);
      fprintf(o, "%s{\"id\":%s,\"name\":%s,\"file\":%s,\"line\":%d}", j++ ? "," : "", q, q2, q3, at_[i].line);
    }
    fputs("]}\n", o); fflush(o);
  }
  skip = after != NULL;
  for (i = 0; i < nt_; i++) {
    double t0, dt;
    snprintf(id, sizeof id, "%s::%s", at_[i].file, at_[i].name);
    if (!want_(id, k)) continue;
    if (skip) { if (!strcmp(id, after)) skip = 0; continue; }
    jsn(q, sizeof q, id);
    if (o) { fprintf(o, "{\"t\":\"start\",\"id\":%s}\n", q); fflush(o); }
    snprintf(q2, sizeof q2, "\"t\":\"start\",\"id\":%s", q); atlas_trace_mark(q2);
    nf_ = 0; t0 = ms_();
    at_[i].fn();
    dt = ms_() - t0;
    snprintf(q2, sizeof q2, "\"t\":\"end\",\"id\":%s", q); atlas_trace_mark(q2);
    if (nf_) failed++;
    if (o) {
      fprintf(o, "{\"t\":\"end\",\"id\":%s,\"status\":\"%s\",\"ms\":%.2f", q, nf_ ? "failed" : "passed", dt);
      if (nf_) {
        fprintf(o, ",\"nfail\":%d,\"checks\":[", nf_);
        for (j = 0; j < nf_ && j < AT_MAXF; j++) {
          jsn(q2, sizeof q2, af_[j].expr); jsn(q3, sizeof q3, af_[j].detail);
          fprintf(o, "%s{\"expr\":%s,\"detail\":%s,", j ? "," : "", q2, q3);
          jsn(q2, sizeof q2, af_[j].file); fprintf(o, "\"file\":%s,\"line\":%d}", q2, af_[j].line);
        }
        fputs("]", o);
      }
      fputs("}\n", o); fflush(o);
    }
  }
  if (o) { fputs("{\"t\":\"done\"}\n", o); fclose(o); }
  return failed ? 1 : 0;
}
'''


# ------------------------------------------------------------------ Tests im Atlas (Bridge 1.9)
TEST_TIMEOUT = int(os.environ.get("CODEATLAS_TEST_TIMEOUT") or 30)          # Sekunden je Test, danach gilt er als hängend (Endlosschleife, wartet auf Eingabe …)
TEST_PY_RE = re.compile(r"^(test_.+|.+_test)\.py$", re.I)
TEST_C_RE = re.compile(r"^(test_.+|.+_test)\.(c|cc|cpp|cxx)$", re.I)
MAIN_C_RE = re.compile(r"^\s*(?:int|void)\s+main\s*\(|\bWinMain\s*\(", re.M)


def is_test_path(p):
    """Testdateien und alles in Testordnern – dort liegt nie der „Fehlerort im Programm“."""
    p = "/" + str(p).replace("\\", "/").lower()
    base = p.rsplit("/", 1)[-1]
    return bool(TEST_PY_RE.match(base) or TEST_C_RE.match(base) or base == "conftest.py") or any(x in p for x in ("/tests/", "/test/", "/testing/"))


def _proj_files(prj, exts):
    return sorted(p for p in files_ext(prj, *exts))[:3000]


def _pytest_ok():
    try:
        import importlib.util
        return importlib.util.find_spec("pytest") is not None
    except (ImportError, ValueError):
        return False


def detect_tests(prj, extra=()):
    py = [p for p in _proj_files(prj, {".py"}) if TEST_PY_RE.match(p.name)]
    cs = [p for p in _proj_files(prj, {".c", ".cc", ".cpp", ".cxx"}) if TEST_C_RE.match(p.name)]
    gcc = find_exe(["gcc", "cc", "clang"], [PF + r"\CodeBlocks\MinGW\bin\gcc.exe", PF86 + r"\CodeBlocks\MinGW\bin\gcc.exe", r"C:\MinGW\bin\gcc.exe", r"C:\msys64\ucrt64\bin\gcc.exe"] if IS_WIN else ())
    return {"py": {"files": [p.relative_to(prj.root).as_posix() for p in py], "framework": "pytest" if _pytest_ok() else "eingebaut"} if py else None,
            "c": {"files": [p.relative_to(prj.root).as_posix() for p in cs], "gcc": bool(gcc), "_gcc": gcc, "_paths": cs} if cs else None,
            "cmd": [s.partition("=")[0].strip() or s for s in extra]}


def test_presets(prj, kinds, flt, extra=(), only=None):
    """Start-Konfigurationen für einen Testlauf: Python über atlas_testrun.py (unter dem Tracer), C als eigenes Testprogramm aus allen
    Testdateien + allen Programmdateien ohne main() + dem main() des Atlas – übersetzt mit Trace."""
    d, tdir, out = detect_tests(prj, extra), prj.root / ".codeatlas", []
    want = lambda k: (not kinds or k in kinds) and (only is None or k in only)
    sel = lambda k: [a for raw in (only or {}).get(k, [])[:200] for a in ("--only", raw)]
    part = bool(flt or only)
    if d["py"] and want("py"):
        argl = [str(prj.root)] + (["-k", flt] if flt else []) + sel("py") + d["py"]["files"]
        out.append({"id": "test-py", "label": "Tests · Python (" + d["py"]["framework"] + ")", "kind": "py", "script": str(tdir / "atlas_testrun.py"),
                    "cwd": str(prj.root), "test": "py", "argl": argl, "partial": part})
    if d["c"] and d["c"]["gcc"] and want("c"):
        gcc, tests = d["c"]["_gcc"], [str(p) for p in d["c"]["_paths"]]
        info = None
        for cbp in sorted(files_ext(prj, ".cbp"))[:4]:
            info = cbp_full(cbp)
            if info:
                break
        if info:
            cwd = Path(info["cwd"])
            units = [str((cwd / u).resolve()) for u in info["units"]]
        else:
            info = {"opts": ["-Wall"], "incs": [], "libs": [], "ldirs": [], "cwd": str(prj.root)}
            units = [str(p) for p in _proj_files(prj, {".c", ".cc", ".cpp", ".cxx"})]
        keep = []
        for u in units:
            if TEST_C_RE.match(os.path.basename(u)) or is_test_path(u):
                continue
            try:
                if MAIN_C_RE.search(Path(u).read_text("utf-8", "replace")):
                    continue
            except OSError:
                continue
            keep.append(u)
        incs = list(info["incs"]) + ["-I" + str(tdir)] + sorted({"-I" + os.path.dirname(t) for t in tests}) + sorted({"-I" + os.path.dirname(u) for u in keep})
        out.append({"id": "test-c", "label": "Tests · C (atlas_test.h)", "kind": "c", "gcc": gcc, "units": keep + tests + [str(tdir / "atlas_test_main.c")],
                    "opts": list(info["opts"]) + ["-DATLAS_TRACE_MARK"], "incs": incs, "libs": info["libs"], "ldirs": info["ldirs"], "cwd": info["cwd"],
                    "test": "c", "argl": (["-k", flt] if flt else []) + sel("c"), "partial": part})
    for spec in extra:
        name, _, cmd = spec.partition("=")
        if not cmd:
            name, cmd = spec, spec
        if want("cmd") or want(name.strip()):
            out.append({"id": "test-cmd-" + name.strip(), "label": "Tests · " + name.strip(), "kind": "cmd", "shell": cmd.strip(), "cwd": str(prj.root), "test": "cmd"})
    return out


def write_test_support(tdir):
    tdir.mkdir(exist_ok=True)
    for name, txt in (("atlas_test.h", ATLAS_TEST_H), ("atlas_test_main.c", ATLAS_TEST_MAIN_C), ("atlas_testrun.py", TESTRUN_PY)):
        f = tdir / name
        try:
            if not f.is_file() or f.read_text("utf-8") != txt:
                f.write_text(txt, "utf-8")
        except OSError:
            pass


def py_functions(prj):
    """Alle Funktionen/Methoden der Programmdateien (ohne Tests) – für „von den Tests nicht erreicht“."""
    import ast
    out = []
    for p in _proj_files(prj, {".py"}):
        rel = p.relative_to(prj.root).as_posix()
        if is_test_path(rel):
            continue
        try:
            tree = ast.parse(p.read_text("utf-8", "replace"))
        except (SyntaxError, ValueError, OSError):
            continue

        def walk(node, prefix):
            for ch in ast.iter_child_nodes(node):
                if isinstance(ch, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    first = min([ch.lineno] + [d.lineno for d in ch.decorator_list])
                    out.append({"name": prefix + ch.name, "path": rel, "line": ch.lineno, "first": first})
                    walk(ch, prefix + ch.name + ".")
                elif isinstance(ch, ast.ClassDef):
                    walk(ch, prefix + ch.name + ".")
        walk(tree, "")
        if len(out) > 5000:
            break
    return out


AGENT_PROMPT = """Du arbeitest im CodeAtlas: Der Nutzer sieht live im Diagramm, was du liest, änderst und ausführst.
Der CodeAtlas kennt den Code-Graphen des Projekts. Nutze ihn zuerst: atlas_orient (Überblick), atlas_find (Name, Datei:Zeile oder Stacktrace finden), atlas_impact (wer hängt an einer Funktion, welche Tests – vor Änderungen an viel genutztem Code), atlas_trace (Aufrufweg A nach B), atlas_read (nur den Quelltext einer Funktion). Das spart viele Read/Grep-Aufrufe. atlas_rules zeigt Architekturregeln, die du einhalten musst.
Für Spezifikation, Plan und Aufgaben gibt es plan_get, plan_set_spec, plan_set_plan, plan_set_tasks, plan_task_update – nur benutzen, wenn der Auftrag darum bittet.
Für Tests gibt es die Werkzeuge des MCP-Servers „codeatlas“: tests_info (welche Tests es gibt, wie man sie schreibt), tests_run (ausführen), tests_last (letztes Ergebnis).
Führe Tests mit tests_run aus – nicht über Bash (pytest, python, gcc …). tests_run lässt sie mit Trace im Atlas laufen; der Nutzer sieht den Lauf im Diagramm, und du bekommst je Fehler den Fehlerort im Programm (Datei:Zeile, Funktion), die Prüfung im Test, den Aufrufpfad, Variablenwerte, die vom Test ausgeführten Funktionen und welche Funktionen kein Test erreicht. Das ist verlässlicher als die Konsolenausgabe.
Python: Dateien test_*.py mit Funktionen test_*() und assert (oder unittest.TestCase); pytest wird genutzt, wenn installiert.
C: Dateien test_*.c, die atlas_test.h einbinden (#include mit Anführungszeichen; stellt der Atlas bereit, kein main() schreiben): TEST(name) { CHECK(bedingung); CHECK_EQ_INT(a, b); CHECK_EQ_STR(a, b); CHECK_NEAR(a, b, eps); REQUIRE(bedingung); } – Hilfsfunktionen in Testdateien static deklarieren.
Wenn ein Test fehlschlägt: zuerst den Fehlerort im Programm prüfen und dort beheben; den Test nur ändern, wenn er selbst falsch ist."""


def _disp(p):
    """Pfad für Claude: relativ zum Projektordner (ohne den Projektnamen davor, den die Oberfläche benutzt)."""
    return str(p).split("/", 1)[1] if p and "/" in str(p) else str(p or "?")


def test_report(sess, detail=None, full=True):
    """Ergebnis eines Testlaufs als Text für Claude – Fehlerort, Prüfung, Aufrufpfad, Variablen, ausgeführte Funktionen, Abdeckung."""
    if not sess:
        return "Es wurde noch kein Testlauf im CodeAtlas ausgeführt."
    runs = sess.get("runs_data") or []
    if not runs:
        return "Keine Tests gefunden. " + TEST_HOWTO
    tot = {"passed": 0, "failed": 0, "error": 0, "skipped": 0}
    ms = 0
    for R in runs:
        for t in R["tests"]:
            if t.get("status") in tot:
                tot[t["status"]] += 1
        ms += R.get("ms") or 0
    n = sum(tot.values())
    L = [f"Tests im CodeAtlas: {n} ausgeführt – {tot['passed']} bestanden, {tot['failed']} fehlgeschlagen, {tot['error']} mit Fehler/Absturz, "
         f"{tot['skipped']} übersprungen ({ms / 1000:.1f} s). Der Lauf ist live im Diagramm des Nutzers zu sehen."]
    if any(R.get("partial") for R in runs):
        L.append("(Teil-Lauf: nur ausgewählte Tests – für das Gesamtbild tests_run ohne Filter.)")
    neu = [t["id"] for R in runs for t in R["tests"] if t.get("was") == "passed" and t.get("status") in ("failed", "error")]
    fix = [t["id"] for R in runs for t in R["tests"] if t.get("was") in ("failed", "error") and t.get("status") == "passed"]
    if neu:
        L.append("NEU KAPUTT seit dem letzten Lauf (lief vorher durch): " + ", ".join(_disp(x) for x in neu[:30]))
    if fix:
        L.append("Repariert seit dem letzten Lauf: " + ", ".join(_disp(x) for x in fix[:30]))
    if not sess.get("done"):
        L.append("ACHTUNG: Der Lauf ist noch nicht fertig – mit tests_last später das vollständige Ergebnis abrufen.")
    for R in runs:
        if R.get("build_error"):
            L.append(f"\n✗ {R['label']}: Übersetzen fehlgeschlagen:\n" + R["build_error"][-2500:])
        if R.get("note"):
            L.append(f"\n{R['label']}: {R['note']}")
        if R["kind"] == "cmd":
            L.append(f"\n{R['label']}: Exit-Code {R.get('code')} (eigener Testbefehl – ohne Fehlerort). Ausgabe (Ende):\n" + "\n".join(R.get("tail") or [])[-2500:])
        bad = [t for t in R["tests"] if t.get("status") in ("failed", "error") and (not detail or detail.lower() in t["id"].lower())]
        for t in bad[:25 if full else 8]:
            L.append("")
            L.append(f"✗ {'FEHLGESCHLAGEN' if t['status'] == 'failed' else 'FEHLER'}  {_disp(t['id'])}   ({t.get('ms', 0):.0f} ms)" + ("   [NEU – lief im letzten Lauf durch]" if t.get("was") == "passed" else ""))
            if t.get("etype") or t.get("msg"):
                L.append("  " + ((t.get("etype") or "") + (": " if t.get("etype") and t.get("msg") else "") + (t.get("msg") or "")).strip().replace("\n", "\n  ")[:1500])
            for c in (t.get("checks") or [])[:6]:
                L.append(f"  Prüfung im Test: {_disp(c['path'])}:{c['line']}   CHECK({c['expr']})" + (f"   → {c['detail']}" if c.get("detail") else ""))
            if t.get("at") and not t.get("checks"):
                a = t["at"]
                L.append(f"  Prüfung im Test: {_disp(a['path'])}:{a['line']}   {a.get('code', '')}")
                if a.get("locals"):
                    L.append("     Variablen: " + ", ".join(f"{k}={v}" for k, v in list(a["locals"].items())[:10]))
            if t.get("where"):
                w = t["where"]
                L.append(f"  Fehlerort im Programm: {_disp(w['path'])}:{w['line']} in {w.get('func', '?')}   {w.get('code', '')}")
                if w.get("locals"):
                    L.append("     Variablen dort: " + ", ".join(f"{k}={v}" for k, v in list(w["locals"].items())[:10]))
            elif t["status"] == "failed":
                L.append("  Fehlerort im Programm: kein Programmcode im Traceback – das Programm hat einen falschen Wert geliefert. Verdächtig sind die unten ausgeführten Funktionen.")
            if t.get("frames") and len(t["frames"]) > 1:
                L.append("  Aufrufpfad: " + " → ".join(f"{f.get('func', '?')} ({_disp(f['path'])}:{f['line']})" for f in t["frames"][-8:]))
            if t.get("ran"):
                L.append("  Vom Test ausgeführte Programmfunktionen: " + ", ".join(f"{f['name']} ({_disp(f['path'])}:{f['line']}) ×{f['n']}" for f in t["ran"][:14])
                         + (f" … (+{len(t['ran']) - 14})" if len(t["ran"]) > 14 else ""))
            if t.get("out", "").strip():
                L.append("  Ausgabe (Ende): " + t["out"].strip()[-700:].replace("\n", "\n    "))
        if len(bad) > (25 if full else 8):
            L.append(f"\n… und {len(bad) - (25 if full else 8)} weitere fehlgeschlagene Tests (tests_last mit filter für Details).")
        cov = R.get("cov")
        if cov and cov.get("total") and not R.get("partial"):
            miss = cov.get("missing") or []
            L.append(f"\nAbdeckung ({R['label']}): {cov['reached']} von {cov['total']} Programmfunktionen von den Tests erreicht."
                     + (" Nicht erreicht: " + ", ".join(f"{m['name']} ({_disp(m['path'])}:{m['line']})" for m in miss[:20]) + (" …" if len(miss) > 20 else "") if miss else ""))
    if not any(t.get("status") in ("failed", "error") for R in runs for t in R["tests"]) and n:
        L.append("\nAlle Tests bestanden.")
    return "\n".join(L)


TEST_HOWTO = ("Testdateien: Python test_*.py / *_test.py (Funktionen test_*() mit assert oder unittest.TestCase; pytest wird genutzt, wenn installiert). "
              "C/C++: test_*.c mit #include \"atlas_test.h\" und TEST(name) { CHECK(…); CHECK_EQ_INT(a, b); CHECK_EQ_STR(a, b); CHECK_NEAR(a, b, eps); } – kein main() schreiben; "
              "der Atlas linkt alle Programmdateien ohne main() dazu.")


def tests_info_text(d):
    L = ["Testdateien, die der CodeAtlas im Projekt findet:"]
    L.append("- Python (" + (d["py"]["framework"] + "): " + ", ".join(d["py"]["files"][:40]) if d["py"] else "): keine"))
    if d["c"]:
        L.append("- C/C++ (atlas_test.h): " + ", ".join(d["c"]["files"][:40]) + ("" if d["c"]["gcc"] else "  – ACHTUNG: kein gcc gefunden, C-Tests können nicht laufen"))
    else:
        L.append("- C/C++: keine")
    for c in d.get("cmd") or []:
        L.append("- eigener Testbefehl: " + c)
    L.append(TEST_HOWTO)
    L.append(f"Zeitlimit je Test: {d.get('timeout', TEST_TIMEOUT)} s. Ein Absturz oder Hänger wird dem Test zugeordnet, die übrigen Tests laufen weiter.")
    L.append("atlas_test.h liegt in .codeatlas/ und wird beim Übersetzen der Tests automatisch gefunden.")
    if d.get("last"):
        c = d["last"]["counts"]
        L.append(f"Letzter Lauf: {c['passed']} bestanden, {c['failed']} fehlgeschlagen, {c['error']} Fehler, {c['skipped']} übersprungen.")
    return "\n".join(L)


class TestSessions:
    """Ein Testlauf = je Sprache ein Lauf im Runner (mit Trace, live in der Oberfläche); hier wird gewartet und zusammengefasst."""

    def __init__(self, prj, runner, extra=()):
        self.prj, self.runner, self.extra = prj, runner, list(extra)
        self.lock, self.seq, self.last, self.cur = threading.Lock(), 0, None, None
        self.raw = {}   # Test-Kennung → (Sprache, Kennung im Test-Runner) – für „nur diese Tests noch einmal“
        self.map_file = prj.root / ".codeatlas" / "test-map.json"
        try:
            d = json.loads(self.map_file.read_text("utf-8"))
            self.tmap = {k: {"files": set(v["files"]), "funcs": {tuple(x) for x in v["funcs"]}} for k, v in d.get("map", {}).items()}
            self.raw.update({k: tuple(v) for k, v in d.get("raw", {}).items()})
            self.last_t0 = float(d.get("t0") or 0)
        except (OSError, ValueError, KeyError, TypeError):
            self.tmap, self.last_t0 = {}, 0.0

    def info(self):
        d = detect_tests(self.prj, self.extra)
        for k in ("_gcc", "_paths"):
            if d["c"]:
                d["c"].pop(k, None)
        d["last"] = self.summary(self.last) if self.last else None
        d["running"] = bool(self.cur and not self.cur["done"])
        d["timeout"] = TEST_TIMEOUT
        return d

    def _learn(self, r):
        T = r.test
        for tid in T["order"]:
            e = T["by"][tid]
            if e.get("status") in ("queued", "running") or tid not in T["per"]:
                continue
            ran = self.runner._ran(r, T["per"][tid])
            tf = tid.split("::", 1)[0]
            self.tmap[tid] = {"files": {f["path"] for f in ran} | {tf}, "funcs": {(f["path"], f["name"].split(".")[-1]) for f in ran}}
        try:
            self.map_file.write_text(json.dumps({"t0": self.last_t0, "raw": {k: list(v) for k, v in self.raw.items()},
                                                 "map": {k: {"files": sorted(v["files"]), "funcs": sorted(list(x) for x in v["funcs"])} for k, v in self.tmap.items()}}), "utf-8")
        except OSError:
            pass

    def tests_touching(self, funcs, files):
        if not self.tmap:
            return None
        own = lambda t: (t.split("::", 1)[0], t.split("::")[-1].split("[")[0])   # der Test selbst liegt im Wirkungsbereich
        return sorted(t for t, v in self.tmap.items() if (v["funcs"] & funcs) or own(t) in funcs)

    def changed_since(self, t):
        out = set()
        for p in scan_files(self.prj):
            try:
                if p.stat().st_mtime > t:
                    out.add(self.prj.rel(p))
            except OSError:
                pass
        return out

    def affected_ids(self, paths=None):
        """Tests, die eine der geänderten Dateien ausführen (laut letztem Lauf) – plus alle Tests in geänderten Testdateien.
        None = noch unbekannt (dann alle laufen lassen)."""
        if not self.tmap:
            return None
        paths = set(paths) if paths else self.changed_since(self.last_t0 or 0)
        known = {t.split("::", 1)[0] for t in self.raw}
        if any(re.match(r"(test_.*|.*_test)\.(py|c)$", p.rsplit("/", 1)[-1]) and p not in known for p in paths):
            return None   # neue Testdatei: ihre Tests kennt die Zuordnung noch nicht → alle laufen lassen
        ids = {t for t, v in self.tmap.items() if v["files"] & paths}
        for t, raw in self.raw.items():
            if t.split("::", 1)[0] in paths:
                ids.add(t)
        return sorted(ids)

    def failed_ids(self):
        h = getattr(self.runner, "test_hist", {})
        return [t for t, st in h.items() if st in ("failed", "error")]

    def start(self, kinds=None, flt="", source="ui", ids=None):
        with self.lock:
            if self.cur and not self.cur["done"]:
                raise RuntimeError("Es läuft bereits ein Testlauf")
            self.last_t0 = time.time()
            only = None
            if ids is not None:
                only = {}
                for t in ids:
                    if t in self.raw:
                        only.setdefault(self.raw[t][0], []).append(self.raw[t][1])
            pres = test_presets(self.prj, kinds, (flt or "").strip(), self.extra, only)
            self.seq += 1
            s = {"id": self.seq, "runs": [], "done": not pres, "t0": time.time(), "filter": flt or "", "source": source, "ev": threading.Event(), "stop": False}
            self.cur = s
        if not pres:
            s["ev"].set()
            self.last = s
            return s
        write_test_support(self.prj.root / ".codeatlas")

        def go():
            try:
                for p in pres:
                    if s["stop"]:
                        break
                    rid = self.runner.start(p, "", True)
                    s["runs"].append(rid)
                    while True:
                        r = self.runner.runs.get(rid)
                        if not r or r.status == "ended":
                            break
                        time.sleep(0.1)
                    if r and r.test:
                        for tid, raw in r.test["raw"].items():
                            self.raw[tid] = (r.test["kind"], raw)
                        self._learn(r)
            finally:
                s["done"] = True
                self.last = s
                s["ev"].set()
        self.last = s
        threading.Thread(target=go, daemon=True).start()
        return s

    def stop(self):
        s = self.cur
        if s and not s["done"]:
            s["stop"] = True
            for rid in list(s["runs"]):
                self.runner.stop(rid)

    def data(self, s):
        if not s:
            return None
        runs = []
        for rid in s["runs"]:
            r = self.runner.runs.get(rid)
            if not r or not r.test:
                continue
            T = r.test
            runs.append({"run": rid, "label": r.pr["label"], "kind": r.pr.get("test"), "partial": bool(r.pr.get("partial")), "tests": [T["by"][i] for i in T["order"]], "cov": T.get("cov"),
                         "ms": T.get("ms") or int((time.time() - T["t0"]) * 1000), "code": T.get("code"), "build_error": T.get("build_error"),
                         "note": T.get("note"), "tail": list(T.get("tail") or [])[-60:], "framework": T["info"].get("framework")})
        return {"id": s["id"], "done": s["done"], "filter": s["filter"], "runs_data": runs, "runs": list(s["runs"])}

    def summary(self, s):
        d = self.data(s)
        if not d:
            return None
        cnt = {"passed": 0, "failed": 0, "error": 0, "skipped": 0}
        for R in d["runs_data"]:
            for t in R["tests"]:
                if t.get("status") in cnt:
                    cnt[t["status"]] += 1
        return {"id": d["id"], "done": d["done"], "counts": cnt, "runs": d["runs"]}

    def run_affected(self, wait=280, source="mcp", paths=None):
        ids = self.affected_ids(paths)
        if ids is not None and not ids:
            return None, "Keine betroffenen Tests: seit dem letzten Lauf wurde nichts geändert, was ein Test ausführt."
        return self.run_wait(None, "", wait, source, ids), ("" if ids is not None else "(Zuordnung Test → Funktionen noch unbekannt – alle Tests ausgeführt.)")

    def run_wait(self, kinds=None, flt="", wait=280, source="mcp", ids=None):
        try:
            s = self.start(kinds, flt, source, ids)
        except RuntimeError:
            s = self.cur
        s["ev"].wait(wait)
        return self.data(s)


# ------------------------------------------------------------------ Bridge 2.0: Graph für Claude, Pipeline, Regeln, Qualitätstor, Team, Git
class GraphStore:
    """Das Modell der Oberfläche (Klassen, Funktionen, Aufrufe, Kanten) – die Oberfläche schickt es nach jedem Neuaufbau.
    Damit beantwortet die Bridge Claude-Fragen wie „wo ist X“, „wer hängt an Y“, „wie kommt man von A nach B“, ohne dass Claude
    das Projekt Datei für Datei durchsuchen muss. Liegt zusätzlich in .codeatlas/graph.json (gilt dann bis zur nächsten Meldung als „alt“)."""

    def __init__(self, prj):
        self.prj, self.lock, self.g, self.ix, self.t, self.stale = prj, threading.Lock(), None, None, 0.0, True
        self.file = prj.root / ".codeatlas" / "graph.json"
        try:
            self._set(json.loads(self.file.read_text("utf-8")), False)
            self.t = self.file.stat().st_mtime
        except (OSError, ValueError, KeyError, TypeError, IndexError):
            pass

    def put(self, g):
        self._set(g, True)
        self.stale, self.t = False, time.time()

    def _set(self, g, save):
        cl, nodes, by = g.get("classes") or [], {}, {}
        callers, callees, cin, cout = {}, {}, {}, {}

        def reg(name, key):
            for n in {name, name.lower()}:
                by.setdefault(n, []).append(key)
        for i, c in enumerate(cl):
            k = f"c{i}"
            nodes[k] = {"key": k, "name": c.get("n", "?"), "kind": c.get("k", ""), "path": c.get("f", ""), "line": c.get("l") or 0, "end": c.get("e") or c.get("l") or 0,
                        "cls": i, "module": c.get("mo", ""), "test": is_test_path(c.get("f", ""))}
            reg(c.get("n", "?"), k)
            for j, m in enumerate(c.get("m") or []):
                mk = f"m{i}.{j}"
                full = m[0] if c.get("k") == "module" else f"{c.get('n')}.{m[0]}"
                nodes[mk] = {"key": mk, "name": m[0], "full": full, "kind": "funktion", "path": m[1] or c.get("f", ""), "line": m[2] or 0, "end": m[3] or m[2] or 0,
                             "cls": i, "test": is_test_path(m[1] or c.get("f", ""))}
                reg(m[0], mk)
                if full != m[0]:
                    reg(full, mk)
        for i, c in enumerate(cl):
            for j, m in enumerate(c.get("m") or []):
                for ln in (m[4] if len(m) > 4 else None) or []:
                    tk = f"m{ln[0]}.{ln[1]}"
                    if tk in nodes:
                        callees.setdefault(f"m{i}.{j}", []).append(tk)
                        callers.setdefault(tk, []).append(f"m{i}.{j}")
        for e in g.get("edges") or []:
            a, b = f"c{e[0]}", f"c{e[1]}"
            if a in nodes and b in nodes and a != b:
                cout.setdefault(a, []).append((b, e[2], e[3] if len(e) > 3 else ""))
                cin.setdefault(b, []).append((a, e[2], e[3] if len(e) > 3 else ""))
        ix = {"nodes": nodes, "by": by, "callers": callers, "callees": callees, "cin": cin, "cout": cout}
        with self.lock:
            self.g, self.ix = g, ix
        if save:
            try:
                self.file.parent.mkdir(exist_ok=True)
                tmp = self.file.with_suffix(".tmp")
                tmp.write_text(json.dumps(g, separators=(",", ":")), "utf-8")
                os.replace(tmp, self.file)
            except OSError:
                pass

    # --- Abfragen
    def _need(self):
        if not self.ix:
            raise LookupError("Der CodeAtlas hat noch kein Diagramm für dieses Projekt erzeugt – die Atlas-Oberfläche einmal mit dem Projekt öffnen.")

    def age(self):
        if not self.ix:
            return "kein Diagramm"
        s = int(time.time() - self.t)
        return ("Stand " + time.strftime("%H:%M:%S", time.localtime(self.t))) + (" (gespeicherter Stand – Oberfläche nicht offen)" if self.stale else "") + (f", vor {s} s" if s < 600 else "")

    def lbl(self, k):
        n = self.ix["nodes"][k]
        return f"{n.get('full', n['name'])} ({_disp(n['path'])}:{n['line']})"

    def resolve(self, q, limit=15):
        """Text → passende Knoten. Versteht Namen, Klasse.methode, Datei:Zeile und Stacktrace-Zeilen."""
        self._need()
        ix, q = self.ix, str(q or "").strip()
        hits = []
        for m in re.finditer(r'([\w./\\-]+\.[A-Za-z0-9]{1,6})["\']?(?:, line |:|\()(\d+)', q):   # Datei:Zeile, auch File "x.py", line 12
            path, line = m.group(1).replace("\\", "/"), int(m.group(2))
            best = None
            for k, n in ix["nodes"].items():
                if n["path"] and (n["path"].endswith("/" + path.lstrip("./")) or n["path"].endswith(path.split("/")[-1])) and n["line"] <= line <= max(n["end"], n["line"]):
                    span = max(n["end"], n["line"]) - n["line"]
                    if not best or span < best[0]:
                        best = (span, k)
            if best and best[1] not in hits:
                hits.append(best[1])
        if hits:
            return hits[:limit]
        sc = {}
        toks = [t for t in re.split(r"[\s,;()]+", q) if t] or [q]
        for t in toks:
            tl = t.lower()
            for k in ix["by"].get(t, []):
                sc[k] = sc.get(k, 0) + 100
            for k in ix["by"].get(tl, []):
                sc[k] = sc.get(k, 0) + 80
            if len(tl) >= 3:
                for name, ks in ix["by"].items():
                    if name != tl and name.islower() and tl in name:
                        for k in ks:
                            sc[k] = sc.get(k, 0) + (45 if name.startswith(tl) or name.endswith("." + tl) else 25)
                for k, n in ix["nodes"].items():
                    if k.startswith("c") and tl in n["path"].lower():
                        sc[k] = sc.get(k, 0) + 15
        for k in sc:
            if ix["nodes"][k]["test"]:
                sc[k] -= 5
        return [k for k, _ in sorted(sc.items(), key=lambda x: -x[1])][:limit]

    def orient(self, tsess=None):
        self._need()
        g, ix = self.g, self.ix
        cls = [n for k, n in ix["nodes"].items() if k.startswith("c")]
        fns = [n for k, n in ix["nodes"].items() if k.startswith("m")]
        L = [f"Projekt {self.prj.name} – {len(cls)} Bausteine (Klassen/Module), {len(fns)} Funktionen, {len(g.get('edges') or [])} Verbindungen. {self.age()}."]
        if g.get("langs"):
            L.append("Sprachen: " + ", ".join(f"{k} {v}" for k, v in sorted(g["langs"].items(), key=lambda x: -x[1])))
        mods = {}
        for n in cls:
            mods[n["module"] or "(Wurzel)"] = mods.get(n["module"] or "(Wurzel)", 0) + 1
        L.append("Module/Ordner: " + ", ".join(f"{m} ({c})" for m, c in sorted(mods.items(), key=lambda x: -x[1])[:20]))
        entry = [k for k, n in ix["nodes"].items() if k.startswith("m") and n["name"] in ("main", "WinMain", "wmain", "setup", "loop", "app_main") and not n["test"]]
        if entry:
            L.append("Einstiegspunkte: " + ", ".join(self.lbl(k) for k in entry[:8]))
        deg = sorted(((len(ix["cin"].get(n["key"], [])) + len(ix["cout"].get(n["key"], [])), n["key"]) for n in cls if not n["test"]), reverse=True)
        L.append("Zentrale Bausteine (meiste Verbindungen): " + ", ".join(f"{self.lbl(k)} – {d}" for d, k in deg[:10] if d))
        hot = sorted(((len(ix["callers"].get(k, [])), k) for k, n in ix["nodes"].items() if k.startswith("m") and not n["test"]), reverse=True)
        if hot and hot[0][0]:
            L.append("Meist aufgerufene Funktionen: " + ", ".join(f"{self.lbl(k)} ×{c}" for c, k in hot[:10] if c))
        r = g.get("rules") or {}
        if r.get("cycles"):
            L.append(f"Abhängigkeitszyklen ({len(r['cycles'])}): " + "; ".join(" → ".join(c[:6]) + (" …" if len(c) > 6 else "") for c in r["cycles"][:5]))
        if r.get("violations"):
            L.append(f"Verstöße gegen Architekturregeln: {len(r['violations'])} (atlas_rules zeigt sie)")
        if tsess:
            d = tsess.info()
            L.append("Tests: " + ", ".join(x for x in ((f"Python {len(d['py']['files'])} Dateien" if d["py"] else ""), (f"C {len(d['c']['files'])} Dateien" if d["c"] else "")) if x) if (d["py"] or d["c"]) else "Tests: noch keine")
        L.append("Weiter mit atlas_find (Name, Datei:Zeile oder Stacktrace), atlas_impact (wer hängt daran), atlas_trace (Weg von A nach B), atlas_read (Quelltext + Aufrufer).")
        return "\n".join(L)

    def find(self, q):
        ks = self.resolve(q)
        if not ks:
            return f"Nichts gefunden für „{q}“. Tipp: Teilwort eines Funktions-/Klassennamens oder Datei:Zeile angeben."
        ix, L = self.ix, [f"Treffer für „{q}“ ({self.age()}):"]
        for k in ks:
            n = ix["nodes"][k]
            if k.startswith("m"):
                L.append(f"- Funktion {self.lbl(k)} – {len(ix['callers'].get(k, []))} Aufrufer, ruft {len(ix['callees'].get(k, []))} auf" + (" [Test]" if n["test"] else ""))
            else:
                L.append(f"- {n['kind'] or 'Baustein'} {self.lbl(k)} – {len(ix['cin'].get(k, []))} eingehende, {len(ix['cout'].get(k, []))} ausgehende Verbindungen" + (" [Test]" if n["test"] else ""))
        return "\n".join(L)

    def impact_keys(self, ks, depth=3, dirn="aufrufer"):
        ix, seen, layers, front = self.ix, set(ks), [], list(ks)
        for d in range(max(1, min(int(depth or 3), 6))):
            nxt = []
            for k in front:
                if k.startswith("m"):
                    near = ix["callers"].get(k, []) if dirn != "aufgerufen" else ix["callees"].get(k, [])
                    if dirn == "beide":
                        near = near + ix["callees"].get(k, [])
                else:
                    near = [x[0] for x in (ix["cin"].get(k, []) if dirn != "aufgerufen" else ix["cout"].get(k, []))]
                    i = ix["nodes"][k]["cls"]
                    for mk in [x for x in ix["nodes"] if x.startswith(f"m{i}.")]:   # Funktionen des Bausteins mitnehmen
                        near = near + (ix["callers"].get(mk, []) if dirn != "aufgerufen" else ix["callees"].get(mk, []))
                for x in near:
                    if x not in seen:
                        seen.add(x)
                        nxt.append(x)
            if not nxt:
                break
            layers.append(nxt)
            front = nxt
        return layers

    def impact(self, q, depth=3, dirn="aufrufer", tsess=None):
        ks = self.resolve(q, 3)
        if not ks:
            return f"„{q}“ nicht im Diagramm gefunden."
        layers = self.impact_keys(ks, depth, dirn)
        ix = self.ix
        L = [f"Wirkungsbereich von {', '.join(self.lbl(k) for k in ks)} – Richtung: {dirn}, Tiefe {depth} ({self.age()}):"]
        files = set()
        for d, lay in enumerate(layers, 1):
            names = [self.lbl(k) for k in lay[:40]]
            for k in lay:
                files.add(ix["nodes"][k]["path"])
            L.append(f"  Ebene {d} ({len(lay)}): " + ", ".join(names) + (" …" if len(lay) > 40 else ""))
        if not layers:
            L.append("  Niemand hängt daran (keine Aufrufer/Verwender im Diagramm).")
        L.append(f"Betroffene Dateien ({len(files)}): " + ", ".join(sorted(_disp(f) for f in files)[:30]))
        if tsess:
            allk = set(ks) | {k for lay in layers for k in lay}
            ids = tsess.tests_touching({(ix["nodes"][k]["path"], ix["nodes"][k]["name"]) for k in allk if k.startswith("m")}, {ix["nodes"][k]["path"] for k in allk})
            if ids is None:
                L.append("Betroffene Tests: noch unbekannt (erst einmal tests_run ausführen, dann kennt der Atlas, welcher Test was ausführt).")
            else:
                L.append(f"Betroffene Tests ({len(ids)}): " + (", ".join(_disp(t) for t in ids[:25]) if ids else "keiner – diese Stellen sind ungetestet"))
        return "\n".join(L)

    def trace(self, a, b):
        ka, kb = self.resolve(a, 3), self.resolve(b, 3)
        if not ka or not kb:
            return f"Nicht gefunden: {'„' + a + '“' if not ka else '„' + b + '“'}"
        ix = self.ix
        for nb in (lambda k: ix["callees"].get(k, []) if k.startswith("m") else [x[0] for x in ix["cout"].get(k, [])],):
            for s in ka:
                prev, front, goal = {s: None}, [s], set(kb)
                if s.startswith("c"):
                    front = [s] + [x for x in ix["nodes"] if x.startswith(f"m{ix['nodes'][s]['cls']}.")]
                    for x in front:
                        prev.setdefault(x, None)
                hit = None
                while front and not hit:
                    nxt = []
                    for k in front:
                        for x in nb(k):
                            if x in prev:
                                continue
                            prev[x] = k
                            if x in goal or (x.startswith("m") and f"c{ix['nodes'][x]['cls']}" in goal):
                                hit = x
                                break
                            nxt.append(x)
                        if hit:
                            break
                    front = nxt
                if hit:
                    path = []
                    while hit:
                        path.append(hit)
                        hit = prev[hit]
                    return f"Weg ({len(path) - 1} Schritte, {self.age()}):\n  " + "\n  → ".join(self.lbl(k) for k in reversed(path))
        return f"Kein Aufrufweg von {self.lbl(ka[0])} nach {self.lbl(kb[0])} im Diagramm gefunden (evtl. über Zeiger/Ereignisse oder dynamisch – das sieht der statische Graph nicht)."

    def read(self, q):
        ks = self.resolve(q, 1)
        if not ks:
            return f"„{q}“ nicht gefunden."
        ix, k = self.ix, ks[0]
        n = ix["nodes"][k]
        try:
            lines = self.prj.resolve(n["path"]).read_text("utf-8", "replace").splitlines()
        except (OSError, PermissionError, ValueError):
            return f"{self.lbl(k)}: Datei nicht lesbar."
        a, b = max(1, n["line"]), max(n["end"], n["line"])
        b = min(b, a + 220, len(lines))
        L = [f"{self.lbl(k)}, Zeilen {a}–{b}:"] + [f"{i:>5}  {lines[i - 1]}" for i in range(a, b + 1)]
        if k.startswith("m"):
            if ix["callers"].get(k):
                L.append("Aufrufer: " + ", ".join(self.lbl(x) for x in ix["callers"][k][:20]))
            if ix["callees"].get(k):
                L.append("Ruft auf: " + ", ".join(self.lbl(x) for x in ix["callees"][k][:20]))
        else:
            if ix["cin"].get(k):
                L.append("Wird verwendet von: " + ", ".join(f"{self.lbl(x[0])} [{x[1]}]" for x in ix["cin"][k][:20]))
            if ix["cout"].get(k):
                L.append("Verwendet: " + ", ".join(f"{self.lbl(x[0])} [{x[1]}]" for x in ix["cout"][k][:20]))
        return "\n".join(L)

    def rules_text(self, rules_store):
        rs = rules_store.get() if rules_store else {}
        L = ["Architekturregeln des Projekts (.codeatlas/rules.json):"]
        for r in rs.get("rules") or []:
            L.append(f"- {r.get('from')} darf NICHT auf {r.get('to')} zugreifen" + (f" ({r['text']})" if r.get("text") else ""))
        if rs.get("noCycles"):
            L.append("- keine Abhängigkeitszyklen zwischen Modulen/Dateien")
        if len(L) == 1:
            L.append("- keine Regeln festgelegt")
        g = self.g or {}
        v = (g.get("rules") or {}).get("violations") or []
        cy = (g.get("rules") or {}).get("cycles") or []
        L.append(f"Aktueller Stand ({self.age()}): {len(v)} Verstöße, {len(cy)} Zyklen.")
        for x in v[:30]:
            L.append(f"  ✗ {x.get('text')} – {_disp(x.get('path'))}:{x.get('line')}")
        if rs.get("noCycles"):
            for c in cy[:10]:
                L.append("  ✗ Zyklus: " + " → ".join(c))
        return "\n".join(L)


class JsonStore:
    def __init__(self, path, default):
        self.path, self.default, self.lock = path, default, threading.Lock()

    def get(self):
        try:
            d = json.loads(self.path.read_text("utf-8"))
            return d if isinstance(d, dict) else json.loads(json.dumps(self.default))
        except (OSError, ValueError):
            return json.loads(json.dumps(self.default))

    def put(self, d):
        with self.lock:
            self.path.parent.mkdir(exist_ok=True)
            tmp = self.path.with_suffix(".tmp")
            tmp.write_text(json.dumps(d, ensure_ascii=False, indent=1), "utf-8")
            os.replace(tmp, self.path)
        return d


PIPE_STAGES = ("idee", "spec", "plan", "aufgaben", "umsetzen", "fertig")


class Pipeline(JsonStore):
    """Idee → Spezifikation → Plan → Aufgaben → Umsetzen. Claude liefert die Stufen über Werkzeuge (plan_set_*), du gibst sie frei."""

    def __init__(self, prj, hub):
        super().__init__(prj.root / ".codeatlas" / "pipeline.json", {"stage": "idee", "idea": "", "spec": "", "plan": "", "tasks": [], "approved": {}, "rev": 0})
        self.hub = hub

    def save(self, d):
        d["rev"] = int(d.get("rev") or 0) + 1
        d["updated"] = int(time.time())
        self.put(d)
        if self.hub:
            self.hub.emit({"k": "pipeline", "rev": d["rev"], "stage": d.get("stage")}, keep=False)
        return d

    def set_text(self, which, text):
        d = self.get()
        d[which] = str(text or "")[:60000]
        d["stage"] = which
        d.setdefault("approved", {})[which] = False
        self.save(d)
        return f"{'Spezifikation' if which == 'spec' else 'Plan'} im CodeAtlas gespeichert ({len(d[which])} Zeichen). Der Nutzer prüft sie dort und gibt sie frei – nicht selbst weitermachen."

    def set_tasks(self, tasks):
        if not isinstance(tasks, list) or not tasks:
            raise ValueError("aufgaben muss eine nicht-leere Liste sein")
        d, out = self.get(), []
        for i, t in enumerate(tasks[:80], 1):
            if isinstance(t, str):
                t = {"titel": t}
            out.append({"id": str(t.get("id") or f"A{i}"), "title": str(t.get("titel") or t.get("title") or f"Aufgabe {i}")[:200],
                        "desc": str(t.get("beschreibung") or t.get("desc") or "")[:4000],
                        "files": [str(x) for x in (t.get("dateien") or t.get("files") or [])][:20],
                        "symbols": [str(x) for x in (t.get("symbole") or t.get("symbols") or [])][:20],
                        "deps": [str(x) for x in (t.get("abhaengig_von") or t.get("deps") or [])][:20],
                        "test": str(t.get("pruefung") or t.get("test") or "")[:1000], "status": "offen", "note": ""})
        d["tasks"], d["stage"] = out, "aufgaben"
        d.setdefault("approved", {})["aufgaben"] = False
        self.save(d)
        return f"{len(out)} Aufgaben im CodeAtlas gespeichert. Der Nutzer gibt sie frei und startet die Umsetzung – nicht selbst beginnen."

    def update_task(self, tid, status, note=""):
        st = {"offen": "offen", "in_arbeit": "in_arbeit", "läuft": "in_arbeit", "erledigt": "erledigt", "fertig": "erledigt", "blockiert": "blockiert"}.get(str(status or "").lower())
        if not st:
            raise ValueError("status: offen, in_arbeit, erledigt oder blockiert")
        d = self.get()
        t = next((x for x in d.get("tasks") or [] if x["id"] == str(tid)), None)
        if not t:
            raise ValueError(f"Aufgabe {tid} gibt es nicht")
        t["status"], t["note"] = st, str(note or "")[:2000]
        if all(x["status"] == "erledigt" for x in d["tasks"]):
            d["stage"] = "fertig"
        elif d["stage"] == "aufgaben" and st != "offen":
            d["stage"] = "umsetzen"
        self.save(d)
        n = sum(x["status"] == "erledigt" for x in d["tasks"])
        return f"Aufgabe {tid}: {st}. Stand: {n}/{len(d['tasks'])} erledigt."

    def text(self):
        d = self.get()
        L = [f"Pipeline – Stufe: {d.get('stage')}"]
        if d.get("idea"):
            L.append("IDEE:\n" + d["idea"])
        if d.get("spec"):
            L.append(("SPEZIFIKATION (freigegeben):\n" if d.get("approved", {}).get("spec") else "SPEZIFIKATION (noch nicht freigegeben):\n") + d["spec"])
        if d.get("plan"):
            L.append(("PLAN (freigegeben):\n" if d.get("approved", {}).get("plan") else "PLAN (noch nicht freigegeben):\n") + d["plan"])
        if d.get("tasks"):
            L.append("AUFGABEN:")
            for t in d["tasks"]:
                L.append(f"- [{t['status']}] {t['id']}: {t['title']}" + (f" (hängt ab von {', '.join(t['deps'])})" if t["deps"] else "")
                         + (f"\n    {t['desc']}" if t["desc"] else "") + (f"\n    Dateien: {', '.join(t['files'])}" if t["files"] else "")
                         + (f"\n    Prüfung: {t['test']}" if t["test"] else "") + (f"\n    Notiz: {t['note']}" if t["note"] else ""))
        return "\n\n".join(L)


def git_run(cwd, *args, timeout=60):
    git = find_exe(["git"], [PF + r"\Git\cmd\git.exe", PF + r"\Git\bin\git.exe"] if IS_WIN else ())
    if not git:
        return 127, "git nicht gefunden"
    try:
        r = subprocess.run([git, *args], cwd=str(cwd), capture_output=True, timeout=timeout, creationflags=0x08000000 if IS_WIN else 0)
    except (OSError, subprocess.TimeoutExpired) as e:
        return 1, str(e)
    return r.returncode, (r.stdout.decode("utf-8", "replace") + (("\n" + r.stderr.decode("utf-8", "replace")) if r.returncode else "")).strip()


def git_info(root):
    c, top = git_run(root, "rev-parse", "--show-toplevel")
    if c:
        return {"repo": False, "msg": top if c == 127 else "kein Git-Repository"}
    _, br = git_run(root, "rev-parse", "--abbrev-ref", "HEAD")
    _, st = git_run(root, "status", "--porcelain")
    _, lg = git_run(root, "log", "-8", "--format=%h\x1f%s\x1f%cr\x1f%an")
    return {"repo": True, "top": top, "branch": br, "dirty": [l[3:] for l in st.splitlines() if l.strip()][:200],
            "log": [dict(zip(("hash", "msg", "when", "who"), l.split("\x1f"))) for l in lg.splitlines() if l]}


def git_hotspots(root, days=365):
    c, out = git_run(root, "log", f"--since={int(days)}.days", "--name-only", "--format=\x1e%H\x1f%an\x1f%ct", timeout=90)
    if c:
        return {"error": out}
    files, pairs, commits = {}, {}, 0
    for blk in out.split("\x1e"):
        lines = [l for l in blk.strip().splitlines() if l.strip()]
        if not lines or "\x1f" not in lines[0]:
            continue
        commits += 1
        _, who, ts = lines[0].split("\x1f")
        fl = lines[1:60]
        for f in fl:
            e = files.setdefault(f, {"n": 0, "who": set(), "last": 0})
            e["n"] += 1
            e["who"].add(who)
            e["last"] = max(e["last"], int(ts))
        if 2 <= len(fl) <= 12:
            for i in range(len(fl)):
                for j in range(i + 1, len(fl)):
                    k = tuple(sorted((fl[i], fl[j])))
                    pairs[k] = pairs.get(k, 0) + 1
    _, top = git_run(root, "rev-parse", "--show-toplevel")
    pre = os.path.relpath(str(root), top).replace("\\", "/") if top else "."
    pre = "" if pre == "." else pre + "/"
    fx = lambda f: f[len(pre):] if pre and f.startswith(pre) else f
    return {"commits": commits, "days": days,
            "files": sorted([{"path": fx(f), "n": e["n"], "authors": len(e["who"]), "last": e["last"]} for f, e in files.items() if not pre or f.startswith(pre)], key=lambda x: -x["n"])[:400],
            "pairs": [{"a": fx(a), "b": fx(b), "n": n} for (a, b), n in sorted(pairs.items(), key=lambda x: -x[1])[:40] if n >= 2]}


CMD_START, CMD_END = "<!-- codeatlas:start -->", "<!-- codeatlas:end -->"


def claudemd_get(root):
    f = root / "CLAUDE.md"
    try:
        t = f.read_text("utf-8")
    except OSError:
        return {"exists": False, "section": "", "text": ""}
    a, b = t.find(CMD_START), t.find(CMD_END)
    return {"exists": True, "section": t[a + len(CMD_START):b].strip() if a >= 0 and b > a else "", "text": t[:20000]}


def claudemd_put(root, content):
    f = root / "CLAUDE.md"
    try:
        t = f.read_text("utf-8")
    except OSError:
        t = ""
    block = f"{CMD_START}\n{str(content).strip()}\n{CMD_END}"
    a, b = t.find(CMD_START), t.find(CMD_END)
    if a >= 0 and b > a:
        t = t[:a] + block + t[b + len(CMD_END):]
    else:
        t = (t.rstrip() + "\n\n" if t.strip() else "") + block + "\n"
    f.write_text(t, "utf-8")
    return {"ok": True, "path": str(f), "bytes": len(t.encode("utf-8"))}


class _NoWatch:
    def kick(self):
        pass

    def subscribe(self):
        return queue.Queue()

    def unsubscribe(self, q):
        pass


TEAM_COLORS = ["#a78bfa", "#f5a623", "#4ea8ff", "#ff5f6d", "#5ee38a", "#f472b6", "#22d3ee", "#facc15"]
TEAM_NAME = re.compile(r"^[a-z0-9][a-z0-9-]{0,30}$")


class TeamHub:
    """Weitere Claude-Code-Agenten, jeder in einem eigenen Git-Worktree (.codeatlas/team/<name>, Branch atlas/<name>).
    Sie arbeiten gleichzeitig, ohne sich gegenseitig Dateien zu überschreiben; zusammengeführt wird per git merge."""

    def __init__(self, prj, main, agents, port, host="127.0.0.1"):
        self.prj, self.main, self.agents, self.port, self.host = prj, main, agents, port, host
        self.side, self.clients, self.lock = {}, [], threading.RLock()
        self.dir = prj.root / ".codeatlas" / "team"
        self._rediscover()

    def _rediscover(self):
        c, out = git_run(self.prj.root, "worktree", "list", "--porcelain")
        if c:
            return
        cur = {}
        for line in out.splitlines() + [""]:
            if line.startswith("worktree "):
                cur = {"path": line[9:]}
            elif line.startswith("branch "):
                cur["branch"] = line[7:].replace("refs/heads/", "")
            elif not line and cur.get("path"):
                p = Path(cur["path"])
                if p.parent.resolve() == self.dir.resolve() and str(cur.get("branch", "")).startswith("atlas/"):
                    self._entry(p.name, p, cur["branch"], None)
                cur = {}

    def _entry(self, name, path, branch, base):
        sprj = Project(path)
        sw = _NoWatch()
        hub = AgentHub(sprj, CheckpointStore(sprj, PatchStore(sprj, sw)), sw, self.agents, self.port, self.host)
        hub.mcp = False
        hub.default_model = self.main.default_model
        if not base:
            _, base = git_run(path, "merge-base", "HEAD", self._main_branch())
        e = {"id": name, "name": name, "branch": branch, "path": path, "base": base.strip(), "hub": hub,
             "color": TEAM_COLORS[len(self.side) % len(TEAM_COLORS)], "t0": time.time()}
        q = hub.subscribe()
        threading.Thread(target=self._fwd, args=(e, q), daemon=True).start()
        with self.lock:
            self.side[name] = e
        return e

    def _main_branch(self):
        _, b = git_run(self.prj.root, "rev-parse", "--abbrev-ref", "HEAD")
        return b.strip() or "HEAD"

    def _map(self, e, p):
        if isinstance(p, str) and p.startswith(e["name"] + "/"):
            return self.prj.name + "/" + p[len(e["name"]) + 1:]
        return p

    def _fwd(self, e, q):
        while e["id"] in self.side:
            try:
                m = q.get(timeout=1)
            except queue.Empty:
                continue
            try:
                o = json.loads(m)
            except ValueError:
                continue
            if "path" in o:
                o["path"] = self._map(e, o["path"])
            o["agent"] = e["id"]
            self._emit(o)

    def _emit(self, o):
        msg = json.dumps(o, ensure_ascii=False, separators=(",", ":"))
        with self.lock:
            for q in self.clients:
                try:
                    q.put_nowait(msg)
                except queue.Full:
                    pass

    def subscribe(self):
        q = queue.Queue(maxsize=30000)
        with self.lock:
            q.put(json.dumps({"k": "team", "agents": self.list()}, ensure_ascii=False))
            for e in self.side.values():
                for o in list(e["hub"].history)[-400:]:
                    o = dict(o, agent=e["id"])
                    if "path" in o:
                        o["path"] = self._map(e, o["path"])
                    q.put(json.dumps(o, ensure_ascii=False, separators=(",", ":")))
            self.clients.append(q)
        return q

    def unsubscribe(self, q):
        with self.lock:
            if q in self.clients:
                self.clients.remove(q)

    def changed(self, e):
        b = e.get("base") or "HEAD"
        _, a = git_run(e["path"], "diff", "--name-only", b)
        _, u = git_run(e["path"], "ls-files", "--others", "--exclude-standard")
        return sorted({l.strip() for l in (a + "\n" + u).splitlines() if l.strip()})

    def list(self):
        out, main_dirty = [], set()
        c, st = git_run(self.prj.root, "status", "--porcelain")
        if not c:
            main_dirty = {l[3:].strip() for l in st.splitlines() if l.strip() and not l[3:].startswith(".codeatlas")}
        ch = {}
        for e in list(self.side.values()):
            ch[e["id"]] = self.changed(e)
        for e in list(self.side.values()):
            h = e["hub"]
            others = {}
            for o in self.side.values():
                if o is not e:
                    for f in set(ch[e["id"]]) & set(ch[o["id"]]):
                        others.setdefault(f, []).append(o["id"])
            for f in set(ch[e["id"]]) & main_dirty:
                others.setdefault(f, []).append("Hauptprojekt")
            last = next((x for x in reversed(h.history) if x.get("k") == "turn"), None)
            cost = sum(float(x.get("cost") or 0) for x in h.history if x.get("k") == "turn" and x.get("ph") == "end")
            out.append({"id": e["id"], "name": e["name"], "branch": e["branch"], "color": e["color"], "path": str(e["path"]), "running": bool(h.run),
                        "turns": h.turn, "changed": ch[e["id"]][:200], "conflicts": [{"file": f, "with": w} for f, w in sorted(others.items())],
                        "last": {"ph": last.get("ph"), "ok": last.get("ok"), "prompt": cut(last.get("prompt"), 200) if last.get("prompt") else None} if last else None,
                        "cost": round(cost, 4), "pending": len(h.pending), "resume": bool(h.session)})
        return out

    def _bcast(self):
        self._emit({"k": "team", "agents": self.list()})

    def start(self, name, prompt, mode="acceptEdits", model="", base="stand"):
        name = str(name or "").strip().lower()
        if not TEAM_NAME.match(name):
            raise ValueError("Name: Kleinbuchstaben, Ziffern, Bindestrich (z. B. tests-schreiben)")
        if name in self.side:
            return self.send(name, prompt, mode, model)
        gi = git_info(self.prj.root)
        if not gi["repo"]:
            raise ValueError("Parallele Agenten brauchen ein Git-Repository (im Projektordner: git init, einmal committen)")
        self.dir.mkdir(parents=True, exist_ok=True)
        path, branch = self.dir / name, "atlas/" + name
        start = "HEAD"
        if base == "stand":   # aktueller Arbeitsstand inkl. nicht committeter Änderungen (ohne neue, unversionierte Dateien)
            c, sha = git_run(self.prj.root, "stash", "create")
            if not c and sha.strip():
                start = sha.strip()
        c, out = git_run(self.prj.root, "worktree", "add", "-b", branch, str(path), start, timeout=180)
        if c:
            raise ValueError("git worktree add: " + out[-600:])
        (path / ".codeatlas").mkdir(exist_ok=True)
        (path / ".codeatlas" / ".gitignore").write_text("*\n", "utf-8")
        e = self._entry(name, path, branch, start if start != "HEAD" else None)
        r = e["hub"].start("0", prompt, mode, False, None, model or None, None)
        self._bcast()
        return dict(r, id=name)

    def send(self, aid, prompt, mode="acceptEdits", model=""):
        e = self.side.get(aid)
        if not e:
            raise ValueError("Agent unbekannt")
        h = e["hub"]
        r = h.send(prompt) if h.run else h.start("0", prompt, mode, False, None, model or None, None)
        self._bcast()
        return r

    def stop(self, aid):
        e = self.side.get(aid)
        if e:
            e["hub"].stop()
        return {"ok": True}

    def decide(self, aid, pid, allow, always=False):
        e = self.side.get(aid)
        return {"ok": bool(e and e["hub"].decide(pid, allow, always))}

    def diff(self, aid):
        e = self.side.get(aid)
        if not e:
            raise ValueError("Agent unbekannt")
        git_run(e["path"], "add", "-A", "-N")
        _, d = git_run(e["path"], "diff", e.get("base") or "HEAD", timeout=60)
        return {"diff": d[:400000], "cut": len(d) > 400000, "changed": self.changed(e)}

    def merge(self, aid, message=""):
        e = self.side.get(aid)
        if not e:
            raise ValueError("Agent unbekannt")
        if e["hub"].run:
            raise RuntimeError("Agent arbeitet noch – erst stoppen oder warten")
        git_run(e["path"], "add", "-A")
        c, _ = git_run(e["path"], "diff", "--cached", "--quiet")
        if c:
            msg = message or f"Team-Agent {e['name']}: " + (next((x.get("prompt") for x in reversed(e["hub"].history) if x.get("k") == "turn" and x.get("prompt")), "") or "Änderungen")[:120]
            c2, out = git_run(e["path"], "-c", "user.name=CodeAtlas Team", "-c", "user.email=codeatlas@localhost", "commit", "-m", msg)
            if c2:
                raise RuntimeError("Commit im Worktree fehlgeschlagen: " + out[-400:])
        main_dirty = set(git_info(self.prj.root).get("dirty") or [])
        ch = set(self.changed(dict(e, base=e.get("base") or "HEAD")))
        clash = sorted(f for f in ch & main_dirty if not f.startswith(".codeatlas"))
        if clash:
            return {"ok": False, "conflicts": clash, "error": "Im Hauptprojekt sind dieselben Dateien ungespeichert geändert – erst committen oder zurücksetzen: " + ", ".join(clash[:10])}
        c, out = git_run(self.prj.root, "-c", "user.name=CodeAtlas Team", "-c", "user.email=codeatlas@localhost", "merge", "--no-ff", "--no-edit", e["branch"], timeout=120)
        if c:
            _, un = git_run(self.prj.root, "diff", "--name-only", "--diff-filter=U")
            git_run(self.prj.root, "merge", "--abort")
            return {"ok": False, "conflicts": [l for l in un.splitlines() if l.strip()], "error": "Zusammenführen hat Konflikte – nichts geändert. " + out[-500:]}
        self.main.watcher.kick()
        self._remove(e)
        return {"ok": True, "files": sorted(ch), "msg": out[-300:]}

    def _remove(self, e):
        e["hub"].stop()
        e["hub"].close()
        with self.lock:
            self.side.pop(e["id"], None)
        git_run(self.prj.root, "worktree", "remove", "--force", str(e["path"]), timeout=120)
        git_run(self.prj.root, "branch", "-D", e["branch"])
        self._bcast()

    def discard(self, aid):
        e = self.side.get(aid)
        if not e:
            raise ValueError("Agent unbekannt")
        self._remove(e)
        return {"ok": True}

    def hub_by_token(self, tok):
        for e in list(self.side.values()):
            if secrets.compare_digest(tok, e["hub"].hook_token):
                return e["hub"]
        return None

    def close(self):
        for e in list(self.side.values()):
            try:
                e["hub"].stop()
                e["hub"].close()
            except Exception:
                pass


# ------------------------------------------------------------------ Patches & Schnappschüsse
PROTECTED_DIRS = {".codeatlas", ".git", ".svn", ".hg"}
MAX_SNAPSHOTS = 200
MAX_PATCH_OPS = 500


class PatchConflict(Exception):
    def __init__(self, conflicts):
        super().__init__("Dateien wurden inzwischen geändert")
        self.conflicts = conflicts


def write_bytes_atomic(full: Path, raw: bytes):
    full.parent.mkdir(parents=True, exist_ok=True)
    tmp = full.with_name("." + full.name + ".atlas-tmp")
    tmp.write_bytes(raw)
    os.replace(tmp, full)


def encode_text(text: str, encoding: str, eol: str) -> bytes:
    data = text.replace("\r\n", "\n")
    if eol == "\r\n":
        data = data.replace("\n", "\r\n")
    codec = {"utf-8-sig": "utf-8-sig", "windows-1252": "cp1252"}.get(encoding, "utf-8")
    return data.encode(codec, "replace")


def mtime_ms(full: Path):
    return full.stat().st_mtime_ns // 1_000_000


class PatchStore:
    """Wendet Änderungen über mehrere Dateien ganz oder gar nicht an und hält den Stand davor als Schnappschuss fest.

    Ablauf eines Patches: 1. alle Pfade prüfen (im Projekt, nicht geschützt)  2. Konflikte prüfen (mtime)
    3. Stand der betroffenen Dateien sichern  4. anwenden – schlägt ein Schritt fehl, wird alles zurückgerollt.
    Schnappschüsse liegen in .codeatlas/snapshots/ (vom Dateibaum und der Überwachung ausgenommen)."""

    def __init__(self, prj: Project, watcher=None):
        self.prj, self.watcher, self.lock = prj, watcher, threading.Lock()
        self.dir = prj.root / ".codeatlas" / "snapshots"
        self.git = shutil.which("git")

    # --- Pfade
    def _path(self, client_path):
        if not client_path or not str(client_path).strip():
            raise ValueError("Pfad fehlt")
        full = self.prj.resolve(str(client_path))
        if full == self.prj.root:
            raise ValueError("Pfad zeigt auf den Projektordner selbst")
        if set(full.relative_to(self.prj.root).parts) & PROTECTED_DIRS:
            raise PermissionError("Geschützter Ordner: " + str(client_path))
        if full.is_dir():
            raise ValueError("Pfad ist ein Ordner: " + str(client_path))
        return full

    def _plan(self, ops):
        """Macht aus den Anfrage-Operationen eine geprüfte Liste von (art, pfad, daten)."""
        if not isinstance(ops, list) or not ops:
            raise ValueError("ops fehlt oder ist leer")
        if len(ops) > MAX_PATCH_OPS:
            raise ValueError(f"Zu viele Operationen (max. {MAX_PATCH_OPS})")
        plan, seen, conflicts = [], set(), []

        def claim(full):
            if full in seen:
                raise ValueError("Datei kommt im Patch mehrfach vor: " + self.prj.rel(full))
            seen.add(full)

        def check(full, op):
            if op.get("mtime") and full.exists() and not force:
                cur = mtime_ms(full)
                if abs(cur - int(op["mtime"])) > 1:
                    conflicts.append({"path": self.prj.rel(full), "mtime": cur})

        force = False
        for op in ops:
            if not isinstance(op, dict):
                raise ValueError("Operation muss ein Objekt sein")
            kind = op.get("op")
            force = bool(op.get("force"))
            if kind == "write":
                full = self._path(op.get("path"))
                claim(full)
                check(full, op)
                if not isinstance(op.get("text"), str):
                    raise ValueError("write braucht text: " + self.prj.rel(full))
                if len(op["text"]) > MAX_TEXT * 4:
                    raise ValueError("Text zu groß: " + self.prj.rel(full))
                enc, eol = op.get("encoding"), op.get("eol")
                if (not enc or not eol) and full.is_file():
                    try:
                        cur = read_text(full)
                        enc, eol = enc or cur["encoding"], eol or cur["eol"]
                    except Exception:
                        pass
                plan.append(("write", full, encode_text(op["text"], enc or "utf-8", eol or "\n")))
            elif kind == "delete":
                full = self._path(op.get("path"))
                claim(full)
                check(full, op)
                if not full.exists():
                    if op.get("missing_ok"):
                        continue
                    raise FileNotFoundError("Datei nicht gefunden: " + self.prj.rel(full))
                plan.append(("delete", full, None))
            elif kind == "rename":
                src, dst = self._path(op.get("path")), self._path(op.get("to"))
                claim(src)
                claim(dst)
                check(src, op)
                if not src.is_file():
                    raise FileNotFoundError("Datei nicht gefunden: " + self.prj.rel(src))
                if dst.exists() and not op.get("overwrite"):
                    raise ValueError("Ziel existiert bereits: " + self.prj.rel(dst))
                plan.append(("write", dst, src.read_bytes()))
                plan.append(("delete", src, None))
            else:
                raise ValueError("Unbekannte Operation: " + str(kind))
        if conflicts:
            raise PatchConflict(conflicts)
        return plan

    # --- Schnappschüsse
    def _save_snapshot(self, files, label, source):
        """Sichert den jetzigen Stand der Dateien (Inhalt oder „gab es nicht“)."""
        now = time.time()
        sid = time.strftime("%Y%m%d-%H%M%S", time.localtime(now)) + "-%03d-" % int(now % 1 * 1000) + secrets.token_hex(2)
        d = self.dir / sid
        d.mkdir(parents=True, exist_ok=True)
        entries = []
        for i, full in enumerate(files):
            if full.is_file():
                (d / f"{i}.bin").write_bytes(full.read_bytes())
                entries.append({"path": self.prj.rel(full), "existed": True, "blob": f"{i}.bin", "size": full.stat().st_size})
            else:
                entries.append({"path": self.prj.rel(full), "existed": False})
        man = {"id": sid, "time": int(now * 1000), "label": str(label or "")[:200], "source": str(source or "")[:40], "files": entries}
        (d / "manifest.json").write_text(json.dumps(man, ensure_ascii=False, indent=1), "utf-8")
        self._prune()
        return man

    def _prune(self):
        try:
            ids = sorted(x.name for x in self.dir.iterdir() if x.is_dir())
        except OSError:
            return
        for old in ids[:-MAX_SNAPSHOTS]:
            shutil.rmtree(self.dir / old, ignore_errors=True)

    def list(self, limit=100):
        out = []
        try:
            ids = sorted((x.name for x in self.dir.iterdir() if x.is_dir()), reverse=True)
        except OSError:
            return out
        for sid in ids[:max(1, limit)]:
            try:
                man = json.loads((self.dir / sid / "manifest.json").read_text("utf-8"))
            except (OSError, ValueError):
                continue
            out.append({"id": man["id"], "time": man["time"], "label": man.get("label", ""), "source": man.get("source", ""),
                        "files": [{"path": f["path"], "existed": f["existed"]} for f in man["files"]]})
        out.sort(key=lambda m: m["time"], reverse=True)
        return out

    def _manifest(self, sid):
        if not re.fullmatch(r"[\w-]{6,40}", str(sid or "")):
            raise ValueError("Ungültige Schnappschuss-ID")
        mf = self.dir / str(sid) / "manifest.json"
        if not mf.is_file():
            raise FileNotFoundError("Schnappschuss nicht gefunden: " + str(sid))
        return json.loads(mf.read_text("utf-8"))

    # --- Anwenden
    def _apply(self, plan):
        """Führt die Schritte aus; bei einem Fehler wird der vorherige Stand aller Dateien wiederhergestellt."""
        backup = {}
        for _, full, _ in plan:
            if full not in backup:
                backup[full] = full.read_bytes() if full.is_file() else None
        done = []
        try:
            for kind, full, raw in plan:
                done.append(full)
                if kind == "write":
                    write_bytes_atomic(full, raw)
                else:
                    full.unlink()
                    self._drop_empty_dirs(full.parent)
        except Exception:
            for full in done:
                old = backup[full]
                try:
                    if old is None:
                        if full.exists():
                            full.unlink()
                            self._drop_empty_dirs(full.parent)
                    else:
                        write_bytes_atomic(full, old)
                except OSError:
                    pass
            raise
        res = []
        for full in backup:
            rel = self.prj.rel(full)
            if full.is_file():
                mt = mtime_ms(full)
                res.append({"path": rel, "mtime": mt, "size": full.stat().st_size, "created": backup[full] is None})
                if self.watcher:
                    self.watcher.snap[rel] = mt
            else:
                res.append({"path": rel, "deleted": True})
                if self.watcher:
                    self.watcher.snap.pop(rel, None)
        return res

    def _drop_empty_dirs(self, d: Path):
        while d != self.prj.root and self.prj.root in d.parents:
            try:
                d.rmdir()
            except OSError:
                return
            d = d.parent

    def patch(self, ops, label="", source="", snapshot=True, commit=False):
        with self.lock:
            plan = self._plan(ops)
            files = list(dict.fromkeys(full for _, full, _ in plan))
            snap = self._save_snapshot(files, label, source) if snapshot and files else None
            try:
                res = self._apply(plan)
            except Exception:
                if snap:   # nichts geändert → kein Schnappschuss nötig
                    shutil.rmtree(self.dir / snap["id"], ignore_errors=True)
                raise
            out = {"ok": True, "files": res, "snapshot": snap["id"] if snap else None}
            if commit:
                out["git"] = self._commit(files, label or "CodeAtlas-Patch")
            return out

    def apply_plan(self, plan, label="", source=""):
        """Wendet einen fertigen Plan aus ("write", Pfad, Bytes) / ("delete", Pfad, None) an – mit Schnappschuss und Zurückrollen bei Fehlern."""
        with self.lock:
            files = list(dict.fromkeys(full for _, full, _ in plan))
            snap = self._save_snapshot(files, label, source) if files else None
            try:
                res = self._apply(plan)
            except Exception:
                if snap:
                    shutil.rmtree(self.dir / snap["id"], ignore_errors=True)
                raise
            return {"ok": True, "files": res, "snapshot": snap["id"] if snap else None}

    def restore(self, sid):
        """Setzt die Dateien eines Schnappschusses auf den gesicherten Stand zurück (selbst wieder rückgängig machbar)."""
        with self.lock:
            man = self._manifest(sid)
            plan = []
            for f in man["files"]:
                full = self._path(f["path"])
                if f["existed"]:
                    plan.append(("write", full, (self.dir / man["id"] / f["blob"]).read_bytes()))
                elif full.exists():
                    plan.append(("delete", full, None))
            files = [full for _, full, _ in plan]
            undo = self._save_snapshot(files, "vor Zurücksetzen auf " + man["id"], "restore") if files else None
            try:
                res = self._apply(plan)
            except Exception:
                if undo:
                    shutil.rmtree(self.dir / undo["id"], ignore_errors=True)
                raise
            return {"ok": True, "files": res, "snapshot": undo["id"] if undo else None, "restored": man["id"]}

    # --- Git (optional)
    def _git(self, *args, timeout=20):
        r = subprocess.run([self.git, "-C", str(self.prj.root), *args], stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                           stdin=subprocess.DEVNULL, timeout=timeout)
        return r.returncode, r.stdout.decode("utf-8", "replace").strip()

    def git_info(self):
        if not self.git:
            return {"available": False, "repo": False}
        try:
            code, out = self._git("rev-parse", "--is-inside-work-tree")
            if code != 0 or out != "true":
                return {"available": True, "repo": False}
            _, branch = self._git("rev-parse", "--abbrev-ref", "HEAD")
            _, dirty = self._git("status", "--porcelain")
            return {"available": True, "repo": True, "branch": branch, "dirty": len([l for l in dirty.splitlines() if l.strip()])}
        except (OSError, subprocess.TimeoutExpired):
            return {"available": True, "repo": False}

    def _commit(self, files, message):
        """Hält genau die Dateien des Patches als Commit fest – anderes im Arbeitsverzeichnis bleibt unberührt."""
        if not self.git_info().get("repo"):
            return {"ok": False, "error": "Kein Git-Repository"}
        rels = [f.relative_to(self.prj.root).as_posix() for f in files]
        try:
            code, out = self._git("add", "-A", "--", *rels)
            if code != 0:
                return {"ok": False, "error": out[-600:]}
            code, out = self._git("diff", "--cached", "--quiet", "--", *rels)
            if code == 0:
                return {"ok": True, "commit": None, "note": "keine Änderung gegenüber dem letzten Commit"}
            code, out = self._git("commit", "-m", str(message)[:200], "--only", "--", *rels)
            if code != 0:
                return {"ok": False, "error": out[-600:]}
            _, sha = self._git("rev-parse", "--short", "HEAD")
            return {"ok": True, "commit": sha}
        except (OSError, subprocess.TimeoutExpired) as e:
            return {"ok": False, "error": str(e)}


# ------------------------------------------------------------------ Kontrollpunkte
MAX_CHECKPOINTS = 80
NO_CHECKPOINT_DIRS = {".claude"}   # Werkzeug-Konfiguration gehört nicht zum Projektstand


class CheckpointStore:
    """Hält den Stand aller Textdateien des Projekts fest – inhaltsadressiert, daher kostet ein Kontrollpunkt nur die geänderten Dateien.

    Darauf baut der Atlas zwei Dinge: „was hat sich seit dem Auftrag geändert“ (egal ob die KI ein Edit-Werkzeug, ein Shell-Kommando
    oder einen Generator benutzt hat) und das Zurücksetzen. Ablage: .codeatlas/objects (Inhalte) und .codeatlas/checkpoints (Verzeichnisse)."""

    def __init__(self, prj: Project, patches):
        self.prj, self.patches, self.lock = prj, patches, threading.RLock()
        base = prj.root / ".codeatlas"
        self.dir, self.obj = base / "checkpoints", base / "objects"
        self.cache, self.have, self.metas, self.last, self.made, self.sess = {}, set(), None, None, 0, None

    def session(self):
        """Kontrollpunkt vom Start dieser Bridge – die Vergleichsbasis, solange noch kein Auftrag lief."""
        with self.lock:
            if not self.sess:
                self.sess = self.create("Start der Bridge", "start")["id"]
            return self.sess

    def _blob(self, sha):
        return self.obj / sha[:2] / sha[2:]

    def _put(self, sha, raw):
        if sha in self.have:
            return
        p = self._blob(sha)
        if not p.exists():
            p.parent.mkdir(parents=True, exist_ok=True)
            tmp = p.with_name(p.name + ".tmp")
            tmp.write_bytes(raw)
            os.replace(tmp, p)
        self.have.add(sha)

    def _scan(self, store):
        """Pfad → [sha1, Größe] aller Textdateien; gelesen wird nur, was sich seit dem letzten Mal geändert hat."""
        out, skip = {}, len(self.prj.name) + 1
        for f in self.prj.walk():
            path = f["path"]
            if f["bin"] or NO_CHECKPOINT_DIRS & set(path.split("/")[1:-1]):
                continue
            full = self.prj.root / path[skip:]
            try:
                st = full.stat()
            except OSError:
                continue
            c = self.cache.get(path)
            sha = c[2] if c and c[0] == st.st_mtime_ns and c[1] == st.st_size else None
            if sha is None or (store and sha not in self.have and not self._blob(sha).exists()):
                try:
                    raw = full.read_bytes()
                except OSError:
                    continue
                sha = hashlib.sha1(raw).hexdigest()
                self.cache[path] = (st.st_mtime_ns, st.st_size, sha)
                if store:
                    self._put(sha, raw)
            elif store:
                self.have.add(sha)
            out[path] = [sha, st.st_size]
        return out

    def _metas(self):
        if self.metas is None:
            self.metas = []
            try:
                names = sorted(x.name for x in self.dir.iterdir() if x.suffix == ".json")
            except OSError:
                names = []
            for n in names:
                try:
                    m = json.loads((self.dir / n).read_text("utf-8"))
                    self.metas.append({"id": m["id"], "time": m["time"], "label": m.get("label", ""), "source": m.get("source", ""), "count": len(m.get("files", {}))})
                except (OSError, ValueError, KeyError):
                    continue
        return self.metas

    def _load(self, cid):
        if not re.fullmatch(r"[\w-]{6,40}", str(cid or "")):
            raise ValueError("Ungültige Kontrollpunkt-ID")
        if self.last and self.last["id"] == cid:
            return self.last
        f = self.dir / (str(cid) + ".json")
        if not f.is_file():
            raise FileNotFoundError("Kontrollpunkt nicht gefunden: " + str(cid))
        self.last = json.loads(f.read_text("utf-8"))
        return self.last

    def create(self, label="", source=""):
        with self.lock:
            metas = self._metas()   # vor dem Schreiben laden – sonst stünde der neue Kontrollpunkt doppelt in der Liste
            files = self._scan(True)
            now = time.time()
            stem = time.strftime("%Y%m%d-%H%M%S", time.localtime(now)) + "-%03d" % int(now % 1 * 1000)
            cid, n = stem, 1
            self.dir.mkdir(parents=True, exist_ok=True)
            while (self.dir / (cid + ".json")).exists():
                n += 1
                cid = f"{stem}-{n}"
            man = {"id": cid, "time": int(now * 1000), "label": str(label or "")[:200], "source": str(source or "")[:40], "files": files}
            (self.dir / (cid + ".json")).write_text(json.dumps(man, ensure_ascii=False), "utf-8")
            meta = {"id": cid, "time": man["time"], "label": man["label"], "source": man["source"], "count": len(files)}
            metas.append(meta)
            self.last = man
            self._prune()
            return meta

    def _prune(self):
        ms = self._metas()
        while len(ms) > MAX_CHECKPOINTS:
            old = ms.pop(0)
            try:
                (self.dir / (old["id"] + ".json")).unlink()
            except OSError:
                pass
        self.made += 1
        if self.made % 12 == 0:
            self._gc()

    def _gc(self):
        """Inhalte entfernen, auf die kein Kontrollpunkt mehr verweist."""
        keep = set()
        for m in self._metas():
            try:
                man = json.loads((self.dir / (m["id"] + ".json")).read_text("utf-8"))
            except (OSError, ValueError):
                return   # im Zweifel nichts löschen
            keep.update(v[0] for v in man.get("files", {}).values())
        try:
            subs = [d for d in self.obj.iterdir() if d.is_dir()]
        except OSError:
            return
        for d in subs:
            for f in d.iterdir():
                if d.name + f.name not in keep:
                    try:
                        f.unlink()
                        self.have.discard(d.name + f.name)
                    except OSError:
                        pass

    def list(self, limit=50):
        with self.lock:
            return list(reversed(self._metas()))[:max(1, limit)]

    def diff(self, cid):
        """Vergleicht den Kontrollpunkt mit dem jetzigen Stand des Ordners."""
        with self.lock:
            man = self._load(cid)
            base, cur = man["files"], self._scan(False)
            return {"id": man["id"], "time": man["time"], "label": man.get("label", ""),
                    "changed": sorted(p for p in cur if p in base and base[p][0] != cur[p][0]),
                    "added": sorted(p for p in cur if p not in base),
                    "removed": sorted(p for p in base if p not in cur)}

    def _key(self, client_path):
        p = str(client_path or "").replace("\\", "/")
        return p if p.startswith(self.prj.name + "/") else self.prj.name + "/" + p.lstrip("/")

    def file(self, cid, client_path):
        with self.lock:
            ent = self._load(cid)["files"].get(self._key(client_path))
            if not ent:
                raise FileNotFoundError("Datei war im Kontrollpunkt nicht enthalten")
            return decode_text(self._blob(ent[0]).read_bytes())

    def restore(self, cid, paths=None):
        """Setzt den Ordner (oder einzelne Dateien) auf den Kontrollpunkt zurück: geänderte Dateien bekommen den alten Inhalt,
        seither angelegte werden gelöscht, gelöschte kommen wieder. Der jetzige Stand wird vorher als Schnappschuss gesichert."""
        with self.lock:
            man, d = self._load(cid), self.diff(cid)
            sel = {self._key(p) for p in paths} if paths else None
            plan = []
            for p in d["changed"] + d["removed"]:
                if sel is None or p in sel:
                    plan.append(("write", self.patches._path(p), self._blob(man["files"][p][0]).read_bytes()))
            for p in d["added"]:
                if sel is None or p in sel:
                    plan.append(("delete", self.patches._path(p), None))
            if not plan:
                return {"ok": True, "files": [], "snapshot": None, "restored": cid}
            out = self.patches.apply_plan(plan, "vor Zurücksetzen auf Kontrollpunkt " + cid, "checkpoint")
            out["restored"] = cid
            return out


# ------------------------------------------------------------------ KI-Agenten (Claude Code)
AGENT_MODES = ("plan", "ask", "acceptEdits")
HOOK_EVENTS = ("UserPromptSubmit", "PreToolUse", "PostToolUse", "PostToolUseFailure", "Stop", "SubagentStop", "Notification", "SessionEnd")
HOOK_MARK = "codeatlas"
PERM_TIMEOUT = 300
UPLOAD_MAX = 10_000_000                    # je Anhang
IMG_INLINE = {"image/png", "image/jpeg", "image/gif", "image/webp"}
IMG_INLINE_MAX = 3_700_000                 # größere Bilder gehen nur als Datei-Pfad an die KI (API-Grenze ~5 MB Base64)
MUTATING = {"Bash", "PowerShell", "Edit", "MultiEdit", "Write", "NotebookEdit"}
QUIET_RESULT = {"Read", "Edit", "MultiEdit", "Write", "NotebookEdit", "TodoWrite"}


def cut(s, n):
    if s is None:
        return ""
    if not isinstance(s, str):
        s = json.dumps(s, ensure_ascii=False)
    return s if len(s) <= n else s[:n] + f"… [+{len(s) - n} Zeichen]"


def patch_ranges(hunks):
    """structuredPatch (wie Claude Code es zu Edit/Write liefert) → geänderte Zeilenbereiche der neuen Datei."""
    marks = set()
    for h in hunks[:200]:
        if not isinstance(h, dict):
            continue
        n = int(h.get("newStart") or 1)
        for ln in h.get("lines") or []:
            c = ln[:1]
            if c == "+":
                marks.add(n)
                n += 1
            elif c == "-":
                marks.add(max(1, n))
            elif c != "\\":
                n += 1
    out = []
    for m in sorted(marks):
        if out and m <= out[-1][1] + 1:
            out[-1][1] = m
        else:
            out.append([m, m])
    return out[:60]


def detect_agents(extra):
    """Claude Code suchen; weitere Agenten kommen als Preset von der Kommandozeile (--agent "Name=Befehl") – nie aus dem Browser."""
    cands = ([r"%USERPROFILE%\.local\bin\claude.exe", r"%APPDATA%\npm\claude.cmd", r"%LOCALAPPDATA%\Programs\claude\claude.exe"] if IS_WIN
             else [os.path.expanduser("~/.local/bin/claude"), os.path.expanduser("~/.claude/local/claude")])
    exe = find_exe(["claude"], cands)
    out = [{"id": "0", "label": "Claude Code", "argv": [exe or "claude"], "found": bool(exe), "kind": "claude", "cmd": exe or "claude"}]
    for i, spec in enumerate(extra or []):
        name, _, cmd = spec.partition("=")
        if not cmd.strip():
            continue
        argv = [a.strip('"') for a in shlex.split(cmd.strip(), posix=not IS_WIN)]
        exe = find_exe([argv[0]]) or (argv[0] if os.path.isfile(argv[0]) else None)
        kind = "claude" if "claude" in os.path.basename(argv[0]).lower() else "text"
        out.append({"id": str(i + 1), "label": name.strip() or argv[0], "argv": [exe or argv[0]] + argv[1:], "found": bool(exe), "kind": kind, "cmd": cmd.strip()})
    return out


def popen_agent(argv, cwd, env):
    cmd = argv
    if IS_WIN and argv[0].lower().endswith((".cmd", ".bat")):
        if any(ch in a for a in argv for ch in '"%&|<>^'):
            raise ValueError("Der Befehl enthält Sonderzeichen, die über eine .cmd-Datei nicht sicher übergeben werden können")
        cmd = 'cmd /d /s /c "' + subprocess.list2cmdline(argv) + '"'
    return subprocess.Popen(cmd, cwd=cwd, env=env, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                            creationflags=0x00000200 if IS_WIN else 0, start_new_session=not IS_WIN)


def kill_tree(p, soft=False):
    if not p or p.poll() is not None:
        return
    try:
        if IS_WIN:
            subprocess.run(["taskkill", "/F", "/T", "/PID", str(p.pid)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        else:
            os.killpg(os.getpgid(p.pid), 2 if soft else 15)
    except Exception:
        try:
            p.kill()
        except Exception:
            pass


SKILL_NAME = re.compile(r"^[a-z0-9][a-z0-9-]{0,63}$")
MODEL_NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:\[\]-]{0,79}$")     # Alias (fable, opus, sonnet, haiku …) oder voller Modellname
EFFORTS = ("low", "medium", "high", "xhigh", "max")
ANSI = re.compile(r"\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b\[[0-9;?]*[A-Za-z]")


class Account:
    """Konto von Claude Code: Status anzeigen, an- und abmelden. Läuft über die offiziellen Befehle
    `claude auth status|login|logout` – Zugangsdaten bleiben bei Claude Code, die Bridge sieht sie nie."""

    def __init__(self, exe, prj):
        self.exe, self.prj, self.lock = exe, prj, threading.RLock()
        self.cache, self.cache_t, self.login = None, 0.0, None

    def _run(self, *args, timeout=25):
        p = popen_agent([self.exe, *args], str(self.prj.root), dict(os.environ))
        try:
            out, _ = p.communicate(timeout=timeout)
        except subprocess.TimeoutExpired:
            kill_tree(p)
            raise ValueError("Claude Code antwortet nicht (%s)" % " ".join(args))
        return p.returncode, decode_text(out or b"")["text"]

    def status(self, fresh=False):
        with self.lock:
            if not fresh and self.cache and time.time() - self.cache_t < 30:
                return self.cache
        try:
            code, out = self._run("auth", "status", "--json")
            m = re.search(r"\{.*\}", out, re.S)
            st = json.loads(m.group(0)) if m else {"loggedIn": False, "error": cut(out.strip(), 300) or "keine Antwort"}
        except (OSError, ValueError) as e:
            st = {"loggedIn": False, "error": str(e)}
        with self.lock:
            self.cache, self.cache_t = st, time.time()
        return st

    def state(self, fresh=False):
        with self.lock:
            lg = dict(self.login, proc=None) if self.login else None
        if lg:
            lg.pop("proc", None)
        return {"status": self.status(fresh), "login": lg}

    def start_login(self, console=False, email=""):
        with self.lock:
            if self.login and self.login["state"] == "läuft":
                return self.state()
            args = ["auth", "login", "--console" if console else "--claudeai"]
            if email and re.match(r"^[^@\s]+@[^@\s]+$", str(email)):
                args += ["--email", str(email)]
            proc = popen_agent([self.exe, *args], str(self.prj.root), dict(os.environ))
            self.login = {"state": "läuft", "lines": [], "url": "", "proc": proc, "t0": time.time(), "console": bool(console)}
        threading.Thread(target=self._pump, args=(self.login,), daemon=True).start()
        return self.state()

    def _pump(self, lg):
        proc, buf = lg["proc"], b""
        while True:
            ch = proc.stdout.read1(4096) if hasattr(proc.stdout, "read1") else proc.stdout.read(1)
            if not ch:
                break
            buf += ch
            text = ANSI.sub("", decode_text(buf)["text"])
            with self.lock:
                lg["lines"] = [l for l in text.replace("\r", "\n").split("\n") if l.strip()][-30:]
                m = re.search(r"https://\S+", text)
                if m and not lg["url"]:
                    lg["url"] = m.group(0).rstrip(").,]")
            if time.time() - lg["t0"] > 900:
                kill_tree(proc)
                break
        code = proc.wait()
        with self.lock:
            lg["state"] = "fertig" if code == 0 else ("abgebrochen" if lg["state"] == "abbrechen" else "fehlgeschlagen")
            lg["code"] = code
            self.cache = None
        self.status(fresh=True)

    def send_code(self, code):
        with self.lock:
            lg = self.login
            if not lg or lg["state"] != "läuft":
                raise ValueError("Keine Anmeldung offen")
            try:
                lg["proc"].stdin.write((str(code).strip() + "\n").encode("utf-8"))
                lg["proc"].stdin.flush()
            except OSError as e:
                raise ValueError("Code konnte nicht übergeben werden: %s" % e)
        return {"ok": True}

    def cancel(self):
        with self.lock:
            lg = self.login
            if lg and lg["state"] == "läuft":
                lg["state"] = "abbrechen"
                kill_tree(lg["proc"])
        return {"ok": True}

    def logout(self):
        code, out = self._run("auth", "logout")
        with self.lock:
            self.cache = None
        return {"ok": code == 0, "output": cut(ANSI.sub("", out).strip(), 500), "status": self.status(True)}


def _frontmatter(text):
    """Kopf einer SKILL.md / Befehlsdatei: einfache YAML-Schlüssel (name, description …), auch > und | Blöcke."""
    m = re.match(r"^\ufeff?---\s*\n(.*?)\n---\s*(?:\n|$)", text, re.S)
    if not m:
        return {}, text
    meta, key, buf = {}, None, []
    for line in m.group(1).split("\n"):
        km = re.match(r"^([A-Za-z][\w-]*):\s*(.*)$", line)
        if km and not line.startswith((" ", "\t")):
            if key:
                meta[key] = " ".join(buf).strip()
            key, v = km.group(1).lower(), km.group(2).strip()
            buf = [] if v in (">", "|", ">-", "|-", "") else [v.strip("\"'")]
        elif key:
            buf.append(line.strip())
    if key:
        meta[key] = " ".join(buf).strip()
    return meta, text[m.end():]


class SkillBook:
    """Skills und Befehle, die Claude Code kennt: im Projekt (.claude/skills, .claude/commands), persönlich (~/.claude/…)
    und aus installierten Plugins. Claude Code meldet beim Start selbst, welche Namen aktiv sind – das wird gemerkt und
    ergänzt die Suche im Dateisystem (z. B. eingebaute Skills ohne Datei)."""

    def __init__(self, prj):
        self.prj = prj
        self.home = Path.home() / ".claude"
        self.cache = prj.root / ".codeatlas" / "claude-init.json"
        try:
            self.init = json.loads(self.cache.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            self.init = {}

    def learn(self, o):
        """Init-Ereignis von Claude Code: aktive Skills, Befehle und Plugin-Pfade."""
        info = {"skills": [str(x) for x in (o.get("skills") or [])][:2000],
                "slash": [str(x) for x in (o.get("slash_commands") or [])][:3000],
                "plugins": [{"name": str(p.get("name") or ""), "path": str(p.get("path") or "")} for p in (o.get("plugins") or []) if isinstance(p, dict)][:500],
                "time": time.time()}
        if info["skills"] or info["slash"]:
            self.init = info
            try:
                self.cache.parent.mkdir(parents=True, exist_ok=True)
                self.cache.write_text(json.dumps(info), encoding="utf-8")
            except OSError:
                pass

    def _plugin_dirs(self):
        seen, out = set(), []
        def add(name, path):
            p = Path(path)
            if path and p.is_dir() and str(p) not in seen:
                seen.add(str(p))
                out.append((name or p.name, p))
        for pl in self.init.get("plugins") or []:
            add(pl["name"], pl["path"])
        ip = self.home / "plugins" / "installed_plugins.json"
        try:
            data = json.loads(ip.read_text(encoding="utf-8"))
            plugs = data.get("plugins", data) if isinstance(data, dict) else {}
            for key, val in plugs.items():
                for ent in (val if isinstance(val, list) else [val]):
                    if isinstance(ent, dict):
                        add(str(key).split("@")[0], ent.get("installPath") or ent.get("path") or "")
        except (OSError, ValueError, AttributeError):
            pass
        return out

    def _read(self, f, name, scope, kind, plugin=""):
        try:
            text = f.read_text(encoding="utf-8", errors="replace")[:20000]
        except OSError:
            return None
        meta, body = _frontmatter(text)
        desc = meta.get("description") or next((l.strip("# ").strip() for l in body.split("\n") if l.strip()), "")
        return {"name": name, "desc": cut(desc, 400), "scope": scope, "kind": kind, "plugin": plugin, "path": str(f),
                "editable": scope in ("projekt", "persönlich"), "hint": meta.get("argument-hint", "")}

    def scan(self):
        out, names = [], set()
        def add(e):
            if e and e["name"] not in names:
                names.add(e["name"]); out.append(e)
        for base, scope in ((self.prj.root / ".claude", "projekt"), (self.home, "persönlich")):
            for f in sorted(base.glob("skills/*/SKILL.md")):
                add(self._read(f, f.parent.name, scope, "skill"))
            for f in sorted(base.glob("commands/**/*.md")):
                rel = f.relative_to(base / "commands").with_suffix("").as_posix().replace("/", ":")
                add(self._read(f, rel, scope, "befehl"))
        for pname, pdir in self._plugin_dirs():
            for f in sorted(pdir.glob("skills/*/SKILL.md")):
                add(self._read(f, pname + ":" + f.parent.name, "plugin", "skill", pname))
            for f in sorted(pdir.glob("commands/*.md")):
                add(self._read(f, pname + ":" + f.stem, "plugin", "befehl", pname))
        active = set(self.init.get("skills") or []) | set(self.init.get("slash") or [])
        for e in out:
            e["active"] = (e["name"] in active) if active else None
        for n in self.init.get("skills") or []:      # eingebaut / sonst unbekannter Herkunft
            if n not in names:
                names.add(n)
                out.append({"name": n, "desc": "", "scope": "eingebaut", "kind": "skill", "plugin": n.split(":")[0] if ":" in n else "",
                            "path": "", "editable": False, "active": True, "hint": ""})
        return {"skills": out, "known": bool(active), "dirs": {"projekt": str(self.prj.root / ".claude" / "skills"), "persönlich": str(self.home / "skills")}}

    def _dir(self, scope, name):
        if not SKILL_NAME.match(str(name or "")):
            raise ValueError("Name: nur Kleinbuchstaben, Ziffern und Bindestriche, höchstens 64 Zeichen (z. B. sps-doku)")
        base = (self.prj.root / ".claude" / "skills") if scope == "projekt" else (self.home / "skills") if scope == "persönlich" else None
        if base is None:
            raise ValueError("Ort muss „projekt“ oder „persönlich“ sein")
        return base / name

    def create(self, scope, name, desc, body, overwrite=False):
        d = self._dir(scope, name)
        desc = " ".join(str(desc or "").split())
        if not desc:
            raise ValueError("Beschreibung fehlt – sie entscheidet, wann Claude den Skill benutzt")
        f = d / "SKILL.md"
        if f.exists() and not overwrite:
            raise ValueError("Skill „%s“ gibt es dort schon" % name)
        d.mkdir(parents=True, exist_ok=True)
        text = "---\nname: %s\ndescription: %s\n---\n\n%s\n" % (name, desc.replace("\n", " "), str(body or "").strip() or "# " + name)
        tmp = f.with_suffix(".tmp")
        tmp.write_text(text, encoding="utf-8")
        os.replace(tmp, f)
        return {"ok": True, "name": name, "path": str(f)}

    def _find(self, name):
        e = next((x for x in self.scan()["skills"] if x["name"] == name), None)
        if not e or not e["path"]:
            raise ValueError("Skill unbekannt")
        return e

    def read(self, name):
        e = self._find(name)
        return dict(e, content=Path(e["path"]).read_text(encoding="utf-8", errors="replace")[:200000])

    def save(self, name, content):
        e = self._find(name)
        if not e["editable"]:
            raise ValueError("Plugin- und eingebaute Skills sind schreibgeschützt")
        f = Path(e["path"])
        tmp = f.with_suffix(".tmp")
        tmp.write_text(str(content or ""), encoding="utf-8")
        os.replace(tmp, f)
        return {"ok": True, "name": name}


class AgentHub:
    """Macht sichtbar, was ein KI-Agent im Projekt tut.

    Zwei Wege führen hinein: (1) Der Atlas startet Claude Code selbst (`claude -p … --output-format stream-json`) und liest dessen
    Ereignisstrom. (2) Eine Claude-Code-Sitzung im Terminal meldet sich über Hooks (`python codeatlas_bridge.py --hook`).
    Beides wird in ein einheitliches, kompaktes Ereignisformat übersetzt und per SSE an die Oberfläche verteilt. Vor jedem Auftrag
    entsteht ein Kontrollpunkt – die Änderungen selbst liest der Atlas vom Dateisystem, nicht aus den Angaben der KI."""

    def __init__(self, prj: Project, cps: CheckpointStore, watcher, agents, port, host="127.0.0.1"):
        self.prj, self.cps, self.watcher, self.agents = prj, cps, watcher, agents
        self.url = f"http://{host}:{port}"
        self.lock, self.clients, self.history = threading.RLock(), [], []
        self.seq = self.turn = 0
        self.run, self.session, self.own = None, None, set()
        self.ext, self.pending, self.auto_allow = {}, {}, set()
        self.uploads, self.msg_seq = {}, 0
        self.default_model = ""
        self.mcp = True      # Test-Werkzeuge (MCP-Server „codeatlas“) an Claude Code geben – aus mit --no-mcp
        self.tsess = self.graph = self.rules = self.presets = None   # für das Qualitätstor, in main gesetzt
        self.skills = None   # SkillBook, wird in main gesetzt
        self.up_dir = prj.root / ".codeatlas" / "uploads"
        self.hook_token = secrets.token_hex(16)
        self.settings_file = prj.root / ".claude" / "settings.local.json"
        self.bridge_file = prj.root / ".codeatlas" / "bridge.json"

    # --- Ereignisse verteilen
    def emit(self, obj, keep=True):
        with self.lock:
            self.seq += 1
            obj["n"], obj["t"] = self.seq, int(time.time() * 1000)
            if keep:
                last = self.history[-1] if self.history else None
                if obj["k"] == "text" and "d" in obj and last and last["k"] == "text" and "d" in last and last.get("mid") == obj.get("mid") and last.get("turn") == obj.get("turn"):
                    last["d"] += obj["d"]          # Textschnipsel für spätere Abonnenten zusammenziehen
                else:
                    self.history.append(dict(obj))
                    if len(self.history) > 5000:
                        del self.history[:1000]
            msg = json.dumps(obj, ensure_ascii=False, separators=(",", ":"))
            for q in self.clients:
                try:
                    q.put_nowait(msg)
                except queue.Full:
                    pass

    def subscribe(self):
        q = queue.Queue(maxsize=30000)
        with self.lock:
            q.put(json.dumps(dict(self.state(), k="state"), ensure_ascii=False))
            for o in self.history:
                q.put(json.dumps(o, ensure_ascii=False, separators=(",", ":")))
            self.clients.append(q)
        return q

    def unsubscribe(self, q):
        with self.lock:
            if q in self.clients:
                self.clients.remove(q)

    def state(self):
        with self.lock:
            return {"agents": [{"id": a["id"], "label": a["label"], "found": a["found"], "kind": a["kind"], "cmd": a["cmd"]} for a in self.agents],
                    "model": self.default_model,
                    "modes": list(AGENT_MODES), "running": self.run["turn"] if self.run else 0, "turn": self.turn, "resume": bool(self.session),
                    "hooks": self.hooks_status(), "pending": [dict(p["info"]) for p in self.pending.values()], "seq": self.seq}

    # --- Werkzeug-Aufrufe in ein kompaktes Format bringen
    def _path_info(self, fp):
        try:
            p = Path(str(fp))
            full = Path(os.path.normpath(str(p if p.is_absolute() else self.prj.root / p)))
            try:
                rel = full.resolve().relative_to(self.prj.root)
            except (ValueError, OSError):
                rel = full.relative_to(self.prj.root)
            if rel.as_posix() in (".", ""):
                return {"path": self.prj.name, "dir": True}
            return {"path": self.prj.name + "/" + rel.as_posix()}
        except (ValueError, OSError):
            return {"abs": str(fp), "outside": True}

    def _tool_info(self, name, inp):
        inp, o = inp if isinstance(inp, dict) else {}, {}
        fp = inp.get("file_path") or inp.get("notebook_path") or (inp.get("path") if name in ("Grep", "Glob", "LS") else None)
        if fp:
            o.update(self._path_info(fp))
        if name in ("Bash", "PowerShell"):
            o["cmd"], o["desc"] = cut(inp.get("command"), 4000), cut(inp.get("description"), 300)
            if inp.get("run_in_background"):
                o["bg"] = True
        elif name == "Read":
            if inp.get("offset") or inp.get("limit"):
                o["from"] = int(inp.get("offset") or 1)
                if inp.get("limit"):
                    o["to"] = o["from"] + int(inp["limit"]) - 1
        elif name == "Edit":
            o["old"], o["new"] = cut(inp.get("old_string"), 6000), cut(inp.get("new_string"), 6000)
            if inp.get("replace_all"):
                o["all"] = True
        elif name == "MultiEdit":
            o["edits"] = [{"old": cut(e.get("old_string"), 3000), "new": cut(e.get("new_string"), 3000)} for e in (inp.get("edits") or [])[:20] if isinstance(e, dict)]
        elif name == "Write":
            c = inp.get("content") or ""
            o["len"], o["rows"], o["head"] = len(c), c.count("\n") + 1, cut(c, 1500)
        elif name in ("Grep", "Glob"):
            o["pat"] = cut(inp.get("pattern"), 300)
            if inp.get("glob"):
                o["glob"] = cut(inp.get("glob"), 120)
        elif name in ("Task", "Agent"):
            o["desc"], o["sub"], o["prompt"] = cut(inp.get("description"), 200), cut(inp.get("subagent_type"), 60), cut(inp.get("prompt"), 1500)
        elif name == "WebFetch":
            o["url"] = cut(inp.get("url"), 400)
        elif name == "WebSearch":
            o["pat"] = cut(inp.get("query"), 300)
        elif name in ("TodoWrite", "TaskCreate", "TaskUpdate"):
            todos = inp.get("todos")
            if isinstance(todos, list):
                o["todos"] = [{"text": cut(x.get("content"), 160), "st": x.get("status")} for x in todos[:40] if isinstance(x, dict)]
            else:
                o["desc"] = cut(inp.get("subject") or inp.get("status") or "", 200)
        elif name == "ExitPlanMode":
            o["plan"] = cut(inp.get("plan"), 16000)
        elif name in ("Skill", "SlashCommand"):
            o["skill"] = cut(inp.get("skill") or inp.get("command") or inp.get("name") or "", 120)
            if inp.get("args"):
                o["args"] = cut(inp.get("args"), 600)
        elif name.startswith("mcp__codeatlas__"):
            if name.endswith("tests_run") or name.endswith("tests_last"):
                sp = str(inp.get("sprache") or "")
                o["desc"] = ("Tests „" + cut(inp.get("filter"), 60) + "“" if inp.get("filter") else "alle Tests") + (" · " + sp if sp and sp != "alle" else "")
        elif inp:
            o["args"] = cut(inp, 600)
        return o

    def _result_info(self, name, content, is_error, tur):
        o, txt = {"ok": not is_error}, ""
        if isinstance(content, str):
            txt = content
        elif isinstance(content, list):
            txt = "\n".join(b.get("text", "") for b in content if isinstance(b, dict) and b.get("type") == "text")
        if isinstance(tur, dict):
            if isinstance(tur.get("stdout"), str) or isinstance(tur.get("stderr"), str):
                so, se = tur.get("stdout") or "", tur.get("stderr") or ""
                txt = so + ("\n" if so and se else "") + se
                if tur.get("interrupted"):
                    o["interrupted"] = True
            sp = tur.get("structuredPatch")
            if isinstance(sp, list) and sp:
                o["lines"] = patch_ranges(sp)
            if tur.get("type") == "create":
                o["created"] = True
            f = tur.get("file")
            if isinstance(f, dict) and f.get("startLine"):
                o["from"] = int(f["startLine"])
                o["to"] = o["from"] + max(0, int(f.get("numLines") or 1) - 1)
        elif isinstance(tur, str) and not txt:
            txt = tur
        txt = re.sub(r"</?tool_use_error>", "", txt or "").strip()
        if txt and (is_error or name not in QUIET_RESULT):
            o["res"] = cut(txt, 6000)
        return o

    # --- Weg 1: Claude Code aus dem Atlas starten
    # --- Anhänge (Bilder, Dateien): liegen unter .codeatlas/uploads, Bilder gehen zusätzlich direkt als Bild an Claude Code
    def upload(self, name, mime, data):
        try:
            raw = base64.b64decode(data or "", validate=False)
        except (ValueError, TypeError):
            raise ValueError("Anhang nicht lesbar")
        if not raw:
            raise ValueError("Anhang ist leer")
        if len(raw) > UPLOAD_MAX:
            raise ValueError("Anhang zu groß (höchstens %d MB)" % (UPLOAD_MAX // 1_000_000))
        base = re.sub(r"[^\w.\-]+", "_", Path(str(name or "datei")).name).strip("._")[:80] or "datei"
        self.up_dir.mkdir(parents=True, exist_ok=True)
        uid = time.strftime("%Y%m%d-%H%M%S") + "-" + secrets.token_hex(2)
        f = self.up_dir / (uid + "-" + base)
        f.write_bytes(raw)
        mime = str(mime or "").lower() or mimetypes.guess_type(base)[0] or "application/octet-stream"
        info = {"id": uid, "name": base, "mime": mime, "size": len(raw), "path": f.relative_to(self.prj.root).as_posix(),
                "img": mime in IMG_INLINE}
        with self.lock:
            self.uploads[uid] = dict(info, file=f)
        return info

    def _content(self, prompt, att):
        """Nachricht für Claude Code bauen: Text (+ Hinweis auf die Anhänge mit Pfad) und Bilder als Bild-Blöcke."""
        files = [self.uploads[a] for a in (att or [])[:20] if a in self.uploads]
        text, blocks, lines = prompt, [], []
        for u in files:
            kb = u["size"] / 1024
            size = ("%.1f MB" % (kb / 1024)).replace(".", ",") if kb >= 1024 else "%d kB" % max(1, round(kb))
            inline = u["img"] and u["size"] <= IMG_INLINE_MAX
            lines.append(f"- {u['path']} ({u['name']}, {size}{', als Bild beigefügt' if inline else ''})")
            if inline:
                blocks.append({"type": "image", "source": {"type": "base64", "media_type": u["mime"],
                                                           "data": base64.b64encode(u["file"].read_bytes()).decode("ascii")}})
        if lines:
            text = (text + "\n\n" if text else "") + "Angehängte Dateien (liegen im Projektordner):\n" + "\n".join(lines)
        pub = [{k: u[k] for k in ("id", "name", "mime", "size", "path", "img")} for u in files]
        return text, [{"type": "text", "text": text}] + blocks, pub

    def _msg(self, content):
        return (json.dumps({"type": "user", "message": {"role": "user", "content": content}}, ensure_ascii=False) + "\n").encode("utf-8")

    def start(self, agent_id, prompt, mode, fresh=False, attachments=None, model=None, effort=None, gate=None):
        model = str(model or self.default_model or "").strip()
        if model and not MODEL_NAME.match(model):
            raise ValueError("Modellname ungültig")
        effort = str(effort or "").strip().lower()
        prompt = str(prompt or "").strip()
        if not prompt and not attachments:
            raise ValueError("Auftrag fehlt")
        if len(prompt) > 200_000:
            raise ValueError("Auftrag zu lang")
        with self.lock:
            if self.run:
                raise RuntimeError("Es läuft bereits ein Auftrag")
            ag = next((a for a in self.agents if a["id"] == str(agent_id)), None) or self.agents[0]
            if not ag["found"]:
                raise ValueError(f"{ag['label']} wurde nicht gefunden ({ag['cmd']}). Claude Code installieren oder die Bridge mit --agent \"Name=Befehl\" starten.")
            if mode not in AGENT_MODES:
                mode = "acceptEdits"
            if fresh:
                self.session = None
                self.auto_allow.clear()
            self.turn += 1
            run = self.run = {"turn": self.turn, "agent": ag, "mode": mode, "t0": time.time(), "stop": False, "proc": None, "sid": self.session,
                              "result": False, "tools": {}, "streamed": set(), "blocks": {}, "mid": "", "err": []}
        text, content, pub = self._content(prompt, attachments)
        run.update(content=content, sent=1, acked=0, open=False, queue=[], cost=0.0, steps=0, model=model,
                   effort=effort if effort in EFFORTS else "", gate={k: bool(v) for k, v in (gate or {}).items() if k in ("tests", "build", "rules")} if isinstance(gate, dict) else {},
                   gate_n=0, mut_t=0.0)
        if not any(run["gate"].values()):
            run["gate"] = {}
        try:
            label = re.sub(r"^\[Kontext aus dem Diagramm:[^\]]*\]\s*", "", prompt) or ("Anhang: " + ", ".join(u["name"] for u in pub))
            cp = self.cps.create(label[:120], "ki")
        except Exception:
            with self.lock:
                self.run = None
            raise
        self.emit({"k": "turn", "ph": "start", "turn": run["turn"], "src": "atlas", "prompt": cut(prompt, 20000), "cp": cp["id"], "mode": mode,
                   "agent": ag["label"], "resume": bool(run["sid"]), "files": pub, "model": run.get("model") or "", "effort": run.get("effort") or ""})
        threading.Thread(target=self._run, args=(run, text), daemon=True).start()
        return {"ok": True, "turn": run["turn"], "cp": cp["id"]}

    def send(self, prompt, attachments=None):
        """Nachricht während eines laufenden Auftrags – wie im Terminal: Claude Code nimmt sie beim nächsten Schritt auf.
        Ist der Auftrag schon am Abschließen (oder der Agent kann keinen Eingabestrom), wird sie zum nächsten Auftrag."""
        prompt = str(prompt or "").strip()
        if not prompt and not attachments:
            raise ValueError("Nachricht fehlt")
        text, content, pub = self._content(prompt, attachments)
        with self.lock:
            run = self.run
            if not run:
                return None                 # nichts läuft – die Oberfläche startet einen normalen Auftrag
            self.msg_seq += 1
            mid = self.msg_seq
            p = run.get("proc")
            if run["open"] and p and p.poll() is None and not run["stop"]:
                try:
                    p.stdin.write(self._msg(content))
                    p.stdin.flush()
                    run["sent"] += 1
                    ph = "sent"
                except (OSError, ValueError):
                    ph = "queued"
            else:
                ph = "queued"
            if ph == "queued":
                run["queue"].append((prompt, list(attachments or [])))
            self.emit({"k": "user", "ph": ph, "turn": run["turn"], "id": mid, "text": cut(prompt, 20000), "files": pub})
        return {"ok": True, "ph": ph, "id": mid}

    def _close_input(self, run):
        with self.lock:
            if not run["open"]:
                return
            run["open"] = False
            try:
                run["proc"].stdin.close()
            except (OSError, ValueError, AttributeError):
                pass

    def _hook_cmd(self, **extra):
        return dict({"type": "command", "command": sys.executable, "args": [str(Path(__file__).resolve()), "--hook", HOOK_MARK]}, **extra)

    def _argv(self, run):
        ag = run["agent"]
        argv, own = list(ag["argv"]), " ".join(ag["argv"][1:])
        if ag["kind"] != "claude":
            return argv
        argv += ["-p", "--output-format", "stream-json", "--verbose", "--include-partial-messages",
                 "--input-format", "stream-json", "--replay-user-messages"]   # Eingabe bleibt offen: Nachrichten während der Arbeit
        if "--permission-mode" not in own and "--dangerously-skip-permissions" not in own and run["mode"] in ("plan", "acceptEdits"):
            argv += ["--permission-mode", run["mode"]]
        if run.get("model") and "--model" not in own:
            argv += ["--model", run["model"]]
        if run.get("effort") and "--effort" not in own:
            argv += ["--effort", run["effort"]]
        if run["sid"] and "--resume" not in own and "--continue" not in own:
            argv += ["--resume", run["sid"]]
        if self.mcp and "--mcp-config" not in own:
            # Test-Werkzeuge: Claude führt Tests im Atlas aus und bekommt Fehlerorte statt Konsolentext
            mf = self.prj.root / ".codeatlas" / "mcp.json"
            mf.parent.mkdir(exist_ok=True)
            mf.write_text(json.dumps({"mcpServers": {"codeatlas": {"type": "stdio", "command": sys.executable, "args": [str(Path(__file__).resolve()), "--mcp"],
                                                                   "env": {"CODEATLAS_PROJECT": str(self.prj.root)}}}}, indent=1), "utf-8")
            argv += ["--mcp-config", str(mf)]
        if self.mcp and "--append-system-prompt" not in own and "--system-prompt" not in own:
            argv += ["--append-system-prompt", " ".join(AGENT_PROMPT.split("\n"))]
        if "--settings" not in own:
            # Rückfragen von Claude Code („darf ich diesen Befehl ausführen?“) landen als Freigabe-Karte im Atlas
            sf = self.prj.root / ".codeatlas" / "agent-settings.json"
            sf.parent.mkdir(exist_ok=True)
            cfg = {"hooks": {"PermissionRequest": [{"hooks": [self._hook_cmd(timeout=PERM_TIMEOUT + 30)]}]}}
            if run.get("gate"):   # Qualitätstor: vor dem „fertig“ prüft der Atlas Tests/Build/Regeln; scheitert etwas, arbeitet Claude weiter
                cfg["hooks"]["Stop"] = [{"hooks": [self._hook_cmd(timeout=900)]}]
            if self.mcp:
                cfg["permissions"] = {"allow": ["mcp__codeatlas"]}   # Tests ausführen ohne Rückfrage (laufen ohnehin sichtbar im Atlas)
            sf.write_text(json.dumps(cfg, indent=1), "utf-8")
            argv += ["--settings", str(sf)]
        return argv

    def _run(self, run, prompt):
        turn, proc, code = run["turn"], None, None
        try:
            env = dict(os.environ, CODEATLAS_HOOK_URL=self.url, CODEATLAS_HOOK_TOKEN=self.hook_token, CODEATLAS_HOOK_BLOCK="1", PYTHONIOENCODING="utf-8",
                       CODEATLAS_GATE="1" if run.get("gate") else "0")
            proc = run["proc"] = popen_agent(self._argv(run), str(self.prj.root), env)
        except (OSError, ValueError) as e:
            self.emit({"k": "turn", "ph": "end", "turn": turn, "ok": False, "reason": "Start fehlgeschlagen", "text": str(e)})
            self._finish(run)
            return

        def errs():
            for raw in iter(proc.stderr.readline, b""):
                line = raw.decode("utf-8", "replace").rstrip()
                if line:
                    run["err"].append(line)
                    del run["err"][:-60]
                    self.emit({"k": "note", "turn": turn, "lvl": "warn", "text": cut(line, 600)})
            proc.stderr.close()

        threading.Thread(target=errs, daemon=True).start()
        claude = run["agent"]["kind"] == "claude"
        try:
            if claude:
                proc.stdin.write(self._msg(run["content"]))
                proc.stdin.flush()
                run["open"] = True
            else:
                proc.stdin.write(prompt.encode("utf-8"))
                proc.stdin.close()
        except OSError:
            pass
        for raw in iter(proc.stdout.readline, b""):
            line = raw.decode("utf-8", "replace")
            if not claude:
                self.emit({"k": "text", "turn": turn, "mid": "out", "d": line})
                continue
            line = line.strip()
            if not line.startswith("{"):
                if line:
                    self.emit({"k": "note", "turn": turn, "lvl": "info", "text": cut(line, 600)})
                continue
            try:
                self._on_stream(run, json.loads(line))
            except Exception as e:   # ein unerwartetes Ereignis darf den Lauf nicht abbrechen
                self.emit({"k": "note", "turn": turn, "lvl": "warn", "text": "Ereignis nicht lesbar: " + cut(str(e), 200)}, keep=False)
        proc.stdout.close()
        self._close_input(run)
        try:
            code = proc.wait(timeout=30)
        except subprocess.TimeoutExpired:
            kill_tree(proc)
            code = proc.wait()
        if not run["result"]:
            ok = code == 0 and not run["stop"] and not claude
            reason = "abgebrochen" if run["stop"] else ("" if ok else f"Prozess endete mit Code {code}")
            self.emit({"k": "turn", "ph": "end", "turn": turn, "ok": ok, "reason": reason, "ms": int((time.time() - run["t0"]) * 1000),
                       "text": "" if ok or run["stop"] else cut("\n".join(run["err"][-12:]), 3000)})
        self._finish(run)

    def _finish(self, run):
        for pid in list(self.pending):
            self.decide(pid, False)
        with self.lock:
            if self.run is run:
                self.run = None
            queued = run.get("queue") or []
        self.watcher.kick()
        self.emit({"k": "idle", "turn": run["turn"]})
        if queued and not run["stop"]:     # zu spät gekommene Nachrichten werden zum nächsten Auftrag (gleiche Sitzung)
            prompt = "\n\n".join(q[0] for q in queued if q[0])
            att = [a for q in queued for a in q[1]]
            try:
                self.start(run["agent"]["id"], prompt, run["mode"], False, att, run.get("model"), run.get("effort"))
            except Exception as e:
                self.emit({"k": "note", "turn": run["turn"], "lvl": "warn", "text": "Nachricht konnte nicht gesendet werden: " + cut(str(e), 300)})
        elif queued:
            self.emit({"k": "note", "turn": run["turn"], "lvl": "info", "text": "Auftrag gestoppt – %d wartende Nachricht(en) verworfen" % len(queued)})

    def _on_stream(self, run, o):
        turn, t, par = run["turn"], o.get("type"), o.get("parent_tool_use_id")
        sid = o.get("session_id")
        if sid and sid not in self.own:
            self.own.add(sid)
            self.session = sid
        if t == "stream_event":
            ev = o.get("event") or {}
            et = ev.get("type")
            if et == "message_start":
                run["mid"], run["blocks"] = (ev.get("message") or {}).get("id") or "", {}
            elif et == "content_block_start":
                cb = ev.get("content_block") or {}
                if cb.get("type") == "tool_use":
                    run["blocks"][ev.get("index")] = {"id": cb.get("id"), "name": cb.get("name"), "buf": "", "sent": False}
                    self.emit({"k": "tool", "ph": "draft", "id": cb.get("id"), "turn": turn, "name": cb.get("name"), "par": par})
                elif cb.get("type") == "thinking":
                    self.emit({"k": "status", "turn": turn, "s": "thinking"}, keep=False)
            elif et == "content_block_delta":
                d = ev.get("delta") or {}
                if d.get("type") == "text_delta" and d.get("text"):
                    run["streamed"].add(run["mid"])
                    self.emit({"k": "text", "turn": turn, "mid": run["mid"], "d": d["text"], "par": par})
                elif d.get("type") == "input_json_delta":
                    b = run["blocks"].get(ev.get("index"))
                    if b and not b["sent"]:
                        b["buf"] += d.get("partial_json") or ""
                        m = re.search(r'"(?:file_path|notebook_path)"\s*:\s*"((?:[^"\\]|\\.)*)"', b["buf"])
                        if m:   # Ziel-Datei schon zeigen, während die KI den Inhalt noch schreibt
                            b["sent"] = True
                            try:
                                self.emit(dict({"k": "tool", "ph": "draft", "id": b["id"], "turn": turn, "name": b["name"], "par": par},
                                               **self._path_info(json.loads('"' + m.group(1) + '"'))))
                            except ValueError:
                                pass
        elif t == "assistant":
            msg = o.get("message") or {}
            for b in msg.get("content") or []:
                if not isinstance(b, dict):
                    continue
                if b.get("type") == "text" and (b.get("text") or "").strip() and msg.get("id") not in run["streamed"]:
                    self.emit({"k": "text", "turn": turn, "mid": msg.get("id") or "", "full": b["text"], "par": par})
                elif b.get("type") == "tool_use":
                    run["tools"][b.get("id")] = (b.get("name"), time.time())
                    self.emit(dict({"k": "tool", "ph": "start", "id": b.get("id"), "turn": turn, "name": b.get("name"), "par": par},
                                   **self._tool_info(b.get("name"), b.get("input"))))
        elif t == "user" and o.get("isReplay"):
            run["acked"] = run.get("acked", 0) + 1     # Claude Code hat eine Nachricht von uns aufgenommen
            if run["acked"] > 1:
                self.emit({"k": "user", "ph": "ack", "turn": turn})
        elif t == "user":
            content = (o.get("message") or {}).get("content")
            for b in content if isinstance(content, list) else []:
                if isinstance(b, dict) and b.get("type") == "tool_result":
                    name, t0 = run["tools"].get(b.get("tool_use_id"), (None, None))
                    self.emit(dict({"k": "tool", "ph": "end", "id": b.get("tool_use_id"), "turn": turn, "name": name, "par": par,
                                    "ms": int((time.time() - t0) * 1000) if t0 else None},
                                   **self._result_info(name, b.get("content"), b.get("is_error"), o.get("tool_use_result"))))
                    if name in MUTATING or name is None:
                        self.watcher.kick()
                        run["mut_t"] = time.time()
        elif t == "system":
            st = o.get("subtype")
            if st == "init":
                if self.skills:
                    self.skills.learn(o)
                self.emit({"k": "sess", "turn": turn, "sid": sid, "src": "atlas", "model": o.get("model"), "mode": o.get("permissionMode"),
                           "ver": o.get("claude_code_version"), "key": o.get("apiKeySource")})
            elif st == "status":
                self.emit({"k": "status", "turn": turn, "s": str(o.get("status") or "")}, keep=False)
            elif st == "thinking_tokens":
                self.emit({"k": "status", "turn": turn, "s": "thinking", "tok": o.get("estimated_tokens")}, keep=False)
            elif st == "task_summary" and o.get("detail"):
                self.emit({"k": "status", "turn": turn, "s": "task", "detail": cut(o.get("detail"), 200)}, keep=False)
            elif st == "api_retry":
                self.emit({"k": "note", "turn": turn, "lvl": "warn",
                           "text": f"API-Wiederholung {o.get('attempt')}/{o.get('max_retries')} ({o.get('error') or o.get('error_status')})"})
            elif st == "permission_denied":
                self.emit({"k": "tool", "ph": "end", "id": o.get("tool_use_id"), "turn": turn, "name": o.get("tool_name"), "ok": False, "denied": True,
                           "res": cut(o.get("message"), 1500)})
            elif st == "compact_boundary":
                self.emit({"k": "note", "turn": turn, "lvl": "info", "text": "Kontext wurde verdichtet"})
        elif t == "result":
            run["cost"] = run.get("cost", 0.0) + float(o.get("total_cost_usd") or 0)
            run["steps"] = run.get("steps", 0) + int(o.get("num_turns") or 0)
            with self.lock:   # prüfen und schließen in einem Zug – send() schreibt unter derselben Sperre
                if run.get("open") and run.get("acked", 0) < run.get("sent", 1) and not run["stop"]:
                    return     # eine Nachricht ist noch unterwegs – Claude Code antwortet darauf im selben Auftrag weiter
                self._close_input(run)
            run["result"] = True
            den = [dict({"name": d.get("tool_name"), "id": d.get("tool_use_id")}, **self._tool_info(d.get("tool_name"), d.get("tool_input")))
                   for d in (o.get("permission_denials") or [])[:20] if isinstance(d, dict)]
            self.emit({"k": "turn", "ph": "end", "turn": turn, "ok": not o.get("is_error"), "text": cut(o.get("result"), 20000), "ms": o.get("duration_ms"),
                       "cost": run.get("cost") or o.get("total_cost_usd"), "steps": run.get("steps") or o.get("num_turns"), "denied": den,
                       "reason": "abgebrochen" if run["stop"] else str(o.get("terminal_reason") or o.get("subtype") or "")})

    def stop(self):
        run = self.run
        if not run:
            return False
        run["stop"] = True
        for pid in list(self.pending):
            self.decide(pid, False)
        self._close_input(run)
        p = run["proc"]
        kill_tree(p, soft=True)          # erst höflich (Claude Code beendet den Zug sauber), dann hart

        def hard():
            for _ in range(30):
                if not p or p.poll() is not None:
                    return
                time.sleep(0.1)
            kill_tree(p)
        threading.Thread(target=hard, daemon=True).start()
        return True

    def reset(self):
        with self.lock:
            if self.run:
                raise RuntimeError("Es läuft noch ein Auftrag")
            self.history, self.session, self.ext = [], None, {}
            self.auto_allow.clear()
        self.emit({"k": "reset"}, keep=False)
        return {"ok": True}

    # --- Freigaben (Claude Code fragt, der Mensch entscheidet im Atlas)
    @staticmethod
    def _perm_key(name, inp):
        if name in ("Bash", "PowerShell"):
            words = str((inp or {}).get("command") or "").strip().split()
            return name + ":" + (words[0] if words else "")
        return str(name)

    @staticmethod
    def _verdict(allow, message=""):
        d = {"behavior": "allow"} if allow else {"behavior": "deny", "message": message or "Vom Nutzer in CodeAtlas abgelehnt."}
        return {"hookSpecificOutput": {"hookEventName": "PermissionRequest", "decision": d}}

    def permit(self, ev):
        """Blockiert, bis in der Oberfläche entschieden wurde (oder die Frist abläuft). Antwort = Entscheidung für Claude Code."""
        name, inp = ev.get("tool_name"), ev.get("tool_input") if isinstance(ev.get("tool_input"), dict) else {}
        run = self.run
        turn = run["turn"] if run else self.turn
        if name == "ExitPlanMode":
            return self._verdict(False, "Der Plan wird jetzt in CodeAtlas geprüft; die Umsetzung folgt als eigener Auftrag. "
                                        "Bitte nichts ändern und den Plan als Antwort ausgeben.")
        key = self._perm_key(name, inp)
        info = dict({"k": "perm", "ph": "ask", "id": secrets.token_hex(6), "turn": turn, "name": name, "key": key, "wait": PERM_TIMEOUT},
                    **self._tool_info(name, inp))
        if key in self.auto_allow:
            self.emit(dict(info, ph="done", decision="auto"))
            return self._verdict(True)
        ent = {"ev": threading.Event(), "decision": None, "info": info}
        with self.lock:
            self.pending[info["id"]] = ent
        self.emit(dict(info))
        ok = ent["ev"].wait(PERM_TIMEOUT)
        with self.lock:
            self.pending.pop(info["id"], None)
        decision = ent["decision"] if ok else "timeout"
        self.emit({"k": "perm", "ph": "done", "id": info["id"], "turn": turn, "name": name, "decision": decision})
        if decision == "allow":
            return self._verdict(True)
        return self._verdict(False, "Keine Antwort innerhalb von 5 Minuten – abgelehnt." if decision == "timeout" else "")

    def gate(self, ev):
        """Stop-Hook: Claude will fertig sein. Tests (betroffene), Build und Architekturregeln prüfen; scheitert etwas, bekommt Claude
        den Bericht und arbeitet weiter – höchstens 3 Runden."""
        run = self.run
        if not run or not run.get("gate") or not run.get("mut_t"):
            return {}
        g, turn = run["gate"], run["turn"]
        run["gate_n"] += 1
        n = run["gate_n"]
        if n > 3:
            self.emit({"k": "gate", "ph": "giveup", "turn": turn, "round": n - 1, "text": "Qualitätstor: nach 3 Runden durchgelassen – bitte selbst ansehen"})
            return {}
        self.emit({"k": "gate", "ph": "check", "turn": turn, "round": n, "what": [k for k, v in g.items() if v]})
        probs, parts = [], []
        if g.get("build") and self.presets:
            p = self.presets[0]
            r = run_preset(p)
            parts.append("Build " + ("ok" if r["code"] == 0 else "FEHLER"))
            if r["code"] != 0:
                probs.append(f"BUILD fehlgeschlagen ({p['label']}):\n" + r["output"][-3000:])
        if g.get("tests") and self.tsess:
            d = self.tsess.info()
            if d["py"] or d["c"]:
                data, note = self.tsess.run_affected(280, "gate")
                if data:
                    bad = [t for R in data["runs_data"] for t in R["tests"] if t.get("status") in ("failed", "error")]
                    builde = [R for R in data["runs_data"] if R.get("build_error")]
                    parts.append(f"Tests {sum(len(R['tests']) for R in data['runs_data']) - len(bad)}/{sum(len(R['tests']) for R in data['runs_data'])}")
                    if bad or builde:
                        probs.append("TESTS:\n" + test_report(data, full=False))
                else:
                    parts.append("Tests: keine betroffen")
        if g.get("rules") and self.graph:
            t_end = time.time() + 6
            while self.graph.t < run["mut_t"] + 0.2 and time.time() < t_end:   # auf das neue Diagramm der Oberfläche warten
                time.sleep(0.25)
            rr = (self.graph.g or {}).get("rules") or {}
            v = rr.get("violations") or []
            cy = rr.get("cycles") if (self.rules and self.rules.get().get("noCycles")) else []
            parts.append(f"Regeln: {len(v) + len(cy or [])} Verstöße")
            if v or cy:
                probs.append("ARCHITEKTURREGELN verletzt:\n" + "\n".join(f"- {x.get('text')} ({_disp(x.get('path'))}:{x.get('line')})" for x in v[:20])
                             + "".join(f"\n- Zyklus: {' → '.join(c)}" for c in (cy or [])[:5]))
        if probs:
            self.emit({"k": "gate", "ph": "block", "turn": turn, "round": n, "text": " · ".join(parts), "report": cut("\n\n".join(probs), 6000)})
            return {"decision": "block", "reason": f"Qualitätstor des CodeAtlas nicht bestanden (Runde {n}/3). Bitte die Ursachen beheben und erst danach fertig melden:\n\n" + "\n\n".join(probs)[:12000]}
        self.emit({"k": "gate", "ph": "ok", "turn": turn, "round": n, "text": " · ".join(parts) or "ok"})
        return {}

    def decide(self, pid, allow, always=False):
        with self.lock:
            ent = self.pending.get(str(pid))
            if not ent:
                return False
            ent["decision"] = "allow" if allow else "deny"
            if allow and always:
                self.auto_allow.add(ent["info"]["key"])
        ent["ev"].set()
        return True

    # --- Weg 2: Hooks einer Claude-Code-Sitzung im Terminal
    def on_hook(self, ev):
        name, sid = ev.get("hook_event_name"), str(ev.get("session_id") or "?")
        if sid in self.own:
            return                      # läuft über den Atlas und kommt schon über den Ereignisstrom
        with self.lock:
            s = self.ext.get(sid)
            fresh = s is None
            if fresh:
                s = self.ext[sid] = {"turn": 0}
        if fresh and name != "SessionEnd":
            self.emit({"k": "sess", "sid": sid, "src": "terminal", "mode": ev.get("permission_mode"), "cwd": ev.get("cwd")})
        par = ev.get("agent_id")

        def turn(prompt=None):
            if prompt is not None or not s["turn"]:
                with self.lock:
                    self.turn += 1
                    s["turn"] = self.turn
                label = prompt if prompt is not None else "Terminal-Sitzung (laufender Auftrag)"
                cp = self.cps.create(label[:120], "terminal")
                self.emit({"k": "turn", "ph": "start", "turn": s["turn"], "src": "terminal", "sid": sid, "prompt": cut(prompt, 20000) if prompt is not None else None,
                           "cp": cp["id"], "mode": ev.get("permission_mode"), "agent": "Claude Code (Terminal)"})
            return s["turn"]

        if name == "UserPromptSubmit":
            turn(str(ev.get("prompt") or ""))
        elif name == "PreToolUse":
            self.emit(dict({"k": "tool", "ph": "start", "id": ev.get("tool_use_id"), "turn": turn(), "name": ev.get("tool_name"), "par": par},
                           **self._tool_info(ev.get("tool_name"), ev.get("tool_input"))))
        elif name in ("PostToolUse", "PostToolUseFailure"):
            bad = name == "PostToolUseFailure"
            info = self._tool_info(ev.get("tool_name"), ev.get("tool_input"))
            info.update(self._result_info(ev.get("tool_name"), ev.get("error") if bad else None, bad, ev.get("tool_response")))
            self.emit(dict({"k": "tool", "ph": "end", "id": ev.get("tool_use_id"), "turn": turn(), "name": ev.get("tool_name"), "par": par,
                            "ms": ev.get("duration_ms")}, **info))
            if ev.get("tool_name") in MUTATING:
                self.watcher.kick()
        elif name == "Stop":
            n = turn()
            if ev.get("last_assistant_message"):
                self.emit({"k": "text", "turn": n, "mid": "stop" + str(n), "full": cut(ev["last_assistant_message"], 20000)})
            self.emit({"k": "turn", "ph": "end", "turn": n, "ok": True, "reason": "completed"})
            s["turn"] = 0
            self.watcher.kick()
        elif name == "SubagentStop":
            self.emit({"k": "note", "turn": turn(), "lvl": "info", "text": "Unter-Agent fertig" + (": " + str(ev.get("agent_type")) if ev.get("agent_type") else "")})
        elif name == "Notification":
            kind = str(ev.get("notification_type") or "")
            self.emit({"k": "note", "turn": s["turn"] or self.turn, "lvl": "warn" if kind == "permission_prompt" else "info", "wait": kind == "permission_prompt",
                       "text": cut(ev.get("message") or kind, 400)})
        elif name == "SessionEnd":
            if s["turn"]:
                self.emit({"k": "turn", "ph": "end", "turn": s["turn"], "ok": True, "reason": "Sitzung beendet"})
            with self.lock:
                self.ext.pop(sid, None)

    def _ours(self, h):
        a = h.get("args") if isinstance(h, dict) else None
        return isinstance(a, list) and "--hook" in a and HOOK_MARK in a

    def hooks_status(self):
        try:
            data = json.loads(self.settings_file.read_text("utf-8"))
            hooks = data.get("hooks") or {}
            n = sum(1 for ev in HOOK_EVENTS for g in hooks.get(ev) or [] if any(self._ours(h) for h in (g.get("hooks") or [])))
        except (OSError, ValueError, AttributeError):
            n = 0
        return {"installed": n >= len(HOOK_EVENTS), "partial": 0 < n < len(HOOK_EVENTS), "file": self.prj.name + "/.claude/settings.local.json"}

    def hooks_install(self, on):
        """Trägt die Meldungen in .claude/settings.local.json des Projekts ein (bzw. wieder aus) – nur die eigenen Einträge werden angefasst."""
        f = self.settings_file
        data = {}
        if f.is_file():
            try:
                data = json.loads(f.read_text("utf-8") or "{}")
            except ValueError:
                raise ValueError(".claude/settings.local.json ist kein gültiges JSON – bitte von Hand prüfen")
            if not isinstance(data, dict):
                raise ValueError(".claude/settings.local.json hat ein unerwartetes Format")
        hooks = data.get("hooks") if isinstance(data.get("hooks"), dict) else {}
        for ev in list(hooks):
            groups = []
            for g in hooks[ev] if isinstance(hooks[ev], list) else []:
                if isinstance(g, dict) and isinstance(g.get("hooks"), list):
                    g = dict(g, hooks=[h for h in g["hooks"] if not self._ours(h)])
                    if not g["hooks"]:
                        continue
                groups.append(g)
            if groups:
                hooks[ev] = groups
            else:
                del hooks[ev]
        if on:
            for ev in HOOK_EVENTS:
                hooks.setdefault(ev, []).append({"hooks": [self._hook_cmd(**{"async": True})]})
        if hooks:
            data["hooks"] = hooks
        else:
            data.pop("hooks", None)
        if data:
            f.parent.mkdir(exist_ok=True)
            f.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", "utf-8")
        elif f.is_file():
            f.unlink()
        return self.hooks_status()

    def announce(self):
        """Hinterlegt Adresse und Hook-Kennwort, damit `--hook` (von Claude Code aufgerufen) die laufende Bridge findet."""
        d = self.bridge_file.parent
        d.mkdir(exist_ok=True)
        gi = d / ".gitignore"
        if not gi.exists():
            gi.write_text("*\n", "utf-8")
        self.bridge_file.write_text(json.dumps({"url": self.url, "hook": self.hook_token, "pid": os.getpid()}), "utf-8")

    def close(self):
        self.stop()
        try:
            self.bridge_file.unlink()
        except OSError:
            pass


# ------------------------------------------------------------------ Suche
def search(prj: Project, q: str, regex: bool, case: bool, limit=2000):
    flags = 0 if case else re.IGNORECASE
    rx = re.compile(q if regex else re.escape(q), flags)
    hits, files = [], 0
    for f in prj.walk():
        if f["bin"]:
            continue
        try:
            txt = read_text(prj.resolve(f["path"]))["text"]
        except Exception:
            continue
        found = False
        for i, line in enumerate(txt.split("\n"), 1):
            m = rx.search(line)
            if m:
                found = True
                hits.append({"path": f["path"], "line": i, "col": m.start() + 1, "text": line[:300]})
                if len(hits) >= limit:
                    return {"hits": hits, "files": files + 1, "truncated": True}
        files += found
    return {"hits": hits, "files": files, "truncated": False}


# ------------------------------------------------------------------ Watcher (SSE)
class Watcher(threading.Thread):
    def __init__(self, prj: Project, interval=1.5):
        super().__init__(daemon=True)
        self.prj, self.interval, self.clients, self.lock = prj, interval, [], threading.Lock()
        self.snap = {f["path"]: f["mtime"] for f in prj.walk()}
        self.wake = threading.Event()

    def kick(self):
        """Nicht auf den nächsten Takt warten – z. B. direkt nachdem die KI eine Datei geschrieben hat."""
        self.wake.set()

    def subscribe(self):
        q = queue.Queue()
        with self.lock:
            self.clients.append(q)
        return q

    def unsubscribe(self, q):
        with self.lock:
            if q in self.clients:
                self.clients.remove(q)

    def run(self):
        self.alive = True
        while self.alive:
            if self.wake.wait(self.interval):
                time.sleep(0.12)          # mehrere Anstöße kurz hintereinander zusammenfassen
            self.wake.clear()
            if not self.clients:
                continue
            try:
                now = {f["path"]: f["mtime"] for f in self.prj.walk()}
            except Exception:
                continue
            changed = [p for p, m in now.items() if p in self.snap and self.snap[p] != m]
            added = [p for p in now if p not in self.snap]
            removed = [p for p in self.snap if p not in now]
            self.snap = now
            if changed or added or removed:
                msg = json.dumps({"changed": changed, "added": added, "removed": removed})
                with self.lock:
                    for q in self.clients:
                        q.put(msg)


# ------------------------------------------------------------------ Projekt öffnen
RECENT_FILE = Path.home() / ".codeatlas_recent.json"
PICK_PY = r"""
import sys
try:
    import tkinter as tk
    from tkinter import filedialog
except ImportError:
    print("\0kein-tk"); sys.exit(0)
r = tk.Tk(); r.withdraw()
try:
    r.attributes("-topmost", True)
except Exception:
    pass
r.update()
p = filedialog.askdirectory(parent=r, initialdir=sys.argv[1] if len(sys.argv) > 1 else None, title="Projektordner öffnen – CodeAtlas", mustexist=True)
r.destroy()
sys.stdout.write(p or "")
"""


def recent_projects():
    try:
        L = json.loads(RECENT_FILE.read_text("utf-8"))
    except (OSError, ValueError):
        return []
    return [r for r in L if isinstance(r, dict) and r.get("path") and os.path.isdir(r["path"])][:12]


def remember_project(root):
    L = [r for r in recent_projects() if r["path"] != str(root)]
    L.insert(0, {"path": str(root), "name": root.name, "t": int(time.time())})
    try:
        RECENT_FILE.write_text(json.dumps(L[:12], ensure_ascii=False, indent=1), "utf-8")
    except OSError:
        pass


def tk_ok():
    try:
        import importlib.util
        return importlib.util.find_spec("tkinter") is not None
    except (ImportError, ValueError):
        return False


def pick_folder(start):
    """Nativen Ordner-Dialog des Betriebssystems zeigen (in einem eigenen Prozess – Tk mag keine Server-Threads)."""
    if sys.platform == "darwin":
        try:
            r = subprocess.run(["osascript", "-e", f'POSIX path of (choose folder with prompt "Projektordner öffnen – CodeAtlas" default location POSIX file "{start}")'],
                               capture_output=True, text=True, timeout=900)
            return r.stdout.strip().rstrip("/") if r.returncode == 0 else ""
        except (OSError, subprocess.TimeoutExpired):
            pass
    try:
        r = subprocess.run([sys.executable, "-c", PICK_PY, start], capture_output=True, timeout=900, creationflags=0x08000000 if IS_WIN else 0)
    except subprocess.TimeoutExpired:
        return ""
    except OSError as e:
        raise RuntimeError(f"Ordner-Dialog nicht verfügbar: {e}")
    out = r.stdout.decode("utf-8", "replace").strip()
    if out == "\0kein-tk" or (r.returncode and not out):
        raise RuntimeError("Ordner-Dialog nicht verfügbar (Python ohne tkinter) – Pfad eintippen oder unten durchsuchen")
    return str(Path(out)) if out else ""


def browse_dir(path):
    p = Path(os.path.expandvars(os.path.expanduser(path.strip().strip('"')))) if path else Path.home()
    if not p.is_dir():
        p = p.parent if p.parent.is_dir() else Path.home()
    p = p.resolve()
    dirs = []
    try:
        with os.scandir(p) as it:
            for e in it:
                try:
                    if e.is_dir() and not e.name.startswith((".", "$")) and e.name not in ("__pycache__", "node_modules", "System Volume Information"):
                        dirs.append(e.name)
                except OSError:
                    continue
    except OSError as e:
        return {"path": str(p), "parent": str(p.parent) if p.parent != p else None, "dirs": [], "error": str(e), "roots": _roots()}
    dirs.sort(key=str.lower)
    out = []
    for n in dirs[:500]:
        full = p / n
        mark = any((full / m).exists() for m in (".git", "pyproject.toml", "package.json", "CMakeLists.txt", "Makefile")) or any(full.glob("*.cbp")) if len(dirs) < 150 else False
        out.append({"name": n, "path": str(full), "proj": bool(mark)})
    return {"path": str(p), "parent": str(p.parent) if p.parent != p else None, "dirs": out, "more": max(0, len(dirs) - 500), "roots": _roots()}


def _roots():
    if IS_WIN:
        import string
        return [f"{c}:\\" for c in string.ascii_uppercase if os.path.exists(f"{c}:\\")]
    return ["/", str(Path.home())]


# ------------------------------------------------------------------ HTTP
def make_handler(prj: Project, token: str, editors, presets, watcher, default_editor, custom_cmd, port, runner=None, run_presets=(), allow=None, host_names=(), app_file=None, patches=None, cps=None, hub=None, book=None, tsess=None, switcher=None, graph=None, pipe=None, rules=None, team=None):
    hosts = {f"127.0.0.1:{port}", f"localhost:{port}", f"[::1]:{port}"} | {f"{h}:{port}" for h in host_names} | set(host_names)   # ohne Port: hinter "tailscale serve" (https, Port 443)
    ipaddress = __import__("ipaddress")

    def host_ok(h):
        if not h:
            return False
        if h in hosts:
            return True
        name = h.rsplit(":", 1)[0].strip("[]") if h.count(":") <= 1 or h.startswith("[") else h
        try:
            ipaddress.ip_address(name)   # reine IP-Adressen sind gegen DNS-Rebinding sicher
            return True
        except ValueError:
            return False

    class H(BaseHTTPRequestHandler):
        server_version = "CodeAtlasBridge/" + VERSION

        def log_message(self, fmt, *args):
            if "/api/events" not in (args[0] if args else ""):
                sys.stderr.write("  %s %s\n" % (time.strftime("%H:%M:%S"), fmt % args))

        def cors(self):
            origin = self.headers.get("Origin")
            self.send_header("Access-Control-Allow-Origin", origin or "*")
            self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Allow-Headers", "X-Atlas-Token, Content-Type")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS")
            self.send_header("Access-Control-Allow-Private-Network", "true")
            self.send_header("Access-Control-Max-Age", "600")

        def reply(self, code, obj):
            body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
            self.send_response(code)
            self.cors()
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def client_ok(self):
            if not allow:
                return True
            try:
                ip = ipaddress.ip_address(self.client_address[0])
            except ValueError:
                return False
            return ip.is_loopback or any(ip in net for net in allow)

        def guard(self, qs):
            if not self.client_ok():
                self.reply(403, {"error": "Adresse nicht freigegeben (--allow)"})
                return False
            if not host_ok(self.headers.get("Host")):
                self.reply(403, {"error": "Host nicht erlaubt"})
                return False
            tok = self.headers.get("X-Atlas-Token") or (qs.get("token") or [""])[0]
            if not secrets.compare_digest(tok, token):
                self.reply(401, {"error": "Token fehlt oder falsch"})
                return False
            return True

        def body(self):
            n = int(self.headers.get("Content-Length") or 0)
            if n > 20_000_000:
                raise ValueError("Anfrage zu groß")
            return json.loads(self.rfile.read(n) or b"{}")

        def do_OPTIONS(self):
            self.send_response(204)
            self.cors()
            self.end_headers()

        def do_GET(self):
            u = urlparse(self.path)
            qs = parse_qs(u.query)
            if u.path in ("/", "/index.html", "/app") and app_file and self.client_ok() and host_ok(self.headers.get("Host")):
                try:
                    body = app_file.read_bytes().replace(b"<head>", b"<head><script>window.__ATLAS_BRIDGE__=true</script>", 1)
                except OSError:
                    body = b"CodeAtlas.html nicht lesbar"
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.send_header("Cache-Control", "no-cache")
                self.end_headers()
                self.wfile.write(body)
                return
            if u.path in ("/", "/index.html"):
                html = f"<!doctype html><meta charset=utf-8><title>CodeAtlas Bridge</title><body style='font:14px monospace;background:#0a0b0d;color:#e8eaf0;padding:24px'><b style='color:#00d4aa'>CodeAtlas Bridge {VERSION}</b> läuft.<br>Projekt: {prj.root}<br>Token im Terminal bzw. in ~/.codeatlas_token.</body>".encode()
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.end_headers()
                self.wfile.write(html)
                return
            if not self.guard(qs):
                return
            try:
                if u.path == "/api/info":
                    if book:
                        book.refresh()
                    self.reply(200, {"version": VERSION, "root": str(prj.root), "rootName": prj.name, "os": sys.platform,
                                     "editors": [{"id": e["id"], "label": e["label"], "found": e["found"]} for e in editors], "defaultEditor": default_editor,
                                     "presets": [{"id": p["id"], "label": p["label"], "cmd": p["cmd"]} for p in presets],
                                     "runPresets": [{"id": p["id"], "label": p["label"], "kind": p["kind"]} for p in run_presets],
                                     "py": sys.version.split()[0],
                                     "features": (["patch", "snapshots"] if patches else []) + (["checkpoints"] if cps else []) + (["agent"] if hub else []) + (["tests"] if tsess else []) + ["stream"] + (["switch"] if switcher else []) + (["graph", "pipeline", "rules", "gate", "git", "claudemd"] if graph else []) + (["team"] if team else []),
                                     "git": patches.git_info() if patches else None, "agent": hub.state() if hub else None})
                elif u.path == "/api/graph/info" and graph:
                    self.reply(200, {"ready": bool(graph.ix), "age": graph.age(), "t": graph.t, "stale": graph.stale})
                elif u.path == "/api/pipeline" and pipe:
                    self.reply(200, pipe.get())
                elif u.path == "/api/rules" and rules:
                    self.reply(200, rules.get())
                elif u.path == "/api/git/status":
                    self.reply(200, git_info(prj.root))
                elif u.path == "/api/git/hotspots":
                    self.reply(200, git_hotspots(prj.root, int((qs.get("days") or ["365"])[0])))
                elif u.path == "/api/claudemd":
                    self.reply(200, claudemd_get(prj.root))
                elif u.path == "/api/team" and team:
                    self.reply(200, {"agents": team.list(), "git": git_info(prj.root)})
                elif u.path == "/api/team/diff" and team:
                    self.reply(200, team.diff((qs.get("id") or [""])[0]))
                elif u.path == "/api/project/recent":
                    self.reply(200, {"current": str(prj.root), "name": prj.name, "recent": [r for r in recent_projects() if r["path"] != str(prj.root)],
                                     "home": str(Path.home()), "local": self.local(), "dialog": self.local() and tk_ok(), "switch": bool(switcher) and self.local()})
                elif u.path == "/api/project/browse":
                    if not self.local():
                        return self.reply(403, {"error": "Ordner durchsuchen nur am Rechner der Bridge"})
                    self.reply(200, browse_dir((qs.get("path") or [""])[0] or str(prj.root)))
                elif u.path == "/api/test/info" and tsess:
                    self.reply(200, tsess.info())
                elif u.path == "/api/test/result" and tsess:
                    d = tsess.data(tsess.last)
                    self.reply(200, {"data": d, "text": test_report(d)})
                elif u.path == "/api/stream":
                    self.send_response(200)
                    self.cors()
                    self.send_header("Content-Type", "text/event-stream")
                    self.send_header("Cache-Control", "no-cache")
                    self.end_headers()
                    want = set((qs.get("topics") or ["files,run,agent"])[0].split(","))
                    src = [(n, o) for n, o in (("files", watcher), ("run", runner), ("agent", hub), ("team", team)) if n in want and o]
                    merged, stop, subs = queue.Queue(maxsize=20000), threading.Event(), []

                    def fwd(name, q):
                        while not stop.is_set():
                            try:
                                m = q.get(timeout=1)
                            except queue.Empty:
                                continue
                            try:
                                merged.put((name, m), timeout=5)
                            except queue.Full:
                                pass
                    for name, o in src:
                        q = o.subscribe()
                        subs.append((o, q))
                        threading.Thread(target=fwd, args=(name, q), daemon=True).start()
                    try:
                        self.wfile.write(b": verbunden\n\n")
                        self.wfile.flush()
                        while True:
                            try:
                                name, m = merged.get(timeout=15)
                            except queue.Empty:
                                self.wfile.write(b": ping\n\n")
                                self.wfile.flush()
                                continue
                            buf = [f"event: {name}\ndata: {m}\n\n"]
                            try:
                                while len(buf) < 400:
                                    name, m = merged.get_nowait()
                                    buf.append(f"event: {name}\ndata: {m}\n\n")
                            except queue.Empty:
                                pass
                            self.wfile.write("".join(buf).encode("utf-8"))
                            self.wfile.flush()
                    except (BrokenPipeError, ConnectionResetError, OSError):
                        pass
                    finally:
                        stop.set()
                        for o, q in subs:
                            o.unsubscribe(q)
                elif u.path == "/api/run/events":
                    self.send_response(200)
                    self.cors()
                    self.send_header("Content-Type", "text/event-stream")
                    self.send_header("Cache-Control", "no-cache")
                    self.end_headers()
                    q = runner.subscribe()
                    try:
                        self.wfile.write(b": verbunden\n\n")
                        self.wfile.flush()
                        while True:
                            try:
                                msg = q.get(timeout=15)
                                self.wfile.write(("data: " + msg + "\n\n").encode("utf-8"))
                            except queue.Empty:
                                self.wfile.write(b": ping\n\n")
                            self.wfile.flush()
                    except (BrokenPipeError, ConnectionResetError, OSError):
                        pass
                    finally:
                        runner.unsubscribe(q)
                elif u.path == "/api/agent/events":
                    self.send_response(200)
                    self.cors()
                    self.send_header("Content-Type", "text/event-stream")
                    self.send_header("Cache-Control", "no-cache")
                    self.end_headers()
                    q = hub.subscribe()
                    try:
                        self.wfile.write(b": verbunden\n\n")
                        self.wfile.flush()
                        while True:
                            try:
                                msg = q.get(timeout=15)
                            except queue.Empty:
                                self.wfile.write(b": ping\n\n")
                                self.wfile.flush()
                                continue
                            buf = ["data: " + msg + "\n\n"]
                            try:
                                while len(buf) < 400:      # was schon wartet, in einem Rutsch senden
                                    buf.append("data: " + q.get_nowait() + "\n\n")
                            except queue.Empty:
                                pass
                            self.wfile.write("".join(buf).encode("utf-8"))
                            self.wfile.flush()
                    except (BrokenPipeError, ConnectionResetError, OSError):
                        pass
                    finally:
                        hub.unsubscribe(q)
                elif u.path == "/api/agent/state":
                    self.reply(200, hub.state())
                elif u.path == "/api/account":
                    self.reply(200, hub.account.state(qs.get("fresh", ["0"])[0] == "1"))
                elif u.path == "/api/skills":
                    self.reply(200, hub.skills.scan())
                elif u.path == "/api/skills/file":
                    try:
                        self.reply(200, hub.skills.read(qs.get("name", [""])[0]))
                    except ValueError as e:
                        self.reply(404, {"error": str(e)})
                elif u.path == "/api/checkpoints":
                    sess = cps.session()
                    self.reply(200, {"checkpoints": cps.list(int((qs.get("limit") or ["50"])[0])), "session": sess})
                elif u.path == "/api/checkpoint/diff":
                    self.reply(200, cps.diff((qs.get("id") or [""])[0]))
                elif u.path == "/api/checkpoint/file":
                    self.reply(200, cps.file((qs.get("id") or [""])[0], (qs.get("path") or [""])[0]))
                elif u.path == "/api/snapshots":
                    self.reply(200, {"snapshots": patches.list(int((qs.get("limit") or ["100"])[0]))})
                elif u.path == "/api/tree":
                    self.reply(200, {"files": prj.walk()})
                elif u.path == "/api/file":
                    full = prj.resolve(qs["path"][0])
                    if full.stat().st_size > MAX_TEXT:
                        return self.reply(413, {"error": "Datei zu groß"})
                    self.reply(200, read_text(full))
                elif u.path == "/api/search":
                    self.reply(200, search(prj, qs.get("q", [""])[0], qs.get("regex", ["0"])[0] == "1", qs.get("case", ["0"])[0] == "1"))
                elif u.path == "/api/events":
                    self.send_response(200)
                    self.cors()
                    self.send_header("Content-Type", "text/event-stream")
                    self.send_header("Cache-Control", "no-cache")
                    self.end_headers()
                    q = watcher.subscribe()
                    try:
                        self.wfile.write(b": verbunden\n\n")
                        self.wfile.flush()
                        while True:
                            try:
                                msg = q.get(timeout=15)
                                self.wfile.write(f"data: {msg}\n\n".encode())
                            except queue.Empty:
                                self.wfile.write(b": ping\n\n")
                            self.wfile.flush()
                    except (BrokenPipeError, ConnectionResetError, OSError):
                        pass
                    finally:
                        watcher.unsubscribe(q)
                else:
                    self.reply(404, {"error": "unbekannt"})
            except PermissionError as e:
                self.reply(403, {"error": str(e)})
            except FileNotFoundError as e:
                self.reply(404, {"error": str(e) if e.args and not e.filename else "Datei nicht gefunden"})
            except ValueError as e:
                self.reply(400, {"error": str(e)})
            except re.error as e:
                self.reply(400, {"error": "Regex: " + str(e)})
            except Exception as e:
                self.reply(500, {"error": str(e)})

        def do_PUT(self):
            u = urlparse(self.path)
            qs = parse_qs(u.query)
            if not self.guard(qs):
                return
            try:
                if u.path != "/api/file":
                    return self.reply(404, {"error": "unbekannt"})
                full = prj.resolve(qs["path"][0])
                b = self.body()
                if full.exists() and b.get("mtime") and not b.get("force"):
                    cur = full.stat().st_mtime_ns // 1_000_000
                    if abs(cur - int(b["mtime"])) > 1:
                        return self.reply(409, {"error": "Datei wurde inzwischen extern geändert", "mtime": cur})
                full.parent.mkdir(parents=True, exist_ok=True)
                mt = write_text(full, b.get("text", ""), b.get("encoding", "utf-8"), b.get("eol", "\n"))
                watcher.snap[prj.rel(full)] = mt
                self.reply(200, {"ok": True, "mtime": mt})
            except PermissionError as e:
                self.reply(403, {"error": str(e)})
            except Exception as e:
                self.reply(500, {"error": str(e)})

        def local(self):
            try:
                return ipaddress.ip_address(self.client_address[0]).is_loopback
            except ValueError:
                return False

        def hook_ok(self):
            """Hook-Meldungen kommen von Claude Code auf diesem Rechner: nur Loopback, eigenes Kennwort (kein Lese-/Schreibzugriff)."""
            try:
                local = ipaddress.ip_address(self.client_address[0]).is_loopback
            except ValueError:
                local = False
            tok = self.headers.get("X-Atlas-Hook") or ""
            self.hook_hub = hub if hub and secrets.compare_digest(tok, hub.hook_token) else (team.hub_by_token(tok) if team and tok else None)
            return bool(hub) and local and self.hook_hub is not None

        def do_POST(self):
            u = urlparse(self.path)
            qs = parse_qs(u.query)
            if u.path == "/api/mcp/call" and tsess and self.hook_ok() and self.hook_hub is hub:
                try:
                    b = self.body()
                    tool, args = b.get("tool"), b.get("args") or {}
                    if tool == "tests_info":
                        return self.reply(200, {"text": tests_info_text(tsess.info())})
                    if tool == "tests_run" and args.get("betroffene"):
                        data, note = tsess.run_affected(280, "claude")
                        return self.reply(200, {"text": (note + "\n" if note else "") + (test_report(data) if data else "")})
                    if tool.startswith("atlas_"):
                        if not graph:
                            return self.reply(200, {"text": "Code-Graph nicht verfügbar."})
                        try:
                            txt = {"atlas_orient": lambda: graph.orient(tsess), "atlas_find": lambda: graph.find(args.get("suche") or args.get("query") or ""),
                                   "atlas_impact": lambda: graph.impact(args.get("symbol") or "", args.get("tiefe") or 3, args.get("richtung") or "aufrufer", tsess),
                                   "atlas_trace": lambda: graph.trace(args.get("von") or "", args.get("nach") or ""), "atlas_read": lambda: graph.read(args.get("symbol") or ""),
                                   "atlas_rules": lambda: graph.rules_text(rules)}[tool]()
                        except KeyError:
                            return self.reply(404, {"error": "Werkzeug unbekannt: " + tool})
                        except LookupError as e:
                            txt = str(e)
                        return self.reply(200, {"text": txt})
                    if tool.startswith("plan_") and pipe:
                        try:
                            if tool == "plan_get":
                                txt = pipe.text()
                            elif tool == "plan_set_spec":
                                txt = pipe.set_text("spec", args.get("text"))
                            elif tool == "plan_set_plan":
                                txt = pipe.set_text("plan", args.get("text"))
                            elif tool == "plan_set_tasks":
                                txt = pipe.set_tasks(args.get("aufgaben") or args.get("tasks"))
                            elif tool == "plan_task_update":
                                txt = pipe.update_task(args.get("id"), args.get("status"), args.get("notiz") or args.get("note") or "")
                            else:
                                return self.reply(404, {"error": "Werkzeug unbekannt: " + tool})
                        except ValueError as e:
                            return self.reply(200, {"text": "Fehler: " + str(e)})
                        return self.reply(200, {"text": txt})
                    if tool == "tests_run":
                        kinds = {"python": ["py"], "c": ["c"]}.get(str(args.get("sprache") or "").lower())
                        ids = tsess.failed_ids() if args.get("nur_fehlgeschlagene") else None
                        if ids is not None and not ids:
                            return self.reply(200, {"text": "Im letzten Lauf ist kein Test fehlgeschlagen – nichts zu wiederholen. (tests_run ohne nur_fehlgeschlagene führt alle aus.)"})
                        return self.reply(200, {"text": test_report(tsess.run_wait(kinds, str(args.get("filter") or ""), 280, "claude", ids))})
                    if tool == "tests_last":
                        return self.reply(200, {"text": test_report(tsess.data(tsess.last), str(args.get("filter") or "") or None)})
                    return self.reply(404, {"error": "Werkzeug unbekannt: " + str(tool)})
                except Exception as e:
                    return self.reply(500, {"error": f"{type(e).__name__}: {e}"})
            if u.path in ("/api/agent/hook", "/api/agent/permit", "/api/agent/gate") and self.hook_ok():
                try:
                    ev = self.body()
                    hh = self.hook_hub
                    if u.path == "/api/agent/gate":
                        return self.reply(200, hh.gate(ev))
                    if u.path == "/api/agent/permit":
                        return self.reply(200, hh.permit(ev))
                    hh.on_hook(ev)
                    return self.reply(200, {})
                except Exception as e:
                    return self.reply(500, {"error": str(e)})
            if not self.guard(qs):
                return
            try:
                b = self.body()
                if u.path == "/api/agent/start":
                    try:
                        return self.reply(200, hub.start(b.get("agent", "0"), b.get("prompt"), b.get("mode"), bool(b.get("fresh")), b.get("attachments"), b.get("model"), b.get("effort"), b.get("gate")))
                    except RuntimeError as e:
                        return self.reply(409, {"error": str(e)})
                if u.path == "/api/agent/send":
                    r = hub.send(b.get("prompt"), b.get("attachments"))
                    if r is None:   # inzwischen fertig geworden: als neuer Auftrag
                        try:
                            r = hub.start(b.get("agent", "0"), b.get("prompt"), b.get("mode"), False, b.get("attachments"), b.get("model"), b.get("effort"))
                        except RuntimeError as e:
                            return self.reply(409, {"error": str(e)})
                    return self.reply(200, r)
                if u.path == "/api/account/login":
                    return self.reply(200, hub.account.start_login(bool(b.get("console")), b.get("email") or ""))
                if u.path == "/api/account/code":
                    return self.reply(200, hub.account.send_code(b.get("code")))
                if u.path == "/api/account/cancel":
                    return self.reply(200, hub.account.cancel())
                if u.path == "/api/account/logout":
                    if hub.run:
                        return self.reply(409, {"error": "Erst den laufenden Auftrag beenden"})
                    return self.reply(200, hub.account.logout())
                if u.path == "/api/skills/create":
                    return self.reply(200, hub.skills.create(b.get("scope"), b.get("name"), b.get("description"), b.get("body"), bool(b.get("overwrite"))))
                if u.path == "/api/skills/save":
                    return self.reply(200, hub.skills.save(b.get("name"), b.get("content")))
                if u.path == "/api/agent/upload":
                    return self.reply(200, hub.upload(b.get("name"), b.get("mime"), b.get("data")))
                if u.path == "/api/agent/stop":
                    return self.reply(200, {"ok": hub.stop()})
                if u.path == "/api/agent/permission":
                    return self.reply(200, {"ok": hub.decide(b.get("id"), bool(b.get("allow")), bool(b.get("always")))})
                if u.path == "/api/agent/reset":
                    try:
                        return self.reply(200, hub.reset())
                    except RuntimeError as e:
                        return self.reply(409, {"error": str(e)})
                if u.path == "/api/agent/hooks":
                    return self.reply(200, hub.hooks_install(bool(b.get("install"))))
                if u.path == "/api/checkpoint":
                    return self.reply(200, cps.create(b.get("label") or "Kontrollpunkt", b.get("source") or "manuell"))
                if u.path == "/api/checkpoint/restore":
                    out = cps.restore(b.get("id"), b.get("paths") or None)
                    watcher.kick()
                    return self.reply(200, out)
                if u.path == "/api/patch":
                    try:
                        return self.reply(200, patches.patch(b.get("ops"), b.get("label", ""), b.get("source", ""), b.get("snapshot", True), bool(b.get("commit"))))
                    except PatchConflict as e:
                        return self.reply(409, {"error": str(e), "conflicts": e.conflicts})
                if u.path == "/api/snapshot/restore":
                    return self.reply(200, patches.restore(b.get("id")))
                if u.path == "/api/run":
                    p = book.pick(run_presets, b.get("preset")) if book else next((x for x in run_presets if x["id"] == str(b.get("preset"))), None)
                    if not p:
                        return self.reply(400, {"error": "Start-Konfiguration unbekannt"})
                    rid = runner.start(p, str(b.get("args") or ""), b.get("trace", True))
                    return self.reply(200, {"ok": True, "run": rid})
                if u.path == "/api/run/stop":
                    runner.stop(b.get("run"))
                    return self.reply(200, {"ok": True})
                if u.path == "/api/graph" and graph:
                    graph.put(b)
                    return self.reply(200, {"ok": True})
                if u.path == "/api/pipeline" and pipe:
                    d = pipe.get()
                    for k in ("idea", "spec", "plan", "stage"):
                        if k in b:
                            d[k] = str(b[k])[:60000] if k != "stage" or b[k] in PIPE_STAGES else d[k]
                    if isinstance(b.get("approve"), str):
                        d.setdefault("approved", {})[b["approve"]] = True
                    if isinstance(b.get("tasks"), list):
                        d["tasks"] = b["tasks"][:80]
                    if b.get("reset"):
                        d = {"stage": "idee", "idea": "", "spec": "", "plan": "", "tasks": [], "approved": {}, "rev": d.get("rev", 0)}
                    return self.reply(200, pipe.save(d))
                if u.path == "/api/rules" and rules:
                    rs = [{"from": str(r.get("from") or "")[:200], "to": str(r.get("to") or "")[:200], "text": str(r.get("text") or "")[:300]} for r in (b.get("rules") or []) if r.get("from") and r.get("to")]
                    return self.reply(200, rules.put({"rules": rs[:100], "noCycles": bool(b.get("noCycles"))}))
                if u.path == "/api/git/commit":
                    gi = git_info(prj.root)
                    if not gi["repo"]:
                        return self.reply(400, {"error": "kein Git-Repository"})
                    git_run(prj.root, "add", "-A")
                    c, _ = git_run(prj.root, "diff", "--cached", "--quiet")
                    if not c:
                        return self.reply(200, {"ok": True, "empty": True})
                    c, out = git_run(prj.root, "commit", "-m", str(b.get("message") or "CodeAtlas: Änderungen")[:5000])
                    if c and ("user.email" in out or "Please tell me who you are" in out):
                        c, out = git_run(prj.root, "-c", "user.name=CodeAtlas", "-c", "user.email=codeatlas@localhost", "commit", "-m", str(b.get("message") or "CodeAtlas: Änderungen")[:5000])
                    if c:
                        return self.reply(500, {"error": out[-600:]})
                    _, h = git_run(prj.root, "rev-parse", "--short", "HEAD")
                    return self.reply(200, {"ok": True, "hash": h.strip(), "msg": out.splitlines()[0] if out else ""})
                if u.path == "/api/claudemd":
                    return self.reply(200, claudemd_put(prj.root, b.get("content") or ""))
                if u.path.startswith("/api/team/") and team:
                    op = u.path.rsplit("/", 1)[1]
                    try:
                        if op == "start":
                            return self.reply(200, team.start(b.get("name"), b.get("prompt"), b.get("mode") or "acceptEdits", b.get("model") or "", b.get("base") or "stand"))
                        if op == "send":
                            return self.reply(200, team.send(b.get("id"), b.get("prompt"), b.get("mode") or "acceptEdits", b.get("model") or ""))
                        if op == "stop":
                            return self.reply(200, team.stop(b.get("id")))
                        if op == "decide":
                            return self.reply(200, team.decide(b.get("id"), b.get("pid"), bool(b.get("allow")), bool(b.get("always"))))
                        if op == "merge":
                            return self.reply(200, team.merge(b.get("id"), b.get("message") or ""))
                        if op == "discard":
                            return self.reply(200, team.discard(b.get("id")))
                    except RuntimeError as e:
                        return self.reply(409, {"error": str(e)})
                    return self.reply(404, {"error": "unbekannt"})
                if u.path == "/api/project/pick":
                    if not self.local():
                        return self.reply(403, {"error": "Der Ordner-Dialog öffnet sich nur am Rechner der Bridge"})
                    try:
                        return self.reply(200, {"path": pick_folder(str(b.get("start") or prj.root))})
                    except RuntimeError as e:
                        return self.reply(501, {"error": str(e)})
                if u.path == "/api/project/open":
                    if not switcher or not self.local():
                        return self.reply(403, {"error": "Projektwechsel nur am Rechner der Bridge"})
                    p = Path(os.path.expandvars(os.path.expanduser(str(b.get("path") or "").strip().strip('"')))) if b.get("path") else None
                    if not p or not p.is_dir():
                        return self.reply(400, {"error": f"Ordner nicht gefunden: {b.get('path')}"})
                    p = p.resolve()
                    if p == prj.root:
                        return self.reply(200, {"ok": True, "path": str(p), "same": True})
                    busy = [x for x in (("KI-Auftrag", hub and hub.run), ("laufende Programme", runner and any(r.status != "ended" for r in runner.runs.values()))) if x[1]]
                    if busy and not b.get("force"):
                        return self.reply(409, {"error": "Es laufen noch: " + ", ".join(x[0] for x in busy), "busy": [x[0] for x in busy]})
                    self.reply(200, {"ok": True, "path": str(p)})
                    switcher(p)
                    return
                if u.path == "/api/test/run" and tsess:
                    try:
                        ids = tsess.failed_ids() if b.get("failed") else (list(b["only"]) if isinstance(b.get("only"), list) else None)
                        if b.get("affected"):
                            ids = tsess.affected_ids(b["affected"] if isinstance(b["affected"], list) else None)
                            if ids is not None and not ids:
                                return self.reply(200, {"ok": True, "empty": True, "note": "Keine betroffenen Tests seit dem letzten Lauf"})
                        ss = tsess.start(b.get("kinds") or None, str(b.get("filter") or ""), "ui", ids)
                    except RuntimeError as e:
                        return self.reply(409, {"error": str(e)})
                    return self.reply(200, {"ok": True, "session": ss["id"], "empty": not ss["runs"] and ss["done"]})
                if u.path == "/api/test/stop" and tsess:
                    tsess.stop()
                    return self.reply(200, {"ok": True})
                if u.path == "/api/run/stdin":
                    runner.stdin(b.get("run"), str(b.get("text", "")))
                    return self.reply(200, {"ok": True})
                if u.path == "/api/run/ctl":
                    mode = b.get("mode", "run")
                    if mode not in ("run", "pause"):
                        return self.reply(400, {"error": "mode muss run oder pause sein"})
                    runner.control(b.get("run"), mode, b.get("slow", 0), b.get("step", 0), b.get("bp", []))
                    return self.reply(200, {"ok": True})
                if u.path == "/api/open":
                    full = prj.resolve(b["path"])
                    line, col = max(1, int(b.get("line") or 1)), max(1, int(b.get("col") or 1))
                    eid = b.get("editor") or default_editor or (editors[0]["id"] if editors else None)
                    ed = next((e for e in editors if e["id"] == eid), None)
                    if not ed or not ed["found"]:
                        label = ed["label"] if ed else eid
                        return self.reply(400, {"error": f"{label} wurde auf diesem PC nicht gefunden. Bridge neu starten mit "
                                                         f"--editor-path {eid}=\"C:\\Pfad\\zur\\{'codeblocks' if eid == 'codeblocks' else eid}.exe\". "
                                                         "Gefunden: " + (", ".join(e["label"] for e in editors if e["found"]) or "keiner")})
                    if eid == "custom":
                        argv = [a.replace("{file}", str(full)).replace("{line}", str(line)).replace("{col}", str(col))
                                for a in shlex.split(custom_cmd, posix=not IS_WIN)]
                        exe = find_exe([argv[0]]) or argv[0]
                        argv[0] = exe
                    else:
                        argv = [ed["exe"], *EDITORS[eid][3](str(full), line, col)]
                    launch(argv)
                    self.reply(200, {"ok": True, "editor": ed["label"], "argv": argv})
                elif u.path == "/api/build":
                    p = book.pick(presets, b.get("preset")) if book else next((x for x in presets if x["id"] == str(b.get("preset"))), None)
                    if not p:
                        return self.reply(400, {"error": "Preset unbekannt"})
                    self.reply(200, run_preset(p))
                else:
                    self.reply(404, {"error": "unbekannt"})
            except PermissionError as e:
                self.reply(403, {"error": str(e)})
            except FileNotFoundError as e:
                self.reply(404, {"error": str(e) or "Datei nicht gefunden"})
            except ValueError as e:
                self.reply(400, {"error": str(e)})
            except Exception as e:
                self.reply(500, {"error": str(e)})

    return H


def open_app(url, as_window):
    """Öffnet die Oberfläche – als eigenes Fenster ohne Browserleisten (Edge/Chrome im App-Modus) oder im Standardbrowser."""
    if as_window:
        exe = find_exe(["msedge", "chrome", "google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "brave", "brave-browser"],
                       [PF86 + r"\Microsoft\Edge\Application\msedge.exe", PF + r"\Microsoft\Edge\Application\msedge.exe",
                        PF + r"\Google\Chrome\Application\chrome.exe", PF86 + r"\Google\Chrome\Application\chrome.exe",
                        LAD + r"\Google\Chrome\Application\chrome.exe"] if IS_WIN else
                       ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"])
        if not exe and IS_WIN:
            exe = win_app_path("msedge.exe") or win_app_path("chrome.exe")
        if exe:
            try:
                launch([exe, "--app=" + url, "--window-size=1500,950"])
                return "eigenes Fenster (" + os.path.basename(exe) + ")"
            except (OSError, ValueError):
                pass
    try:
        import webbrowser
        webbrowser.open(url)
        return "Standardbrowser" + (" (kein Edge/Chrome für ein eigenes Fenster gefunden)" if as_window else "")
    except Exception as e:
        return f"konnte nicht geöffnet werden ({e}) – Adresse oben von Hand öffnen"


def local_ips():
    import socket as _s
    ips = set()
    try:
        for info in _s.getaddrinfo(_s.gethostname(), None, _s.AF_INET):
            ips.add(info[4][0])
    except OSError:
        pass
    for probe in ("10.255.255.255", "8.8.8.8"):
        try:
            u = _s.socket(_s.AF_INET, _s.SOCK_DGRAM)
            u.connect((probe, 1))
            ips.add(u.getsockname()[0])
            u.close()
        except OSError:
            pass
    return sorted(ip for ip in ips if not ip.startswith("127.")) or ["<IP-dieses-PCs>"]


def main():
    ap = argparse.ArgumentParser(description="CodeAtlas Bridge – lokaler Projektzugriff für CodeAtlasLab")
    ap.add_argument("root", nargs="?", default=".", help="Projektordner")
    ap.add_argument("--port", type=int, default=7878)
    ap.add_argument("--editor", help="Standard-Editor: " + ", ".join(EDITORS) + ", custom")
    ap.add_argument("--editor-cmd", help='Eigener Editor-Befehl, z. B. "notepad++ -n{line} {file}"')
    ap.add_argument("--build", action="append", default=[], help='Zusätzliches Build-Preset "Name=Befehl" (mehrfach möglich)')
    ap.add_argument("--editor-path", action="append", default=[], metavar="ID=PFAD",
                    help='Pfad zu einem Editor, z. B. codeblocks="C:\\Program Files\\CodeBlocks\\codeblocks.exe" (mehrfach möglich)')
    ap.add_argument("--include-libs", action="store_true", help="Bibliotheken (venv, site-packages, third_party …) nicht ausblenden")
    ap.add_argument("--listen", default="127.0.0.1", help="Adresse, auf der gelauscht wird: 127.0.0.1 (nur dieser PC), 0.0.0.0 (alle Netze) oder die VPN-IP")
    ap.add_argument("--allow", action="append", default=[], metavar="NETZ", help="Nur diese Netze zulassen, z. B. 10.8.0.0/24 (mehrfach möglich)")
    ap.add_argument("--host-name", action="append", default=[], metavar="NAME", help="Zusätzlich erlaubter Hostname (z. B. der VPN-DNS-Name des PCs)")
    ap.add_argument("--app", help="Pfad zu CodeAtlas.html (Standard: neben der Bridge) – wird unter http://<ip>:<port>/ ausgeliefert")
    ap.add_argument("--run", action="append", default=[], metavar="NAME=BEFEHL", help='Zusätzliche Start-Konfiguration ohne Trace, z. B. "Server=npm start"')
    ap.add_argument("--test", action="append", default=[], metavar="NAME=BEFEHL", help='Zusätzlicher Testbefehl ohne Fehlerort-Auswertung, z. B. "Jest=npx jest"')
    ap.add_argument("--no-mcp", action="store_true", help="Claude Code keine Test-Werkzeuge (MCP-Server codeatlas) geben")
    ap.add_argument("--token", help="Festes Token (sonst aus ~/.codeatlas_token bzw. neu erzeugt)")
    ap.add_argument("--model", default="", metavar="MODELL",
                    help="Standardmodell für Claude Code, z. B. fable, opus, sonnet, haiku oder ein voller Modellname (in der Oberfläche umschaltbar)")
    ap.add_argument("--agent", action="append", default=[], metavar="NAME=BEFEHL",
                    help='Zusätzlicher KI-Agent, z. B. "Claude Sonnet=claude --model sonnet" (mehrfach möglich); Claude Code wird automatisch gesucht')
    ap.add_argument("--desktop", action="store_true", help="Oberfläche als eigenes Fenster öffnen (Edge/Chrome im App-Modus), sofort verbunden")
    ap.add_argument("--open", action="store_true", help="Oberfläche im Standardbrowser öffnen")
    a = ap.parse_args()
    global INCLUDE_LIBS
    INCLUDE_LIBS = a.include_libs
    epaths = {}
    for spec in a.editor_path:
        k, _, v = spec.partition("=")
        if v:
            epaths[k.strip().lower().replace("::", "").replace("notepad++", "notepadpp")] = v.strip().strip('"')

    root = Path(a.root)
    if not root.is_dir():
        sys.exit(f"Ordner nicht gefunden: {root}")
    tf = Path.home() / ".codeatlas_token"
    token = a.token or (tf.read_text().strip() if tf.exists() else "")
    if not token:
        token = secrets.token_hex(12)
        try:
            tf.write_text(token)
        except OSError:
            pass
    editors = detect_editors(a.editor_cmd, epaths)
    first = True
    while root:   # Projektwechsel aus der Oberfläche: alles für den neuen Ordner neu aufbauen, gleicher Port, gleiches Token
        root = serve_project(a, root, token, editors, first)
        first = False


def serve_project(a, root, token, editors, first):
    prj = Project(root)
    remember_project(prj.root)
    book = Presets(prj, a.build, a.run)
    presets, run_presets = book.build, book.run
    found = [e for e in editors if e["found"]]
    default = a.editor or ("custom" if a.editor_cmd else (found[0]["id"] if found else None))
    watcher = Watcher(prj)
    watcher.start()
    runner = Runner(prj)
    patches = PatchStore(prj, watcher)
    cps = CheckpointStore(prj, patches)
    loop_host = "127.0.0.1" if a.listen in ("127.0.0.1", "localhost", "0.0.0.0", "::", "::1") else a.listen
    hub = AgentHub(prj, cps, watcher, detect_agents(a.agent), a.port, loop_host)
    hub.skills = SkillBook(prj)
    hub.account = Account(hub.agents[0]["argv"][0], prj)
    hub.default_model = a.model or ""
    hub.mcp = not a.no_mcp
    tsess = TestSessions(prj, runner, a.test)
    graph, rules = GraphStore(prj), JsonStore(prj.root / ".codeatlas" / "rules.json", {"rules": [], "noCycles": False})
    pipe = Pipeline(prj, hub)
    team = TeamHub(prj, hub, hub.agents, a.port)
    hub.tsess, hub.graph, hub.rules, hub.presets = tsess, graph, rules, presets
    ipaddress = __import__("ipaddress")
    allow = []
    for n in a.allow:
        try:
            allow.append(ipaddress.ip_network(n, strict=False))
        except ValueError:
            sys.exit(f"Ungültiges Netz für --allow: {n}")
    app_file = Path(a.app) if a.app else Path(__file__).with_name("CodeAtlas.html")
    if not app_file.is_file():
        app_file = None
    remote = a.listen not in ("127.0.0.1", "localhost", "::1")
    nxt = {"root": None}

    def switcher(path):
        nxt["root"] = path
        threading.Thread(target=lambda: (time.sleep(0.25), srv.shutdown()), daemon=True).start()
    srv = None
    for i in range(40):   # beim Wechsel ist der Port evtl. noch einen Moment belegt
        try:
            srv = ThreadingHTTPServer((a.listen, a.port), make_handler(prj, token, editors, presets, watcher, default, a.editor_cmd, a.port, runner, run_presets,
                                                                       allow, a.host_name, app_file, patches, cps, hub, book, tsess, switcher, graph, pipe, rules, team))
            break
        except OSError:
            if first or i == 39:
                raise
            time.sleep(0.25)
    srv.daemon_threads = True
    print(f"\n  CodeAtlas Bridge {VERSION}" + ("" if first else "  – Projekt gewechselt"))
    print(f"  Projekt : {prj.root}")
    print(f"  Adresse : http://127.0.0.1:{a.port}")
    if remote:
        for ip in local_ips() if a.listen in ("0.0.0.0", "::") else [a.listen]:
            print(f"  Remote  : http://{ip}:{a.port}/#token={token}" + ("" if app_file else "   (CodeAtlas.html fehlt – App selbst öffnen und diese Adresse eintragen)"))
        print("            Nur über VPN/vertrauenswürdiges Netz nutzen – die Verbindung ist unverschlüsselt (HTTP), der Token schützt den Zugriff."
              + ("" if allow else "\n            Tipp: mit --allow 10.8.0.0/24 auf das VPN-Netz beschränken."))
    elif app_file:
        print(f"  App     : http://127.0.0.1:{a.port}/#token={token}")
    print(f"  Token   : {token}")
    print(f"  Editoren: {', '.join(e['label'] for e in found) or '– keiner gefunden (--editor-path / --editor-cmd nutzen)'}")
    if not any(e["id"] == "codeblocks" and e["found"] for e in editors):
        print('            Code::Blocks nicht gefunden → --editor-path codeblocks="C:\\Program Files\\CodeBlocks\\codeblocks.exe"')
    print(f"  Bibliotheken: {'eingeblendet' if INCLUDE_LIBS else 'ausgeblendet (venv, site-packages, third_party …) – --include-libs'}")
    print(f"  Builds  : {', '.join(p['label'] for p in presets) or '–'}")
    print(f"  Starten : {', '.join(p['label'] for p in run_presets) or '– (kein main gefunden; --run \"Name=Befehl\")'}")
    gi = patches.git_info()
    print(f"  Patches : Schnappschüsse in .codeatlas/snapshots · Git: {('Zweig ' + gi['branch']) if gi.get('repo') else ('kein Repository' if gi.get('available') else 'nicht installiert')}")
    for ag in hub.agents:
        print(f"  KI      : {ag['label']} – " + (ag["cmd"] if ag["found"] else f"nicht gefunden ({ag['cmd']}) → Claude Code installieren oder --agent \"Name=Befehl\""))
    hs = hub.hooks_status()
    print(f"            Terminal-Sitzungen mitlesen: {'eingerichtet' if hs['installed'] else 'aus (in der Oberfläche unter KI einschaltbar)'}")
    td = tsess.info()
    print(f"  Tests   : " + (", ".join(x for x in ((f"Python ({td['py']['framework']}) {len(td['py']['files'])} Dateien" if td["py"] else ""),
                                                   (f"C {len(td['c']['files'])} Dateien" + ("" if td["c"]["gcc"] else " – gcc fehlt") if td["c"] else "")) if x) or "– noch keine (test_*.py / test_*.c)")
          + ("" if a.no_mcp else " · Werkzeug für Claude: tests_run"))
    try:
        write_test_support(prj.root / ".codeatlas")
        hub.announce()
        cps.session()
    except OSError as e:
        print(f"            Hinweis: .codeatlas ist nicht schreibbar ({e}) – Kontrollpunkte und Hooks funktionieren dann nicht")
    app_url = f"http://127.0.0.1:{a.port}/#token={token}" if loop_host == "127.0.0.1" else f"http://{loop_host}:{a.port}/#token={token}"
    if (a.desktop or a.open) and not app_file:
        print("  Fenster : CodeAtlas.html fehlt neben der Bridge (--app PFAD) – Oberfläche selbst öffnen")
    elif (a.desktop or a.open) and first:
        print(f"  Fenster : {open_app(app_url, a.desktop)}")
    print("  Beenden mit Strg+C\n")
    try:
        import signal
        signal.signal(signal.SIGTERM, lambda *_: sys.exit(0))    # auch beim Beenden von außen aufräumen
    except (ImportError, ValueError, OSError):
        pass
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\n  Bridge beendet.")
        nxt["root"] = None
    finally:
        hub.close()
        team.close()
        runner.stop(None)
        watcher.alive = False
        watcher.kick()
        srv.server_close()
    if nxt["root"]:
        print(f"\n  → Wechsle zu {nxt['root']} …")
    return nxt["root"]




if __name__ == "__main__":
    main()
