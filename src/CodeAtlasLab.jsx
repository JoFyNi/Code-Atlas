/* ============================================================================
   CodeAtlasLab.jsx — CodeAtlas Compile: Code-Atlas mit semantischem Zoom und Live-Sicht auf die KI
   Lab-Design (dark-first, teal, Space Grotesk + DM Mono), Scope: .cal
   Code / Ordner / ZIP laden → Klassen, Beziehungen, Design Patterns.
   Mit der Bridge (codeatlas_bridge.py ≥ 1.5): Claude Code steuern und mitlesen – was es liest, ändert, ausführt;
   Änderungsebene im Diagramm (neu / geändert / entfernt, neue Verbindungen), Diff und Zurücksetzen per Kontrollpunkt.
   Zoomstufen: 0 Architektur · 1 Beziehungen · 2 Detail · 3 Analyse
   Sprachen (heuristischer Parser, kein AST): TS/JS, Java, C#, C++, Python,
   Go, Kotlin, Swift, PHP, Scala, Dart
   ========================================================================== */
import React, { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

/* ============================ Sprachen ============================ */
const CMT = {
  c:    { line: ["//"], block: [["/*", "*/"]], str: "\"'`" },
  rs:   { line: ["//"], block: [["/*", "*/"]], str: "\"" },
  py:   { line: ["#"], block: [], str: "\"'", triple: true },
  hash: { line: ["#"], block: [], str: "\"'" },
  ruby: { line: ["#"], block: [["=begin", "=end"]], str: "\"'" },
  ps:   { line: ["#"], block: [["<#", "#>"]], str: "\"'" },
  lua:  { line: ["--"], block: [["--[[", "]]"]], str: "\"'" },
  sql:  { line: ["--", "#"], block: [["/*", "*/"]], str: "'\"`" },
  hs:   { line: ["--"], block: [["{-", "-}"]], str: "\"" },
  dash: { line: ["--"], block: [], str: "\"" },
  pct:  { line: ["%"], block: [["%{", "%}"]], str: "\"" },
  bang: { line: ["!"], block: [], str: "\"'" },
  vb:   { line: ["'"], block: [], str: "\"" },
  pas:  { line: ["//"], block: [["(*", "*)"], ["{", "}"]], str: "'" },
  ml:   { line: ["//"], block: [["(*", "*)"]], str: "\"" },
  semi: { line: [";"], block: [], str: "\"" },
  st:   { line: ["//"], block: [["(*", "*)"], ["/*", "*/"]], str: "'\"" },
};
const EXT = {};
const reg = (exts, lang, fam, cmt) => exts.split(" ").forEach((e) => { EXT[e] = { lang, fam, cmt }; });
reg("js jsx mjs cjs", "js", "brace", "c"); reg("ts tsx mts cts", "ts", "brace", "c");
reg("java", "java", "brace", "c"); reg("cs", "cs", "brace", "c");
reg("cpp cc cxx c++ hpp hh hxx ino cu cuh", "cpp", "brace", "c"); reg("c", "c", "brace", "c"); reg("h", "h", "brace", "c");
reg("kt kts", "kt", "brace", "c"); reg("swift", "swift", "brace", "c"); reg("php", "php", "brace", "c");
reg("scala sc", "scala", "brace", "c"); reg("dart", "dart", "brace", "c"); reg("groovy gvy", "groovy", "brace", "c");
reg("rs", "rs", "brace", "rs"); reg("sol", "sol", "brace", "c"); reg("d", "d", "brace", "c"); reg("vala", "vala", "brace", "c");
reg("hx", "hx", "brace", "c"); reg("zig", "zig", "brace", "rs");
reg("go", "go", "go", "c"); reg("py pyi pyw", "py", "py", "py");
reg("st scl iecst stx", "st", "st", "st"); reg("tcpou tcdut tcgvl tcio", "st", "st", "st");
reg("sql", "sql", "sql", "sql");
reg("rb rake gemspec", "rb", "gen", "ruby"); reg("lua", "lua", "gen", "lua"); reg("pl pm", "pl", "gen", "hash");
reg("sh bash zsh ksh fish", "sh", "gen", "hash"); reg("ps1 psm1", "ps", "gen", "ps"); reg("r", "r", "gen", "hash");
reg("jl", "jl", "gen", "hash"); reg("ex exs", "ex", "gen", "hash"); reg("nim", "nim", "gen", "hash"); reg("cr", "cr", "gen", "hash");
reg("tcl", "tcl", "gen", "hash"); reg("coffee", "coffee", "gen", "hash"); reg("awk", "awk", "gen", "hash");
reg("hs lhs", "hs", "gen", "hs"); reg("elm", "elm", "gen", "hs"); reg("vhd vhdl", "vhdl", "gen", "dash"); reg("ada adb ads", "ada", "gen", "dash");
reg("v sv svh", "verilog", "gen", "c"); reg("m", "matlab", "gen", "pct"); reg("erl hrl", "erl", "gen", "pct");
reg("f f90 f95 f03 f08 for", "fortran", "gen", "bang"); reg("vb vbs bas cls frm", "vb", "gen", "vb");
reg("pas pp dpr lpr", "pas", "gen", "pas"); reg("ml mli fs fsx fsi", "ml", "gen", "ml");
reg("clj cljs cljc lisp lsp el scm rkt", "lisp", "gen", "semi"); reg("asm s nasm", "asm", "gen", "semi"); reg("ahk", "ahk", "gen", "semi");
const NOT_CODE = /\.(md|markdown|txt|rst|adoc|json|jsonc|json5|xml|xsd|xaml|ya?ml|toml|ini|cfg|conf|properties|env|csv|tsv|html?|xhtml|css|scss|sass|less|svg|lock|log|cbp|layout|depend|workspace|sln|vcxproj|csproj|filters|user|suo|pbxproj|plist|png|jpe?g|gif|bmp|ico|icns|webp|tiff?|psd|pdf|docx?|xlsx?|pptx?|odt|exe|dll|so|dylib|a|lib|o|obj|ilk|pdb|exp|class|jar|war|pyc|pyo|whl|bin|hex|elf|map|dat|db|sqlite|mdb|woff2?|ttf|otf|eot|mp[34]|wav|ogg|avi|mov|mkv|zip|gz|tgz|bz2|xz|tar|7z|rar|iso|dmg|pkl|npy|onnx|pt|ckpt|gitignore|gitattributes|editorconfig|dockerignore|npmrc|nvmrc)$/i;
const extOf = (p) => { const b = baseName(p); const i = b.lastIndexOf("."); return i > 0 ? b.slice(i + 1).toLowerCase() : ""; };
function langOf(path, text) {
  const ext = extOf(path);
  const L = EXT[ext];
  if (L) {
    if (L.lang === "h") return { ...L, lang: /\b(class\s+\w+\s*[:{]|template\s*<|namespace\s+\w+|public\s*:|private\s*:)/.test(text) ? "cpp" : "c" };
    return L;
  }
  if (!ext || NOT_CODE.test(path)) return null;
  const cm = /\/\/|\/\*/.test(text) ? "c" : /^\s*--/m.test(text) ? "dash" : /^\s*;/m.test(text) ? "semi" : "hash";
  return { lang: ext, fam: "gen", cmt: cm };
}

/* ============================ Konstanten ============================ */
const IGNORE = /(^|\/)(node_modules|\.git|\.svn|\.hg|dist|build|out|target|bin|obj|Debug|Release|x64|venv|\.venv|env|__pycache__|\.next|\.nuxt|coverage|vendor|\.idea|\.vscode|\.vs|\.gradle|Pods|cmake-build-[\w-]+)(\/|$)/;
const MAX_FILE = 1_500_000;
/* Fremdcode: virtuelle Umgebungen, installierte Pakete, Vendor-Kopien – standardmäßig ausgeblendet */
const LIB_RE = /(^|\/)(site-packages|dist-packages|\.?venv[\w.-]*|virtualenvs?|\.tox|\.nox|\.eggs|[\w.-]+\.egg-info|bower_components|jspm_packages|\.mypy_cache|\.pytest_cache|\.ruff_cache|\.dart_tool|\.pub-cache|third[_-]?party)(\/|$)/i;
const LIBS = { ignore: true, hits: new Map(), envRoots: [] };
function libRoot(p) {
  if (!LIBS.ignore) return null;
  const m = LIB_RE.exec(p);
  if (m) return p.slice(0, m.index + m[0].length).replace(/\/$/, "");
  for (const r of LIBS.envRoots) if (p.startsWith(r + "/")) return r;
  return null;
}
const noteLib = (root, n = 1) => LIBS.hits.set(root, (LIBS.hits.get(root) || 0) + n);
/* Versteckte Ordner unterhalb der Projektwurzel sind Arbeitsstand von Werkzeugen (.claude, .codeatlas, Datenbanken von KI-Agenten …) */
const HIDDEN = /\/\.(?!(?:github|gitlab|circleci|devcontainer|husky|storybook)\/)[^\/]+\//;
const ignored = (p) => IGNORE.test(p) || HIDDEN.test(p) || !!libRoot(p);
const KW = new Set(["if","for","while","switch","catch","return","new","else","do","try","function","super","this","throw","typeof","await","yield","sizeof","delete","using","lock","foreach","synchronized","with","case","when","guard","defer","go","select","in","is","as","not","and","or","lambda","print","assert","elif","except","finally","import","from","pass","raise","del","global",
  "void","int","char","float","double","long","short","unsigned","signed","bool","auto","static_cast","dynamic_cast","reinterpret_cast","const_cast","decltype","alignof","offsetof","defined","match","loop","unless","until","end","then","begin","local","fi","done","esac","elseif","foreach","repeat","goto","break","continue","default","nil","null","true","false","None","True","False","self","Self","var","let","const","struct","union","enum","typedef","extern","register","volatile","inline","static","sizeof","_Static_assert","__attribute__","__declspec","asm","__asm"]);
const KWU = new Set(["IF","THEN","ELSE","ELSIF","END_IF","CASE","OF","END_CASE","FOR","TO","BY","DO","END_FOR","WHILE","END_WHILE","REPEAT","UNTIL","END_REPEAT","RETURN","EXIT","NOT","AND","OR","XOR","MOD","TRUE","FALSE","AND_THEN","OR_ELSE","SELECT","FROM","WHERE","INSERT","UPDATE","DELETE","INTO","VALUES","SET","JOIN","ON","GROUP","ORDER","BY","HAVING","AS","CREATE","TABLE","BEGIN","END","DECLARE","EXEC","IN","IS","NULL","LIKE","BETWEEN","EXISTS","COUNT","SUM","AVG","MIN","MAX","CALL","DIM","SUB","FUNCTION","PROCEDURE","PRINT","WRITELN","WRITE","READLN","NEXT","WEND","LOOP","IIF","LEN","PROCESS","PORT","MAP","SIGNAL","DOWNTO","OTHERS","WHEN"]);
const isKw = (n) => KW.has(n) || (n.length > 1 && n === n.toUpperCase() && KWU.has(n));
const MODS = new Set(["public","private","protected","internal","static","final","readonly","abstract","virtual","override","const","volatile","transient","sealed","async","export","declare","default","mutable","inline","explicit","friend","unsafe","extern","open","lateinit","val","var","let","fun","func","def","suspend","native","strictfp","partial","required","dynamic","lazy","weak","unowned","fileprivate","convenience","mutating","operator","infix","tailrec","data","inner","constexpr","new","implicit","late","factory","external","covariant","synchronized","fn","pub","register","thread_local","__inline","__forceinline","noreturn","_Noreturn","WINAPI","CALLBACK","APIENTRY","__stdcall","__cdecl","__fastcall","static_inline"]);
const COLL = /\[\]|\[\s*\w*\s*\]|\b(List|Array|ReadonlyArray|Set|Map|WeakMap|Collection|Iterable|Vector|vector|Vec|list|set|dict|Dict|Sequence|IEnumerable|ICollection|IList|HashMap|HashSet|BTreeMap|ArrayList|LinkedList|Dictionary|Deque|deque|Queue|MutableList|Seq|Iterator|Record|ARRAY)\b|^\[\]/;

const ROW = 18, HEAD = 38, PADT = 6, MAXR = 80;
const GPAD = 44, GTOP = 58, GAPX = 56, GAPY = 74, GGAP = 170;
const KMIN = 0.008, KMAX = 4;
const LV = [
  { name: "Architektur", hint: "Module & Abhängigkeiten", k: 0.07 },
  { name: "Beziehungen", hint: "Klassen, Module & Kanten", k: 0.32 },
  { name: "Detail", hint: "Variablen & Funktionen", k: 0.9 },
  { name: "Analyse", hint: "Signaturen, Zeilen, Aufrufe", k: 1.75 },
];
const lodOf = (k) => (k < 0.17 ? 0 : k < 0.58 ? 1 : k < 1.3 ? 2 : 3);
const EDGE_T = {
  inherit:   { label: "Vererbung",       tok: "accent",  dash: null },
  implement: { label: "Implementierung", tok: "accent2", dash: [7, 5] },
  comp:      { label: "Komposition",     tok: "amber",   dash: null },
  assoc:     { label: "Assoziation",     tok: "violet",  dash: null },
  call:      { label: "Funktionsaufruf", tok: "az",      dash: null },
  data:      { label: "Variablenzugriff",tok: "ay",      dash: [6, 3] },
  imp:       { label: "Include / Import",tok: "fg2",     dash: [3, 4] },
  dep:       { label: "Typ-Abhängigkeit",tok: "fg3",     dash: [2, 4] },
};
const RANK = { inherit: 5, implement: 4, comp: 3, assoc: 2, dep: 1 };
const PAT = {
  singleton: { label: "Singleton", tok: "amber",   why: "Hält eine statische Instanz von sich selbst bzw. liefert sie über getInstance()." },
  factory:   { label: "Factory",   tok: "accent2", why: "Erzeugt Objekte anderer Klassen über create…/make…-Methoden." },
  builder:   { label: "Builder",   tok: "accent2", why: "Fluent-Methoden geben die eigene Klasse zurück, build() liefert das Produkt." },
  observer:  { label: "Observer",  tok: "violet",  why: "Subjekt verwaltet Beobachter (subscribe/attach) und benachrichtigt sie (notify/publish)." },
  strategy:  { label: "Strategy",  tok: "accent",  why: "Austauschbare Implementierungen einer Schnittstelle, gehalten von einem Kontext." },
  decorator: { label: "Decorator", tok: "az",      why: "Implementiert eine Schnittstelle und umhüllt gleichzeitig ein Objekt derselben Schnittstelle." },
  composite: { label: "Composite", tok: "ay",      why: "Enthält eine Sammlung von Objekten seines eigenen Basistyps (Baumstruktur)." },
  adapter:   { label: "Adapter",   tok: "ax",      why: "Übersetzt eine fremde Klasse (Feld) auf eine erwartete Schnittstelle." },
};
const KIND_DE = { class: "", abstract: "abstract", interface: "interface", enum: "enum", struct: "struct", record: "record", object: "object",
  module: "modul", fb: "function_block", program: "program", function: "function", table: "tabelle", hw: "hw-modul", union: "union" };

/* ============================ Hilfsfunktionen ============================ */
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const de = (v, d = 0) => Number(v).toLocaleString("de-DE", { maximumFractionDigits: d, minimumFractionDigits: d });
const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } };
function hexRgb(c) { const m = /^#?([0-9a-f]{6})$/i.exec((c || "").trim()); if (!m) return [128, 128, 128]; const n = parseInt(m[1], 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
const rgba = (c, a) => { const [r, g, b] = hexRgb(c); return `rgba(${r},${g},${b},${a})`; };
const lum = (c) => { const [r, g, b] = hexRgb(c); return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; };
const dirOf = (p) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "(Wurzel)");
function baseName(p) { return p.slice(p.lastIndexOf("/") + 1); }
const stemOf = (p) => { const b = baseName(p); const i = b.lastIndexOf("."); return i > 0 ? b.slice(0, i) : b; };
const short = (s, n) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
const lineCount = (s) => { let n = 1; for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) === 10) n++; return n; };

function matchClose(s, i, o, c) { let d = 0; for (let j = i; j < s.length; j++) { const ch = s[j]; if (ch === o) d++; else if (ch === c) { d--; if (d === 0) return j; } } return s.length - 1; }
function stripGen(s) { let g = 0; while (/<[^<>]*>/.test(s) && g++ < 8) s = s.replace(/<[^<>]*>/g, ""); return s; }
function splitTop(s, sep = ",") {
  const out = []; let d = 0, st = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "(" || c === "[" || c === "{") d++;
    else if (c === ")" || c === "]" || c === "}") d--;
    else if (c === "<" && /[\w$]/.test(s[i - 1] || "")) d++;
    else if (c === ">" && s[i - 1] !== "=" && s[i - 1] !== "-" && d > 0) d--;
    else if (c === sep && d <= 0) { out.push(s.slice(st, i)); st = i + 1; }
  }
  out.push(s.slice(st)); return out.map((x) => x.trim()).filter(Boolean);
}
function splitWs(s) {
  const out = []; let d = 0, cur = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "<" || c === "(" || c === "[") d++; else if ((c === ">" && s[i - 1] !== "=") || c === ")" || c === "]") d = Math.max(0, d - 1);
    if (/\s/.test(c) && d === 0) { if (cur) out.push(cur); cur = ""; } else cur += c;
  }
  if (cur) out.push(cur); return out;
}
function topEq(s) {
  let d = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if ("([{".includes(c)) d++; else if (")]}".includes(c)) d--;
    else if (c === "<" && /[\w$]/.test(s[i - 1] || "")) d++;
    else if (c === ">" && d > 0 && s[i - 1] !== "=" && s[i - 1] !== "-") d--;
    else if (c === "=" && d === 0) {
      const p = s[i - 1], n = s[i + 1];
      if (n === "=" || n === ">" || "=!<>+-*/%&|^?:".includes(p || " ")) continue;
      return i;
    }
  }
  return -1;
}
function topParen(s) {
  let d = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "<" && /[\w$]/.test(s[i - 1] || "")) d++;
    else if (c === ">" && d > 0 && s[i - 1] !== "=") d--;
    else if (c === "[" || c === "{") d++; else if (c === "]" || c === "}") d--;
    else if (c === "(" && d === 0) return i;
  }
  return -1;
}
function colonIdx(s) { for (let i = 0; i < s.length; i++) if (s[i] === ":" && s[i + 1] !== ":" && s[i - 1] !== ":" && s[i + 1] !== "=") return i; return -1; }
const capIds = (s, lim = 80) => { const set = new Set(); const re = /\b([A-Z][\w$]*)\b/g; let m; while ((m = re.exec(s)) && set.size < lim) set.add(m[1]); return set; };
const idsOf = (s) => s.match(/[A-Za-z_$][\w$]*/g) || [];

/* Kommentare & String-Inhalte ausblenden (Zeilen bleiben erhalten) */
function strip(src, cm) {
  const out = src.split(""), n = src.length;
  const blank = (a, b) => { for (let k = a; k < b && k < n; k++) if (out[k] !== "\n") out[k] = " "; };
  let i = 0;
  outer: while (i < n) {
    for (const [o, c] of cm.block) if (src.startsWith(o, i)) { let j = src.indexOf(c, i + o.length); j = j < 0 ? n : j + c.length; blank(i, j); i = j; continue outer; }
    for (const l of cm.line) if (src.startsWith(l, i)) { let j = src.indexOf("\n", i); if (j < 0) j = n; blank(i, j); i = j; continue outer; }
    const ch = src[i];
    if (cm.str.includes(ch)) {
      if (cm.triple && src.startsWith(ch + ch + ch, i)) { let j = src.indexOf(ch + ch + ch, i + 3); j = j < 0 ? n : j; blank(i + 3, j); i = j + 3; continue; }
      let j = i + 1; while (j < n && src[j] !== ch && (ch === "`" || src[j] !== "\n")) { if (src[j] === "\\") j++; j++; }
      blank(i + 1, j); i = j + 1; continue;
    }
    i++;
  }
  return out.join("");
}
const blankRange = (s, a, b) => s.slice(0, a) + s.slice(a, b).replace(/[^\n]/g, " ") + s.slice(b);
function lineIndexer(s) {
  const a = [0]; for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) === 10) a.push(i + 1);
  return (idx) => { let lo = 0, hi = a.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (a[m] <= idx) lo = m; else hi = m - 1; } return lo + 1; };
}
function inferType(init) {
  if (!init) return "";
  let m;
  if ((m = /^new\s+([\w$.]+)/.exec(init))) return m[1];
  if (/^["'`]/.test(init)) return "string";
  if (/^-?\d/.test(init)) return "number";
  if (/^(true|false|True|False|TRUE|FALSE)\b/.test(init)) return "boolean";
  if (/^\[/.test(init)) return "Array";
  if (/^\{/.test(init)) return "object";
  if ((m = /^([A-Z][\w$.]*)\s*\(/.exec(init))) return m[1];
  return "";
}
const cleanInit = (s) => short(s.replace(/(["'`])\s+\1/g, "$1…$1").replace(/\s+/g, " ").trim(), 42);
function visOf(mods, name, lang, sect) {
  if (lang === "rs") return mods.includes("pub") ? "+" : "-";
  if (mods.includes("private") || mods.includes("fileprivate")) return "-";
  if (mods.includes("protected")) return "#";
  if (mods.includes("internal")) return "~";
  if (mods.includes("public")) return "+";
  if (name.startsWith("#")) return "-";
  if (lang === "py") return name.startsWith("__") && !name.endsWith("__") ? "-" : name.startsWith("_") ? "#" : "+";
  if (lang === "go") return /^[A-Z]/.test(name) ? "+" : "-";
  if (lang === "dart") return name.startsWith("_") ? "-" : "+";
  if (sect) return sect;
  if (lang === "java") return "~";
  if (lang === "cs") return "-";
  return "+";
}
function newClass(name, kind, file, lang, line, endLine) {
  return { name, kind, file, lang, line, endLine, ext: [], impl: [], amb: [], fields: [], methods: [], uses: new Set(), news: new Set(), imports: [] };
}

/* Funktionsrumpf analysieren: Aufrufe, Bezeichner, Schreibzugriffe, lokale Variablen */
function scanFn(b, lang) {
  const calls = new Set(), refs = new Set(), writes = new Set(), locals = new Set(); let m;
  const rc = /()(?<![\w$.>:])([A-Za-z_$][\w$]*)\s*\(/g;
  while ((m = rc.exec(b)) && calls.size < 160) if (!isKw(m[2])) calls.add(m[2]);
  const ri = /()(?<![\w$.>])([A-Za-z_$][\w$]*)/g;
  while ((m = ri.exec(b)) && refs.size < 500) if (!isKw(m[2]) && !/^\d/.test(m[2])) refs.add(m[2]);
  const rw = /()(?<![\w$.>])([A-Za-z_$][\w$]*)(?:\s*\[[^\]\n]*\])*(?:\s*(?:\.|->)\s*[A-Za-z_$][\w$]*(?:\s*\[[^\]\n]*\])*)*\s*(?:[-+*/%&|^:]|<<|>>)?=(?!=)/g;
  while ((m = rw.exec(b))) writes.add(m[2]);
  const ri2 = /(?:\+\+|--)\s*([A-Za-z_$][\w$]*)|([A-Za-z_$][\w$]*)\s*(?:\+\+|--)/g;
  while ((m = ri2.exec(b))) writes.add(m[1] || m[2]);
  if (lang === "py") {
    const gl = new Set(); const rg = /\b(?:global|nonlocal)\s+([\w,\s]+)/g;
    while ((m = rg.exec(b))) for (const x of m[1].split(",")) gl.add(x.trim());
    for (const w of writes) if (!gl.has(w)) locals.add(w);
  } else {
    const rl = /(?:^|[;{(,\n]\s*)(?:const\s+|static\s+|register\s+|volatile\s+|unsigned\s+|signed\s+|long\s+|short\s+)*(?:int|char|float|double|long|short|bool|BOOL|BYTE|WORD|DWORD|UINT|size_t|auto|var|let|const|[A-Za-z_]\w*_t|struct\s+\w+|[A-Z][\w]*)\s*[*&]*\s+([A-Za-z_]\w*)\s*(?=[=;\[,)])/g;
    while ((m = rl.exec(b))) locals.add(m[1]);
    const rl2 = /\b(?:let|var|const)\s+(?:mut\s+)?([A-Za-z_$][\w$]*)/g;
    while ((m = rl2.exec(b))) locals.add(m[1]);
  }
  return { calls, refs, writes, locals };
}

/* ============================ Parser: Parameter / Member ============================ */
function parseParam(p, lang) {
  let s = p.replace(/@[\w$.]+(\([^)]*\))?/g, "").trim();
  if (!s || s === "..." || s === "void" || /^&?(mut\s+)?self$/.test(s) || s === "this") return null;
  const eq = topEq(s); let def = "";
  if (eq >= 0) { def = s.slice(eq + 1).trim(); s = s.slice(0, eq).trim(); }
  let prop = null; const pm = /^((?:public|private|protected|readonly|override|val|var)\s+)+/.exec(s);
  if (pm) { prop = pm[0]; s = s.slice(pm[0].length); }
  s = s.replace(/^(\.\.\.|final\s+|ref\s+|out\s+|in\s+|params\s+|this\s+|const\s+|inout\s+|vararg\s+|required\s+|covariant\s+|mut\s+)+/, "").trim();
  let name = "", type = "";
  if (lang === "go") { const t = s.split(/\s+/); if (t.length > 1) { name = t[0]; type = t.slice(1).join(" "); } else type = t[0]; }
  else {
    const ci = colonIdx(s);
    if (ci >= 0 && !["cpp", "c", "cs", "java", "d"].includes(lang)) { name = s.slice(0, ci).replace(/[?!]$/, "").trim(); type = s.slice(ci + 1).trim(); }
    else {
      const m = /([$A-Za-z_][\w$]*)\s*((?:\[\s*\w*\s*\])*)\s*$/.exec(s);
      if (!m) return { name: "", type: s, def };
      const ty = s.slice(0, m.index).trim();
      if (!ty) { if (["js", "ts", "py", "kt", "swift", "scala", "php"].includes(lang)) name = m[1]; else type = m[1]; }
      else { name = m[1]; type = ty + (m[2] ? "[]" : ""); }
    }
  }
  name = name.replace(/^\$/, "");
  const propVis = prop ? (/private/.test(prop) ? "-" : /protected/.test(prop) ? "#" : "+") : null;
  return { name, type, def: cleanInit(def), prop: !!prop && (lang !== "kt" || /\b(val|var)\b/.test(prop)), propVis };
}
function addField(cls, f) { const ex = cls.fields.find((x) => x.name === f.name); if (!ex) { cls.fields.push(f); return f; } return ex; }
function scanBody(cls, body, meth) {
  const u = capIds(body);
  for (const x of u) cls.uses.add(x);
  if (meth) { meth.uses = [...u].slice(0, 40); meth.scan = scanFn(body, cls.lang); }
  let m; const reNew = /\bnew\s+([A-Z][\w$]*)/g;
  while ((m = reNew.exec(body))) cls.news.add(m[1]);
  if (cls.kind === "module") return;
  const reThis = /\b(?:this|self)\.([A-Za-z_$#][\w$]*)\s*(?::\s*([^=\n]+?))?\s*=(?![=>])\s*([^;\n]*)/g;
  while ((m = reThis.exec(body))) {
    const init = m[3].trim(); const ex = cls.fields.find((f) => f.name === m[1].replace(/^#/, ""));
    const isNew = /^new\s+[A-Z]/.test(init) || (cls.lang === "py" && /^[A-Z][\w.]*\(/.test(init));
    const pType = meth && /^[A-Za-z_$][\w$]*$/.test(init) ? (meth.params.find((p) => p.name === init) || {}).type || "" : "";
    if (ex) { if (isNew) { ex.comp = true; if (!ex.type) ex.type = inferType(init); } if (!ex.type && pType) ex.type = pType; }
    else if (meth && (meth.ctor || cls.lang === "js" || cls.lang === "py")) {
      cls.fields.push({ name: m[1].replace(/^#/, ""), type: (m[2] || "").trim() || pType || inferType(init), init: pType ? "" : cleanInit(init), vis: visOf([], m[1], cls.lang), static: false, line: meth.line, comp: isNew });
    }
  }
}
function mkMethod(cls, txt, pI, lang, sect, line, body, file) {
  const pClose = matchClose(txt, pI, "(", ")");
  let pre = txt.slice(0, pI).trim().replace(/<[^<>]*(?:<[^<>]*>[^<>]*)*>\s*$/, "").trim();
  const nm = /(~?[#$A-Za-z_][\w$]*)\s*[?!]?$/.exec(pre);
  if (!nm) return null;
  const name = nm[1]; if (!(name === "new" && lang === "rs") && (isKw(name) || MODS.has(name))) return null;
  const toks = splitWs(pre.slice(0, nm.index).trim());
  const mods = toks.filter((t) => MODS.has(t));
  const typeT = toks.filter((t) => !MODS.has(t) && t !== "get" && t !== "set" && t !== "*" && t !== "function");
  const acc = toks.includes("get") ? "get " : toks.includes("set") ? "set " : "";
  const after = txt.slice(pClose + 1);
  let ret = "", am;
  if (["ts", "js", "kt", "scala", "php", "py"].includes(lang) && (am = /^\s*:\s*([^{=;]+)/.exec(after))) ret = am[1];
  else if ((am = /^\s*->\s*([^{]+)/.exec(after))) ret = am[1];
  else if (lang === "go") ret = after.replace(/\{.*$/, "");
  else ret = typeT.join(" ");
  ret = ret.replace(/\bthrows\b.*$/, "").replace(/\b(const|override|noexcept|final|where\b.*)\b/g, "").replace(/=\s*0\s*$/, "").trim();
  const params = splitTop(txt.slice(pI + 1, pClose)).map((p) => parseParam(p, lang)).filter(Boolean);
  const isCtor = name === "constructor" || (name === cls.name && cls.kind !== "module") || name === "init" || name === "__construct" || name === "__init__" || name === "new" && lang === "rs";
  const meth = {
    name: acc + name.replace(/^#/, ""), params, ret: isCtor ? "" : ret, vis: visOf(mods, name, lang, sect),
    static: mods.includes("static"), abstract: mods.includes("abstract") || ((cls.kind === "interface") && !body) || /=\s*0\s*$/.test(after), ctor: isCtor && cls.kind !== "module",
    line, endLine: line + lineCount(txt.trim()) - 1 + (body ? lineCount(body) - 1 : 0), uses: [], decl: !body && cls.kind === "module" && /^(c|cpp|h|d)$/.test(lang), file,
  };
  if (cls.kind === "module" && /^(c|cpp|h|d)$/.test(lang)) { meth.vis = meth.static ? "-" : "+"; meth.static = false; }
  if (meth.ctor) for (const p of params) if (p.prop) addField(cls, { name: p.name, type: p.type, init: "", vis: p.propVis || "+", static: false, line, comp: false, fromCtor: true });
  if (body) scanBody(cls, body, meth);
  const ex = cls.methods.find((x) => x.name === meth.name && cls.kind === "module");
  if (ex) { if (body && ex.decl) Object.assign(ex, meth, { declLine: ex.line, declFile: ex.file }); return ex; }
  cls.methods.push(meth);
  return meth;
}
function mkField(cls, txt, lang, sect, line, file) {
  const eq = topEq(txt);
  let decl = (eq >= 0 ? txt.slice(0, eq) : txt).trim();
  const init = eq >= 0 ? txt.slice(eq + 1).trim() : "";
  const toks = splitWs(decl); const mods = toks.filter((t) => MODS.has(t));
  let name = "", type = "", extra = [];
  const ci = colonIdx(decl);
  if (ci >= 0 && !["cpp", "c", "cs", "java", "d"].includes(lang)) {
    const ids = idsOf(decl.slice(0, ci));
    const hashName = /#([\w$]+)\s*[?!]?\s*$/.exec(decl.slice(0, ci));
    name = hashName ? "#" + hashName[1] : ids[ids.length - 1] || "";
    type = decl.slice(ci + 1).trim();
  } else {
    const parts = splitTop(decl, ",");
    const first = parts[0] || "";
    const m = /([#$A-Za-z_][\w$]*)\s*((?:\[[^\]]*\])*)\s*$/.exec(first);
    if (!m) return null;
    name = m[1];
    type = splitWs(first.slice(0, m.index)).filter((t) => !MODS.has(t)).join(" ") + (m[2] ? "[]" : "");
    extra = parts.slice(1).map((p) => (/([A-Za-z_$][\w$]*)/.exec(p) || [])[1]).filter(Boolean);
  }
  if (!name || isKw(name)) return null;
  if (cls.kind === "module" && !type && !init && /^(c|cpp|d)$/.test(lang)) return null;
  if (lang === "php") name = name.replace(/^\$/, "");
  let vis = visOf(mods, name, lang, sect), isStatic = mods.includes("static");
  if (cls.kind === "module" && /^(c|cpp|d)$/.test(lang)) { vis = isStatic ? "-" : "+"; isStatic = false; }
  const comp = /\bnew\s+[A-Z]/.test(init) || (lang === "kt" && /^[A-Z][\w.]*\(/.test(init));
  const base = { type: type || inferType(init), init: cleanInit(init), vis, static: isStatic || (mods.includes("const") && lang === "cpp" && cls.kind !== "module"), line, comp,
    isConst: (mods.includes("const") || mods.includes("final") || mods.includes("readonly")), file };
  const f = addField(cls, { name: name.replace(/^#/, ""), ...base });
  for (const x of extra) addField(cls, { name: x, ...base, init: "" });
  return f;
}

/* ============================ Parser: Klammer-Sprachen ============================ */
function parseBody(cls, s, start, end, lang, lineOf, opts = {}) {
  const semiless = ["js", "ts", "kt", "swift", "scala", "go", "rs"].includes(lang);
  let sect = lang === "cpp" && !opts.top ? (cls.kind === "struct" ? "+" : "-") : cls.kind === "interface" || cls.kind === "enum" ? "+" : null;
  let i = start, st = start, pd = 0, bd = 0, ad = 0, enumDone = cls.kind !== "enum";
  const handle = (e, bs, be) => {
    const raw = s.slice(st, e);
    let t = raw, lm;
    while ((lm = /^\s*(public|private|protected|internal|signals|public\s+slots|private\s+slots|protected\s+slots)\s*:(?!:)/.exec(t))) {
      const v = lm[1]; sect = v.startsWith("public") ? "+" : v.startsWith("private") ? "-" : v.startsWith("protected") ? "#" : "~"; t = t.slice(lm[0].length);
    }
    t = t.replace(/@[\w$.]+(\s*\((?:[^()]|\([^()]*\))*\))?/g, " ").replace(/^\s*(\[[^\]]*\]\s*)+/, "").replace(/#\[[^\]]*\]/g, " ").replace(/\bpub\s*\([^)]*\)/g, "pub");
    const lead = raw.length - raw.trimStart().length;
    t = t.trim(); if (!t) return;
    const line = lineOf(st + lead);
    const body = bs != null ? s.slice(bs + 1, be) : null;
    if (opts.top) {
      if (/^(namespace|extern\s+"C"|declare\s+module|mod|module|impl)\b/.test(t) && bs != null) {
        if (/^(namespace|extern|declare|module)/.test(t)) parseBody(cls, s, bs + 1, be, lang, lineOf, opts);
        return;
      }
      let im;
      if ((im = /^(?:import|use|using|from|package|mod|require|include)\b\s*(.*)$/s.exec(t))) {
        const m2 = /["']([^"']+)["']/.exec(t) || /^(?:mod|use)\s+([\w:]+)/.exec(t) || /^import\s+(?:static\s+)?([\w.]+)/.exec(t);
        if (m2 && !/^(package|using)/.test(t)) cls.imports.push(m2[1]);
        return;
      }
      if (/^(export\s+)?(type|typedef)\b|^module\.exports|^exports\./.test(t) && !/\(/.test(t.split("=")[0] || "")) return;
      if (lang === "go" && /^func\s*\(/.test(t)) return;
      if (/^extern\b/.test(t) && bs == null) {
        const n = /([A-Za-z_]\w*)\s*(?:\[[^\]]*\])*\s*$/.exec(t.replace(/\(.*$/, "")); if (n) (cls.externs || (cls.externs = new Set())).add(n[1]); return;
      }
      if (/^(export\s+)?(default\s+)?(abstract\s+)?(class|interface|enum|struct|union|trait)\b/.test(t)) return;
    } else if (/\b(class|interface|enum|struct|record|trait|protocol|union)\s+[A-Za-z_$]/.test(t) || /^(companion\s+)?object\b/.test(t)) return;
    if (!enumDone) {
      enumDone = true;
      if (!/\b(public|private|protected|static|fun|void|def|func|fn)\b/.test(t) && topParen(t.replace(/\([^)]*\)/g, "")) < 0) {
        for (const p of splitTop(t, ",")) { const n = /^([A-Za-z_$][\w$]*)/.exec(p); if (n) cls.fields.push({ name: n[1], type: "", init: "", vis: "+", static: true, line, comp: false, isConst: true }); }
        return;
      }
    }
    const pI = topParen(t), eI = topEq(t);
    let res = null;
    if (pI >= 0 && (eI < 0 || pI < eI)) res = mkMethod(cls, t, pI, lang, sect, line, body, opts.file);
    else {
      if (eI >= 0) {
        const rhs = t.slice(eI + 1);
        if (/=>/.test(rhs) || /^\s*(async\s+)?function\b/.test(rhs)) {
          const left = t.slice(0, eI).replace(/:[^:]*$/, "").trim();
          const p2 = topParen(rhs);
          if (p2 >= 0) { mkMethod(cls, left + " " + rhs.slice(p2), left.length + 1, lang, sect, line, body, opts.file); return; }
        }
      }
      if (bs != null && pI < 0 && eI < 0 && splitWs(t).length < 2) return;
      res = mkField(cls, t, lang, sect, line, opts.file);
    }
    if (res && opts.top && /^require\s*\(/.test((res.init || ""))) { const rq = /\(\s*["']?([^"')]+)/.exec(res.init); if (rq) cls.imports.push(rq[1]); }
  };
  while (i < end) {
    const c = s[i];
    if (c === "(") pd++; else if (c === ")") pd--; else if (c === "[") bd++; else if (c === "]") bd--;
    else if (opts.comma && c === "<" && /\w/.test(s[i - 1] || "")) ad++;
    else if (opts.comma && c === ">" && ad > 0 && s[i - 1] !== "-" && s[i - 1] !== "=") ad--;
    else if (c === "{") { const e = Math.min(matchClose(s, i, "{", "}"), end); handle(i, i, e); i = e + 1; st = i; pd = 0; bd = 0; continue; }
    else if ((c === ";" || (opts.comma && c === "," && ad === 0)) && pd <= 0 && bd <= 0) { handle(i); st = i + 1; }
    else if (c === "\n" && semiless && pd <= 0 && bd <= 0 && !opts.comma) {
      const cur = s.slice(st, i).trim();
      if (cur && !/([,=(:|&+\-*?.<]|=>)$/.test(cur) && enumDone) {
        let j = i + 1; while (j < end && /\s/.test(s[j])) j++;
        const nx = s[j];
        if (!nx || !".=:|&?){>,+-*<".includes(nx)) { handle(i); st = i + 1; }
      }
    }
    i++;
  }
  if (st < end) handle(end);
}
function parseHeader(cls, h, lang) {
  let s = stripGen(h.trim());
  if (s.startsWith("(")) {
    const e = matchClose(s, 0, "(", ")");
    for (const p of splitTop(s.slice(1, e))) {
      const isProp = lang === "scala" || lang === "java" || lang === "cs" || /\b(val|var)\b/.test(p);
      if (!isProp) continue;
      const pr = parseParam(p, lang); if (pr && pr.name) addField(cls, { name: pr.name, type: pr.type, init: pr.def, vis: pr.propVis || "+", static: false, line: cls.line, comp: false });
    }
    s = s.slice(e + 1);
  }
  let g = 0; while (/\([^()]*\)/.test(s) && g++ < 5) s = s.replace(/\([^()]*\)/g, "");
  s = s.replace(/\bwhere\b.*$/, "");
  const names = (str) => splitTop(str).map((x) => x.replace(/\b(public|private|protected|virtual|open|final)\b/g, "").trim())
    .map((x) => { const m = /[A-Za-z_$][\w$]*(?:(?:\.|::)[A-Za-z_$][\w$]*)*/.exec(x); return m ? m[0].replace(/::/g, ".") : ""; }).filter(Boolean);
  let m;
  if ((m = /\bextends\s+(.+?)(?=\bimplements\b|\bwith\b|$)/.exec(s))) cls.ext.push(...names(m[1]));
  if ((m = /\bimplements\s+(.+?)(?=\bwith\b|$)/.exec(s))) cls.impl.push(...names(m[1]));
  if (lang === "sol" && (m = /\bis\s+(.+)$/.exec(s))) cls.amb.push(...names(m[1]));
  for (const w of s.matchAll(/\bwith\s+([\w$.]+)/g)) cls.impl.push(w[1]);
  if (!cls.ext.length && !cls.impl.length && (m = /^\s*:\s*(.+)$/.exec(s))) cls.amb.push(...names(m[1]));
}
function parseBraceFile(path, s0, lang, lineOf, pend, raw) {
  const out = []; let s = s0; const blanks = [];
  // C/C++: Präprozessor
  const mod = newClass(stemOf(path), "module", path, lang, 1, lineOf(s.length));
  if (/^(c|cpp|d)$/.test(lang) || lang === "h") {
    const rp = /^[ \t]*#[ \t]*(\w+)([^\n\\]*(?:\\\n[^\n\\]*)*)/gm; let m;
    const src = raw && raw.length === s0.length ? raw.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (x) => x.replace(/[^\n]/g, " ")) : s0;
    while ((m = rp.exec(src))) {
      const d = m[1], rest = m[2].trim();
      if (d === "include") { const q = /["<]([^">]+)[">]/.exec(rest); if (q) mod.imports.push(q[1]); }
      else if (d === "define") {
        const dm = /^([A-Za-z_]\w*)(\([^)]*\))?\s*(.*)$/s.exec(rest);
        if (dm && !/_H(_|EADER)?_*$|^_+\w*_H_*$/.test(dm[1]) && (dm[3] || dm[2]) && mod.fields.length < 120) {
          if (dm[2]) mod.methods.push({ name: dm[1], params: splitTop(dm[2].slice(1, -1)).map((p) => ({ name: p, type: "", def: "" })), ret: "#define", vis: "+", static: false, abstract: false, ctor: false, line: lineOf(m.index), endLine: lineOf(m.index), uses: [], macro: true, file: path, scan: scanFn(dm[3], lang) });
          else mod.fields.push({ name: dm[1], type: "", init: cleanInit(dm[3].replace(/\\\n/g, " ")), vis: "+", static: false, line: lineOf(m.index), comp: false, isConst: true, macro: true, file: path });
        }
      }
      blanks.push([m.index, m.index + m[0].length]);
    }
    for (const [a, b] of blanks) s = blankRange(s, a, b);
    // anonyme typedef struct/union/enum { … } Name;
    const rt = /\btypedef\s+(struct|union|enum)\s*([A-Za-z_]\w*)?\s*\{/g;
    while ((m = rt.exec(s))) {
      const open = m.index + m[0].length - 1, close = matchClose(s, open, "{", "}");
      const tail = /^\s*\*?\s*([A-Za-z_]\w*)[^;]*;/.exec(s.slice(close + 1));
      const name = tail ? tail[1] : m[2]; if (!name) continue;
      const kind = m[1] === "enum" ? "enum" : m[1] === "union" ? "union" : "struct";
      const cls = newClass(name, kind, path, lang === "h" ? "c" : lang, lineOf(m.index), lineOf(close));
      if (m[2] && m[2] !== name) cls.alias = m[2];
      parseBody(cls, s, open + 1, close, lang === "h" ? "c" : lang, lineOf, { file: path, comma: kind === "enum" });
      if (kind === "enum") cls.fields.forEach((f) => { f.isConst = true; f.static = true; f.vis = "+"; f.type = ""; });
      out.push(cls);
      const endIdx = close + 1 + (tail ? tail[0].length : 0);
      s = blankRange(s, m.index, endIdx); rt.lastIndex = m.index + 1;
    }
  }
  const re = /\b(enum\s+(?:class\s+|struct\s+)?|class\s+|interface\s+|struct\s+|union\s+|record\s+|trait\s+|object\s+|protocol\s+|contract\s+)([A-Za-z_$][\w$]*)([^{;]*)\{/g;
  let m;
  const ranges = [];
  while ((m = re.exec(s))) {
    const kw = m[1].trim().split(/\s+/)[0], name = m[2], header = m[3];
    if (["extends", "implements", "where", "of"].includes(name)) continue;
    if (/\b(class|interface|enum|struct|record|trait|object|protocol)\s+[A-Za-z_$]/.test(header)) { re.lastIndex = m.index + m[1].length; continue; }
    if (kw === "object" && !["kt", "scala"].includes(lang)) continue;
    if (kw === "trait" && !["scala", "php", "rs"].includes(lang)) continue;
    if (kw === "protocol" && lang !== "swift") continue;
    if (kw === "record" && !["java", "cs"].includes(lang)) continue;
    if ((kw === "struct" || kw === "union") && !["cpp", "c", "h", "cs", "swift", "rs", "d", "zig"].includes(lang)) continue;
    if (kw === "contract" && lang !== "sol") continue;
    if (kw === "class" && (lang === "c" || lang === "rs")) continue;
    let hp = header, g = 0; while (/\([^()]*\)/.test(hp) && g++ < 5) hp = hp.replace(/\([^()]*\)/g, "");
    if (/(^|[^=!<>])=(?![=>])/.test(hp)) continue;
    const open = m.index + m[0].length - 1, close = matchClose(s, open, "{", "}");
    const before = s.slice(Math.max(0, m.index - 80), m.index);
    let kind = kw === "interface" || kw === "protocol" || kw === "trait" ? "interface" : kw === "enum" ? "enum" : kw === "struct" ? "struct" : kw === "union" ? "union" : kw === "record" ? "record" : kw === "object" ? "object" : "class";
    if (kind === "class" && /\babstract\s+(?:[\w]+\s+)*$/.test(before)) kind = "abstract";
    if (kind === "class" && /\bdata\s+$/.test(before)) kind = "record";
    const cl = lang === "h" ? "c" : lang;
    const cls = newClass(name, kind, path, cl, lineOf(m.index), lineOf(close));
    parseHeader(cls, header, cl);
    parseBody(cls, s, open + 1, close, cl, lineOf, { comma: cl === "rs" && kind !== "interface", file: path });
    if (kind === "interface") for (const mm of cls.methods) if (!mm.static) mm.abstract = true;
    if (kind === "class" && cls.methods.some((x) => x.abstract)) cls.kind = "abstract";
    out.push(cls);
    // C: struct tag { … } var;  → globale Variable
    const tail = /^\s*([A-Za-z_][\w\s,*\[\]]*);/.exec(s.slice(close + 1));
    if (/^(c|cpp)$/.test(cl) && tail && !/\btypedef\s+$/.test(before)) mod.fields.push({ name: tail[1].replace(/[*\s]/g, "").split(",")[0].replace(/\[.*$/, ""), type: name, init: "", vis: "+", static: false, line: lineOf(close), comp: false, file: path });
    const modPre = /((?:\b(?:pub(?:\s*\([^)]*\))?|export|default|public|private|protected|internal|abstract|static|final|sealed|data|declare|partial|open|inner|unsafe)\s+)*)$/.exec(s.slice(Math.max(0, m.index - 80), m.index));
    ranges.push([m.index - (modPre ? modPre[1].length : 0), close + 1 + (tail ? tail[0].length : 0)]);
  }
  // Rust: impl-Blöcke
  if (lang === "rs") {
    const ri = /\bimpl\b([^{;]*)\{/g;
    while ((m = ri.exec(s))) {
      const open = m.index + m[0].length - 1, close = matchClose(s, open, "{", "}");
      const h = stripGen(m[1]).trim(); const fm = /^([\w:]+)\s+for\s+([\w:]+)/.exec(h);
      const type = (fm ? fm[2] : h.split(/\s/)[0]).split("::").pop(), trait = fm ? fm[1].split("::").pop() : null;
      const tmp = newClass(type, "class", path, "rs", lineOf(m.index), lineOf(close));
      parseBody(tmp, s, open + 1, close, "rs", lineOf, { file: path });
      pend.rsImpl.push({ type, trait, cls: tmp });
      ranges.push([m.index, close + 1]); ri.lastIndex = close + 1;
    }
  }
  // Modul-Ebene: freie Funktionen & globale Variablen
  let top = s;
  for (const [a, b] of ranges) top = blankRange(top, a, b);
  if (lang === "go") return { classes: out, module: mod, top };
  parseBody(mod, top, 0, top.length, lang === "h" ? "c" : lang, lineOf, { top: true, file: path });
  return { classes: out, module: mod };
}

/* ============================ Parser: Python ============================ */
function parsePy(path, s, lineOf) {
  const lines = s.split("\n"), out = [];
  const ind = (l) => l.match(/^[ \t]*/)[0].replace(/\t/g, "    ").length;
  const bal = (t) => { let d = 0; for (const c of t) { if (c === "(" || c === "[") d++; else if (c === ")" || c === "]") d--; } return d; };
  const mod = newClass(stemOf(path), "module", path, "py", 1, lines.length);
  const pyDef = (cls, k, last, mi, decos) => {
    const t = lines[k].trim(); const dm = /^(async\s+)?def\s+([A-Za-z_]\w*)\s*\(/.exec(t);
    let sig = t, kk = k; while (bal(sig) > 0 && kk < last) { kk++; sig += " " + lines[kk].trim(); }
    const pO = sig.indexOf("("), pC = matchClose(sig, pO, "(", ")");
    const params = splitTop(sig.slice(pO + 1, pC)).map((p) => {
      const q = p.replace(/=.*$/, "").trim(); const ci2 = q.indexOf(":");
      return ci2 >= 0 ? { name: q.slice(0, ci2).trim(), type: q.slice(ci2 + 1).trim(), def: "" } : { name: q, type: "", def: "" };
    }).filter((p) => p.name && p.name !== "self" && p.name !== "cls" && p.name !== "*" && p.name !== "/");
    const rm = /->\s*([^:]+):/.exec(sig.slice(pC + 1));
    let be = kk + 1; while (be <= last && (lines[be].trim() === "" || ind(lines[be]) > mi)) be++;
    const name = dm[2], isProp = decos.includes("property");
    const meth = { name: (isProp ? "get " : "") + name, params, ret: rm ? rm[1].trim() : "", vis: visOf([], name, "py"),
      static: decos.includes("staticmethod") || decos.includes("classmethod"), abstract: decos.some((d) => d.includes("abstractmethod")),
      ctor: name === "__init__" && cls.kind !== "module", line: k + 1, endLine: be, uses: [], file: path };
    cls.methods.push(meth);
    scanBody(cls, lines.slice(kk + 1, be).join("\n"), meth);
    return be - 1;
  };
  const classRanges = [];
  for (let i = 0; i < lines.length; i++) {
    const m = /^([ \t]*)class\s+([A-Za-z_]\w*)\s*(?:\(([^)]*)\))?\s*:/.exec(lines[i]);
    if (!m) continue;
    const ci = ind(lines[i]); let end = i + 1;
    while (end < lines.length && (lines[end].trim() === "" || ind(lines[end]) > ci)) end++;
    let last = end - 1; while (last > i && lines[last].trim() === "") last--;
    if (ci === 0) classRanges.push([i, last]);
    const cls = newClass(m[2], "class", path, "py", i + 1, last + 1);
    for (const b0 of (m[3] || "").split(",")) {
      const b = b0.trim(); if (!b || b === "object") continue;
      if (/metaclass\s*=\s*ABCMeta/.test(b)) { cls.kind = "abstract"; continue; }
      if (b.includes("=")) continue;
      if (/^(abc\.)?ABC$/.test(b)) { cls.kind = "abstract"; continue; }
      if (/Protocol$/.test(b)) { cls.kind = "interface"; continue; }
      if (/^(enum\.)?(Int|Str)?Enum$/.test(b)) { cls.kind = "enum"; continue; }
      cls.ext.push(b.replace(/\[.*$/, ""));
    }
    let mi = -1; for (let k = i + 1; k <= last; k++) if (lines[k].trim()) { mi = ind(lines[k]); break; }
    let decos = [];
    for (let k = i + 1; k <= last; k++) {
      const L = lines[k], t = L.trim(); if (!t || ind(L) !== mi) continue;
      if (t.startsWith("@")) { decos.push(t.slice(1).split("(")[0]); continue; }
      if (/^(async\s+)?def\s/.test(t)) { k = pyDef(cls, k, last, mi, decos); decos = []; continue; }
      const am = /^([A-Za-z_]\w*)\s*(?::\s*([^=]+?))?\s*(?:=\s*(.*))?$/.exec(t);
      if (am && (am[2] || am[3] !== undefined) && am[1] !== "class") {
        const init = (am[3] || "").trim();
        addField(cls, { name: am[1], type: (am[2] || "").trim() || inferType(init), init: cleanInit(init), vis: visOf([], am[1], "py"),
          static: !am[2] && cls.kind !== "enum", line: k + 1, comp: /^[A-Z][\w.]*\(/.test(init), isConst: cls.kind === "enum" });
      }
      decos = [];
    }
    out.push(cls);
  }
  // Modul-Ebene
  let decos = [];
  for (let k = 0; k < lines.length; k++) {
    if (classRanges.some(([a, b]) => k >= a && k <= b)) { if (classRanges.some(([a]) => a === k)) { /* skip */ } continue; }
    const L = lines[k], t = L.trim(); if (!t || ind(L) !== 0) continue;
    if (t.startsWith("@")) { decos.push(t.slice(1).split("(")[0]); continue; }
    let im;
    if ((im = /^from\s+([\w.]+)\s+import/.exec(t)) || (im = /^import\s+([\w.]+)/.exec(t))) { mod.imports.push(im[1]); continue; }
    if (/^(async\s+)?def\s/.test(t)) { k = pyDef(mod, k, lines.length - 1, 0, decos); decos = []; continue; }
    const am = /^([A-Za-z_]\w*)\s*(?::\s*([^=]+?))?\s*=(?!=)\s*(.*)$/.exec(t);
    if (am && !/^(if|for|while|with|try|elif|else|except|return)$/.test(am[1])) {
      addField(mod, { name: am[1], type: (am[2] || "").trim() || inferType(am[3].trim()), init: cleanInit(am[3]), vis: visOf([], am[1], "py"), static: false, line: k + 1, comp: false, isConst: /^[A-Z_0-9]+$/.test(am[1]), file: path });
    }
    decos = [];
  }
  return { classes: out, module: mod };
}

/* ============================ Parser: Go ============================ */
function parseGo(path, s, lineOf, pend) {
  const out = []; let m; const ranges = [];
  const re = /\btype\s+([A-Za-z_]\w*)(?:\[[^\]]*\])?\s+(struct|interface)\s*\{/g;
  while ((m = re.exec(s))) {
    const open = m.index + m[0].length - 1, close = matchClose(s, open, "{", "}");
    ranges.push([m.index, close + 1]);
    const cls = newClass(m[1], m[2] === "struct" ? "struct" : "interface", path, "go", lineOf(m.index), lineOf(close));
    const body = s.slice(open + 1, close); let off = open + 1;
    for (const L of body.split("\n")) {
      const t = L.trim().replace(/\s+`.*$/, "").replace(/\s*""\s*$/, ""); const line = lineOf(off); off += L.length + 1;
      if (!t) continue;
      if (m[2] === "interface") {
        const p = t.indexOf("(");
        if (p > 0) { const pC = matchClose(t, p, "(", ")"); cls.methods.push({ name: t.slice(0, p).trim(), params: splitTop(t.slice(p + 1, pC)).map((x) => parseParam(x, "go")).filter(Boolean), ret: t.slice(pC + 1).trim(), vis: visOf([], t, "go"), static: false, abstract: true, ctor: false, line, uses: [] }); }
        else cls.ext.push(t.replace(/^\*/, ""));
      } else {
        const tk = t.split(/\s+/);
        if (tk.length === 1) cls.ext.push(tk[0].replace(/^\*/, ""));
        else for (const nm of tk[0].split(",").filter(Boolean)) cls.fields.push({ name: nm, type: tk.slice(1).join(" "), init: "", vis: visOf([], nm, "go"), static: false, line, comp: !/^\*|^\[\]\*/.test(tk.slice(1).join(" ")) && /^[A-Z\[]/.test(tk[1] || "") });
      }
    }
    out.push(cls);
  }
  const rf = /\bfunc\s*\(\s*(?:\w+\s+)?\*?\s*([A-Za-z_]\w*)(?:\[[^\]]*\])?\s*\)\s*([A-Za-z_]\w*)\s*\(/g;
  while ((m = rf.exec(s))) {
    const pO = m.index + m[0].length - 1, pC = matchClose(s, pO, "(", ")");
    const rest = s.slice(pC + 1); const b = rest.indexOf("{");
    const ret = b >= 0 ? rest.slice(0, b).trim() : "";
    const bo = pC + 1 + b, bc = b >= 0 ? matchClose(s, bo, "{", "}") : bo;
    const body = s.slice(bo, bc);
    pend.goMethods.push({ type: m[1], dir: dirOf(path), meth: { name: m[2], params: splitTop(s.slice(pO + 1, pC)).map((x) => parseParam(x, "go")).filter(Boolean), ret, vis: visOf([], m[2], "go"), static: false, abstract: false, ctor: false, line: lineOf(m.index), endLine: lineOf(bc), uses: [...capIds(body)].slice(0, 40), scan: scanFn(body, "go"), file: path } });
  }
  const mod = newClass(stemOf(path), "module", path, "go", 1, lineOf(s.length));
  let top = s; for (const [a, b] of ranges) top = blankRange(top, a, b);
  const imps = /\bimport\s*(\(([^)]*)\)|"([^"]*)")/g;
  while ((m = imps.exec(top))) { mod.imports.push(...(m[3] != null ? [m[3]] : [])); top = blankRange(top, m.index, m.index + m[0].length); }
  top = top.replace(/^\s*package\s+\w+/m, (x) => x.replace(/./g, " "));
  parseBody(mod, top, 0, top.length, "go", lineOf, { top: true, file: path });
  return { classes: out, module: mod };
}

/* ============================ Parser: IEC 61131-3 Structured Text ============================ */
const SECT_VIS = { VAR_INPUT: "I", VAR_OUTPUT: "O", VAR_IN_OUT: "X", VAR: "-", VAR_STAT: "-", VAR_INST: "-", VAR_TEMP: "T", VAR_GLOBAL: "G", VAR_EXTERNAL: "E", VAR_CONFIG: "G" };
function stVars(text, base, lineOf, path) {
  const out = []; let m;
  const re = /\b(VAR_INPUT|VAR_OUTPUT|VAR_IN_OUT|VAR_GLOBAL|VAR_TEMP|VAR_STAT|VAR_EXTERNAL|VAR_INST|VAR_CONFIG|VAR)\b((?:[ \t]+(?:CONSTANT|RETAIN|PERSISTENT|NON_RETAIN))*)([\s\S]*?)\bEND_VAR\b/gi;
  while ((m = re.exec(text))) {
    const sect = m[1].toUpperCase(), flags = m[2].toUpperCase(), body = m[3];
    let off = m.index + m[0].indexOf(body);
    for (const decl of body.split(";")) {
      const lineIdx = base + off + (decl.length - decl.trimStart().length); off += decl.length + 1;
      const d = decl.trim(); if (!d) continue;
      const ci = colonIdx(d); if (ci < 0) continue;
      const names = d.slice(0, ci).replace(/\bAT\s+%\S+/i, "").split(",").map((x) => x.trim()).filter((x) => /^[A-Za-z_]\w*$/.test(x));
      let rest = d.slice(ci + 1).trim(); const ie = rest.indexOf(":="); const init = ie >= 0 ? rest.slice(ie + 2).trim() : ""; if (ie >= 0) rest = rest.slice(0, ie).trim();
      for (const n of names) out.push({ name: n, type: rest, init: cleanInit(init), vis: SECT_VIS[sect] || "-", sect, static: false, line: lineOf(lineIdx), comp: (sect === "VAR" || sect === "VAR_STAT" || sect === "VAR_INST") && /^[A-Z]/i.test(rest) && !/^(BOOL|BYTE|WORD|DWORD|LWORD|SINT|INT|DINT|LINT|USINT|UINT|UDINT|ULINT|REAL|LREAL|TIME|LTIME|DATE|TOD|DT|STRING|WSTRING|ARRAY|POINTER|REFERENCE|CHAR|WCHAR)\b/i.test(rest), isConst: /CONSTANT/.test(flags), file: path });
    }
  }
  return out;
}
function parseST(path, s, lineOf) {
  const out = []; let m; const ranges = [];
  const reP = /\b(FUNCTION_BLOCK|PROGRAM|FUNCTION|INTERFACE|CLASS)\b\s+((?:(?:PUBLIC|PRIVATE|PROTECTED|INTERNAL|FINAL|ABSTRACT)\s+)*)([A-Za-z_]\w*)([^\n]*)/gi;
  while ((m = reP.exec(s))) {
    const kwU = m[1].toUpperCase();
    const em = new RegExp("\\bEND_" + kwU + "\\b", "i").exec(s.slice(m.index));
    const end = em ? m.index + em.index : s.length;
    let text = s.slice(m.index, end);
    const kind = { FUNCTION_BLOCK: "fb", PROGRAM: "program", FUNCTION: "function", INTERFACE: "interface", CLASS: "class" }[kwU];
    const cls = newClass(m[3], /ABSTRACT/i.test(m[2]) ? "abstract" : kind, path, "st", lineOf(m.index), lineOf(end));
    if (kind === "fb") cls.kind = /ABSTRACT/i.test(m[2]) ? "abstract" : "fb";
    const h = m[4]; let hm;
    if ((hm = /\bEXTENDS\s+([\w.,\s]+?)(?=\bIMPLEMENTS\b|$)/i.exec(h))) cls.ext.push(...hm[1].split(",").map((x) => x.trim()).filter(Boolean));
    if ((hm = /\bIMPLEMENTS\s+([\w.,\s]+)/i.exec(h))) cls.impl.push(...hm[1].split(",").map((x) => x.trim()).filter(Boolean));
    const ret = kind === "function" && (hm = /:\s*([\w.]+)/.exec(h)) ? hm[1] : "";
    // Methoden
    const reM = /\b(METHOD|PROPERTY)\b\s+((?:(?:PUBLIC|PRIVATE|PROTECTED|INTERNAL|FINAL|ABSTRACT)\s+)*)([A-Za-z_]\w*)\s*(?::\s*([^\n;]+))?/gi; let mm;
    while ((mm = reM.exec(text))) {
      const isProp = mm[1].toUpperCase() === "PROPERTY";
      const me = new RegExp("\\bEND_" + mm[1].toUpperCase() + "\\b", "i").exec(text.slice(mm.index));
      const mEnd = me ? mm.index + me.index : text.length;
      const mt = text.slice(mm.index, mEnd);
      const vars = stVars(mt, m.index + mm.index, lineOf, path);
      const lastEv = mt.toUpperCase().lastIndexOf("END_VAR");
      const body = lastEv >= 0 ? mt.slice(lastEv + 7) : mt.slice(mm[0].length);
      const mods = (mm[2] || "").toLowerCase().split(/\s+/);
      const meth = { name: (isProp ? "prop " : "") + mm[3], params: vars.filter((v) => v.sect === "VAR_INPUT" || v.sect === "VAR_IN_OUT").map((v) => ({ name: v.name, type: v.type, def: v.init })), ret: (mm[4] || "").trim(),
        vis: visOf(mods, mm[3], "st", "+"), static: false, abstract: mods.includes("abstract") || cls.kind === "interface", ctor: /^FB_init$/i.test(mm[3]), line: lineOf(m.index + mm.index), endLine: lineOf(m.index + mEnd), uses: [], file: path };
      meth.scan = scanFn(body, "st"); for (const v of vars) meth.scan.locals.add(v.name);
      cls.methods.push(meth);
      text = blankRange(text, mm.index, mEnd + (me ? me[0].length : 0)); reM.lastIndex = mm.index + 1;
    }
    cls.fields.push(...stVars(text, m.index, lineOf, path));
    const lastEv = text.toUpperCase().lastIndexOf("END_VAR");
    const hdrEnd = m.index + m[0].length;
    const body = lastEv >= 0 ? text.slice(lastEv + 7) : s.slice(hdrEnd, end);
    if (body.trim() && kind !== "interface") {
      const bOff = lastEv >= 0 ? m.index + lastEv + 7 : hdrEnd;
      const meth = { name: kind === "function" ? m[3] : "Rumpf", params: kind === "function" ? cls.fields.filter((f) => f.sect === "VAR_INPUT" || f.sect === "VAR_IN_OUT").map((f) => ({ name: f.name, type: f.type, def: "" })) : [],
        ret, vis: "+", static: false, abstract: false, ctor: false, body: true, line: lineOf(bOff + (body.length - body.trimStart().length)), endLine: lineOf(end), uses: [], file: path };
      meth.scan = scanFn(body, "st"); cls.methods.unshift(meth);
    }
    out.push(cls); ranges.push([m.index, end + (em ? em[0].length : 0)]);
    reP.lastIndex = end + (em ? em[0].length : 0);
  }
  const reT = /\bTYPE\b\s+([A-Za-z_]\w*)\s*(?:EXTENDS\s+([\w.]+)\s*)?:\s*([\s\S]*?)\bEND_TYPE\b/gi;
  while ((m = reT.exec(s))) {
    const body = m[3];
    const isEnum = /^\s*\(/.test(body);
    const cls = newClass(m[1], isEnum ? "enum" : /^\s*UNION/i.test(body) ? "union" : "struct", path, "st", lineOf(m.index), lineOf(m.index + m[0].length));
    if (m[2]) cls.ext.push(m[2]);
    if (isEnum) { const p = body.indexOf("("), pc = matchClose(body, p, "(", ")"); for (const c of splitTop(body.slice(p + 1, pc))) { const n = /^([A-Za-z_]\w*)/.exec(c); if (n) cls.fields.push({ name: n[1], type: "", init: (c.split(":=")[1] || "").trim(), vis: "+", static: true, line: cls.line, comp: false, isConst: true }); } }
    else {
      const sb = body.replace(/^\s*(STRUCT|UNION)/i, "").replace(/END_(STRUCT|UNION)[\s\S]*$/i, "");
      cls.fields.push(...stVars("VAR\n" + sb + "\nEND_VAR", m.index + m[0].indexOf(body) - 4, lineOf, path).map((f) => ({ ...f, vis: "+", sect: "" })));
      if (!cls.fields.length && /^\s*[A-Za-z_]/.test(body)) continue;
    }
    out.push(cls); ranges.push([m.index, m.index + m[0].length]);
  }
  let top = s; for (const [a, b] of ranges) top = blankRange(top, a, b);
  const mod = newClass(stemOf(path), "module", path, "st", 1, lineOf(s.length));
  mod.fields.push(...stVars(top, 0, lineOf, path).filter((f) => f.sect === "VAR_GLOBAL" || f.sect === "VAR_CONFIG"));
  return { classes: out, module: mod };
}

/* ============================ Parser: SQL ============================ */
function parseSQL(path, s, lineOf) {
  const out = []; let m;
  const mod = newClass(stemOf(path), "module", path, "sql", 1, lineOf(s.length));
  const reT = /\bCREATE\s+(?:OR\s+REPLACE\s+)?(?:TEMP(?:ORARY)?\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([\w.`"\[\]]+)\s*\(/gi;
  const nm = (x) => x.replace(/[`"\[\]]/g, "").split(".").pop();
  while ((m = reT.exec(s))) {
    const open = m.index + m[0].length - 1, close = matchClose(s, open, "(", ")");
    const cls = newClass(nm(m[1]), "table", path, "sql", lineOf(m.index), lineOf(close));
    const pk = new Set(), fk = new Map(); let off = open + 1;
    for (const part of splitTop(s.slice(open + 1, close))) {
      let q;
      if ((q = /^(?:CONSTRAINT\s+\S+\s+)?PRIMARY\s+KEY\s*\(([^)]*)\)/i.exec(part))) q[1].split(",").forEach((x) => pk.add(nm(x.trim())));
      else if ((q = /^(?:CONSTRAINT\s+\S+\s+)?FOREIGN\s+KEY\s*\(([^)]*)\)\s*REFERENCES\s+([\w.`"\[\]]+)/i.exec(part))) q[1].split(",").forEach((x) => fk.set(nm(x.trim()), nm(q[2])));
      else if (!/^(UNIQUE|INDEX|KEY|CHECK|CONSTRAINT)\b/i.test(part)) {
        const c = /^([\w`"\[\]]+)\s+([\w]+(?:\s*\([^)]*\))?)(.*)$/s.exec(part); if (!c) continue;
        const name = nm(c[1]), rest = c[3];
        const ref = /REFERENCES\s+([\w.`"\[\]]+)/i.exec(rest); if (ref) fk.set(name, nm(ref[1]));
        if (/PRIMARY\s+KEY/i.test(rest)) pk.add(name);
        const idx = s.indexOf(part, off); off = idx >= 0 ? idx : off;
        cls.fields.push({ name, type: c[2].replace(/\s+/g, ""), init: (/DEFAULT\s+(\S+)/i.exec(rest) || [])[1] || "", vis: /NOT\s+NULL/i.test(rest) ? "+" : "~", static: false, line: lineOf(off), comp: false, isConst: false, nn: /NOT\s+NULL/i.test(rest) });
      }
    }
    for (const f of cls.fields) { if (pk.has(f.name)) { f.pk = true; f.vis = "#"; } if (fk.has(f.name)) { f.fkTo = fk.get(f.name); f.type = fk.get(f.name) + " (" + f.type + ")"; } }
    out.push(cls);
  }
  const reF = /\bCREATE\s+(?:OR\s+REPLACE\s+)?(?:DEFINER\s*=\s*\S+\s+)?(FUNCTION|PROCEDURE|TRIGGER|VIEW)\s+(?:IF\s+NOT\s+EXISTS\s+)?([\w.`"\[\]]+)\s*(\([^)]*\))?/gi;
  const hits = [...s.matchAll(reF)];
  hits.forEach((h, k) => {
    const end = k + 1 < hits.length ? hits[k + 1].index : s.length; const body = s.slice(h.index + h[0].length, end);
    const meth = { name: nm(h[2]), params: h[3] ? splitTop(h[3].slice(1, -1)).map((p) => { const t = p.trim().split(/\s+/); return { name: t[0].replace(/^(IN|OUT|INOUT)$/i, "") || t[1], type: t.slice(1).join(" "), def: "" }; }) : [],
      ret: h[1].toLowerCase(), vis: "+", static: false, abstract: false, ctor: false, line: lineOf(h.index), endLine: lineOf(end), uses: [], file: path };
    meth.scan = scanFn(body, "sql");
    const tabs = new Set(); const rt = /\b(?:FROM|JOIN|INTO|UPDATE|TABLE)\s+([\w.`"\[\]]+)/gi; let t;
    while ((t = rt.exec(body))) tabs.add(nm(t[1]));
    meth.tables = [...tabs]; mod.methods.push(meth);
  });
  return { classes: out, module: mod };
}

/* ============================ Parser: generisch (jede Sprache) ============================ */
const GEN_DEFS = [
  /^([ \t]*)(?:(?:local|export|public|private|protected|static|async|pub|override|abstract|virtual|shared|friend|recursive|pure|elemental|integer|real|logical|character|global|inline|extern|declare)\s+)*(?:function|func|fn|def|defp|defmacro|sub|proc|procedure|method|subroutine|fun|constructor|destructor)\s+(?:\[[^\]\n]*\]\s*=\s*|[A-Za-z_]\w*\s*=\s*(?=[A-Za-z_]\w*\s*\())?([A-Za-z_$][\w$]*(?:[.:][A-Za-z_$][\w$]*)*[!?]?)\s*(\([^)\n]*\)?)?/gim,
  /^([ \t]*)(?:function\s+)?([A-Za-z_][\w-]*)\s*\(\)\s*\{/gm,
  /^([ \t]*)(?:local\s+)?([\w.:]+)\s*(?:<-|=)\s*function\s*(\([^)\n]*\))/gm,
  /^()([a-z_]\w*)\s*::\s*.+$/gm,
  /^()([a-z]\w*)\s*(\([^)\n]*\))\s*(?:when\s.*)?->/gm,
];
const GEN_CLS = [
  /^([ \t]*)(?:(?:public|private|abstract|sealed|final|partial)\s+)*(class|module|defmodule|struct|interface|object|record|entity|trait|actor)\s+([A-Za-z_][\w.:]*)(?:\s*(?:<|extends|:|is|inherits|\(|of)\s*([\w.:]+))?/gim,
  /^([ \t]*)()([A-Za-z_]\w*)\s*=\s*(?:packed\s+)?(?:class|object|record|interface)\s*(?:\(\s*([\w.]+))?/gim,
];
function parseGeneric(path, s, lang, lineOf) {
  const lines = s.split("\n"), out = [];
  const ind = (l) => l.match(/^[ \t]*/)[0].replace(/\t/g, "    ").length;
  const mod = newClass(stemOf(path), "module", path, lang, 1, lines.length);
  const lineStart = []; { let p = 0; for (const L of lines) { lineStart.push(p); p += L.length + 1; } }
  const at = (idx) => lineOf(idx) - 1;
  const defs = [];
  for (const re of GEN_CLS) for (const m of s.matchAll(re)) defs.push({ t: "c", li: at(m.index), ind: m[1].replace(/\t/g, "    ").length, kw: (m[2] || "class").toLowerCase(), name: m[3], base: m[4] });
  for (const re of GEN_DEFS) for (const m of s.matchAll(re)) {
    if (!m[2] || isKw(m[2]) || /^(if|for|while|switch|return|end)$/i.test(m[2])) continue;
    const li = at(m.index); if (defs.some((d) => d.li === li)) continue;
    defs.push({ t: "f", li, ind: (m[1] || "").replace(/\t/g, "    ").length, name: m[2], params: m[3] || "" });
  }
  // VHDL / Verilog
  if (lang === "vhdl") for (const m of s.matchAll(/^([ \t]*)entity\s+(\w+)\s+is/gim)) defs.push({ t: "c", li: at(m.index), ind: 0, kw: "hw", name: m[2] });
  if (lang === "verilog") for (const m of s.matchAll(/^([ \t]*)module\s+(\w+)/gm)) { const d = defs.find((x) => x.li === at(m.index)); if (d) { d.kw = "hw"; d.t = "c"; } else defs.push({ t: "c", li: at(m.index), ind: 0, kw: "hw", name: m[2] }); }
  defs.sort((a, b) => a.li - b.li);
  const classes = new Map();
  const getCls = (name, li, kw) => {
    if (!classes.has(name)) { const c = newClass(name, kw === "interface" || kw === "trait" ? "interface" : kw === "hw" ? "hw" : kw === "struct" || kw === "record" ? "struct" : "class", path, lang, li + 1, li + 1); classes.set(name, c); out.push(c); }
    return classes.get(name);
  };
  const stack = [];
  const endOf = (k) => { const d = defs[k]; for (let j = k + 1; j < defs.length; j++) if (defs[j].ind <= d.ind) return defs[j].li - 1; return lines.length - 1; };
  const covered = new Array(lines.length).fill(false);
  defs.forEach((d, k) => {
    while (stack.length && (d.ind <= stack[stack.length - 1].ind || d.li > stack[stack.length - 1].end)) stack.pop();
    let end = endOf(k);
    if (d.t === "c") {
      // Klassenende: nächste nicht-leere Zeile mit Einrückung ≤ Klasse (außer erste Zeile)
      let e = d.li + 1; while (e < lines.length && (lines[e].trim() === "" || ind(lines[e]) > d.ind || /^\s*(end|End|END|\}|begin|BEGIN|is|IS|port|PORT|\(|\))/.test(lines[e]) && ind(lines[e]) >= d.ind && e === d.li + 1)) e++;
      if (/^(end|End|END)\b/.test((lines[e] || "").trim()) && ind(lines[e]) === d.ind) e++;
      end = Math.max(d.li, e - 1);
      const c = getCls(d.name.split(/[.:]/).pop(), d.li, d.kw); c.endLine = end + 1;
      if (d.base) c.amb.push(d.base.split(/[.:]/).pop());
      if (d.kw === "hw" || lang === "vhdl") {
        const txt = lines.slice(d.li, end + 1).join("\n"); let q;
        const rpv = /^\s*([\w,\s]+?)\s*:\s*(in|out|inout|buffer)\s+([^;:\n)]+)/gim;
        while ((q = rpv.exec(txt))) for (const n of q[1].split(",")) c.fields.push({ name: n.trim(), type: q[3].trim(), init: "", vis: q[2].toLowerCase() === "in" ? "I" : q[2].toLowerCase() === "out" ? "O" : "X", static: false, line: d.li + lineCount(txt.slice(0, q.index)) + 1, comp: false });
        const rpl = /\b(input|output|inout)\s+(?:wire|reg|logic)?\s*(\[[^\]]*\])?\s*([\w,\s]+?)\s*[;,)\n]/g;
        while ((q = rpl.exec(txt))) for (const n of q[3].split(",")) if (n.trim()) c.fields.push({ name: n.trim(), type: (q[2] || "1 bit"), init: "", vis: q[1] === "input" ? "I" : q[1] === "output" ? "O" : "X", static: false, line: d.li + lineCount(txt.slice(0, q.index)) + 1, comp: false });
      }
      stack.push({ ind: d.ind, end, cls: c });
      return;
    }
    let owner = mod, name = d.name, isStatic = false;
    const pm = /^(.+)[.:]([^.:]+)$/.exec(d.name);
    if (pm) { if (pm[1] === "self") { isStatic = true; owner = stack.length ? stack[stack.length - 1].cls : mod; } else owner = getCls(pm[1].split(/[.:]/).pop(), d.li, "class"); name = pm[2]; }
    else if (stack.length && d.ind > stack[stack.length - 1].ind) owner = stack[stack.length - 1].cls;
    const first = lines[d.li].includes(")") ? lines[d.li].replace(/^.*?\)/, "") : "";
    const body = first + "\n" + lines.slice(d.li + 1, end + 1).join("\n");
    for (let j = d.li; j <= end; j++) covered[j] = true;
    const params = d.params ? splitTop(d.params.replace(/^\(|\)$/g, "")).map((p) => { const q = p.replace(/=.*$/, "").trim(); const ci = colonIdx(q); return ci >= 0 ? { name: q.slice(0, ci).trim(), type: q.slice(ci + 1).trim(), def: "" } : { name: q.split(/\s+/).pop().replace(/^[$@%&*]/, ""), type: q.split(/\s+/).slice(0, -1).join(" "), def: "" }; }).filter((p) => p.name && p.name !== "self") : [];
    const ex = owner.methods.find((x) => x.name === name);
    const meth = { name, params, ret: "", vis: /^_/.test(name) || /^\s*(private|local)\b/i.test(lines[d.li]) ? "-" : "+", static: isStatic, abstract: false, ctor: /^(initialize|__init__|new|constructor|init)$/i.test(name) && owner !== mod, line: d.li + 1, endLine: end + 1, uses: [], file: path };
    meth.scan = scanFn(body, lang); for (const p of params) meth.scan.locals.add(p.name);
    if (lang === "lisp") { const rc = /\(\s*([A-Za-z_][\w\-!?*]*)/g; let q; while ((q = rc.exec(body))) meth.scan.calls.add(q[1]); }
    if (ex) { if (!ex.scan || !ex.scan.calls.size) Object.assign(ex, { scan: meth.scan, endLine: meth.endLine, implLine: meth.line }); }
    else owner.methods.push(meth);
    for (const x of capIds(body, 40)) owner.uses.add(x);
    if (owner !== mod) { const ra = /(?:@|\bself\.)([A-Za-z_]\w*)\s*=(?![=>~])\s*([^\n;]*)/g; let q; while ((q = ra.exec(body)) && owner.fields.length < 120) addField(owner, { name: q[1], type: inferType(q[2].trim()), init: cleanInit(q[2]), vis: lang === "rb" ? "-" : "+", static: false, line: d.li + 1 + lineCount(body.slice(0, q.index)), comp: /^[A-Z][\w.:]*\.new\b|^new\s/.test(q[2].trim()), file: path }); }
  });
  // globale Variablen & Imports
  lines.forEach((L, k) => {
    if (covered[k]) return; const t = L.trim(); if (!t) return;
    let q;
    if ((q = /\brequire(?:_relative)?\s*\(?\s*["']([^"']+)["']/.exec(L)) || (q = /^(?:import|use|using|include|source|\.)\s+["']?([\w./:-]+)/.exec(t)) || (q = /^#include\s*["<]([^">]+)/.exec(t))) { mod.imports.push(q[1]); return; }
    if (ind(L) !== 0 || stack.some((x) => x.cls && k >= x.cls.line - 1 && k <= x.cls.endLine - 1)) return;
    if ((q = /^(?:Dim|Public|Private|Global|Const)\s+(\w+)\s+As\s+([\w.]+)/i.exec(t))) { addField(mod, { name: q[1], type: q[2], init: "", vis: /^Private/i.test(t) ? "-" : "+", static: false, line: k + 1, comp: false, file: path }); return; }
    if ((q = /^(?:signal|variable|constant|shared\s+variable)\s+([\w,\s]+?)\s*:\s*([^;:=]+)/i.exec(t))) { for (const n of q[1].split(",")) addField(mod, { name: n.trim(), type: q[2].trim(), init: "", vis: "+", static: false, line: k + 1, comp: false, file: path }); return; }
    if ((q = /^(?:local\s+|my\s+|our\s+|var\s+|let\s+|const\s+|export\s+|readonly\s+|declare\s+(?:-\w+\s+)*|global\s+)?[$@%]?([A-Za-z_]\w*)\s*(?::\s*([^=\n]+?))?\s*(?:=|<-|:=)(?![=>])\s*(.*)$/.exec(t)) && !isKw(q[1]) && mod.fields.length < 150) {
      if (/^\s*(function|func|fn|def|sub|proc|lambda|\(\s*\)\s*->)\b/.test(q[3])) return;
      addField(mod, { name: q[1], type: (q[2] || "").trim() || inferType(q[3].trim()), init: cleanInit(q[3]), vis: /^local\b|^my\b/.test(t) ? "-" : "+", static: false, line: k + 1, comp: false, isConst: /^const\b|^readonly\b/.test(t) || /^[A-Z_][A-Z_0-9]+$/.test(q[1]), file: path });
    }
  });
  return { classes: out, module: mod };
}

/* ============================ Projekt parsen ============================ */
export function parseFile(path, text, pend) {
  const L = langOf(path, text);
  if (!L) return { classes: [], module: null };
  if (/^tc/.test(extOf(path))) text = [...text.matchAll(/<!\[CDATA\[([\s\S]*?)\]\]>/g)].map((m) => m[1]).join("\n");
  const s = strip(text, CMT[L.cmt]), lineOf = lineIndexer(s);
  if (L.fam === "py") return parsePy(path, s, lineOf);
  if (L.fam === "go") return parseGo(path, s, lineOf, pend);
  if (L.fam === "st") return parseST(path, s, lineOf);
  if (L.fam === "sql") return parseSQL(path, s, lineOf);
  if (L.fam === "gen") return parseGeneric(path, s, L.lang, lineOf);
  return parseBraceFile(path, s, L.lang, lineOf, pend, text);
}
export async function parseProject(files, onProgress) {
  const pend = { goMethods: [], cppUses: [], rsImpl: [] };
  const classes = [], modules = [], langs = {}; let t0 = performance.now(); const warn = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    try {
      const r = parseFile(f.path, f.text, pend);
      classes.push(...r.classes);
      if (r.module) { r.module.files = [f.path]; modules.push(r.module); }
      const L = langOf(f.path, f.text); if (L) langs[L.lang] = (langs[L.lang] || 0) + 1;
    } catch (e) { warn.push(`${f.path}: ${e.message}`); }
    if (performance.now() - t0 > 30) { onProgress && onProgress(i + 1); await new Promise((r) => setTimeout(r, 0)); t0 = performance.now(); }
  }
  const byKey = new Map(classes.map((c) => [dirOf(c.file) + "|" + c.name, c]));
  for (const g of pend.goMethods) {
    const c = byKey.get(g.dir + "|" + g.type); if (!c) continue;
    c.methods.push(g.meth); for (const u of g.meth.uses) c.uses.add(u);
  }
  const byName = new Map(); for (const c of classes) if (!byName.has(c.name)) byName.set(c.name, c);
  for (const im of pend.rsImpl) {
    const c = byName.get(im.type); if (!c) continue;
    for (const mm of im.cls.methods) if (!c.methods.some((x) => x.name === mm.name)) c.methods.push(mm);
    for (const u of im.cls.uses) c.uses.add(u);
    if (im.trait) c.impl.push(im.trait);
  }
  // C/C++: .c + .h gleichen Namens zu einem Modul zusammenführen
  const merged = new Map(), keep = [];
  const cfam = (m) => /^(c|cpp|h|d)$/.test(m.lang);
  for (const m of modules) {
    if (!cfam(m)) { keep.push(m); continue; }
    const key = dirOf(m.file) + "|" + stemOf(m.file);
    const ex = merged.get(key);
    if (!ex) { merged.set(key, m); keep.push(m); continue; }
    const [prim, sec] = /\.(h|hh|hpp|hxx)$/i.test(ex.file) && !/\.(h|hh|hpp|hxx)$/i.test(m.file) ? [m, ex] : [ex, m];
    for (const f of sec.fields) if (!prim.fields.some((x) => x.name === f.name)) prim.fields.push(f);
    for (const mm of sec.methods) {
      const pm = prim.methods.find((x) => x.name === mm.name);
      if (!pm) prim.methods.push(mm);
      else if (pm.decl && !mm.decl) Object.assign(pm, mm, { declLine: pm.line, declFile: pm.file });
      else if (!pm.decl && mm.decl) { pm.declLine = mm.line; pm.declFile = mm.file; }
    }
    prim.imports.push(...sec.imports); prim.files = [prim.file, sec.file];
    for (const u of sec.uses) prim.uses.add(u);
    if (sec.externs) for (const x of sec.externs) (prim.externs || (prim.externs = new Set())).add(x);
    if (prim !== ex) { keep[keep.indexOf(ex)] = prim; merged.set(key, prim); }
  }
  const mods = keep.filter((m) => m.methods.length || m.fields.length);
  for (const m of mods) { m.methods.sort((a, b) => (a.file === b.file ? a.line - b.line : a.file === m.file ? -1 : 1)); m.endLine = Math.max(m.endLine, ...m.methods.filter((x) => x.file === m.file).map((x) => x.endLine || 0)); }
  return { classes, modules: mods, langs, warn, fileCount: files.length };
}

/* ============================ Datei-Import ============================ */
let jszipP = null;
function loadJSZip() {
  if (window.JSZip) return Promise.resolve(window.JSZip);
  if (!jszipP) jszipP = new Promise((res, rej) => {
    const s = document.createElement("script"); s.src = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
    s.onload = () => res(window.JSZip); s.onerror = () => { jszipP = null; rej(new Error("JSZip konnte nicht geladen werden")); };
    document.head.appendChild(s);
  });
  return jszipP;
}
const isCandidate = (p) => !ignored(p) && !!extOf(p) && !NOT_CODE.test(p) && !/\.(min|d)\.(js|ts)$/.test(p);
async function walkEntries(entries) {
  const out = [];
  const walk = async (en, prefix) => {
    if (en.isFile) { const f = await new Promise((r, j) => en.file(r, j)); out.push({ file: f, path: prefix + f.name }); }
    else if (en.isDirectory) {
      if (IGNORE.test(prefix + en.name + "/")) return;
      const lr = libRoot(prefix + en.name + "/"); if (lr) { noteLib(lr); return; }
      const rd = en.createReader(); let batch; const kids = [];
      do { batch = await new Promise((r, j) => rd.readEntries(r, j)); kids.push(...batch); } while (batch.length);
      if (LIBS.ignore && kids.some((x) => x.isFile && x.name === "pyvenv.cfg")) { noteLib(prefix + en.name, kids.length); return; }
      for (const x of kids) await walk(x, prefix + en.name + "/");
    }
  };
  for (const en of entries) await walk(en, "");
  return out;
}

/* ============================ Text-Encoding (UTF-8 / Windows-1252, CRLF) ============================ */
const CP1252_HI = "€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008DŽ\u008F\u0090‘’“”•–—˜™š›œ\u009DžŸ";
function decodeBytes(buf) {
  const u8 = new Uint8Array(buf);
  const head = u8.subarray(0, 8000);
  for (let i = 0; i < head.length; i++) if (head[i] === 0) return null;
  const bom = u8[0] === 0xef && u8[1] === 0xbb && u8[2] === 0xbf;
  let text, encoding;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(bom ? u8.subarray(3) : u8); encoding = bom ? "utf-8-sig" : "utf-8"; }
  catch { text = new TextDecoder("windows-1252").decode(u8); encoding = "windows-1252"; }
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  return { text: text.replace(/\r\n/g, "\n"), encoding, eol };
}
function encodeText(text, encoding, eol) {
  let t = text.replace(/\r\n/g, "\n");
  if (eol === "\r\n") t = t.replace(/\n/g, "\r\n");
  if (encoding === "windows-1252") {
    const out = new Uint8Array(t.length);
    for (let i = 0; i < t.length; i++) {
      const c = t.charCodeAt(i);
      if (c < 0x80 || (c >= 0xa0 && c <= 0xff)) out[i] = c;
      else { const j = CP1252_HI.indexOf(t[i]); out[i] = j >= 0 ? 0x80 + j : 0x3f; }
    }
    return out;
  }
  const b = new TextEncoder().encode(t);
  if (encoding === "utf-8-sig") { const o = new Uint8Array(b.length + 3); o.set([0xef, 0xbb, 0xbf]); o.set(b, 3); return o; }
  return b;
}
const BIN_RE = /\.(png|jpe?g|gif|bmp|ico|icns|webp|tiff?|psd|pdf|docx?|xlsx?|pptx?|odt|exe|dll|so|dylib|a|lib|o|obj|ilk|pdb|exp|class|jar|war|pyc|pyo|whl|bin|hex|elf|dat|db|sqlite|mdb|woff2?|ttf|otf|eot|mp[34]|wav|ogg|avi|mov|mkv|zip|gz|tgz|bz2|xz|tar|7z|rar|iso|dmg|pkl|npy|onnx|pt|ckpt)$/i;
const MAX_AUX = 600_000;
const kindOfPath = (p) => (BIN_RE.test(p) ? "bin" : isCandidate(p) ? "code" : "text");

/* Upload / Drop / ZIP → Einträge (alle Dateien; Code wird analysiert, Text ist durchsuch- und editierbar, Binär nur gelistet) */
async function collect(list) {
  const out = []; const skipped = {};
  const skip = (p) => { const e = extOf(p) || "(ohne Endung)"; skipped[e] = (skipped[e] || 0) + 1; };
  const add = (path, size, mtime, buf) => {
    let kind = kindOfPath(path);
    if (ignored(path)) return;
    const lim = kind === "code" ? MAX_FILE : MAX_AUX;
    if (kind === "bin" || size > lim || !buf) { out.push({ path, size, mtime, kind: "bin" }); if (kind === "code") skip(path); return; }
    const d = decodeBytes(buf);
    if (!d) { out.push({ path, size, mtime, kind: "bin" }); if (kind === "code") skip(path); return; }
    out.push({ path, size, mtime, kind, ...d });
  };
  LIBS.envRoots = list.filter((x) => /(^|\/)pyvenv\.cfg$/.test(x.path)).map((x) => dirOf(x.path));
  for (const { file, path } of list) {
    if (/\.zip$/i.test(path) && list.length < 4) {
      const JSZip = await loadJSZip(); const zip = await JSZip.loadAsync(file);
      for (const z of Object.values(zip.files)) {
        if (z.dir || IGNORE.test(z.name)) continue;
        { const lr = libRoot(z.name); if (lr) { noteLib(lr); continue; } }
        const kind = kindOfPath(z.name);
        add(z.name, z._data && z._data.uncompressedSize || 0, z.date ? +z.date : 0, kind === "bin" ? null : await z.async("arraybuffer"));
      }
      continue;
    }
    if (IGNORE.test(path)) continue;
    { const lr = libRoot(path); if (lr) { noteLib(lr); continue; } }
    const kind = kindOfPath(path);
    const lim = kind === "code" ? MAX_FILE : MAX_AUX;
    add(path, file.size, file.lastModified, kind === "bin" || file.size > lim ? null : await file.arrayBuffer());
  }
  if (!out.some((e) => e.kind === "code")) for (const e of out) if (e.kind !== "code") skip(e.path);
  return { entries: out, skipped };
}

/* ============================ Live-Ausführung: Datenhaltung (mehrere Läufe) ============================ */
const THREAD_TOK = ["accent", "az", "amber", "violet", "ay", "accent2", "ax"];
const RUN_TOK = ["accent", "amber", "violet", "az", "ay", "ax", "accent2"];
const MAX_EV = 3000, MAX_OUT = 6000, MAX_PART = 800;
function createLive() {
  return {
    status: "idle", runs: new Map(), runSeq: 0,
    codes: new Map(), threads: new Map(), events: [], errors: [], out: [], chan: new Map(),
    particles: [], bursts: [], totals: { calls: 0, errs: 0, warn: 0, fatal: 0 }, rate: 0, rev: 0, _lt: 0, _rt: 0, _rc: 0,
    dbg: { mode: "run", slow: 0, reason: "" }, bps: [], bpKeys: new Set(), pauseFocus: null, trace: true,
  };
}
function liveReset(L) {
  const keep = { bps: L.bps, bpKeys: L.bpKeys, dbg: { ...L.dbg, reason: "" }, rev: L.rev + 1 };
  const running = [...L.runs.values()].filter((r) => r.status === "running" || r.status === "building");
  Object.assign(L, createLive(), keep);
  for (const r of running) L.runs.set(r.id, { ...r });   // laufende Läufe nicht vergessen
  liveStatus(L);
}
function liveStatus(L) {
  const rs = [...L.runs.values()];
  L.status = rs.some((r) => r.status === "building") ? "building" : rs.some((r) => r.status === "running") ? "running" : rs.length ? "ended" : "idle";
  L.trace = rs.some((r) => r.trace) || !rs.length;
}
const ck = (run, i) => (i < 0 || i == null ? -1 : run + ":" + i);
function liveCode(L, key) {
  let c = L.codes.get(key);
  if (!c) { c = { key, run: +String(key).split(":")[0] || 0, name: "?", path: null, line: 0, target: null, calls: 0, errs: 0, warn: 0, raised: 0, us: 0, heat: 0, err: 0, warnT: 0, fatal: false, errMsg: "", last: [], callers: new Map(), ext: new Map() }; L.codes.set(key, c); }
  return c;
}
function locateCode(M, c) {
  if (!M) return null;
  const short = (c.name || "").split(".").pop().replace(/<.*>/, "");
  if (c.path) {
    let t = locate(M, c.path, c.line);
    if ((!t || !t.m) && c.line) for (let d = 1; d <= 6 && (!t || !t.m); d++) { const u = locate(M, c.path, c.line + d); if (u && u.m) t = u; }
    if (t && !t.m && short) {
      const cl = M.classes[t.id];
      const i = cl.methods.findIndex((m) => m.name.replace(/^(get|set|prop) /, "") === short);
      if (i >= 0) t = { id: t.id, m: { t: "m", i } };
    }
    if (t) return t;
  }
  for (const cl of M.classes) { const i = cl.methods.findIndex((m) => m.name === short); if (i >= 0) return { id: cl.id, m: { t: "m", i } }; }
  return null;
}
function liveRetarget(L, M) { for (const c of L.codes.values()) c.target = locateCode(M, c); liveBpTargets(L, M); L.rev++; }
/* Haltepunkte: Quellort (Datei + Funktionszeile) → Diagramm-Ziele */
const bpId = (t) => t.id + "|" + (t.m ? t.m.t + t.m.i : "");
function liveBpTargets(L, M) {
  L.bpKeys = new Set();
  if (!M) return;
  for (const b of L.bps) { const t = locate(M, b.path, b.line); if (t) L.bpKeys.add(bpId(t)); }
}
const codeName = (L, key) => { const c = L.codes.get(key); return c ? c.name : key === -1 ? "Start" : "?"; };
function liveThread(L, run, tid, name) {
  const key = run + ":" + tid;
  let th = L.threads.get(key);
  if (!th) { th = { key, run, tid, name: name || "Thread " + tid, n: L.threads.size, stack: [], alive: true, calls: 0, paused: null }; L.threads.set(key, th); }
  if (name && !/^Thread \d+$/.test(name)) th.name = name;
  return th;
}
function pushEv(L, e) { L.events.push(e); if (L.events.length > MAX_EV) L.events.splice(0, L.events.length - MAX_EV); }
function spawn(L, a, b, th, now, kind) {
  if (L.particles.length >= MAX_PART || a === -1 || b === -1) return;
  L.particles.push({ a, b, th, t0: now + Math.random() * 90, dur: kind === "err" ? 900 : kind === "chan" ? 1100 : kind === "net" ? 1300 : 650, kind });
}
function liveApply(L, msg, M, now) {
  const run = msg.run || 0;
  let R = L.runs.get(run);
  if (!R && msg.k !== "start") { R = { id: run, label: "Lauf " + run, status: "running", trace: true, n: L.runSeq++, t0: now }; L.runs.set(run, R); }
  switch (msg.k) {
    case "start":
      for (const [id, old] of [...L.runs]) if (id !== run && old.status === "ended" && old.label === msg.label + (msg.args ? " " + msg.args : "")) {
        L.runs.delete(id); for (const [k, c] of [...L.codes]) if (c.run === id) L.codes.delete(k);
        L.errors = L.errors.filter((e) => (e.run || 0) !== id); L.events = L.events.filter((e) => (e.run || 0) !== id);
      }
      R = { id: run, label: msg.label + (msg.args ? " " + msg.args : ""), kind: msg.kind, trace: msg.trace, preset: msg.preset, args: msg.args, status: "running", t0: now, n: L.runSeq++, end: null };
      L.runs.set(run, R);
      break;
    case "phase": if (msg.phase === "build") R.status = "building"; if (msg.phase === "run") { R.status = "running"; R.cmd = msg.cmd; } break;
    case "build": R.build = msg; for (const l of msg.output.split("\n")) L.out.push({ run, s: "build", t: l }); break;
    case "o": for (const [s, t] of msg.lines) L.out.push({ run, s, t }); if (L.out.length > MAX_OUT) L.out.splice(0, L.out.length - MAX_OUT); break;
    case "end":
      R.status = "ended"; R.end = { code: msg.code, ms: msg.ms, reason: msg.reason || "" };
      for (const th of L.threads.values()) if (th.run === run) { th.stack = []; th.alive = false; th.paused = null; }
      break;
    case "w": {
      const K = (i) => ck(run, i);
      for (const [i, name, path, line] of msg.codes || []) { const c = liveCode(L, K(i)); c.name = name; c.path = path; c.line = line; c.target = locateCode(M, c); }
      let n = 0;
      for (const [i, cnt, e, w, us] of msg.calls || []) {
        const c = liveCode(L, K(i)); c.calls += cnt; c.errs += e; c.warn += w; c.us += us; n += cnt;
        if (cnt) c.heat = Math.min(1.6, c.heat + 0.3 + Math.log2(1 + cnt) * 0.16);
        L.totals.calls += cnt;
      }
      L._rc += n;
      if (now - L._rt > 1000) { L.rate = Math.round(L._rc * 1000 / Math.max(1, now - L._rt || 1000)); L._rc = 0; L._rt = now; }
      let detailCalls = 0;
      for (const e of msg.ev || []) if (e[0] === "c") detailCalls++;
      for (const [a, b, cnt] of msg.edges || []) {
        if (b == null) continue;
        const cb = liveCode(L, K(b));
        if (a >= 0) cb.callers.set(K(a), (cb.callers.get(K(a)) || 0) + cnt);
        if (!detailCalls && a >= 0) for (let q = 0; q < Math.min(2, cnt); q++) spawn(L, K(a), K(b), null, now, "call");
      }
      for (const [i, name, cnt, e] of msg.ext || []) { const c = liveCode(L, K(i)); const x = c.ext.get(name) || [0, 0]; x[0] += cnt; x[1] += e || 0; c.ext.set(name, x); }
      const seen = new Set();
      for (const st of msg.stacks || []) {
        const [tid, tname, stack, pz] = st;
        const th = liveThread(L, run, tid, stack.length && /^Thread \d+$/.test(tname) ? codeName(L, K(stack[0])) : tname);
        th.stack = stack.map(K); th.alive = true; seen.add(th.key);
        const wasPaused = !!th.paused;
        th.paused = pz ? { key: K(pz[0]), args: pz[1], locals: pz[2] || [], reason: pz[3] } : null;
        if (th.paused && !wasPaused && th.paused.reason === "Haltepunkt") L.pauseFocus = { key: th.paused.key, t: now };
      }
      for (const th of L.threads.values()) if (th.run === run && !seen.has(th.key)) { th.stack = []; th.paused = null; }
      if (msg.dbg) { R.dbg = msg.dbg; if (msg.dbg.mode === "pause" && now - (L._ctlT || 0) > 900) { L.dbg.mode = "pause"; L.dbg.reason = msg.dbg.reason || L.dbg.reason; } }
      for (const e of msg.ev || []) liveEv(L, e, now, run);
      L.rev++;
      break;
    }
    default: break;
  }
  liveStatus(L);
}
function liveEv(L, e, now, run) {
  const k = e[0], tid = e[1], K = (i) => ck(run, i), thKey = run + ":" + tid;
  switch (k) {
    case "c": {
      const [, , i, par, ts, args] = e;
      const c = liveCode(L, K(i)); liveThread(L, run, tid).calls++;
      c.last.push({ ts, th: thKey, args, ret: null, dur: null, err: null }); if (c.last.length > 14) c.last.shift();
      pushEv(L, { k, run, th: thKey, i: K(i), par: K(par), ts, txt: args });
      if (par >= 0) spawn(L, K(par), K(i), thKey, now, "call");
      break;
    }
    case "r": {
      const [, , i, ts, dur, ret] = e;
      const c = liveCode(L, K(i));
      for (let j = c.last.length - 1; j >= 0; j--) { const x = c.last[j]; if (x.th === thKey && x.dur == null) { x.ret = ret; x.dur = dur; break; } }
      pushEv(L, { k, run, th: thKey, i: K(i), ts, dur, txt: ret });
      break;
    }
    case "u": {
      const [, , i, par, ts, msg] = e;
      const c = liveCode(L, K(i)); c.err = now; c.errMsg = msg;
      for (let j = c.last.length - 1; j >= 0; j--) { const x = c.last[j]; if (x.th === thKey && x.dur == null) { x.err = msg; x.dur = 0; break; } }
      pushEv(L, { k, run, th: thKey, i: K(i), par: K(par), ts, txt: msg });
      if (par >= 0) spawn(L, K(i), K(par), thKey, now, "err");
      L.bursts.push({ i: K(i), t0: now, kind: "err" });
      const rec = [...L.errors].reverse().find((r) => r.th === thKey && !r.done && r.msg === msg);
      if (rec) rec.path.push(K(i));
      L.totals.errs++;
      break;
    }
    case "x": {
      const [, , i, line, ts, msg] = e;
      const c = liveCode(L, K(i)); c.raised++; c.err = now; c.errMsg = msg; c.errLine = line;
      L.errors.push({ run, th: thKey, i: K(i), line, ts, msg, path: [K(i)], handled: null, fatal: false, done: false, n: 1 });
      if (L.errors.length > 600) L.errors.splice(0, L.errors.length - 600);
      pushEv(L, { k, run, th: thKey, i: K(i), ts, txt: msg, line });
      L.bursts.push({ i: K(i), t0: now, kind: "err" });
      break;
    }
    case "h": {
      const [, , i, line, ts, typ] = e;
      const c = liveCode(L, K(i)); c.warnT = now;
      const rec = [...L.errors].reverse().find((r) => r.th === thKey && !r.done);
      if (rec) { rec.handled = K(i); rec.handledLine = line; rec.done = true; }
      pushEv(L, { k, run, th: thKey, i: K(i), ts, txt: typ, line });
      L.bursts.push({ i: K(i), t0: now, kind: "warn" });
      L.totals.warn++;
      break;
    }
    case "e": {
      const [, , i, ts, name, args, chan, send] = e;
      pushEv(L, { k, run, th: thKey, i: K(i), ts, txt: name + (args ? "(" + args + ")" : "()"), name, send, chan });
      if (!chan) break;
      // Netzwerk-Schlüssel (tcp:…|…) sind prozessübergreifend gleich → Server und Clients verbinden sich hier
      const net = typeof chan === "string" && /^(tcp|udp):/.test(chan);
      const id = net ? chan : run + ":" + chan;
      let ch = L.chan.get(id);
      if (!ch) { ch = { id, net, name: net ? chan.replace(/^(tcp|udp):/, "").replace("|", " ⇄ ") : name.split(".")[0], kind: net ? chan.slice(0, 3) : "intern", pend: [], wait: [], sent: 0, recv: 0, senders: new Map(), receivers: new Map(), runs: new Set() }; L.chan.set(id, ch); }
      ch.runs.add(run);
      const me = { key: K(i), run, t: now };
      if (send) {
        ch.sent++; ch.senders.set(me.key, (ch.senders.get(me.key) || 0) + 1);
        while (ch.wait.length && now - ch.wait[0].t > 4000) ch.wait.shift();
        const rcv = ch.wait.find((w) => !net || w.run !== run || ch.runs.size === 1);
        if (rcv) { ch.wait.splice(ch.wait.indexOf(rcv), 1); spawn(L, me.key, rcv.key, thKey, now, net ? "net" : "chan"); }
        else { ch.pend.push(me); if (ch.pend.length > 60) ch.pend.shift(); }
      } else {
        ch.recv++; ch.receivers.set(me.key, (ch.receivers.get(me.key) || 0) + 1);
        while (ch.pend.length && now - ch.pend[0].t > 4000) ch.pend.shift();
        const snd = ch.pend.find((p) => !net || p.run !== run || ch.runs.size === 1);
        if (snd) { ch.pend.splice(ch.pend.indexOf(snd), 1); spawn(L, snd.key, me.key, thKey, now, net ? "net" : "chan"); }
        else { ch.wait.push(me); if (ch.wait.length > 10) ch.wait.shift(); }
      }
      break;
    }
    case "F": {
      const [, , i, line, ts, msg, tb] = e;
      L.totals.fatal++;
      const items = (tb || []).map(([ci, ln]) => [K(ci), ln]);
      for (const [ci] of items) { const c = liveCode(L, ci); c.fatal = true; c.err = now; c.errMsg = msg; L.bursts.push({ i: ci, t0: now, kind: "err" }); }
      if (i >= 0) { const c = liveCode(L, K(i)); c.fatal = true; c.err = now; c.errMsg = msg; c.errLine = line; }
      const rec = [...L.errors].reverse().find((r) => r.th === thKey && r.msg === msg);
      if (rec) { rec.fatal = true; rec.done = true; rec.tb = items; }
      else L.errors.push({ run, th: thKey, i: K(i), line, ts, msg, path: items.map((x) => x[0]).reverse(), handled: null, fatal: true, done: true, tb: items, n: 1 });
      pushEv(L, { k, run, th: thKey, i: K(i), ts, txt: msg, line });
      break;
    }
    default: break;
  }
}
/* Fehlerstapel aus der Konsole (ohne Trace oder für fremde Sprachen) */
function liveStackScan(L, M, files, rootName, text, run) {
  const paths = [...files.keys()];
  const pats = [/File "(.+?)", line (\d+)/, /\bat .*?\(?((?:[A-Za-z]:)?[^\s():]+\.[A-Za-z]+):(\d+)(?::\d+)?\)?$/, /^\s*((?:[A-Za-z]:)?[^\s:]+\.(?:go|rs|c|cpp|h|java|kt|cs|ts|js|py|rb|php)):(\d+)/, / in (.+\.cs):line (\d+)/];
  for (const re of pats) {
    const m = re.exec(text); if (!m) continue;
    const p = matchPath(m[1], paths, rootName); if (!p) return;
    const t = locate(M, p, +m[2]); if (!t) return;
    const key = run + ":s:" + p + ":" + m[2];
    const c = liveCode(L, key); c.name = (t.m ? qn(M, t.id, t.m) : M.classes[t.id].name); c.path = p; c.line = +m[2]; c.target = t;
    c.fatal = true; c.err = performance.now(); c.errMsg = text.trim().slice(0, 200);
    L.bursts.push({ i: key, t0: performance.now(), kind: "err" });
    return;
  }
}

/* ============================ Workspaces ============================ */
function memoryWS(label) {
  return { kind: "memory", label: label || "Upload (nur im Speicher)", writable: true, persistent: false, async write() { return { mtime: Date.now() }; } };
}

/* Chrome/Edge: echter Ordnerzugriff mit Schreibrecht (File System Access API) */
const fsaSupported = () => typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";
async function fsaOpen(onProgress) {
  const dir = await window.showDirectoryPicker({ id: "codeatlas", mode: "readwrite" });
  const handles = new Map();
  const walk = async (h, prefix) => {
    const kids = []; for await (const kv of h.entries()) kids.push(kv);
    if (LIBS.ignore && prefix !== dir.name + "/" && kids.some(([n, ch]) => ch.kind === "file" && n === "pyvenv.cfg")) { noteLib(prefix.replace(/\/$/, ""), kids.length); return; }
    for (const [name, ch] of kids) {
      const p = prefix + name;
      if (ch.kind === "directory") { const lr = libRoot(p + "/"); if (lr) noteLib(lr); else if (!IGNORE.test(p + "/")) await walk(ch, p + "/"); }
      else handles.set(p, ch);
      if (handles.size >= 20000) return;
    }
  };
  await walk(dir, dir.name + "/");
  const list = [];
  let n = 0;
  for (const [path, h] of handles) { list.push({ file: await h.getFile(), path }); if (++n % 200 === 0 && onProgress) onProgress(n); }
  const ws = {
    kind: "fsa", label: "Ordner „" + dir.name + "“ (Chrome-Zugriff, live)", rootName: dir.name, writable: true, persistent: true,
    async read(p) { const f = await handles.get(p).getFile(); const d = decodeBytes(await f.arrayBuffer()); if (!d) throw new Error("Binärdatei"); return { ...d, mtime: f.lastModified, size: f.size }; },
    async write(p, text, meta) {
      let h = handles.get(p);
      if (!h) throw new Error("Datei nicht im verbundenen Ordner");
      const f0 = await h.getFile();
      if (meta.mtime && !meta.force && Math.abs(f0.lastModified - meta.mtime) > 1) { const e = new Error("Datei wurde inzwischen extern geändert"); e.status = 409; throw e; }
      const w = await h.createWritable(); await w.write(encodeText(text, meta.encoding, meta.eol)); await w.close();
      const mt = (await h.getFile()).lastModified; snap.set(p, mt); return { mtime: mt };
    },
    watch(cb) {
      let alive = true, round = 0;
      const tick = async () => {
        if (!alive) return;
        const changed = [], removed = [], added = [];
        try {
          for (const [p, h] of handles) {
            if (BIN_RE.test(p)) continue;
            try { const f = await h.getFile(); if (snap.has(p) && snap.get(p) !== f.lastModified) changed.push(p); snap.set(p, f.lastModified); }
            catch { removed.push(p); handles.delete(p); }
          }
          if (++round % 8 === 0) {
            const before = new Set(handles.keys());
            const fresh = new Map(); const w2 = async (h, prefix) => { for await (const [name, ch] of h.entries()) { const p = prefix + name; if (ch.kind === "directory") { if (!ignored(p + "/")) await w2(ch, p + "/"); } else fresh.set(p, ch); } };
            await w2(dir, dir.name + "/");
            for (const [p, h] of fresh) if (!before.has(p)) { handles.set(p, h); added.push(p); }
          }
        } catch { /* Ordner nicht mehr erreichbar */ }
        if (changed.length || removed.length || added.length) cb({ changed, removed, added });
        if (alive) setTimeout(tick, 2000);
      };
      setTimeout(tick, 2000);
      return () => { alive = false; };
    },
  };
  const snap = new Map(list.map((x) => [x.path, x.file.lastModified]));
  return { ws, list, name: dir.name };
}

/* Lokale Bridge (codeatlas_bridge.py) */
async function bfetch(url, token, path, opts = {}) {
  const r = await fetch(url.replace(/\/+$/, "") + path, { ...opts, headers: { "X-Atlas-Token": token, ...(opts.body ? { "Content-Type": "application/json" } : {}) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(j.error || "HTTP " + r.status); e.status = r.status; e.data = j; throw e; }
  return j;
}
function sharedStream(url, token) {
  let es = null;
  const subs = { files: new Set(), run: new Set(), agent: new Set(), team: new Set() }, errs = new Set();
  const open = () => {
    if (es) return;
    es = new EventSource(url.replace(/\/+$/, "") + "/api/stream?topics=files,run,agent,team&token=" + encodeURIComponent(token));
    for (const t of Object.keys(subs)) es.addEventListener(t, (e) => { let o = null; try { o = JSON.parse(e.data); } catch { /* ignore */ } if (o) for (const cb of subs[t]) cb(o); });
    es.onerror = () => { for (const f of errs) f(es); };
  };
  return (topic, cb, onErr) => {
    subs[topic].add(cb); if (onErr) errs.add(onErr); open();
    return () => { subs[topic].delete(cb); if (onErr) errs.delete(onErr); if (es && Object.values(subs).every((x) => !x.size)) { es.close(); es = null; } };
  };
}
function bridgeWS(url, token, info) {
  const B = (p, o) => bfetch(url, token, p, o);
  const ST = (info.features || []).includes("stream") ? sharedStream(url, token) : null;
  return {
    kind: "bridge", url, token, label: "Bridge · " + info.root, root: info.root, rootName: info.rootName, writable: true, persistent: true, version: info.version || "",
    canOpen: true, presets: info.presets || [], editors: info.editors || [], defaultEditor: info.defaultEditor, os: info.os,
    tree: () => B("/api/tree").then((r) => r.files),
    /* Bridge ≥ 1.11: Projekt wechseln */
    projRecent: () => B("/api/project/recent"),
    projBrowse: (p) => B("/api/project/browse?path=" + encodeURIComponent(p || "")),
    projPick: (start) => B("/api/project/pick", { method: "POST", body: JSON.stringify({ start: start || "" }) }),
    projOpen: (path, force) => B("/api/project/open", { method: "POST", body: JSON.stringify({ path, force: !!force }) }),
    /* Bridge ≥ 2.0 */
    graphPut: (g) => B("/api/graph", { method: "POST", body: JSON.stringify(g) }),
    pipeline: () => B("/api/pipeline"),
    pipelinePut: (p) => B("/api/pipeline", { method: "POST", body: JSON.stringify(p) }),
    rules: () => B("/api/rules"),
    rulesPut: (r) => B("/api/rules", { method: "POST", body: JSON.stringify(r) }),
    gitStatus: () => B("/api/git/status"),
    gitCommit: (message) => B("/api/git/commit", { method: "POST", body: JSON.stringify({ message }) }),
    gitHotspots: (days) => B("/api/git/hotspots?days=" + (days || 365)),
    claudeMd: () => B("/api/claudemd"),
    claudeMdPut: (content) => B("/api/claudemd", { method: "POST", body: JSON.stringify({ content }) }),
    team: () => B("/api/team"),
    teamOp: (op, body) => B("/api/team/" + op, { method: "POST", body: JSON.stringify(body || {}) }),
    teamDiff: (id) => B("/api/team/diff?id=" + encodeURIComponent(id)),
    teamEvents(cb) { return ST && (info.features || []).includes("team") ? ST("team", cb) : () => {}; },
    read: (p) => B("/api/file?path=" + encodeURIComponent(p)),
    write: (p, text, meta) => B("/api/file?path=" + encodeURIComponent(p), { method: "PUT", body: JSON.stringify({ text, encoding: meta.encoding, eol: meta.eol, mtime: meta.mtime, force: !!meta.force }) }),
    open: (p, line, col, editor) => B("/api/open", { method: "POST", body: JSON.stringify({ path: p, line, col, editor }) }),
    build: (id) => B("/api/build", { method: "POST", body: JSON.stringify({ preset: id }) }),
    search: (q, o) => B(`/api/search?q=${encodeURIComponent(q)}&regex=${o.regex ? 1 : 0}&case=${o.case ? 1 : 0}`),
    runPresets: info.runPresets || [],
    run: (preset, args, trace) => B("/api/run", { method: "POST", body: JSON.stringify({ preset, args, trace }) }),
    runStop: (run) => B("/api/run/stop", { method: "POST", body: JSON.stringify(run ? { run } : {}) }),
    runStdin: (run, text) => B("/api/run/stdin", { method: "POST", body: JSON.stringify({ run, text }) }),
    runCtl: (payload) => B("/api/run/ctl", { method: "POST", body: JSON.stringify(payload) }),
    /* Bridge ≥ 1.9: Tests im Atlas */
    testInfo: () => B("/api/test/info"),
    testRun: (filter, more) => B("/api/test/run", { method: "POST", body: JSON.stringify({ filter: filter || "", ...(more || {}) }) }),
    testStop: () => B("/api/test/stop", { method: "POST", body: "{}" }),
    testResult: () => B("/api/test/result"),
    /* Bridge ≥ 1.4: mehrere Dateien ganz oder gar nicht ändern (write / delete / rename), mit Schnappschuss zum Zurücksetzen */
    features: info.features || [], git: info.git || null,
    patch: (ops, o = {}) => B("/api/patch", { method: "POST", body: JSON.stringify({ ops, label: o.label || "", source: o.source || "", snapshot: o.snapshot !== false, commit: !!o.commit }) }),
    snapshots: (limit = 100) => B("/api/snapshots?limit=" + limit).then((r) => r.snapshots),
    restore: (id) => B("/api/snapshot/restore", { method: "POST", body: JSON.stringify({ id }) }),
    /* Bridge ≥ 1.5: Kontrollpunkte (Stand aller Textdateien) und KI-Agenten */
    /* Build- und Start-Konfigurationen neu abfragen – sie ändern sich, wenn Dateien hinzukommen (z. B. das erste main) */
    async refresh() { const i = await B("/api/info"); this.presets = i.presets || []; this.runPresets = i.runPresets || []; if (i.git) this.git = i.git; return i; },
    cpList: () => B("/api/checkpoints"),
    cpCreate: (label) => B("/api/checkpoint", { method: "POST", body: JSON.stringify({ label }) }),
    cpDiff: (id) => B("/api/checkpoint/diff?id=" + encodeURIComponent(id)),
    cpFile: (id, p) => B("/api/checkpoint/file?id=" + encodeURIComponent(id) + "&path=" + encodeURIComponent(p)),
    cpRestore: (id, paths) => B("/api/checkpoint/restore", { method: "POST", body: JSON.stringify({ id, paths: paths || null }) }),
    agentStart: (o) => B("/api/agent/start", { method: "POST", body: JSON.stringify(o) }),
    agentSend: (o) => B("/api/agent/send", { method: "POST", body: JSON.stringify(o) }),
    skills: () => B("/api/skills"),
    account: (fresh) => B("/api/account" + (fresh ? "?fresh=1" : "")),
    accountLogin: (o) => B("/api/account/login", { method: "POST", body: JSON.stringify(o || {}) }),
    accountCode: (code) => B("/api/account/code", { method: "POST", body: JSON.stringify({ code }) }),
    accountCancel: () => B("/api/account/cancel", { method: "POST", body: "{}" }),
    accountLogout: () => B("/api/account/logout", { method: "POST", body: "{}" }),
    skillRead: (name) => B("/api/skills/file?name=" + encodeURIComponent(name)),
    skillCreate: (o) => B("/api/skills/create", { method: "POST", body: JSON.stringify(o) }),
    skillSave: (o) => B("/api/skills/save", { method: "POST", body: JSON.stringify(o) }),
    /* Anhang als Base64 zur Bridge (liegt danach unter .codeatlas/uploads) */
    agentUpload: (file) => new Promise((ok, no) => {
      if (file.size > 10_000_000) return no(new Error("zu groß (max. 10 MB)"));
      const rd = new FileReader();
      rd.onerror = () => no(new Error("nicht lesbar"));
      rd.onload = () => B("/api/agent/upload", { method: "POST", body: JSON.stringify({ name: file.name || "Bild.png", mime: file.type, data: String(rd.result).split(",")[1] || "" }) }).then(ok, no);
      rd.readAsDataURL(file);
    }),
    agentStop: () => B("/api/agent/stop", { method: "POST", body: "{}" }),
    agentDecide: (id, allow, always) => B("/api/agent/permission", { method: "POST", body: JSON.stringify({ id, allow, always }) }),
    agentReset: () => B("/api/agent/reset", { method: "POST", body: "{}" }),
    agentHooks: (install) => B("/api/agent/hooks", { method: "POST", body: JSON.stringify({ install }) }),
    agentEvents(cb) {
      if (ST) return ST("agent", cb, () => cb({ k: "offline" }));
      const es = new EventSource(url.replace(/\/+$/, "") + "/api/agent/events?token=" + encodeURIComponent(token));
      es.onmessage = (e) => { let o = null; try { o = JSON.parse(e.data); } catch { /* ignore */ } if (o) cb(o); };
      es.onerror = () => cb({ k: "offline" });
      return () => es.close();
    },
    runEvents(cb) {
      if (ST) return ST("run", cb);
      const es = new EventSource(url.replace(/\/+$/, "") + "/api/run/events?token=" + encodeURIComponent(token));
      es.onmessage = (e) => { try { cb(JSON.parse(e.data)); } catch { /* ignore */ } };
      return () => es.close();
    },
    watch(cb) {
      if (ST) return ST("files", cb, (es) => cb({ offline: es.readyState === 2 }));
      const es = new EventSource(url.replace(/\/+$/, "") + "/api/events?token=" + encodeURIComponent(token));
      es.onmessage = (e) => { try { cb(JSON.parse(e.data)); } catch { /* ignore */ } };
      es.onerror = () => cb({ offline: es.readyState === 2 });
      return () => es.close();
    },
  };
}
async function bridgeLoad(ws, onProgress) {
  const tree = await ws.tree();
  const entries = []; let done = 0;
  const todo = tree.filter((f) => !f.bin && !ignored(f.path));
  for (const f of tree) if (f.bin && !ignored(f.path)) entries.push({ path: f.path, size: f.size, mtime: f.mtime, kind: "bin" });
  const queue = [...todo];
  const worker = async () => {
    while (queue.length) {
      const f = queue.shift(); const kind = kindOfPath(f.path);
      if (f.size > (kind === "code" ? MAX_FILE : MAX_AUX)) { entries.push({ path: f.path, size: f.size, mtime: f.mtime, kind: "bin" }); continue; }
      try { const d = await ws.read(f.path); entries.push({ path: f.path, size: f.size, kind, text: d.text, encoding: d.encoding, eol: d.eol, mtime: d.mtime }); }
      catch { entries.push({ path: f.path, size: f.size, mtime: f.mtime, kind: "bin" }); }
      if (++done % 20 === 0 && onProgress) onProgress(done, todo.length);
    }
  };
  await Promise.all(Array.from({ length: 10 }, worker));
  entries.sort((a, b) => a.path.localeCompare(b.path));
  return entries;
}

/* ============================ Editor-Sprung ============================ */
const EDITOR_LIST = [
  { id: "vscode", label: "VS Code", bridge: "vscode", url: "vscode" },
  { id: "codeblocks", label: "Code::Blocks", bridge: "codeblocks" },
  { id: "notepadpp", label: "Notepad++", bridge: "notepadpp" },
  { id: "cursor", label: "Cursor", bridge: "cursor", url: "cursor" },
  { id: "vscodium", label: "VSCodium", bridge: "vscodium", url: "vscodium" },
  { id: "sublime", label: "Sublime Text", bridge: "sublime", url: "sublime" },
  { id: "clion", label: "CLion", bridge: "clion", url: "jetbrains" },
  { id: "pycharm", label: "PyCharm", bridge: "pycharm", url: "jetbrains" },
  { id: "idea", label: "IntelliJ IDEA", bridge: "idea", url: "jetbrains" },
  { id: "devenv", label: "Visual Studio", bridge: "devenv" },
  { id: "custom", label: "Eigener Befehl (--editor-cmd)", bridge: "custom" },
];
const URL_EDITORS = {
  vscode:    { label: "VS Code",            url: (a, l, c) => "vscode://file" + fileUrlPath(a) + `:${l}:${c}` },
  insiders:  { label: "VS Code Insiders",   url: (a, l, c) => "vscode-insiders://file" + fileUrlPath(a) + `:${l}:${c}` },
  cursor:    { label: "Cursor",             url: (a, l, c) => "cursor://file" + fileUrlPath(a) + `:${l}:${c}` },
  vscodium:  { label: "VSCodium",           url: (a, l, c) => "vscodium://file" + fileUrlPath(a) + `:${l}:${c}` },
  jetbrains: { label: "JetBrains (idea://)", url: (a, l, c) => `idea://open?file=${encodeURIComponent(a)}&line=${l}&column=${c}` },
  sublime:   { label: "Sublime (subl://)",  url: (a, l, c) => `subl://open?url=${encodeURIComponent("file://" + fileUrlPath(a))}&line=${l}&column=${c}` },
};
function fileUrlPath(abs) {
  const p = abs.replace(/\\/g, "/");
  return (p.startsWith("/") ? "" : "/") + p.split("/").map((s, i) => (i === 0 && /^[A-Za-z]:$/.test(s) ? s : encodeURIComponent(s))).join("/");
}
function absPathOf(base, path, rootName) {
  if (!base) return null;
  const sep = base.includes("\\") ? "\\" : "/";
  let rel = path;
  if (rootName && rel.startsWith(rootName + "/")) rel = rel.slice(rootName.length + 1);
  return base.replace(/[\\/]+$/, "") + sep + rel.split("/").join(sep);
}
function launchUrl(u) { const a = document.createElement("a"); a.href = u; a.rel = "noopener"; document.body.appendChild(a); a.click(); a.remove(); }

/* ============================ Compiler-Diagnosen ============================ */
const sevOf = (s) => (/fatal|error|fehler/i.test(s) ? "error" : /warn/i.test(s) ? "warning" : "note");
function parseDiagnostics(out) {
  const res = [], seen = new Set(), lines = out.replace(/\r\n/g, "\n").split("\n");
  const push = (d) => { const k = d.file + "|" + d.line + "|" + d.col + "|" + d.msg; if (seen.has(k) || !d.file || !(d.line > 0)) return; seen.add(k); res.push(d); };
  let pend = null;
  for (let i = 0; i < lines.length; i++) {
    const L = lines[i]; let m;
    if ((m = /^(.+?):(\d+):(?:(\d+):)?\s*(fatal error|error|schwerwiegender Fehler|Fehler|warning|Warnung|note|Anmerkung|Hinweis)(?:\[[^\]]*\])?\s*:\s*(.*)$/i.exec(L)) && !/^\s*In file included/.test(L)) {
      push({ file: m[1].trim(), line: +m[2], col: +(m[3] || 1), sev: sevOf(m[4]), msg: m[5].trim(), raw: i }); continue;
    }
    if ((m = /^\s*(.+?)\((\d+)(?:,(\d+))?(?:,\d+,\d+)?\)\s*:\s*(fatal error|error|warning|note|Fehler|Warnung)\s*([A-Za-z]+\d+)?\s*:\s*(.*)$/i.exec(L))) {
      push({ file: m[1].trim(), line: +m[2], col: +(m[3] || 1), sev: sevOf(m[4]), msg: (m[5] ? m[5] + ": " : "") + m[6].trim(), raw: i }); continue;
    }
    if ((m = /^(error|warning)(\[[^\]]+\])?:\s*(.*)$/.exec(L))) { pend = { sev: sevOf(m[1]), msg: (m[2] ? m[2] + " " : "") + m[3] }; continue; }
    if (pend && (m = /^\s*-->\s*(.+?):(\d+):(\d+)/.exec(L))) { push({ file: m[1], line: +m[2], col: +m[3], ...pend, raw: i }); pend = null; continue; }
    if ((m = /^\s*File "(.+?)", line (\d+)/.exec(L))) {
      let msg = "Fehler";
      for (let j = i + 1; j < Math.min(lines.length, i + 8); j++) { const q = /^(\w*(?:Error|Exception|Warning))\b:?\s*(.*)$/.exec(lines[j].trim()); if (q) { msg = q[1] + (q[2] ? ": " + q[2] : ""); break; } if (/^\s*File "/.test(lines[j])) break; }
      push({ file: m[1], line: +m[2], col: 1, sev: /Warning/.test(msg) ? "warning" : "error", msg, raw: i }); continue;
    }
    if ((m = /^(.+?)\t(\d+)\t\s*(.*)$/.exec(L)) && /(error|warning|fehler|warnung)/i.test(m[3])) {
      const sm = /^(fatal error|error|warning|note|Fehler|Warnung)\s*:\s*(.*)$/i.exec(m[3]);
      push({ file: m[1].trim(), line: +m[2], col: 1, sev: sm ? sevOf(sm[1]) : sevOf(m[3]), msg: sm ? sm[2] : m[3], raw: i });
    }
  }
  return res;
}
const normP = (p) => p.replace(/\\/g, "/").replace(/^(\.\.?\/)+/, "").replace(/\/\.\//g, "/").toLowerCase();
function matchPath(file, paths, rootName) {
  const d = normP(file);
  let best = null, bestLen = 0;
  for (const p of paths) {
    const pn = normP(p), pr = rootName && pn.startsWith(rootName.toLowerCase() + "/") ? pn.slice(rootName.length + 1) : pn;
    let len = 0;
    if (pn === d || pr === d) len = 1e6;
    else if (d.endsWith("/" + pr)) len = pr.length;
    else if (pn.endsWith("/" + d) || pr.endsWith("/" + d)) len = d.length;
    if (len > bestLen) { best = p; bestLen = len; }
  }
  if (best) return best;
  const b = d.split("/").pop(); const hits = paths.filter((p) => normP(p).split("/").pop() === b);
  return hits.length === 1 ? hits[0] : null;
}
function locate(M, path, line) {
  let best = null, span = Infinity;
  for (const c of M.classes) {
    const files = c.files || [c.file];
    if (!files.includes(path)) continue;
    c.fields.forEach((f, i) => { if ((f.file || c.file) === path && f.line === line && span > -1) { best = { id: c.id, m: { t: "f", i } }; span = -1; } });
    c.methods.forEach((m, i) => {
      const f = m.file || c.file, e = m.endLine || m.line;
      if (f === path && line >= m.line && line <= e && e - m.line < span) { best = { id: c.id, m: { t: "m", i } }; span = e - m.line; }
      else if (m.declFile === path && m.declLine === line && span > 0) { best = { id: c.id, m: { t: "m", i } }; span = 0; }
    });
    if (c.kind !== "module" && c.file === path && line >= c.line && line <= c.endLine && c.endLine - c.line < span) { best = { id: c.id, m: null }; span = c.endLine - c.line; }
  }
  if (!best) { const mod = M.classes.find((c) => c.kind === "module" && (c.files || [c.file]).includes(path)); if (mod) best = { id: mod.id, m: null }; }
  return best;
}
function mapDiags(items, M, paths, rootName) {
  const map = new Map();
  const out = items.map((d) => {
    const path = matchPath(d.file, paths, rootName);
    const target = path && M ? locate(M, path, d.line) : null;
    if (target && d.sev !== "note") {
      const g = map.get(target.id) || { e: 0, w: 0, rows: new Map() };
      if (d.sev === "error") g.e++; else g.w++;
      if (target.m) { const k = target.m.t + target.m.i; if (g.rows.get(k) !== "error") g.rows.set(k, d.sev); }
      map.set(target.id, g);
    }
    return { ...d, path, target };
  });
  return { items: out, map };
}

/* ============================ Änderungsebene: Modelle und Texte vergleichen ============================ */
/* Stabiler Schlüssel eines Knotens über Analysen hinweg – bleibt gleich, wenn zu einer .c später die .h dazukommt
   oder aus einem struct eine class wird. Darüber finden Änderungsebene, Blickpfad der KI und Layout ihre Knoten wieder. */
const dkey = (c) => (c.kind === "module" ? "M|" + (/^(c|cpp|h|d)$/.test(c.lang) ? dirOf(c.file) + "/" + stemOf(c.file) : c.file) : "C|" + c.file + "|" + c.name);
const edgeCat = (t) => (t === "inherit" || t === "implement" ? "h" : t === "comp" || t === "assoc" ? "f" : t);
const LINK_DE = { call: "ruft auf", ref: "verweist auf", read: "liest", write: "schreibt", use: "nutzt" };
/* Member-Schlüssel: Name, bei Überladungen mit laufender Nummer */
function memKeys(arr) { const seen = new Map(); return arr.map((x) => { const n = seen.get(x.name) || 0; seen.set(x.name, n + 1); return n ? x.name + "#" + n : x.name; }); }
const mkOf = (c) => c._mk || (c._mk = memKeys(c.methods));
const fkOf = (c) => c._fk || (c._fk = memKeys(c.fields));
function memSrc(lines, x, cfile) {
  const L = lines(x.file || cfile); if (!L || !x.line) return "";
  let s = ""; for (let i = x.line - 1, b = Math.max(x.line, x.endLine || x.line); i < b && i < L.length; i++) s += L[i].trimEnd() + "\n";
  return s;
}
/* Vergleicht zwei Modelle (B = Kontrollpunkt, M = jetzt). Ergebnis:
   layer – schlüsselbasiert für die Zeichen-Engine (übersteht Neuanalysen), list – für die Änderungsliste, cnt – Zähler */
function diffModels(B, M, bFiles, mFiles, changed) {
  const cache = new Map();
  const linesIn = (files, tag) => (p) => { const k = tag + p; let v = cache.get(k); if (v === undefined) { const e = files && files.get(p); v = e && e.text != null ? e.text.split("\n") : null; cache.set(k, v); } return v; };
  const bl = linesIn(bFiles, "b"), ml = linesIn(mFiles, "m");
  const touched = (c) => !changed || (c.files || [c.file]).some((f) => changed.has(f));
  const bBy = new Map(B.classes.map((c) => [c.dk, c])), mBy = new Map(M.classes.map((c) => [c.dk, c]));
  const nodes = new Map(), list = [], ghosts = [];
  const cnt = { nNew: 0, nChg: 0, nDel: 0, mNew: 0, mChg: 0, mDel: 0, eNew: 0, eDel: 0, lNew: 0, lDel: 0 };
  const fSig = (f) => fieldText(f, true) + "|" + f.vis + (f.static ? "s" : "");
  const mSig = (m) => sig(m) + "|" + m.vis + (m.static ? "s" : "") + (m.abstract ? "a" : "") + (m.decl ? "d" : "");
  const allMem = (c, st) => [...c.fields.map((x) => ({ st, t: "f", name: x.name, line: x.line })), ...c.methods.map((x) => ({ st, t: "m", name: x.name, line: x.line }))];
  for (const c of M.classes) {
    const b = bBy.get(c.dk);
    if (!b) {
      nodes.set(c.dk, { st: "new", f: new Map(fkOf(c).map((k) => [k, "new"])), m: new Map(mkOf(c).map((k) => [k, "new"])), add: c.fields.length + c.methods.length, chg: 0, del: 0 });
      list.push({ st: "new", dk: c.dk, name: c.name, kind: c.kind, file: c.file, mem: allMem(c, "new") });
      cnt.nNew++; cnt.mNew += c.fields.length + c.methods.length; continue;
    }
    const deep = touched(c) || touched(b), f = new Map(), m = new Map(), mem = [];
    const cmp = (cur, old, ck, ok, t, sigOf, into) => {
      const oi = new Map(ok.map((k, i) => [k, i]));
      ck.forEach((k, i) => {
        const j = oi.get(k);
        if (j == null) { into.set(k, "new"); mem.push({ st: "new", t, name: cur[i].name, line: cur[i].line }); return; }
        oi.delete(k);
        if (sigOf(cur[i]) !== sigOf(old[j]) || (deep && memSrc(ml, cur[i], c.file) !== memSrc(bl, old[j], b.file))) { into.set(k, "chg"); mem.push({ st: "chg", t, name: cur[i].name, line: cur[i].line }); }
      });
      for (const j of oi.values()) mem.push({ st: "del", t, name: old[j].name, line: old[j].line });
    };
    cmp(c.fields, b.fields, fkOf(c), fkOf(b), "f", fSig, f); cmp(c.methods, b.methods, mkOf(c), mkOf(b), "m", mSig, m);
    if (!mem.length) continue;
    const add = mem.filter((x) => x.st === "new").length, chg = mem.filter((x) => x.st === "chg").length, del = mem.length - add - chg;
    nodes.set(c.dk, { st: "chg", f, m, add, chg, del });
    list.push({ st: "chg", dk: c.dk, name: c.name, kind: c.kind, file: c.file, mem });
    cnt.nChg++; cnt.mNew += add; cnt.mChg += chg; cnt.mDel += del;
  }
  for (const b of B.classes) if (!mBy.has(b.dk)) {
    ghosts.push({ dk: b.dk, name: b.name, kind: b.kind, file: b.file, w: b.w, h: b.h, x: b.x, y: b.y, nf: b.fields.length, nm: b.methods.length });
    list.push({ st: "del", dk: b.dk, name: b.name, kind: b.kind, file: b.file, mem: allMem(b, "del") });
    cnt.nDel++; cnt.mDel += b.fields.length + b.methods.length;
  }
  // Kanten zwischen Knoten
  const bE = new Map(B.edges.map((e) => [e.dk, e])), mE = new Set(M.edges.map((e) => e.dk)), edges = new Map(), elist = [], ghostEdges = [];
  for (const e of M.edges) {
    const o = bE.get(e.dk), a = M.classes[e.from], b = M.classes[e.to];
    if (!o) { edges.set(e.dk, "new"); elist.push({ st: "new", a: a.dk, an: a.name, b: b.dk, bn: b.name, type: e.type, labels: e.labels.slice(0, 8) }); cnt.eNew++; continue; }
    const fresh = e.labels.filter((l) => !o.labels.includes(l));
    if (fresh.length) { edges.set(e.dk, "chg"); elist.push({ st: "chg", a: a.dk, an: a.name, b: b.dk, bn: b.name, type: e.type, labels: fresh.slice(0, 8) }); }
  }
  for (const e of B.edges) if (!mE.has(e.dk)) {
    const a = B.classes[e.from], b = B.classes[e.to];
    ghostEdges.push({ a: a.dk, b: b.dk, type: e.type });
    elist.push({ st: "del", a: a.dk, an: a.name, b: b.dk, bn: b.name, type: e.type, labels: e.labels.slice(0, 8) }); cnt.eDel++;
  }
  // Verbindungen auf Funktionsebene: wer ruft wen, wer liest / schreibt welche Variable
  const linkMap = (X) => {
    const s = new Map();
    for (const c of X.classes) c.methods.forEach((m, i) => {
      for (const l of m.links || []) {
        const t = X.classes[l.id]; if (!t) continue;
        const am = mkOf(c)[i], bm = l.t === "m" ? mkOf(t)[l.i] : l.t === "f" ? fkOf(t)[l.i] : "";
        const key = c.dk + "::" + am + ">" + t.dk + "::" + (bm || "") + ">" + l.kind;
        if (!s.has(key)) s.set(key, { a: c.dk, am, an: c.name, b: t.dk, bm: bm || "", bn: t.name, bt: l.t, kind: l.kind });
      }
    });
    return s;
  };
  const bL = linkMap(B), mL = linkMap(M), links = [], llist = [];
  for (const [k, l] of mL) if (!bL.has(k)) { links.push(l); llist.push({ st: "new", ...l }); cnt.lNew++; }
  for (const [k, l] of bL) if (!mL.has(k)) { llist.push({ st: "del", ...l }); cnt.lDel++; }
  const order = { new: 0, chg: 1, del: 2 };
  list.sort((x, y) => order[x.st] - order[y.st] || x.name.localeCompare(y.name));
  const empty = !list.length && !elist.length && !llist.length;
  return { layer: { nodes, edges, links, ghosts, ghostEdges }, list: { nodes: list, edges: elist, links: llist }, cnt, empty };
}

/* Zeilenweiser Textvergleich (Myers) – für die Diff-Ansicht und die +/−-Zähler */
function diffLines(aText, bText) {
  const a = (aText || "").split("\n"), b = (bText || "").split("\n"), na = a.length, nb = b.length;
  let s = 0; while (s < na && s < nb && a[s] === b[s]) s++;
  let ea = na, eb = nb; while (ea > s && eb > s && a[ea - 1] === b[eb - 1]) { ea--; eb--; }
  const A = a.slice(s, ea), B = b.slice(s, eb), N = A.length, M = B.length, mid = [];
  let ok = false;
  if (N && M) {
    const D = Math.min(N + M, 3000), O = D + 1, v = new Int32Array(2 * D + 3), trace = [];
    let d = 0;
    outer: for (; d <= D; d++) {
      trace.push(v.slice(O - d - 1, O + d + 2));
      for (let k = -d; k <= d; k += 2) {
        let x = k === -d || (k !== d && v[O + k - 1] < v[O + k + 1]) ? v[O + k + 1] : v[O + k - 1] + 1, y = x - k;
        while (x < N && y < M && A[x] === B[y]) { x++; y++; }
        v[O + k] = x;
        if (x >= N && y >= M) { ok = true; break outer; }
      }
    }
    if (ok) {
      let x = N, y = M;
      for (; d > 0; d--) {
        const pv = trace[d], at = (k) => pv[k + d + 1], k = x - y;
        const pk = k === -d || (k !== d && at(k - 1) < at(k + 1)) ? k + 1 : k - 1, px = at(pk), py = px - pk;
        while (x > px && y > py) mid.push([" ", --x, --y]);
        if (pk === k + 1) mid.push(["+", x, --y]); else mid.push(["-", --x, y]);
      }
      while (x > 0 && y > 0) mid.push([" ", --x, --y]);
      mid.reverse();
    }
  }
  if (!ok) { for (let i = 0; i < N; i++) mid.push(["-", i, 0]); for (let j = 0; j < M; j++) mid.push(["+", N, j]); }
  const rows = [];
  for (let i = 0; i < s; i++) rows.push([" ", i, i]);
  for (const [t, i, j] of mid) rows.push([t, i + s, j + s]);
  for (let i = ea, j = eb; i < na; i++, j++) rows.push([" ", i, j]);
  let add = 0, del = 0; for (const r of rows) { if (r[0] === "+") add++; else if (r[0] === "-") del++; }
  return { rows, a, b, add, del, rough: !ok && N > 0 && M > 0 };
}
/* Diff in Abschnitte mit etwas Umgebung schneiden */
function hunksOf(d, ctx = 3) {
  const R = d.rows, keep = new Uint8Array(R.length);
  for (let i = 0; i < R.length; i++) if (R[i][0] !== " ") for (let j = Math.max(0, i - ctx); j <= Math.min(R.length - 1, i + ctx); j++) keep[j] = 1;
  const out = []; let cur = null, gap = 0;
  for (let i = 0; i < R.length; i++) {
    if (!keep[i]) { cur = null; gap++; continue; }
    if (!cur) { cur = { gap, rows: [] }; out.push(cur); gap = 0; }
    cur.rows.push(R[i]);
  }
  return { hunks: out, tail: gap };
}

/* ============================ Vibe: was die KI gerade tut (Datenhaltung) ============================ */
const TOOL_KIND = { Read: "read", NotebookRead: "read", Edit: "edit", MultiEdit: "edit", NotebookEdit: "edit", Write: "write", Grep: "search", Glob: "search", LS: "search", Bash: "run", PowerShell: "run" };
const PH_RANK = { draft: 0, start: 1, end: 2 };
function createVibe() {
  return { rev: 0, on: false, offline: false, agents: [], modes: [], running: 0, resume: false, hooks: null, model: "", ver: "",
    turns: [], byTurn: new Map(), tools: new Map(), perms: [], foci: [] };
}
function vibeClear(V) { V.turns = []; V.byTurn = new Map(); V.tools = new Map(); V.perms = []; V.foci = []; V.running = 0; }
function vibeTurn(V, n, t) {
  let T = V.byTurn.get(n);
  if (!T) {
    T = { n, src: "", items: [], t0: t, open: true, status: null };
    V.byTurn.set(n, T); V.turns.push(T);
    if (V.turns.length > 80) { const old = V.turns.shift(); V.byTurn.delete(old.n); for (const it of old.items) if (it.type === "tool") V.tools.delete(it.key); }
  }
  return T;
}
/* Ein Ereignis der Bridge einarbeiten. Rückgabe: betroffenes Feed-Element (für Blickpfad und Kamera) */
function vibeApply(V, e) {
  V.rev++;
  if (e.k === "state") {
    vibeClear(V);
    V.on = true; V.offline = false; V.agents = e.agents || []; V.modes = e.modes || []; V.running = e.running || 0; V.resume = !!e.resume; V.hooks = e.hooks || null; V.perms = (e.pending || []).slice(); V.defModel = e.model || "";
    return null;
  }
  if (e.k === "offline") { V.offline = true; return null; }
  if (e.k === "reset") { vibeClear(V); V.resume = false; return null; }
  if (e.k === "idle") { if (V.running === e.turn) V.running = 0; return null; }
  if (e.k === "pipeline") return null;
  if (e.k === "gate") { const T = vibeTurn(V, e.turn || 0, e.t); T.items.push({ type: "gate", ph: e.ph, text: e.text, report: e.report, round: e.round, what: e.what }); return null; }
  if (e.k === "sess") { if (e.model) V.model = e.model; if (e.ver) V.ver = e.ver; if (e.turn) { const T = vibeTurn(V, e.turn, e.t); if (e.model) T.model = e.model; } return null; }
  const T = vibeTurn(V, e.turn || 0, e.t);
  if (e.k === "turn") {
    if (e.ph === "start") { Object.assign(T, { src: e.src, sid: e.sid, prompt: e.prompt, cp: e.cp, mode: e.mode, agent: e.agent, resume: e.resume, files: e.files || [], t0: e.t, open: true, model: e.model || T.model || "", effort: e.effort || "" }); if (e.src === "atlas") V.running = e.turn; }
    else {
      Object.assign(T, { open: false, ok: e.ok, reason: e.reason, cost: e.cost, ms: e.ms != null ? e.ms : e.t - T.t0, steps: e.steps, denied: e.denied || [], t1: e.t, result: e.text, status: null });
      for (const it of T.items) if (it.type === "tool" && it.ph !== "end") { it.ph = "end"; it.cut = true; }
      if (T.src === "atlas") V.resume = true;
    }
    return T;
  }
  if (e.k === "status") { T.status = { s: e.s, detail: e.detail || (T.status && e.s !== "requesting" ? T.status.detail : ""), tok: e.tok }; return null; }
  if (e.k === "text") {
    const last = T.items[T.items.length - 1];
    if (last && last.type === "text" && last.mid === e.mid && e.d != null) last.text += e.d;
    else T.items.push({ type: "text", mid: e.mid, text: e.d != null ? e.d : e.full || "", par: e.par });
    return null;
  }
  if (e.k === "tool") {
    const key = (e.turn || 0) + ":" + e.id;
    let it = V.tools.get(key);
    if (!it) { it = { type: "tool", id: e.id, key, ph: "draft", t0: e.t }; V.tools.set(key, it); T.items.push(it); }
    for (const k in e) if (k !== "k" && k !== "n" && k !== "t" && k !== "turn" && k !== "ph" && e[k] != null) it[k] = e[k];
    if (PH_RANK[e.ph] >= PH_RANK[it.ph]) it.ph = e.ph;
    if (e.ph === "end") it.t1 = e.t;
    return it;
  }
  if (e.k === "perm") {
    if (e.ph === "ask") { if (!V.perms.some((p) => p.id === e.id)) V.perms.push(e); T.items.push({ type: "perm", id: e.id, name: e.name, cmd: e.cmd, path: e.path, decision: null }); }
    else {
      V.perms = V.perms.filter((p) => p.id !== e.id);
      const it = T.items.find((x) => x.type === "perm" && x.id === e.id);
      if (it) it.decision = e.decision; else T.items.push({ type: "perm", id: e.id, name: e.name, cmd: e.cmd, path: e.path, decision: e.decision });
    }
    return null;
  }
  if (e.k === "note") { T.items.push({ type: "note", lvl: e.lvl, text: e.text, wait: e.wait }); return null; }
  if (e.k === "user") {   // Nachricht während der Arbeit: gesendet → von Claude Code aufgenommen; oder wartet auf den nächsten Auftrag
    if (e.ph === "ack") { const it = T.items.find((x) => x.type === "user" && x.st === "sent"); if (it) it.st = "ack"; }
    else T.items.push({ type: "user", id: e.id, text: e.text || "", files: e.files || [], st: e.ph, t: e.t });
    return null;
  }
  return null;
}
/* Blickpunkt der KI zu einem Werkzeug-Aufruf anlegen / fortschreiben (Zeiten in performance.now()) */
function vibeFocus(V, it, now) {
  const kind = TOOL_KIND[it.name]; if (!kind) return null;
  let f = V.foci.find((x) => x.id === it.key);
  if (!f) { f = { id: it.key, t0: now, t1: 0, targets: [] }; V.foci.push(f); if (V.foci.length > 48) V.foci.splice(0, V.foci.length - 48); }
  f.kind = it.created ? "write" : kind; f.path = it.path; f.dir = it.dir; f.from = it.from; f.to = it.to; f.lines = it.lines; f.cmd = it.cmd;
  f.find = it.new || (it.edits && it.edits[0] && it.edits[0].new) || it.old || "";
  f.old = it.old || (it.edits && it.edits[0] && it.edits[0].old) || "";   // vor dem Anwenden steht nur der alte Text in der Datei
  if (it.ph === "end" && !f.t1) f.t1 = now;
  return f;
}
const nodesOfFile = (M, path) => M.classes.filter((c) => (c.files || [c.file]).includes(path));
/* Welche Knoten / Zeilen des Diagramms meint ein Blickpunkt? */
function focusTargets(f, M, files, rootName) {
  const out = [];
  if (!M) return out;
  const add = (id, m) => { if (out.length < 10 && !out.some((o) => o.id === id && (o.m ? m && o.m.t === m.t && o.m.i === m.i : !m))) out.push({ id, m: m || null }); };
  if (f.keys) { // aus dem Modellvergleich: Knoten und Member sind schon benannt
    for (const k of f.keys) { const c = M.byDk.get(k.dk); if (!c) continue; const i = k.name == null ? -1 : (k.t === "f" ? c.fields : c.methods).findIndex((x) => x.name === k.name); add(c.id, i >= 0 ? { t: k.t, i } : null); }
    return out;
  }
  if (f.path && !f.dir) {
    const ns = nodesOfFile(M, f.path); if (!ns.length) return out;
    let ranges = f.lines && f.lines.length ? f.lines : f.from && (f.from > 1 || f.kind !== "read") ? [[f.from, f.to || f.from + 400]] : null;
    if (!ranges && (f.find || f.old) && f.kind !== "read") {
      const e = files && files.get(f.path), t = e && e.text;
      for (const src of [f.old, f.find]) {   // erst der alte Text (vor der Änderung), dann der neue (danach)
        if (!src || !t) continue;
        const probe = src.split("\n").find((l) => l.trim().length > 8) || src.split("\n").find((l) => l.trim()) || "";
        const i = probe ? t.indexOf(probe) : -1;
        if (i >= 0) { const ln = lineCount(t.slice(0, i)); ranges = [[ln, ln + Math.max(0, src.trimEnd().split("\n").length - 1)]]; break; }
      }
    }
    if (ranges) for (const c of ns) {
      c.methods.forEach((m, i) => { if ((m.file || c.file) !== f.path || !m.line) return; const a = m.line, b = m.endLine || m.line; if (ranges.some(([x, y]) => a <= y && b >= x)) add(c.id, { t: "m", i }); });
      c.fields.forEach((x, i) => { if ((x.file || c.file) === f.path && ranges.some(([a, b]) => x.line >= a && x.line <= b)) add(c.id, { t: "f", i }); });
    }
    if (!out.length && f.find && f.kind !== "read") {
      const ids = new Set(f.find.match(/[A-Za-z_]\w{2,}/g) || []);
      if (ids.size && ids.size < 400) for (const c of ns) {
        c.methods.forEach((m, i) => { if (ids.has(m.name)) add(c.id, { t: "m", i }); });
        c.fields.forEach((x, i) => { if (ids.has(x.name)) add(c.id, { t: "f", i }); });
      }
    }
    if (!out.length) for (const c of [...ns].sort((a, b) => (b.kind === "module") - (a.kind === "module")).slice(0, 6)) add(c.id, null);
    return out;
  }
  if (f.dir && f.path) {
    const pre = f.path + "/"; if (pre.split("/").length <= 2) return out;   // Projektwurzel: zu breit für eine Markierung
    for (const c of M.classes) if (c.file.startsWith(pre)) add(c.id, null);
    return out;
  }
  if (f.cmd && files) { // Dateien, die im Befehl genannt werden
    const paths = [...files.keys()], seen = new Set();
    for (const tok of f.cmd.split(/[\s"'`;|&<>()=,]+/)) {
      if (seen.size >= 12 || tok.length < 3 || !/\.[A-Za-z0-9]{1,6}$/.test(tok) || /[*?$]/.test(tok) || seen.has(tok)) continue;
      seen.add(tok);
      const p = matchPath(tok, paths, rootName); if (p) for (const c of nodesOfFile(M, p).slice(0, 3)) add(c.id, null);
    }
  }
  return out;
}
function vibeRetarget(V, M, files, rootName) { for (const f of V.foci) f.targets = focusTargets(f, M, files, rootName); }

/* Eine Neuanalyse hat das Diagramm verändert: kurz aufleuchten lassen und – läuft gerade ein Auftrag – im Verlauf vermerken */
let chgSeq = 0;
function vibeNoteChange(V, inc, now) {
  const list = [];
  for (const n of inc.list.nodes) {
    if (n.st !== "chg") list.push({ st: n.st, dk: n.dk, t: null, name: n.name, cname: n.file });
    else for (const m of n.mem) list.push({ st: m.st, dk: n.dk, t: m.t, name: m.name, cname: n.name });
  }
  if (!list.length && !inc.cnt.lNew) return null;
  const f = { id: "chg" + ++chgSeq, kind: "changed", t0: now, t1: now, targets: [], newDk: new Set(inc.list.nodes.filter((n) => n.st === "new").map((n) => n.dk)), keys: list.filter((x) => x.st !== "del").slice(0, 10).map((x) => ({ dk: x.dk, t: x.t, name: x.t ? x.name : null })) };
  V.foci.push(f); if (V.foci.length > 48) V.foci.splice(0, V.foci.length - 48);
  const T = [...V.turns].reverse().find((t) => t.open || (t.t1 && Date.now() - t.t1 < 5000));
  if (T) {
    // nicht mitten in eine Antwort schreiben, die gerade noch einläuft: der Vermerk kommt vor den laufenden Text
    const last = T.items[T.items.length - 1], at = T.open && last && last.type === "text" ? T.items.length - 1 : T.items.length, prev = T.items[at - 1];
    if (prev && prev.type === "change") {   // direkt aufeinanderfolgende Vermerke zusammenziehen
      for (const x of list) {
        const i = prev.list.findIndex((y) => y.dk === x.dk && y.t === x.t && y.name === x.name);
        if (i < 0) prev.list.push(x); else if (prev.list[i].st === "new" && x.st === "del") prev.list.splice(i, 1); else if (prev.list[i].st !== "new") prev.list[i] = x;
      }
      prev.links += inc.cnt.lNew;
    } else T.items.splice(at, 0, { type: "change", list, links: inc.cnt.lNew });
    V.rev++;
  }
  return f;
}
function fixPrompt(items, src) {
  const errs = items.filter((d) => d.sev === "error").slice(0, 30);
  const lines = errs.map((d) => `${d.path ? d.path.split("/").slice(1).join("/") || d.path : d.file || "?"}:${d.line}:${d.col || 1}: ${d.msg}`);
  return `Der Build (${src || "Prüfung"}) meldet ${errs.length} Fehler. Bitte behebe ${errs.length === 1 ? "ihn" : "sie"} und ändere dabei nur, was dafür nötig ist:\n\n` + lines.join("\n");
}

/* ============================ Layout bei Live-Änderungen erhalten ============================ */
const nodeKey = (c) => c.dk || dkey(c);
function carryLayout(prev, M) {
  const pos = new Map(prev.classes.map((c) => [nodeKey(c), c]));
  const pg = new Map(prev.groups.map((g) => [g.key, g]));
  const placed = new Set();
  for (const c of M.classes) { const o = pos.get(nodeKey(c)); if (o) { c.x = o.x; c.y = o.y; placed.add(c.id); } }
  const newGroups = [];
  for (const g of M.groups) {
    const fresh = g.ids.filter((id) => !placed.has(id)); if (!fresh.length) continue;
    const old = pg.get(g.key);
    if (!old || fresh.length === g.ids.length) { newGroups.push(g); continue; }
    const ys = g.ids.filter((id) => placed.has(id)).map((id) => M.classes[id].y + M.classes[id].h);
    let x = old.x + GPAD, y = Math.max(...ys) + GAPY, rowH = 0; const maxX = old.x + Math.max(old.w, 760);
    for (const id of fresh) { const c = M.classes[id]; if (x > old.x + GPAD && x + c.w > maxX) { x = old.x + GPAD; y += rowH + GAPY; rowH = 0; } c.x = x; c.y = y; x += c.w + GAPX; rowH = Math.max(rowH, c.h); }
  }
  if (newGroups.length) {
    const minY = Math.min(...newGroups.map((g) => g.y)), dy = prev.bb.y + prev.bb.h + GGAP - minY;
    for (const g of newGroups) for (const id of g.ids) M.classes[id].y += dy;
  }
  for (const g of M.groups) updateGroup(g, M);
  updateBB(M);
}
function selKey(M, s) {
  if (!M || !s || !M.classes[s.id]) return null;
  const c = M.classes[s.id];
  return { node: nodeKey(c), m: s.m ? { t: s.m.t, name: (s.m.t === "f" ? c.fields : c.methods)[s.m.i]?.name } : null };
}
function selFromKey(M, k) {
  if (!k) return null;
  const c = M.classes.find((x) => nodeKey(x) === k.node); if (!c) return null;
  let m = null;
  if (k.m) { const arr = k.m.t === "f" ? c.fields : c.methods; const i = arr.findIndex((x) => x.name === k.m.name); if (i >= 0) m = { t: k.m.t, i }; }
  return { id: c.id, m };
}

/* ============================ Export ============================ */
function download(name, data, mime) {
  const blob = data instanceof Blob ? data : new Blob([data], { type: mime || "text/plain;charset=utf-8" });
  const u = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 4000);
}
const qn = (M, id, m) => { const c = M.classes[id]; if (!m) return c.name; const x = (m.t === "f" ? c.fields : c.methods)[m.i]; return c.name + "." + (x ? x.name : "?"); };
function scopeIds(M, scope, sel) {
  if (scope === "all" || !sel) return new Set(M.classes.map((c) => c.id));
  const c = M.classes[sel.id];
  if (scope === "module") return new Set(c.g.ids);
  const s = new Set([sel.id]); for (const e of M.edges) { if (e.from === sel.id) s.add(e.to); if (e.to === sel.id) s.add(e.from); } return s;
}
function exportModelJSON(M, name, ids) {
  const keep = (id) => ids.has(id);
  return JSON.stringify({
    tool: "CodeAtlasLab", version: "2.1", project: name, created: new Date().toISOString(),
    nodes: M.classes.filter((c) => keep(c.id)).map((c) => ({
      name: c.name, kind: c.kind, lang: c.lang, module: c.module, files: c.relFiles, line: c.line, endLine: c.endLine,
      extends: c.ext, implements: c.impl, patterns: c.pats.map((p) => p.k + ":" + p.role),
      fields: c.fields.map((f) => ({ name: f.name, type: f.type, init: f.init || undefined, vis: f.vis, static: !!f.static, const: !!f.isConst, line: f.line,
        readBy: (f.users || []).filter((u) => !u.w).map((u) => qn(M, u.id, { t: "m", i: u.i })), writtenBy: (f.users || []).filter((u) => u.w).map((u) => qn(M, u.id, { t: "m", i: u.i })) })),
      methods: c.methods.map((m) => ({ name: m.name, params: m.params.map((p) => ({ name: p.name, type: p.type })), returns: m.ret, vis: m.vis, static: !!m.static, abstract: !!m.abstract,
        file: (m.file || c.file).slice(M.prefix.length), line: m.line, endLine: m.endLine,
        calls: (m.links || []).filter((l) => l.kind === "call" || l.kind === "ref").map((l) => qn(M, l.id, l)),
        calledBy: (m.callers || []).map((l) => qn(M, l.id, { t: "m", i: l.i })),
        reads: (m.links || []).filter((l) => l.kind === "read").map((l) => qn(M, l.id, l)),
        writes: (m.links || []).filter((l) => l.kind === "write").map((l) => qn(M, l.id, l)) })),
    })),
    edges: M.edges.filter((e) => keep(e.from) && keep(e.to)).map((e) => ({ from: M.classes[e.from].name, to: M.classes[e.to].name, type: e.type, labels: e.labels, mult: e.mult || undefined })),
  }, null, 2);
}
const csvCell = (v) => { const s = v == null ? "" : String(v); return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
const csv = (rows) => "﻿" + rows.map((r) => r.map(csvCell).join(";")).join("\r\n");
function symbolRows(M, ids) {
  const rows = [];
  for (const c of M.classes) {
    if (ids && !ids.has(c.id)) continue;
    const isMod = c.kind === "module";
    rows.push({ id: c.id, m: null, path: c.file, owner: c.module, name: c.name, art: KIND_DE[c.kind] || "klasse", sig: c.ext.concat(c.impl).join(", "), vis: "", file: c.rel, line: isMod ? 1 : c.line, a: c.inc, b: c.out, kind: "node" });
    c.fields.forEach((f, i) => rows.push({ id: c.id, m: { t: "f", i }, path: f.file || c.file, owner: c.name, name: f.name, art: f.macro ? "makro" : isMod ? "variable" : c.kind === "enum" ? "konstante" : "feld", sig: (f.type || "") + (f.init ? " = " + f.init : ""), vis: f.vis,
      file: (f.file || c.file).slice(M.prefix.length), line: f.line, a: (f.users || []).filter((u) => !u.w).length, b: (f.users || []).filter((u) => u.w).length, kind: "f" }));
    c.methods.forEach((m, i) => rows.push({ id: c.id, m: { t: "m", i }, path: m.file || c.file, owner: c.name, name: m.name, art: m.macro ? "makro" : isMod ? "funktion" : "methode", sig: `(${m.params.map((p) => (p.type ? p.type + " " : "") + p.name).join(", ")})${m.ret ? ": " + m.ret : ""}`, vis: m.vis,
      file: (m.file || c.file).slice(M.prefix.length), line: m.line, a: (m.callers || []).length, b: (m.links || []).filter((l) => l.kind === "call").length, kind: "m" }));
  }
  return rows;
}
const mmId = (s) => s.replace(/[^\w]/g, "_");
const mmType = (s) => (s || "").replace(/</g, "~").replace(/>/g, "~").replace(/[{}:;"]/g, "").replace(/\s+/g, " ").trim();
function exportMermaid(M, ids) {
  const L = ["classDiagram"]; const rel = { inherit: "<|--", implement: "<|..", comp: "*--", assoc: "-->", call: "..>", data: "..>", imp: "..>", dep: "..>" };
  for (const c of M.classes) {
    if (!ids.has(c.id)) continue;
    L.push(`  class ${mmId(c.name)} {`);
    if (c.kind !== "class") L.push(`    <<${KIND_DE[c.kind] || c.kind}>>`);
    for (const f of c.fields.slice(0, 60)) L.push(`    ${/^[+\-#~]$/.test(f.vis) ? f.vis : "+"}${mmType(f.type) ? mmType(f.type) + " " : ""}${mmId(f.name)}${f.static ? "$" : ""}`);
    for (const m of c.methods.slice(0, 60)) L.push(`    ${/^[+\-#~]$/.test(m.vis) ? m.vis : "+"}${mmId(m.name.replace(/^(get|set|prop) /, ""))}(${m.params.map((p) => mmId(p.name || "x")).join(", ")})${m.abstract ? "*" : ""}${m.static ? "$" : ""}${mmType(m.ret) ? " " + mmType(m.ret) : ""}`);
    L.push("  }");
  }
  for (const e of M.edges) {
    if (!ids.has(e.from) || !ids.has(e.to)) continue;
    const a = mmId(M.classes[e.from].name), b = mmId(M.classes[e.to].name);
    const lab = e.labels.length ? " : " + mmId(e.labels.slice(0, 2).join(" ")) : "";
    if (e.type === "inherit" || e.type === "implement") L.push(`  ${b} ${rel[e.type]} ${a}`);
    else if (e.type === "comp") L.push(`  ${a} ${rel.comp} ${b}${lab}`);
    else L.push(`  ${a} ${rel[e.type]} ${b}${lab}`);
  }
  return L.join("\n");
}
function exportPlantUML(M, ids) {
  const L = ["@startuml", "skinparam classAttributeIconSize 0", "hide empty members"];
  const ar = { inherit: "<|--", implement: "<|..", comp: "*--", assoc: "-->", call: "..>", data: "..>", imp: "..>", dep: "..>" };
  const byMod = new Map(); for (const c of M.classes) if (ids.has(c.id)) { if (!byMod.has(c.module)) byMod.set(c.module, []); byMod.get(c.module).push(c); }
  for (const [mod, cs] of byMod) {
    L.push(`package "${mod.replace(/"/g, "'")}" {`);
    for (const c of cs) {
      const kw = c.kind === "interface" ? "interface" : c.kind === "enum" ? "enum" : c.kind === "abstract" ? "abstract class" : "class";
      L.push(`  ${kw} ${mmId(c.name)}${c.kind !== "class" && kw === "class" ? ` <<${KIND_DE[c.kind] || c.kind}>>` : ""} {`);
      for (const f of c.fields.slice(0, 60)) L.push(`    ${/^[+\-#~]$/.test(f.vis) ? f.vis : "+"}${f.static ? "{static} " : ""}${f.name}${f.type ? " : " + f.type.replace(/[{}]/g, "") : ""}`);
      for (const m of c.methods.slice(0, 60)) L.push(`    ${/^[+\-#~]$/.test(m.vis) ? m.vis : "+"}${m.abstract ? "{abstract} " : m.static ? "{static} " : ""}${m.name}(${m.params.map((p) => p.name).join(", ")})${m.ret ? " : " + m.ret.replace(/[{}]/g, "") : ""}`);
      L.push("  }");
    }
    L.push("}");
  }
  for (const e of M.edges) {
    if (!ids.has(e.from) || !ids.has(e.to)) continue;
    const a = mmId(M.classes[e.from].name), b = mmId(M.classes[e.to].name), lab = e.labels.length ? " : " + e.labels.slice(0, 2).join(", ").replace(/[:]/g, "") : "";
    if (e.type === "inherit" || e.type === "implement") L.push(`${b} ${ar[e.type]} ${a}`); else L.push(`${a} ${ar[e.type]} ${b}${lab}`);
  }
  L.push("@enduml");
  return L.join("\n");
}

/* ============================ Syntax-Highlighting (leichtgewichtig) ============================ */
const HL_KW = new Set(("if else for while do switch case default break continue return goto struct union enum typedef static extern const volatile register inline sizeof " +
  "class public private protected virtual override new delete this try catch throw finally namespace using template typename import from export function let var async await " +
  "def lambda yield pass raise with as in is not and or elif except global nonlocal fn pub impl trait mut match loop mod use self super crate where interface extends implements package final abstract " +
  "then end local begin module entity architecture signal process port map " +
  "IF THEN ELSE ELSIF END_IF CASE OF END_CASE FOR TO BY DO END_FOR WHILE END_WHILE REPEAT UNTIL END_REPEAT RETURN EXIT VAR VAR_INPUT VAR_OUTPUT VAR_IN_OUT VAR_GLOBAL VAR_TEMP VAR_STAT END_VAR CONSTANT " +
  "FUNCTION_BLOCK END_FUNCTION_BLOCK PROGRAM END_PROGRAM FUNCTION END_FUNCTION METHOD END_METHOD PROPERTY END_PROPERTY TYPE END_TYPE STRUCT END_STRUCT EXTENDS IMPLEMENTS AND OR NOT XOR MOD " +
  "SELECT FROM WHERE INSERT INTO UPDATE DELETE CREATE TABLE VIEW PRIMARY KEY FOREIGN REFERENCES JOIN ON GROUP ORDER BY NOT NULL DEFAULT").split(" "));
const HL_LIT = /^(true|false|null|nullptr|NULL|None|True|False|nil|undefined|TRUE|FALSE|NaN)$/;
const HL_TY = /^(void|int|char|float|double|long|short|signed|unsigned|bool|BOOL|DWORD|WORD|BYTE|UINT|HANDLE|LPVOID|LPCSTR|size_t|ssize_t|u?int\d+_t|auto|string|String|str|number|boolean|object|any|Int|Long|Double|Float|Boolean|f32|f64|[iu](8|16|32|64|128|size)|Vec|Option|Result|Box|INT|DINT|SINT|UINT|UDINT|REAL|LREAL|TIME|STRING|WORD|DWORD|BYTE|TON|TOF|R_TRIG|F_TRIG)$/;
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const sp = (c, s) => `<span class="${c}">${esc(s)}</span>`;
function highlight(text, path) {
  const L = langOf(path, text); const lines = text.split("\n");
  if (!L || lines.length > 6000) return esc(text);
  const cm = CMT[L.cmt]; const cpp = L.cmt === "c";
  let inBlock = null; const out = [];
  for (const line of lines) {
    let i = 0, h = "";
    while (i < line.length) {
      if (inBlock) { const j = line.indexOf(inBlock, i); const e = j < 0 ? line.length : j + inBlock.length; h += sp("hc", line.slice(i, e)); i = e; if (j >= 0) inBlock = null; continue; }
      let hit = false;
      for (const [o, c] of cm.block) if (line.startsWith(o, i)) { inBlock = c; h += sp("hc", o); i += o.length; hit = true; break; }
      if (hit) continue;
      for (const l of cm.line) if (line.startsWith(l, i)) { h += sp("hc", line.slice(i)); i = line.length; hit = true; break; }
      if (hit) continue;
      const ch = line[i];
      if (cpp && ch === "#" && /^\s*$/.test(line.slice(0, i))) { h += sp("hp", line.slice(i)); break; }
      if (cm.str.includes(ch)) { let j = i + 1; while (j < line.length && line[j] !== ch) { if (line[j] === "\\") j++; j++; } h += sp("hs", line.slice(i, j + 1)); i = j + 1; continue; }
      if (/[0-9]/.test(ch) && !/[\w$]/.test(line[i - 1] || "")) { const m = /^(0x[0-9a-f]+|\d+(\.\d+)?([eE][+-]?\d+)?)[uUlLfF]*/i.exec(line.slice(i)); h += sp("hn", m[0]); i += m[0].length; continue; }
      if (/[A-Za-z_$]/.test(ch)) {
        const w = /^[\w$]+/.exec(line.slice(i))[0];
        const call = /^\s*\(/.test(line.slice(i + w.length));
        h += HL_KW.has(w) ? sp("hk", w) : HL_LIT.test(w) ? sp("hn", w) : HL_TY.test(w) ? sp("ht", w) : call ? sp("hf", w) : esc(w);
        i += w.length; continue;
      }
      h += esc(ch); i++;
    }
    out.push(h);
  }
  return out.join("\n");
}

/* ============================ Modell: Kanten, Patterns ============================ */
function commonPrefix(paths) {
  if (!paths.length) return "";
  const segs = paths.map((p) => p.split("/")); let n = 0;
  while (segs.every((s) => s.length > n + 1 && s[n] === segs[0][n])) n++;
  return n ? segs[0].slice(0, n).join("/") + "/" : "";
}
export function buildModel(parsed, grouping) {
  const src = parsed.classes.concat(parsed.modules || []);
  const classes = src.map((c, i) => ({ ...c, id: i, methods: c.methods.map((m) => ({ ...m })), fields: c.fields.map((f) => ({ ...f })) }));
  const pre = commonPrefix([...new Set(classes.map((c) => c.file))]);
  for (const c of classes) {
    const rel = c.file.startsWith(pre) ? c.file.slice(pre.length) : c.file;
    c.rel = rel; c.module = grouping === "file" ? (c.files && c.files.length > 1 ? rel.replace(/\.[^./]+$/, ".*") : rel) : dirOf(rel);
    if (c.module === "(Wurzel)" && pre) c.module = pre.replace(/\/$/, "").split("/").pop() || c.module;
    c.relFiles = (c.files || [c.file]).map((f) => (f.startsWith(pre) ? f.slice(pre.length) : f));
  }
  if (grouping === "file") { // .c/.h-Paare und ihre Typen zusammenhalten
    const byStem = new Map(); for (const c of classes) if (c.kind === "module" && c.files && c.files.length > 1) for (const f of c.relFiles) byStem.set(f, c.module);
    for (const c of classes) if (byStem.has(c.rel)) c.module = byStem.get(c.rel);
  }
  const byName = new Map();
  const reg = (n, c) => { if (!byName.has(n)) byName.set(n, []); byName.get(n).push(c); };
  for (const c of classes) if (c.kind !== "module") { reg(c.name, c); if (c.alias) reg(c.alias, c); }
  const res = (raw, from) => {
    if (!raw) return null; const nm = raw.split(".").pop(); const arr = byName.get(nm); if (!arr) return null;
    if (arr.length === 1) return arr[0];
    return arr.find((x) => x.file === from.file && x !== from) || arr.find((x) => x.module === from.module && x !== from) || arr.find((x) => x.lang === from.lang && x !== from) || arr[0];
  };
  const edges = [], ekey = new Map();
  const add = (from, to, type, extra = {}) => {
    const cat = type === "inherit" || type === "implement" ? "h" : type === "comp" || type === "assoc" ? "f" : type;
    const k = from.id + ">" + to.id + ">" + cat;
    const ex = ekey.get(k);
    if (ex) {
      if ((RANK[type] || 0) > (RANK[ex.type] || 0)) ex.type = type;
      if (extra.label && !ex.labels.includes(extra.label)) ex.labels.push(extra.label);
      if (extra.mult === "*") ex.mult = "*";
      return ex;
    }
    const e = { id: edges.length, from: from.id, to: to.id, type, labels: extra.label ? [extra.label] : [], fi: extra.fi ?? null, mi: extra.mi ?? null, ti: extra.ti ?? null, tf: !!extra.tf, mult: extra.mult || "" };
    edges.push(e); ekey.set(k, e); return e;
  };
  const has = (a, b, cat) => ekey.has(a.id + ">" + b.id + ">" + cat);
  for (const c of classes) {
    c.external = [];
    for (const n of c.ext) { const t = res(n, c); if (t && t !== c) add(c, t, t.kind === "interface" && c.kind !== "interface" ? "implement" : "inherit"); else if (!t) c.external.push({ name: n, rel: "erbt" }); }
    for (const n of c.impl) { const t = res(n, c); if (t && t !== c) add(c, t, "implement"); else if (!t) c.external.push({ name: n, rel: "impl." }); }
    for (const n of c.amb) {
      const t = res(n, c);
      if (t && t !== c) add(c, t, t.kind === "interface" && c.kind !== "interface" ? "implement" : "inherit");
      else if (!t) c.external.push({ name: n, rel: /^I[A-Z]/.test(n) ? "impl." : "erbt" });
    }
  }
  // Feldtypen → Komposition / Assoziation
  for (const c of classes) {
    c.fields.forEach((f, fi) => {
      const ids = idsOf((f.type || "").replace(/[<>,\[\]()*&?|]/g, " "));
      const mult = COLL.test(f.type || "") ? "*" : "1";
      f.refs = [];
      for (const id of ids) {
        if (/^[a-z]/.test(id) && !["go", "cpp", "c", "st", "sql", "rs"].includes(c.lang)) continue;
        if (isKw(id) && c.lang !== "st") continue;
        const t = res(id, c); if (!t || t === c) { if (t === c) f.refs.push(c.id); continue; }
        if (f.refs.includes(t.id)) continue;
        f.refs.push(t.id);
        add(c, t, f.comp ? "comp" : "assoc", { label: f.name, fi, mult });
      }
    });
  }
  // Funktions- und Globalindex (freie Funktionen, ST-FUNCTIONs, globale Variablen)
  const fnIdx = new Map(), gIdx = new Map();
  const push = (m, k, v) => { if (!m.has(k)) m.set(k, []); m.get(k).push(v); };
  for (const c of classes) {
    if (c.kind === "module") {
      c.methods.forEach((m, i) => push(fnIdx, m.name, { id: c.id, i }));
      c.fields.forEach((f, i) => { if (!f.macro || f.init) push(gIdx, f.name, { id: c.id, i }); });
    } else if (c.kind === "function") push(fnIdx, c.name, { id: c.id, i: 0 });
  }
  const pick = (arr, c) => arr.find((x) => classes[x.id].file === c.file) || arr.find((x) => (classes[x.id].files || []).some((f) => (c.files || [c.file]).includes(f))) || arr.find((x) => classes[x.id].module === c.module) || arr[0];
  for (const c of classes) {
    const own = new Set(c.kind === "module" ? [] : c.fields.map((f) => f.name));
    c.methods.forEach((m, j) => {
      m.links = []; m.callers = m.callers || [];
      const sc = m.scan; if (!sc) return;
      const params = new Set(m.params.map((p) => p.name));
      const seen = new Set();
      for (const name of sc.calls) {
        const arr = fnIdx.get(name); if (!arr) continue;
        const t = pick(arr, c); if (t.id === c.id && t.i === j) continue;
        seen.add(name); m.links.push({ id: t.id, t: "m", i: t.i, kind: "call", name });
        if (t.id !== c.id) add(c, classes[t.id], "call", { label: name + "()", mi: j, ti: t.i });
      }
      for (const name of sc.refs) {
        if (seen.has(name) || sc.calls.has(name) || params.has(name) || sc.locals.has(name) || own.has(name)) continue;
        const fa = fnIdx.get(name);
        if (fa && /^(c|cpp|h|go|rs|d)$/.test(c.lang)) {
          const t = pick(fa, c); if (t.id === c.id && t.i === j) continue;
          m.links.push({ id: t.id, t: "m", i: t.i, kind: "ref", name });
          if (t.id !== c.id) add(c, classes[t.id], "call", { label: "&" + name, mi: j, ti: t.i });
          continue;
        }
        const ga = gIdx.get(name);
        if (ga) {
          const t = pick(ga, c); const w = sc.writes.has(name);
          m.links.push({ id: t.id, t: "f", i: t.i, kind: w ? "write" : "read", name });
          if (t.id !== c.id && !classes[t.id].fields[t.i].macro) add(c, classes[t.id], "data", { label: name, mi: j, ti: t.i, tf: true });
        }
      }
      if (m.tables) for (const tn of m.tables) { const t = res(tn, c); if (t) { m.links.push({ id: t.id, t: "c", i: -1, kind: "use", name: tn }); if (t.id !== c.id) add(c, t, "data", { label: tn, mi: j }); } }
    });
  }
  for (const c of classes) c.methods.forEach((m, j) => {
    for (const l of m.links || []) {
      const t = classes[l.id];
      if (l.t === "m" && t.methods[l.i]) (t.methods[l.i].callers = t.methods[l.i].callers || []).push({ id: c.id, i: j, kind: l.kind });
      if (l.t === "f" && t.fields[l.i]) (t.fields[l.i].users = t.fields[l.i].users || []).push({ id: c.id, i: j, w: l.kind === "write" });
    }
  });
  // Includes / Imports zwischen Modulen
  const modByStem = new Map();
  for (const c of classes) if (c.kind === "module") for (const f of c.files || [c.file]) { const k = stemOf(f).toLowerCase(); if (!modByStem.has(k)) modByStem.set(k, []); modByStem.get(k).push(c); }
  for (const c of classes) {
    if (c.kind !== "module") continue;
    const seenImp = new Set();
    for (const raw of c.imports || []) {
      const k = raw.replace(/\\/g, "/").split(/[/:]/).filter(Boolean).pop().replace(/\.[^.]+$/, "").split(".").pop().toLowerCase();
      if (!k || seenImp.has(k)) continue; seenImp.add(k);
      const arr = modByStem.get(k);
      const t = arr && (arr.find((x) => x.module === c.module) || arr[0]);
      if (t && t !== c) add(c, t, "imp", { label: baseName(raw) });
      else if (!t && c.external.length < 40) c.external.push({ name: raw, rel: "import" });
    }
  }
  // Typ-Abhängigkeiten (nur wenn sonst keine Kante existiert)
  for (const c of classes) {
    for (const u of c.uses) { const t = res(u, c); if (t && t !== c && !has(c, t, "h") && !has(c, t, "f") && !has(c, t, "call")) add(c, t, "dep"); }
    for (const m of c.methods) m.useIds = [...new Set((m.uses || []).map((u) => res(u, c)).filter((t) => t && t !== c).map((t) => t.id))];
    c.inc = 0; c.out = 0;
  }
  const adj = classes.map(() => []);
  for (const e of edges) { classes[e.from].out++; classes[e.to].inc++; adj[e.from].push(e.id); if (e.to !== e.from) adj[e.to].push(e.id); }
  const model = { adj, classes, edges, prefix: pre, langs: parsed.langs || {}, fileCount: parsed.fileCount || 0, warn: parsed.warn || [], synthetic: !!parsed.synthetic };
  { const seen = new Map(); for (const c of classes) { const k0 = dkey(c), n = seen.get(k0) || 0; seen.set(k0, n + 1); c.dk = n ? k0 + "#" + n : k0; } }
  model.byDk = new Map(classes.map((c) => [c.dk, c]));
  for (const e of edges) e.dk = classes[e.from].dk + ">" + classes[e.to].dk + ">" + edgeCat(e.type);
  detectPatterns(model);
  layoutModel(model);
  return model;
}

function detectPatterns(M) {
  const C = M.classes, E = M.edges;
  const into = new Map(), outOf = new Map();
  for (const e of E) { (into.get(e.to) || into.set(e.to, []).get(e.to)).push(e); (outOf.get(e.from) || outOf.set(e.from, []).get(e.from)).push(e); }
  const tag = (c, k, role, why) => { if (!c.pats.some((p) => p.k === k && p.role === role)) c.pats.push({ k, role, why }); };
  for (const c of C) c.pats = [];
  for (const c of C) {
    if (c.kind === "module" || c.kind === "table") continue;
    const outs = outOf.get(c.id) || [];
    const selfStatic = c.fields.some((f) => f.static && (f.type || "").replace(/[?|].*$/, "").trim().split(/[<\s]/)[0] === c.name);
    const getInst = c.methods.some((m) => /^(get_?[Ii]nstance|instance|shared|default|current)$/.test(m.name) && m.static);
    if (selfStatic || getInst) tag(c, "singleton", "Singleton", selfStatic ? "statisches Feld vom eigenen Typ" : "statische getInstance()-Methode");
    const creators = c.methods.filter((m) => /^(create|make|build|new|produce)[A-Z_]?/.test(m.name) && m.name !== "build" && !m.ctor);
    const prodIds = new Set(); for (const m of creators) for (const id of idsOf(m.ret || "")) { const t = C.find((x) => x.name === id && x !== c); if (t) prodIds.add(t.name); }
    if (/Factory$/.test(c.name) || prodIds.size) tag(c, "factory", "Fabrik", prodIds.size ? "erzeugt " + [...prodIds].slice(0, 3).join(", ") : "Name endet auf Factory");
    const fluent = c.methods.filter((m) => (m.ret || "").replace(/[<\s].*$/, "") === c.name).length;
    if ((/Builder$/.test(c.name) || fluent >= 3) && c.methods.some((m) => m.name === "build")) tag(c, "builder", "Builder", fluent + " Fluent-Methoden + build()");
    const hasSub = c.methods.some((m) => /^(subscribe|attach|addListener|addObserver|register|on|addEventListener|add_listener|add_observer)$/i.test(m.name));
    const hasNot = c.methods.some((m) => /^(notify|emit|publish|dispatch|fire|notify_?[A-Z_]?\w*|broadcast)/.test(m.name));
    if (hasSub && hasNot) tag(c, "observer", "Subjekt", "verwaltet und benachrichtigt Beobachter");
    if ((c.kind === "interface" || c.kind === "abstract") && /(Observer|Listener|Subscriber|Handler)$/.test(c.name)) {
      tag(c, "observer", "Beobachter", "Beobachter-Schnittstelle");
      for (const e of into.get(c.id) || []) if (e.type === "implement" || e.type === "inherit") tag(C[e.from], "observer", "Konkr. Beobachter", "implementiert " + c.name);
    }
    for (const e of outs) {
      if (e.type !== "comp" && e.type !== "assoc") continue;
      const t = C[e.to];
      const isBase = outs.some((x) => x.to === t.id && (x.type === "inherit" || x.type === "implement"));
      if (isBase) {
        if (e.mult === "*") tag(c, "composite", "Kompositum", "enthält mehrere " + t.name + " (eigener Basistyp)");
        else tag(c, "decorator", "Dekorierer", "umhüllt " + t.name + " und ist selbst " + t.name);
      }
    }
    if (/(Adapter|Wrapper)$/.test(c.name)) {
      const target = outs.find((x) => x.type === "implement" || x.type === "inherit");
      const adaptee = outs.find((x) => (x.type === "comp" || x.type === "assoc") && (!target || x.to !== target.to));
      if (target && adaptee) tag(c, "adapter", "Adapter", C[adaptee.to].name + " → " + C[target.to].name);
    }
  }
  // Strategy
  for (const c of C) {
    if (!(c.kind === "interface" || c.kind === "abstract")) continue;
    const impls = (into.get(c.id) || []).filter((e) => e.type === "implement" || e.type === "inherit").map((e) => C[e.from]);
    const swaps = (h) => h.methods.some((m) => !m.ctor && (m.params.some((p) => idsOf(p.type || "").includes(c.name)) || new RegExp("^set_?" + c.name, "i").test(m.name)));
    const holders = (into.get(c.id) || []).filter((e) => (e.type === "assoc" || e.type === "comp") && e.mult !== "*" && !impls.includes(C[e.from])).map((e) => C[e.from]).filter(swaps);
    if (impls.length >= 2 && holders.length) {
      tag(c, "strategy", "Strategie", impls.length + " austauschbare Implementierungen");
      for (const h of holders) tag(h, "strategy", "Kontext", "hält eine " + c.name + "-Strategie");
      for (const i of impls) tag(i, "strategy", "Konkr. Strategie", "implementiert " + c.name);
    }
  }
  M.patCount = {}; for (const c of C) for (const p of c.pats) M.patCount[p.k] = (M.patCount[p.k] || 0) + 1;
  M.patClasses = {}; for (const c of C) for (const p of c.pats) (M.patClasses[p.k] = M.patClasses[p.k] || new Set()).add(c.id);
}

/* ============================ Layout ============================ */
function fieldText(f, full) {
  return full ? `${f.name}${f.type ? ": " + f.type : ""}${f.init ? " = " + f.init : ""}` : `${f.name}${f.type ? ": " + f.type : ""}`;
}
function methText(m, full) {
  const ps = full ? m.params.map((p) => p.name + (p.type ? ": " + p.type : "")).join(", ") : m.params.length ? "…" : "";
  return `${m.name}(${ps})${m.ret ? ": " + m.ret : ""}`;
}
function geom(c) {
  const nf = Math.min(c.fields.length, MAXR) + (c.fields.length > MAXR ? 1 : 0);
  const nm = Math.min(c.methods.length, MAXR) + (c.methods.length > MAXR ? 1 : 0);
  c.fH = nf ? nf * ROW + PADT * 2 : 10;
  c.mH = nm ? nm * ROW + PADT * 2 : 10;
  c.h = HEAD + c.fH + c.mH;
  let mx = c.name.length * 1.25 + 4;
  for (const f of c.fields.slice(0, MAXR)) mx = Math.max(mx, fieldText(f, true).length + 2);
  for (const m of c.methods.slice(0, MAXR)) mx = Math.max(mx, methText(m, true).length + 2);
  c.w = Math.round(clamp(30 + Math.min(mx, 64) * 6.9, 210, 480));
}
function layoutModel(M) {
  const groups = new Map();
  for (const c of M.classes) { geom(c); if (!groups.has(c.module)) groups.set(c.module, { key: c.module, ids: [] }); groups.get(c.module).ids.push(c.id); }
  const parentsIn = new Map();
  for (const e of M.edges) if (e.type === "inherit" || e.type === "implement") {
    const a = M.classes[e.from], b = M.classes[e.to];
    if (a.module === b.module) (parentsIn.get(a.id) || parentsIn.set(a.id, []).get(a.id)).push(b.id);
  }
  // prozeduraler Code: Aufrufer oben, aufgerufene Module / genutzte Typen darunter
  for (const e of M.edges) if (["call", "imp", "data", "assoc", "comp"].includes(e.type)) {
    const a = M.classes[e.from], b = M.classes[e.to];
    if (a.module === b.module && a.kind === "module" && b.kind !== "interface") (parentsIn.get(b.id) || parentsIn.set(b.id, []).get(b.id)).push(a.id);
  }
  const G = [...groups.values()].sort((a, b) => a.key.localeCompare(b.key));
  const tops = [...new Set(G.map((g) => g.key.split("/")[0]))];
  for (const g of G) {
    const memo = new Map();
    const depth = (id, seen) => {
      if (memo.has(id)) return memo.get(id); if (seen.has(id)) return 0; seen.add(id);
      const ps = parentsIn.get(id) || []; const d = ps.length ? 1 + Math.max(...ps.map((p) => depth(p, seen))) : 0;
      memo.set(id, d); return d;
    };
    const rows = new Map();
    for (const id of g.ids) { const d = depth(id, new Set()); if (!rows.has(d)) rows.set(d, []); rows.get(d).push(M.classes[id]); }
    const area = g.ids.reduce((s, id) => s + (M.classes[id].w + GAPX) * (M.classes[id].h + GAPY), 0);
    const maxW = Math.max(760, Math.sqrt(area) * 1.55, ...g.ids.map((id) => M.classes[id].w));
    let y = GTOP, gw = 0;
    const order = new Map();
    for (const d of [...rows.keys()].sort((a, b) => a - b)) {
      const row = rows.get(d);
      row.sort((a, b) => {
        const pa = (parentsIn.get(a.id) || [])[0], pb = (parentsIn.get(b.id) || [])[0];
        const oa = pa != null ? order.get(pa) ?? 1e9 : -1, ob = pb != null ? order.get(pb) ?? 1e9 : -1;
        return oa - ob || b.inc + b.out - (a.inc + a.out) || a.name.localeCompare(b.name);
      });
      let x = GPAD, rowH = 0;
      for (const c of row) {
        if (x > GPAD && x + c.w > maxW + GPAD) { y += rowH + GAPY; x = GPAD; rowH = 0; }
        c.lx = x; c.ly = y; order.set(c.id, order.size); x += c.w + GAPX; rowH = Math.max(rowH, c.h); gw = Math.max(gw, x - GAPX);
      }
      y += rowH + GAPY + 26;
    }
    g.w = gw + GPAD; g.h = y - GAPY - 26 + GPAD;
    g.color = tops.indexOf(g.key.split("/")[0]) % 8;
    g.label = g.key;
  }
  // Skyline-Packing in Pfad-Reihenfolge (Nachbarordner bleiben nah)
  const area = G.reduce((s, g) => s + (g.w + GGAP) * (g.h + GGAP), 0);
  const W = Math.max(Math.sqrt(area * 1.7), ...G.map((g) => g.w + GGAP));
  let sky = [{ x: 0, w: W, y: 0 }];
  for (const g of G) {
    const gw = g.w + GGAP; let best = null;
    for (let i = 0; i < sky.length; i++) {
      if (sky[i].x + gw > W + 1) break;
      let wLeft = gw, j = i, y = 0;
      while (wLeft > 0 && j < sky.length) { y = Math.max(y, sky[j].y); wLeft -= sky[j].w; j++; }
      if (wLeft > 0) continue;
      if (!best || y < best.y - 1) best = { x: sky[i].x, y };
    }
    if (!best) best = { x: 0, y: Math.max(...sky.map((s) => s.y)) };
    g.x = best.x; g.y = best.y;
    const ny = best.y + g.h + GGAP, x0 = best.x, x1 = best.x + gw, next = [];
    for (const s of sky) {
      const a = s.x, b = s.x + s.w;
      if (b <= x0 || a >= x1) { next.push(s); continue; }
      if (a < x0) next.push({ x: a, w: x0 - a, y: s.y });
      if (b > x1) next.push({ x: x1, w: b - x1, y: s.y });
    }
    next.push({ x: x0, w: gw, y: ny }); next.sort((p, q) => p.x - q.x);
    sky = [];
    for (const s of next) { const l = sky[sky.length - 1]; if (l && Math.abs(l.y - s.y) < 0.5 && Math.abs(l.x + l.w - s.x) < 0.5) l.w += s.w; else sky.push({ ...s }); }
    for (const id of g.ids) { const c = M.classes[id]; c.x = g.x + c.lx; c.y = g.y + c.ly; c.g = g; }
  }
  M.groups = G;
  // Aggregierte Modulkanten
  const gm = new Map();
  for (const e of M.edges) {
    const ga = M.classes[e.from].g, gb = M.classes[e.to].g; if (ga === gb) continue;
    const k = ga.key + "\u0000" + gb.key; const v = gm.get(k) || { a: ga, b: gb, n: 0, types: {} };
    v.n++; v.types[e.type] = (v.types[e.type] || 0) + 1; gm.set(k, v);
  }
  M.gedges = [...gm.values()];
  updateBB(M);
}
function updateGroup(g, M) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const id of g.ids) { const c = M.classes[id]; x0 = Math.min(x0, c.x); y0 = Math.min(y0, c.y); x1 = Math.max(x1, c.x + c.w); y1 = Math.max(y1, c.y + c.h); }
  g.x = x0 - GPAD; g.y = y0 - GTOP; g.w = x1 - x0 + GPAD * 2; g.h = y1 - y0 + GTOP + GPAD;
}
function updateBB(M) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const g of M.groups) { x0 = Math.min(x0, g.x); y0 = Math.min(y0, g.y); x1 = Math.max(x1, g.x + g.w); y1 = Math.max(y1, g.y + g.h); }
  M.bb = isFinite(x0) ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : { x: 0, y: 0, w: 100, h: 100 };
}
const fieldY = (c, i) => c.y + HEAD + PADT + i * ROW + ROW / 2;
const methY = (c, j) => c.y + HEAD + c.fH + PADT + j * ROW + ROW / 2;

/* ============================ Render-Engine (imperativ) ============================ */
function createEngine(canvas, mini, cb, ovc) {
  const ctx = canvas.getContext("2d"), mctx = mini.getContext("2d"), octx = ovc ? ovc.getContext("2d") : null;
  let LIVE = null, liveRaf = 0;
  let VB = null, VBK = null, AG = null, PIN = null, lastUser = 0, INSET = 0;   // Änderungsebene (aufgelöst / nach Schlüsseln), KI-Ebene, letzte Eingabe des Nutzers
  let M = null, W = 1, H = 1, dpr = 1, raf = 0, anim = null, lastLvl = -1;
  const V = { x: 0, y: 0, k: 0.3 };
  let C = {}, types = { inherit: 1, implement: 1, comp: 1, assoc: 1, dep: 1 }, pat = "";
  let sel = null, hover = null, hl = null, hlE = null, hlG = null, chips = [], DG = new Map();
  // Leistung: Kantenbudget, räumlicher Index, Momentaufnahme beim Navigieren, Minimap-Cache
  let budget = 8000, IDX = null, stamp = null, fno = 0, idxDirty = false;
  let lastCost = 0, busyUntil = 0, idleT = 0, snapV = null, dragging = false, statTxt = "";
  let moving = false, lastDrawT = 0, gpuMs = 0, CL = null;
  let IV = null, HV = null, TMV = null;   // Wirkungsbereich · Wärmekarte · Team-Agenten
  let TV = null;   // Testansicht: { on: Ziele, die der gewählte Test ausgeführt hat, fail: Fehlerort/Prüfung }   // Navigation läuft · Zeitpunkt des letzten vollen Bildes · gemessene Bildzeit inkl. GPU · Zuschnittrahmen
  const snap = document.createElement("canvas"), sctx = snap.getContext("2d");
  const miniC = document.createElement("canvas"), miniX = miniC.getContext("2d"); let miniDirty = true;
  const poke = () => { busyUntil = performance.now() + 140; };
  const MONO = '"DM Mono","JetBrains Mono",ui-monospace,monospace';

  function readColors() {
    const cs = getComputedStyle(canvas), g = (n) => cs.getPropertyValue(n).trim() || "#888888";
    C = { bg: g("--bg"), bg2: g("--bg2"), bg3: g("--bg3"), surface: g("--surface"), border: g("--border"), fg: g("--fg"), fg2: g("--fg2"), fg3: g("--fg3"),
      accent: g("--accent"), accent2: g("--accent2"), amber: g("--amber"), red: g("--red"), violet: g("--violet"), ax: g("--ax"), ay: g("--ay"), az: g("--az") };
    C.light = lum(C.bg) > 0.5;
    C.mod = [C.accent, C.accent2, C.violet, C.amber, C.az, C.ay, C.ax, C.red];
  }
  const headTxt = (col) => (lum(col) > 0.45 ? (C.light ? C.fg : C.bg) : (C.light ? C.surface : C.fg));
  const req = () => { if (!raf) raf = requestAnimationFrame(frame); };
  function frame(t) {
    raf = 0;
    if (anim) {
      const p = clamp((t - anim.t0) / anim.dur, 0, 1), e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
      const lk = Math.log(anim.a.k) + (Math.log(anim.b.k) - Math.log(anim.a.k)) * e, k = Math.exp(lk);
      const cx = anim.ca.x + (anim.cb.x - anim.ca.x) * e, cy = anim.ca.y + (anim.cb.y - anim.ca.y) * e;
      V.k = k; V.x = W / 2 - cx * k; V.y = H / 2 - cy * k;
      if (p >= 1) anim = null; else req();
    }
    const now = performance.now();
    const wasMoving = moving;
    moving = !!(anim || now < busyUntil || dragging);
    const heavy = Math.max(lastCost, gpuMs) > 30;
    // selbst das leichte Bild ist zu teuer → letztes Bild transformiert zeigen (60 fps), scharf nachzeichnen sobald Ruhe
    if (moving && heavy && snapV && !dragging) {
      drawSnap(); clearTimeout(idleT); idleT = setTimeout(req, 160); return;
    }
    if (idxDirty && M) buildEdgeGrid();
    const t0 = performance.now();
    draw();
    lastCost = performance.now() - t0;
    // echte Bildzeit: Abstand zweier direkt aufeinander folgender voller Bilder enthält auch die Rasterung auf der Grafikkarte
    if (moving && wasMoving && t - lastDrawT < 150) gpuMs = gpuMs * 0.6 + (t - lastDrawT) * 0.4;
    else if (!moving) gpuMs *= 0.7;
    lastDrawT = t;
    if (moving) { clearTimeout(idleT); idleT = setTimeout(req, 170); }   // nach der Bewegung einmal in voller Qualität
    if (Math.max(lastCost, gpuMs) > 30) {
      if (snap.width !== canvas.width || snap.height !== canvas.height) { snap.width = canvas.width; snap.height = canvas.height; }
      sctx.setTransform(1, 0, 0, 1, 0, 0); sctx.clearRect(0, 0, snap.width, snap.height); sctx.drawImage(canvas, 0, 0); snapV = { x: V.x, y: V.y, k: V.k };
    } else snapV = null;
    cb.onStats && cb.onStats(statTxt + (Math.max(lastCost, gpuMs) > 30 ? `  ·  ${Math.round(Math.max(lastCost, gpuMs))} ms/Bild` : ""));
    liveReq();
  }
  function drawSnap() {
    const r = V.k / snapV.k, tx = (V.x - snapV.x * r) * dpr, ty = (V.y - snapV.y * r) * dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.fillStyle = C.bg;
    if (Math.abs(r - 1) < 1e-6) {
      // reines Verschieben: pixelgenaue Kopie, nur die frei werdenden Ränder füllen
      const ix = Math.round(tx), iy = Math.round(ty), cw = canvas.width, ch = canvas.height;
      if (ix > 0) ctx.fillRect(0, 0, ix, ch); if (ix < 0) ctx.fillRect(cw + ix, 0, -ix, ch);
      if (iy > 0) ctx.fillRect(0, 0, cw, iy); if (iy < 0) ctx.fillRect(0, ch + iy, cw, -iy);
      ctx.imageSmoothingEnabled = false; ctx.drawImage(snap, ix, iy); ctx.imageSmoothingEnabled = true;
    } else {
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(r, 0, 0, r, tx, ty); ctx.imageSmoothingQuality = "low"; ctx.drawImage(snap, 0, 0);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawMini(); cb.onZoom && cb.onZoom(V.k, lodOf(V.k)); liveReq();
  }
  /* ---------- Live-Ebene (eigenes Canvas, jedes Frame) ---------- */
  function liveReq() { if (octx && !liveRaf) liveRaf = requestAnimationFrame(liveFrame); }
  function liveFrame() {
    liveRaf = 0; if (!octx) return;
    const now = performance.now();
    octx.setTransform(1, 0, 0, 1, 0, 0); octx.clearRect(0, 0, ovc.width, ovc.height);
    drawTestView();
    const a = drawLive(now), b = drawAgent(now), c = drawPin(now);
    if (a || b || c) liveReq();
  }
  /* ---------- Testansicht: was der gewählte Test ausgeführt hat (gestrichelt), wo er scheitert (rot) ---------- */
  function drawTestView() {
    if ((!TV && !IV && !HV && !TMV) || !M || !octx) return;
    const T = TV || { on: [], fail: [] };
    const o = octx, k = V.k, lvl = lodOf(k), px = 1 / k;
    o.setTransform(dpr * k, 0, 0, dpr * k, dpr * V.x, dpr * V.y);
    const vb = { x0: -V.x / k, y0: -V.y / k, x1: (W - V.x) / k, y1: (H - V.y) / k };
    const boxed = new Set();
    const mark = (t, col, strong, label) => {
      const c = M.classes[t.id]; if (!c || !vis(c.x, c.y, c.w, c.h, vb, 60)) return;
      const g = (strong ? 8 : 5) * px;
      if (!boxed.has(c.id + (strong ? "!" : ""))) {
        boxed.add(c.id + (strong ? "!" : ""));
        o.globalAlpha = strong ? 0.95 : 0.7; o.strokeStyle = col; o.lineWidth = (strong ? 3 : 2) * px;
        o.setLineDash(strong ? [] : [7 * px, 5 * px]); o.strokeRect(c.x - g, c.y - g, c.w + 2 * g, c.h + 2 * g); o.setLineDash([]);
        if (lvl === 0) { o.globalAlpha = strong ? 0.45 : 0.25; o.fillStyle = col; o.fillRect(c.x, c.y, c.w, c.h); }
      }
      if (lvl >= 2 && t.m && t.m.i < MAXR) {
        const y = rowY(c, t.m.t, t.m.i);
        o.globalAlpha = strong ? 0.3 : 0.16; o.fillStyle = col; o.fillRect(c.x + 1, y - ROW / 2, c.w - 2, ROW);
        o.globalAlpha = 1; o.fillRect(c.x + 1, y - ROW / 2, 3, ROW);
      }
      if (label && c.w * k > 50) {
        const fs = clamp(10.5 * px, 9, 80), w = label.length * fs * 0.62 + fs, h = fs * 1.65, x = c.x - g, y = c.y - g - h - 3 * px;
        o.globalAlpha = 1; o.fillStyle = col; o.fillRect(x, y, w, h);
        o.fillStyle = C.light ? C.surface : C.bg; o.font = `700 ${fs}px ${MONO}`; o.textAlign = "left"; o.textBaseline = "middle"; o.fillText(label, x + fs * 0.5, y + h / 2 + fs * 0.05);
      }
    };
    if (HV) {   // Wärmekarte: Bausteine nach Wert (0…1) einfärben
      const col = C[HV.col] || C.amber;
      for (const [id, v] of HV.vals) { const c = M.classes[id]; if (!c || !vis(c.x, c.y, c.w, c.h, vb, 60)) continue; o.globalAlpha = 0.1 + 0.55 * Math.min(1, v); o.fillStyle = col; o.fillRect(c.x, c.y, c.w, c.h); }
      o.globalAlpha = 1;
    }
    if (IV) { let first = true; for (const t of IV.list) { mark(t, C.violet, false, first ? IV.label || "" : ""); first = false; } for (const t of IV.src || []) mark(t, C.violet, true, ""); boxed.clear(); }
    if (TMV) for (const a of TMV) { let first = true; for (const t of a.targets) { mark(t, a.color, a.live, first ? a.label : ""); first = false; } boxed.clear(); }
    for (const t of T.miss || []) mark(t, C.amber, false, "");
    for (const t of T.on) mark(t, C.accent, false, "");
    for (const t of T.fail) mark(t, C.red, true, t.label || "");
    o.globalAlpha = 1;
  }
  function anchorOf(t, toward, lvl) {
    const c = M.classes[t.id];
    const right = toward ? toward.x > c.x + c.w / 2 : true;
    const y = lvl >= 2 && t.m ? rowY(c, t.m.t, t.m.i) : c.y + Math.min(c.h / 2, HEAD + 10);
    return { x: right ? c.x + c.w : c.x, y, cx: c.x + c.w / 2, cy: c.y + c.h / 2, c };
  }
  function drawLive(now) {
    if (!octx) return false;
    const o = octx;
    const L = LIVE;
    if (!L || !M || (!L.codes.size && !L.particles.length && !L.bpKeys.size)) return false;
    const k = V.k, lvl = lodOf(k);
    o.setTransform(dpr * k, 0, 0, dpr * k, dpr * V.x, dpr * V.y);
    const vb = { x0: -V.x / k, y0: -V.y / k, x1: (W - V.x) / k, y1: (H - V.y) / k };
    const dt = L._lt ? Math.min(0.2, (now - L._lt) / 1000) : 0; L._lt = now;
    const decay = Math.exp(-dt / 0.9);
    let anim = L.status === "running" || L.status === "building";
    // aktive Funktionen aus den Thread-Stacks
    const act = new Map();
    const paused = new Map();
    for (const th of L.threads.values()) {
      const col = C[THREAD_TOK[th.n % THREAD_TOK.length]]; th.stack.forEach((ci, j) => act.set(ci, { col, top: j === th.stack.length - 1, th }));
      if (th.paused) paused.set(th.paused.key, th);
    }
    const multi = L.runs.size > 1;
    const agg = new Map();
    const px = 1 / k, RED = C.red, AMB = C.amber;
    o.textBaseline = "middle";
    for (const c of L.codes.values()) {
      c.heat *= decay; if (c.heat > 0.02) anim = true;
      const t = c.target; if (!t) continue;
      const cl = M.classes[t.id]; if (!cl) continue;
      const a = act.get(c.key);
      const pulse = c.err ? Math.max(0, 1 - (now - c.err) / 2600) : 0, wpulse = c.warnT ? Math.max(0, 1 - (now - c.warnT) / 1800) : 0;
      if (pulse > 0 || wpulse > 0) anim = true;
      // rot = Aufruf ist mit Fehler zurückgekehrt (Ergebnis nicht zugestellt) oder Absturz; gelb = Ausnahme hier abgefangen
      const bad = c.errs > 0 || c.fatal, caught = c.warn > 0 || (c.raised > 0 && !bad);
      let g = agg.get(t.id);
      if (!g) agg.set(t.id, (g = { cl, heat: 0, calls: 0, bad: false, fatal: false, warn: 0, pulse: 0, act: null }));
      g.heat = Math.max(g.heat, c.heat); g.calls += c.calls; g.bad = g.bad || bad; g.fatal = g.fatal || c.fatal; g.warn += caught ? 1 : 0; g.pulse = Math.max(g.pulse, bad ? pulse : 0);
      if (a && (!g.act || a.top)) g.act = a;
      if (lvl >= 2 && t.m && vis(cl.x, cl.y, cl.w, cl.h, vb)) {
        const n = t.m.t === "f" ? cl.fields.length : cl.methods.length; if (t.m.i >= Math.min(n, MAXR)) continue;
        const y = rowY(cl, t.m.t, t.m.i), x0 = cl.x + 1, w = cl.w - 2;
        if (bad) { o.globalAlpha = 0.16 + 0.22 * pulse; o.fillStyle = RED; o.fillRect(x0, y - ROW / 2, w, ROW); o.globalAlpha = 1; o.fillStyle = RED; o.fillRect(cl.x + cl.w - 5, y - ROW / 2, 4, ROW); }
        else if (caught) { o.globalAlpha = 0.1 + 0.18 * wpulse; o.fillStyle = AMB; o.fillRect(x0, y - ROW / 2, w, ROW); o.globalAlpha = 1; o.fillStyle = AMB; o.fillRect(cl.x + cl.w - 5, y - ROW / 2, 4, ROW); }
        if (c.heat > 0.02) { o.globalAlpha = Math.min(0.2, c.heat * 0.14); o.fillStyle = a ? a.col : C.accent; o.fillRect(x0, y - ROW / 2, w, ROW); o.globalAlpha = 1; }
        if (a) {
          o.fillStyle = a.col; o.fillRect(cl.x - 6, y - ROW / 2 + 2, 4, ROW - 4);
          if (a.top) { o.beginPath(); o.moveTo(cl.x - 16, y - 5); o.lineTo(cl.x - 8, y); o.lineTo(cl.x - 16, y + 5); o.closePath(); o.fill(); }
        }
        if (c.calls) {
          const txt = (bad ? "✕ " + (c.errs || 1) + "  " : caught ? "▲ " + (c.warn || c.raised) + "  " : "") + "×" + de(c.calls);
          o.font = `600 9.5px ${'"DM Mono",ui-monospace,monospace'}`; const tw = txt.length * 5.8 + 8;
          o.fillStyle = rgba(C.bg, 0.85); o.fillRect(cl.x + cl.w + 8, y - 7, tw, 14);
          o.fillStyle = bad ? RED : caught ? AMB : a ? a.col : C.fg2; o.textAlign = "left"; o.fillText(txt, cl.x + cl.w + 12, y + 0.5);
        }
      }
    }
    // Knoten
    for (const [id, g] of agg) {
      const cl = g.cl; if (!vis(cl.x, cl.y, cl.w, cl.h, vb, 40)) continue;
      const col = g.bad ? RED : g.act ? g.act.col : g.warn ? AMB : C.accent;
      if (lvl === 0) {
        o.globalAlpha = Math.min(0.8, 0.2 + g.heat * 0.45 + (g.bad ? 0.35 : 0) + g.pulse * 0.25); o.fillStyle = col; o.fillRect(cl.x, cl.y, cl.w, cl.h);
        if (g.act || g.bad) { o.globalAlpha = 1; o.strokeStyle = col; o.lineWidth = 3 * px; o.strokeRect(cl.x - 2 * px, cl.y - 2 * px, cl.w + 4 * px, cl.h + 4 * px); }
        o.globalAlpha = 1; continue;
      }
      const lw = (g.act ? 2.5 : 1.5) + g.heat * 3 + g.pulse * 3;
      o.globalAlpha = g.act || g.bad ? 0.95 : Math.min(0.9, g.heat * 0.7); o.strokeStyle = col; o.lineWidth = lw * px;
      if (o.globalAlpha > 0.03) o.strokeRect(cl.x - 3 * px, cl.y - 3 * px, cl.w + 6 * px, cl.h + 6 * px);
      if (g.pulse > 0 && g.bad) { o.globalAlpha = g.pulse * 0.6; o.lineWidth = 2 * px; const r = (1 - g.pulse) * 26 * px; o.strokeRect(cl.x - 3 * px - r, cl.y - 3 * px - r, cl.w + 6 * px + 2 * r, cl.h + 6 * px + 2 * r); }
      o.globalAlpha = 1;
      // Plakette unter dem Knoten
      const fs = 10 * px, rl = g.act && multi ? runShort(L.runs.get(g.act.th.run)) + " · " : "";
      const txt = (g.fatal ? "✕ ABSTURZ  " : g.bad ? "✕ Fehler  " : g.warn ? "▲ abgefangen  " : "") + (g.act ? "▶ " + rl + g.act.th.name + "  " : "") + "×" + de(g.calls);
      const tw = txt.length * fs * 0.62 + 10 * px;
      o.fillStyle = col; o.globalAlpha = 0.92; o.fillRect(cl.x, cl.y + cl.h + 5 * px, tw, fs * 1.7); o.globalAlpha = 1;
      o.fillStyle = C.light ? C.surface : C.bg; o.font = `700 ${fs}px "DM Mono",ui-monospace,monospace`; o.textAlign = "left";
      o.fillText(txt, cl.x + 5 * px, cl.y + cl.h + 5 * px + fs * 0.85);
    }
    // Signale (Partikel)
    const keep = [];
    const R = 4.2 * px;
    for (const p of L.particles) {
      const tt = (now - p.t0) / p.dur;
      if (tt < 0) { keep.push(p); continue; }
      if (tt >= 1) { if (p.kind === "err") L.bursts.push({ i: p.b, t0: now, kind: "err" }); continue; }
      keep.push(p);
      const ca = L.codes.get(p.a), cbb = L.codes.get(p.b); if (!ca || !cbb || !ca.target || !cbb.target) continue;
      const A0 = anchorOf(ca.target, null, lvl), B0 = anchorOf(cbb.target, null, lvl);
      const A = anchorOf(ca.target, { x: B0.cx }, lvl), B = anchorOf(cbb.target, { x: A0.cx }, lvl);
      let x1 = A.x, y1 = A.y, x2 = B.x, y2 = B.y, c1x, c1y, c2x, c2y;
      if (A.c === B.c) { const off = 40 + Math.abs(y2 - y1) * 0.3; x1 = x2 = A.c.x + A.c.w; c1x = x1 + off; c2x = x2 + off; c1y = y1; c2y = y2; }
      else { const d = x2 > x1 ? 1 : -1, off = Math.max(50, Math.abs(x2 - x1) * 0.4) * d; c1x = x1 + off; c1y = y1; c2x = x2 - off; c2y = y2; }
      const e = tt < 0.5 ? 2 * tt * tt : 1 - Math.pow(-2 * tt + 2, 2) / 2, u = 1 - e;
      const x = u * u * u * x1 + 3 * u * u * e * c1x + 3 * u * e * e * c2x + e * e * e * x2, y = u * u * u * y1 + 3 * u * u * e * c1y + 3 * u * e * e * c2y + e * e * e * y2;
      const pc = p.kind === "err" ? RED : p.kind === "chan" || p.kind === "net" ? C.violet : C[THREAD_TOK[((L.threads.get(p.th) || { n: 0 }).n) % THREAD_TOK.length]];
      if (vis(x - 20, y - 20, 40, 40, vb)) {
        o.globalAlpha = p.kind === "net" ? 0.32 : 0.14; o.strokeStyle = pc; o.lineWidth = (p.kind === "net" ? 3 : 2) * px; o.setLineDash(p.kind === "err" ? [4 * px, 3 * px] : p.kind === "net" ? [8 * px, 4 * px] : []);
        o.beginPath(); o.moveTo(x1, y1); o.bezierCurveTo(c1x, c1y, c2x, c2y, x2, y2); o.stroke(); o.setLineDash([]);
        o.globalAlpha = 1; o.fillStyle = pc; o.beginPath(); o.arc(x, y, p.kind === "net" ? R * 1.7 : p.kind === "chan" ? R * 1.3 : R, 0, 7); o.fill();
        if (p.kind === "chan" || p.kind === "net") { o.strokeStyle = C.bg; o.lineWidth = 1.5 * px; o.stroke(); }
      }
      anim = true;
    }
    L.particles = keep;
    // Fehler-Blitze
    const kb = [];
    for (const b of L.bursts) {
      const tt = (now - b.t0) / 900; if (tt >= 1) continue; kb.push(b);
      const c = L.codes.get(b.i); if (!c || !c.target) continue;
      const A = anchorOf(c.target, null, lvl), x = lvl >= 2 && c.target.m ? A.c.x + A.c.w - 12 * px : A.cx, y = A.y;
      const col = b.kind === "warn" ? AMB : RED;
      o.globalAlpha = 1 - tt; o.strokeStyle = col; o.lineWidth = 2.5 * px; o.beginPath(); o.arc(x, y, (6 + 26 * tt) * px, 0, 7); o.stroke();
      if (b.kind === "err") { const s = 6 * px; o.lineWidth = 3 * px; o.beginPath(); o.moveTo(x - s, y - s); o.lineTo(x + s, y + s); o.moveTo(x + s, y - s); o.lineTo(x - s, y + s); o.stroke(); }
      anim = true;
    }
    L.bursts = kb.slice(-300);
    // Haltepunkte (rote Punkte links an der Zeile / am Knoten)
    if (L.bpKeys.size) for (const id of L.bpKeys) {
      const [ci, mk] = id.split("|"), cl = M.classes[+ci]; if (!cl || !vis(cl.x, cl.y, cl.w, cl.h, vb, 30)) continue;
      let y = cl.y + Math.min(cl.h / 2, HEAD + 10), x = cl.x - 9 * px, r = 5 * px;
      if (mk && lvl >= 2) { const t = mk[0], i = +mk.slice(1); if (i < MAXR) { y = rowY(cl, t, i); x = cl.x - 22; r = 4.5; } }
      else if (lvl < 2) { x = cl.x + 8 * px; y = cl.y + 8 * px; r = 6 * px; }
      o.fillStyle = RED; o.beginPath(); o.arc(x, y, r, 0, 7); o.fill(); o.strokeStyle = C.bg; o.lineWidth = 1.5 * (lvl >= 2 && mk ? 1 : px); o.stroke();
    }
    // angehaltene Threads
    for (const [key, th] of paused) {
      const c = L.codes.get(key); if (!c || !c.target) continue;
      const cl = M.classes[c.target.id]; if (!cl || !vis(cl.x, cl.y, cl.w, cl.h, vb, 80)) continue;
      const bp = th.paused.reason === "Haltepunkt", col = bp ? RED : AMB, pul = 0.5 + 0.5 * Math.sin(now / 260);
      o.globalAlpha = 0.55 + 0.45 * pul; o.strokeStyle = col; o.lineWidth = 3 * px; o.setLineDash([6 * px, 4 * px]);
      o.strokeRect(cl.x - 7 * px, cl.y - 7 * px, cl.w + 14 * px, cl.h + 14 * px); o.setLineDash([]); o.globalAlpha = 1;
      if (lvl >= 2 && c.target.m && c.target.m.i < MAXR) {
        const y = rowY(cl, c.target.m.t, c.target.m.i); o.globalAlpha = 0.22 + 0.15 * pul; o.fillStyle = col; o.fillRect(cl.x + 1, y - ROW / 2, cl.w - 2, ROW); o.globalAlpha = 1;
      }
      const fs = 11 * px, txt = (bp ? "● HALTEPUNKT  " : "⏸ PAUSE  ") + (multi ? runShort(L.runs.get(th.run)) + " · " : "") + th.name;
      const tw = txt.length * fs * 0.62 + 12 * px;
      o.fillStyle = col; o.fillRect(cl.x, cl.y - 9 * px - fs * 1.8, tw, fs * 1.8);
      o.fillStyle = C.light ? C.surface : C.bg; o.font = `700 ${fs}px "DM Mono",ui-monospace,monospace`; o.textAlign = "left";
      o.fillText(txt, cl.x + 6 * px, cl.y - 9 * px - fs * 0.9);
      anim = true;
    }
    o.globalAlpha = 1;
    return anim;
  }
  /* ---------- Änderungsebene: Schlüssel → Knoten des aktuellen Modells ---------- */
  function resolveVB() {
    VB = null;
    if (!VBK || !M) return;
    const nodes = new Map(), edges = new Map(), links = [], gi = new Map();
    for (const c of M.classes) {
      const v = VBK.nodes.get(c.dk); if (!v) continue;
      const rows = new Map();
      fkOf(c).forEach((k, i) => { const s = v.f.get(k); if (s) rows.set("f" + i, s); });
      mkOf(c).forEach((k, i) => { const s = v.m.get(k); if (s) rows.set("m" + i, s); });
      nodes.set(c.id, { st: v.st, add: v.add, chg: v.chg, del: v.del, rows });
    }
    for (const e of M.edges) { const s = VBK.edges.get(e.dk); if (s) edges.set(e.id, s); }
    for (const l of VBK.links) {
      const c = M.byDk.get(l.a), t = M.byDk.get(l.b); if (!c || !t) continue;
      const i = mkOf(c).indexOf(l.am); if (i < 0) continue;
      const j = l.bt === "m" ? mkOf(t).indexOf(l.bm) : l.bt === "f" ? fkOf(t).indexOf(l.bm) : -1;
      links.push({ from: { id: c.id, i }, to: { id: t.id, t: l.bt, i: j }, kind: l.kind });
    }
    const ghosts = VBK.ghosts.filter((g) => !M.byDk.has(g.dk));
    ghosts.forEach((g, i) => gi.set(g.dk, i));
    const end = (dk) => { const c = M.byDk.get(dk); return c ? { id: c.id } : gi.has(dk) ? { g: gi.get(dk) } : null; };
    const ghostEdges = [];
    for (const ge of VBK.ghostEdges) { const a = end(ge.a), b = end(ge.b); if (a && b) ghostEdges.push({ a, b, type: ge.type }); }
    VB = { nodes, edges, links, ghosts, ghostEdges, only: !!VBK.only };
  }
  const vbRect = (x) => (x.g != null ? VB.ghosts[x.g] : M.classes[x.id]);
  /* Rahmen und Etikett „NEU / GEÄNDERT“ an einem Knoten */
  function chgMark(c) {
    const vn = VB && VB.nodes.get(c.id); if (!vn) return;
    const px = 1 / V.k, col = vn.st === "new" ? C.ay : C.amber;
    ctx.save(); ctx.globalAlpha = 1; ctx.setLineDash([]);
    rr(c.x - 3 * px, c.y - 3 * px, c.w + 6 * px, c.h + 6 * px, 7 + 3 * px);
    ctx.strokeStyle = col; ctx.lineWidth = 2.2 * px; ctx.stroke();
    ctx.globalAlpha = 0.22; ctx.lineWidth = 8 * px; ctx.stroke(); ctx.globalAlpha = 1;
    const fs = clamp(10 * px, 9, 70);
    const txt = vn.st === "new" ? "NEU" : "GEÄNDERT" + (vn.add ? "  +" + vn.add : "") + (vn.chg ? "  ~" + vn.chg : "") + (vn.del ? "  −" + vn.del : "");
    const w = txt.length * fs * 0.62 + fs, h = fs * 1.6, x = c.x, y = c.y - h - 5 * px;
    if (c.w * V.k > 46) {
      ctx.fillStyle = col; rr(x, y, w, h, h / 2); ctx.fill();
      ctx.fillStyle = C.light ? C.surface : C.bg; ctx.font = `700 ${fs}px ${MONO}`; ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.fillText(txt, x + fs * 0.5, y + h / 2 + fs * 0.05);
    }
    ctx.restore();
  }
  /* Entfernte Knoten bleiben als rote Umrisse an ihrem alten Platz stehen */
  function drawGhosts(lvl, vb) {
    if (!VB || !VB.ghosts.length) return;
    const k = V.k, px = 1 / k;
    ctx.save(); ctx.textBaseline = "middle";
    for (const g of VB.ghosts) {
      if (!vis(g.x, g.y, g.w, g.h, vb, 30)) continue;
      ctx.globalAlpha = 1; ctx.setLineDash([7 * px, 5 * px]);
      rr(g.x, g.y, g.w, g.h, 7); ctx.fillStyle = rgba(C.red, 0.07); ctx.fill();
      ctx.strokeStyle = C.red; ctx.lineWidth = 1.8 * px; ctx.stroke(); ctx.setLineDash([]);
      if (g.w * k < 46) continue;
      const fs = lvl >= 2 ? 13 : Math.min((g.w - 24) / (g.name.length * 0.62), 15 * px, Math.max(g.h * 0.32, 18));
      if (fs * k >= 4.5) {
        const cx = g.x + g.w / 2, cy = lvl >= 2 ? g.y + HEAD / 2 : g.y + g.h / 2, tw = g.name.length * fs * 0.6;
        ctx.font = `600 ${fs}px ${MONO}`; ctx.textAlign = "center"; ctx.fillStyle = rgba(C.red, 0.95); ctx.fillText(short(g.name, Math.floor((g.w - 16) / (fs * 0.6))), cx, cy);
        ctx.fillRect(cx - Math.min(tw, g.w - 16) / 2, cy, Math.min(tw, g.w - 16), Math.max(px, fs * 0.08));
        if (lvl >= 2 && g.h > HEAD + 30) { ctx.font = `400 11px ${MONO}`; ctx.fillStyle = rgba(C.red, 0.7); ctx.fillText(`${g.nf} Variablen · ${g.nm} Funktionen`, cx, g.y + HEAD + 18); }
      }
      const ts = clamp(10 * px, 9, 70), tag = "ENTFERNT", w = tag.length * ts * 0.62 + ts, h = ts * 1.6;
      ctx.fillStyle = C.red; rr(g.x, g.y - h - 5 * px, w, h, h / 2); ctx.fill();
      ctx.fillStyle = C.light ? C.surface : C.bg; ctx.font = `700 ${ts}px ${MONO}`; ctx.textAlign = "left"; ctx.fillText(tag, g.x + ts * 0.5, g.y - h / 2 - 5 * px + ts * 0.05);
    }
    ctx.restore();
  }
  /* Neue Verbindungen (grün, „+“), geänderte (gelb), entfernte (rot gestrichelt, „−“); ab Stufe 2 zeilengenau */
  function drawChangeEdges(lvl, vb, chosen) {
    if (!VB) return;
    const k = V.k, px = 1 / k, r = clamp(6.5 * px, 4, 46);
    const badge = (x, y, col, plus) => {
      ctx.setLineDash([]); ctx.globalAlpha = 1; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
      ctx.strokeStyle = C.light ? C.surface : C.bg; ctx.lineWidth = Math.max(1.6 * px, r * 0.24); ctx.beginPath(); ctx.moveTo(x - r * 0.5, y); ctx.lineTo(x + r * 0.5, y);
      if (plus) { ctx.moveTo(x, y - r * 0.5); ctx.lineTo(x, y + r * 0.5); } ctx.stroke();
    };
    ctx.save(); ctx.lineCap = "round";
    if (VB.edges.size) for (const st of ["chg", "new"]) {
      const col = st === "new" ? C.ay : C.amber, G = [];
      for (const e of chosen) if (VB.edges.get(e.id) === st) G.push(edgeGeom(e, lvl));
      if (!G.length) continue;
      const path = () => { ctx.beginPath(); for (const g of G) tracePieces(pieces(g)); };
      ctx.setLineDash([]); ctx.strokeStyle = col;
      ctx.globalAlpha = 0.3; ctx.lineWidth = 7 * px; path(); ctx.stroke();
      ctx.globalAlpha = 1; ctx.lineWidth = 1.8 * px; path(); ctx.stroke();
      const s = clamp(8 / k, 5, 80); ctx.beginPath(); for (const g of G) arrP(g.x2, g.y2, Math.atan2(g.y2 - g.c2y, g.x2 - g.c2x), s); ctx.stroke();
      for (const g of G) { const p = bez(g, 0.3); badge(p.x, p.y, col, true); }
    }
    for (const ge of VB.ghostEdges) {
      const a = vbRect(ge.a), b = vbRect(ge.b); if (!a || !b) continue;
      const ax = a.x + a.w / 2, ay = a.y + a.h / 2, bx = b.x + b.w / 2, by = b.y + b.h / 2;
      if (Math.max(ax, bx) < vb.x0 || Math.min(ax, bx) > vb.x1 || Math.max(ay, by) < vb.y0 || Math.min(ay, by) > vb.y1) continue;
      const mx = (ax + bx) / 2 + (by - ay) * 0.12, my = (ay + by) / 2 - (bx - ax) * 0.12;
      ctx.globalAlpha = 0.8; ctx.strokeStyle = C.red; ctx.lineWidth = 1.6 * px; ctx.setLineDash([7 * px, 5 * px]);
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.quadraticCurveTo(mx, my, bx, by); ctx.stroke();
      badge((ax + 2 * mx + bx) / 4, (ay + 2 * my + by) / 4, C.red, false);
    }
    if (lvl >= 2 && VB.links.length) {
      const sz = clamp(8 / k, 5, 40); let n = 0;
      for (const l of VB.links) {
        const c = M.classes[l.from.id], t = M.classes[l.to.id]; if (!c || !t || l.from.i >= MAXR) continue;
        if (!vis(c.x, c.y, c.w, c.h, vb, 60) && !vis(t.x, t.y, t.w, t.h, vb, 60)) continue;
        if (++n > 240) break;
        const y = methY(c, l.from.i), ty = rowY(t, l.to.t, l.to.i), col = l.kind === "write" ? C.amber : C.ay;
        ctx.globalAlpha = 0.95; ctx.strokeStyle = col; ctx.lineWidth = 1.8 * px; ctx.setLineDash(l.kind === "read" || l.kind === "ref" ? [5 * px, 4 * px] : []);
        ctx.beginPath();
        if (t.id === c.id) {
          const x = c.x + c.w, off = 26 + Math.abs(ty - y) * 0.3;
          ctx.moveTo(x, y); ctx.bezierCurveTo(x + off, y, x + off, ty, x, ty); ctx.stroke(); marker(x, ty, Math.PI, "arrow", col, sz);
          continue;
        }
        const right = t.x + t.w / 2 > c.x + c.w / 2, x1 = right ? c.x + c.w : c.x, x2 = right ? t.x : t.x + t.w;
        const dir = x2 > x1 ? 1 : -1, off = Math.max(50, Math.abs(x2 - x1) * 0.4);
        ctx.moveTo(x1, y); ctx.bezierCurveTo(x1 + off * dir, y, x2 - off * dir, ty, x2, ty); ctx.stroke();
        marker(x2, ty, dir > 0 ? 0 : Math.PI, "arrow", col, sz);
        ctx.setLineDash([]); ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x1, y, 3.2 * Math.max(1, px * 0.9), 0, 7); ctx.fill();
      }
    }
    ctx.restore();
  }
  /* ---------- KI-Ebene: wo die KI gerade liest, sucht, ändert, ausführt (eigenes Canvas, animiert) ---------- */
  function drawAgent(now) {
    const A = AG;
    if (!A || !M || !A.foci.length) return false;
    const o = octx, k = V.k, lvl = lodOf(k), px = 1 / k;
    o.setTransform(dpr * k, 0, 0, dpr * k, dpr * V.x, dpr * V.y);
    const vb = { x0: -V.x / k, y0: -V.y / k, x1: (W - V.x) / k, y1: (H - V.y) / k };
    const KC = { read: C.accent2, search: C.az, edit: C.amber, write: C.amber, run: C.violet, changed: C.ay };
    const KL = { read: "LIEST", search: "SUCHT", edit: "ÄNDERT", write: "SCHREIBT", run: "FÜHRT AUS", changed: "GEÄNDERT" };
    let busy = false;
    const spot = (t) => { const c = M.classes[t.id]; return c ? { x: c.x + c.w / 2, y: lvl >= 2 && t.m ? rowY(c, t.m.t, t.m.i) : c.y + Math.min(c.h / 2, HEAD + 10), c } : null; };
    // Blickpfad: die letzten Stationen, ältere verblassen
    const pts = [];
    for (const f of A.foci) {
      if (f.kind === "changed" || !f.targets.length) continue;
      const age = f.t1 ? (now - f.t1) / 1000 : 0; if (age > 12) continue;
      const p = spot(f.targets[0]); if (p && (!pts.length || pts[pts.length - 1].c !== p.c)) pts.push({ ...p, age });
    }
    if (pts.length > 1) {
      busy = true; o.setLineDash([1.5 * px, 7 * px]); o.lineCap = "round"; o.strokeStyle = C.fg; o.lineWidth = 1.6 * px;
      for (let i = Math.max(1, pts.length - 5); i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i], al = Math.max(0, 1 - b.age / 12) * 0.4; if (al <= 0.02) continue;
        o.globalAlpha = al; o.beginPath(); o.moveTo(a.x, a.y); o.quadraticCurveTo((a.x + b.x) / 2 + (b.y - a.y) * 0.1, (a.y + b.y) / 2 - (b.x - a.x) * 0.1, b.x, b.y); o.stroke();
      }
      o.setLineDash([]); o.lineCap = "butt";
    }
    for (const f of A.foci) {
      const live = !f.t1, age = live ? 0 : (now - f.t1) / 1000, flash = f.kind === "changed", life = flash ? 2.6 : 5;
      if (!live && age > life) continue;
      busy = true;
      const a = live ? 1 : 1 - age / life, col = KC[f.kind] || C.accent, pul = 0.5 + 0.5 * Math.sin(now / 230);
      f.targets.forEach((t, ti) => {
        const c = M.classes[t.id]; if (!c || !vis(c.x, c.y, c.w, c.h, vb, 90)) return;
        const g = 6 * px;
        o.strokeStyle = col;
        if (!flash) {   // „geändert“ ist nur ein kurzes Aufleuchten: Rahmen und Etikett trägt die Änderungsebene
          o.globalAlpha = a * (live ? 0.65 + 0.35 * pul : 0.9); o.lineWidth = (live ? 3 : 2.4) * px;
          if (live) { o.setLineDash([9 * px, 6 * px]); o.lineDashOffset = -(now / 28) * px; }
          o.strokeRect(c.x - g, c.y - g, c.w + 2 * g, c.h + 2 * g); o.setLineDash([]); o.lineDashOffset = 0;
        }
        const ph = live ? ((now - f.t0) % 1500) / 1500 : age < 1.2 ? age / 1.2 : 1;
        if (ph < 1) { const r = ph * 26 * px; o.globalAlpha = a * (1 - ph) * 0.55; o.lineWidth = 2 * px; o.strokeRect(c.x - g - r, c.y - g - r, c.w + 2 * (g + r), c.h + 2 * (g + r)); }
        if (lvl >= 2 && t.m && t.m.i < MAXR) {
          const y = rowY(c, t.m.t, t.m.i);
          o.globalAlpha = a * (0.18 + 0.14 * pul); o.fillStyle = col; o.fillRect(c.x + 1, y - ROW / 2, c.w - 2, ROW);
          o.globalAlpha = a; o.beginPath(); o.moveTo(c.x + c.w + 16, y - 5); o.lineTo(c.x + c.w + 8, y); o.lineTo(c.x + c.w + 16, y + 5); o.closePath(); o.fill();
        } else if (lvl === 0) { o.globalAlpha = a * (0.25 + 0.25 * pul); o.fillStyle = col; o.fillRect(c.x, c.y, c.w, c.h); }
        if (ti === 0 && !flash && (live || age < 1.4) && c.w * k > 60) {
          const fs = clamp(10.5 * px, 9, 80), txt = "✦ " + (KL[f.kind] || "KI") + (f.targets.length > 1 ? "  +" + (f.targets.length - 1) : "");
          const w = txt.length * fs * 0.62 + fs, h = fs * 1.65, x = c.x + c.w - w + g, y = c.y - g - h - 3 * px;
          o.globalAlpha = a; o.fillStyle = col; o.fillRect(x, y, w, h);
          o.fillStyle = C.light ? C.surface : C.bg; o.font = `700 ${fs}px ${MONO}`; o.textAlign = "left"; o.textBaseline = "middle"; o.fillText(txt, x + fs * 0.5, y + h / 2 + fs * 0.05);
        }
      });
    }
    o.globalAlpha = 1;
    return busy;
  }
  /* ---------- Eine in der Änderungsliste angeklickte Verbindung für ein paar Sekunden hervorheben ---------- */
  function drawPin(now) {
    if (!PIN || !M) return false;
    const age = (now - PIN.t0) / 1000, c = M.classes[PIN.a], t = M.classes[PIN.b];
    if (age > 6 || !c || !t) { PIN = null; return false; }
    const o = octx, k = V.k, px = 1 / k, lvl = lodOf(k), al = age < 4.5 ? 1 : 1 - (age - 4.5) / 1.5;
    o.setTransform(dpr * k, 0, 0, dpr * k, dpr * V.x, dpr * V.y);
    const y1 = lvl >= 2 && PIN.ai >= 0 && PIN.ai < MAXR ? methY(c, PIN.ai) : c.y + c.h / 2;
    const y2 = lvl >= 2 && PIN.bi >= 0 && PIN.bi < MAXR ? rowY(t, PIN.bt, PIN.bi) : t.y + t.h / 2;
    let x1, x2, c1, c2;
    const stacked = Math.abs(t.x + t.w / 2 - (c.x + c.w / 2)) < (c.w + t.w) * 0.3;
    if (c === t || stacked) { // gleicher Knoten oder übereinander: außen rechts vorbeiführen
      x1 = c.x + c.w; x2 = t.x + t.w; const off = Math.max(x1, x2) + Math.max(40, Math.min(160, Math.abs(y2 - y1) * 0.35)); c1 = off; c2 = off;
    } else {
      const right = t.x + t.w / 2 > c.x + c.w / 2; x1 = right ? c.x + c.w : c.x; x2 = right ? t.x : t.x + t.w;
      const dir = x2 > x1 ? 1 : -1, off = Math.max(50, Math.abs(x2 - x1) * 0.4); c1 = x1 + off * dir; c2 = x2 - off * dir;
    }
    const path = () => { o.beginPath(); o.moveTo(x1, y1); o.bezierCurveTo(c1, y1, c2, y2, x2, y2); };
    o.save(); o.lineCap = "round"; o.strokeStyle = C.fg;
    o.globalAlpha = 0.22 * al; o.lineWidth = 11 * px; o.setLineDash([]); path(); o.stroke();
    o.globalAlpha = al; o.lineWidth = 2.8 * px; o.setLineDash([10 * px, 7 * px]); o.lineDashOffset = -(now / 22) * px; path(); o.stroke();
    o.setLineDash([]); o.lineDashOffset = 0; o.fillStyle = C.fg;
    o.beginPath(); o.arc(x1, y1, 4.5 * px, 0, 7); o.fill();
    const ang = x2 >= c2 ? 0 : Math.PI, s = 11 * px;   // die Kurve läuft waagerecht ins Ziel
    o.beginPath(); o.moveTo(x2, y2); o.lineTo(x2 - s * Math.cos(ang - 0.45), y2 - s * Math.sin(ang - 0.45)); o.lineTo(x2 - s * Math.cos(ang + 0.45), y2 - s * Math.sin(ang + 0.45)); o.closePath(); o.fill();
    if (lvl >= 2) { o.globalAlpha = 0.16 * al; const hl = (cc, y) => o.fillRect(cc.x + 1, y - ROW / 2, cc.w - 2, ROW); if (PIN.ai >= 0) hl(c, y1); if (PIN.bi >= 0) hl(t, y2); }
    o.restore(); o.globalAlpha = 1;
    return true;
  }
  function animateTo(cx, cy, k) {
    const ca = { x: (W / 2 - V.x) / V.k, y: (H / 2 - V.y) / V.k };
    anim = { a: { k: V.k }, b: { k: clamp(k, KMIN, KMAX) }, ca, cb: { x: cx, y: cy }, t0: performance.now(), dur: 420 };
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) anim.dur = 1;
    req();
  }
  function resize() {
    const r = canvas.parentElement.getBoundingClientRect(); dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    canvas.width = W * dpr; canvas.height = H * dpr; canvas.style.width = W + "px"; canvas.style.height = H + "px";
    if (ovc) { ovc.width = W * dpr; ovc.height = H * dpr; ovc.style.width = W + "px"; ovc.style.height = H + "px"; }
    const mr = mini.getBoundingClientRect(); mini.width = mr.width * dpr; mini.height = mr.height * dpr;
    miniDirty = true; snapV = null; req();
  }
  function buildEdgeGrid() {
    const bb = M.bb, cs = Math.max(bb.w, bb.h, 1) / 64, cols = Math.ceil(bb.w / cs) + 1, rows = Math.ceil(bb.h / cs) + 1;
    const E = M.edges, n = E.length, bx = new Float32Array(n * 4), cells = new Map(), long = [], P = 70;
    for (let id = 0; id < n; id++) {
      const e = E[id], a = M.classes[e.from], b = M.classes[e.to];
      const x0 = Math.min(a.x, b.x) - P, y0 = Math.min(a.y, b.y) - P, x1 = Math.max(a.x + a.w, b.x + b.w) + P, y1 = Math.max(a.y + a.h, b.y + b.h) + P;
      const j = id * 4; bx[j] = x0; bx[j + 1] = y0; bx[j + 2] = x1; bx[j + 3] = y1;
      const c0 = clamp(Math.floor((x0 - bb.x) / cs), 0, cols - 1), c1 = clamp(Math.floor((x1 - bb.x) / cs), 0, cols - 1);
      const r0 = clamp(Math.floor((y0 - bb.y) / cs), 0, rows - 1), r1 = clamp(Math.floor((y1 - bb.y) / cs), 0, rows - 1);
      if ((c1 - c0 + 1) * (r1 - r0 + 1) > 36) { long.push(id); continue; }
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) { const key = r * cols + c; let arr = cells.get(key); if (!arr) cells.set(key, (arr = [])); arr.push(id); }
    }
    IDX = { cs, cols, rows, ox: bb.x, oy: bb.y, cells, long, bx, longSet: new Set(long) };
    if (!stamp || stamp.length < n) stamp = new Uint32Array(n);
    idxDirty = false;
  }
  // nach Verschieben: nur die Kanten der bewegten Knoten neu einordnen (statt alle neu zu indizieren)
  function reindexNodes(nodeIds) {
    const I = IDX, P = 70; if (!I) return;
    for (const nid of nodeIds) for (const id of M.adj[nid]) {
      const e = M.edges[id], a = M.classes[e.from], b = M.classes[e.to], j = id * 4;
      I.bx[j] = Math.min(a.x, b.x) - P; I.bx[j + 1] = Math.min(a.y, b.y) - P; I.bx[j + 2] = Math.max(a.x + a.w, b.x + b.w) + P; I.bx[j + 3] = Math.max(a.y + a.h, b.y + b.h) + P;
      if (!I.longSet.has(id)) { I.longSet.add(id); I.long.push(id); }
    }
    if (I.long.length > 30000) { clearTimeout(I.rt); I.rt = setTimeout(() => { buildEdgeGrid(); req(); }, 1500); }
  }
  function visibleEdges(vb) {
    const I = IDX, out = [], b = I.bx, n = M.edges.length;
    const hit = (id) => { const j = id * 4; return b[j + 2] >= vb.x0 && b[j] <= vb.x1 && b[j + 3] >= vb.y0 && b[j + 1] <= vb.y1; };
    const c0 = clamp(Math.floor((vb.x0 - I.ox) / I.cs), 0, I.cols - 1), c1 = clamp(Math.floor((vb.x1 - I.ox) / I.cs), 0, I.cols - 1);
    const r0 = clamp(Math.floor((vb.y0 - I.oy) / I.cs), 0, I.rows - 1), r1 = clamp(Math.floor((vb.y1 - I.oy) / I.cs), 0, I.rows - 1);
    if ((c1 - c0 + 1) * (r1 - r0 + 1) > I.cols * I.rows * 0.4) { for (let id = 0; id < n; id++) if (hit(id)) out.push(id); return out; }
    if (++fno >= 0xfffffff0) { stamp.fill(0); fno = 1; }
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      const arr = I.cells.get(r * I.cols + c); if (!arr) continue;
      for (let i = 0; i < arr.length; i++) { const id = arr[i]; if (stamp[id] !== fno) { stamp[id] = fno; if (hit(id)) out.push(id); } }
    }
    for (const id of I.long) if (stamp[id] !== fno && hit(id)) { stamp[id] = fno; out.push(id); }
    return out;
  }
  const rowY = (t, kind, i) => (kind === "m" && i >= 0 && i < MAXR ? methY(t, i) : kind === "f" && i >= 0 && i < MAXR ? fieldY(t, i) : t.y + HEAD / 2);
  function memberLinks(c, m) {
    const out = [];
    if (m.t === "m") {
      const meth = c.methods[m.i]; if (!meth) return out;
      for (const l of meth.links || []) out.push({ id: l.id, t: l.t, i: l.i, col: l.kind === "call" || l.kind === "ref" ? C.az : l.kind === "write" ? C.amber : l.kind === "read" ? C.ay : C.fg2, dash: l.kind === "ref" || l.kind === "read", out: true });
      for (const l of meth.callers || []) out.push({ id: l.id, t: "m", i: l.i, col: C.violet, dash: false, out: false });
      for (const id of meth.useIds || []) if (!out.some((o) => o.id === id)) out.push({ id, t: "c", i: -1, col: C.fg3, dash: true, out: true });
    } else {
      const f = c.fields[m.i]; if (!f) return out;
      for (const u of f.users || []) out.push({ id: u.id, t: "m", i: u.i, col: u.w ? C.amber : C.ay, dash: !u.w, out: false });
      for (const id of f.refs || []) if (id !== c.id) out.push({ id, t: "c", i: -1, col: C.violet, dash: true, out: true });
    }
    return out;
  }
  function computeHL() {
    const had = !!hl;
    hl = null; hlE = null; hlG = null; snapV = null;
    if (!M) return;
    if (pat && M.patClasses[pat]) {
      hl = new Set(M.patClasses[pat]); hlE = new Set();
      for (const id of hl) for (const ei of M.adj[id]) { const e = M.edges[ei]; if (hl.has(e.from) && hl.has(e.to) && types[e.type]) hlE.add(ei); }
    }
    if (sel) {
      hl = hl || new Set(); hlE = hlE || new Set(); hl.add(sel.id);
      for (const ei of M.adj[sel.id]) { const e = M.edges[ei]; if (types[e.type]) { hlE.add(ei); hl.add(e.from); hl.add(e.to); } }
      const c = M.classes[sel.id];
      if (sel.m) for (const l of memberLinks(c, sel.m)) hl.add(l.id);
    }
    if (!hl && VB && VB.only) {   // „Nur Änderungen“: alles Unveränderte abblenden
      hl = new Set(VB.nodes.keys()); hlE = new Set(VB.edges.keys());
      for (const ei of hlE) { const e = M.edges[ei]; hl.add(e.from); hl.add(e.to); }
      for (const l of VB.links) { hl.add(l.from.id); hl.add(l.to.id); }
      if (!hl.size) { hl = null; hlE = null; }
    }
    if (hl) { hlG = new Set(); for (const id of hl) hlG.add(M.classes[id].g); }
    if (had || hl) miniDirty = true;
  }
  const toW = (sx, sy) => ({ x: (sx - V.x) / V.k, y: (sy - V.y) / V.k });

  /* ---------- Zeichnen ---------- */
  function rr(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function draw() {
    const k = V.k, lvl = lodOf(k);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.globalAlpha = 1; ctx.setLineDash([]);
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
    // Punktraster
    const sp = 50 * Math.pow(2, Math.ceil(Math.log2(26 / (50 * k)))), sps = sp * k;
    ctx.fillStyle = rgba(C.fg3, 0.28);
    const ox = ((V.x % sps) + sps) % sps, oy = ((V.y % sps) + sps) % sps;
    ctx.beginPath(); for (let x = ox; x < W; x += sps) for (let y = oy; y < H; y += sps) ctx.rect(x, y, 1.2, 1.2); ctx.fill();
    if (!M) { drawMini(); return; }
    ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * V.x, dpr * V.y);
    const vb = { x0: -V.x / k, y0: -V.y / k, x1: (W - V.x) / k, y1: (H - V.y) / k };
    const mg = 24 / k; CL = { x0: vb.x0 - mg, y0: vb.y0 - mg, x1: vb.x1 + mg, y1: vb.y1 + mg, px: 70 / k };
    drawGroups(lvl, vb);
    drawEdges(lvl, vb);
    drawNodes(lvl, vb);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawChips(lvl);
    drawMini();
    cb.onZoom && cb.onZoom(k, lvl);
    if (lvl !== lastLvl) { lastLvl = lvl; cb.onLevel && cb.onLevel(lvl); }
  }
  const vis = (x, y, w, h, vb, pad = 0) => x + w + pad >= vb.x0 && x - pad <= vb.x1 && y + h + pad >= vb.y0 && y - pad <= vb.y1;
  function drawGroups(lvl, vb) {
    const k = V.k;
    for (const g of M.groups) {
      if (!vis(g.x, g.y, g.w, g.h, vb)) continue;
      const col = C.mod[g.color];
      const dim = hlG && !hlG.has(g);
      ctx.globalAlpha = dim ? 0.35 : 1;
      rr(g.x, g.y, g.w, g.h, 18);
      ctx.fillStyle = rgba(col, lvl === 0 ? 0.07 : 0.035); ctx.fill();
      ctx.lineWidth = (lvl === 0 ? 1.6 : 1.1) / k; ctx.strokeStyle = rgba(col, lvl === 0 ? 0.6 : 0.4); ctx.stroke();
      // Kopfband
      ctx.fillStyle = rgba(col, 0.08); ctx.fillRect(g.x + 1 / k, g.y + 1 / k, g.w - 2 / k, Math.min(GTOP - 18, g.h));
    }
    ctx.globalAlpha = 1;
  }
  function edgeGeom(e, lvl) {
    const a = M.classes[e.from], b = M.classes[e.to];
    const acx = a.x + a.w / 2, acy = a.y + a.h / 2, bcx = b.x + b.w / 2, bcy = b.y + b.h / 2;
    const xOv = a.x < b.x + b.w && b.x < a.x + a.w, yOv = a.y < b.y + b.h && b.y < a.y + a.h;
    const hier = e.type === "inherit" || e.type === "implement";
    let vert = hier ? !yOv : xOv && !yOv;
    const rowed = lvl >= 2 && ((e.fi != null && e.fi < MAXR) || (e.mi != null && e.mi < MAXR));
    if (!hier && rowed && !xOv) vert = false;
    let x1, y1, x2, y2, c1x, c1y, c2x, c2y;
    if (vert) {
      const down = bcy > acy;
      x1 = acx; y1 = down ? a.y + a.h : a.y; x2 = bcx; y2 = down ? b.y : b.y + b.h;
      const off = Math.max(40, Math.abs(y2 - y1) * 0.45) * (down ? 1 : -1);
      c1x = x1; c1y = y1 + off; c2x = x2; c2y = y2 - off;
    } else {
      const right = bcx > acx;
      x1 = right ? a.x + a.w : a.x; x2 = right ? b.x : b.x + b.w;
      y1 = lvl >= 2 && e.fi != null && e.fi < MAXR ? fieldY(a, e.fi) : lvl >= 2 && e.mi != null && e.mi < MAXR ? methY(a, e.mi) : clamp(bcy, a.y + 14, a.y + a.h - 14);
      y2 = lvl >= 2 ? (e.ti != null && e.ti < MAXR ? (e.tf ? fieldY(b, e.ti) : methY(b, e.ti)) : b.y + HEAD / 2) : clamp(acy, b.y + 14, b.y + b.h - 14);
      const off = Math.max(40, Math.abs(x2 - x1) * 0.45) * (right ? 1 : -1);
      c1x = x1 + off; c1y = y1; c2x = x2 - off; c2y = y2;
    }
    return { x1, y1, x2, y2, c1x, c1y, c2x, c2y };
  }
  function marker(x, y, ang, kind, col, s) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.setLineDash([]);
    ctx.beginPath();
    if (kind === "tri") { ctx.moveTo(0, 0); ctx.lineTo(-s * 1.3, -s * 0.75); ctx.lineTo(-s * 1.3, s * 0.75); ctx.closePath(); ctx.fillStyle = C.bg2; ctx.fill(); ctx.strokeStyle = col; ctx.stroke(); }
    else if (kind === "arrow") { ctx.moveTo(-s * 1.1, -s * 0.6); ctx.lineTo(0, 0); ctx.lineTo(-s * 1.1, s * 0.6); ctx.strokeStyle = col; ctx.stroke(); }
    else if (kind === "dia") { ctx.moveTo(0, 0); ctx.lineTo(-s, -s * 0.55); ctx.lineTo(-s * 2, 0); ctx.lineTo(-s, s * 0.55); ctx.closePath(); ctx.fillStyle = col; ctx.fill(); }
    ctx.restore();
  }
  function triP(x, y, a, s) { const c = Math.cos(a), n = Math.sin(a); ctx.moveTo(x, y); ctx.lineTo(x - s * 1.3 * c + s * 0.75 * n, y - s * 1.3 * n - s * 0.75 * c); ctx.lineTo(x - s * 1.3 * c - s * 0.75 * n, y - s * 1.3 * n + s * 0.75 * c); ctx.closePath(); }
  function arrP(x, y, a, s) { const c = Math.cos(a), n = Math.sin(a); ctx.moveTo(x - s * 1.1 * c + s * 0.6 * n, y - s * 1.1 * n - s * 0.6 * c); ctx.lineTo(x, y); ctx.lineTo(x - s * 1.1 * c - s * 0.6 * n, y - s * 1.1 * n + s * 0.6 * c); }
  function diaP(x, y, a, s) { const c = Math.cos(a), n = Math.sin(a); ctx.moveTo(x, y); ctx.lineTo(x - s * c + s * 0.55 * n, y - s * n - s * 0.55 * c); ctx.lineTo(x - 2 * s * c, y - 2 * s * n); ctx.lineTo(x - s * c - s * 0.55 * n, y - s * n + s * 0.55 * c); ctx.closePath(); }
  /* Kurve auf den sichtbaren Rahmen zuschneiden (de Casteljau). Weit herausragende Kanten kosten sonst beim Rastern und
     vor allem beim Stricheln die volle Länge – beim Reinzoomen in großen Projekten zehntausende Pixel pro Kante. */
  function clipBez(x1, y1, c1x, c1y, c2x, c2y, x2, y2, out, d) {
    const nx = Math.min(x1, c1x, c2x, x2), xx = Math.max(x1, c1x, c2x, x2), ny = Math.min(y1, c1y, c2y, y2), xy = Math.max(y1, c1y, c2y, y2);
    if (xx < CL.x0 || nx > CL.x1 || xy < CL.y0 || ny > CL.y1) return;
    if (d >= 11 || (nx >= CL.x0 && xx <= CL.x1 && ny >= CL.y0 && xy <= CL.y1) || (xx - nx < CL.px && xy - ny < CL.px)) { out.push(x1, y1, c1x, c1y, c2x, c2y, x2, y2); return; }
    const ax = (x1 + c1x) / 2, ay = (y1 + c1y) / 2, bx = (c1x + c2x) / 2, by = (c1y + c2y) / 2, cx = (c2x + x2) / 2, cy = (c2y + y2) / 2;
    const dx = (ax + bx) / 2, dy = (ay + by) / 2, ex = (bx + cx) / 2, ey = (by + cy) / 2, mx = (dx + ex) / 2, my = (dy + ey) / 2;
    clipBez(x1, y1, ax, ay, dx, dy, mx, my, out, d + 1);
    clipBez(mx, my, ex, ey, cx, cy, x2, y2, out, d + 1);
  }
  function pieces(g) { if (!g.p) { g.p = []; clipBez(g.x1, g.y1, g.c1x, g.c1y, g.c2x, g.c2y, g.x2, g.y2, g.p, 0); } return g.p; }
  function tracePieces(p) {   // zusammenhängende Stücke ohne neues moveTo, damit Strichelung durchläuft
    let lx = NaN, ly = NaN;
    for (let i = 0; i < p.length; i += 8) {
      if (p[i] !== lx || p[i + 1] !== ly) ctx.moveTo(p[i], p[i + 1]);
      ctx.bezierCurveTo(p[i + 2], p[i + 3], p[i + 4], p[i + 5], p[i + 6], p[i + 7]); lx = p[i + 6]; ly = p[i + 7];
    }
  }
  const DASH_MAX = 90000, LEN_IDLE = 700000, LEN_MOVE = 260000;   // Pixel gestrichelt pro Stil · Kantenlänge gesamt im Stand / beim Navigieren   // Bildschirmpixel gestrichelter Kurven pro Stil, darüber durchgezogen
  const inCL = (x, y) => x >= CL.x0 && x <= CL.x1 && y >= CL.y0 && y <= CL.y1;
  function bez(g, t) { const u = 1 - t; return { x: u * u * u * g.x1 + 3 * u * u * t * g.c1x + 3 * u * t * t * g.c2x + t * t * t * g.x2, y: u * u * u * g.y1 + 3 * u * u * t * g.c1y + 3 * u * t * t * g.c2y + t * t * t * g.y2 }; }
  const EB = { inherit: 0, implement: 1, comp: 2, assoc: 3, call: 4, data: 5, imp: 6, dep: 7 };
  function drawGEdges(vb) {
    const k = V.k, list = M.gedgesSorted, lim = Math.max(500, budget >> 1);
    const batches = new Map(); let shown = 0, total = 0;
    for (const ge of list) {
      let n = 0; for (const t in ge.types) if (types[t]) n += ge.types[t];
      if (!n) continue;
      const a = ge.a, b = ge.b;
      if (Math.max(a.x + a.w, b.x + b.w) < vb.x0 || Math.min(a.x, b.x) > vb.x1 || Math.max(a.y + a.h, b.y + b.h) < vb.y0 || Math.min(a.y, b.y) > vb.y1) continue;
      total++;
      const on = !!(hlG && hlG.has(a) && hlG.has(b));
      if (shown >= lim && !on) continue;
      shown++;
      const wq = Math.min(6, Math.round(Math.log2(1 + n))), key = (on ? "h" : "n") + wq;
      let B = batches.get(key); if (!B) batches.set(key, (B = { on, wq, list: [] })); B.list.push(ge);
    }
    const arrows = shown < 4000;
    for (const B of batches.values()) {
      ctx.globalAlpha = hlG ? (B.on ? 0.85 : 0.08) : 0.42; ctx.strokeStyle = B.on ? C.accent : C.fg3;
      ctx.lineWidth = (0.8 + B.wq * 0.9) / k; ctx.beginPath();
      for (const ge of B.list) {
        const a = ge.a, b = ge.b, ax = a.x + a.w / 2, ay = a.y + a.h / 2, bx = b.x + b.w / 2, by = b.y + b.h / 2;
        ctx.moveTo(ax, ay); ctx.quadraticCurveTo((ax + bx) / 2 + (by - ay) * 0.12, (ay + by) / 2 - (bx - ax) * 0.12, bx, by);
      }
      ctx.stroke();
      if (arrows) {
        ctx.lineWidth = 1.4 / k; ctx.beginPath();
        for (const ge of B.list) {
          const a = ge.a, b = ge.b, ax = a.x + a.w / 2, ay = a.y + a.h / 2, bx = b.x + b.w / 2, by = b.y + b.h / 2;
          const mx = (ax + bx) / 2 + (by - ay) * 0.12, my = (ay + by) / 2 - (bx - ax) * 0.12, ang = Math.atan2(by - my, bx - mx), r = Math.min(b.w, b.h) * 0.25;
          arrP(bx - Math.cos(ang) * r, by - Math.sin(ang) * r, ang, 7 / k);
        }
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    return { shown, total };
  }
  function drawEdges(lvl, vb) {
    const k = V.k;
    let gs = null;
    const vbE = VB && (VB.edges.size || VB.ghostEdges.length);
    if (lvl === 0) { gs = drawGEdges(vb); if (!sel && !vbE) { statTxt = gs.total > 300 ? `Modul-Kanten ${de(gs.shown)} / ${de(gs.total)} im Bild` : ""; return; } }
    // Kandidaten: räumlicher Index (Stufe ≥ 1) bzw. nur Auswahl (Stufe 0); neue / geänderte Verbindungen immer
    let ids = lvl === 0 ? (hlE ? [...hlE] : []) : visibleEdges(vb);
    if (VB && VB.edges.size) { const s = new Set(ids); for (const ei of VB.edges.keys()) if (!s.has(ei)) ids.push(ei); }
    if (dragging && gst && gst.n) { const s = new Set(ids); for (const ei of M.adj[gst.n.id]) if (!s.has(ei)) ids.push(ei); }
    const buckets = [[], [], [], [], [], [], [], []], hot = [], GE = new Map();
    let total = 0;
    for (let i = 0; i < ids.length; i++) {
      const e = M.edges[ids[i]]; if (!types[e.type]) continue;
      const inHL = hlE && hlE.has(e.id), isChg = VB && VB.edges.has(e.id);
      if (hl && !inHL && !isChg && lvl >= 2) continue;
      const g = edgeGeom(e, lvl), p = pieces(g); if (!p.length) continue;   // Rahmen schneidet nur die Hülle, nicht die Kurve
      let L = 0; for (let j = 0; j < p.length; j += 8) L += Math.abs(p[j + 6] - p[j]) + Math.abs(p[j + 7] - p[j + 1]);
      g.L = L * k * 0.85; GE.set(e, g); total++;
      if (inHL || isChg) hot.push(e); else buckets[EB[e.type]].push(e);
    }
    // Budget: Hervorgehobene immer, dann Vererbung → Implementierung → Komposition → Assoziation → Aufrufe → Variablen → Includes → Typ-Abh.
    const lim = moving ? Math.min(budget, gpuMs > 24 ? 1200 : 2500) : budget;   // während der Navigation weniger Kanten (gleiche Rangfolge), danach alle
    const chosen = hot.slice(); let rem = Math.max(0, lim - chosen.length);
    // Längenbudget in Bildschirmpixeln: ein Haarknäuel aus tausenden bildschirmlangen Kurven kostet viel und zeigt nichts
    let len = budget >= 1e9 ? Infinity : (moving ? LEN_MOVE : LEN_IDLE) * clamp(budget / 8000, 0.35, 8);   // Budget-Schalter rechts skaliert mit, „alle“ = ohne Grenze
    for (const e of hot) len -= GE.get(e).L;
    for (const b of buckets) {
      if (!rem || len <= 0) break;
      let bl = 0; for (const e of b) bl += GE.get(e).L;
      if (b.length <= rem && bl <= len) { for (let i = 0; i < b.length; i++) chosen.push(b[i]); rem -= b.length; len -= bl; continue; }
      const sorted = b.slice().sort((x, y) => GE.get(x).L - GE.get(y).L);   // kurze, lesbare Verbindungen zuerst
      for (const e of sorted) { const L = GE.get(e).L; if (!rem || L > len) break; chosen.push(e); rem--; len -= L; }
      break;   // Stil passte nicht ganz → niedrigere Stile bleiben weg
    }
    statTxt = (gs ? `Modul-Kanten ${de(gs.shown)} / ${de(gs.total)}  ·  ` : "") + `Kanten ${de(chosen.length)} / ${de(total)} im Bild` + (chosen.length < total ? (moving ? "  (beim Navigieren reduziert)" : `  (lange/überzählige ausgeblendet · Budget ${budget >= 1e9 ? "∞" : de(budget)})`) : "");
    if (total < 1500 && !gs && chosen.length >= total) statTxt = "";
    // Stapeln nach Stil → ein Pfad pro Stil statt ein Pfad pro Kante
    const batches = new Map();
    for (const e of chosen) { const inHL = !!(hlE && hlE.has(e.id)); const key = e.type + (inHL ? "+" : ""); let B = batches.get(key); if (!B) batches.set(key, (B = { type: e.type, inHL, list: [] })); B.list.push(e); }
    const markers = chosen.length <= (moving ? 1500 : 6000), s = clamp(8 / k, 5, 80), labelsTodo = [];
    for (const B of batches.values()) {
      const T = EDGE_T[B.type], col = C[T.tok];
      let al = B.type === "dep" ? (lvl === 1 ? 0.35 : 0.5) : 0.85;
      if (hl) al = B.inHL ? 1 : 0.06;
      if (chosen.length > 15000 && !B.inHL) al *= 0.6;
      ctx.globalAlpha = al; ctx.strokeStyle = col;
      ctx.lineWidth = (B.inHL ? 2.2 : B.type === "dep" ? 1 : 1.4) / k;
      // Strichelung ist teuer (wird pro Pixel Kurvenlänge berechnet): während der Navigation bei vielen Kanten durchgezogen und blasser
      // … und auch im Stand, wenn die sichtbare Gesamtlänge der gestrichelten Kurven sehr groß ist (dann ist es ohnehin nur noch eine Fläche)
      let plain = false;
      if (T.dash) {
        if (moving && B.list.length > 250) plain = true;
        else { let L = 0; for (const e of B.list) { const p = GE.get(e).p; for (let i = 0; i < p.length; i += 8) L += Math.abs(p[i + 6] - p[i]) + Math.abs(p[i + 7] - p[i + 1]); } plain = L * k > DASH_MAX; }
      }
      if (plain) ctx.globalAlpha = al * 0.55;
      ctx.setLineDash(T.dash && !plain ? T.dash.map((d) => d / k) : []);
      const G = new Array(B.list.length);
      ctx.beginPath();
      for (let i = 0; i < B.list.length; i++) { const g = (G[i] = GE.get(B.list[i])); tracePieces(g.p); }
      ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = al;
      if (markers || B.inHL) {
        ctx.lineWidth = (B.inHL ? 2 : 1.3) / k;
        const hier = B.type === "inherit" || B.type === "implement";
        ctx.beginPath();
        for (const g of G) { if (!inCL(g.x2, g.y2)) continue; const a = Math.atan2(g.y2 - g.c2y, g.x2 - g.c2x); if (hier) triP(g.x2, g.y2, a, s); else arrP(g.x2, g.y2, a, s); }
        if (hier) { ctx.fillStyle = C.bg2; ctx.fill(); }
        ctx.stroke();
        if (B.type === "comp") { ctx.beginPath(); for (const g of G) if (inCL(g.x1, g.y1)) diaP(g.x1, g.y1, Math.atan2(g.y1 - g.c1y, g.x1 - g.c1x), s * 0.9); ctx.fillStyle = col; ctx.fill(); }
      }
      if (lvl >= 2 && !moving && (!hl || B.inHL)) for (let i = 0; i < B.list.length && labelsTodo.length < 600; i++) { const e = B.list[i]; if (e.labels.length || e.mult === "*") labelsTodo.push({ e, g: G[i], col }); }
    }
    ctx.setLineDash([]); ctx.globalAlpha = 1;
    drawChangeEdges(lvl, vb, chosen);
    // Member-Kanten: Aufrufe, Aufrufer, Variablenzugriffe – zeilengenau
    if (sel && sel.m && lvl >= 2) {
      const c = M.classes[sel.id], m = sel.m;
      const y = m.t === "m" ? methY(c, Math.min(m.i, MAXR - 1)) : fieldY(c, Math.min(m.i, MAXR - 1));
      const sz = clamp(8 / k, 5, 40);
      for (const l of memberLinks(c, m)) {
        const t = M.classes[l.id]; if (!t) continue;
        const ty = rowY(t, l.t, l.i);
        ctx.strokeStyle = l.col; ctx.lineWidth = 1.8 / k; ctx.setLineDash(l.dash ? [5 / k, 4 / k] : []);
        ctx.beginPath();
        if (t.id === c.id) {
          const x = c.x + c.w, off = 26 + Math.abs(ty - y) * 0.3;
          const [y1, y2] = l.out ? [y, ty] : [ty, y];
          ctx.moveTo(x, y1); ctx.bezierCurveTo(x + off, y1, x + off, y2, x, y2); ctx.stroke();
          marker(x, y2, Math.PI, "arrow", l.col, sz);
          continue;
        }
        const right = t.x + t.w / 2 > c.x + c.w / 2;
        const px = right ? c.x + c.w : c.x, qx = right ? t.x : t.x + t.w;
        const [x1, y1, x2, y2] = l.out ? [px, y, qx, ty] : [qx, ty, px, y];
        const dir = x2 > x1 ? 1 : -1, off = Math.max(50, Math.abs(x2 - x1) * 0.4);
        ctx.moveTo(x1, y1); ctx.bezierCurveTo(x1 + off * dir, y1, x2 - off * dir, y2, x2, y2); ctx.stroke();
        marker(x2, y2, dir > 0 ? 0 : Math.PI, "arrow", l.col, sz);
      }
      ctx.setLineDash([]);
    }
    // Kantenlabels
    const fs = lvl >= 3 ? 9.5 : 10.5;
    ctx.font = `500 ${fs}px ${MONO}`; ctx.textBaseline = "middle";
    for (const { e, g, col } of labelsTodo) {
      const p = bez(g, 0.5); if (!inCL(p.x, p.y)) continue;
      const txt = short(e.labels.slice(0, 2).join(", ") + (e.labels.length > 2 ? " …" : "") + (e.mult === "*" ? "  [*]" : ""), 32);
      const w = txt.length * fs * 0.6 + 8;
      ctx.fillStyle = rgba(C.bg, 0.88); rr(p.x - w / 2, p.y - fs * 0.8, w, fs * 1.6, 3); ctx.fill();
      ctx.fillStyle = col; ctx.textAlign = "center"; ctx.fillText(txt, p.x, p.y + 0.5);
    }
    ctx.textAlign = "left";
  }
  function drawNodes(lvl, vb) {
    const k = V.k;
    if (lvl === 0) {
      const labels = [];
      for (const g of M.groups) {
        if (!vis(g.x, g.y, g.w, g.h, vb)) continue;
        const col = C.mod[g.color], gdim = hlG && !hlG.has(g);
        const full = rgba(col, 0.62), soft = rgba(col, 0.18);
        if (!hl || gdim) {
          // ein Pfad pro Modul statt tausender Einzelaufrufe
          ctx.globalAlpha = gdim ? 0.15 : 1;
          const px = 0.8 / k; let nSoft = 0;
          ctx.beginPath();
          for (const id of g.ids) { const c = M.classes[id]; if (c.kind === "interface") { nSoft++; continue; } if (vis(c.x, c.y, c.w, c.h, vb)) ctx.rect(c.x, c.y, Math.max(c.w, px), Math.max(c.h, px)); }
          ctx.fillStyle = full; ctx.fill();
          if (nSoft) { ctx.beginPath(); for (const id of g.ids) { const c = M.classes[id]; if (c.kind === "interface" && vis(c.x, c.y, c.w, c.h, vb)) ctx.rect(c.x, c.y, Math.max(c.w, px), Math.max(c.h, px)); } ctx.fillStyle = soft; ctx.fill(); }
        } else for (const id of g.ids) {
          const c = M.classes[id]; if (!vis(c.x, c.y, c.w, c.h, vb)) continue;
          ctx.globalAlpha = hl.has(c.id) ? 1 : 0.15; ctx.fillStyle = c.kind === "interface" ? soft : full; ctx.fillRect(c.x, c.y, c.w, c.h);
        }
        if (g.w * k < 6) continue;
        for (const id of g.ids) {
          const c = M.classes[id]; if (!vis(c.x, c.y, c.w, c.h, vb)) continue;
          ctx.globalAlpha = hl && !hl.has(c.id) ? 0.15 : 1;
          if ((c.kind === "interface" || c.kind === "abstract") && c.w * k > 8) { ctx.strokeStyle = col; ctx.lineWidth = 1.2 / k; ctx.setLineDash(c.kind === "interface" ? [4 / k, 3 / k] : []); ctx.strokeRect(c.x, c.y, c.w, c.h); ctx.setLineDash([]); }
          if (sel && sel.id === c.id) { ctx.strokeStyle = C.fg; ctx.lineWidth = 2.5 / k; ctx.strokeRect(c.x, c.y, c.w, c.h); }
          const dg0 = DG.get(c.id); if (dg0) { ctx.strokeStyle = dg0.e ? C.red : C.amber; ctx.lineWidth = 3 / k; ctx.strokeRect(c.x, c.y, c.w, c.h); }
          const v0 = VB && VB.nodes.get(c.id);
          if (v0) { const o = 2.5 / k; ctx.globalAlpha = 1; ctx.strokeStyle = v0.st === "new" ? C.ay : C.amber; ctx.lineWidth = 3 / k; ctx.strokeRect(c.x - o, c.y - o, c.w + 2 * o, c.h + 2 * o); ctx.globalAlpha = 0.28; ctx.lineWidth = 9 / k; ctx.strokeRect(c.x - o, c.y - o, c.w + 2 * o, c.h + 2 * o); }
          if (c.w * k > 46 && labels.length < 3000) labels.push(c);
        }
      }
      ctx.textBaseline = "top";
      for (const c of labels) {
        const col = C.mod[c.g.color], fs = 10 / k, mc = Math.floor((c.w - 6 / k) / (fs * 0.6));
        if (mc < 3) continue;
        ctx.globalAlpha = hl && !hl.has(c.id) ? 0.15 : 1;
        ctx.font = `600 ${fs}px ${MONO}`; ctx.fillStyle = c.kind === "interface" ? C.fg : headTxt(col); ctx.fillText(short(c.name, mc), c.x + 3 / k, c.y + 3 / k);
      }
      ctx.globalAlpha = 1; drawGhosts(0, vb); return;
    }
    for (const g of M.groups) {
      if (!vis(g.x, g.y, g.w, g.h, vb, 30)) continue;
      for (const id of g.ids) {
        const c = M.classes[id];
        if (!vis(c.x, c.y, c.w, c.h, vb, 30)) continue;
        const dim = hl && !hl.has(c.id);
        ctx.globalAlpha = dim ? (lvl === 1 ? 0.18 : 0.28) : 1;
        if (lvl === 1) drawNodeL1(c); else drawNodeL2(c, lvl);
      }
    }
    ctx.globalAlpha = 1;
    drawGhosts(lvl, vb);
  }
  function frame_(c, col) {
    const k = V.k, isSel = sel && sel.id === c.id, isHov = hover && hover.id === c.id;
    rr(c.x, c.y, c.w, c.h, 7);
    ctx.fillStyle = C.bg2; ctx.fill();
    ctx.setLineDash(c.kind === "interface" ? [6 / k, 4 / k] : []);
    ctx.lineWidth = (isSel ? 2.4 : isHov ? 1.6 : 1) / k;
    ctx.strokeStyle = isSel ? C.fg : isHov ? col : C.border; ctx.stroke(); ctx.setLineDash([]);
    const r = Math.min(7, c.w / 2, HEAD), x = c.x, y = c.y, w = c.w;
    ctx.beginPath(); ctx.moveTo(x, y + HEAD); ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r); ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r); ctx.lineTo(x + w, y + HEAD); ctx.closePath();
    ctx.fillStyle = c.kind === "interface" ? rgba(col, 0.28) : col; ctx.fill();
  }
  function badge(c) {
    const d = DG.get(c.id); if (!d) return;
    const k = V.k, r = clamp(9 / k, 8, 60), x = c.x + r * 0.4, y = c.y - r * 0.4;
    ctx.fillStyle = d.e ? C.red : C.amber; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
    ctx.lineWidth = 2 / k; ctx.strokeStyle = C.bg; ctx.stroke();
    ctx.fillStyle = C.light ? C.surface : C.bg; ctx.font = `700 ${r * 1.1}px ${MONO}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(String(d.e || d.w), x, y + r * 0.05); ctx.textAlign = "left";
  }
  function drawNodeL1(c) {
    const k = V.k, col = C.mod[c.g.color];
    frame_(c, col);
    // Mitglieder als Balken
    const nf = Math.min(c.fields.length, MAXR), nm = Math.min(c.methods.length, MAXR);
    if (ROW * k < 2.6) {
      ctx.fillStyle = rgba(C.fg3, 0.22); if (nf) ctx.fillRect(c.x + 12, c.y + HEAD + PADT, c.w - 24, nf * ROW - 4);
      ctx.fillStyle = rgba(C.accent2, 0.22); if (nm) ctx.fillRect(c.x + 12, c.y + HEAD + c.fH + PADT, c.w - 24, nm * ROW - 4);
    } else {
      const vn = VB && VB.nodes.get(c.id), cc = (st) => (st === "new" ? C.ay : C.amber);
      for (let i = 0; i < nf; i++) { const st = vn && vn.rows.get("f" + i); ctx.fillStyle = st ? cc(st) : rgba(C.fg3, 0.35); ctx.fillRect(c.x + 12, fieldY(c, i) - 2.5, Math.min(c.w - 24, fieldText(c.fields[i]).length * 5.2), 5); }
      for (let j = 0; j < nm; j++) { const st = vn && vn.rows.get("m" + j); ctx.fillStyle = st ? cc(st) : rgba(C.accent2, 0.35); ctx.fillRect(c.x + 12, methY(c, j) - 2.5, Math.min(c.w - 24, methText(c.methods[j]).length * 5.2), 5); }
    }
    ctx.fillStyle = C.border; ctx.fillRect(c.x, c.y + HEAD + c.fH - 0.5, c.w, 1 / k);
    // großer Name
    const fs = Math.min((c.w - 24) / (c.name.length * 0.62), 15 / k, Math.max(c.h * 0.32, 18));
    if (fs * k >= 4.5) {
      const cy = Math.min(c.y + c.h / 2 + HEAD / 2, c.y + HEAD + Math.max(fs, (c.h - HEAD) / 2));
      ctx.font = `${c.kind === "abstract" ? "italic " : ""}600 ${fs}px ${MONO}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.lineJoin = "round"; ctx.lineWidth = fs * 0.4; ctx.strokeStyle = C.bg2; ctx.strokeText(c.name, c.x + c.w / 2, cy);
      ctx.fillStyle = C.fg; ctx.fillText(c.name, c.x + c.w / 2, cy); ctx.textAlign = "left";
      if (c.kind !== "class") {
        const ss = Math.min(fs * 0.45, HEAD * 0.45);
        if (ss * k > 4) { ctx.font = `500 ${ss}px ${MONO}`; ctx.fillStyle = c.kind === "interface" ? C.fg : headTxt(col); ctx.textAlign = "center"; ctx.fillText("«" + (KIND_DE[c.kind] || c.kind) + "»", c.x + c.w / 2, c.y + HEAD / 2); ctx.textAlign = "left"; }
      }
    }
    if (c.pats.length) { const r = clamp(5 / k, 5, 26); ctx.fillStyle = C[PAT[c.pats[0].k].tok]; ctx.beginPath(); ctx.arc(c.x + c.w - r - 4, c.y - r - 4, r, 0, 7); ctx.fill(); }
    badge(c); chgMark(c);
  }
  function drawNodeL2(c, lvl) {
    const k = V.k, col = C.mod[c.g.color], full = lvl >= 3;
    frame_(c, col);
    const ht = c.kind === "interface" ? C.fg : headTxt(col);
    const dg = DG.get(c.id), vn = VB && VB.nodes.get(c.id);
    ctx.textBaseline = "middle"; ctx.textAlign = "center";
    const stereo = c.kind !== "class" ? "«" + (KIND_DE[c.kind] || c.kind) + (c.kind === "module" && c.files && c.files.length > 1 ? " · " + c.files.map((f) => "." + extOf(f)).join(" ") : "") + "»" : "";
    if (stereo) { ctx.font = `500 9px ${MONO}`; ctx.fillStyle = ht; ctx.globalAlpha *= 0.85; ctx.fillText(stereo, c.x + c.w / 2, c.y + 11); ctx.globalAlpha /= 0.85; }
    ctx.font = `${c.kind === "abstract" ? "italic " : ""}700 13px ${MONO}`; ctx.fillStyle = ht;
    ctx.fillText(short(c.name, Math.floor((c.w - 20) / 7.8)), c.x + c.w / 2, c.y + (stereo ? 26 : HEAD / 2));
    ctx.textAlign = "left";
    // Pattern-Pillen
    if (c.pats.length) {
      ctx.font = `600 9px ${MONO}`; let px = c.x + c.w;
      for (const p of [...new Map(c.pats.map((q) => [q.k, q])).values()].reverse()) {
        const t = PAT[p.k].label, w = t.length * 5.6 + 12; px -= w + 4;
        ctx.fillStyle = rgba(C[PAT[p.k].tok], 0.18); rr(px, c.y - 18, w, 14, 7); ctx.fill();
        ctx.strokeStyle = C[PAT[p.k].tok]; ctx.lineWidth = 1 / k; ctx.stroke();
        ctx.fillStyle = C[PAT[p.k].tok]; ctx.fillText(t, px + 6, c.y - 10.5);
      }
    }
    const fs = full ? 11 : 11.5, cw = fs * 0.6, maxC = Math.floor((c.w - 30 - (full ? 26 : 0)) / cw);
    const VC = { "+": C.accent, "-": C.red, "#": C.amber, "~": C.violet, I: C.accent2, O: C.amber, X: C.violet, T: C.fg3, G: C.ay, E: C.fg2 };
    const row = (y, vis_, name, rest, opt) => {
      if (opt.chg) { const cc = opt.chg === "new" ? C.ay : C.amber; ctx.fillStyle = rgba(cc, 0.14); ctx.fillRect(c.x + 1, y - ROW / 2, c.w - 2, ROW); ctx.fillStyle = cc; ctx.fillRect(c.x + 1, y - ROW / 2 + 1, 3.5, ROW - 2); }
      if (opt.diag) { ctx.fillStyle = rgba(opt.diag === "error" ? C.red : C.amber, 0.16); ctx.fillRect(c.x + 1, y - ROW / 2, c.w - 2, ROW); ctx.fillStyle = opt.diag === "error" ? C.red : C.amber; ctx.fillRect(c.x + c.w - 4, y - ROW / 2, 3, ROW); }
      if (opt.selected) { ctx.fillStyle = rgba(C.amber, 0.16); ctx.fillRect(c.x + 1, y - ROW / 2, c.w - 2, ROW); ctx.fillStyle = C.amber; ctx.fillRect(c.x + 1, y - ROW / 2, 2.5, ROW); }
      else if (opt.hover) { ctx.fillStyle = rgba(C.fg3, 0.12); ctx.fillRect(c.x + 1, y - ROW / 2, c.w - 2, ROW); }
      ctx.font = `600 ${fs}px ${MONO}`; ctx.fillStyle = VC[vis_] || C.fg3; ctx.fillText(vis_, c.x + 9, y);
      let n = short(name, maxC), r = n.length < maxC ? short(rest, maxC - n.length) : "";
      ctx.font = `${opt.italic ? "italic " : ""}${opt.ctor ? 600 : 400} ${fs}px ${MONO}`;
      ctx.fillStyle = opt.ctor ? C.accent2 : opt.isConst ? C.violet : opt.decl ? C.fg3 : C.fg; ctx.fillText(n, c.x + 22, y);
      if (opt.static) { ctx.fillRect(c.x + 22, y + fs * 0.55, n.length * cw, 1 / k > 1 ? 1 / k : 1); }
      if (r) { ctx.font = `400 ${fs}px ${MONO}`; ctx.fillStyle = opt.refs ? C.accent : C.fg3; ctx.fillText(r, c.x + 22 + n.length * cw, y); }
      if (full && opt.line) { ctx.font = `400 8.5px ${MONO}`; ctx.fillStyle = C.fg3; ctx.textAlign = "right"; ctx.fillText(String(opt.line), c.x + c.w - 6, y); ctx.textAlign = "left"; }
      if (opt.port) { ctx.fillStyle = opt.port.col; ctx.beginPath(); ctx.arc(opt.port.left ? c.x : c.x + c.w, y, 3, 0, 7); ctx.fill(); }
    };
    const portOf = new Map();
    for (const ei of M.adj[c.id]) { const e = M.edges[ei]; if (e.from !== c.id || e.fi == null || !types[e.type]) continue; const t = M.classes[e.to]; portOf.set(e.fi, { col: C[EDGE_T[e.type].tok], left: t.x + t.w / 2 < c.x + c.w / 2 }); }
    const nf = Math.min(c.fields.length, MAXR);
    for (let i = 0; i < nf; i++) {
      const f = c.fields[i], y = fieldY(c, i);
      const nw = f.users ? f.users.filter((u) => u.w).length : 0, nr = f.users ? f.users.length - nw : 0;
      const rest = (f.type ? ": " + f.type : "") + ((full || f.macro) && f.init ? " = " + f.init : "") + (full && f.users && f.users.length ? `   R${nr} W${nw}` : "");
      row(y, f.vis, f.name, rest, { static: f.static, isConst: f.isConst, line: f.line, refs: f.refs && f.refs.length, port: portOf.get(i), diag: dg && dg.rows.get("f" + i), chg: vn && vn.rows.get("f" + i),
        selected: sel && sel.id === c.id && sel.m && sel.m.t === "f" && sel.m.i === i, hover: hover && hover.id === c.id && hover.m && hover.m.t === "f" && hover.m.i === i });
    }
    if (c.fields.length > MAXR) { ctx.font = `400 10px ${MONO}`; ctx.fillStyle = C.fg3; ctx.fillText(`… +${c.fields.length - MAXR} weitere Felder`, c.x + 22, fieldY(c, MAXR)); }
    ctx.fillStyle = C.border; ctx.fillRect(c.x, c.y + HEAD + c.fH - 0.5, c.w, 1);
    const nm = Math.min(c.methods.length, MAXR);
    for (let j = 0; j < nm; j++) {
      const m = c.methods[j], y = methY(c, j);
      const ps = full ? m.params.map((p) => p.name + (p.type ? ": " + p.type : "")).join(", ") : m.params.length ? "…" : "";
      row(y, m.vis, m.name, `(${ps})${m.ret ? ": " + m.ret : ""}${full && m.callers && m.callers.length ? "   ←" + m.callers.length : ""}`, { static: m.static, italic: m.abstract, ctor: m.ctor, decl: m.decl, line: m.line, refs: m.useIds && m.useIds.length && full, diag: dg && dg.rows.get("m" + j), chg: vn && vn.rows.get("m" + j),
        selected: sel && sel.id === c.id && sel.m && sel.m.t === "m" && sel.m.i === j, hover: hover && hover.id === c.id && hover.m && hover.m.t === "m" && hover.m.i === j });
    }
    if (c.methods.length > MAXR) { ctx.font = `400 10px ${MONO}`; ctx.fillStyle = C.fg3; ctx.fillText(`… +${c.methods.length - MAXR} weitere Methoden`, c.x + 22, methY(c, MAXR)); }
    if (full) { ctx.font = `400 9px ${MONO}`; ctx.fillStyle = C.fg3; ctx.fillText(short(`${c.rel}:${c.line}`, Math.floor(c.w / 5.4)), c.x + 2, c.y + c.h + 11); }
    badge(c); chgMark(c);
  }
  function drawChips(lvl) {
    chips = [];
    const k = V.k;
    ctx.textBaseline = "middle";
    for (const g of M.groups) {
      const sx = g.x * k + V.x, sy = g.y * k + V.y, sw = g.w * k, sh = g.h * k;
      if (sx > W || sy > H || sx + sw < 0 || sy + sh < 0 || sw < 34) continue;
      const col = C.mod[g.color];
      const fsz = lvl === 0 ? 11 : 12;
      ctx.font = `600 ${fsz}px ${MONO}`;
      const cnt = ` · ${g.ids.length}`;
      const maxC = Math.floor((sw - 24) / (fsz * 0.6));
      if (maxC < 3) continue;
      const full = g.label + cnt, lab = full.length > maxC ? "…" + full.slice(full.length - maxC + 1) : full;
      const w = lab.length * fsz * 0.6 + 16, h = fsz + 10;
      const x = clamp(sx + 8, 6, Math.max(6, sx + sw - w - 8));
      const y = clamp(sy - h - 6, 28, Math.max(28, sy + sh - h - 8));
      const dim = hl && !g.ids.some((id) => hl.has(id));
      ctx.globalAlpha = dim ? 0.4 : 1;
      ctx.fillStyle = rgba(C.bg2, 0.92); rr(x, y, w, h, 5); ctx.fill(); ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = col; ctx.fillText(lab, x + 8, y + h / 2 + 0.5);
      chips.push({ g, x, y, w, h });
    }
    ctx.globalAlpha = 1;
  }
  function drawMini() {
    const mw = mini.width / dpr, mh = mini.height / dpr;
    mctx.setTransform(1, 0, 0, 1, 0, 0); mctx.clearRect(0, 0, mini.width, mini.height);
    if (!M) return;
    const bb = M.bb, s = Math.min((mw - 12) / bb.w, (mh - 12) / bb.h), ox = (mw - bb.w * s) / 2 - bb.x * s, oy = (mh - bb.h * s) / 2 - bb.y * s;
    mini._t = { s, ox, oy };
    if (miniDirty || miniC.width !== mini.width || miniC.height !== mini.height) {
      miniC.width = mini.width; miniC.height = mini.height;
      miniX.setTransform(dpr, 0, 0, dpr, 0, 0); miniX.clearRect(0, 0, mw, mh);
      for (const g of M.groups) {
        miniX.fillStyle = rgba(C.mod[g.color], 0.22); miniX.fillRect(g.x * s + ox, g.y * s + oy, g.w * s, g.h * s);
        miniX.strokeStyle = rgba(C.mod[g.color], 0.6); miniX.lineWidth = 0.8; miniX.strokeRect(g.x * s + ox, g.y * s + oy, g.w * s, g.h * s);
      }
      const rect = (c) => miniX.rect(c.x * s + ox, c.y * s + oy, Math.max(1, c.w * s), Math.max(1, c.h * s));
      for (const g of M.groups) {
        miniX.beginPath(); for (const id of g.ids) if (!hl || !hl.has(id)) rect(M.classes[id]);
        miniX.fillStyle = hl ? rgba(C.fg3, 0.35) : rgba(C.mod[g.color], 0.75); miniX.fill();
      }
      if (hl) { miniX.beginPath(); for (const id of hl) rect(M.classes[id]); miniX.fillStyle = C.accent; miniX.fill(); }
      if (VB) {   // Änderungen auch in der Übersichtskarte
        for (const [id, v] of VB.nodes) { const c = M.classes[id]; miniX.fillStyle = v.st === "new" ? C.ay : C.amber; miniX.fillRect(c.x * s + ox - 0.5, c.y * s + oy - 0.5, Math.max(2.5, c.w * s + 1), Math.max(2.5, c.h * s + 1)); }
        miniX.fillStyle = C.red; for (const g of VB.ghosts) miniX.fillRect(g.x * s + ox, g.y * s + oy, Math.max(2.5, g.w * s), Math.max(2.5, g.h * s));
      }
      miniDirty = false;
    }
    mctx.drawImage(miniC, 0, 0);
    mctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const vx = -V.x / V.k, vy = -V.y / V.k;
    mctx.strokeStyle = C.fg; mctx.lineWidth = 1.2;
    mctx.strokeRect(vx * s + ox, vy * s + oy, (W / V.k) * s, (H / V.k) * s);
    mctx.fillStyle = rgba(C.fg, 0.06); mctx.fillRect(vx * s + ox, vy * s + oy, (W / V.k) * s, (H / V.k) * s);
    if (AG) for (const f of AG.foci) {   // wo die KI gerade arbeitet
      if (f.t1 || f.kind === "changed") continue;
      for (const t of f.targets) { const c = M.classes[t.id]; if (!c) continue; mctx.fillStyle = C.fg; mctx.beginPath(); mctx.arc((c.x + c.w / 2) * s + ox, (c.y + c.h / 2) * s + oy, 3.4, 0, 7); mctx.fill(); mctx.strokeStyle = C.bg; mctx.lineWidth = 1; mctx.stroke(); }
    }
  }

  /* ---------- Hit-Tests ---------- */
  function nodeAt(wx, wy) {
    if (!M) return null;
    for (let gi = M.groups.length - 1; gi >= 0; gi--) {
      const g = M.groups[gi]; if (wx < g.x || wx > g.x + g.w || wy < g.y || wy > g.y + g.h) continue;
      for (let i = g.ids.length - 1; i >= 0; i--) { const c = M.classes[g.ids[i]]; if (wx >= c.x && wx <= c.x + c.w && wy >= c.y && wy <= c.y + c.h) return c; }
    }
    return null;
  }
  function memberAt(c, wy) {
    const ry = wy - c.y; if (ry < HEAD) return null;
    if (ry < HEAD + c.fH) { const i = Math.floor((ry - HEAD - PADT) / ROW); return i >= 0 && i < Math.min(c.fields.length, MAXR) ? { t: "f", i } : null; }
    const j = Math.floor((ry - HEAD - c.fH - PADT) / ROW); return j >= 0 && j < Math.min(c.methods.length, MAXR) ? { t: "m", i: j } : null;
  }
  const groupAt = (wx, wy) => M && M.groups.find((g) => wx >= g.x && wx <= g.x + g.w && wy >= g.y && wy <= g.y + g.h);
  const chipAt = (sx, sy) => chips.find((c) => sx >= c.x && sx <= c.x + c.w && sy >= c.y && sy <= c.y + c.h);

  /* ---------- Interaktion ---------- */
  const pts = new Map(); let gst = null, lastTap = { t: 0, id: -2 };
  const rel = (e) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  function onDown(e) {
    if (!M) return;
    lastUser = performance.now();
    canvas.setPointerCapture(e.pointerId);
    const p = rel(e); pts.set(e.pointerId, p); anim = null;
    if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      gst = { type: "pinch", d0: Math.hypot(a.x - b.x, a.y - b.y), k0: V.k, w: toW((a.x + b.x) / 2, (a.y + b.y) / 2), moved: true };
      return;
    }
    if (pts.size > 2) return;
    const w = toW(p.x, p.y), lvl = lodOf(V.k), chip = chipAt(p.x, p.y);
    const n = chip ? null : nodeAt(w.x, w.y);
    if (chip) gst = { type: "group", g: chip.g, sx: p.x, sy: p.y, last: p, moved: false };
    else if (n && lvl === 0 && e.altKey) gst = { type: "group", g: n.g, sx: p.x, sy: p.y, last: p, moved: false, node: n };
    else if (n) gst = { type: "node", n, sx: p.x, sy: p.y, ox: n.x, oy: n.y, moved: false, m: lvl >= 2 ? memberAt(n, w.y) : null, canDrag: lvl >= 1, vx: V.x, vy: V.y };
    else gst = { type: "pan", sx: p.x, sy: p.y, vx: V.x, vy: V.y, moved: false };
  }
  function onMove(e) {
    const p = rel(e);
    if (e.pointerType === "mouse") lastUser = performance.now();   // wer die Maus über dem Diagramm bewegt, schaut gerade selbst – KI-Kamera hält still
    if (pts.has(e.pointerId)) pts.set(e.pointerId, p);
    if (!gst) {
      if (e.pointerType === "mouse" && M) {
        const w = toW(p.x, p.y), n = nodeAt(w.x, w.y), m = n && lodOf(V.k) >= 2 ? memberAt(n, w.y) : null;
        const nh = n ? { id: n.id, m } : null;
        if (JSON.stringify(nh) !== JSON.stringify(hover)) { hover = nh; canvas.style.cursor = n || chipAt(p.x, p.y) ? "pointer" : "grab"; if (lastCost < 40) req(); }
      }
      return;
    }
    if (gst.type === "pinch" && pts.size >= 2) {
      const [a, b] = [...pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      V.k = clamp(gst.k0 * (d / gst.d0), KMIN, KMAX); V.x = mx - gst.w.x * V.k; V.y = my - gst.w.y * V.k; poke(); req(); return;
    }
    const dx = p.x - gst.sx, dy = p.y - gst.sy;
    if (!gst.moved && Math.hypot(dx, dy) > 5) gst.moved = true;
    if (!gst.moved) return;
    if (gst.type === "pan") { V.x = gst.vx + dx; V.y = gst.vy + dy; canvas.style.cursor = "grabbing"; poke(); }
    else if (gst.type === "node" && gst.canDrag) { dragging = true; gst.n.x = gst.ox + dx / V.k; gst.n.y = gst.oy + dy / V.k; updateGroup(gst.n.g, M); }
    else if (gst.type === "node") { V.x = gst.vx + dx; V.y = gst.vy + dy; poke(); }
    else if (gst.type === "group") {
      dragging = true;
      const ddx = (p.x - gst.last.x) / V.k, ddy = (p.y - gst.last.y) / V.k; gst.last = p;
      gst.g.x += ddx; gst.g.y += ddy; for (const id of gst.g.ids) { M.classes[id].x += ddx; M.classes[id].y += ddy; }
    }
    req();
  }
  function onUp(e) {
    pts.delete(e.pointerId);
    if (!gst) return;
    const g = gst;
    if (g.type === "pinch") { if (pts.size === 0) gst = null; return; }
    gst = null; canvas.style.cursor = "grab";
    if ((g.type === "node" || g.type === "group") && g.moved && dragging) { dragging = false; updateBB(M); reindexNodes(g.type === "node" ? [g.n.id] : g.g.ids); miniDirty = true; snapV = null; req(); return; }
    dragging = false;
    if (g.moved) return;
    const now = performance.now();
    if (g.type === "node") {
      const dbl = now - lastTap.t < 340 && lastTap.id === g.n.id;
      lastTap = { t: now, id: g.n.id };
      select({ id: g.n.id, m: g.m }, false);
      if (dbl) focus(g.n.id, g.m ? 3 : lodOf(V.k) < 2 ? 2 : 3, g.m);
    } else if (g.type === "group") {
      lastTap = { t: now, id: -1 };
      fitRect(g.g.x, g.g.y, g.g.w, g.g.h);
    } else {
      const dbl = now - lastTap.t < 340 && lastTap.id === -3; lastTap = { t: now, id: -3 };
      if (dbl) { const p = rel(e); zoomAt(p.x, p.y, 2, true); } else select(null);
    }
  }
  function zoomAt(mx, my, f, smooth) {
    const k2 = clamp(V.k * f, KMIN, KMAX), w = toW(mx, my);
    if (smooth) { const cx = w.x + (W / 2 - mx) / k2, cy = w.y + (H / 2 - my) / k2; animateTo(cx, cy, k2); return; }
    anim = null; V.k = k2; V.x = mx - w.x * k2; V.y = my - w.y * k2; poke(); req();
  }
  function onWheel(e) {
    e.preventDefault(); if (!M) return;
    lastUser = performance.now();
    const p = rel(e);
    const mouse = e.deltaMode === 1 || (e.deltaX === 0 && Math.abs(e.deltaY) >= 50 && Number.isInteger(e.deltaY));
    if (e.ctrlKey || e.metaKey || mouse) zoomAt(p.x, p.y, Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.06 : e.ctrlKey ? 0.012 : 0.0019)));
    else { anim = null; V.x -= e.deltaX; V.y -= e.deltaY; poke(); req(); }
  }
  function onLeave() { if (hover) { hover = null; req(); } }
  // Minimap
  let miniDrag = false;
  function miniGo(e) {
    if (!M || !mini._t) return;
    lastUser = performance.now();
    const r = mini.getBoundingClientRect(), t = mini._t;
    const wx = (e.clientX - r.left - t.ox) / t.s, wy = (e.clientY - r.top - t.oy) / t.s;
    anim = null; V.x = W / 2 - wx * V.k; V.y = H / 2 - wy * V.k; poke(); req();
  }
  const mDown = (e) => { miniDrag = true; mini.setPointerCapture(e.pointerId); miniGo(e); };
  const mMove = (e) => { if (miniDrag) miniGo(e); };
  const mUp = () => { miniDrag = false; };

  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);
  canvas.addEventListener("pointerleave", onLeave);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  mini.addEventListener("pointerdown", mDown); mini.addEventListener("pointermove", mMove); mini.addEventListener("pointerup", mUp);
  const ro = new ResizeObserver(resize); ro.observe(canvas.parentElement);
  readColors(); resize();

  /* ---------- API ---------- */
  function fitRect(x, y, w, h, instant) {
    const pad = 40, k = clamp(Math.min((W - pad * 2) / w, (H - pad * 2 - INSET) / h), KMIN, KMAX);
    if (instant) { V.k = k; V.x = W / 2 - (x + w / 2) * k; V.y = (H + INSET) / 2 - (y + h / 2) * k; req(); }
    else animateTo(x + w / 2, y + h / 2 - INSET / 2 / k, k);
  }
  function focus(id, level, m) {
    const c = M.classes[id]; if (!c) return;
    let k = level != null ? LV[level].k : Math.max(V.k, 0.9);
    if (level >= 2) k = clamp(Math.min((W * 0.8) / c.w, level === 3 ? (m ? 1.45 : 2.0) : 1.15), 0.62, KMAX);
    if (level === 3) k = Math.max(k, 1.32);
    let cy = c.y + c.h / 2;
    if (m) cy = m.t === "f" ? fieldY(c, m.i) : methY(c, m.i);
    else if (c.h * k > H * 0.85) cy = c.y + (H * 0.42) / k;
    animateTo(c.x + c.w / 2, cy, k);
  }
  function select(s, doFocus) {
    sel = s; computeHL(); req();
    cb.onSelect && cb.onSelect(s);
    if (s && doFocus) focus(s.id, doFocus === true ? null : doFocus, s.m);
  }
  return {
    setModel(m, keep) {
      M = m; sel = null; hover = null; snapV = null; miniDirty = true; lastCost = 0;
      if (m) { m.gedgesSorted = m.gedges.slice().sort((a, b) => b.n - a.n); buildEdgeGrid(); }
      resolveVB(); computeHL(); if (m && !keep) fitRect(m.bb.x, m.bb.y, m.bb.w, m.bb.h, true); req();
    },
    setBudget(n) { budget = n > 0 ? n : 1e9; snapV = null; req(); },
    setLive(L) { LIVE = L; liveReq(); },
    liveKick: () => liveReq(),
    setDiag(d) { DG = d || new Map(); snapV = null; req(); },
    /* Änderungsebene: { nodes, edges, links, ghosts, ghostEdges, only } nach stabilen Schlüsseln – oder null */
    setVibe(v) { VBK = v; resolveVB(); computeHL(); miniDirty = true; snapV = null; req(); },
    setAgent(a) { AG = a; liveReq(); },
    setImpactView(v) { IV = v && ((v.list || []).length || (v.src || []).length) ? v : null; liveReq(); },
    setHeat(h) { HV = h && h.vals && h.vals.size ? h : null; liveReq(); },
    setTeamView(t) { TMV = t && t.length ? t : null; liveReq(); },
    setTestView(v) { TV = v && (v.on.length || v.fail.length || (v.miss || []).length) ? v : null; liveReq(); },
    agentKick(redraw) { liveReq(); if (redraw) req(); },
    idleFor: () => performance.now() - lastUser,
    view: () => ({ x: V.x, y: V.y, k: V.k }),
    look(cx, cy, k) { anim = null; V.k = k; V.x = W / 2 - cx * k; V.y = H / 2 - cy * k; snapV = null; req(); },   // Messhilfe
    stat: () => statTxt,
    bench(n) { const t0 = performance.now(); for (let i = 0; i < n; i++) { draw(); ctx.getImageData(0, 0, 1, 1); } return (performance.now() - t0) / n; },   // Messhilfe: n-mal voll zeichnen, ms pro Bild
    setInset(n) { INSET = n || 0; },
    /* liegt ein Knoten (oder eine Zeile davon) gerade lesbar im Bild? */
    inView(id, m) {
      const c = M && M.classes[id]; if (!c) return false;
      const x0 = -V.x / V.k, y0 = -V.y / V.k + INSET / V.k, x1 = (W - V.x) / V.k, y1 = (H - V.y) / V.k;
      const y = m ? (m.t === "f" ? fieldY(c, m.i) : methY(c, m.i)) : c.y + Math.min(c.h, HEAD) / 2;
      return c.x < x1 && c.x + c.w > x0 && y > y0 && y < y1 && lodOf(V.k) >= (m ? 2 : 1);
    },
    /* Verbindung hervorheben: von Funktion ai des Knotens a zu Zeile bi (Art bt: "m" | "f") des Knotens b – Index -1 = ganzer Knoten */
    pinLink(a, ai, b, bt, bi) { PIN = { a, ai, b, bt, bi, t0: performance.now() }; liveReq(); },   // Platz am oberen Rand, den eine Leiste über dem Diagramm belegt
    /* Kamera nur bewegen, wenn die Stelle nicht ohnehin lesbar im Bild ist */
    reveal(id, m) {
      const c = M && M.classes[id]; if (!c) return;
      const x0 = -V.x / V.k, y0 = -V.y / V.k, x1 = (W - V.x) / V.k, y1 = (H - V.y) / V.k, lvl = lodOf(V.k);
      const y = m ? (m.t === "f" ? fieldY(c, m.i) : methY(c, m.i)) : c.y + Math.min(c.h, HEAD) / 2;
      if (c.x >= x0 && c.x + c.w <= x1 && y - 30 >= y0 + INSET / V.k && y + 30 <= y1 && lvl >= (m ? 2 : 1)) return;
      focus(id, lvl >= 2 ? null : 2, m);
    },
    fitNodes(ids) {
      if (!M) return;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const id of ids) { const c = M.classes[id]; if (!c) continue; x0 = Math.min(x0, c.x); y0 = Math.min(y0, c.y); x1 = Math.max(x1, c.x + c.w); y1 = Math.max(y1, c.y + c.h); }
      if (x0 < x1) animateTo((x0 + x1) / 2, (y0 + y1) / 2, clamp(Math.min((W - 140) / (x1 - x0), (H - 140) / (y1 - y0)), KMIN, 1.15));
    },
    png() { if (idxDirty) buildEdgeGrid(); draw(); return canvas.toDataURL("image/png"); },
    setTypes(t) { types = { ...t }; computeHL(); req(); },
    setPattern(p) { pat = p; computeHL(); req(); },
    theme() { readColors(); miniDirty = true; snapV = null; req(); },
    redraw: req,
    select,
    focus,
    fit() { if (M) fitRect(M.bb.x, M.bb.y, M.bb.w, M.bb.h); },
    fitGroup(key) { const g = M && M.groups.find((x) => x.key === key); if (g) fitRect(g.x, g.y, g.w, g.h); },
    zoom(f) { zoomAt(W / 2, H / 2, f, true); },
    level(l) {
      if (!M) return;
      if (sel) { focus(sel.id, l, sel.m); return; }
      const cx = (W / 2 - V.x) / V.k, cy = (H / 2 - V.y) / V.k;
      if (l === 0) { this.fit(); return; }
      animateTo(cx, cy, LV[l].k);
    },
    destroy() {
      ro.disconnect(); cancelAnimationFrame(raf);
      canvas.removeEventListener("pointerdown", onDown); canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp); canvas.removeEventListener("pointercancel", onUp);
      canvas.removeEventListener("pointerleave", onLeave); canvas.removeEventListener("wheel", onWheel);
      mini.removeEventListener("pointerdown", mDown); mini.removeEventListener("pointermove", mMove); mini.removeEventListener("pointerup", mUp);
    },
  };
}

/* ============================ Demo & Stresstest ============================ */
const DEMO = {
  "anlage/firmware/shared_RAM.h": `#ifndef SHARED_RAM_H
#define SHARED_RAM_H
#include <windows.h>

#define ANZ_MELDER 8
#define TOR_AUF 1
#define TOR_ZU  0

typedef struct {
    int  istwert[ANZ_MELDER];
    int  tor_status;
    BOOL notaus;
    BOOL motor_auf;
    BOOL motor_zu;
} PROZESSABBILD;

extern PROZESSABBILD g_abbild;
extern CRITICAL_SECTION g_cs;
extern volatile BOOL g_running;

void  ram_init(void);
int   ram_get_melder(int nr);
void  ram_set_melder(int nr, int wert);
BOOL  ram_get_notaus(void);
void  ram_set_motor(BOOL auf, BOOL zu);
#endif
`,
  "anlage/firmware/shared_RAM.c": `#include "shared_RAM.h"
#include <string.h>

PROZESSABBILD g_abbild;
CRITICAL_SECTION g_cs;
volatile BOOL g_running = TRUE;
static int zugriffe = 0;

void ram_init(void)
{
    InitializeCriticalSection(&g_cs);
    memset(&g_abbild, 0, sizeof(g_abbild));
}

int ram_get_melder(int nr)
{
    int w;
    EnterCriticalSection(&g_cs);
    w = g_abbild.istwert[nr];
    zugriffe++;
    LeaveCriticalSection(&g_cs);
    return w;
}

void ram_set_melder(int nr, int wert)
{
    EnterCriticalSection(&g_cs);
    g_abbild.istwert[nr] = wert;
    LeaveCriticalSection(&g_cs);
}

BOOL ram_get_notaus(void) { return g_abbild.notaus; }

void ram_set_motor(BOOL auf, BOOL zu)
{
    EnterCriticalSection(&g_cs);
    g_abbild.motor_auf = auf;
    g_abbild.motor_zu = zu;
    LeaveCriticalSection(&g_cs);
}
`,
  "anlage/firmware/melder_threads.h": `#ifndef MELDER_H
#define MELDER_H
#include <windows.h>
DWORD WINAPI melder_thread(LPVOID arg);
#endif
`,
  "anlage/firmware/melder_threads.c": `#include "melder_threads.h"
#include "shared_RAM.h"
#include "ser_io_thread.h"

static int entprellen(int roh, int alt)
{
    return (roh == alt) ? roh : alt;
}

DWORD WINAPI melder_thread(LPVOID arg)
{
    int alt[ANZ_MELDER] = {0};
    int i;
    while (g_running) {
        for (i = 0; i < ANZ_MELDER; i++) {
            int roh = ser_lese_eingang(i);
            alt[i] = entprellen(roh, alt[i]);
            ram_set_melder(i, alt[i]);
        }
        Sleep(10);
    }
    return 0;
}
`,
  "anlage/firmware/safety_thread.h": `DWORD WINAPI safety_thread(LPVOID arg);
`,
  "anlage/firmware/safety_thread.c": `#include "safety_thread.h"
#include "shared_RAM.h"

DWORD WINAPI safety_thread(LPVOID arg)
{
    while (g_running) {
        if (ram_get_melder(7)) {
            g_abbild.notaus = TRUE;      /* direkt, ohne Lock */
            ram_set_motor(FALSE, FALSE);
        }
        Sleep(5);
    }
    return 0;
}
`,
  "anlage/firmware/ser_io_thread.h": `#include <windows.h>
DWORD WINAPI ser_io_thread(LPVOID arg);
int ser_lese_eingang(int kanal);
void ser_schreibe_ausgang(int kanal, int wert);
`,
  "anlage/firmware/ser_io_thread.c": `#include "ser_io_thread.h"
#include "shared_RAM.h"
#include <stdio.h>

static HANDLE h_com = INVALID_HANDLE_VALUE;
static unsigned char eingaenge[16];

static BOOL com_oeffnen(const char *port)
{
    h_com = CreateFileA(port, GENERIC_READ | GENERIC_WRITE, 0, NULL, OPEN_EXISTING, 0, NULL);
    return h_com != INVALID_HANDLE_VALUE;
}

int ser_lese_eingang(int kanal) { return eingaenge[kanal] & 1; }

void ser_schreibe_ausgang(int kanal, int wert)
{
    DWORD n; unsigned char b[2];
    b[0] = (unsigned char)kanal; b[1] = (unsigned char)wert;
    WriteFile(h_com, b, 2, &n, NULL);
}

DWORD WINAPI ser_io_thread(LPVOID arg)
{
    DWORD n;
    if (!com_oeffnen("COM3")) return 1;
    while (g_running) {
        ReadFile(h_com, eingaenge, sizeof(eingaenge), &n, NULL);
        ser_schreibe_ausgang(0, g_abbild.motor_auf);
        ser_schreibe_ausgang(1, g_abbild.motor_zu);
    }
    CloseHandle(h_com);
    return 0;
}
`,
  "anlage/firmware/steuerungs_thread.h": `DWORD WINAPI steuerungs_thread(LPVOID arg);
`,
  "anlage/firmware/steuerungs_thread.c": `#include "steuerungs_thread.h"
#include "shared_RAM.h"

typedef enum { ZU, OEFFNET, AUF, SCHLIESST } TORZUSTAND;
static TORZUSTAND zustand = ZU;

static void schritt(void)
{
    switch (zustand) {
    case ZU:        if (ram_get_melder(0)) { zustand = OEFFNET; ram_set_motor(TRUE, FALSE); } break;
    case OEFFNET:   if (ram_get_melder(1)) { zustand = AUF; ram_set_motor(FALSE, FALSE); } break;
    case AUF:       if (ram_get_melder(2)) { zustand = SCHLIESST; ram_set_motor(FALSE, TRUE); } break;
    case SCHLIESST: if (ram_get_melder(3)) { zustand = ZU; ram_set_motor(FALSE, FALSE); } break;
    }
    g_abbild.tor_status = (zustand == AUF) ? TOR_AUF : TOR_ZU;
}

DWORD WINAPI steuerungs_thread(LPVOID arg)
{
    while (g_running && !ram_get_notaus()) { schritt(); Sleep(20); }
    return 0;
}
`,
  "anlage/firmware/gui.h": `void gui_zeichnen(void);
`,
  "anlage/firmware/gui.c": `#include <stdio.h>
#include "gui.h"
#include "shared_RAM.h"
void gui_zeichnen(void)
{
    int i;
    printf("Tor: %s\\n", g_abbild.tor_status == TOR_AUF ? "AUF" : "ZU");
    for (i = 0; i < ANZ_MELDER; i++) printf("M%d=%d ", i, ram_get_melder(i));
}
`,
  "anlage/firmware/getting_started_main.c": `#include <windows.h>
#include "shared_RAM.h"
#include "melder_threads.h"
#include "safety_thread.h"
#include "ser_io_thread.h"
#include "steuerungs_thread.h"
#include "gui.h"

int main(void)
{
    HANDLE h[4];
    ram_init();
    h[0] = CreateThread(NULL, 0, ser_io_thread, NULL, 0, NULL);
    h[1] = CreateThread(NULL, 0, melder_thread, NULL, 0, NULL);
    h[2] = CreateThread(NULL, 0, safety_thread, NULL, 0, NULL);
    h[3] = CreateThread(NULL, 0, steuerungs_thread, NULL, 0, NULL);
    while (!ram_get_notaus()) { gui_zeichnen(); Sleep(500); }
    g_running = FALSE;
    WaitForMultipleObjects(4, h, TRUE, INFINITE);
    return 0;
}
`,
  "anlage/src/core/Logger.ts": `export enum LogLevel { Debug, Info, Warn, Error }

export class LogEntry {
  constructor(public readonly level: LogLevel, public readonly text: string, public readonly time: number) {}
}

export class Logger {
  private static instance: Logger;
  private entries: LogEntry[] = [];
  private level: LogLevel = LogLevel.Info;
  private constructor() {}
  static getInstance(): Logger {
    if (!Logger.instance) Logger.instance = new Logger();
    return Logger.instance;
  }
  log(level: LogLevel, msg: string): void {
    if (level >= this.level) this.entries.push(new LogEntry(level, msg, Date.now()));
  }
  history(): LogEntry[] { return this.entries; }
}`,
  "anlage/src/core/Config.ts": `export class Config {
  private static instance: Config;
  private values: Map<string, number> = new Map();
  static getInstance(): Config {
    if (!Config.instance) Config.instance = new Config();
    return Config.instance;
  }
  get(key: string, fallback: number): number { return this.values.get(key) ?? fallback; }
  set(key: string, value: number): void { this.values.set(key, value); }
}`,
  "anlage/src/core/EventBus.ts": `export interface EventListener {
  onEvent(topic: string, payload: unknown): void;
}

export class EventBus {
  private listeners: Map<string, EventListener[]> = new Map();
  subscribe(topic: string, l: EventListener): void {
    const arr = this.listeners.get(topic) ?? [];
    arr.push(l); this.listeners.set(topic, arr);
  }
  unsubscribe(topic: string, l: EventListener): void {
    this.listeners.set(topic, (this.listeners.get(topic) ?? []).filter(x => x !== l));
  }
  publish(topic: string, payload: unknown): void {
    for (const l of this.listeners.get(topic) ?? []) l.onEvent(topic, payload);
  }
}`,
  "anlage/src/io/IOBus.ts": `export interface IOBus {
  readAnalog(channel: number): number;
  writeAnalog(channel: number, value: number): void;
}

export class ModbusClient {
  private connected = false;
  constructor(private host: string, private port: number) {}
  connect(): boolean { this.connected = true; return this.connected; }
  readRegister(addr: number): number { return addr * 0.1; }
  writeRegister(addr: number, raw: number): void {}
}

export class ModbusAdapter implements IOBus {
  private client: ModbusClient;
  private scale = 27648;
  constructor(host: string) { this.client = new ModbusClient(host, 502); }
  readAnalog(channel: number): number { return this.client.readRegister(channel) / this.scale; }
  writeAnalog(channel: number, value: number): void { this.client.writeRegister(channel, Math.round(value * this.scale)); }
}

export class SimulatedBus implements IOBus {
  private memory: number[] = [];
  readAnalog(channel: number): number { return this.memory[channel] ?? 0; }
  writeAnalog(channel: number, value: number): void { this.memory[channel] = value; }
}`,
  "anlage/src/sensors/Sensor.ts": `import { IOBus } from "../io/IOBus";

export interface SensorObserver {
  onMeasurement(sensor: Sensor, value: number): void;
}

export abstract class Sensor {
  protected observers: SensorObserver[] = [];
  protected lastValue: number = 0;
  constructor(public readonly id: string, protected bus: IOBus, protected channel: number) {}
  attach(o: SensorObserver): void { this.observers.push(o); }
  detach(o: SensorObserver): void { this.observers = this.observers.filter(x => x !== o); }
  protected notify(v: number): void { for (const o of this.observers) o.onMeasurement(this, v); }
  abstract read(): number;
  sample(): number { const v = this.read(); this.lastValue = v; this.notify(v); return v; }
}

export class TemperatureSensor extends Sensor {
  private offset = -50;
  read(): number { return this.bus.readAnalog(this.channel) * 200 + this.offset; }
}

export class PressureSensor extends Sensor {
  read(): number { return this.bus.readAnalog(this.channel) * 10; }
}

export class LevelSensor extends Sensor {
  private tankHeight: number = 2.5;
  read(): number { return this.bus.readAnalog(this.channel) * this.tankHeight; }
}`,
  "anlage/src/sensors/SensorHub.ts": `import { Sensor, SensorObserver } from "./Sensor";
import { Logger } from "../core/Logger";
import { EventBus } from "../core/EventBus";

export class SensorHub implements SensorObserver {
  private sensors: Sensor[] = [];
  private bus: EventBus;
  constructor(bus: EventBus) { this.bus = bus; }
  register(s: Sensor): void { this.sensors.push(s); s.attach(this); }
  onMeasurement(sensor: Sensor, value: number): void {
    Logger.getInstance().log(1, sensor.id + "=" + value);
    this.bus.publish("measurement", { id: sensor.id, value });
  }
  pollAll(): void { this.sensors.forEach(s => s.sample()); }
}`,
  "anlage/src/control/Controller.ts": `export interface Controller {
  compute(setpoint: number, actual: number, dt: number): number;
  reset(): void;
}

export class PController implements Controller {
  constructor(private kp: number) {}
  compute(setpoint: number, actual: number, dt: number): number { return this.kp * (setpoint - actual); }
  reset(): void {}
}

export class PIController implements Controller {
  private integral = 0;
  constructor(private kr: number, private tn: number) {}
  compute(setpoint: number, actual: number, dt: number): number {
    const e = setpoint - actual; this.integral += e * dt;
    return this.kr * (e + this.integral / this.tn);
  }
  reset(): void { this.integral = 0; }
}

export class PIDController implements Controller {
  private integral = 0;
  private lastError = 0;
  private filtered = 0;
  constructor(private kr: number, private tn: number, private tv: number, private td: number) {}
  compute(setpoint: number, actual: number, dt: number): number {
    const e = setpoint - actual; this.integral += e * dt;
    const d = (e - this.lastError) / dt; this.filtered += (d - this.filtered) * dt / (this.td + dt);
    this.lastError = e;
    return this.kr * (e + this.integral / this.tn + this.tv * this.filtered);
  }
  reset(): void { this.integral = 0; this.lastError = 0; this.filtered = 0; }
}

export class TwoPointController implements Controller {
  private state = false;
  constructor(private hysteresis: number) {}
  compute(setpoint: number, actual: number, dt: number): number {
    if (actual < setpoint - this.hysteresis) this.state = true;
    if (actual > setpoint + this.hysteresis) this.state = false;
    return this.state ? 1 : 0;
  }
  reset(): void { this.state = false; }
}`,
  "anlage/src/control/ControlLoop.ts": `import { Controller } from "./Controller";
import { Sensor } from "../sensors/Sensor";
import { Actuator } from "../actuators/Actuator";

export class ControlLoop {
  private controller: Controller;
  private sensor: Sensor;
  private actuator: Actuator;
  private setpoint: number = 0;
  private lastOutput = 0;
  constructor(controller: Controller, sensor: Sensor, actuator: Actuator) {
    this.controller = controller; this.sensor = sensor; this.actuator = actuator;
  }
  setController(c: Controller): void { this.controller = c; c.reset(); }
  setSetpoint(w: number): void { this.setpoint = w; }
  step(dt: number): number {
    const y = this.sensor.sample();
    this.lastOutput = this.controller.compute(this.setpoint, y, dt);
    this.actuator.apply(this.lastOutput);
    return this.lastOutput;
  }
}`,
  "anlage/src/actuators/Actuator.ts": `import { IOBus } from "../io/IOBus";
import { Logger } from "../core/Logger";

export abstract class Actuator {
  protected output = 0;
  constructor(protected bus: IOBus, protected channel: number) {}
  abstract apply(u: number): void;
  current(): number { return this.output; }
}

export class Valve extends Actuator {
  private minOpening = 0.05;
  apply(u: number): void { this.output = Math.max(this.minOpening, Math.min(1, u)); this.bus.writeAnalog(this.channel, this.output); }
}

export class Pump extends Actuator {
  private maxRpm: number = 2900;
  apply(u: number): void { this.output = u * this.maxRpm; this.bus.writeAnalog(this.channel, u); }
}

export class Heater extends Actuator {
  private powerKw = 6;
  apply(u: number): void { this.output = u > 0.5 ? 1 : 0; this.bus.writeAnalog(this.channel, this.output); }
}

export class LoggingActuator extends Actuator {
  private inner: Actuator;
  private logger: Logger = Logger.getInstance();
  constructor(inner: Actuator, bus: IOBus) { super(bus, -1); this.inner = inner; }
  apply(u: number): void { this.logger.log(0, "u=" + u); this.inner.apply(u); }
}

export class ActuatorFactory {
  constructor(private bus: IOBus) {}
  createValve(channel: number): Valve { return new Valve(this.bus, channel); }
  createPump(channel: number): Pump { return new Pump(this.bus, channel); }
  createHeater(channel: number): Heater { return new Heater(this.bus, channel); }
  createLogged(a: Actuator): LoggingActuator { return new LoggingActuator(a, this.bus); }
}`,
  "anlage/src/plant/Plant.ts": `import { ControlLoop } from "../control/ControlLoop";
import { IOBus } from "../io/IOBus";
import { SensorHub } from "../sensors/SensorHub";
import { Recipe } from "../recipes/Recipe";

export class Tank {
  level = 0;
  constructor(private area: number, private maxLevel: number) {}
  update(qIn: number, qOut: number, dt: number): number {
    this.level = Math.max(0, Math.min(this.maxLevel, this.level + (qIn - qOut) * dt / this.area));
    return this.level;
  }
}

export class Plant {
  private loops: ControlLoop[] = [];
  private tank: Tank = new Tank(0.8, 2.5);
  private hub: SensorHub;
  private recipe?: Recipe;
  constructor(private bus: IOBus, hub: SensorHub) { this.hub = hub; }
  addLoop(l: ControlLoop): void { this.loops.push(l); }
  load(r: Recipe): void { this.recipe = r; }
  run(dt: number): void { this.hub.pollAll(); this.loops.forEach(l => l.step(dt)); }
}`,
  "anlage/src/recipes/Recipe.ts": `export class RecipeStep {
  constructor(public action: string, public value: number, public durationS: number) {}
}

export class Recipe {
  steps: RecipeStep[] = [];
  constructor(public name: string) {}
  totalDuration(): number { return this.steps.reduce((s, x) => s + x.durationS, 0); }
}

export class RecipeBuilder {
  private recipe: Recipe = new Recipe("unbenannt");
  named(n: string): RecipeBuilder { this.recipe.name = n; return this; }
  fillTo(level: number): RecipeBuilder { this.recipe.steps.push(new RecipeStep("fill", level, 0)); return this; }
  heatTo(temp: number): RecipeBuilder { this.recipe.steps.push(new RecipeStep("heat", temp, 0)); return this; }
  hold(seconds: number): RecipeBuilder { this.recipe.steps.push(new RecipeStep("hold", 0, seconds)); return this; }
  build(): Recipe { return this.recipe; }
}`,
  "anlage/hmi/Widget.java": `package hmi;

import java.util.ArrayList;
import java.util.List;

public abstract class Widget {
    protected String id;
    protected int x, y;
    public Widget(String id) { this.id = id; }
    public abstract void render(RenderContext ctx);
}

public class Panel extends Widget {
    private List<Widget> children = new ArrayList<>();
    private String title;
    public Panel(String id, String title) { super(id); this.title = title; }
    public void add(Widget w) { children.add(w); }
    @Override
    public void render(RenderContext ctx) { for (Widget w : children) w.render(ctx); }
}

public class TrendChart extends Widget {
    private DataSeries series;
    private double yMin = 0, yMax = 100;
    public TrendChart(String id, DataSeries s) { super(id); this.series = s; }
    @Override
    public void render(RenderContext ctx) { ctx.polyline(series.values()); }
}

public class Gauge extends Widget {
    private double value;
    private final double limit;
    public Gauge(String id, double limit) { super(id); this.limit = limit; }
    @Override
    public void render(RenderContext ctx) { ctx.arc(value / limit); }
}`,
  "anlage/hmi/Dashboard.java": `package hmi;

public class DataSeries {
    private double[] values = new double[512];
    private int head;
    public void push(double v) { values[head++ % values.length] = v; }
    public double[] values() { return values; }
}

public interface RenderContext {
    void polyline(double[] pts);
    void arc(double fraction);
}

public class Dashboard {
    private Panel root = new Panel("root", "Anlage");
    private RenderContext ctx;
    private static final int FPS = 30;
    public Dashboard(RenderContext ctx) { this.ctx = ctx; }
    public void refresh() { root.render(ctx); }
    public Panel getRoot() { return root; }
}`,
  "anlage/analysis/recorder.py": `from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class Sample:
    t: float
    value: float
    channel: str = "y"


class DataRecorder:
    max_samples: int = 10000

    def __init__(self, name: str):
        self.name = name
        self._samples: list[Sample] = []
        self.__dirty = False

    def record(self, t: float, value: float) -> Sample:
        s = Sample(t, value)
        self._samples.append(s)
        return s

    def window(self, n: int) -> list[Sample]:
        return self._samples[-n:]


class AlarmRule(ABC):
    @abstractmethod
    def check(self, sample: Sample) -> bool: ...


class HighAlarm(AlarmRule):
    def __init__(self, limit: float):
        self.limit = limit

    def check(self, sample: Sample) -> bool:
        return sample.value > self.limit


class LowAlarm(AlarmRule):
    def __init__(self, limit: float):
        self.limit = limit

    def check(self, sample: Sample) -> bool:
        return sample.value < self.limit


class AlarmEvaluator:
    def __init__(self, recorder: DataRecorder):
        self.rule: AlarmRule = HighAlarm(80.0)
        self.recorder = recorder

    def set_rule(self, rule: AlarmRule) -> None:
        self.rule = rule

    def evaluate(self) -> list[Sample]:
        return [s for s in self.recorder.window(100) if self.rule.check(s)]


class TrendAnalyzer:
    @staticmethod
    def slope(samples: list[Sample]) -> float:
        if len(samples) < 2:
            return 0.0
        return (samples[-1].value - samples[0].value) / (samples[-1].t - samples[0].t)`,
};

function synthetic(n = 1500) {
  let s = 1234567; const rnd = () => ((s = Math.imul(s ^ (s >>> 15), 2246822519) + 1013904223 >>> 0) / 4294967296);
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const doms = ["auth", "billing", "catalog", "orders", "shipping", "inventory", "users", "reports", "search", "notify", "payments", "gateway"];
  const layers = ["api", "service", "domain", "repo", "infra"];
  const nouns = ["Order", "Invoice", "Customer", "Product", "Cart", "Token", "Session", "Shipment", "Stock", "Report", "Query", "Event", "Payment", "Account", "Address", "Price", "Rule", "Job", "Cache", "Policy"];
  const suf = { api: ["Controller", "Endpoint", "Dto"], service: ["Service", "Manager", "Handler"], domain: ["", "Entity", "Value", "Aggregate"], repo: ["Repository", "Dao", "Mapper"], infra: ["Client", "Adapter", "Config", "Factory"] };
  const classes = [], names = new Set();
  for (let i = 0; i < n; i++) {
    const d = pick(doms), l = pick(layers);
    let name, tries = 0; do name = pick(nouns) + pick(suf[l]) + (rnd() < 0.5 ? "" : Math.floor(rnd() * 99)) + (++tries > 8 ? "_" + i : ""); while (names.has(name)); names.add(name);
    const c = newClass(name, l === "domain" && rnd() < 0.15 ? "abstract" : l === "repo" && rnd() < 0.3 ? "interface" : "class", `shop/src/${d}/${l}/${name}.ts`, "ts", 1, 40);
    const nf = 1 + Math.floor(rnd() * 9), nm = 2 + Math.floor(rnd() * 12);
    for (let f = 0; f < nf; f++) c.fields.push({ name: pick(["id", "name", "count", "state", "items", "createdAt", "total", "owner", "flags", "meta"]) + f, type: pick(["string", "number", "boolean", "Date"]), init: "", vis: pick(["-", "-", "#", "+"]), static: rnd() < 0.05, line: 2 + f, comp: false });
    for (let m = 0; m < nm; m++) c.methods.push({ name: pick(["get", "find", "update", "handle", "validate", "map", "load", "save", "compute", "send"]) + pick(nouns) + (m || ""), params: [{ name: "x", type: "number", def: "" }], ret: pick(["void", "boolean", "number", "Promise<void>"]), vis: "+", static: false, abstract: c.kind === "interface", ctor: false, line: 12 + m, uses: [] });
    classes.push(c);
  }
  for (const c of classes) {
    if (rnd() < 0.3) { const p = pick(classes); if (p !== c) (p.kind === "interface" ? c.impl : c.ext).push(p.name); }
    const nr = Math.floor(rnd() * 3);
    for (let r = 0; r < nr; r++) { const t = pick(classes); if (t !== c) c.fields.push({ name: t.name[0].toLowerCase() + t.name.slice(1), type: rnd() < 0.3 ? t.name + "[]" : t.name, init: "", vis: "-", static: false, line: 30, comp: rnd() < 0.3 }); }
    if (rnd() < 0.5) c.uses.add(pick(classes).name);
  }
  return { classes, langs: { ts: n }, warn: [], fileCount: n, synthetic: true };
}

/* ============================ Styles ============================ */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=DM+Mono:ital,wght@0,300;0,400;0,500;1,300&display=swap');
.cal{
  --bg:#0a0b0d;--bg2:#111318;--bg3:#181c24;--surface:#1e2330;--border:#2a2f3e;
  --fg:#e8eaf0;--fg2:#9aa0b4;--fg3:#5a6070;
  --accent:#00d4aa;--accent2:#0098cc;--amber:#f5a623;--red:#f56565;--violet:#a78bfa;
  --ax:#ff5f6d;--ay:#5ee38a;--az:#4ea8ff;--navbg:rgba(10,11,13,.92);
  --mono:'DM Mono','JetBrains Mono',ui-monospace,monospace;
  --sans:'Space Grotesk',system-ui,-apple-system,sans-serif;
  color-scheme:dark;font-family:var(--sans);background:var(--bg);color:var(--fg);font-size:14px;line-height:1.5;
  height:100dvh;min-height:520px;display:grid;grid-template-rows:56px minmax(0,1fr) 30px;overflow:hidden;position:relative;
}
@media (prefers-color-scheme: light){.cal:not([data-theme="dark"]){
  --bg:#f5f6f8;--bg2:#eceef3;--bg3:#e2e5ed;--surface:#fff;--border:#d0d5e0;
  --fg:#111318;--fg2:#4a5168;--fg3:#8a90a4;
  --accent:#008870;--accent2:#006fa0;--amber:#b87400;--red:#c0392b;--violet:#6d4fd1;
  --ax:#d42c3c;--ay:#1f9a4a;--az:#1f6fd1;--navbg:rgba(245,246,248,.92);color-scheme:light;}}
.cal[data-theme="light"]{
  --bg:#f5f6f8;--bg2:#eceef3;--bg3:#e2e5ed;--surface:#fff;--border:#d0d5e0;
  --fg:#111318;--fg2:#4a5168;--fg3:#8a90a4;
  --accent:#008870;--accent2:#006fa0;--amber:#b87400;--red:#c0392b;--violet:#6d4fd1;
  --ax:#d42c3c;--ay:#1f9a4a;--az:#1f6fd1;--navbg:rgba(245,246,248,.92);color-scheme:light;}
.cal *,.cal *::before,.cal *::after{box-sizing:border-box;margin:0;padding:0}
.cal button{font:inherit}
.cal .nav{background:var(--navbg);backdrop-filter:blur(16px);border-bottom:1px solid var(--border);display:flex;align-items:center;gap:12px;padding:0 max(12px,env(safe-area-inset-left,0px));z-index:30;min-width:0}
.cal .nav-logo{font-size:13px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--fg2);white-space:nowrap}
.cal .nav-logo span{color:var(--accent)}
.cal .nav-mid{display:flex;gap:6px;align-items:center;overflow-x:auto;scrollbar-width:none;flex:1;min-width:0}
.cal .nav-mid::-webkit-scrollbar{display:none}
.cal .vsep{width:1px;height:22px;background:var(--border);flex-shrink:0;margin:0 4px}
.cal .nav-theme{background:none;border:1px solid var(--border);color:var(--fg2);width:32px;height:32px;border-radius:6px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0}
.cal .nav-theme:hover,.cal .nav-theme.on{color:var(--accent);border-color:var(--accent)}
.cal .btn{font-family:var(--mono);font-size:11px;letter-spacing:.08em;text-transform:uppercase;border:1px solid var(--border);color:var(--fg2);background:var(--bg3);padding:7px 11px;border-radius:5px;cursor:pointer;white-space:nowrap;transition:border-color .2s,color .2s;flex-shrink:0}
.cal .btn:hover{border-color:var(--accent);color:var(--accent)}
.cal .btn:focus-visible,.cal .seg button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.cal .btn.primary{background:var(--accent);border-color:var(--accent);color:var(--bg);font-weight:500}
.cal .btn.primary:hover{filter:brightness(1.1);color:var(--bg)}
.cal .btn.amber{border-color:var(--amber);color:var(--amber);background:transparent}
.cal .btn.sm{padding:5px 8px;font-size:10px}
.cal .btn.on{border-color:var(--accent);color:var(--accent);background:color-mix(in srgb,var(--accent) 10%,var(--bg3))}
.cal .seg{display:inline-flex;border:1px solid var(--border);border-radius:5px;overflow:hidden;flex-shrink:0}
.cal .seg button{font-family:var(--mono);font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;padding:7px 10px;background:var(--bg3);color:var(--fg3);border:none;border-right:1px solid var(--border);cursor:pointer;white-space:nowrap}
.cal .seg button:last-child{border-right:none}
.cal .seg button.on{color:var(--bg);background:var(--accent)}
.cal .seg button .n{opacity:.6;margin-right:5px}
.cal .main{display:grid;grid-template-columns:var(--lw,280px) minmax(0,1fr) var(--rw,340px);min-height:0;position:relative}
.cal .side{background:var(--bg2);border-right:1px solid var(--border);min-height:0;overflow-y:auto;overscroll-behavior:contain}
.cal .side.r{border-right:none;border-left:1px solid var(--border)}
.cal .side::-webkit-scrollbar{width:8px}.cal .side::-webkit-scrollbar-thumb{background:var(--border);border-radius:4px}
.cal .blk{padding:14px 14px 12px;border-bottom:1px solid var(--border)}
.cal .cl{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--fg3);font-family:var(--mono);margin-bottom:9px;display:flex;justify-content:space-between;align-items:center;gap:8px}
.cal .kicker{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--accent);font-family:var(--mono);font-weight:500}
.cal .txt{background:var(--bg3);border:1px solid var(--border);color:var(--fg);border-radius:5px;padding:8px 10px;font-family:var(--mono);font-size:12.5px;width:100%}
.cal .txt:focus{outline:none;border-color:var(--accent)}
.cal select.txt{cursor:pointer}
.cal .metrics{display:grid;grid-template-columns:1fr 1fr;gap:6px}
.cal .metric{background:var(--bg3);border:1px solid var(--border);border-radius:5px;padding:6px 10px;font-family:var(--mono);font-size:10px;min-width:0}
.cal .metric .ml{color:var(--fg3);letter-spacing:.08em;text-transform:uppercase}
.cal .metric .mv{color:var(--accent);font-size:14px;font-weight:500;font-variant-numeric:tabular-nums}
.cal .metric.warn .mv{color:var(--amber)}
.cal .lg{display:grid;gap:4px}
.cal .lg label{display:flex;align-items:center;gap:9px;font-family:var(--mono);font-size:11.5px;color:var(--fg2);cursor:pointer;padding:3px 2px;border-radius:4px}
.cal .lg label:hover{background:var(--bg3)}
.cal .lg input{accent-color:var(--accent);width:14px;height:14px}
.cal .lg svg{flex-shrink:0}
.cal .lg .cnt{margin-left:auto;color:var(--fg3);font-variant-numeric:tabular-nums}
.cal .tree{font-family:var(--mono);font-size:12px}
.cal .mod{display:flex;align-items:center;gap:7px;padding:5px 6px;border-radius:4px;cursor:pointer;color:var(--fg2);user-select:none}
.cal .mod:hover{background:var(--bg3);color:var(--fg)}
.cal .mod .car{width:10px;color:var(--fg3);transition:transform .15s;display:inline-block}
.cal .mod.open .car{transform:rotate(90deg)}
.cal .mod .sw{width:8px;height:8px;border-radius:2px;flex-shrink:0}
.cal .mod .nm{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0}
.cal .mod .cnt{color:var(--fg3);font-size:10.5px}
.cal .mod .go{opacity:0;font-size:10px;color:var(--accent);border:1px solid var(--border);border-radius:3px;padding:0 4px}
.cal .mod:hover .go{opacity:1}
.cal .cls{display:flex;align-items:center;gap:8px;padding:4px 6px 4px 26px;border-radius:4px;cursor:pointer;color:var(--fg2);white-space:nowrap}
.cal .cls:hover{background:var(--bg3);color:var(--fg)}
.cal .cls.on{background:color-mix(in srgb,var(--accent) 14%,var(--bg3));color:var(--fg)}
.cal .cls .k{font-size:9px;width:14px;text-align:center;border-radius:3px;color:var(--bg);font-weight:600;flex-shrink:0;line-height:14px}
.cal .cls .nm{overflow:hidden;text-overflow:ellipsis;flex:1;min-width:0}
.cal .cls .sub{color:var(--fg3);font-size:10px}
.cal .stage{position:relative;min-width:0;min-height:0;background:var(--bg);overflow:hidden;touch-action:none}
.cal .stage canvas.cv{position:absolute;inset:0;display:block;cursor:grab;touch-action:none}
.cal .ov{position:absolute;font-family:var(--mono);font-size:10px;color:var(--fg3);letter-spacing:.06em;pointer-events:none}
.cal .hud{position:absolute;left:12px;bottom:12px;display:flex;flex-direction:column;gap:6px;z-index:5}
.cal .ladder{background:color-mix(in srgb,var(--bg2) 92%,transparent);border:1px solid var(--border);border-radius:8px;padding:6px;display:grid;gap:2px;backdrop-filter:blur(10px)}
.cal .ladder button{display:grid;grid-template-columns:16px 1fr;gap:8px;align-items:center;text-align:left;background:none;border:none;border-radius:5px;padding:5px 8px 5px 6px;cursor:pointer;color:var(--fg3);font-family:var(--mono);font-size:10.5px;letter-spacing:.05em}
.cal .ladder button:hover{background:var(--bg3);color:var(--fg2)}
.cal .ladder button.on{color:var(--accent);background:color-mix(in srgb,var(--accent) 10%,transparent)}
.cal .ladder .bar{width:16px;height:4px;border-radius:2px;background:currentColor;opacity:.5}
.cal .ladder button.on .bar{opacity:1}
.cal .ladder .t{text-transform:uppercase}
.cal .ladder .h{display:block;font-size:9px;color:var(--fg3);text-transform:none;letter-spacing:0}
.cal .ladder button:not(.on) .h{display:none}
.cal .zrow{display:flex;gap:4px}
.cal .minimap{position:absolute;right:12px;bottom:12px;width:220px;height:140px;border:1px solid var(--border);border-radius:8px;background:color-mix(in srgb,var(--bg2) 90%,transparent);backdrop-filter:blur(10px);z-index:5;cursor:crosshair;touch-action:none}
.cal .empty{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none}
.cal .drop{position:absolute;inset:10px;border:2px dashed var(--accent);border-radius:12px;background:color-mix(in srgb,var(--accent) 8%,transparent);display:flex;align-items:center;justify-content:center;z-index:40;pointer-events:none;font-family:var(--mono);font-size:13px;letter-spacing:.1em;text-transform:uppercase;color:var(--accent)}
.cal .busy{position:absolute;inset:0;background:color-mix(in srgb,var(--bg) 70%,transparent);display:flex;align-items:center;justify-content:center;z-index:50;backdrop-filter:blur(3px)}
.cal .busy .box{background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:18px 22px;min-width:280px;font-family:var(--mono);font-size:12px;color:var(--fg2)}
.cal .busy .pb{height:3px;background:var(--border);border-radius:2px;margin-top:12px;overflow:hidden}
.cal .busy .pb i{display:block;height:100%;background:var(--accent);transition:width .2s}
.cal .status{border-top:1px solid var(--border);background:var(--bg2);display:flex;align-items:center;gap:16px;padding:0 12px;font-family:var(--mono);font-size:10.5px;color:var(--fg3);white-space:nowrap;overflow:hidden;letter-spacing:.04em}
.cal .status b{color:var(--fg2);font-weight:500;font-variant-numeric:tabular-nums}
.cal .status .acc{color:var(--accent)}
.cal .status .sp{flex:1}
.cal .pnl-h{padding:16px 16px 14px;border-bottom:1px solid var(--border)}
.cal .pnl-h .st{font-family:var(--mono);font-size:10px;color:var(--fg3);letter-spacing:.1em}
.cal .pnl-h h2{font-family:var(--mono);font-size:19px;font-weight:600;letter-spacing:-.01em;word-break:break-all;margin:4px 0 6px;line-height:1.25}
.cal .pnl-h h2.abs{font-style:italic}
.cal .loc{font-family:var(--mono);font-size:11px;color:var(--fg3);word-break:break-all}
.cal .pills{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
.cal .pill{font-family:var(--mono);font-size:10px;letter-spacing:.05em;padding:3px 8px;border-radius:10px;border:1px solid currentColor;cursor:help}
.cal .rel{display:grid;gap:2px}
.cal .rel button{display:flex;align-items:center;gap:8px;text-align:left;background:none;border:none;border-radius:4px;padding:4px 6px;cursor:pointer;color:var(--fg2);font-family:var(--mono);font-size:12px;min-width:0}
.cal .rel button:hover{background:var(--bg3);color:var(--fg)}
.cal .rel button .nm{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0}
.cal .rel button .lb{color:var(--fg3);font-size:10.5px;overflow:hidden;text-overflow:ellipsis;max-width:45%;white-space:nowrap}
.cal .rel .ext{padding:4px 6px;font-family:var(--mono);font-size:12px;color:var(--fg3)}
.cal .mem{display:grid;grid-template-columns:14px minmax(0,1fr) auto;gap:6px;align-items:baseline;width:100%;text-align:left;background:none;border:none;border-radius:4px;padding:3px 6px;cursor:pointer;font-family:var(--mono);font-size:11.5px;color:var(--fg)}
.cal .mem:hover{background:var(--bg3)}
.cal .mem.on{background:color-mix(in srgb,var(--amber) 16%,var(--bg3))}
.cal .mem .v{font-weight:600}
.cal .mem .s{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cal .mem .s i{color:var(--fg3);font-style:normal}
.cal .mem .ln{color:var(--fg3);font-size:10px}
.cal .mem.st .s>span{text-decoration:underline}
.cal .mem.ab .s{font-style:italic}
.cal .det{background:var(--bg3);border:1px solid var(--border);border-left:3px solid var(--amber);border-radius:0 6px 6px 0;padding:10px 12px;font-family:var(--mono);font-size:12px;line-height:1.75;color:var(--fg2);word-break:break-word}
.cal .det b{color:var(--fg);font-weight:500}
.cal .det .acc{color:var(--accent)}
.cal .det .chip{display:inline-block;border:1px solid var(--border);border-radius:3px;padding:0 6px;margin:2px 4px 2px 0;cursor:pointer;color:var(--accent);background:var(--bg2)}
.cal .det .chip:hover{border-color:var(--accent)}
.cal pre.src{background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:8px 0;font-family:var(--mono);font-size:11px;line-height:1.6;overflow:auto;max-height:380px;color:var(--fg2)}
.cal pre.src .l{display:block;padding:0 10px 0 0;white-space:pre}
.cal pre.src .l.hl{background:color-mix(in srgb,var(--amber) 15%,transparent);color:var(--fg)}
.cal pre.src .n{display:inline-block;width:40px;text-align:right;color:var(--fg3);padding-right:10px;user-select:none}
.cal .hint{font-size:11.5px;color:var(--fg3);font-family:var(--mono);line-height:1.6}
.cal .hint b{color:var(--fg2);font-weight:500}
.cal .info-row{display:flex;gap:10px;align-items:flex-start;padding:7px 0;border-top:1px solid var(--border);font-size:13px;color:var(--fg2)}
.cal .info-row:first-child{border-top:none}
.cal .info-dot{width:6px;height:6px;border-radius:50%;background:var(--accent);margin-top:7px;flex-shrink:0}
.cal .modal{position:absolute;inset:0;background:color-mix(in srgb,var(--bg) 70%,transparent);backdrop-filter:blur(4px);z-index:60;display:flex;align-items:center;justify-content:center;padding:16px}
.cal .modal .box{background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:20px;width:min(760px,100%);max-height:100%;display:flex;flex-direction:column;gap:12px}
.cal .modal textarea{min-height:300px;resize:vertical;font-size:12px;line-height:1.55;tab-size:2}
.cal .row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.cal .tag{font-family:var(--mono);font-size:10px;letter-spacing:.06em;padding:3px 9px;border:1px solid var(--border);border-radius:3px;color:var(--fg2)}
.cal .tag.accent{border-color:var(--accent);color:var(--accent)}
.cal .lv-badge{font-family:var(--mono);font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--accent)}
.cal .scrim{display:none}
.cal .center{display:flex;flex-direction:column;min-width:0;min-height:0;position:relative}
.cal .center .stage{flex:1}
.cal .dot{display:inline-block;width:7px;height:7px;border-radius:4px;background:var(--fg3);margin-right:7px;vertical-align:1px}
.cal .dot.ok{background:var(--accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 25%,transparent)}
.cal .dot.bad{background:var(--red)}
.cal .sp{flex:1}
.cal .drawer{border-top:1px solid var(--border);background:var(--bg2);display:flex;flex-direction:column;min-height:0;position:relative;flex-shrink:0;z-index:6}
.cal .drawer .grip{position:absolute;top:-5px;left:0;right:0;height:10px;cursor:ns-resize;z-index:3;touch-action:none}
.cal .drawer .grip:hover{background:linear-gradient(transparent 4px,var(--accent) 4px,var(--accent) 6px,transparent 6px)}
.cal .dh{display:flex;align-items:center;gap:2px;height:34px;padding:0 6px;overflow-x:auto;scrollbar-width:none;flex-shrink:0;border-bottom:1px solid var(--border)}
.cal .drawer.closed .dh{border-bottom:none}
.cal .dh::-webkit-scrollbar{display:none}
.cal .dtab{font-family:var(--mono);font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--fg3);background:none;border:none;padding:9px 10px 7px;cursor:pointer;border-bottom:2px solid transparent;white-space:nowrap}
.cal .dtab:hover{color:var(--fg2)}
.cal .dtab.on{color:var(--accent);border-bottom-color:var(--accent)}
.cal .dtab .cnt{margin-left:6px;padding:0 6px;border-radius:8px;background:var(--bg3);color:var(--fg2);font-size:9.5px}
.cal .dtab .cnt.e{background:var(--red);color:var(--bg)}
.cal .dtab .cnt.c{background:var(--ay);color:var(--bg)}
.cal .dbody{flex:1;min-height:0;display:flex;flex-direction:column;overflow:hidden}
.cal .tab-pad{padding:10px 12px;overflow:auto;flex:1;min-height:0;overscroll-behavior:contain}
.cal .ed{display:flex;flex-direction:column;min-height:0;flex:1}
.cal .ed-empty{padding:16px 18px;color:var(--fg2);font-size:13px;display:grid;gap:8px;overflow:auto}
.cal .ed-empty b{color:var(--fg)}
.cal .ed-tabs{display:flex;gap:3px;padding:5px 8px 0;overflow-x:auto;flex-shrink:0;scrollbar-width:none;border-bottom:1px solid var(--border)}
.cal .ed-tab{font-family:var(--mono);font-size:11px;color:var(--fg3);background:var(--bg3);border:1px solid var(--border);border-bottom:none;border-radius:5px 5px 0 0;padding:4px 9px;cursor:pointer;display:flex;gap:7px;align-items:center;white-space:nowrap}
.cal .ed-tab.on{color:var(--fg);background:var(--bg)}
.cal .ed-tab .x{opacity:.45;font-size:10px}.cal .ed-tab .x:hover{opacity:1;color:var(--red)}
.cal .ed-tab .dirty{width:6px;height:6px;border-radius:3px;background:var(--amber);display:inline-block}
.cal .ed-bar{display:flex;gap:10px;align-items:center;padding:5px 10px;border-bottom:1px solid var(--border);font-family:var(--mono);font-size:10.5px;color:var(--fg3);flex-shrink:0;flex-wrap:wrap;background:var(--bg)}
.cal .ed-bar .path{color:var(--fg2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:40%}
.cal .ed-conf{padding:6px 10px;background:color-mix(in srgb,var(--amber) 14%,var(--bg2));color:var(--amber);font-family:var(--mono);font-size:11px;display:flex;gap:8px;align-items:center;flex-shrink:0}
.cal .ed-scroll{flex:1;overflow:auto;background:var(--bg);position:relative;overscroll-behavior:contain;min-height:0}
.cal .ed-grid{display:grid;grid-template-columns:auto 1fr;min-width:100%;width:max-content;min-height:100%}
.cal .ed-gut{position:sticky;left:0;z-index:2;background:var(--bg2);border-right:1px solid var(--border);padding:6px 0;text-align:right;user-select:none}
.cal .ed-gut div{height:19px;line-height:19px;padding:0 8px 0 16px;font-family:var(--mono);font-size:10.5px;color:var(--fg3);cursor:pointer;position:relative;font-variant-numeric:tabular-nums}
.cal .ed-gut div:hover{color:var(--accent)}
.cal .ed-gut div.e,.cal .ed-gut div.w{color:var(--fg)}
.cal .ed-gut div.e::before,.cal .ed-gut div.w::before{content:"";position:absolute;left:5px;top:6.5px;width:6px;height:6px;border-radius:3px;background:var(--red)}
.cal .ed-gut div.w::before{background:var(--amber)}
.cal .ed-code{position:relative;padding:6px 0}
.cal .ed-code pre,.cal .ed-code textarea{font-family:var(--mono);font-size:12.5px;line-height:19px;tab-size:4;-moz-tab-size:4;white-space:pre;margin:0;padding:0 24px 0 12px;border:0;font-variant-ligatures:none;letter-spacing:0;font-weight:400}
.cal .ed-code pre{color:var(--fg);pointer-events:none;position:relative;z-index:1}
.cal .ed-code textarea{position:absolute;left:0;top:6px;width:100%;height:calc(100% - 12px);resize:none;background:transparent;color:transparent;-webkit-text-fill-color:transparent;caret-color:var(--accent);outline:none;overflow:hidden;z-index:2}
.cal .ed-code textarea::selection{background:color-mix(in srgb,var(--accent) 28%,transparent)}
.cal .ed-band{position:absolute;left:0;right:0;pointer-events:none;z-index:0}
.cal .ed-band.sel{background:color-mix(in srgb,var(--amber) 9%,transparent);box-shadow:inset 3px 0 0 var(--amber)}
.cal .ed-band.e{background:color-mix(in srgb,var(--red) 16%,transparent)}
.cal .ed-band.w{background:color-mix(in srgb,var(--amber) 14%,transparent)}
.cal .hk{color:var(--violet)}.cal .ht{color:var(--az)}.cal .hf{color:var(--accent)}.cal .hs{color:var(--ay)}.cal .hn{color:var(--amber)}.cal .hc{color:var(--fg3);font-style:italic}.cal .hp{color:var(--ax)}
.cal .ftree,.cal .sres{font-family:var(--mono);font-size:12px}
.cal .fdir{color:var(--fg2);padding:5px 4px 3px;cursor:pointer;user-select:none;font-size:11.5px}
.cal .frow,.cal .srow{display:flex;align-items:center;gap:10px;padding:3px 6px 3px 20px;border-radius:4px;cursor:pointer;color:var(--fg2);min-width:0}
.cal .frow:hover,.cal .srow:hover{background:var(--bg3);color:var(--fg)}
.cal .frow.bin{cursor:default;opacity:.6}
.cal .frow .fk{font-size:9.5px;min-width:42px;color:var(--fg3);text-transform:uppercase;letter-spacing:.06em}
.cal .frow.code .fk{color:var(--accent)}
.cal .frow .fn{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cal .frow .fs{color:var(--fg3);font-size:10.5px}
.cal .frow .btn,.cal .srow .btn{opacity:0;padding:1px 6px}
.cal .frow:hover .btn,.cal .srow:hover .btn{opacity:1}
@media(hover:none){.cal .frow .btn,.cal .srow .btn{opacity:1}}
.cal .srow .ln{color:var(--fg3);min-width:52px;text-align:right;font-size:10.5px;font-variant-numeric:tabular-nums}
.cal .srow .tx{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:pre}
.cal .srow mark{background:color-mix(in srgb,var(--amber) 35%,transparent);color:var(--fg);border-radius:2px}
.cal .srow .tg{color:var(--accent);font-size:10.5px;white-space:nowrap}
.cal .srow.dg .sv{width:14px;text-align:center;font-weight:700}
.cal .srow.dg.error .sv{color:var(--red)}.cal .srow.dg.warning .sv{color:var(--amber)}.cal .srow.dg.note .sv{color:var(--fg3)}
.cal .srow.dg .tx{white-space:normal}
.cal pre.log{background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:8px 10px;font-family:var(--mono);font-size:11px;line-height:1.55;max-height:260px;overflow:auto;color:var(--fg2);margin-top:6px;white-space:pre}
.cal details.adv summary{cursor:pointer;font-family:var(--mono);font-size:11px;color:var(--fg3);letter-spacing:.06em}
.cal .tblwrap{overflow:auto;border:1px solid var(--border);border-radius:6px}
.cal .stbl{border-collapse:collapse;width:100%;font-family:var(--mono);font-size:11.5px}
.cal .stbl th{position:sticky;top:0;background:var(--bg3);color:var(--fg3);font-weight:500;text-transform:uppercase;letter-spacing:.08em;font-size:9.5px;text-align:left;padding:6px 8px;cursor:pointer;white-space:nowrap;border-bottom:1px solid var(--border)}
.cal .stbl td{padding:4px 8px;border-bottom:1px solid var(--bg3);white-space:nowrap;max-width:380px;overflow:hidden;text-overflow:ellipsis;color:var(--fg)}
.cal .stbl td b{font-weight:500}
.cal .stbl tr{cursor:pointer}.cal .stbl tbody tr:hover td{background:var(--bg3)}
.cal .xgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:8px}
.cal .xgrid .btn{display:flex;flex-direction:column;align-items:flex-start;gap:3px;text-align:left;padding:10px 12px;white-space:normal}
.cal .xgrid .btn small{font-size:10px;letter-spacing:0;text-transform:none;color:var(--fg3)}
.cal .modal .box.conn{width:min(820px,100%);overflow:auto;gap:4px}
.cal .conn section{border-top:1px solid var(--border);padding:14px 0 10px}
.cal .conn h4{font-size:14px;font-weight:600;margin-bottom:6px;display:flex;gap:8px;align-items:center}
.cal .conn p{margin-bottom:8px}
.cal .cmdline{display:flex;gap:8px;align-items:center;background:var(--bg);border:1px solid var(--border);border-radius:5px;padding:6px 8px;margin-bottom:8px}
.cal .cmdline code{flex:1;font-family:var(--mono);font-size:11.5px;color:var(--accent);overflow-x:auto;white-space:nowrap}
.cal .toast{position:absolute;left:50%;bottom:46px;transform:translateX(-50%);background:var(--bg2);border:1px solid var(--accent);color:var(--fg);font-family:var(--mono);font-size:11.5px;padding:8px 14px;border-radius:6px;z-index:80;box-shadow:0 8px 30px rgba(0,0,0,.35);max-width:min(640px,92vw);pointer-events:none}
.cal .toast.bad{border-color:var(--red);color:var(--red)}
.cal pre.src .l{cursor:pointer}.cal pre.src .l:hover{background:var(--bg3)}
.cal .chk{display:flex;align-items:center;gap:6px;font-family:var(--mono);font-size:11px;color:var(--fg2);cursor:pointer}
.cal .chk input{accent-color:var(--accent)}
@media(max-width:900px){.cal .center{grid-column:1}.cal .ed-bar .path{max-width:100%}}
.cal .stage canvas.ovl{pointer-events:none;cursor:default}
.cal .ldot{display:inline-block;width:7px;height:7px;border-radius:4px;background:var(--red);margin-right:6px;vertical-align:1px;animation:cal-blink 1s infinite}
@keyframes cal-blink{50%{opacity:.25}}
.cal .btn.stop{border-color:var(--red);color:var(--red);background:transparent}
.cal .run{display:flex;flex-direction:column;min-height:0;flex:1}
.cal .run-bar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:8px 10px;border-bottom:1px solid var(--border);flex-shrink:0}
.cal .run-st{font-family:var(--mono);font-size:11px;letter-spacing:.06em;color:var(--fg3)}
.cal .run-st.running{color:var(--accent)}.cal .run-st.building{color:var(--amber)}
.cal .run-grid{flex:1;min-height:0;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.15fr)}
.cal .run-con{display:flex;flex-direction:column;min-height:0;padding:8px 10px;border-right:1px solid var(--border);gap:6px}
.cal .run-con pre{flex:1;min-height:0;overflow:auto;background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:6px 8px;font-family:var(--mono);font-size:11.5px;line-height:1.5;color:var(--fg);white-space:pre-wrap;word-break:break-word}
.cal .o-err{color:var(--red)}.cal .o-build{color:var(--fg3)}.cal .o-sys{color:var(--amber)}.cal .o-in{color:var(--accent)}
.cal .run-side{display:flex;flex-direction:column;min-height:0;padding:8px 10px}
.cal .evlist{flex:1;min-height:0;overflow:auto;font-family:var(--mono);font-size:11.5px;border:1px solid var(--border);border-radius:6px;background:var(--bg)}
.cal .evr{display:flex;gap:8px;align-items:center;padding:2px 8px;white-space:nowrap;cursor:pointer;min-width:0}
.cal .evr:hover{background:var(--bg3)}
.cal .evr>span:last-child{overflow:hidden;text-overflow:ellipsis;min-width:0}
.cal .evr .ts{color:var(--fg3);font-size:10px;min-width:62px;text-align:right;font-variant-numeric:tabular-nums}
.cal .evr i,.cal .thr i{width:8px;height:8px;border-radius:4px;flex-shrink:0;display:inline-block}
.cal .evr.u,.cal .evr.x,.cal .evr.F{background:color-mix(in srgb,var(--red) 9%,transparent)}
.cal .evr.h{background:color-mix(in srgb,var(--amber) 7%,transparent)}
.cal .errc{margin:6px;padding:8px 10px;border:1px solid var(--border);border-left:3px solid var(--red);border-radius:0 6px 6px 0;cursor:pointer;background:var(--bg2)}
.cal .errc.warn{border-left-color:var(--amber)}
.cal .errc.fatal{border-color:var(--red);background:color-mix(in srgb,var(--red) 10%,var(--bg2))}
.cal .errc .eh{display:flex;gap:8px;align-items:center;font-size:10.5px;letter-spacing:.06em;text-transform:uppercase}
.cal .errc.bad .eh b,.cal .errc.fatal .eh b{color:var(--red)}.cal .errc.warn .eh b{color:var(--amber)}
.cal .errc .em{margin:4px 0;color:var(--fg);white-space:normal;word-break:break-word}
.cal .errc .ep{display:flex;flex-wrap:wrap;gap:4px}
.cal .chip{display:inline-block;border:1px solid var(--border);border-radius:3px;padding:0 6px;margin:2px 4px 2px 0;cursor:pointer;color:var(--accent);background:var(--bg2);font-family:var(--mono);font-size:11px}
.cal .chip:hover{border-color:var(--accent)}
.cal .chip.bad{color:var(--red)}.cal .chip.am{color:var(--amber)}
.cal .chip.top{border-color:var(--accent);background:color-mix(in srgb,var(--accent) 12%,var(--bg2))}
.cal .thr{padding:6px 8px;border-bottom:1px solid var(--bg3)}
.cal .thr .stk{margin-top:4px}
.cal .blk.live{background:color-mix(in srgb,var(--accent) 4%,var(--bg2))}
.cal .lcall{font-family:var(--mono);font-size:11px;color:var(--fg2);padding:2px 0;word-break:break-word}
.cal .lcall.bad{color:var(--red)}
.cal .metric.bad .mv{color:var(--red)}
.cal .dbg-bar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:6px 10px;border-bottom:1px solid var(--border);flex-shrink:0;font-family:var(--mono);font-size:11px}
.cal .dbg-bar.on{background:color-mix(in srgb,var(--amber) 9%,transparent)}
.cal .dbg-bar .seg button{padding:2px 7px;font-size:10.5px}
.cal .run-group{padding:8px 10px;border-bottom:1px solid var(--border);background:var(--bg2);flex-shrink:0;max-height:40%;overflow:auto}
.cal .rg-row{display:flex;gap:8px;align-items:center;padding:2px 0;min-height:28px}
.cal .rg-row.on .chk{color:var(--fg)}
.cal .runs{display:flex;gap:6px;flex-wrap:nowrap;overflow-x:auto;scrollbar-width:thin;padding:6px 10px;border-bottom:1px solid var(--border);flex-shrink:0}
.cal .rchip{flex-shrink:0;white-space:nowrap;display:inline-flex;gap:6px;align-items:center;border:1px solid var(--border);border-radius:14px;padding:2px 4px 2px 9px;font-family:var(--mono);font-size:11px;cursor:pointer;background:var(--bg2);color:var(--fg);min-height:26px}
.cal button.rchip{padding:2px 10px}
.cal .rchip i{width:8px;height:8px;border-radius:4px;display:inline-block}
.cal .rchip.on{border-color:var(--accent);background:color-mix(in srgb,var(--accent) 12%,var(--bg2))}
.cal .rchip.bad{border-color:color-mix(in srgb,var(--red) 60%,var(--border))}
.cal .rchip .mut{font-size:10px}
.cal .rchip .x{border:none;background:transparent;color:var(--red);cursor:pointer;font-size:11px;padding:2px 6px;border-radius:10px}
.cal .rchip .x:hover{background:color-mix(in srgb,var(--red) 15%,transparent)}
.cal .evr .rtag{font-size:10px;min-width:0;max-width:90px;overflow:hidden;text-overflow:ellipsis}
.cal .thr.paused{background:color-mix(in srgb,var(--amber) 8%,transparent);border-left:3px solid var(--amber)}
.cal .thr.paused.bp{background:color-mix(in srgb,var(--red) 8%,transparent);border-left-color:var(--red)}
.cal .thr.net{border-left:3px solid var(--violet)}
.cal .thr a{color:var(--accent);cursor:pointer;text-decoration:underline}
.cal .pvars{font-family:var(--mono);font-size:11px;margin-top:4px;color:var(--fg2);word-break:break-word}
.cal .pvars .pv{display:flex;flex-wrap:wrap;gap:4px 12px;margin-top:2px}
.cal .pvars .pv b{color:var(--fg)}
.cal .det.paused{border-left-color:var(--amber);margin-bottom:8px}.cal .det.paused.bp{border-left-color:var(--red)}
.cal .det.paused>b{color:var(--amber)}.cal .det.paused.bp>b{color:var(--red)}
.cal .btn.bpon{border-color:var(--red);color:var(--red)}
.cal .btn.on{border-color:var(--accent);color:var(--accent)}
@media(max-width:900px){.cal .run-grid{grid-template-columns:1fr}.cal .run-con{border-right:none;border-bottom:1px solid var(--border);max-height:45%}}
@media(max-width:1100px){.cal .main{--rw:300px;--lw:250px}}
@media(max-width:900px){
  .cal .main{grid-template-columns:minmax(0,1fr)}
  .cal .side{position:absolute;top:0;bottom:0;z-index:20;width:min(330px,88vw);transition:transform .25s ease;box-shadow:0 10px 40px rgba(0,0,0,.35)}
  .cal .side.l{left:0;transform:translateX(-102%)}
  .cal .side.r{right:0;transform:translateX(102%)}
  .cal .side.open{transform:none}
  .cal .stage{grid-column:1}
  .cal .minimap{width:150px;height:96px}
  .cal .ladder .h{display:none}
  .cal .hide-n{display:none}
}
/* ---------- Vibe: linke Leiste mit Reitern ---------- */
.cal .side.l{display:flex;flex-direction:column;overflow:hidden}
.cal .side-tabs{display:flex;border-bottom:1px solid var(--border);flex-shrink:0;background:var(--bg2)}
.cal .side-tabs button{flex:1;font-family:var(--mono);font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--fg3);background:none;border:none;border-bottom:2px solid transparent;padding:11px 8px 9px;cursor:pointer;white-space:nowrap}
.cal .side-tabs button:hover{color:var(--fg2)}
.cal .side-tabs button.on{color:var(--accent);border-bottom-color:var(--accent)}
.cal .side-body{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain}
.cal .side-body::-webkit-scrollbar{width:8px}.cal .side-body::-webkit-scrollbar-thumb{background:var(--border);border-radius:4px}
.cal .vd,.cal .chgbar,.cal .chg-grid,.cal .perm{--new:var(--ay);--chg:var(--amber);--del:var(--red)}
.cal .vd .ok,.cal .chgbar .ok,.cal .chg-grid .ok,.cal .perm .ok{color:var(--new)}
.cal .vd .bad,.cal .chgbar .bad,.cal .chg-grid .bad,.cal .perm .bad{color:var(--red)}
.cal .vd .am,.cal .chgbar .am,.cal .chg-grid .am{color:var(--amber)}
.cal .vd .mut,.cal .chgbar .mut,.cal .chg-grid .mut,.cal .perm .mut{color:var(--fg3)}
.cal .spin{display:inline-block;width:9px;height:9px;border-radius:50%;border:2px solid color-mix(in srgb,var(--accent) 30%,transparent);border-top-color:var(--accent);animation:cal-spin .8s linear infinite;vertical-align:-1px;flex-shrink:0}
@keyframes cal-spin{to{transform:rotate(360deg)}}
.cal .dot.wk{background:var(--amber);animation:cal-blink 1s infinite}
.cal .ldot.ai{background:var(--accent)}
/* ---------- Vibe: KI-Leiste ---------- */
.cal .vd{flex:1;min-height:0;display:flex;flex-direction:column;font-size:13px}
.cal .vd-h{display:flex;align-items:center;gap:7px;padding:9px 12px;border-bottom:1px solid var(--border);font-family:var(--mono);font-size:11.5px;flex-shrink:0}
.cal .vd-h b{color:var(--fg);font-weight:600;white-space:nowrap}.cal .vd-h .dot{margin-right:0;flex-shrink:0}
.cal .vd-h .mut{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}.cal .vd-h .btn{flex-shrink:0}
.cal .vd-cfg{padding:10px 12px;border-bottom:1px solid var(--border);display:flex;flex-direction:column;gap:8px;background:var(--bg3);flex-shrink:0;max-height:55%;overflow:auto}
.cal .vd-cfg .chk{flex-wrap:wrap}.cal .vd-cfg .chk .hint{flex-basis:100%;padding-left:20px;font-size:10.5px}
.cal .vd-cfg .ln{display:flex;align-items:center;gap:8px;font-family:var(--mono);font-size:11px;color:var(--fg2)}
.cal .cfg-hook{border-top:1px solid var(--border);padding-top:9px;display:flex;flex-direction:column;gap:7px}
.cal .cfg-sec{border-top:1px solid var(--border);padding-top:9px;display:flex;flex-direction:column;gap:7px}
.cal .cfg-sec .cl{margin-bottom:0}
.cal .cfg-hook .cl{margin-bottom:0}
.cal .vd code,.cal .perm code{font-family:var(--mono);font-size:.92em;background:var(--bg3);border:1px solid var(--border);border-radius:3px;padding:0 4px;color:var(--fg)}
.cal .vd-feed{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:4px 0 10px}
.cal .vd-feed::-webkit-scrollbar{width:8px}.cal .vd-feed::-webkit-scrollbar-thumb{background:var(--border);border-radius:4px}
.cal .vd-empty,.cal .vd-intro{padding:16px 14px;color:var(--fg2);line-height:1.55}
.cal .vd-empty b{color:var(--fg);font-weight:600}.cal .vd-empty p,.cal .vd-intro p{margin:8px 0}
.cal .vd-intro h3{font-size:19px;font-weight:600;letter-spacing:-.01em;margin:6px 0 4px;color:var(--fg)}
.cal .vd-intro .steps{margin:0 0 10px;padding-left:20px;display:flex;flex-direction:column;gap:8px}
.cal .vd-intro .cl{margin:14px 0 8px}
.cal .vd .lg{display:flex;align-items:center;gap:6px;font-family:var(--mono);font-size:11px;color:var(--fg2);margin:5px 0}
.cal .vd .lg i{width:10px;height:10px;border-radius:2px;display:inline-block;margin-left:8px}.cal .vd .lg i:first-child{margin-left:0}
.cal .vt{padding:10px 12px 8px;border-bottom:1px solid var(--border)}
.cal .vt.open{background:color-mix(in srgb,var(--accent) 4%,transparent)}
.cal .vt-h{display:flex;align-items:center;gap:8px;font-family:var(--mono);font-size:10.5px;letter-spacing:.06em;color:var(--fg3);text-transform:uppercase}
.cal .vt-h .n{color:var(--accent);font-weight:600}.cal .vt-h .who{color:var(--fg2)}
.cal .vt-h .tag{padding:1px 6px;font-size:9.5px}.cal .vt-h .tag.m-plan{border-color:var(--accent2);color:var(--accent2)}.cal .vt-h .tag.m-ask{border-color:var(--violet);color:var(--violet)}
.cal .vt-p{margin:7px 0 6px;padding:8px 10px;background:var(--bg3);border-left:3px solid var(--accent);border-radius:0 5px 5px 0;color:var(--fg);white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.5;max-height:180px;overflow:auto}
.cal .vi{margin:3px 0;min-width:0}
.cal .vi.sub{margin-left:14px;border-left:1px solid var(--border);padding-left:8px}
.cal .vi.say{color:var(--fg2);line-height:1.55;margin:7px 0;overflow-wrap:anywhere}
.cal .md .gap{height:7px}.cal .md .mh{font-weight:600;color:var(--fg);margin-top:4px}
.cal .md .mli{position:relative}.cal .md .mli .bu{position:absolute;margin-left:-14px;color:var(--accent);font-family:var(--mono);font-size:.9em}
.cal .md b{color:var(--fg);font-weight:600}.cal .md .mli.num .bu{margin-left:-24px}
.cal .vt-p .ctx{display:block;font-family:var(--mono);font-size:10.5px;color:var(--fg3);margin-bottom:5px;white-space:normal}
.cal .vi-h{display:flex;align-items:center;gap:7px;font-family:var(--mono);font-size:11.5px;padding:3px 5px;border-radius:4px;cursor:pointer;min-width:0;color:var(--fg2)}
.cal .vi-h:hover{background:var(--bg3)}
.cal .vi .ic{width:15px;text-align:center;flex-shrink:0;color:var(--fg3)}
.cal .vi.k-read .ic,.cal .vi.k-read .vb{color:var(--accent2)}.cal .vi.k-search .ic,.cal .vi.k-search .vb{color:var(--az)}
.cal .vi.k-edit .ic,.cal .vi.k-edit .vb,.cal .vi.k-write .ic,.cal .vi.k-write .vb{color:var(--amber)}.cal .vi.k-run .ic,.cal .vi.k-run .vb{color:var(--violet)}
.cal .vi .vb{flex-shrink:0}
.cal .vi .tg{color:var(--fg);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.cal .vi .tg i{color:var(--fg3);font-style:normal}
.cal .vi .dt{color:var(--fg3);font-size:10.5px;white-space:nowrap;flex-shrink:0}
.cal .vi .st{font-size:10.5px;white-space:nowrap;flex-shrink:0}
.cal .vi.bad .tg{color:var(--red)}
.cal .xp{background:none;border:none;color:var(--fg3);cursor:pointer;font-size:11px;padding:0 3px;flex-shrink:0;font-family:var(--mono)}.cal .xp:hover{color:var(--accent)}
.cal .vi-b{margin:3px 0 6px 22px;display:flex;flex-direction:column;gap:5px;min-width:0}
.cal .vcode,.cal .mdiff{font-family:var(--mono);font-size:11px;line-height:1.5;background:var(--bg);border:1px solid var(--border);border-radius:5px;padding:6px 8px;margin:0;max-height:230px;overflow:auto;white-space:pre;color:var(--fg2);tab-size:4}
.cal .vcode.cmd{color:var(--violet);white-space:pre-wrap;overflow-wrap:anywhere}.cal .vcode.out{white-space:pre-wrap;overflow-wrap:anywhere}.cal .vcode.bad{color:var(--red)}
.cal .mdiff .add{color:var(--ay);background:color-mix(in srgb,var(--ay) 11%,transparent);display:block}
.cal .mdiff .del{color:var(--red);background:color-mix(in srgb,var(--red) 11%,transparent);display:block}
.cal .vi.note{font-family:var(--mono);font-size:11px;color:var(--fg3);padding:2px 5px;overflow-wrap:anywhere}.cal .vi.note.warn{color:var(--amber)}.cal .vi.note.ok{color:var(--ay)}.cal .vi.note.err{color:var(--red)}
.cal .vi.chg{display:flex;gap:7px;align-items:flex-start;padding:2px 5px;font-family:var(--mono);font-size:11px}
.cal .vi.chg .ic{color:var(--ay);font-weight:700}.cal .vi.chg .cl2{display:flex;flex-wrap:wrap;gap:4px;align-items:center;min-width:0}
.cal .vd .chip,.cal .chg-grid .chip{margin:0;font-size:10.5px}
.cal .vd .chip.new{color:var(--ay);border-color:color-mix(in srgb,var(--ay) 45%,var(--border))}.cal .vd .chip.chg{color:var(--amber);border-color:color-mix(in srgb,var(--amber) 45%,var(--border))}.cal .vd .chip.del{color:var(--red);border-color:color-mix(in srgb,var(--red) 45%,var(--border));text-decoration:line-through}
.cal .todos{font-family:var(--mono);font-size:11px;color:var(--fg2);display:flex;flex-direction:column;gap:2px}.cal .todos .completed{color:var(--fg3)}.cal .todos .in_progress{color:var(--accent)}
.cal .vt-s{display:flex;align-items:center;gap:8px;font-family:var(--mono);font-size:11px;color:var(--accent);padding:6px 5px 2px}
.cal .vt-e{display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-family:var(--mono);font-size:10.5px;color:var(--fg3);padding:7px 5px 2px;border-top:1px dashed var(--border);margin-top:6px}
.cal .vt-e .acts{display:flex;gap:12px;margin-left:auto}
.cal .vt-e>span:first-child{font-weight:600}.cal .vt-e.ok>span:first-child{color:var(--ay)}.cal .vt-e.bad>span:first-child{color:var(--red)}
.cal .lnk{background:none;border:none;color:var(--accent);font-family:var(--mono);font-size:10.5px;cursor:pointer;padding:0;letter-spacing:.04em}.cal .lnk:hover{text-decoration:underline}
.cal .vt .row{margin-top:8px}
.cal .perm{margin:0;padding:10px 12px;border-top:2px solid var(--amber);background:color-mix(in srgb,var(--amber) 7%,var(--bg2));display:flex;flex-direction:column;gap:7px;flex-shrink:0;max-height:48%;overflow:auto}
.cal .perm .kicker{color:var(--amber)}.cal .perm .pw{font-size:13px;color:var(--fg2);overflow-wrap:anywhere}.cal .perm .pw b{color:var(--fg)}
.cal .vd-in{border-top:1px solid var(--border);padding:9px 12px 11px;display:flex;flex-direction:column;gap:7px;flex-shrink:0;background:var(--bg2)}
.cal .vd-sum{background:var(--bg3);border:1px solid var(--border);border-radius:5px;padding:6px 9px;font-family:var(--mono);font-size:11px;color:var(--fg2);cursor:pointer;text-align:left}
.cal .vd-sum:hover{border-color:var(--accent)}.cal .vd-sum b{font-weight:600}
.cal .seg.modes{align-self:flex-start}.cal .seg.modes button{padding:6px 9px;font-size:10px}
.cal .vd-ta{resize:none;min-height:54px;line-height:1.5;font-family:var(--sans);font-size:13.5px}
.cal .vd-in{position:relative}
.cal .vd-in.drag{outline:2px dashed var(--accent);outline-offset:-4px}
.cal .vd-drop{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:color-mix(in srgb,var(--bg2) 88%,transparent);color:var(--accent);font-family:var(--mono);font-size:11px;letter-spacing:.1em;text-transform:uppercase;z-index:3;pointer-events:none}
.cal .att{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}
.cal .vd-in>.att{margin-top:0}
.cal .att-c{display:inline-flex;align-items:center;gap:6px;max-width:100%;padding:3px 6px 3px 3px;border:1px solid var(--border);border-radius:6px;background:var(--bg3);font-family:var(--mono);font-size:10.5px;color:var(--fg2);white-space:nowrap}
.cal .att-c img{width:34px;height:34px;object-fit:cover;border-radius:4px;display:block}
.cal .att-c .ic{width:34px;height:34px;display:flex;align-items:center;justify-content:center;border-radius:4px;background:var(--surface);color:var(--accent2);font-size:9px;letter-spacing:.06em}
.cal .att-c .nm{overflow:hidden;text-overflow:ellipsis;max-width:150px}
.cal .att-c.bad{border-color:var(--red);color:var(--red)}
.cal .att-c.busy{opacity:.7}
.cal .att-c .xp{background:none;border:none;color:var(--fg3);cursor:pointer;padding:0 2px;font-size:11px}
.cal .att-c .xp:hover{color:var(--red)}
.cal .vd-in .btn.icon{padding:0 9px;font-size:14px;letter-spacing:0;text-transform:none}
.cal .vi.usr{margin:8px 0 4px 18px}
.cal .vi.usr .vt-p{border-left-color:var(--violet);margin:0}
.cal .vi.usr .us{display:block;font-family:var(--mono);font-size:10px;color:var(--fg3);margin-top:3px}
.cal .vi.usr.ack .us{color:var(--accent)}
.cal .vi.usr.queued .us{color:var(--amber)}
.cal .sk-pop{position:absolute;left:10px;right:10px;bottom:calc(100% - 4px);z-index:8;background:var(--bg2);border:1px solid var(--border);border-radius:8px;box-shadow:0 -10px 30px rgba(0,0,0,.35);display:flex;flex-direction:column;max-height:min(420px,60vh)}
.cal .sk-h{display:flex;gap:6px;padding:8px;border-bottom:1px solid var(--border)}
.cal .sk-h .txt{flex:1;min-width:0;height:30px}
.cal .sk-l{overflow:auto;padding:4px 0;flex:1;min-height:60px}
.cal .sk-g{font-family:var(--mono);font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--fg3);padding:8px 12px 3px}
.cal .sk-r{position:relative;padding:6px 34px 6px 12px;cursor:pointer;border-left:2px solid transparent}
.cal .sk-r.hi{background:var(--bg3);border-left-color:var(--accent)}
.cal .sk-r.off{opacity:.55}
.cal .sk-n{font-family:var(--mono);font-size:11.5px;color:var(--fg)}
.cal .sk-n b{font-weight:500;color:var(--accent)}
.cal .sk-n .tag{margin-left:6px;font-size:9px;padding:0 5px;border:1px solid var(--border);border-radius:3px;color:var(--fg3);text-transform:uppercase;letter-spacing:.08em}
.cal .sk-n .tag.am{color:var(--amber);border-color:var(--amber)}
.cal .sk-d{font-size:11.5px;color:var(--fg2);line-height:1.35;margin-top:2px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.cal .sk-ed{position:absolute;right:8px;top:6px;background:none;border:1px solid transparent;border-radius:4px;color:var(--fg3);cursor:pointer;font-size:12px;padding:1px 5px}
.cal .sk-ed:hover{color:var(--accent);border-color:var(--border)}
.cal .sk-e{padding:14px 12px;font-size:12px}
.cal .sk-f{display:flex;align-items:center;gap:10px;padding:8px;border-top:1px solid var(--border);font-family:var(--mono);font-size:10px}
.cal .att-c.sk{padding:3px 6px 3px 3px;border-color:color-mix(in srgb,var(--accent) 50%,var(--border))}
.cal .att-c.sk .ic{width:22px;height:22px;color:var(--accent);font-size:12px}
.cal .att-c.sk .nm{color:var(--accent)}
.cal .vd-in .btn.sk-btn{font-family:var(--mono);font-size:13px}
.cal .vd-in .btn.sk-btn.on{color:var(--accent);border-color:var(--accent)}
.cal .modal.skdlg{position:fixed}
.cal .modal.skdlg .box{gap:8px;overflow:auto}
.cal .modal.skdlg .lbl{font-size:11px;color:var(--fg2);margin-top:4px}
.cal .modal.skdlg textarea{min-height:240px}
.cal .modal.skdlg .txt.bad{border-color:var(--red)}
.cal .modal.skdlg .sk-path{font-family:var(--mono);font-size:10.5px;overflow-wrap:anywhere}
.cal .vd-mrow{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
.cal .vd-model{height:28px;font-family:var(--mono);font-size:10.5px;padding:0 6px;max-width:170px;flex:1 1 110px}
.cal .vt-h .mdl{font-family:var(--mono);font-size:9.5px;color:var(--fg3);border:1px solid var(--border);border-radius:3px;padding:0 5px}
.cal .acc .acc-who{display:flex;flex-direction:column;gap:2px;font-size:12px}
.cal .acc .acc-who b{font-weight:600;color:var(--fg);overflow-wrap:anywhere}
.cal .acc .row{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.cal .acc .row .txt{flex:1;min-width:120px;height:28px}
.cal .acc .seg.sm button{padding:0 8px;height:26px;font-size:10px}
.cal .acc-login{display:flex;flex-direction:column;gap:7px}
.cal .acc-login a.btn{align-self:flex-start;text-decoration:none}
.cal .acc-log{margin:0;font-family:var(--mono);font-size:10px;color:var(--fg3);white-space:pre-wrap;overflow-wrap:anywhere;max-height:80px;overflow:auto;background:var(--bg3);padding:6px;border-radius:4px}
.cal .pip{width:min(380px,calc(100vw - 40px));height:250px;display:flex;flex-direction:column;background:var(--bg);border:1px solid var(--pc);border-radius:8px;overflow:hidden;box-shadow:0 8px 28px rgba(0,0,0,.45);animation:calPipIn .18s ease-out}
.cal .pip.done{border-color:var(--border);opacity:.85}
@keyframes calPipIn{from{transform:translateY(10px);opacity:0}to{transform:none;opacity:1}}
.cal .pip-h{display:flex;align-items:center;gap:7px;padding:5px 6px 5px 9px;background:var(--bg2);border-bottom:1px solid var(--border);font-family:var(--mono);font-size:10.5px;color:var(--fg)}
.cal .pip-h .dot{width:7px;height:7px;border-radius:50%;background:var(--pc);flex-shrink:0;animation:calPulse 1.1s ease-in-out infinite}
.cal .pip.done .pip-h .dot{animation:none;opacity:.5}
@keyframes calPulse{50%{opacity:.35}}
.cal .pip-t{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cal .pip-b{background:none;border:1px solid transparent;border-radius:4px;color:var(--fg3);cursor:pointer;font-size:11px;padding:1px 5px}
.cal .pip-b:hover{color:var(--accent);border-color:var(--border)}
.cal .pip-v{position:relative;flex:1;cursor:pointer}
.cal .pip-v canvas{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
.cal .pip-e{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:11px}
.cal .pip-mini{position:absolute;left:-9999px;top:0;width:120px;height:80px;visibility:hidden;pointer-events:none}
@media(max-width:760px){.cal .pip{display:none}}
.cal .vd-ctx{font-family:var(--mono);font-size:10.5px;color:var(--fg3);display:flex;align-items:center;gap:5px;min-width:0}
.cal .vd-ctx b{color:var(--accent);font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cal .vd-in .row .hint{flex:1;min-width:0;font-size:10.5px;line-height:1.35}
/* ---------- Vibe: Leiste über dem Diagramm ---------- */
.cal .chgbar{position:absolute;left:12px;top:46px;right:12px;display:flex;align-items:center;gap:6px;flex-wrap:wrap;z-index:5;pointer-events:none;font-family:var(--mono);font-size:10.5px}
.cal .chgbar>*{pointer-events:auto;background:color-mix(in srgb,var(--bg2) 92%,transparent);border:1px solid var(--border);border-radius:4px;padding:4px 8px;color:var(--fg2);white-space:nowrap;backdrop-filter:blur(6px)}
.cal .chgbar .ai{border-color:var(--accent);color:var(--accent);display:flex;align-items:center;gap:7px;max-width:min(520px,100%);overflow:hidden;text-overflow:ellipsis}
.cal .chgbar .lbl{cursor:pointer;font-family:var(--mono);font-size:10.5px;color:var(--fg);max-width:260px;overflow:hidden;text-overflow:ellipsis}.cal .chgbar .lbl:hover{border-color:var(--accent)}
.cal .chgbar .c i{display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:5px;vertical-align:-1px}
.cal .chgbar .c.new{color:var(--new);border-color:color-mix(in srgb,var(--new) 40%,var(--border))}.cal .chgbar .c.new i{background:var(--new)}
.cal .chgbar .c.chg{color:var(--chg);border-color:color-mix(in srgb,var(--chg) 40%,var(--border))}.cal .chgbar .c.chg i{background:var(--chg)}
.cal .chgbar .c.del{color:var(--del);border-color:color-mix(in srgb,var(--del) 40%,var(--border))}.cal .chgbar .c.del i{background:var(--del)}
.cal .chgbar .tg{cursor:pointer;font-family:var(--mono);font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:var(--fg3)}
.cal .chgbar .tg:hover{color:var(--fg2)}.cal .chgbar .tg.on{color:var(--accent);border-color:var(--accent)}
/* ---------- Vibe: Änderungen (Konsole) ---------- */
.cal .chg-grid{flex:1;min-height:0;display:grid;grid-template-columns:minmax(300px,42%) minmax(0,1fr)}
.cal .chg-l{overflow:auto;border-right:1px solid var(--border);overscroll-behavior:contain;padding-bottom:10px;min-width:0}
.cal .chg-top{padding:9px 12px;display:flex;flex-direction:column;gap:7px;border-bottom:1px solid var(--border)}
.cal .chg-l .cl{margin:11px 12px 5px}.cal .chg-l .cl b{font-weight:600}
.cal .cr{display:flex;align-items:center;gap:7px;padding:3px 12px;font-family:var(--mono);font-size:11.5px;color:var(--fg2);cursor:pointer;min-width:0;white-space:nowrap}
.cal .cr:hover,.cal .cr.on{background:var(--bg3);color:var(--fg)}
.cal .cr.sub{padding-left:30px;font-size:11px}
.cal .cr .sg{width:11px;text-align:center;font-weight:700;flex-shrink:0}
.cal .cr.new .sg,.cal .cr.new>b{color:var(--new)}.cal .cr.chg .sg,.cal .cr.chg>b{color:var(--chg)}.cal .cr.del .sg{color:var(--del)}.cal .cr.del>b,.cal .cr.del>span:nth-child(2){color:var(--del);text-decoration:line-through}
.cal .cr b{font-weight:600}.cal .cr .fp{overflow:hidden;text-overflow:ellipsis;min-width:0}
.cal .cr.lk .lf,.cal .cr.lk .lt{overflow:hidden;text-overflow:ellipsis;min-width:0}.cal .cr.lk i{font-style:normal;color:var(--fg3)}.cal .cr.lk i:not(:empty)::after{content:"."}
.cal .lkind{font-size:10px;color:var(--fg3);border:1px solid var(--border);border-radius:3px;padding:0 5px;flex-shrink:0}
.cal .lkind.k-call{color:var(--az)}.cal .lkind.k-write{color:var(--amber)}.cal .lkind.k-read{color:var(--ay)}
.cal .chg-r{min-width:0;min-height:0;display:flex;flex-direction:column}
.cal .dv{flex:1;min-height:0;display:flex;flex-direction:column}
.cal .dv-h{display:flex;align-items:center;gap:9px;padding:7px 12px;border-bottom:1px solid var(--border);font-family:var(--mono);font-size:11.5px;flex-wrap:wrap}
.cal .dv-h b{color:var(--fg);font-weight:600;overflow:hidden;text-overflow:ellipsis}
.cal .dv-b{flex:1;min-height:0;overflow:auto;font-family:var(--mono);font-size:11.5px;line-height:18px;overscroll-behavior:contain;padding:4px 0 12px}
.cal .dv-b .hint{padding:8px 12px}
.cal .dl{display:flex;white-space:pre;min-width:max-content}
.cal .dl .no{width:44px;text-align:right;color:var(--fg3);padding-right:8px;flex-shrink:0;font-variant-numeric:tabular-nums;user-select:none;font-size:10.5px}
.cal .dl .sg{width:16px;text-align:center;flex-shrink:0;user-select:none;color:var(--fg3)}
.cal .dl .tx{color:var(--fg2);padding-right:16px;tab-size:4}
.cal .dl.add{background:color-mix(in srgb,var(--ay) 12%,transparent)}.cal .dl.add .tx,.cal .dl.add .sg{color:var(--ay)}
.cal .dl.del{background:color-mix(in srgb,var(--red) 11%,transparent)}.cal .dl.del .tx,.cal .dl.del .sg{color:var(--red)}
.cal .dv-gap{color:var(--fg3);font-size:10.5px;padding:3px 12px;background:var(--bg3);border-top:1px solid var(--border);border-bottom:1px solid var(--border);margin:3px 0}
.cal .btn:disabled{opacity:.45;cursor:default;pointer-events:none}
@media(min-width:901px){.cal .main.ki{--lw:372px}.cal .main.ki .chgbar .ai{display:none}}
@media(min-width:901px) and (max-width:1250px){.cal .main.ki{--lw:320px}}
@media(max-width:900px){.cal .chg-grid{grid-template-columns:1fr;grid-template-rows:minmax(0,45%) minmax(0,1fr)}.cal .chg-l{border-right:none;border-bottom:1px solid var(--border)}.cal .chgbar{top:44px}.cal .side.l{width:min(400px,94vw)}}

/* Rechte Leiste: Abschnitte und ganze Leiste einklappbar */
.cal .side.r>.blk>.cl.tgl{cursor:pointer;user-select:none;margin-left:-4px;margin-right:-4px;padding:2px 4px;border-radius:4px}
.cal .side.r>.blk>.cl.tgl:hover{color:var(--fg2);background:var(--bg3)}
.cal .side.r>.blk>.cl.tgl:focus-visible{outline:1px solid var(--accent);outline-offset:1px}
.cal .side.r>.blk>.cl.tgl>span:first-child::before{content:"▾";display:inline-block;width:12px;margin-right:4px;transition:transform .15s;color:var(--fg3)}
.cal .side.r>.blk.fold>.cl.tgl>span:first-child::before{transform:rotate(-90deg)}
.cal .side.r>.blk.fold{padding-bottom:5px}
.cal .side.r>.blk.fold>.cl{margin-bottom:4px}
.cal .side.r>.blk.fold>:not(.cl){display:none!important}
@media(min-width:901px){
  .cal .main.rfold{--rw:0px}
  .cal .main.rfold>.side.r{display:none}
  .cal .rtog{position:absolute;top:8px;right:calc(var(--rw,340px) + 8px);z-index:6;font-family:var(--mono);font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--fg2);background:var(--bg2);border:1px solid var(--border);border-radius:6px;height:26px;min-width:26px;padding:0 8px;cursor:pointer}
  .cal .rtog:hover{color:var(--accent);border-color:var(--accent)}
  .cal .rtog.on{color:var(--accent)}
}
.cal .rtog{display:none}
@media(min-width:901px){.cal .rtog{display:block}}
/* ---------- Tests im Atlas ---------- */
.cal .tt{display:flex;flex-direction:column;gap:8px;padding:8px 12px 16px;font-size:12.5px}
.cal .tt-bar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;position:sticky;top:0;background:var(--bg);padding:2px 0 6px;z-index:2}
.cal .tt-bar .sp{flex:1}
.cal .tt-f{background:var(--bg2);border:1px solid var(--border);color:var(--fg);border-radius:5px;padding:5px 8px;font:12px var(--mono);min-width:180px}
.cal .tt-f:focus{outline:none;border-color:var(--accent)}
.cal .tt-cb{display:flex;align-items:center;gap:5px;font:11px var(--mono);color:var(--fg2);cursor:pointer}
.cal .tt-sum{display:flex;gap:10px;font:600 12px var(--mono);font-variant-numeric:tabular-nums}
.cal .tt .ok{color:var(--accent)}.cal .tt .bad{color:var(--red)}.cal .tt .mut{color:var(--fg3)}
.cal .tt-info{font:11px var(--mono)}
.cal .tt-empty{border:1px dashed var(--border);border-radius:8px;padding:12px 14px;line-height:1.55;color:var(--fg2)}
.cal .tt-empty p{margin:0 0 6px}.cal .tt code,.cal .td code{font-family:var(--mono);font-size:11.5px;background:var(--bg3);padding:1px 5px;border-radius:3px;color:var(--fg)}
.cal .tt-run{border:1px solid var(--border);border-radius:8px;background:var(--bg2);overflow:hidden}
.cal .tt-rh{display:flex;align-items:center;gap:8px;padding:7px 10px;border-bottom:1px solid var(--border);background:var(--bg3);font-size:12px}
.cal .tt-rh .sp{flex:1}.cal .tt-rh .mut{font:11px var(--mono)}
.cal .tt-cov{display:flex;align-items:center;gap:7px;background:none;border:1px solid var(--border);border-radius:5px;padding:2px 8px;color:var(--fg2);font:11px var(--mono);cursor:pointer}
.cal .tt-cov:hover,.cal .tt-cov.on{border-color:var(--accent);color:var(--fg)}
.cal .tt-cov .bar{width:54px;height:5px;border-radius:3px;background:var(--border);overflow:hidden}.cal .tt-cov .bar span{display:block;height:100%;background:var(--accent)}
.cal .tt-t{border-bottom:1px solid var(--bg3)}.cal .tt-t:last-child{border-bottom:0}
.cal .tt-row{display:flex;align-items:center;gap:8px;padding:5px 10px;cursor:pointer;font-family:var(--mono);font-size:12px}
.cal .tt-row:hover{background:var(--bg3)}.cal .tt-t.on>.tt-row{background:rgba(0,212,170,.08);box-shadow:inset 3px 0 0 var(--accent)}
.cal .tt-row .ic{width:14px;text-align:center;font-weight:700}.cal .tt-row .sp{flex:1}
.cal .tt-row .nm{color:var(--fg)}.cal .tt-row .fl{font-size:10.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.cal .tt-row .ms{font-size:10.5px;font-variant-numeric:tabular-nums}.cal .tt-row .et{font-size:10.5px;color:var(--red);border:1px solid var(--red);border-radius:3px;padding:0 5px}
.cal .tt-t.s-passed .ic{color:var(--accent)}.cal .tt-t.s-failed .ic,.cal .tt-t.s-error .ic{color:var(--red)}.cal .tt-t.s-skipped .ic,.cal .tt-t.s-queued .ic{color:var(--fg3)}
.cal .tt-t.s-failed .nm,.cal .tt-t.s-error .nm{color:var(--red)}.cal .tt-t.s-skipped .nm{color:var(--fg3)}
.cal .td{padding:4px 12px 10px 32px;display:flex;flex-direction:column;gap:6px}
.cal .td-m{margin:0;white-space:pre-wrap;font:12px var(--mono);color:var(--red);background:rgba(245,101,101,.07);border-left:3px solid var(--red);padding:6px 9px;border-radius:0 4px 4px 0;max-height:180px;overflow:auto}
.cal .td-m.mut{color:var(--fg3);border-color:var(--border);background:var(--bg3)}
.cal .td-l{display:flex;align-items:baseline;gap:7px;flex-wrap:wrap;font-size:12px}
.cal .td-l .lab{font:10px var(--mono);letter-spacing:.1em;text-transform:uppercase;color:var(--fg3);min-width:150px}
.cal .td-l .fn{font:11px var(--mono);color:var(--fg2)}
.cal .td-v{flex-basis:100%;margin-left:157px;display:flex;flex-wrap:wrap;gap:4px 12px;font:11px var(--mono);color:var(--fg2)}.cal .td-v b{color:var(--violet);font-weight:500}
.cal .lnk{background:none;border:0;padding:0;color:var(--accent2);font:12px var(--mono);cursor:pointer;text-decoration:underline dotted}
.cal .lnk:hover{color:var(--accent)}
.cal .td .chip,.cal .tt-miss .chip{background:var(--bg3);border:1px solid var(--border);border-radius:4px;color:var(--fg);font:11px var(--mono);padding:1px 7px;cursor:pointer}
.cal .td .chip:hover,.cal .tt-miss .chip:hover{border-color:var(--accent)}
.cal .td .chip.ran i{color:var(--fg3);font-style:normal}.cal .tt-miss .chip.miss{border-style:dashed;color:var(--amber)}
.cal .tt-miss{padding:7px 10px;border-bottom:1px solid var(--border)}
.cal .td-o{margin:0;white-space:pre-wrap;font:11px var(--mono);color:var(--fg2);background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:6px 8px;max-height:160px;overflow:auto}
.cal .td-o.bad{color:var(--red);margin:8px 10px}
.cal .dtab .cnt.ok{background:rgba(0,212,170,.18);color:var(--accent)}
@media(max-width:760px){.cal .td{padding-left:12px}.cal .td-l .lab{min-width:0;flex-basis:100%}.cal .td-v{margin-left:0}}

.cal .tt-reg{font:600 11px var(--mono);border:1px solid currentColor;border-radius:4px;padding:1px 7px}
.cal .tt-row .rg{font:700 9.5px var(--mono);letter-spacing:.08em;border-radius:3px;padding:1px 5px}
.cal .tt-row .rg.b{background:var(--red);color:var(--bg)}.cal .tt-row .rg.f{background:var(--accent);color:var(--bg)}
.cal .tt-re{background:none;border:1px solid transparent;border-radius:4px;color:var(--fg3);font-size:10px;padding:1px 6px;cursor:pointer;opacity:0}
.cal .tt-row:hover .tt-re,.cal .tt-re:focus-visible{opacity:1}.cal .tt-re:hover{color:var(--accent);border-color:var(--accent)}
.cal .tt-t.old>.tt-row .nm,.cal .tt-t.old>.tt-row .ic{opacity:.62}
@media(hover:none){.cal .tt-re{opacity:1}}
/* ---------- Projekt öffnen ---------- */
.cal .popen{width:min(720px,calc(100vw - 32px));max-height:calc(100vh - 48px);overflow:auto;display:flex;flex-direction:column;gap:10px}
.cal .popen section{border-top:1px solid var(--border);padding-top:10px}
.cal .popen h4{margin:0 0 8px;font:500 10.5px var(--mono);letter-spacing:.14em;text-transform:uppercase;color:var(--fg3)}
.cal .po-now{display:flex;gap:10px;align-items:baseline;font-size:12px}.cal .po-now .lab{font:10px var(--mono);letter-spacing:.12em;text-transform:uppercase;color:var(--fg3)}
.cal .po-now code,.cal .po-cur{font:12px var(--mono);color:var(--fg);word-break:break-all}
.cal .po-path{display:flex;gap:8px;flex-wrap:nowrap}.cal .po-path .txt{flex:1;min-width:0;font-family:var(--mono)}
.cal .po-list{display:flex;flex-direction:column;gap:4px;max-height:180px;overflow:auto}
.cal .po-it{display:flex;gap:10px;align-items:baseline;text-align:left;background:var(--bg2);border:1px solid var(--border);border-radius:6px;padding:6px 10px;color:var(--fg);cursor:pointer;font:12.5px var(--sans)}
.cal .po-it:hover{border-color:var(--accent)}.cal .po-it span{font:11px var(--mono);color:var(--fg3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.cal .po-bar{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:6px}.cal .po-cur{flex:1;min-width:120px;background:var(--bg3);padding:4px 8px;border-radius:4px}
.cal .po-dirs{border:1px solid var(--border);border-radius:6px;max-height:260px;overflow:auto;background:var(--bg)}
.cal .po-d{display:flex;align-items:center;gap:8px;padding:4px 8px;border-bottom:1px solid var(--bg3);cursor:pointer;font:12px var(--mono)}
.cal .po-d:last-child{border-bottom:0}.cal .po-d:hover{background:var(--bg2)}.cal .po-d.on{background:rgba(0,212,170,.1);box-shadow:inset 3px 0 0 var(--accent)}
.cal .po-d .ic{color:var(--fg3)}.cal .po-d .sp{flex:1}.cal .po-d .btn{opacity:.55}.cal .po-d:hover .btn,.cal .po-d.on .btn{opacity:1}
.cal .po-warn{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.cal .popen .hint.am{color:var(--amber)}
.cal .po-alt{border-top:1px solid var(--border);padding-top:8px}
@media(max-width:520px){.cal .po-path{flex-wrap:wrap}.cal .po-path .txt{flex-basis:100%}}
/* ---------- CodeAtlas 4 ---------- */
.cal .side-sc{flex:1;min-height:0;overflow:auto;padding:10px 12px 18px}
.cal .side-tabs button{padding-left:6px;padding-right:6px}
/* Pipeline */
.cal .pp{display:flex;flex-direction:column;gap:12px;font-size:12.5px}
.cal .pp section{border:1px solid var(--border);border-radius:8px;background:var(--bg2);padding:10px}
.cal .pp-steps{display:flex;gap:4px;flex-wrap:wrap}
.cal .pp-st{display:flex;align-items:center;gap:5px;font:10px var(--mono);letter-spacing:.06em;text-transform:uppercase;color:var(--fg3);border:1px solid var(--border);border-radius:12px;padding:2px 8px 2px 3px}
.cal .pp-st .n{width:16px;height:16px;border-radius:50%;display:inline-grid;place-items:center;background:var(--bg3);font-size:9.5px}
.cal .pp-st.done{color:var(--accent)}.cal .pp-st.done .n{background:var(--accent);color:var(--bg)}
.cal .pp-st.on{color:var(--fg);border-color:var(--accent)}.cal .pp-st.on .n{background:var(--amber);color:var(--bg)}
.cal .pp-h{display:flex;align-items:center;gap:8px;margin-bottom:8px}.cal .pp-h .sp{flex:1}.cal .pp-h b{font-weight:600}
.cal .pp-ta{width:100%;min-height:200px;font:12px var(--mono);resize:vertical;box-sizing:border-box}.cal .pp-ta.sm{min-height:70px;font-family:var(--sans);font-size:12.5px}
.cal .pp-md{max-height:340px;overflow:auto;font-size:12.5px;line-height:1.5}
.cal .pp-act{display:flex;gap:6px;align-items:center;flex-wrap:wrap}.cal .pp-act .txt{flex:1;min-width:120px}
.cal .pp-bar{height:5px;border-radius:3px;background:var(--border);overflow:hidden;margin-bottom:8px}.cal .pp-bar span{display:block;height:100%;background:var(--accent)}
.cal .pp-t{border-top:1px solid var(--bg3)}.cal .pp-tr{display:flex;align-items:center;gap:7px;padding:5px 2px;cursor:pointer}.cal .pp-tr:hover{background:var(--bg3)}
.cal .pp-tr .ic{width:14px;text-align:center;font-weight:700}.cal .pp-tr b{font:600 11px var(--mono);color:var(--fg2)}.cal .pp-tr .tt{min-width:0;overflow:hidden;text-overflow:ellipsis}.cal .pp-tr .sp{flex:1}
.cal .pp-tr .dep{font:10px var(--mono)}
.cal .pp-t.s-erledigt .ic{color:var(--accent)}.cal .pp-t.s-erledigt .tt{color:var(--fg3);text-decoration:line-through}
.cal .pp-t.s-in_arbeit .ic{color:var(--amber)}.cal .pp-t.s-blockiert .ic,.cal .pp-t.s-blockiert .tt{color:var(--red)}
.cal .pp-td{padding:0 4px 7px 23px;font-size:12px;color:var(--fg2);display:flex;flex-direction:column;gap:3px}.cal .pp .am,.cal .tm .am{color:var(--amber)}
/* Team */
.cal .tm{display:flex;flex-direction:column;gap:10px;font-size:12.5px}
.cal .tm section{border:1px solid var(--border);border-radius:8px;background:var(--bg2);padding:10px;display:flex;flex-direction:column;gap:6px}
.cal .tm-a{border-left:3px solid var(--ac)!important}
.cal .tm-h{display:flex;align-items:center;gap:7px}.cal .tm-h .sp{flex:1}.cal .tm-h .dot{width:9px;height:9px;border-radius:50%}.cal .tm-h code{font-size:10.5px}
.cal .tm-i{display:block;text-align:left;background:none;border:0;padding:1px 0;color:var(--fg2);font:11.5px var(--mono);cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cal .tm-i:hover{color:var(--fg)}.cal .tm-i.say{font-family:var(--sans);white-space:normal;cursor:default;color:var(--fg)}
.cal .tm-f{display:flex;gap:4px;flex-wrap:wrap;align-items:center}.cal .tm-f .lab{font:10px var(--mono);letter-spacing:.1em;text-transform:uppercase;color:var(--fg3);margin-right:4px}
.cal .tm-f .chip{background:var(--bg3);border:1px solid var(--border);border-radius:4px;color:var(--fg);font:11px var(--mono);padding:1px 6px;cursor:pointer}
.cal .tm-c{font-size:11.5px}.cal .tm-acts{gap:6px;flex-wrap:wrap}.cal .perm.sm{padding:7px;font-size:12px}
.cal .dm{width:min(1000px,calc(100vw - 32px));max-height:calc(100vh - 48px);display:flex;flex-direction:column;gap:8px}
.cal .dm-d{flex:1;overflow:auto;margin:0;font:11.5px var(--mono);background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:8px;white-space:pre}
.cal .dm-d .a{color:var(--accent)}.cal .dm-d .r{color:var(--red)}.cal .dm-d .h{color:var(--violet)}.cal .dm-d .f{color:var(--fg);font-weight:600}
/* Analyse */
.cal .ana{display:flex;flex-direction:column;gap:8px;padding:8px 12px 16px;font-size:12.5px}
.cal .ana-t{display:flex;gap:6px;flex-wrap:wrap;position:sticky;top:0;background:var(--bg);padding-bottom:6px;z-index:2}
.cal .ana-t .cnt{margin-left:6px}
.cal .ana-b{display:flex;flex-direction:column;gap:8px}.cal .ana-b .row .sp{flex:1}
.cal .ana .tbl{width:100%;border-collapse:collapse;font:11.5px var(--mono)}.cal .ana .tbl th{text-align:left;color:var(--fg3);font-weight:500;font-size:10px;letter-spacing:.1em;text-transform:uppercase;border-bottom:1px solid var(--border);padding:4px 6px}
.cal .ana .tbl td{border-bottom:1px solid var(--bg3);padding:4px 6px}.cal .ana .tbl tr.clk{cursor:pointer}.cal .ana .tbl tr.clk:hover td{background:var(--bg2)}.cal .ana .tbl .pr{font-family:var(--sans);color:var(--fg2)}
.cal .ana-p{font:11.5px var(--mono);color:var(--fg2)}
.cal .ana-r{display:flex;align-items:center;gap:6px;border:1px solid var(--border);border-radius:6px;padding:5px 8px;background:var(--bg2)}.cal .ana-r .sp{flex:1}
.cal .ana-rf{gap:6px;flex-wrap:wrap}.cal .ana-rf .txt{flex:1;min-width:110px}
.cal .ana-md{margin:0;white-space:pre-wrap;font:11.5px var(--mono);background:var(--bg2);border:1px solid var(--border);border-radius:6px;padding:10px;max-height:380px;overflow:auto}
.cal .ana .cl{font:10px var(--mono);letter-spacing:.12em;text-transform:uppercase;color:var(--fg3);margin-top:6px}.cal .ana .cl.bad{color:var(--red)}.cal .ana .cl.am{color:var(--amber)}
.cal .ana .mem{display:flex;gap:8px;width:100%;text-align:left;background:none;border:0;border-bottom:1px solid var(--bg3);padding:4px 2px;color:var(--fg);font:12px var(--mono);cursor:pointer}.cal .ana .mem:hover{background:var(--bg2)}
.cal .ana .mem .s{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis}.cal .ana .mem .ln{color:var(--fg3);font-size:10.5px}.cal .ana .bad,.cal .ana .v.bad{color:var(--red)}.cal .ana .ok{color:var(--accent)}
/* Diagramm-Leisten */
.cal .rp,.cal .impbar{position:absolute;left:50%;transform:translateX(-50%);top:46px;z-index:6;display:flex;align-items:center;gap:6px;background:var(--navbg);backdrop-filter:blur(10px);border:1px solid var(--violet);border-radius:8px;padding:5px 8px;font:11.5px var(--mono);max-width:calc(100% - 40px)}
.cal .rp{border-color:var(--accent2)}.cal .rp-k,.cal .impbar .ik{font-weight:600;color:var(--accent2);white-space:nowrap}.cal .impbar .ik{color:var(--violet)}
.cal .rp input[type=range]{width:160px;accent-color:var(--accent)}.cal .rp-l{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:300px;color:var(--fg2)}
.cal .perm-imp{display:flex;gap:8px;align-items:center;font:11.5px var(--mono);color:var(--violet);border:1px dashed var(--violet);border-radius:5px;padding:4px 8px}.cal .perm-imp.hi{color:var(--amber);border-color:var(--amber)}.cal .perm-imp span{flex:1}
.cal .vi.gate{display:flex;flex-direction:column;gap:3px;border-left:3px solid var(--fg3);padding:4px 8px;font-size:12px;background:var(--bg2);border-radius:0 4px 4px 0}
.cal .vi.gate .gk{font:600 9.5px var(--mono);letter-spacing:.12em;color:var(--fg3)}
.cal .vi.gate.ok{border-color:var(--accent)}.cal .vi.gate.ok .gk{color:var(--accent)}.cal .vi.gate.block,.cal .vi.gate.giveup{border-color:var(--red)}.cal .vi.gate.block .gk{color:var(--red)}
.cal .vi.gate summary{cursor:pointer;font:11px var(--mono);color:var(--fg2)}
.cal .cfg-sec{border-top:1px solid var(--border);padding-top:8px;margin-top:4px}.cal .cfg-sec .cl{display:flex;justify-content:space-between;font-size:12px}
@media(max-width:760px){.cal .rp,.cal .impbar{top:8px;flex-wrap:wrap}.cal .rp input[type=range]{width:100px}}
@media(max-width:600px){.cal .status .hide-s{display:none}.cal .nav-logo{display:none}}
@media(prefers-reduced-motion:reduce){.cal *{transition:none!important}.cal .spin{animation-duration:2.4s}}
/* ===== CodeAtlas 5: Erscheinungsbild „Atlas“ – ruhiger Rahmen, schwebende Flächen, Inhalt vorn ===== */
.cal{--desk:#050608;--line:color-mix(in srgb,var(--border) 58%,transparent);--r1:8px;--r2:12px;--r3:16px;--shadow:0 14px 44px rgba(0,0,0,.5);background:var(--desk);grid-template-rows:52px minmax(0,1fr) 28px}
@media (prefers-color-scheme: light){.cal:not([data-theme="dark"]){--desk:#dfe3eb;--shadow:0 14px 40px rgba(40,50,80,.16)}}
.cal[data-theme="light"]{--desk:#dfe3eb;--shadow:0 14px 40px rgba(40,50,80,.16)}
.cal[data-accent="lime"]{--accent:#b9e84c}.cal[data-accent="pink"]{--accent:#ff7fc6}.cal[data-accent="ice"]{--accent:#7cc8ff}
@media (prefers-color-scheme: light){.cal[data-accent="lime"]:not([data-theme="dark"]){--accent:#4f7d00}.cal[data-accent="pink"]:not([data-theme="dark"]){--accent:#c2338a}.cal[data-accent="ice"]:not([data-theme="dark"]){--accent:#1978b8}}
.cal[data-accent="lime"][data-theme="light"]{--accent:#4f7d00}.cal[data-accent="pink"][data-theme="light"]{--accent:#c2338a}.cal[data-accent="ice"][data-theme="light"]{--accent:#1978b8}
.cal ::selection{background:color-mix(in srgb,var(--accent) 35%,transparent)}
.cal *{scrollbar-width:thin;scrollbar-color:var(--border) transparent}

/* Kopfzeile */
.cal .nav{background:transparent;backdrop-filter:none;border-bottom:none;gap:8px;padding:0 14px;position:relative}
.cal .nav-logo{display:flex;align-items:center;gap:9px;font-size:15px;font-weight:600;letter-spacing:-.01em;text-transform:none;color:var(--fg);margin-right:6px}
.cal .nav-logo svg{color:var(--accent);flex-shrink:0}
.cal .nav-logo span{color:var(--fg3);font-weight:400;margin-left:-3px}
.cal .nav-theme{border-color:transparent;border-radius:9px;width:34px;height:34px;color:var(--fg2)}
.cal .nav-theme:hover,.cal .nav-theme.on{background:var(--surface);border-color:var(--line);color:var(--fg)}
.cal .vsep{background:var(--line)}
.cal.ai-on .nav::after{content:"";position:absolute;left:0;right:0;bottom:0;height:2px;pointer-events:none;background:linear-gradient(90deg,transparent,var(--accent),transparent) no-repeat;background-size:38% 100%;animation:calBeam 2.4s linear infinite}
@keyframes calBeam{from{background-position:-70% 0}to{background-position:170% 0}}
.cal .nav-ai{display:inline-flex;align-items:center;font-size:12.5px;color:var(--fg2);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-left:6px}
.cal .viewtog{display:inline-flex;align-items:center;gap:8px}
.cal .vt-ic{display:inline-grid;grid-template-columns:5px 9px;grid-template-rows:6px 4px;gap:2px}
.cal .vt-ic i{border-radius:1.5px;background:currentColor;opacity:.35}
.cal .vt-ic i:first-child{grid-row:1/3;opacity:.9}
.cal .viewtog.on .vt-ic i{opacity:.9}

/* Knöpfe, Felder, Schalter */
.cal .btn{font-family:var(--sans);font-size:12.5px;font-weight:500;letter-spacing:0;text-transform:none;border-radius:var(--r1);padding:6px 11px;background:color-mix(in srgb,var(--surface) 60%,transparent);border-color:var(--line);color:var(--fg2);transition:background .15s,border-color .15s,color .15s}
.cal .btn:hover{background:var(--surface);border-color:color-mix(in srgb,var(--accent) 50%,var(--border));color:var(--fg)}
.cal .btn.primary{background:var(--accent);border-color:var(--accent);color:var(--bg);font-weight:600}
.cal .btn.primary:hover{background:var(--accent);color:var(--bg);filter:brightness(1.08)}
.cal .btn.amber{background:transparent;border-color:color-mix(in srgb,var(--amber) 60%,transparent);color:var(--amber)}
.cal .btn.sm{padding:4px 9px;font-size:11.5px;border-radius:7px}
.cal .btn.on{border-color:color-mix(in srgb,var(--accent) 55%,transparent);color:var(--accent);background:color-mix(in srgb,var(--accent) 12%,transparent)}
.cal .btn:disabled{opacity:.45;cursor:default}
.cal .btn.chip{display:inline-flex;align-items:center;gap:2px;background:transparent;border-color:transparent;color:var(--fg);font-weight:500;font-size:13px;max-width:280px;overflow:hidden;text-overflow:ellipsis}
.cal .btn.chip:hover{background:var(--surface);border-color:var(--line)}
.cal .btn.chip .car{color:var(--fg3);margin-left:7px;font-size:10px}
.cal .seg{border-color:var(--line);border-radius:var(--r1);background:color-mix(in srgb,var(--surface) 60%,transparent);padding:2px;gap:2px}
.cal .seg button{font-family:var(--sans);font-size:12px;font-weight:500;letter-spacing:0;text-transform:none;background:transparent;border-right:none;border-radius:6px;padding:5px 10px;color:var(--fg2)}
.cal .seg button:hover{color:var(--fg)}
.cal .seg button.on{background:var(--accent);color:var(--bg)}
.cal .txt{border-radius:var(--r1);border-color:var(--line);background:var(--bg3)}
.cal .txt:focus{border-color:var(--accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 16%,transparent)}
.cal .tag{border-radius:6px;border-color:var(--line)}
.cal .swt{position:relative;width:38px;height:22px;flex-shrink:0;display:inline-block}
.cal .swt input{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer;z-index:1}
.cal .swt input:disabled{cursor:default}
.cal .swt i{position:absolute;inset:0;border-radius:11px;background:var(--border);transition:background .15s}
.cal .swt i::after{content:"";position:absolute;left:3px;top:3px;width:16px;height:16px;border-radius:50%;background:var(--fg2);transition:transform .15s,background .15s}
.cal .swt input:checked+i{background:var(--accent)}
.cal .swt input:checked+i::after{transform:translateX(16px);background:var(--bg)}
.cal .swt input:focus-visible+i{outline:2px solid var(--accent);outline-offset:2px}

/* Flächen: Leisten, Diagramm und Konsole als eigene Karten auf dem Tisch */
.cal .side{background:var(--bg2)}
.cal .blk,.cal .pnl-h{border-bottom-color:var(--line)}
.cal .info-row{border-top-color:var(--line)}
@media(min-width:901px){
  .cal .main{padding:0 8px;gap:8px}
  .cal .side,.cal .side.r{border:1px solid var(--line);border-radius:var(--r3)}
  .cal .center{gap:8px}
  .cal .stage{border:1px solid var(--line);border-radius:var(--r3)}
  .cal .drawer{border:1px solid var(--line);border-radius:var(--r3);overflow:hidden}
  .cal .drawer .grip{top:0;height:6px}
  .cal .main.rfold{grid-template-columns:var(--lw,280px) minmax(0,1fr)}
  .cal .rtog{top:10px;right:calc(var(--rw,340px) + 26px);border-radius:8px;font-family:var(--sans);text-transform:none;letter-spacing:0;border-color:var(--line)}
  .cal .main.rfold .rtog{right:18px}
}
.cal .side-tabs{border-bottom:none;padding:8px 8px 2px;gap:3px;background:transparent}
.cal .side-tabs button{font-family:var(--sans);font-size:12.5px;font-weight:500;letter-spacing:0;text-transform:none;border-bottom:none;border-radius:8px;padding:7px 6px;color:var(--fg3)}
.cal .side-tabs button:hover{color:var(--fg);background:color-mix(in srgb,var(--surface) 60%,transparent)}
.cal .side-tabs button.on{color:var(--fg);background:var(--surface)}
.cal .dtab{font-family:var(--sans);font-size:12.5px;font-weight:500;letter-spacing:0;text-transform:none;border-bottom:none;border-radius:7px;padding:5px 10px;margin:3px 1px;color:var(--fg3)}
.cal .dtab:hover{color:var(--fg);background:color-mix(in srgb,var(--surface) 60%,transparent)}
.cal .dtab.on{color:var(--fg);background:var(--surface)}
.cal .drawer .dh{padding:0 5px;border-bottom-color:var(--line)}
.cal .status{background:transparent;border-top:none;padding:0 18px;letter-spacing:.02em}

/* Diagramm: schwebende Bedienelemente */
.cal .ladder,.cal .minimap{border-color:var(--line);border-radius:var(--r2);box-shadow:var(--shadow)}
.cal .ladder button{border-radius:7px}
.cal .chgbar>*{border-radius:8px;border-color:var(--line);font-family:var(--sans);font-size:11.5px;padding:4px 9px}
.cal .toast{border-radius:10px;font-family:var(--sans);font-size:12.5px;box-shadow:var(--shadow)}
.cal .modal{background:color-mix(in srgb,var(--desk) 62%,transparent);backdrop-filter:blur(8px)}
.cal .modal .box{border-radius:18px;border-color:var(--line);box-shadow:var(--shadow)}
.cal .busy .box{border-radius:14px;border-color:var(--line);box-shadow:var(--shadow)}
.cal .pip{border-radius:var(--r2)}
.cal.no-mini .minimap{display:none}
.cal.no-ladder .ladder{display:none}
.cal.no-motion *,.cal.no-motion *::after,.cal.no-motion *::before{animation:none!important;transition:none!important}

/* Chat */
.cal .vd-h{border-bottom:none;padding:12px 14px 6px;font-family:var(--sans);font-size:12.5px}
.cal .vd-h b{font-size:13.5px}
.cal .vd-cfg{margin:4px 10px;border:1px solid var(--line);border-radius:var(--r2)}
.cal .vd-feed{padding:2px 0 10px}
.cal .vt{border-bottom:none;padding:10px 14px 8px;position:relative}
.cal .vt.open{background:none}
.cal .vt.open::before{content:"";position:absolute;left:0;top:14px;bottom:10px;width:2px;border-radius:2px;background:var(--accent)}
.cal .vt-h{text-transform:none;letter-spacing:.01em;font-size:11px}
.cal .vt-p{background:var(--surface);border:1px solid var(--line);border-left:1px solid var(--line);border-radius:14px 14px 14px 4px;padding:10px 13px;margin:8px 0}
.cal .vi.usr .vt-p{border-color:color-mix(in srgb,var(--violet) 45%,var(--line))}
.cal .vi.say{color:var(--fg);font-size:13.5px}
.cal .vi-h{border-radius:7px;padding:4px 6px}
.cal .vcode,.cal .mdiff{border-radius:9px;border-color:var(--line)}
.cal .vt-e{border-top:1px solid var(--line);font-family:var(--sans);font-size:11.5px}
.cal .perm{border-top:none;border:1px solid color-mix(in srgb,var(--amber) 55%,var(--line));border-radius:var(--r2);margin:0 10px 8px}
.cal .vd-in{border-top:none;padding:6px 12px 12px;background:transparent}
.cal .vd-ta{border-radius:var(--r2);padding:11px 13px;font-size:14px;min-height:62px}
.cal .vd-sum{border-radius:var(--r1);border-color:var(--line)}
.cal .vd-empty b,.cal .vd-intro h3{font-size:17px;letter-spacing:-.01em}

/* Einstellungen */
.cal .modal .box.set{width:min(880px,100%);height:min(640px,100%);padding:0;gap:0;display:grid;grid-template-columns:196px minmax(0,1fr);overflow:hidden}
.cal .set-nav{background:var(--bg);border-right:1px solid var(--line);padding:18px 10px 14px;display:flex;flex-direction:column;gap:2px;min-height:0}
.cal .set-nav h2{font-size:15px;font-weight:600;padding:0 10px 12px;letter-spacing:-.01em}
.cal .set-nav button{text-align:left;background:none;border:none;border-radius:8px;padding:8px 10px;color:var(--fg2);font-family:var(--sans);font-size:13.5px;cursor:pointer}
.cal .set-nav button:hover{color:var(--fg);background:color-mix(in srgb,var(--surface) 60%,transparent)}
.cal .set-nav button.on{background:var(--surface);color:var(--fg)}
.cal .set-nav button:focus-visible,.cal .set-x:focus-visible,.cal .sws button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.cal .set-nav .sp{flex:1}
.cal .set-ver{font-size:11px;color:var(--fg3);padding:0 10px}
.cal .set-b{padding:22px 26px 26px;overflow:auto;position:relative;min-height:0}
.cal .set-b h3{font-size:19px;font-weight:600;letter-spacing:-.015em;margin-bottom:6px}
.cal .set-b h4{font-size:12px;font-weight:600;color:var(--fg3);margin:22px 0 2px}
.cal .set-x{position:absolute;top:16px;right:18px;width:30px;height:30px;border-radius:8px;border:none;background:none;color:var(--fg3);cursor:pointer;font-size:13px}
.cal .set-x:hover{background:var(--surface);color:var(--fg)}
.cal .set-r{display:flex;align-items:center;gap:18px;padding:12px 0;border-bottom:1px solid var(--line)}
.cal .set-r .l{flex:1;min-width:0}
.cal .set-r .l b{display:block;font-weight:500;font-size:13.5px;color:var(--fg)}
.cal .set-r .l span{display:block;font-size:12px;color:var(--fg3);line-height:1.45;margin-top:1px;max-width:52ch}
.cal .set-r.off .l{opacity:.5}
.cal .set-note{font-size:12.5px;color:var(--fg2);background:var(--bg3);border-radius:var(--r1);padding:9px 12px;margin:6px 0;line-height:1.5}
.cal .set-acc{margin-top:14px}
.cal .sws{display:flex;gap:8px}
.cal .sws button{width:26px;height:26px;border-radius:50%;border:2px solid var(--bg2);background:var(--c);cursor:pointer;box-shadow:0 0 0 1px var(--line)}
.cal .sws button.on{box-shadow:0 0 0 2px var(--fg)}
.cal .set-keys{display:grid;gap:0}
.cal .set-keys>div{display:flex;align-items:center;gap:14px;padding:9px 0;border-bottom:1px solid var(--line);font-size:13px;color:var(--fg2)}
.cal .set-keys kbd{font-family:var(--mono);font-size:11.5px;min-width:76px;text-align:center;background:var(--bg3);border:1px solid var(--line);border-bottom-width:2px;border-radius:6px;padding:2px 8px;color:var(--fg)}
@media(max-width:640px){.cal .modal .box.set{grid-template-columns:1fr;grid-template-rows:auto minmax(0,1fr)}.cal .set-nav{flex-direction:row;overflow-x:auto;border-right:none;border-bottom:1px solid var(--line);padding:10px}.cal .set-nav h2,.cal .set-nav .sp,.cal .set-ver{display:none}.cal .set-nav button{white-space:nowrap}.cal .set-r{flex-wrap:wrap;gap:10px}}

/* Einfache Ansicht: nur Chat und Diagramm */
.cal.v-simple{grid-template-rows:52px minmax(0,1fr) 8px}
.cal.v-simple .status{display:none}
.cal.v-simple .nav-mid>*:not(.keep){display:none}
.cal.v-simple .nav-theme.adv{display:none!important}
.cal.v-simple .side-tabs{display:none}
.cal.v-simple .side.r,.cal.v-simple .rtog{display:none}
.cal.v-simple .drawer.closed{display:none}
.cal.v-simple .stage>.ov,.cal.v-simple .chgbar{display:none}
.cal.v-simple .vd-h [aria-label="Einstellungen"]{display:none}
@media(min-width:901px){.cal.v-simple .main{grid-template-columns:var(--lw,440px) minmax(0,1fr)}}
@media(max-width:600px){.cal .viewtog{padding:6px 8px;font-size:0;gap:0}.cal .nav-logo{display:none}}
/* Feinschliff */
.cal .lnk{font-family:var(--sans);font-size:12px;letter-spacing:0;text-decoration:none;color:var(--accent)}
.cal .lnk:hover{text-decoration:underline;color:var(--accent)}
.cal .hint{font-family:var(--sans);font-size:12px;line-height:1.5}
.cal .chgbar>*{text-transform:none;letter-spacing:0}
.cal.v-adv .nav-mid .btn{padding:6px 9px}
.cal.v-adv .nav-mid .seg button{padding:5px 8px}
@media(max-width:1700px){.cal.v-adv .nav-logo span{display:none}.cal.v-adv .nav-mid .seg .n{display:none}}
`;

/* ============================ UI-Bausteine ============================ */
const KIND_CH = { class: "C", abstract: "A", interface: "I", enum: "E", struct: "S", record: "R", object: "O", module: "M", fb: "F", program: "P", function: "ƒ", table: "T", hw: "H", union: "U" };
const KIND_TOK = { class: "--accent", abstract: "--amber", interface: "--accent2", enum: "--violet", struct: "--az", record: "--ay", object: "--ax", module: "--fg2", fb: "--az", program: "--ay", function: "--accent2", table: "--violet", hw: "--ax", union: "--az" };
const VIS_TOK = { "+": "var(--accent)", "-": "var(--red)", "#": "var(--amber)", "~": "var(--violet)", I: "var(--accent2)", O: "var(--amber)", X: "var(--violet)", T: "var(--fg3)", G: "var(--ay)", E: "var(--fg2)" };
const MOD_TOK = ["--accent", "--accent2", "--violet", "--amber", "--az", "--ay", "--ax", "--red"];

function EdgeIcon({ type }) {
  const T = EDGE_T[type], col = `var(--${T.tok})`;
  return (
    <svg width="34" height="12" viewBox="0 0 34 12" aria-hidden="true">
      <line x1="2" y1="6" x2={type === "inherit" || type === "implement" ? 23 : 30} y2="6" stroke={col} strokeWidth="1.6" strokeDasharray={T.dash ? T.dash.join(" ") : undefined} />
      {(type === "inherit" || type === "implement") && <path d="M23 1.5 L32 6 L23 10.5 Z" fill="var(--bg2)" stroke={col} strokeWidth="1.3" />}
      {(type === "assoc" || type === "dep" || type === "comp") && <path d="M25 2 L31 6 L25 10" fill="none" stroke={col} strokeWidth="1.5" />}
      {type === "comp" && <path d="M1 6 L5 3.5 L9 6 L5 8.5 Z" fill={col} />}
    </svg>
  );
}

const Sidebar = memo(function Sidebar({ budget, setBudget, model, sel, q, setQ, onPick, onModule, types, setTypes, pat, setPat, grouping, setGrouping }) {
  const [exp, setExp] = useState(() => new Set());
  const groups = model ? model.groups : [];
  useEffect(() => { setExp(new Set(model && model.classes.length <= 250 ? groups.map((g) => g.key) : [])); }, [model]); // eslint-disable-line
  useEffect(() => { // Auswahl im Baum aufklappen
    if (!model || !sel) return; const g = model.classes[sel.id].module;
    setExp((s) => (s.has(g) ? s : new Set([...s, g])));
  }, [sel, model]);
  const ecount = useMemo(() => { const r = {}; if (model) for (const e of model.edges) r[e.type] = (r[e.type] || 0) + 1; return r; }, [model]);
  const results = useMemo(() => {
    if (!model || !q.trim()) return null;
    const s = q.trim().toLowerCase(), out = [];
    for (const c of model.classes) {
      if (c.name.toLowerCase().includes(s)) { out.push({ c, hit: null }); continue; }
      const f = c.fields.findIndex((x) => x.name.toLowerCase().includes(s));
      if (f >= 0) { out.push({ c, hit: { t: "f", i: f, label: c.fields[f].name } }); continue; }
      const m = c.methods.findIndex((x) => x.name.toLowerCase().includes(s));
      if (m >= 0) out.push({ c, hit: { t: "m", i: m, label: c.methods[m].name + "()" } });
      if (out.length > 300) break;
    }
    return out.sort((a, b) => (a.hit ? 1 : 0) - (b.hit ? 1 : 0) || a.c.name.length - b.c.name.length).slice(0, 150);
  }, [model, q]);
  const clsRow = (c, hit) => (
    <div key={c.id + (hit ? hit.t + hit.i : "")} className={"cls" + (sel && sel.id === c.id ? " on" : "")} onClick={() => onPick(c.id, hit ? { t: hit.t, i: hit.i } : null)} title={c.rel}>
      <span className="k" style={{ background: `var(${KIND_TOK[c.kind] || "--fg3"})` }}>{KIND_CH[c.kind] || "?"}</span>
      <span className="nm" style={{ fontStyle: c.kind === "abstract" ? "italic" : "normal" }}>{c.name}</span>
      <span className="sub">{hit ? hit.label : c.fields.length + "·" + c.methods.length}</span>
    </div>
  );
  return (
    <div className="side-body">
      <div className="blk">
        <div className="cl"><span>Suche</span><span>/</span></div>
        <input className="txt" id="cal-search" placeholder="Klasse, Feld oder Methode …" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {model && (
        <div className="blk">
          <div className="metrics">
            <div className="metric"><div className="ml">Klassen</div><div className="mv">{de(model.classes.length)}</div></div>
            <div className="metric"><div className="ml">Beziehungen</div><div className="mv">{de(model.edges.length)}</div></div>
            <div className="metric"><div className="ml">Module</div><div className="mv">{de(model.groups.length)}</div></div>
            <div className="metric warn"><div className="ml">Patterns</div><div className="mv">{de(Object.values(model.patCount).reduce((a, b) => a + b, 0))}</div></div>
          </div>
        </div>
      )}
      {results ? (
        <div className="blk tree">
          <div className="cl"><span>Treffer</span><span>{results.length}{results.length === 150 ? "+" : ""}</span></div>
          {results.map(({ c, hit }) => clsRow(c, hit))}
          {!results.length && <div className="hint">Nichts gefunden.</div>}
        </div>
      ) : (
        <>
          <div className="blk">
            <div className="cl"><span>Kanten</span><span>ein/aus</span></div>
            <div className="lg">
              {Object.keys(EDGE_T).map((t) => (
                <label key={t}><input type="checkbox" checked={types[t]} onChange={(e) => setTypes({ ...types, [t]: e.target.checked })} /><EdgeIcon type={t} />{EDGE_T[t].label}<span className="cnt">{de(ecount[t] || 0)}</span></label>
              ))}
            </div>
          </div>
          <div className="blk">
            <div className="cl"><span>Leistung · Kanten im Bild</span><span>max.</span></div>
            <div className="seg">{[[2000, "2k"], [8000, "8k"], [20000, "20k"], [60000, "60k"], [0, "alle"]].map(([n, l]) => <button key={l} className={budget === n ? "on" : ""} onClick={() => setBudget(n)}>{l}</button>)}</div>
            <div className="hint" style={{ marginTop: 6 }}>Bei mehr sichtbaren Kanten zeigt der Atlas eine gleichmäßige Stichprobe – Vererbung &amp; Komposition zuerst, Aufrufe &amp; Typ-Abhängigkeiten zuletzt. Ausgewähltes ist immer vollständig.</div>
          </div>
          <div className="blk">
            <div className="cl"><span>Design Patterns</span><span>[Heuristik]</span></div>
            <div className="lg">
              <label><input type="radio" name="cal-pat" checked={!pat} onChange={() => setPat("")} />keine Hervorhebung</label>
              {model && Object.keys(PAT).filter((k) => model.patCount[k]).map((k) => (
                <label key={k} title={PAT[k].why}><input type="radio" name="cal-pat" checked={pat === k} onChange={() => setPat(k)} />
                  <span style={{ width: 8, height: 8, borderRadius: 4, background: `var(--${PAT[k].tok})`, flexShrink: 0 }} />{PAT[k].label}<span className="cnt">{model.patCount[k]}</span></label>
              ))}
              {model && !Object.keys(model.patCount).length && <div className="hint">Keine Muster erkannt.</div>}
            </div>
          </div>
          <div className="blk">
            <div className="cl"><span>Gruppierung</span></div>
            <div className="seg"><button className={grouping === "dir" ? "on" : ""} onClick={() => setGrouping("dir")}>Ordner</button><button className={grouping === "file" ? "on" : ""} onClick={() => setGrouping("file")}>Datei</button></div>
          </div>
          <div className="blk tree">
            <div className="cl"><span>Module</span><span style={{ cursor: "pointer" }} onClick={() => setExp(exp.size ? new Set() : new Set(groups.map((g) => g.key)))}>{exp.size ? "alle zu" : "alle auf"}</span></div>
            {groups.map((g) => (
              <div key={g.key}>
                <div className={"mod" + (exp.has(g.key) ? " open" : "")} onClick={() => { const n = new Set(exp); n.has(g.key) ? n.delete(g.key) : n.add(g.key); setExp(n); }}>
                  <span className="car">▸</span><span className="sw" style={{ background: `var(${MOD_TOK[g.color]})` }} />
                  <span className="nm" title={g.key}>{g.key}</span><span className="cnt">{g.ids.length}</span>
                  <span className="go" onClick={(e) => { e.stopPropagation(); onModule(g.key); }}>zeigen</span>
                </div>
                {exp.has(g.key) && g.ids.map((id) => clsRow(model.classes[id]))}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
});

function sig(m) { return `${m.name}(${m.params.map((p) => p.name + (p.type ? ": " + p.type : "") + (p.def ? " = " + p.def : "")).join(", ")})${m.ret ? ": " + m.ret : ""}`; }

/* Eingeklappte Abschnitte der rechten Leiste – gemerkt über den Titel, gilt für alle Klassen gleich */
function useFold(rootRef) {
  const [fold, setFold] = useState(() => { try { return new Set(JSON.parse(lsGet("cal-fold", "[]"))); } catch { return new Set(); } });
  const keyOf = (blk) => { const h = blk.querySelector(":scope > .cl > span"); return h ? h.textContent.trim() : ""; };
  useLayoutEffect(() => {   // nach jedem Rendern: Klasse und Bedienhilfe an jedem Abschnitt setzen
    const root = rootRef.current; if (!root) return;
    for (const b of root.querySelectorAll(":scope > .blk")) {
      const h = b.querySelector(":scope > .cl"), k = keyOf(b); if (!h || !k) continue;
      const f = fold.has(k); b.classList.toggle("fold", f); h.classList.add("tgl");
      h.setAttribute("role", "button"); h.setAttribute("tabindex", "0"); h.setAttribute("aria-expanded", String(!f));
      h.title = f ? "Aufklappen" : "Einklappen";
    }
  });
  const toggle = (e) => {
    if (e.type === "keydown" && e.key !== "Enter" && e.key !== " ") return;
    const h = e.target.closest(".cl"); if (!h || !h.parentElement || !h.parentElement.matches(".side.r > .blk") || e.target.closest("button:not(.cl), a, input, select")) return;
    e.preventDefault();
    const k = keyOf(h.parentElement); if (!k) return;
    setFold((old) => { const n = new Set(old); n.has(k) ? n.delete(k) : n.add(k); lsSet("cal-fold", JSON.stringify([...n])); return n; });
  };
  return toggle;
}

const Panel = memo(function Panel({ model, sel, files, onPick, onMember, open, onEdit, onExt, extLabel, diag, live, liveTick, onLiveGo, onBp, onCtl, onImpact }) {
  const rootRef = useRef(null), onFold = useFold(rootRef);
  if (!model) return <aside ref={rootRef} onClick={onFold} onKeyDown={onFold} className={"side r" + (open ? " open" : "")} />;
  if (!sel) {
    const top = [...model.classes].sort((a, b) => b.inc + b.out - (a.inc + a.out)).slice(0, 8);
    return (
      <aside ref={rootRef} onClick={onFold} onKeyDown={onFold} className={"side r" + (open ? " open" : "")} aria-label="Details">
        <div className="pnl-h"><div className="kicker">Projekt</div><h2>{model.prefix ? model.prefix.replace(/\/$/, "") : "Code-Atlas"}</h2>
          <div className="pills">{Object.entries(model.langs).map(([l, n]) => <span key={l} className="tag">{l} · {n}</span>)}{model.synthetic && <span className="tag accent">synthetisch</span>}</div></div>
        <div className="blk"><div className="cl"><span>Zentrale Klassen</span><span>Kanten</span></div>
          <div className="rel">{top.map((c) => <button key={c.id} onClick={() => onPick(c.id)}><span className="nm">{c.name}</span><span className="lb">{c.inc}↓ {c.out}↑</span></button>)}</div></div>
        <div className="blk"><div className="cl"><span>Bedienung</span></div>
          <div className="info-row"><span className="info-dot" /><span><b>Zoomen</b> (Mausrad, Pinch, Leiter unten links) wechselt die Detailstufe: Architektur → Beziehungen → Detail → Analyse.</span></div>
          <div className="info-row"><span className="info-dot" style={{ background: "var(--amber)" }} /><span><b>Klick</b> wählt eine Klasse, <b>Doppelklick/-tipp</b> fliegt hinein. Im Detail-Zoom sind Felder und Methoden einzeln anklickbar.</span></div>
          <div className="info-row"><span className="info-dot" style={{ background: "var(--violet)" }} /><span><b>Ziehen</b> verschiebt Ansicht, Klassen oder (am Modul-Etikett) ganze Module. Minimap rechts unten zum Springen.</span></div>
          <div className="info-row"><span className="info-dot" style={{ background: "var(--accent2)" }} /><span><b>Tasten:</b> F = Einpassen, 0–3 = Zoomstufe, / = Suche, Esc = Auswahl lösen.</span></div>
        </div>
        {model.warn.length > 0 && <div className="blk"><div className="cl"><span>Parser-Warnungen</span><span>{model.warn.length}</span></div><div className="hint">{model.warn.slice(0, 6).map((w, i) => <div key={i}>{w}</div>)}</div></div>}
        <div className="blk"><div className="hint">Der Parser ist heuristisch (Regex + Klammer-Matching, kein Compiler). Typauflösung über Klassennamen; gleichnamige Klassen werden bevorzugt im selben Ordner aufgelöst. [ANNAHME]</div></div>
      </aside>
    );
  }
  const c = model.classes[sel.id];
  const E = model.edges;
  const myE = (model.adj[c.id] || []).map((i) => E[i]);
  const outE = myE.filter((e) => e.from === c.id), inE = myE.filter((e) => e.to === c.id);
  const grp = (list, type, side) => list.filter((e) => e.type === type).map((e) => ({ c: model.classes[side === "to" ? e.to : e.from], e }));
  const sections = [
    ["Erbt von", grp(outE, "inherit", "to")], ["Implementiert", grp(outE, "implement", "to")],
    ["Unterklassen / Implementierer", [...grp(inE, "inherit", "from"), ...grp(inE, "implement", "from")]],
    ["Besitzt (Felder)", [...grp(outE, "comp", "to"), ...grp(outE, "assoc", "to")]],
    ["Wird gehalten von", [...grp(inE, "comp", "from"), ...grp(inE, "assoc", "from")]],
    ["Ruft Funktionen auf in", grp(outE, "call", "to")], ["Wird aufgerufen von", grp(inE, "call", "from")],
    ["Greift auf Variablen zu in", grp(outE, "data", "to")], ["Variablen genutzt von", grp(inE, "data", "from")],
    ["Include / Import", grp(outE, "imp", "to")], ["Eingebunden von", grp(inE, "imp", "from")],
    ["Verwendet (Typ)", grp(outE, "dep", "to")], ["Wird verwendet von (Typ)", grp(inE, "dep", "from")],
  ];
  const isMod = c.kind === "module";
  const nm = (l) => { const t = model.classes[l.id]; const x = l.t === "m" ? t.methods[l.i] : l.t === "f" ? t.fields[l.i] : null; return (t.id === c.id ? "" : t.name + ".") + (x ? x.name + (l.t === "m" ? "()" : "") : ""); };
  const chip = (l, extra, key) => <span key={key} className="chip" onClick={() => (l.t === "m" || l.t === "f") && l.i >= 0 ? onMember(l.id, { t: l.t, i: l.i }) : onPick(l.id)}>{nm(l)}{extra}</span>;
  const mSel = sel.m ? (sel.m.t === "f" ? c.fields[sel.m.i] : c.methods[sel.m.i]) : null;
  const srcFile = (mSel && mSel.file) || c.file;
  const ent = files && files.get(srcFile);
  const text = ent && ent.text;
  const jumpLine = mSel ? mSel.line : isMod ? 1 : c.line;
  const myDiag = diag ? diag.items.filter((d) => d.target && d.target.id === c.id && d.sev !== "note") : [];
  const lines = text ? text.split("\n") : null;
  const from = mSel && mSel.line ? Math.max(0, mSel.line - 3) : isMod ? 0 : c.line - 1;
  const to = Math.min(lines ? lines.length : 0, mSel && mSel.endLine ? Math.max(mSel.endLine, mSel.line) + 1 : mSel ? from + 12 : c.endLine, from + 220);
  const hlLine = mSel ? mSel.line : -1;
  const pats = c.pats;
  return (
    <aside ref={rootRef} onClick={onFold} onKeyDown={onFold} className={"side r" + (open ? " open" : "")} aria-label="Details">
      <div className="pnl-h">
        <div className="st">{"«" + (KIND_DE[c.kind] || "class") + "»"} · {c.lang}</div>
        <h2 className={c.kind === "abstract" ? "abs" : ""}>{c.name}</h2>
        <div className="loc">{isMod ? c.relFiles.join(" + ") : `${c.rel}:${c.line}–${c.endLine}`}</div>
        {pats.length > 0 && <div className="pills">{pats.map((p, i) => <span key={i} className="pill" style={{ color: `var(--${PAT[p.k].tok})` }} title={PAT[p.k].why + " — " + p.why}>{PAT[p.k].label} · {p.role}</span>)}</div>}
        {onImpact && <div className="row" style={{ marginTop: 8 }}><button className="btn sm" onClick={() => onImpact(sel)} title="Wer hängt (über bis zu 3 Ebenen) an dieser Stelle – und welche Tests sind betroffen">◎ Wirkungsbereich{sel.m ? " von " + ((sel.m.t === "f" ? c.fields : c.methods)[sel.m.i] || {}).name : ""}</button></div>}
        {text != null && <div className="row" style={{ marginTop: 12 }}>
          <button className="btn sm primary" onClick={() => onEdit(srcFile, jumpLine)} title="Im internen Editor (Shift+E)">✎ Bearbeiten</button>
          <button className="btn sm" onClick={() => onExt(srcFile, jumpLine)} title="In externer IDE an dieser Zeile öffnen (E)">↗ {extLabel}</button>
          <span className="hint">{baseName(srcFile)}:{jumpLine}</span>
        </div>}
      </div>
      <LiveBlock L={live} model={model} sel={sel} onGo={onLiveGo} tick={liveTick} onCtl={onCtl}
        onBp={onBp && mSel && sel.m.t === "m" ? () => onBp({ path: srcFile, line: jumpLine, name: mSel.name.replace(/^(get|set|prop) /, "") }) : null} />
      {myDiag.length > 0 && <div className="blk"><div className="cl"><span className="bad">Probleme</span><span>{myDiag.length}</span></div>
        {myDiag.slice(0, 12).map((d, i) => <button key={i} className="mem" onClick={() => { if (d.target.m) onMember(d.target.id, d.target.m); onEdit(d.path, d.line); }} title={d.msg}>
          <span className="v" style={{ color: d.sev === "error" ? "var(--red)" : "var(--amber)" }}>{d.sev === "error" ? "✕" : "▲"}</span><span className="s">{d.msg}</span><span className="ln">{d.line}</span></button>)}
      </div>}
      <div className="blk"><div className="metrics" style={{ gridTemplateColumns: "repeat(4,1fr)" }}>
        <div className="metric"><div className="ml">{isMod ? "Var." : "Felder"}</div><div className="mv">{c.fields.length}</div></div>
        <div className="metric"><div className="ml">{isMod ? "Funk." : "Meth."}</div><div className="mv">{c.methods.length}</div></div>
        <div className="metric"><div className="ml">Ein</div><div className="mv">{c.inc}</div></div>
        <div className="metric"><div className="ml">Aus</div><div className="mv">{c.out}</div></div>
      </div></div>
      {mSel && (
        <div className="blk">
          <div className="cl"><span>{sel.m.t === "f" ? (isMod ? "Globale Variable" : "Feld / Variable") : isMod ? (mSel.macro ? "Makro" : "Funktion") : "Methode"}</span><span>{baseName(srcFile)}:{mSel.line}</span></div>
          <div className="det">
            {sel.m.t === "f" ? (<>
              <div><b>{mSel.name}</b>{mSel.type ? <>: <span className="acc">{mSel.type}</span></> : <span className="dim"> (Typ unbekannt)</span>}</div>
              <div>Sichtbarkeit <b style={{ color: VIS_TOK[mSel.vis] }}>{mSel.vis}</b>{mSel.static ? " · statisch" : ""}{mSel.isConst ? " · konstant" : ""}{mSel.comp ? " · erzeugt eigenes Objekt (Komposition)" : ""}{mSel.fromCtor ? " · Konstruktor-Parameter" : ""}</div>
              {mSel.init && <div>Initialwert: <b>{mSel.init}</b></div>}
              {mSel.refs && mSel.refs.length > 0 && <div>Verweist auf: {mSel.refs.map((id) => <span key={id} className="chip" onClick={() => onPick(id)}>{model.classes[id].name}</span>)}</div>}
              {mSel.users && mSel.users.length > 0 && (() => {
                const ws = mSel.users.filter((u) => u.w), rs = mSel.users.filter((u) => !u.w);
                const wMods = new Set(ws.map((u) => u.id));
                return (<>
                  {ws.length > 0 && <div><span className="am">Schreibend</span> ({ws.length}): {ws.map((u, k) => chip({ id: u.id, t: "m", i: u.i }, "", "w" + k))}</div>}
                  {rs.length > 0 && <div><span className="ok">Lesend</span> ({rs.length}): {rs.map((u, k) => chip({ id: u.id, t: "m", i: u.i }, "", "r" + k))}</div>}
                  {wMods.size > 1 && <div className="am" style={{ marginTop: 6 }}>⚠ Wird aus {wMods.size} Modulen geschrieben – bei Threads Synchronisation (Mutex/Critical Section) prüfen. [Heuristik]</div>}
                </>);
              })()}
              {mSel.sect && <div>Abschnitt: <b>{mSel.sect}</b></div>}
              {mSel.pk && <div className="am">Primärschlüssel</div>}
            </>) : (<>
              <div style={{ fontStyle: mSel.abstract ? "italic" : "normal" }}><b>{mSel.name}</b>(</div>
              {mSel.params.map((p, i) => <div key={i} style={{ paddingLeft: 14 }}>{p.name || <span className="dim">—</span>}{p.type ? <>: <span className="acc">{p.type}</span></> : null}{p.def ? <span className="dim"> = {p.def}</span> : null}{i < mSel.params.length - 1 ? "," : ""}</div>)}
              <div>){mSel.ret ? <>: <span className="acc">{mSel.ret}</span></> : null}</div>
              <div style={{ marginTop: 6 }}>Sichtbarkeit <b style={{ color: VIS_TOK[mSel.vis] }}>{mSel.vis}</b>{mSel.static ? " · statisch" : ""}{mSel.abstract ? " · abstrakt" : ""}{mSel.ctor ? " · Konstruktor" : ""}</div>
              {mSel.decl && <div className="dim">nur deklariert (Prototyp ohne Rumpf)</div>}
              {mSel.declLine && <div className="dim">Deklaration: {baseName(mSel.declFile || "")}:{mSel.declLine}</div>}
              {(() => {
                const L = mSel.links || [];
                const calls = L.filter((l) => l.kind === "call" || l.kind === "ref"), wr = L.filter((l) => l.kind === "write"), rd = L.filter((l) => l.kind === "read"), us = L.filter((l) => l.kind === "use");
                return (<>
                  {calls.length > 0 && <div>Ruft auf ({calls.length}): {calls.map((l, k) => chip(l, l.kind === "ref" ? " ⇢" : "", "c" + k))}</div>}
                  {mSel.callers && mSel.callers.length > 0 && <div>Aufgerufen von ({mSel.callers.length}): {mSel.callers.map((l, k) => chip({ ...l, t: "m" }, "", "k" + k))}</div>}
                  {wr.length > 0 && <div><span className="am">Schreibt</span>: {wr.map((l, k) => chip(l, "", "w" + k))}</div>}
                  {rd.length > 0 && <div><span className="ok">Liest</span>: {rd.map((l, k) => chip(l, "", "r" + k))}</div>}
                  {us.length > 0 && <div>Tabellen: {us.map((l, k) => chip(l, "", "u" + k))}</div>}
                </>);
              })()}
              {mSel.useIds && mSel.useIds.length > 0 && <div>Typen: {mSel.useIds.map((id) => <span key={id} className="chip" onClick={() => onPick(id)}>{model.classes[id].name}</span>)}</div>}
            </>)}
          </div>
        </div>
      )}
      {sections.filter(([, l]) => l.length).map(([title, list]) => (
        <div className="blk" key={title}>
          <div className="cl"><span>{title}</span><span>{list.length}</span></div>
          <div className="rel">{list.slice(0, 60).map(({ c: t, e }) => (
            <button key={e.id + title} onClick={() => onPick(t.id)}><EdgeIcon type={e.type} /><span className="nm">{t.name}</span><span className="lb">{e.labels.join(", ")}{e.mult === "*" ? " [*]" : ""}</span></button>
          ))}{list.length > 60 && <div className="ext">… +{list.length - 60}</div>}</div>
        </div>
      ))}
      {c.external.length > 0 && <div className="blk"><div className="cl"><span>Extern (nicht im Projekt)</span></div><div className="rel">{c.external.map((x, i) => <div key={i} className="ext">{x.rel} {x.name}</div>)}</div></div>}
      <div className="blk">
        <div className="cl"><span>{isMod ? "Globale Variablen & Konstanten" : "Felder"}</span><span>{c.fields.length}</span></div>
        {c.fields.map((f, i) => (
          <button key={"f" + i} className={"mem" + (f.static ? " st" : "") + (sel.m && sel.m.t === "f" && sel.m.i === i ? " on" : "")} onClick={() => onMember(c.id, { t: "f", i })}>
            <span className="v" style={{ color: VIS_TOK[f.vis] }}>{f.vis}</span><span className="s"><span>{f.name}</span>{f.type && <i>: {f.type}</i>}</span><span className="ln">{f.line}</span>
          </button>
        ))}
        {!c.fields.length && <div className="hint">keine</div>}
      </div>
      <div className="blk">
        <div className="cl"><span>{isMod ? "Funktionen" : "Methoden"}</span><span>{c.methods.length}</span></div>
        {c.methods.map((m, i) => (
          <button key={"m" + i} className={"mem" + (m.static ? " st" : "") + (m.abstract ? " ab" : "") + (sel.m && sel.m.t === "m" && sel.m.i === i ? " on" : "")} onClick={() => onMember(c.id, { t: "m", i })} title={sig(m)}>
            <span className="v" style={{ color: VIS_TOK[m.vis] }}>{m.vis}</span><span className="s"><span style={{ color: m.ctor ? "var(--accent2)" : undefined }}>{m.name}</span><i>({m.params.map((p) => p.name).join(", ")}){m.ret ? ": " + m.ret : ""}</i></span><span className="ln">{m.line}</span>
          </button>
        ))}
        {!c.methods.length && <div className="hint">keine</div>}
      </div>
      <div className="blk">
        <div className="cl"><span>Quelltext · Zeile anklicken = bearbeiten</span><span>{lines ? `${from + 1}–${to}` : "—"}</span></div>
        {lines ? (
          <pre className="src">{lines.slice(from, to).map((l, i) => <span key={i} className={"l" + (from + i + 1 === hlLine ? " hl" : "")} onClick={() => onEdit(srcFile, from + i + 1)}><span className="n">{from + i + 1}</span>{l || " "}</span>)}</pre>
        ) : <div className="hint">Kein Quelltext verfügbar (synthetische Daten).</div>}
      </div>
    </aside>
  );
});

/* ============================ Konsole: Code-Editor ============================ */
const LH = 19;
const CodeEditor = memo(function CodeEditor({ files, writable, wsLabel, req, diags, hlRange, onSave, onExt, onLocate, extLabel, notify }) {
  const [bufs, setBufs] = useState(() => new Map());   // path -> { text, base, mtime }
  const [cur, setCur] = useState(null);
  const [caret, setCaret] = useState(1);
  const [conflict, setConflict] = useState(null);
  const [saving, setSaving] = useState(false);
  const scRef = useRef(null), taRef = useRef(null);
  const pendingLine = useRef(null);

  // Öffnen-Anfragen
  useEffect(() => {
    if (!req || !req.path) return;
    const e = files.get(req.path);
    if (!e) { notify("Datei nicht im Projekt: " + req.path, "bad"); return; }
    if (e.text == null) { notify("Binärdatei oder zu groß – kann nicht angezeigt werden", "bad"); return; }
    setBufs((m) => { if (m.has(req.path)) return m; const n = new Map(m); n.set(req.path, { text: e.text, base: e.text, mtime: e.mtime }); return n; });
    setCur(req.path); pendingLine.current = req.line || 1;
  }, [req]); // eslint-disable-line
  // externe Änderungen übernehmen / Konflikt melden
  useEffect(() => {
    setBufs((m) => {
      let n = null;
      for (const [p, b] of m) {
        const e = files.get(p);
        if (!e) continue;
        if (e.text !== b.base) {
          if (b.text === b.base) { n = n || new Map(m); n.set(p, { text: e.text, base: e.text, mtime: e.mtime }); }
          else if (p === cur) setConflict({ path: p, text: e.text, mtime: e.mtime });
        }
      }
      return n || m;
    });
  }, [files]); // eslint-disable-line
  const buf = cur ? bufs.get(cur) : null;
  const dirty = buf && buf.text !== buf.base;
  // Zeile anspringen
  useEffect(() => {
    const ln = pendingLine.current; if (!buf || ln == null) return;
    pendingLine.current = null;
    requestAnimationFrame(() => {
      const sc = scRef.current, ta = taRef.current; if (!sc || !ta) return;
      sc.scrollTop = Math.max(0, (ln - 1) * LH - sc.clientHeight / 3);
      sc.scrollLeft = 0;
      const lines = buf.text.split("\n"); let off = 0; for (let i = 0; i < ln - 1 && i < lines.length; i++) off += lines[i].length + 1;
      try { ta.setSelectionRange(off, off); } catch { /* ignore */ }
      setCaret(ln);
    });
  }, [buf, req]); // eslint-disable-line
  const html = useMemo(() => (buf ? highlight(buf.text, cur) + "\n " : ""), [buf && buf.text, cur]); // eslint-disable-line
  const nLines = buf ? buf.text.split("\n").length : 0;
  const myDiags = useMemo(() => { const m = new Map(); for (const d of diags || []) if (d.path === cur && d.sev !== "note") { const o = m.get(d.line); if (!o || d.sev === "error") m.set(d.line, d); } return m; }, [diags, cur]);
  const setText = (t) => setBufs((m) => { const n = new Map(m); n.set(cur, { ...m.get(cur), text: t }); return n; });
  const save = async (force) => {
    if (!buf || !dirty || saving) return;
    setSaving(true);
    try {
      const r = await onSave(cur, buf.text, { force, mtime: buf.mtime });
      if (r && r.conflict) { setConflict({ path: cur, text: null }); return; }
      setBufs((m) => { const n = new Map(m); n.set(cur, { text: buf.text, base: buf.text, mtime: r && r.mtime }); return n; });
      setConflict(null);
    } catch (e) { notify("Speichern fehlgeschlagen: " + e.message, "bad"); }
    finally { setSaving(false); }
  };
  const close = (p, ev) => {
    ev && ev.stopPropagation();
    setBufs((m) => { const n = new Map(m); n.delete(p); return n; });
    if (p === cur) { const rest = [...bufs.keys()].filter((x) => x !== p); setCur(rest[rest.length - 1] || null); }
  };
  const onKey = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); save(); return; }
    if (e.key === "Tab" && !e.shiftKey) {
      e.preventDefault();
      const ins = /^\t/m.test(buf.text) ? "\t" : "    ";
      if (!document.execCommand || !document.execCommand("insertText", false, ins)) {
        const ta = e.target, a = ta.selectionStart, b = ta.selectionEnd; setText(buf.text.slice(0, a) + ins + buf.text.slice(b));
        requestAnimationFrame(() => ta.setSelectionRange(a + ins.length, a + ins.length));
      }
    }
  };
  const caretUpd = (e) => { const ta = e.target; setCaret(ta.value.slice(0, ta.selectionStart).split("\n").length); };
  const tabs = [...bufs.keys()];
  if (!cur) return (
    <div className="ed-empty">
      <div className="kicker">Editor</div>
      <p>Wähle im Diagramm eine Klasse, Funktion oder Variable und klicke <b>✎ Bearbeiten</b> – oder öffne eine Datei im Tab <b>Dateien</b>.</p>
      <p className="hint">{writable ? `Speichern mit Strg+S → ${wsLabel}` : "Nur Lesen."} Die Analyse aktualisiert sich nach dem Speichern automatisch.</p>
    </div>
  );
  const band = hlRange && hlRange.path === cur ? hlRange : null;
  return (
    <div className="ed">
      <div className="ed-tabs">
        {tabs.map((p) => { const b = bufs.get(p); return (
          <div key={p} className={"ed-tab" + (p === cur ? " on" : "")} onClick={() => setCur(p)} title={p}>
            {b.text !== b.base && <i className="dirty" />}{baseName(p)}<span className="x" onClick={(e) => close(p, e)}>✕</span>
          </div>); })}
      </div>
      <div className="ed-bar">
        <span className="path">{cur}</span><span>Z. {caret}</span>
        <span>{(files.get(cur) || {}).encoding || "utf-8"} · {(files.get(cur) || {}).eol === "\r\n" ? "CRLF" : "LF"}</span>
        <span className="sp" />
        <button className="btn sm" onClick={() => onLocate(cur, caret)} title="Symbol an dieser Zeile im Diagramm zeigen">⌖ Im Diagramm</button>
        <button className="btn sm" onClick={() => onExt(cur, caret)} title="In externem Editor/IDE öffnen (E)">↗ {extLabel}</button>
        {writable && <button className={"btn sm" + (dirty ? " primary" : "")} disabled={!dirty || saving} onClick={() => save()}>{saving ? "…" : "Speichern"}</button>}
        {dirty && <button className="btn sm" onClick={() => setText(buf.base)}>Verwerfen</button>}
      </div>
      {conflict && conflict.path === cur && (
        <div className="ed-conf">Datei wurde extern geändert.
          <button className="btn sm" onClick={() => { const e = files.get(cur); setBufs((m) => { const n = new Map(m); n.set(cur, { text: e.text, base: e.text, mtime: e.mtime }); return n; }); setConflict(null); }}>Neu laden</button>
          <button className="btn sm amber" onClick={() => { setConflict(null); save(true); }}>Meine Version speichern</button>
        </div>
      )}
      <div className="ed-scroll" ref={scRef}>
        <div className="ed-grid">
          <div className="ed-gut">
            {Array.from({ length: nLines }, (_, i) => { const d = myDiags.get(i + 1); return (
              <div key={i} className={d ? (d.sev === "error" ? "e" : "w") : ""} title={d ? d.msg : "Im Diagramm zeigen"} onClick={() => onLocate(cur, i + 1)}>{i + 1}</div>); })}
          </div>
          <div className="ed-code">
            {band && <div className="ed-band sel" style={{ top: 6 + (band.from - 1) * LH, height: (band.to - band.from + 1) * LH }} />}
            {[...myDiags.values()].map((d) => <div key={"d" + d.line} className={"ed-band " + (d.sev === "error" ? "e" : "w")} style={{ top: 6 + (d.line - 1) * LH, height: LH }} />)}
            <pre aria-hidden="true" dangerouslySetInnerHTML={{ __html: html }} />
            <textarea ref={taRef} value={buf.text} readOnly={!writable} wrap="off" spellCheck={false} autoCapitalize="off" autoCorrect="off"
              onChange={(e) => setText(e.target.value)} onKeyDown={onKey} onKeyUp={caretUpd} onClick={caretUpd} aria-label={"Quelltext " + cur} />
          </div>
        </div>
      </div>
    </div>
  );
});

/* ============================ Konsole: Dateien ============================ */
const FilesTab = memo(function FilesTab({ files, onEdit, onExt }) {
  const [f, setF] = useState("");
  const [closed, setClosed] = useState(() => new Set());
  const list = useMemo(() => [...files.values()].sort((a, b) => a.path.localeCompare(b.path)), [files]);
  const shown = useMemo(() => { const s = f.trim().toLowerCase(); return s ? list.filter((e) => e.path.toLowerCase().includes(s)) : list; }, [list, f]);
  const byDir = useMemo(() => { const m = new Map(); for (const e of shown.slice(0, 3000)) { const d = dirOf(e.path); if (!m.has(d)) m.set(d, []); m.get(d).push(e); } return m; }, [shown]);
  const cnt = { code: 0, text: 0, bin: 0 }; for (const e of list) cnt[e.kind]++;
  const size = (n) => (n > 1e6 ? de(n / 1e6, 1) + " MB" : n > 1e3 ? de(n / 1e3, 1) + " KB" : de(n) + " B");
  return (
    <div className="tab-pad">
      <div className="row" style={{ marginBottom: 8 }}>
        <input className="txt" style={{ maxWidth: 320 }} placeholder="Dateien filtern …" value={f} onChange={(e) => setF(e.target.value)} />
        <span className="hint">{de(list.length)} Dateien · <span className="ok">{cnt.code} Code</span> · {cnt.text} Text · <span className="mut">{cnt.bin} binär</span></span>
      </div>
      <div className="ftree">
        {[...byDir.entries()].map(([d, es]) => (
          <div key={d}>
            <div className="fdir" onClick={() => setClosed((s) => { const n = new Set(s); n.has(d) ? n.delete(d) : n.add(d); return n; })}>{closed.has(d) ? "▸" : "▾"} {d}/ <span className="mut">{es.length}</span></div>
            {!closed.has(d) && es.map((e) => (
              <div key={e.path} className={"frow " + e.kind} onClick={() => e.text != null && onEdit(e.path, 1)}>
                <span className="fk">{e.kind === "code" ? (langOf(e.path, e.text || "") || {}).lang || "code" : e.kind === "text" ? extOf(e.path) || "txt" : "bin"}</span>
                <span className="fn">{baseName(e.path)}</span>
                {e.dirty && <span className="am">● geändert</span>}
                <span className="fs">{size(e.size || (e.text || "").length)}</span>
                {e.text != null && <button className="btn sm" onClick={(ev) => { ev.stopPropagation(); onExt(e.path, 1); }} title="Extern öffnen">↗</button>}
              </div>
            ))}
          </div>
        ))}
        {shown.length > 3000 && <div className="hint">… {de(shown.length - 3000)} weitere – Filter nutzen.</div>}
      </div>
    </div>
  );
});

/* ============================ Konsole: Volltextsuche ============================ */
const SearchTab = memo(function SearchTab({ files, ws, onEdit, onExt }) {
  const [q, setQ] = useState(""), [rx, setRx] = useState(false), [cs, setCs] = useState(false);
  const [res, setRes] = useState(null), [busy, setBusy] = useState(false), [err, setErr] = useState("");
  const run = async () => {
    if (!q) return; setErr(""); setBusy(true);
    try {
      if (ws && ws.kind === "bridge") { const r = await ws.search(q, { regex: rx, case: cs }); setRes({ ...r, src: "Bridge (alle Dateien auf der Platte)" }); }
      else {
        const re = new RegExp(rx ? q : q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), cs ? "" : "i");
        const hits = []; let nf = 0;
        for (const e of files.values()) {
          if (e.text == null) continue; let found = false;
          const ls = e.text.split("\n");
          for (let i = 0; i < ls.length; i++) { const m = re.exec(ls[i]); if (m) { found = true; hits.push({ path: e.path, line: i + 1, col: m.index + 1, text: ls[i].slice(0, 300) }); if (hits.length >= 2000) break; } }
          nf += found; if (hits.length >= 2000) break;
        }
        setRes({ hits, files: nf, truncated: hits.length >= 2000, src: "geladene Dateien" });
      }
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const grouped = useMemo(() => { const m = new Map(); for (const h of (res && res.hits) || []) { if (!m.has(h.path)) m.set(h.path, []); m.get(h.path).push(h); } return m; }, [res]);
  const mark = (t, col) => { const n = Math.max(1, q.length); const a = col - 1; return <>{t.slice(0, a)}<mark>{t.slice(a, a + (rx ? (new RegExp(q, cs ? "" : "i").exec(t.slice(a)) || [""])[0].length || n : n))}</mark>{t.slice(a + n)}</>; };
  return (
    <div className="tab-pad">
      <div className="row" style={{ marginBottom: 8 }}>
        <input className="txt" style={{ maxWidth: 360 }} placeholder="Text oder Regex in allen Dateien …" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && run()} />
        <label className="chk"><input type="checkbox" checked={rx} onChange={(e) => setRx(e.target.checked)} />Regex</label>
        <label className="chk"><input type="checkbox" checked={cs} onChange={(e) => setCs(e.target.checked)} />Groß/klein</label>
        <button className="btn primary sm" onClick={run} disabled={busy || !q}>{busy ? "…" : "Suchen"}</button>
        {res && <span className="hint">{de(res.hits.length)}{res.truncated ? "+" : ""} Treffer in {res.files} Dateien · {res.src}</span>}
      </div>
      {err && <div className="bad hint">{err}</div>}
      <div className="sres">
        {[...grouped.entries()].map(([p, hs]) => (
          <div key={p}><div className="fdir">{p} <span className="mut">{hs.length}</span></div>
            {hs.slice(0, 200).map((h, i) => (
              <div key={i} className="srow" onClick={() => onEdit(h.path, h.line)}>
                <span className="ln">{h.line}</span><span className="tx">{mark(h.text, h.col)}</span>
                <button className="btn sm" onClick={(ev) => { ev.stopPropagation(); onExt(h.path, h.line, h.col); }}>↗</button>
              </div>))}
          </div>))}
      </div>
    </div>
  );
});

/* ============================ Konsole: Probleme (Build / Compiler-Ausgabe) ============================ */
const ProblemsTab = memo(function ProblemsTab({ ws, diag, model, runBuild, setPasted, clear, onGo, onExt, building, onAskAI }) {
  const [preset, setPreset] = useState(() => lsGet("cal-preset", "0"));
  const [pasteOpen, setPasteOpen] = useState(false), [txt, setTxt] = useState("");
  const items = diag ? diag.items : [];
  const nE = items.filter((d) => d.sev === "error").length, nW = items.filter((d) => d.sev === "warning").length;
  const presets = ws && ws.presets ? ws.presets : [];
  useEffect(() => { lsSet("cal-preset", preset); }, [preset]);
  const grouped = useMemo(() => { const m = new Map(); for (const d of items) { const k = d.path || d.file; if (!m.has(k)) m.set(k, []); m.get(k).push(d); } return m; }, [items]);
  return (
    <div className="tab-pad">
      <div className="row" style={{ marginBottom: 8 }}>
        {presets.length > 0 ? (<>
          <select className="txt" style={{ width: "auto", maxWidth: 340 }} value={preset} onChange={(e) => setPreset(e.target.value)} title={(presets.find((p) => p.id === preset) || {}).cmd}>
            {presets.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
          <button className="btn primary sm" disabled={building} onClick={() => runBuild(preset)}>{building ? "Läuft …" : "▶ Build / Prüfen"}</button>
        </>) : <span className="hint">{ws && ws.kind === "bridge" ? "Bridge hat keinen Compiler gefunden (--build \"Name=Befehl\")." : "Build direkt aus der App: Bridge verbinden (⚙)."}</span>}
        <button className={"btn sm" + (pasteOpen ? " on" : "")} onClick={() => setPasteOpen(!pasteOpen)}>Compiler-Ausgabe einfügen</button>
        {diag && <button className="btn sm" onClick={clear}>Leeren</button>}
        {diag && nE > 0 && onAskAI && <button className="btn sm amber" onClick={() => onAskAI(items, diag.src)} title="Die Fehler als Auftrag in die KI-Eingabe übernehmen">✦ Fehler an KI geben</button>}
        {diag && <span className="hint">{diag.src} · <span className={nE ? "bad" : "ok"}>{nE} Fehler</span> · <span className={nW ? "am" : "mut"}>{nW} Warnungen</span>{diag.ms != null && ` · ${de(diag.ms / 1000, 1)} s`}{diag.code != null && ` · Exit ${diag.code}`}</span>}
      </div>
      {pasteOpen && (
        <div style={{ marginBottom: 10 }}>
          <textarea className="txt" style={{ minHeight: 110, fontSize: 11.5 }} value={txt} onChange={(e) => setTxt(e.target.value)} spellCheck={false}
            placeholder={"Build-Log von Code::Blocks, gcc, clang, MSVC, tsc, javac, rustc oder Python einfügen …\nz. B.  ..\\main.c:13:25: error: 'NULL' undeclared"} />
          <div className="row" style={{ marginTop: 6 }}><button className="btn primary sm" disabled={!txt.trim()} onClick={() => { setPasted(txt); setPasteOpen(false); }}>Auswerten</button>
            <span className="hint">Erkennt gcc/clang/rustc/javac (datei:zeile:spalte), MSVC/tsc/C# (datei(zeile,spalte)), Python-Tracebacks und Code::Blocks „Build messages“.</span></div>
        </div>
      )}
      {diag && !items.length && <div className="ok hint">{diag.code === 0 || diag.code == null ? "✓ Keine Fehler oder Warnungen gefunden." : "Keine Diagnosen erkannt – siehe Ausgabe unten."}</div>}
      <div className="sres">
        {[...grouped.entries()].map(([p, ds]) => (
          <div key={p}><div className="fdir">{p || "?"} {!ds[0].path && <span className="bad">nicht im Projekt</span>}</div>
            {ds.map((d, i) => (
              <div key={i} className={"srow dg " + d.sev} onClick={() => onGo(d)}>
                <span className="sv">{d.sev === "error" ? "✕" : d.sev === "warning" ? "▲" : "i"}</span>
                <span className="ln">{d.line}:{d.col}</span>
                <span className="tx">{d.msg}</span>
                {d.target && model && <span className="tg">{qn(model, d.target.id, d.target.m)}</span>}
                {d.path && <button className="btn sm" onClick={(ev) => { ev.stopPropagation(); onExt(d.path, d.line, d.col); }}>↗</button>}
              </div>))}
          </div>))}
      </div>
      {diag && diag.log && (
        <details className="adv" style={{ marginTop: 10 }}><summary>Rohausgabe{diag.cmd ? " · " + short(diag.cmd, 90) : ""}</summary>
          <pre className="log">{diag.log.split("\n").map((l, i) => <span key={i} className={/error|fehler/i.test(l) ? "bad" : /warn/i.test(l) ? "am" : ""}>{l + "\n"}</span>)}</pre>
        </details>
      )}
    </div>
  );
});

/* ============================ Konsole: Symboltabelle ============================ */
const SymbolsTab = memo(function SymbolsTab({ model, onPick, onEdit }) {
  const [f, setF] = useState(""), [kind, setKind] = useState("all"), [sort, setSort] = useState({ k: "file", d: 1 });
  const rows = useMemo(() => (model ? symbolRows(model) : []), [model]);
  const shown = useMemo(() => {
    const s = f.trim().toLowerCase();
    let r = rows.filter((x) => (kind === "all" || (kind === "node" ? x.kind === "node" : kind === "fn" ? x.kind === "m" : x.kind === "f")) && (!s || (x.owner + "." + x.name + " " + x.sig + " " + x.file).toLowerCase().includes(s)));
    const k = sort.k; r = r.slice().sort((a, b) => (typeof a[k] === "number" ? a[k] - b[k] : String(a[k]).localeCompare(String(b[k]))) * sort.d || a.line - b.line);
    return r;
  }, [rows, f, kind, sort]);
  const H = ({ k, children }) => <th onClick={() => setSort({ k, d: sort.k === k ? -sort.d : 1 })}>{children}{sort.k === k ? (sort.d > 0 ? " ▴" : " ▾") : ""}</th>;
  return (
    <div className="tab-pad">
      <div className="row" style={{ marginBottom: 8 }}>
        <input className="txt" style={{ maxWidth: 320 }} placeholder="Symbole filtern …" value={f} onChange={(e) => setF(e.target.value)} />
        <div className="seg">{[["all", "Alle"], ["node", "Klassen/Module"], ["fn", "Funktionen"], ["var", "Variablen/Felder"]].map(([k, l]) => <button key={k} className={kind === k ? "on" : ""} onClick={() => setKind(k)}>{l}</button>)}</div>
        <span className="hint">{de(shown.length)} von {de(rows.length)}</span>
      </div>
      <div className="tblwrap">
        <table className="stbl">
          <thead><tr><H k="owner">Gehört zu</H><H k="name">Name</H><H k="art">Art</H><th>Typ / Signatur</th><H k="vis">Sicht.</H><H k="file">Ort</H><H k="a">Ein</H><H k="b">Aus</H></tr></thead>
          <tbody>{shown.slice(0, 500).map((r, i) => (
            <tr key={i} onClick={() => onPick(r.id, r.m)} onDoubleClick={() => onEdit(r.path, r.line)}>
              <td className="mut">{r.owner}</td><td><b>{r.name}</b></td><td>{r.art}</td><td className="mut sig">{r.sig}</td>
              <td style={{ color: VIS_TOK[r.vis] }}>{r.vis}</td><td className="mut">{r.file}:{r.line}</td><td>{r.a}</td><td>{r.b}</td>
            </tr>))}
          </tbody>
        </table>
        {shown.length > 500 && <div className="hint" style={{ padding: 8 }}>… {de(shown.length - 500)} weitere – Filter nutzen oder als CSV exportieren.</div>}
      </div>
      <div className="hint" style={{ marginTop: 6 }}>Klick = im Diagramm zeigen · Doppelklick = im Editor öffnen · „Ein/Aus“: Kanten · Aufrufer/Aufrufe · Lese-/Schreibzugriffe</div>
    </div>
  );
});

/* ============================ Konsole: Export ============================ */
const ExportTab = memo(function ExportTab({ model, project, sel, png, files }) {
  const [scope, setScope] = useState("all"); const [prev, setPrev] = useState("");
  if (!model) return <div className="tab-pad hint">Kein Projekt geladen.</div>;
  const ids = scopeIds(model, scope, sel);
  const base = (project.name || "projekt").replace(/[^\w.-]+/g, "_");
  const changed = [...files.values()].filter((e) => e.dirty);
  const zip = async () => { const JSZip = await loadJSZip(); const z = new JSZip(); for (const e of changed) z.file(e.path, encodeText(e.text, e.encoding, e.eol)); download(base + "_geaendert.zip", await z.generateAsync({ type: "blob" })); };
  return (
    <div className="tab-pad">
      <div className="row" style={{ marginBottom: 10 }}>
        <span className="hint">Umfang</span>
        <div className="seg">{[["all", "Alles"], ["nb", "Auswahl + Nachbarn"], ["module", "Modul der Auswahl"]].map(([k, l]) => <button key={k} className={scope === k ? "on" : ""} disabled={k !== "all" && !sel} onClick={() => setScope(k)}>{l}</button>)}</div>
        <span className="hint">{de(ids.size)} Knoten</span>
      </div>
      <div className="xgrid">
        <button className="btn" onClick={() => download(base + "_modell.json", exportModelJSON(model, project.name, ids), "application/json")}>Modell · JSON<small>Klassen, Funktionen, Variablen, Aufrufe, Lese/Schreib, Kanten</small></button>
        <button className="btn" onClick={() => download(base + "_symbole.csv", csv([["Gehört zu", "Name", "Art", "Typ/Signatur", "Sichtbarkeit", "Datei", "Zeile", "Ein", "Aus"], ...symbolRows(model, ids).map((r) => [r.owner, r.name, r.art, r.sig, r.vis, r.file, r.line, r.a, r.b])]), "text/csv")}>Symbole · CSV<small>Excel-tauglich (;)</small></button>
        <button className="btn" onClick={() => download(base + "_kanten.csv", csv([["Von", "Nach", "Art", "Bezeichnungen", "Multiplizität"], ...model.edges.filter((e) => ids.has(e.from) && ids.has(e.to)).map((e) => [model.classes[e.from].name, model.classes[e.to].name, EDGE_T[e.type].label, e.labels.join(", "), e.mult])]), "text/csv")}>Kanten · CSV<small>Beziehungsliste</small></button>
        <button className="btn" onClick={() => setPrev(exportMermaid(model, ids))}>Mermaid<small>classDiagram – für Markdown/Obsidian</small></button>
        <button className="btn" onClick={() => setPrev(exportPlantUML(model, ids))}>PlantUML<small>@startuml … für Berichte</small></button>
        <button className="btn" onClick={() => download(base + "_ansicht.png", png())}>Ansicht · PNG<small>aktueller Bildausschnitt</small></button>
        {changed.length > 0 && <button className="btn amber" onClick={zip}>Geänderte Dateien · ZIP<small>{changed.length} im Speicher bearbeitet</small></button>}
      </div>
      {prev && (<div style={{ marginTop: 10 }}>
        <div className="row" style={{ marginBottom: 6 }}>
          <button className="btn sm" onClick={() => { navigator.clipboard && navigator.clipboard.writeText(prev); }}>Kopieren</button>
          <button className="btn sm" onClick={() => download(base + (prev.startsWith("@startuml") ? ".puml" : ".mmd"), prev)}>Herunterladen</button>
          <button className="btn sm" onClick={() => setPrev("")}>Schließen</button>
        </div>
        <textarea className="txt" readOnly value={prev} style={{ minHeight: 160, fontSize: 11.5 }} />
      </div>)}
    </div>
  );
});

/* ============================ Konsole: Ausführen (Live) ============================ */
const fmtUs = (us) => (us == null ? "" : us >= 1e6 ? de(us / 1e6, 2) + " s" : us >= 1000 ? de(us / 1000, 1) + " ms" : de(us) + " µs");
const fmtTs = (us) => de((us || 0) / 1e6, 3) + " s";
const runCol = (R) => `var(--${RUN_TOK[(R ? R.n : 0) % RUN_TOK.length]})`;
const runShort = (R) => { if (!R) return "?"; const l = (R.label || "").replace(/^[^:]{1,14}:\s*/, ""), f = l.split(" ")[0].split(/[\\/]/).pop().replace(/\.[a-z0-9]+$/i, ""); return (f || l) + (R.args ? " " + R.args.split(" ")[0] : ""); };
const SLOWS = [[0, "Aus"], [20, "20 ms"], [100, "0,1 s"], [500, "0,5 s"], [2000, "2 s"]];
function runEndTxt(R) {
  if (!R) return "bereit";
  if (R.status === "building") return "● übersetzt …";
  if (R.status === "running") return R.dbg && R.dbg.paused ? "⏸ angehalten" : "● läuft";
  if (!R.end) return "■ beendet";
  return R.end.code === 0 && !R.end.reason ? "■ beendet (0)" : `■ beendet (${R.end.code}${R.end.reason ? " · " + R.end.reason : ""})`;
}
function DebugBar({ L, onCtl, onBpClear, running }) {
  const d = L.dbg, paused = d.mode === "pause";
  const nPaused = [...L.threads.values()].filter((t) => t.paused).length;
  return (
    <div className={"dbg-bar" + (paused ? " on" : "")}>
      <span className="kicker" style={{ margin: 0 }}>Debugger</span>
      {!paused ? <button className="btn sm" onClick={() => onCtl({ mode: "pause" })} title="Alle Läufe am nächsten Funktionsaufruf anhalten">⏸ Pause</button>
        : <button className="btn primary sm" onClick={() => onCtl({ mode: "run" })} title="Weiterlaufen">▶ Weiter</button>}
      <button className="btn sm" onClick={() => onCtl({ mode: "pause", step: 1 })} title="Einen Funktionsaufruf weiter (dann wieder Pause)">⏭ Schritt</button>
      <span className="hint">Zeitlupe</span>
      <div className="seg">{SLOWS.map(([v, l]) => <button key={v} className={d.slow === v ? "on" : ""} onClick={() => onCtl({ slow: v })} title={v ? `Jeder Funktionsaufruf wartet ${l}` : "volle Geschwindigkeit"}>{l}</button>)}</div>
      <span className={L.bps.length ? "bad" : "mut"} title="Haltepunkte setzt du im Detailfenster einer Funktion (● Haltepunkt)">● {L.bps.length} Haltepunkt{L.bps.length === 1 ? "" : "e"}</span>
      {L.bps.length > 0 && <button className="btn sm ghost" onClick={onBpClear}>alle löschen</button>}
      {paused && running && <span className="am" style={{ marginLeft: "auto" }}>{d.reason === "Haltepunkt" ? "● Haltepunkt erreicht" : "⏸ angehalten"}{nPaused ? ` · ${nPaused} Thread${nPaused > 1 ? "s" : ""} stehen` : " · wartet auf nächsten Aufruf"}</span>}
    </div>
  );
}
function PausedVars({ p }) {
  if (!p) return null;
  return (
    <div className="pvars">
      {p.args && <div><span className="mut">Argumente </span><span className="acc">({p.args})</span></div>}
      {(p.locals || []).length > 0 && <div className="pv">{p.locals.map(([n, v], i) => <span key={i}><b>{n}</b> = {v}</span>)}</div>}
    </div>
  );
}
const RunTab = memo(function RunTab({ ws, L, tick, onStart, onStop, onStdin, onReset, onGo, onCtl, onBpClear }) {
  const presets = (ws && ws.runPresets) || [];
  const [preset, setPreset] = useState(() => lsGet("cal-runp", "0"));
  const [args, setArgs] = useState(() => lsGet("cal-runa", ""));
  const [trace, setTrace] = useState(true);
  const [pane, setPane] = useState("events");
  const [inp, setInp] = useState("");
  const [freeze, setFreeze] = useState(false);
  const [onlyErr, setOnlyErr] = useState(false);
  const [group, setGroup] = useState(() => { try { return JSON.parse(lsGet("cal-runm", "[]")); } catch { return []; } });
  const [showGroup, setShowGroup] = useState(false);
  const [focus, setFocus] = useState(0); // 0 = alle Läufe
  const conRef = useRef(null), evRef = useRef(null);
  useEffect(() => { lsSet("cal-runp", preset); lsSet("cal-runa", args); }, [preset, args]);
  useEffect(() => { lsSet("cal-runm", JSON.stringify(group)); }, [group]);
  useEffect(() => { const c = conRef.current; if (c && c.scrollHeight - c.scrollTop - c.clientHeight < 80) c.scrollTop = c.scrollHeight; }, [tick, focus]);
  useEffect(() => { const c = evRef.current; if (c && !freeze && c.scrollHeight - c.scrollTop - c.clientHeight < 80) c.scrollTop = c.scrollHeight; }, [tick, freeze]);
  useEffect(() => { if (focus && !L.runs.has(focus)) setFocus(0); }, [tick, focus, L.runs]);
  useEffect(() => { if (L.pauseFocus) setPane("threads"); }, [L.pauseFocus]);
  const frozen = useRef(null);
  const errGroups = useMemo(() => {
    const m = new Map();
    for (const r of L.errors) { if (focus && r.run !== focus) continue; const key = r.i + "|" + r.msg.replace(/\d+/g, "#") + "|" + (r.handled != null) + "|" + r.fatal; const g = m.get(key); if (g) { g.n++; g.last = r; } else m.set(key, { ...r, n: 1, last: r }); }
    return [...m.values()].sort((a, b) => (b.fatal - a.fatal) || ((b.handled == null) - (a.handled == null)) || b.last.ts - a.last.ts);
  }, [L.errors.length, tick, focus]); // eslint-disable-line
  if (!ws || ws.kind !== "bridge") return (
    <div className="tab-pad">
      <div className="kicker" style={{ marginBottom: 8 }}>Ausführen mit Live-Ansicht</div>
      <p className="hint">Zum Ausführen braucht der Atlas die Bridge (⚙ Verbindungen → Projekt laden). Sie startet dein Programm mit Messpunkten und überträgt Aufrufe, Daten und Fehler live – auch mehrere Programme gleichzeitig (Server + Clients) und mit Debugger (Pause, Schritt, Zeitlupe, Haltepunkte).</p>
      <div className="info-row"><span className="info-dot" /><span><b>Python</b> (ab 3.12 exakt über sys.monitoring): jede Funktion, Argumente, Rückgaben, Exceptions, Threads, Queue-/Socket-Signale.</span></div>
      <div className="info-row"><span className="info-dot" style={{ background: "var(--amber)" }} /><span><b>C/C++</b> (gcc/MinGW, Code::Blocks-.cbp): jede Funktion, Dauer, Thread-Stacks, send/recv, Absturz mit Aufrufstack.</span></div>
      <div className="info-row"><span className="info-dot" style={{ background: "var(--violet)" }} /><span><b>Andere</b> (<code>--run "Name=Befehl"</code>): Konsole live, Stacktraces werden rot im Diagramm markiert.</span></div>
    </div>
  );
  const runs = [...L.runs.values()].sort((a, b) => a.n - b.n);
  const anyRunning = runs.some((r) => r.status === "running" || r.status === "building");
  const FR = focus ? L.runs.get(focus) : null;
  const stdinRun = FR && FR.status === "running" ? FR : runs.filter((r) => r.status === "running").length === 1 ? runs.find((r) => r.status === "running") : null;
  const p = presets.find((x) => x.id === preset) || presets[0];
  const allEv = freeze ? (frozen.current || L.events) : L.events;
  if (!freeze) frozen.current = null; else if (!frozen.current) frozen.current = L.events.slice();
  const evs = focus ? allEv.filter((e) => e.run === focus) : allEv;
  const shownEv = (onlyErr ? evs.filter((e) => "xuFh".includes(e.k)) : evs).slice(-400);
  const thCol = (key) => `var(--${THREAD_TOK[((L.threads.get(key) || { n: 0 }).n) % THREAD_TOK.length]})`;
  const nm = (i) => codeName(L, i);
  const goCode = (i, line) => { const c = L.codes.get(i); if (c) onGo(c, line); };
  const multi = runs.length > 1;
  const outs = (focus ? L.out.filter((l) => l.run === focus) : L.out).slice(-1500);
  const chans = [...L.chan.values()].filter((c) => !focus || c.runs.has(focus)).sort((a, b) => (b.net - a.net) || (b.sent + b.recv - (a.sent + a.recv)));
  const exts = []; for (const c of L.codes.values()) if (!focus || c.run === focus) for (const [n, [cnt, e]] of c.ext) exts.push({ c, n, cnt, e });
  exts.sort((a, b) => b.cnt - a.cnt);
  const nErr = L.errors.filter((r) => r.handled == null && (!focus || r.run === focus)).length;
  const threads = [...L.threads.values()].filter((t) => !focus || t.run === focus).sort((a, b) => (!!b.paused - !!a.paused) || a.run - b.run || a.tid - b.tid);
  const inGroup = (id) => group.find((g) => g.id === id);
  const toggleGroup = (id) => setGroup((g) => (g.find((x) => x.id === id) ? g.filter((x) => x.id !== id) : [...g, { id, args: "", n: 1 }]));
  const setG = (id, patch) => setGroup((g) => g.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const startGroup = () => {
    const list = [];
    for (const g of group) { const pr = presets.find((x) => x.id === g.id); if (!pr) continue; for (let i = 0; i < Math.max(1, Math.min(8, g.n || 1)); i++) list.push({ preset: g.id, args: (g.args || "").replace(/\{n\}/g, String(i + 1)), trace: trace && pr.kind !== "cmd" }); }
    if (list.length) onStart(list);
  };
  return (
    <div className="run">
      <div className="run-bar">
        <select className="txt" style={{ width: "auto", maxWidth: 260 }} value={p ? p.id : ""} onChange={(e) => setPreset(e.target.value)}>
          {presets.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
          {!presets.length && <option>– kein Startpunkt gefunden –</option>}
        </select>
        <input className="txt" style={{ width: 150 }} placeholder="Argumente" value={args} onChange={(e) => setArgs(e.target.value)} />
        <label className="chk" title="Funktionsaufrufe aufzeichnen (verlangsamt das Programm etwas); nötig für Debugger"><input type="checkbox" checked={trace} onChange={(e) => setTrace(e.target.checked)} disabled={p && p.kind === "cmd"} />Live-Trace</label>
        <button className="btn primary sm" disabled={!p} onClick={() => onStart([{ preset: p.id, args, trace: trace && p.kind !== "cmd" }])} title={anyRunning ? "Zusätzlich starten – läuft parallel zu den anderen" : "Starten"}>▶ {anyRunning ? "Zusätzlich starten" : "Starten"}</button>
        <button className={"btn sm" + (showGroup ? " on" : "")} onClick={() => setShowGroup((v) => !v)} title="Mehrere Programme gemeinsam starten (z. B. Server + Clients)">⧉ Gruppe{group.length ? " (" + group.length + ")" : ""}</button>
        {anyRunning && <button className="btn sm stop" onClick={() => onStop()}>■ Alle stoppen</button>}
        <button className="btn sm" onClick={onReset} title="Markierungen und Zähler löschen (laufende Programme laufen weiter)">Zurücksetzen</button>
        {runs.length > 0 && <span className="hint">{de(L.totals.calls)} Aufrufe · {de(L.rate)}/s · {L.threads.size} Threads · <span className={L.totals.errs + L.totals.fatal ? "bad" : "mut"}>{L.totals.fatal ? L.totals.fatal + " Absturz · " : ""}{nErr} Fehler</span> · <span className={L.totals.warn ? "am" : "mut"}>{L.totals.warn} abgefangen</span></span>}
      </div>
      {showGroup && <div className="run-group">
        <div className="hint" style={{ marginBottom: 6 }}>Häkchen setzen, Argumente eintragen, Anzahl wählen – dann starten alle gleichzeitig. <code>{"{n}"}</code> im Argument wird pro Instanz durch 1, 2, 3 … ersetzt (z. B. <code>client{"{n}"}</code>). Reihenfolge des Anhakens = Startreihenfolge (Server zuerst anhaken).</div>
        {presets.map((x) => { const g = inGroup(x.id); return (
          <div key={x.id} className={"rg-row" + (g ? " on" : "")}>
            <label className="chk"><input type="checkbox" checked={!!g} onChange={() => toggleGroup(x.id)} />{x.label}</label>
            {g && <><input className="txt" style={{ width: 160 }} placeholder="Argumente" value={g.args} onChange={(e) => setG(x.id, { args: e.target.value })} />
              <span className="hint">×</span><input className="txt" type="number" min="1" max="8" style={{ width: 52 }} value={g.n} onChange={(e) => setG(x.id, { n: +e.target.value || 1 })} /></>}
          </div>); })}
        <div className="row" style={{ gap: 8, marginTop: 6 }}><button className="btn primary sm" disabled={!group.length} onClick={startGroup}>▶ Gemeinsam starten</button><span className="hint">{group.reduce((s, g) => s + (g.n || 1), 0)} Prozesse</span></div>
      </div>}
      {trace && <DebugBar L={L} onCtl={onCtl} onBpClear={onBpClear} running={anyRunning} />}
      {runs.length > 0 && <div className="runs">
        {multi && <button className={"rchip" + (!focus ? " on" : "")} onClick={() => setFocus(0)}>Alle {runs.length}</button>}
        {runs.map((R) => (
          <span key={R.id} className={"rchip " + R.status + (focus === R.id ? " on" : "") + (R.end && (R.end.code || R.end.reason) ? " bad" : "")} onClick={() => setFocus(focus === R.id ? 0 : R.id)} title={R.cmd || R.label}>
            <i style={{ background: runCol(R) }} />{runShort(R)}<span className="mut">{runEndTxt(R).replace("beendet ", "")}</span>
            {(R.status === "running" || R.status === "building") && <button className="x" title="Diesen Lauf stoppen" onClick={(e) => { e.stopPropagation(); onStop(R.id); }}>■</button>}
          </span>))}
      </div>}
      <div className="run-grid">
        <div className="run-con">
          <div className="cl"><span>Konsole{FR ? " · " + FR.label : multi ? " · alle Läufe" : ""}</span><span>{outs.length}</span></div>
          <pre ref={conRef}>{outs.map((l, i) => <span key={i} className={"o-" + l.s}>{multi && !focus && <span style={{ color: runCol(L.runs.get(l.run)) }}>[{runShort(L.runs.get(l.run))}] </span>}{l.t + "\n"}</span>)}{!outs.length && <span className="mut">Noch keine Ausgabe.</span>}</pre>
          <div className="row" style={{ gap: 6 }}>
            <input className="txt" placeholder={stdinRun ? `Eingabe an ${stdinRun.label} (stdin) …` : anyRunning ? "Lauf oben anklicken, um ihm etwas einzugeben" : "stdin (läuft nicht)"} value={inp} disabled={!stdinRun}
              onChange={(e) => setInp(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && inp && stdinRun) { onStdin(stdinRun.id, inp); setInp(""); } }} />
          </div>
        </div>
        <div className="run-side">
          <div className="seg" style={{ marginBottom: 6 }}>
            {[["events", "Ereignisse"], ["errors", `Fehler${errGroups.length ? " " + errGroups.length : ""}`], ["threads", `Threads${threads.some((t) => t.paused) ? " ⏸" : ""}`], ["signals", `Signale${chans.some((c) => c.net) ? " ⇄" : ""}`]].map(([k, l]) => <button key={k} className={pane === k ? "on" : ""} onClick={() => setPane(k)}>{l}</button>)}
          </div>
          {pane === "events" && <>
            <div className="row" style={{ marginBottom: 4, gap: 10 }}>
              <label className="chk"><input type="checkbox" checked={freeze} onChange={(e) => setFreeze(e.target.checked)} />Einfrieren</label>
              <label className="chk"><input type="checkbox" checked={onlyErr} onChange={(e) => setOnlyErr(e.target.checked)} />nur Fehler</label>
              <span className="hint">Stichprobe, max. 300 Details / 100 ms</span>
            </div>
            <div className="evlist" ref={evRef}>
              {shownEv.map((e, j) => (
                <div key={j} className={"evr " + e.k} onClick={() => goCode(e.i, e.line)}>
                  <span className="ts">{fmtTs(e.ts)}</span>{multi && <b className="rtag" style={{ color: runCol(L.runs.get(e.run)) }}>{runShort(L.runs.get(e.run))}</b>}<i style={{ background: thCol(e.th) }} title={(L.threads.get(e.th) || {}).name} />
                  {e.k === "c" && <span><span className="mut">{nm(e.par)} →</span> <b>{nm(e.i)}</b><span className="mut">({e.txt})</span></span>}
                  {e.k === "r" && <span><b>{nm(e.i)}</b> <span className="mut">⇐</span> <span className="acc">{e.txt || "—"}</span> <span className="mut">{fmtUs(e.dur)}</span></span>}
                  {e.k === "u" && <span className="bad">✕ {nm(e.i)} → {nm(e.par)}: nicht zugestellt – {e.txt}</span>}
                  {e.k === "x" && <span className="bad">⚡ {nm(e.i)}:{e.line} {e.txt}</span>}
                  {e.k === "h" && <span className="am">▲ abgefangen in {nm(e.i)}:{e.line} ({e.txt})</span>}
                  {e.k === "e" && <span><span className="mut">{nm(e.i)}</span> <span style={{ color: "var(--violet)" }}>{e.send ? "⇢" : "⇠"} {e.txt}</span></span>}
                  {e.k === "F" && <span className="bad"><b>✕ {e.txt}</b> in {nm(e.i)}</span>}
                </div>))}
              {!shownEv.length && <div className="hint" style={{ padding: 8 }}>{L.trace ? "Starte das Programm – Aufrufe erscheinen hier und im Diagramm." : "Ohne Live-Trace gibt es nur die Konsole."}</div>}
            </div>
          </>}
          {pane === "errors" && <div className="evlist">
            {errGroups.map((r, j) => (
              <div key={j} className={"errc " + (r.fatal ? "fatal" : r.handled == null ? "bad" : "warn")} onClick={() => goCode(r.i, r.line)}>
                <div className="eh"><b>{r.fatal ? "✕ ABSTURZ" : r.handled == null ? "✕ nicht abgefangen" : "▲ abgefangen"}</b>{r.n > 1 && <span className="tag">×{r.n}</span>}{multi && <b style={{ color: runCol(L.runs.get(r.run)) }}>{runShort(L.runs.get(r.run))}</b>}<span className="mut">{(L.threads.get(r.th) || {}).name}</span></div>
                <div className="em">{r.msg}</div>
                <div className="ep">
                  <span className="chip" onClick={(ev) => { ev.stopPropagation(); goCode(r.i, r.line); }}>⚡ {nm(r.i)}{r.line ? ":" + r.line : ""}</span>
                  {r.path.slice(1).map((i, q) => <span key={q} className="chip bad" onClick={(ev) => { ev.stopPropagation(); goCode(i); }}>↑ {nm(i)}</span>)}
                  {r.handled != null && <span className="chip am" onClick={(ev) => { ev.stopPropagation(); goCode(r.handled, r.handledLine); }}>▲ {nm(r.handled)}:{r.handledLine}</span>}
                </div>
              </div>))}
            {!errGroups.length && <div className="hint ok" style={{ padding: 8 }}>{runs.length ? "✓ Bisher keine Fehler." : "Noch kein Lauf."}</div>}
          </div>}
          {pane === "threads" && <div className="evlist">
            {threads.map((th) => (
              <div key={th.key} className={"thr" + (th.paused ? " paused" + (th.paused.reason === "Haltepunkt" ? " bp" : "") : "")}>
                <div className="row" style={{ gap: 8 }}>
                  <i style={{ background: thCol(th.key) }} />{multi && <b style={{ color: runCol(L.runs.get(th.run)) }}>{runShort(L.runs.get(th.run))}</b>}<b>{th.name}</b>
                  {th.paused ? <span className={th.paused.reason === "Haltepunkt" ? "bad" : "am"}>{th.paused.reason === "Haltepunkt" ? "● Haltepunkt" : "⏸ Pause"} in <a onClick={() => goCode(th.paused.key)}>{nm(th.paused.key)}</a></span>
                    : <span className={th.stack.length ? "ok" : "mut"}>{th.stack.length ? "aktiv" : th.alive && (L.runs.get(th.run) || {}).status === "running" ? "wartet / blockiert" : "beendet"}</span>}
                </div>
                <PausedVars p={th.paused} />
                <div className="stk">{th.stack.slice(-8).map((i, q, arr) => <span key={q} className={"chip" + (q === arr.length - 1 ? " top" : "")} onClick={() => goCode(i)}>{nm(i)}</span>)}</div>
              </div>))}
            {!threads.length && <div className="hint" style={{ padding: 8 }}>Keine Threads.</div>}
          </div>}
          {pane === "signals" && <div className="evlist">
            {chans.length > 0 && <div className="cl" style={{ padding: "4px 6px" }}><span>Kanäle (Socket ⇄ zwischen Prozessen, Queue, Event …)</span></div>}
            {chans.map((ch) => (
              <div key={ch.id} className={"thr" + (ch.net ? " net" : "")}>
                <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                  <b style={{ color: "var(--violet)" }}>{ch.net ? "⇄ " + ch.kind.toUpperCase() : ch.name}</b>{ch.net ? <span className="mut" style={{ fontSize: 10 }}>{ch.name}</span> : <span className="mut">#{String(ch.id).slice(-4)}</span>}
                  <span>⇢ {de(ch.sent)} · ⇠ {de(ch.recv)}</span>{ch.sent > ch.recv && <span className="am">{de(ch.sent - ch.recv)} offen</span>}
                  {ch.net && ch.runs.size > 1 && <span className="ok">verbindet {[...ch.runs].map((r) => runShort(L.runs.get(r))).join(" ⇄ ")}</span>}
                </div>
                <div className="stk">{[...ch.senders].map(([i, n]) => <span key={"s" + i} className="chip" onClick={() => goCode(i)}>⇢ {multi ? runShort(L.runs.get(+String(i).split(":")[0])) + "·" : ""}{nm(i)} ×{de(n)}</span>)}{[...ch.receivers].map(([i, n]) => <span key={"r" + i} className="chip" onClick={() => goCode(i)}>⇠ {multi ? runShort(L.runs.get(+String(i).split(":")[0])) + "·" : ""}{nm(i)} ×{de(n)}</span>)}</div>
              </div>))}
            <div className="cl" style={{ padding: "8px 6px 4px" }}><span>Externe Übergaben</span></div>
            {exts.slice(0, 60).map((x, j) => <div key={j} className="evr" onClick={() => onGo(x.c)}><b>{x.c.name}</b><span style={{ color: "var(--violet)" }}>→ {x.n}</span><span className="mut">×{de(x.cnt)}</span>{x.e > 0 && <span className="bad">✕{x.e}</span>}</div>)}
            {!exts.length && <div className="hint" style={{ padding: 8 }}>Keine Übergaben an Queues/Sockets/Events erkannt.</div>}
          </div>}
        </div>
      </div>
    </div>
  );
});

/* Live-Block im Detailfenster */
function LiveBlock({ L, model, sel, onGo, onBp, onCtl }) {
  if (!L || !sel) return null;
  const mine = [...L.codes.values()].filter((c) => c.target && c.target.id === sel.id && (!sel.m || (c.target.m && c.target.m.t === sel.m.t && c.target.m.i === sel.m.i)));
  const isFn = sel.m && sel.m.t === "m";
  const hasBp = isFn && L.bpKeys.has(sel.id + "|m" + sel.m.i);
  const pz = [...L.threads.values()].filter((t) => t.paused && mine.some((c) => c.key === t.paused.key));
  if (!mine.length && !isFn) return null;
  const calls = mine.reduce((s, c) => s + c.calls, 0), errs = mine.reduce((s, c) => s + c.errs, 0), warn = mine.reduce((s, c) => s + c.warn, 0), us = mine.reduce((s, c) => s + c.us, 0);
  const fatal = mine.some((c) => c.fatal);
  const last = mine.flatMap((c) => c.last.map((x) => ({ ...x, c }))).sort((a, b) => a.ts - b.ts).slice(-8);
  const callers = new Map(); for (const c of mine) for (const [i, n] of c.callers) callers.set(i, (callers.get(i) || 0) + n);
  const ext = new Map(); for (const c of mine) for (const [n, [cnt]] of c.ext) ext.set(n, (ext.get(n) || 0) + cnt);
  const msg = mine.find((c) => c.errMsg);
  const multi = L.runs.size > 1;
  return (
    <div className="blk live">
      <div className="cl"><span className="acc">● Live</span><span>{L.status === "running" ? "läuft" : mine.length ? "letzter Lauf" : "noch nicht ausgeführt"}</span></div>
      {isFn && onBp && <div className="row" style={{ gap: 6, marginBottom: mine.length ? 8 : 0 }}>
        <button className={"btn sm" + (hasBp ? " bpon" : "")} onClick={onBp} title="Beim nächsten Aufruf dieser Funktion alle Läufe anhalten">{hasBp ? "● Haltepunkt entfernen" : "○ Haltepunkt setzen"}</button>
        {pz.length > 0 && <><button className="btn primary sm" onClick={() => onCtl({ mode: "run" })}>▶ Weiter</button><button className="btn sm" onClick={() => onCtl({ mode: "pause", step: 1 })}>⏭ Schritt</button></>}
      </div>}
      {pz.map((th) => (
        <div key={th.key} className={"det paused" + (th.paused.reason === "Haltepunkt" ? " bp" : "")}>
          <b>{th.paused.reason === "Haltepunkt" ? "● Haltepunkt" : "⏸ Pause"}</b> · {multi ? runShort(L.runs.get(th.run)) + " · " : ""}{th.name}
          <PausedVars p={th.paused} />
        </div>))}
      {mine.length > 0 && <div className="metrics" style={{ gridTemplateColumns: "repeat(4,1fr)" }}>
        <div className="metric"><div className="ml">Aufrufe</div><div className="mv">{de(calls)}</div></div>
        <div className="metric"><div className="ml">Ø Dauer</div><div className="mv" style={{ fontSize: 12 }}>{calls ? fmtUs(us / calls) : "–"}</div></div>
        <div className={"metric" + (errs || fatal ? " bad" : "")}><div className="ml">Fehler</div><div className="mv">{fatal ? "✕" : errs}</div></div>
        <div className={"metric" + (warn ? " warn" : "")}><div className="ml">abgef.</div><div className="mv">{warn}</div></div>
      </div>}
      {msg && <div className="det" style={{ borderLeftColor: "var(--red)", marginTop: 8 }}>{!/^Absturz/.test(msg.errMsg) && <span className="bad">{fatal ? "Absturz: " : "Fehler: "}</span>}{msg.errMsg}</div>}
      {last.length > 0 && <div style={{ marginTop: 8 }}>
        <div className="hint" style={{ marginBottom: 4 }}>Letzte Aufrufe (Argumente ⇒ Ergebnis)</div>
        {last.map((x, i) => <div key={i} className={"lcall" + (x.err ? " bad" : "")}>
          <span className="mut">{fmtTs(x.ts)}</span>{multi && <b style={{ color: runCol(L.runs.get(x.c.run)) }}> {runShort(L.runs.get(x.c.run))}</b>} ({x.args || ""}) {x.err ? <span className="bad">✕ {x.err}</span> : x.dur == null ? <span className="am">läuft …</span> : <><span className="mut">⇒</span> <span className="acc">{x.ret || "—"}</span> <span className="mut">{fmtUs(x.dur)}</span></>}
        </div>)}
      </div>}
      {callers.size > 0 && <div style={{ marginTop: 8 }}><span className="hint">Aufgerufen von: </span>{[...callers].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([i, n]) => <span key={i} className="chip" onClick={() => onGo(L.codes.get(i))}>{codeName(L, i)} ×{de(n)}</span>)}</div>}
      {ext.size > 0 && <div style={{ marginTop: 6 }}><span className="hint">Sendet/empfängt: </span>{[...ext].map(([n, cnt]) => <span key={n} className="chip" style={{ color: "var(--violet)" }}>{n} ×{de(cnt)}</span>)}</div>}
    </div>
  );
}

/* ============================ Konsole (Drawer) ============================ */
/* ============================ Vibe: Oberfläche ============================ */
const MODE_DE = {
  plan: ["Planen", "Nur lesen und einen Plan vorlegen – es wird nichts geändert"],
  ask: ["Nachfragen", "Jede Dateiänderung und jeder Befehl braucht deine Freigabe"],
  acceptEdits: ["Ändern", "Dateien darf die KI ändern – Befehle brauchen deine Freigabe"],
};
const TOOL_DE = { read: ["◉", "liest"], edit: ["✎", "ändert"], write: ["＋", "schreibt"], search: ["⌕", "sucht"], run: ["▶", "führt aus"] };
const TOOL_OTHER = { mcp__codeatlas__tests_run: ["✓", "testet im Atlas"], mcp__codeatlas__tests_info: ["✓", "sieht Tests an"], mcp__codeatlas__tests_last: ["✓", "liest Testergebnis"], TodoWrite: ["☑", "Aufgabenliste"], Task: ["⑂", "Unter-Agent"], Skill: ["✦", "nutzt Skill"], SlashCommand: ["✦", "nutzt Befehl"], Agent: ["⑂", "Unter-Agent"], WebFetch: ["↗", "ruft ab"], WebSearch: ["⌕", "Websuche"], ExitPlanMode: ["▤", "Plan"] };
const fmtDur = (ms) => (ms == null ? "" : ms >= 60000 ? Math.floor(ms / 60000) + " min " + Math.round((ms % 60000) / 1000) + " s" : ms >= 1000 ? de(ms / 1000, 1) + " s" : de(Math.max(0, ms)) + " ms");
const fmtCost = (c) => (c == null ? "" : c < 0.005 ? "< 0,01 $" : de(c, 2) + " $");
const clock = (t) => { const d = new Date(t); return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); };
const firstLine = (s) => { const l = String(s || "").split("\n"); return l[0] + (l.length > 1 ? " …" : ""); };
const ST_SIGN = { new: "+", chg: "~", del: "−" };
const CTX_RE = /^(\/\S+ )?\[Kontext aus dem Diagramm: ([^\]]*)\]\n\n/;   // so stellt sendPrompt die Auswahl im Diagramm voran (hinter einem /skill)
const splitCtx = (p) => { const m = CTX_RE.exec(p || ""); return m ? [m[2], (m[1] || "") + p.slice(m[0].length)] : ["", p || ""]; };

/* ganz kleines Markdown für die Antworten der KI: `Code`, **fett**, Listen, Überschriften, ```Blöcke``` */
function mdInline(s, key) {
  const out = [], re = /(`[^`\n]+`|\*\*[^*\n]+\*\*)/g; let last = 0, m, i = 0;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index));
    const tok = m[0], k = key + "." + i++;
    out.push(tok[0] === "`" ? <code key={k}>{tok.slice(1, -1)}</code> : <b key={k}>{mdInline(tok.slice(2, -2), k)}</b>);   // fett darf `Code` enthalten
    last = m.index + tok.length;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
}
const Md = memo(function Md({ text }) {
  const blocks = []; let code = null;
  String(text || "").split("\n").forEach((ln, i) => {
    if (/^\s*```/.test(ln)) { if (code) { blocks.push(<pre key={i} className="vcode">{code.join("\n")}</pre>); code = null; } else code = []; return; }
    if (code) { code.push(ln); return; }
    if (!ln.trim()) { blocks.push(<div key={i} className="gap" />); return; }
    const h = /^(#{1,4})\s+(.*)$/.exec(ln), li = /^(\s*)([-*•]|\d+[.)])\s+(.*)$/.exec(ln);
    if (h) blocks.push(<div key={i} className="mh">{mdInline(h[2], i)}</div>);
    else if (li) { const num = /\d/.test(li[2]); blocks.push(<div key={i} className={"mli" + (num ? " num" : "")} style={{ paddingLeft: (num ? 24 : 14) + Math.min(3, Math.floor(li[1].length / 2)) * 12 }}><span className="bu">{num ? li[2] : "•"}</span>{mdInline(li[3], i)}</div>); }
    else blocks.push(<div key={i}>{mdInline(ln, i)}</div>);
  });
  if (code) blocks.push(<pre key="open" className="vcode">{code.join("\n")}</pre>);
  return <div className="md">{blocks}</div>;
});
/* alt/neu eines Edit-Aufrufs als kleiner Diff */
const MiniDiff = memo(function MiniDiff({ a, b, max = 60 }) {
  const d = useMemo(() => diffLines(a || "", b || ""), [a, b]);
  const rows = d.rows.length > max ? d.rows.filter((r, i, R) => r[0] !== " " || (R[i - 1] && R[i - 1][0] !== " ") || (R[i + 1] && R[i + 1][0] !== " ")) : d.rows;
  return (
    <pre className="mdiff">
      {rows.slice(0, max).map((r, i) => <span key={i} className={r[0] === "+" ? "add" : r[0] === "-" ? "del" : ""}>{(r[0] === " " ? "  " : r[0] + " ") + (r[0] === "+" ? d.b[r[2]] : d.a[r[1]]) + "\n"}</span>)}
      {rows.length > max && <span className="mut">… {de(rows.length - max)} weitere Zeilen</span>}
    </pre>
  );
});

function ToolRow({ it, onGo }) {
  const [open, setOpen] = useState(false);
  const kind = it.created ? "write" : TOOL_KIND[it.name];
  const [ic, verb] = TOOL_DE[kind] || TOOL_OTHER[it.name] || (/^mcp__/.test(it.name || "") ? ["⇄", it.name.split("__").slice(1).join(" › ")] : ["·", it.name || "Werkzeug"]);
  const busy = it.ph !== "end";
  const where = it.path ? (it.dir ? it.path.split("/").slice(1).join("/") || "Projekt" : baseName(it.path)) : it.abs ? baseName(String(it.abs).replace(/\\/g, "/")) : "";
  let target = where, detail = "";
  if (kind === "run") target = short(firstLine(it.desc || it.cmd || ""), 64);
  else if (kind === "read") detail = it.from ? `Zeile ${de(it.from)}${it.to && it.to !== it.from ? "–" + de(it.to) : ""}` : "";
  else if (kind === "edit") detail = it.lines && it.lines.length ? "Zeile " + it.lines.slice(0, 3).map(([a, b]) => (a === b ? a : a + "–" + b)).join(", ") + (it.lines.length > 3 ? " …" : "") : it.all ? "alle Vorkommen" : "";
  else if (kind === "write") detail = it.rows ? de(it.rows) + " Zeilen" + (it.created ? " · neu" : "") : it.created ? "neu" : "";
  else if (kind === "search") { target = it.pat ? "„" + short(it.pat, 36) + "“" : where; detail = it.pat && where ? "in " + where : ""; }
  else if (it.name === "TodoWrite" && it.todos) target = it.todos.filter((x) => x.st === "completed").length + " / " + it.todos.length + " erledigt";
  else if (!kind) target = short(it.skill ? "/" + it.skill : it.desc || it.url || it.pat || it.sub || "", 60);
  const has = !!(it.cmd || it.res || it.old != null || it.head || it.plan || it.todos || it.prompt || it.args || it.edits);
  const canGo = !!(it.path && !it.dir);
  return (
    <div className={"vi tool k-" + (kind || "x") + (busy ? " act" : "") + (it.ok === false ? " bad" : "") + (it.par ? " sub" : "")}>
      <div className="vi-h" onClick={() => (canGo ? onGo(it) : has && setOpen(!open))} title={it.cmd || it.path || it.abs || ""}>
        <span className="ic">{busy ? <span className="spin" /> : ic}</span>
        <span className="vb">{verb}</span>
        <span className="tg">{target}{it.outside && <i> · außerhalb</i>}</span>
        {detail && <span className="dt">{detail}</span>}
        <span className="sp" />
        {it.denied ? <span className="st bad">abgelehnt</span> : it.ok === false ? <span className="st bad">Fehler</span> : it.cut ? <span className="st mut">offen</span> : it.ms != null && !busy && it.ms >= 300 ? <span className="st mut">{fmtDur(it.ms)}</span> : null}
        {has && <button className="xp" onClick={(e) => { e.stopPropagation(); setOpen(!open); }} aria-label="Details">{open ? "▾" : "▸"}</button>}
      </div>
      {open && (
        <div className="vi-b">
          {it.cmd && <pre className="vcode cmd">{"$ " + it.cmd}</pre>}
          {it.old != null && <MiniDiff a={it.old} b={it.new} />}
          {it.edits && it.edits.map((e, i) => <MiniDiff key={i} a={e.old} b={e.new} />)}
          {it.head && <pre className="vcode">{it.head}</pre>}
          {it.plan && <Md text={it.plan} />}
          {it.todos && <div className="todos">{it.todos.map((x, i) => <div key={i} className={x.st}>{x.st === "completed" ? "☑" : x.st === "in_progress" ? "◐" : "☐"} {x.text}</div>)}</div>}
          {it.prompt && <pre className="vcode">{it.prompt}</pre>}
          {it.args && <pre className="vcode">{it.args}</pre>}
          {it.res && <pre className={"vcode out" + (it.ok === false ? " bad" : "")}>{it.res}</pre>}
        </div>
      )}
    </div>
  );
}

/* ---------- Anhänge: Vorschaubilder der in dieser Sitzung hochgeladenen Bilder (nach dem Neuladen nur noch der Name) ---------- */
const ATT_URL = new Map();
const fmtSize = (n) => n >= 1048576 ? (n / 1048576).toFixed(1).replace(".", ",") + " MB" : Math.max(1, Math.round(n / 1024)) + " kB";
function AttChips({ files, onRemove }) {
  if (!files || !files.length) return null;
  return (
    <div className="att">
      {files.map((f, i) => {
        const url = ATT_URL.get(f.id) || f.url;
        return (
          <span key={f.id || f.key || i} className={"att-c" + (f.err ? " bad" : "") + (f.busy ? " busy" : "")} title={(f.path || f.name) + (f.size ? " · " + fmtSize(f.size) : "") + (f.err ? " – " + f.err : "")}>
            {url && (f.img || /^image\//.test(f.mime || "")) ? <img src={url} alt="" /> : <span className="ic">{/pdf$/i.test(f.name) ? "PDF" : (f.name.split(".").pop() || "?").slice(0, 4).toUpperCase()}</span>}
            <span className="nm">{f.name}</span>
            {f.busy && <span className="spin" />}
            {onRemove && <button className="xp" onClick={() => onRemove(f)} aria-label={f.name + " entfernen"}>✕</button>}
          </span>
        );
      })}
    </div>
  );
}

/* ---------- Skills: auswählen, ansehen, bearbeiten, neu anlegen ---------- */
const SCOPE_DE = { projekt: "Projekt", "persönlich": "Persönlich", plugin: "Plugins", eingebaut: "Eingebaut" };
const SCOPE_ORDER = ["projekt", "persönlich", "plugin", "eingebaut"];

function SkillPick({ list, known, q, setQ, busy, onPick, onEdit, onNew, onClose, onReload }) {
  const [hi, setHi] = useState(0), inRef = useRef(null), boxRef = useRef(null);
  useEffect(() => { inRef.current && inRef.current.focus(); }, []);
  const ql = q.trim().toLowerCase();
  const rows = useMemo(() => {
    const f = (list || []).filter((s) => !ql || s.name.toLowerCase().includes(ql) || (s.desc || "").toLowerCase().includes(ql));
    f.sort((a, b) => SCOPE_ORDER.indexOf(a.scope) - SCOPE_ORDER.indexOf(b.scope) || (ql ? (b.name.toLowerCase().startsWith(ql) - a.name.toLowerCase().startsWith(ql)) : 0) || a.name.localeCompare(b.name));
    return f.slice(0, 300);
  }, [list, ql]);
  useEffect(() => { setHi(0); }, [ql]);
  useEffect(() => { const el = boxRef.current && boxRef.current.querySelector(".sk-r.hi"); if (el) el.scrollIntoView({ block: "nearest" }); }, [hi]);
  const key = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(rows.length - 1, h + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); }
    else if ((e.key === "Enter" || e.key === "Tab") && rows[hi]) { e.preventDefault(); onPick(rows[hi]); }
    else if (e.key === "Escape") { e.preventDefault(); onClose(); }
  };
  let last = "";
  return (
    <div className="sk-pop" role="dialog" aria-label="Skill auswählen">
      <div className="sk-h">
        <input ref={inRef} className="txt" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={key} placeholder="Skill suchen …" aria-label="Skill suchen" />
        <button className="btn sm" onClick={onReload} title="Neu einlesen">↻</button>
        <button className="btn sm" onClick={onClose} aria-label="Schließen">✕</button>
      </div>
      <div className="sk-l" ref={boxRef}>
        {busy && !list && <div className="mut sk-e">lese Skills …</div>}
        {list && !rows.length && <div className="mut sk-e">{ql ? "Kein Skill passt zu „" + q + "“." : "Keine Skills gefunden."}</div>}
        {rows.map((s, i) => {
          const head = s.scope !== last ? (last = s.scope, <div key={"h" + s.scope} className="sk-g">{SCOPE_DE[s.scope] || s.scope}</div>) : null;
          return (
            <React.Fragment key={s.scope + s.name}>
              {head}
              <div className={"sk-r" + (i === hi ? " hi" : "") + (s.active === false ? " off" : "")} onMouseEnter={() => setHi(i)} onClick={() => onPick(s)} role="option" aria-selected={i === hi}>
                <div className="sk-n"><b>/{s.name}</b>{s.kind === "befehl" && <span className="tag">Befehl</span>}{s.hint && <span className="mut"> {s.hint}</span>}{s.active === false && <span className="tag am" title="Claude Code hat diesen Skill beim letzten Start nicht gemeldet (z. B. Plugin deaktiviert)">inaktiv</span>}</div>
                {s.desc && <div className="sk-d">{s.desc}</div>}
                {(s.editable || s.path) && <button className="sk-ed" onClick={(e) => { e.stopPropagation(); onEdit(s); }} title={s.editable ? "Ansehen und bearbeiten" : "Ansehen (schreibgeschützt)"}>{s.editable ? "✎" : "👁"}</button>}
              </div>
            </React.Fragment>
          );
        })}
      </div>
      <div className="sk-f">
        <button className="btn sm primary" onClick={onNew}>＋ Neuer Skill</button>
        <span className="mut">{list ? list.length + " Skills" : ""}{known === false ? " · aktiv-Liste nach dem ersten Auftrag" : ""} · ↑↓ Enter</span>
      </div>
    </div>
  );
}

function SkillDialog({ init, api, onClose, onDone, onAskAI }) {
  const isNew = !init.name;
  const [f, setF] = useState({ name: "", scope: "projekt", desc: "", body: "", ...init }), [err, setErr] = useState(""), [busy, setBusy] = useState(false);
  const [content, setContent] = useState(init.content || "");
  const ro = !isNew && !init.editable;
  const nameOk = /^[a-z0-9][a-z0-9-]{0,63}$/.test(f.name);
  const save = async () => {
    setBusy(true); setErr("");
    try {
      if (isNew) await api.skillCreate({ scope: f.scope, name: f.name, description: f.desc, body: f.body });
      else await api.skillSave({ name: init.name, content });
      onDone(isNew ? f.name : init.name);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const ai = () => {
    const where = f.scope === "projekt" ? ".claude/skills/" + f.name + "/SKILL.md (im Projekt)" : "~/.claude/skills/" + f.name + "/SKILL.md (persönlich, für alle Projekte)";
    onAskAI(`Erstelle einen neuen Claude-Code-Skill „${f.name}“ unter ${where}.\n` +
      `Format: SKILL.md mit YAML-Kopf (name: ${f.name}, description: …) und darunter die Anleitung in Markdown. Die description sagt knapp, wann der Skill verwendet werden soll.\n` +
      `Wann verwenden: ${f.desc || "(bitte sinnvoll formulieren)"}\n` +
      (f.body.trim() ? `Inhalt / Idee:\n${f.body.trim()}\n` : "") +
      `Falls ein Skill zum Erstellen von Skills verfügbar ist, nutze ihn. Lege nur diese eine Datei an (ggf. Hilfsdateien im selben Ordner).`);
    onClose();
  };
  return (
    <div className="modal skdlg" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="box">
        <div className="kicker">{isNew ? "Neuer Skill" : ro ? "Skill ansehen" : "Skill bearbeiten"}</div>
        {isNew ? (<>
          <label className="lbl">Name <span className="mut">(wird zu /name – Kleinbuchstaben, Ziffern, Bindestriche)</span></label>
          <input className={"txt" + (f.name && !nameOk ? " bad" : "")} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value.toLowerCase().replace(/\s+/g, "-") })} placeholder="z. B. sps-doku" autoFocus />
          <label className="lbl">Ort</label>
          <div className="seg">
            <button className={f.scope === "projekt" ? "on" : ""} onClick={() => setF({ ...f, scope: "projekt" })} title=".claude/skills im Projekt – gilt nur hier, kann mit ins Git">Projekt</button>
            <button className={f.scope === "persönlich" ? "on" : ""} onClick={() => setF({ ...f, scope: "persönlich" })} title="~/.claude/skills – gilt in allen Projekten">Persönlich</button>
          </div>
          <label className="lbl">Wann soll Claude ihn benutzen? <span className="mut">(Beschreibung – danach entscheidet Claude Code selbst)</span></label>
          <input className="txt" value={f.desc} onChange={(e) => setF({ ...f, desc: e.target.value })} placeholder="z. B. Wenn ein SPS-Programm nach IEC 61131-3 dokumentiert werden soll" />
          <label className="lbl">Anleitung <span className="mut">(Markdown – was Claude dabei tun soll)</span></label>
          <textarea className="txt" value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} placeholder={"# SPS-Doku\n\n1. Für jeden Baustein Ein- und Ausgänge tabellarisch …\n2. …"} spellCheck={false} />
        </>) : (<>
          <div className="mut sk-path">/{init.name} · {SCOPE_DE[init.scope] || init.scope} · {init.path}</div>
          <textarea className="txt" value={content} readOnly={ro} onChange={(e) => setContent(e.target.value)} spellCheck={false} />
        </>)}
        {err && <div className="bad">{err}</div>}
        <div className="row" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {!ro && <button className="btn primary" disabled={busy || (isNew && (!nameOk || !f.desc.trim()))} onClick={save}>{isNew ? "Anlegen" : "Speichern"}</button>}
          {isNew && onAskAI && <button className="btn" disabled={!nameOk} onClick={ai} title="Claude Code schreibt den Skill aus deiner Idee – du siehst es live im Verlauf">✦ Von Claude Code schreiben lassen</button>}
          <button className="btn" onClick={onClose}>{ro ? "Schließen" : "Abbrechen"}</button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Konto von Claude Code: anzeigen, abmelden, (neu) anmelden ---------- */
const SUB_DE = { max: "Max", pro: "Pro", team: "Team", enterprise: "Enterprise", free: "Free" };
function AccountBox({ api, busyRun }) {
  const [acc, setAcc] = useState(null), [err, setErr] = useState(""), [code, setCode] = useState(""), [console_, setConsole] = useState(false), [ask, setAsk] = useState(false);
  const load = useCallback((fresh) => api.account(fresh).then((r) => { setAcc(r); setErr(""); return r; }).catch((e) => setErr(e.message)), [api]);
  useEffect(() => { load(true); }, [load]);
  const lg = acc && acc.login, running = lg && lg.state === "läuft";
  useEffect(() => { if (!running) return; const t = setInterval(() => load(false), 1500); return () => clearInterval(t); }, [running, load]);
  const st = (acc && acc.status) || {};
  const who = st.email || st.emailAddress || st.account && st.account.email || "";
  const org = st.orgName || st.organizationName || st.organization && st.organization.name || "";
  const sub = st.subscriptionType || st.subscription || "";
  const act = (p) => p.then(() => load(true)).catch((e) => setErr(e.message));
  const extra = Object.entries(st).filter(([k, v]) => !["loggedIn", "email", "emailAddress", "orgName", "organizationName", "subscriptionType", "error", "analyticsDisabled", "projectsDirectory", "configDirectory"].includes(k) && v != null && typeof v !== "object");
  return (
    <div className="cfg-sec acc">
      <div className="cl"><span>Konto (Claude Code)</span><span className={st.loggedIn ? "ok" : "bad"}>{!acc ? "…" : st.loggedIn ? "angemeldet" : "nicht angemeldet"}</span></div>
      {st.loggedIn && (
        <div className="acc-who">
          {who ? <b>{who}</b> : <b>angemeldet</b>}
          {(org || sub) && <span className="mut">{[org, SUB_DE[String(sub).toLowerCase()] || sub].filter(Boolean).join(" · ")}</span>}
          {extra.length > 0 && <span className="hint">{extra.map(([k, v]) => k + ": " + v).join(" · ")}</span>}
        </div>
      )}
      {st.error && <div className="hint bad">{st.error}</div>}
      {err && <div className="hint bad">{err}</div>}
      {running ? (
        <div className="acc-login">
          <div className="hint">Anmeldung läuft{lg.console ? " (Anthropic Console)" : ""}. Claude Code öffnet die Anmeldeseite im Browser; klappt das nicht, öffne sie hier. Zeigt die Seite danach einen Code, füge ihn unten ein.</div>
          {lg.url && <a className="btn sm primary" href={lg.url} target="_blank" rel="noreferrer">Anmeldeseite öffnen ↗</a>}
          <div className="row"><input className="txt" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Code einfügen (falls angezeigt)" onKeyDown={(e) => { if (e.key === "Enter" && code.trim()) { act(api.accountCode(code)); setCode(""); } }} />
            <button className="btn sm" disabled={!code.trim()} onClick={() => { act(api.accountCode(code)); setCode(""); }}>Senden</button>
            <button className="btn sm" onClick={() => act(api.accountCancel())}>Abbrechen</button></div>
          {lg.lines && lg.lines.length > 0 && <pre className="acc-log">{lg.lines.slice(-4).join("\n")}</pre>}
        </div>
      ) : (<>
        {lg && lg.state !== "läuft" && <div className={"hint " + (lg.state === "fertig" ? "ok" : "bad")}>Letzte Anmeldung: {lg.state}</div>}
        <div className="row">
          <div className="seg sm" role="group" aria-label="Anmeldeart">
            <button className={!console_ ? "on" : ""} onClick={() => setConsole(false)} title="Mit deinem Claude-Abo (Pro, Max, Team …)">Claude-Abo</button>
            <button className={console_ ? "on" : ""} onClick={() => setConsole(true)} title="Mit der Anthropic Console (Abrechnung nach API-Nutzung)">Console</button>
          </div>
          <button className={"btn sm" + (st.loggedIn ? "" : " primary")} onClick={() => act(api.accountLogin({ console: console_ }))}>{st.loggedIn ? "Neu anmelden" : "Anmelden"}</button>
          {st.loggedIn && (ask
            ? <button className="btn sm stop" disabled={busyRun} onClick={() => { setAsk(false); act(api.accountLogout()); }}>Wirklich abmelden?</button>
            : <button className="btn sm" disabled={busyRun} onClick={() => setAsk(true)} title={busyRun ? "Erst den laufenden Auftrag beenden" : "Claude Code abmelden"}>Abmelden</button>)}
          <button className="btn sm" onClick={() => load(true)} title="Status neu abfragen">↻</button>
        </div>
      </>)}
    </div>
  );
}

const MODELS = [["", "Standard"], ["fable", "Fable"], ["opus", "Opus"], ["sonnet", "Sonnet"], ["haiku", "Haiku"]];
const EFFORT_DE = [["", "Standard"], ["low", "niedrig"], ["medium", "mittel"], ["high", "hoch"], ["xhigh", "sehr hoch"], ["max", "maximal"]];
const shortModel = (m) => String(m || "").replace(/^claude-/, "");

/* ---------- Bild im Bild: zeigt unten links, woran die KI gerade außerhalb des Bildausschnitts arbeitet ---------- */
const PIP_COL = { read: "var(--accent2)", search: "var(--az)", edit: "var(--amber)", write: "var(--amber)", run: "var(--violet)", changed: "var(--ay)" };
function AgentPip({ pip, model, V, tick, layer, onJump, onClose, onHold }) {
  const cvRef = useRef(null), ovRef = useRef(null), miniRef = useRef(null), engRef = useRef(null), first = useRef(true);
  useEffect(() => { const eng = createEngine(cvRef.current, miniRef.current, {}, ovRef.current); engRef.current = eng; return () => eng.destroy(); }, []);
  useEffect(() => { if (engRef.current && model) { engRef.current.setModel(model, !first.current); first.current = false; } }, [model]);
  useEffect(() => { engRef.current && engRef.current.setAgent(V); }, [V]);
  useEffect(() => { engRef.current && engRef.current.setVibe(layer || null); }, [layer]);
  useEffect(() => { engRef.current && engRef.current.agentKick(true); }, [tick]);
  const c = model && model.byDk ? model.byDk.get(pip.dk) : null, id = c ? c.id : null;
  const m = c && pip.mName ? (() => { const arr = pip.mt === "f" ? c.fields : c.methods, i = arr.findIndex((x) => x.name === pip.mName); return i >= 0 ? { t: pip.mt, i } : null; })() : null;
  useEffect(() => {   // erst nach dem Einmessen der Zeichenfläche zentrieren (sonst sitzt der Baustein am Rand)
    if (id == null || !engRef.current) return;
    const go = () => engRef.current && engRef.current.select({ id, m }, 2);
    const r = requestAnimationFrame(go), h = setTimeout(go, 160);
    return () => { cancelAnimationFrame(r); clearTimeout(h); };
  }, [id, pip.key, m && m.i]); // eslint-disable-line
  const done = !!pip.t1;
  return (
    <div className={"pip" + (done ? " done" : "")} style={{ "--pc": PIP_COL[pip.kind] || "var(--accent)" }} onMouseEnter={() => onHold(true)} onMouseLeave={() => onHold(false)}>
      <div className="pip-h">
        <span className="dot" />
        <span className="pip-t" title={pip.label}>{pip.label}</span>
        <button className="pip-b" onClick={() => onJump(pip)} title="Im großen Diagramm hinspringen">⤢</button>
        <button className="pip-b" onClick={onClose} aria-label="Schließen">✕</button>
      </div>
      <div className="pip-v" onClick={() => onJump(pip)} title="Klick: im großen Diagramm hinspringen">
        <canvas ref={cvRef} /><canvas ref={ovRef} aria-hidden="true" />
        {!c && <div className="pip-e mut">Baustein nicht mehr vorhanden</div>}
      </div>
      <canvas ref={miniRef} className="pip-mini" aria-hidden="true" />
    </div>
  );
}

function PermCard({ p, onDecide, imp }) {
  const [left, setLeft] = useState(p.wait || 300);
  useEffect(() => { const end = p.t + (p.wait || 300) * 1000; const h = setInterval(() => setLeft(Math.max(0, Math.round((end - Date.now()) / 1000))), 1000); return () => clearInterval(h); }, [p.id]); // eslint-disable-line
  const isCmd = p.name === "Bash" || p.name === "PowerShell";
  const what = isCmd ? "Befehl ausführen" : p.name === "Write" ? "Datei schreiben" : p.name === "Edit" || p.name === "MultiEdit" ? "Datei ändern" : (p.name || "Werkzeug") + " verwenden";
  return (
    <div className="perm">
      <div className="kicker">Freigabe nötig</div>
      <div className="pw"><b>{what}</b>{p.path && <span> · {p.path.split("/").slice(1).join("/")}</span>}{p.outside && <span className="bad"> · außerhalb des Projekts: {p.abs}</span>}</div>
      {p.cmd && <pre className="vcode cmd">{"$ " + p.cmd}</pre>}
      {p.desc && <div className="hint">{p.desc}</div>}
      {imp && <div className={"perm-imp" + (imp.n > 8 ? " hi" : "")}><span>◎ Wirkungsbereich: <b>{imp.n}</b> abhängige Stelle{imp.n === 1 ? "" : "n"} in {imp.files} Datei{imp.files === 1 ? "" : "en"}{imp.tests != null ? <> · <b>{imp.tests}</b> betroffene Test{imp.tests === 1 ? "" : "s"}</> : null}</span><button className="lnk" onClick={imp.show}>im Diagramm</button></div>}
      {p.old != null && <MiniDiff a={p.old} b={p.new} max={30} />}
      {p.head && <pre className="vcode">{p.head}</pre>}
      {!p.cmd && p.old == null && !p.head && p.args && <pre className="vcode">{p.args}</pre>}
      <div className="row">
        <button className="btn primary sm" onClick={() => onDecide(p.id, true, false)}>Erlauben</button>
        <button className="btn sm" onClick={() => onDecide(p.id, true, true)} title={"Für diese Sitzung nicht mehr fragen bei: " + (p.key || p.name)}>Immer ({isCmd ? String(p.key || "").split(":")[1] || "Befehl" : p.name})</button>
        <button className="btn sm stop" onClick={() => onDecide(p.id, false, false)}>Ablehnen</button>
        <span className="hint">{left > 0 ? `noch ${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}` : "abgelaufen"}</span>
      </div>
    </div>
  );
}

const STATUS_DE = { requesting: "wartet auf das Modell …", thinking: "denkt nach …", task: "arbeitet …", compacting: "verdichtet den Kontext …" };
const VibeDock = memo(function VibeDock({ V, tick, ws, selLabel, draft, setDraft, mode, setMode, agentId, setAgentId, onSend, onStop, onDecide, onGoTool, onGoKey, onCompare, onShowChanges, onReset, onHooks, onRun, onUpload, skillApi, opt, setOpt, cmdHint, cnt, onReplay, permImpact }) {
  const [cfg, setCfg] = useState(false), [, setSec] = useState(0);
  const scRef = useRef(null), stick = useRef(true), taRef = useRef(null);
  const bridge = ws && ws.kind === "bridge", ok = bridge && ws.features.includes("agent");
  const ag = V.agents.find((a) => a.id === agentId) || V.agents[0];
  const running = !!V.running, anyOpen = V.turns.some((t) => t.open);
  useEffect(() => { if (!anyOpen) return; const h = setInterval(() => setSec((s) => s + 1), 1000); return () => clearInterval(h); }, [anyOpen]);
  useEffect(() => { const el = scRef.current; if (el && stick.current) el.scrollTop = el.scrollHeight; });
  const onScroll = () => { const el = scRef.current; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60; };
  /* Anhänge: Büroklammer, Hineinziehen oder Einfügen (Strg+V) – werden sofort zur Bridge hochgeladen */
  const [att, setAtt] = useState([]), [drag, setDrag] = useState(false), fileRef = useRef(null);
  const addFiles = (list) => {
    for (const file of [...(list || [])].slice(0, 12)) {
      const key = Math.random().toString(36).slice(2), img = /^image\//.test(file.type);
      const url = img ? URL.createObjectURL(file) : "";
      setAtt((a) => [...a, { key, name: file.name || "Bild.png", size: file.size, mime: file.type, img, url, busy: true }]);
      Promise.resolve(onUpload ? onUpload(file) : Promise.reject(new Error("keine Bridge")))
        .then((info) => { if (url) ATT_URL.set(info.id, url); setAtt((a) => a.map((x) => x.key === key ? { ...x, ...info, busy: false } : x)); })
        .catch((e) => setAtt((a) => a.map((x) => x.key === key ? { ...x, busy: false, err: e.message } : x)));
    }
  };
  const ready = att.filter((x) => x.id && !x.err), uploading = att.some((x) => x.busy);
  /* Skills: Auswahl über „/“ am Anfang oder den Knopf; der erste wird als /befehl vorangestellt, weitere als Hinweis */
  const [mEdit, setMEdit] = useState(false);
  const [skills, setSkills] = useState(null), [skKnown, setSkKnown] = useState(null), [skBusy, setSkBusy] = useState(false);
  const [pick, setPick] = useState(false), [skQ, setSkQ] = useState(""), [chosen, setChosen] = useState([]), [dlg, setDlg] = useState(null);
  const loadSkills = useCallback(() => {
    if (!skillApi) return; setSkBusy(true);
    skillApi.skills().then((r) => { setSkills(r.skills || []); setSkKnown(r.known); }).catch(() => setSkills([])).finally(() => setSkBusy(false));
  }, [skillApi]);
  const openPick = (q = "") => { setSkQ(q); setPick(true); loadSkills(); };
  const pickSkill = (s) => {
    setChosen((c) => c.some((x) => x.name === s.name) ? c : [...c, s]);
    setDraft((d) => d.replace(/^\/\S*\s?/, "")); setPick(false); setTimeout(() => taRef.current && taRef.current.focus(), 0);
  };
  const editSkill = async (s) => {
    setPick(false);
    try { const r = await skillApi.skillRead(s.name); setDlg(r); } catch (e) { setDlg({ ...s, content: "Konnte nicht gelesen werden: " + e.message, editable: false }); }
  };
  const onDraft = (v) => {
    setDraft(v);
    const m = /^\/(\S*)$/.exec(v);   // „/“ am Anfang öffnet die Auswahl, wie in Claude Code
    if (m && skillApi) { if (!pick) openPick(m[1]); else setSkQ(m[1]); } else if (pick && !v.startsWith("/")) setPick(false);
  };
  const send = () => {
    let t = draft.trim(); if ((!t && !ready.length && !chosen.length) || uploading) return;
    if (chosen.length) {
      const names = chosen.map((s) => s.name);
      if (running) t = (t ? t + "\n\n" : "") + "Verwende dafür " + (names.length > 1 ? "die Skills " : "den Skill ") + names.join(", ") + ".";
      else t = "/" + names[0] + (t ? " " + t : "") + (names.length > 1 ? "\n\nVerwende außerdem " + (names.length > 2 ? "die Skills " : "den Skill ") + names.slice(1).join(", ") + "." : "");
    }
    stick.current = true; onSend(t, { attachments: ready.map((x) => x.id), files: ready }); setAtt([]); setChosen([]);
  };
  const onPaste = (e) => { const fs = [...(e.clipboardData && e.clipboardData.files || [])]; if (fs.length) { e.preventDefault(); addFiles(fs); } };
  const dragOn = (e) => { if ([...(e.dataTransfer && e.dataTransfer.types || [])].includes("Files")) { e.preventDefault(); setDrag(true); } };
  const key = (e) => {
    if (pick && ["ArrowDown", "ArrowUp", "Enter", "Tab", "Escape"].includes(e.key)) {   // Auswahl offen: Tasten gehen an die Liste
      e.preventDefault(); const inp = document.querySelector(".cal .sk-pop .sk-h input"); if (inp) inp.dispatchEvent(new KeyboardEvent("keydown", { key: e.key, bubbles: true })); return;
    }
    if (e.key === "Backspace" && !draft && chosen.length) { setChosen((c) => c.slice(0, -1)); return; }
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); }
  };
  useEffect(() => { const ta = taRef.current; if (!ta) return; ta.style.height = "auto"; ta.style.height = Math.min(220, Math.max(54, ta.scrollHeight + 2)) + "px"; }, [draft]);

  if (!ok) return (
    <div className="vd">
      <div className="vd-intro">
        <div className="kicker">KI live verfolgen</div>
        <h3>Sieh Claude Code beim Arbeiten zu</h3>
        <p>Der Atlas zeigt im Diagramm, was die KI liest, ändert und ausführt – und welche Funktionen, Variablen und Verbindungen dabei entstehen.</p>
        {!bridge ? (<>
          <div className="cl"><span>So startest du</span></div>
          <ol className="steps">
            <li>Im Terminal den Kern mit deinem Projektordner starten:<pre className="vcode cmd">{cmdHint}</pre></li>
            <li>Das Fenster öffnet sich verbunden – hier erscheint dann die Eingabe für deinen Auftrag.</li>
          </ol>
          <div className="hint">Ohne Kern (Demo, hochgeladene Dateien) gibt es nur das Diagramm: Der Browser allein darf weder Claude Code starten noch deinen Ordner überwachen.</div>
        </>) : <div className="hint bad">Diese Bridge ist zu alt (Version {ws.version || "?"}). Für die KI-Anbindung wird codeatlas_bridge.py ab Version 1.5 gebraucht.</div>}
      </div>
    </div>
  );
  const hooks = V.hooks || {};
  return (
    <div className="vd">
      <div className="vd-h">
        <span className={"dot " + (V.offline ? "bad" : running ? "wk" : ag && ag.found ? "ok" : "")} />
        <b>{ag ? ag.label : "KI"}</b>
        <span className="mut" title={V.resume && !running ? "Der nächste Auftrag knüpft an den bisherigen Verlauf an. „Neu“ beginnt eine frische Sitzung." : ""}>{V.offline ? "getrennt" : running ? "arbeitet" : ag && ag.found ? (V.resume ? "bereit · mit Verlauf" : "bereit") : "nicht gefunden"}</span>
        <span className="sp" />
        <button className="btn sm" disabled={running || !V.turns.length} onClick={onReset} title="Verlauf leeren und mit einer neuen Sitzung beginnen (Claude Code vergisst den bisherigen Verlauf)">Neu</button>
        <button className={"btn sm" + (cfg ? " on" : "")} onClick={() => setCfg(!cfg)} aria-label="Einstellungen" title="Einstellungen">⚙</button>
      </div>
      {cfg && (
        <div className="vd-cfg">
          {V.agents.length > 1 && <label className="ln"><span>Agent</span><select className="txt" value={ag ? ag.id : ""} onChange={(e) => setAgentId(e.target.value)}>{V.agents.map((a) => <option key={a.id} value={a.id} disabled={!a.found}>{a.label}{a.found ? "" : " (nicht gefunden)"}</option>)}</select></label>}
          <label className="chk"><input type="checkbox" checked={opt.follow} onChange={(e) => setOpt({ ...opt, follow: e.target.checked })} />Kamera folgt der KI<span className="hint">pausiert, sobald du selbst schiebst oder zoomst</span></label>
          <label className="chk"><input type="checkbox" checked={opt.ctx} onChange={(e) => setOpt({ ...opt, ctx: e.target.checked })} />Auswahl im Diagramm als Kontext mitgeben</label>
          <label className="chk"><input type="checkbox" checked={opt.autoBuild} disabled={!ws.presets.length} onChange={(e) => setOpt({ ...opt, autoBuild: e.target.checked })} />Nach jedem Auftrag Build prüfen{!ws.presets.length && <span className="hint">kein Compiler gefunden</span>}</label>
          <label className="chk"><input type="checkbox" checked={opt.autoFix} disabled={!opt.autoBuild} onChange={(e) => setOpt({ ...opt, autoFix: e.target.checked })} />Build-Fehler automatisch an die KI zurückgeben<span className="hint">höchstens 3 Versuche</span></label>
          {ws.features.includes("gate") && <div className="cfg-sec">
            <div className="cl"><span>Qualitätstor</span><span className="hint">bevor Claude „fertig“ meldet</span></div>
            <div className="row" style={{ gap: 14, flexWrap: "wrap" }}>
              {[["tests", "Tests (betroffene)"], ["build", "Build"], ["rules", "Architekturregeln"]].map(([k, l]) => <label key={k} className="chk"><input type="checkbox" checked={!!(opt.gate || {})[k]} disabled={k === "build" && !ws.presets.length} onChange={(e) => setOpt({ ...opt, gate: { ...(opt.gate || {}), [k]: e.target.checked } })} />{l}</label>)}
            </div>
            <div className="hint">Scheitert etwas, bekommt Claude den Bericht und arbeitet weiter (höchstens 3 Runden).</div>
          </div>}
          {ws.features.includes("git") && <label className="chk"><input type="checkbox" checked={!!opt.autoCommit} onChange={(e) => setOpt({ ...opt, autoCommit: e.target.checked })} />Nach jedem Auftrag committen<span className="hint">Git, Nachricht aus Auftrag + Änderungen</span></label>}
          {ws.features.includes("claudemd") && <label className="chk"><input type="checkbox" checked={!!opt.autoMap} onChange={(e) => setOpt({ ...opt, autoMap: e.target.checked })} />Projektkarte in CLAUDE.md aktuell halten<span className="hint">nach Aufträgen, die etwas geändert haben</span></label>}
          <label className="ln"><span>Aufwand</span><select className="txt" value={opt.effort || ""} onChange={(e) => setOpt({ ...opt, effort: e.target.value })} title="Wie gründlich Claude Code nachdenkt (--effort)">{EFFORT_DE.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          {skillApi && skillApi.account && <AccountBox api={skillApi} busyRun={!!running} />}
          <div className="cfg-hook">
            <div className="cl"><span>Claude Code im Terminal mitlesen</span><span className={hooks.installed ? "ok" : "mut"}>{hooks.installed ? "an" : "aus"}</span></div>
            <div className="hint">Arbeitest du lieber im Terminal oder in VS Code mit Claude Code, meldet es sich hier über Hooks: Der Atlas zeigt dann dieselbe Live-Ansicht. Eingetragen wird in <code>{(hooks.file || "").split("/").slice(1).join("/") || ".claude/settings.local.json"}</code>; fremde Einträge bleiben unberührt.</div>
            <div className="row"><button className={"btn sm" + (hooks.installed ? "" : " primary")} onClick={() => onHooks(!hooks.installed)}>{hooks.installed ? "Ausschalten" : "Einschalten"}</button>
              {hooks.installed && <span className="hint">Läuft Claude Code schon, dort einmal neu starten.</span>}</div>
          </div>
        </div>
      )}
      <div className="vd-feed" ref={scRef} onScroll={onScroll}>
        {!V.turns.length && (
          <div className="vd-empty">
            {ag && !ag.found ? (<>
              <b className="bad">Claude Code wurde nicht gefunden.</b>
              <p>Gesucht wurde <code>{ag.cmd}</code>. Installiere Claude Code (Anleitung: code.claude.com/docs), starte es einmal im Terminal mit <code>claude</code>, um dich anzumelden, und starte danach die Bridge neu.</p>
            </>) : (<>
              <b>Beschreibe unten, was gebaut oder geändert werden soll.</b>
              <p>Während Claude Code arbeitet, siehst du hier jeden Schritt und im Diagramm:</p>
              <div className="lg"><i style={{ background: "var(--accent2)" }} />liest<i style={{ background: "var(--amber)" }} />ändert<i style={{ background: "var(--violet)" }} />führt aus</div>
              <div className="lg"><i style={{ background: "var(--ay)" }} />neu<i style={{ background: "var(--amber)" }} />geändert<i style={{ background: "var(--red)" }} />entfernt</div>
              <p className="mut">Vor jedem Auftrag entsteht ein Kontrollpunkt – unter „Änderungen“ kannst du alles vergleichen und zurücksetzen.</p>
              <p className="mut">Lieber im Terminal oder in VS Code mit Claude Code arbeiten? Unter ⚙ „im Terminal mitlesen“ einschalten – dann erscheint dieselbe Live-Ansicht hier.</p>
            </>)}
          </div>
        )}
        {V.turns.map((T) => {
          const st = T.status;
          const lastTool = [...T.items].reverse().find((x) => x.type === "tool" && x.ph !== "end");
          return (
            <div key={T.n} className={"vt" + (T.open ? " open" : "")}>
              <div className="vt-h">
                <span className="n">#{T.n}</span>
                <span className="who">{T.src === "terminal" ? "Terminal" : T.agent || "KI"}</span>
                {T.model && <span className="mdl" title={"Modell" + (T.effort ? " · Aufwand " + T.effort : "")}>{shortModel(T.model)}{T.effort ? " · " + T.effort : ""}</span>}
                {T.mode && MODE_DE[T.mode] && <span className={"tag m-" + T.mode}>{MODE_DE[T.mode][0]}</span>}
                <span className="sp" /><span className="mut">{clock(T.t0)}</span>
              </div>
              {T.prompt ? (() => { const [cx, body] = splitCtx(T.prompt); return <div className="vt-p">{cx && <span className="ctx">Kontext: {cx}</span>}{body}<AttChips files={T.files} /></div>; })()
                : T.files && T.files.length ? <div className="vt-p"><AttChips files={T.files} /></div>
                : T.src === "terminal" && <div className="vt-p mut">(Auftrag wurde vor dem Mitlesen gestellt)</div>}
              {T.items.map((it, i) => {
                if (it.type === "text") return it.text.trim() ? <div key={i} className={"vi say" + (it.par ? " sub" : "")}><Md text={it.text} /></div> : null;
                if (it.type === "tool") return <ToolRow key={it.id || i} it={it} onGo={onGoTool} />;
                if (it.type === "user") return (
                  <div key={"u" + it.id} className={"vi usr " + it.st}>
                    <div className="vt-p">{it.text}<AttChips files={it.files} /></div>
                    <span className="us">{it.st === "sent" ? "an Claude Code gesendet – wird beim nächsten Schritt aufgenommen …" : it.st === "ack" ? "✓ von Claude Code aufgenommen" : "kommt als nächster Auftrag dran"}</span>
                  </div>
                );
                if (it.type === "gate") return (
                  <div key={i} className={"vi gate " + it.ph}>
                    <span className="gk">QUALITÄTSTOR{it.round ? " · Runde " + it.round : ""}</span>
                    <span>{it.ph === "check" ? "prüft " + (it.what || []).map((w) => ({ tests: "Tests", build: "Build", rules: "Regeln" })[w] || w).join(", ") + " …" : it.ph === "ok" ? "✓ bestanden – " + (it.text || "") : it.ph === "block" ? "✕ nicht bestanden – " + (it.text || "") + " → Claude bessert nach" : it.text}</span>
                    {it.report && <details><summary>Bericht an Claude</summary><pre className="vcode">{it.report}</pre></details>}
                  </div>
                );
                if (it.type === "note") return <div key={i} className={"vi note " + (it.lvl || "")}>{it.wait ? "⏸ " : it.lvl === "warn" ? "▲ " : "· "}{it.text}{it.wait && " – bitte im Terminal antworten"}</div>;
                if (it.type === "perm") return it.decision ? <div key={i} className={"vi note " + (it.decision === "allow" || it.decision === "auto" ? "ok" : "warn")}>{it.decision === "allow" ? "✓ erlaubt" : it.decision === "auto" ? "✓ automatisch erlaubt" : it.decision === "timeout" ? "⏱ keine Antwort – abgelehnt" : "✕ abgelehnt"}: {short(it.cmd || (it.path || "").split("/").slice(1).join("/") || it.name || "", 60)}</div> : null;
                if (it.type === "change") return (
                  <div key={i} className="vi chg">
                    <span className="ic">Δ</span>
                    <span className="cl2">
                      {it.list.slice(0, 8).map((x, j) => <button key={j} className={"chip " + x.st} onClick={() => onGoKey(x.dk, x.t, x.name)} title={x.cname}>{ST_SIGN[x.st]} {x.name}{x.t === "m" ? "()" : ""}</button>)}
                      {it.list.length > 8 && <span className="mut">+{it.list.length - 8}</span>}
                      {it.links > 0 && <span className="chip new">+ {it.links} Verbindung{it.links > 1 ? "en" : ""}</span>}
                    </span>
                  </div>
                );
                return null;
              })}
              {T.open && (
                <div className="vt-s"><span className="spin" />
                  <span>{lastTool ? "" : st ? (st.s === "task" && st.detail ? st.detail : STATUS_DE[st.s] || "arbeitet …") : "startet …"}{lastTool ? ((TOOL_DE[TOOL_KIND[lastTool.name]] || ["", "arbeitet"])[1] + " …") : ""}</span>
                  <span className="sp" /><span className="mut">{fmtDur(Math.floor((Date.now() - T.t0) / 1000) * 1000)}</span>
                </div>
              )}
              {!T.open && T.t1 && (
                <div className={"vt-e " + (T.ok ? "ok" : T.reason === "abgebrochen" ? "mut" : "bad")}>
                  <span>{T.ok ? "✓ fertig" : T.reason === "abgebrochen" ? "■ abgebrochen" : "✕ " + (T.reason || "Fehler")}</span>
                  {T.steps != null && <span>{T.steps} Schritte</span>}
                  {T.ms != null && <span>{fmtDur(T.ms)}</span>}
                  {T.cost != null && <span title="Schätzung von Claude Code, nicht die Abrechnung">{fmtCost(T.cost)}</span>}
                  <span className="acts">
                  {onRun && T.ok && T.mode !== "plan" && T === V.turns[V.turns.length - 1] && !running && <button className="lnk" onClick={onRun} title="Das Programm mit Messpunkten starten: der Ablauf erscheint live im Diagramm (Reiter „Ausführen“)">▶ ausführen</button>}
                  {T.cp && <button className="lnk" onClick={() => onCompare(T.cp)} title="Im Diagramm und unter „Änderungen“ mit dem Stand vor diesem Auftrag vergleichen">Δ vergleichen</button>}
                  {onReplay && T.items.some((x) => x.type === "tool" && TOOL_KIND[x.name]) && <button className="lnk" onClick={() => onReplay(T)} title="Diesen Auftrag Schritt für Schritt im Diagramm nachspielen">▶ abspielen</button>}
                  {T.commit && <span className="mut" title="Git-Commit dieses Auftrags">⎇ {T.commit}</span>}
                  </span>
                </div>
              )}
              {!T.open && !T.ok && T.result && !T.items.some((x) => x.type === "text") && <pre className="vcode out bad">{T.result}</pre>}
              {!T.open && T.ok && T.result && !T.items.some((x) => x.type === "text") && <div className="vi say"><Md text={T.result} /></div>}
              {!T.open && T.denied && T.denied.length > 0 && <div className="vi note warn">▲ {T.denied.length} Aufruf{T.denied.length > 1 ? "e" : ""} ohne Freigabe abgelehnt</div>}
              {!T.open && T.ok && T.mode === "plan" && T === V.turns[V.turns.length - 1] && !running && (
                <div className="row"><button className="btn primary sm" onClick={() => onSend("Setze den vorgelegten Plan jetzt um.", { mode: "acceptEdits" })}>▶ Plan umsetzen</button><span className="hint">oder unten Änderungswünsche zum Plan schreiben</span></div>
              )}
            </div>
          );
        })}
      </div>
      {V.perms.map((p) => <PermCard key={p.id} p={p} onDecide={onDecide} imp={permImpact ? permImpact(p) : null} />)}
      <div className={"vd-in" + (drag ? " drag" : "")} onDragEnter={dragOn} onDragOver={dragOn} onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDrag(false); }}
        onDrop={(e) => { if (e.dataTransfer && e.dataTransfer.files.length) { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); } }}>
        {drag && <div className="vd-drop">Dateien oder Bilder hier ablegen</div>}
        {cnt && !running && (cnt.nNew + cnt.nChg + cnt.nDel + cnt.lNew > 0) && (
          <button className="vd-sum" onClick={onShowChanges}>Δ <b className="ok">+{cnt.nNew + cnt.mNew}</b> <b className="am">~{cnt.mChg}</b> <b className="bad">−{cnt.nDel + cnt.mDel}</b> · {cnt.lNew} neue Verbindung{cnt.lNew === 1 ? "" : "en"} <span className="mut">anzeigen ▸</span></button>
        )}
        <div className="vd-mrow">
        <div className="seg modes" role="group" aria-label="Arbeitsweise">
          {(V.modes.length ? V.modes : ["plan", "ask", "acceptEdits"]).map((m) => <button key={m} className={mode === m ? "on" : ""} onClick={() => setMode(m)} title={MODE_DE[m][1]}>{MODE_DE[m][0]}</button>)}
        </div>
        {ag && ag.kind === "claude" && (() => {
          const cur = opt.model || "", custom = cur && !MODELS.some(([v]) => v === cur);
          if (mEdit) return (
            <input className="txt vd-model" autoFocus defaultValue={cur} placeholder="z. B. claude-opus-5-5" aria-label="Eigenes Modell"
              onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") { e.currentTarget.value = cur; e.currentTarget.blur(); } }}
              onBlur={(e) => { const v = e.currentTarget.value.trim(); setMEdit(false); if (/^[A-Za-z0-9][A-Za-z0-9._:\[\]-]{0,79}$/.test(v) || !v) setOpt({ ...opt, model: v }); }} />
          );
          return (
            <select className="txt vd-model" value={custom ? "*" : cur} title={"Modell für die nächsten Aufträge (--model)" + (V.model ? " · zuletzt: " + V.model : "")} aria-label="Modell"
              onChange={(e) => { const v = e.target.value; if (v === "*") setMEdit(true); else setOpt({ ...opt, model: v }); }}>
              {MODELS.map(([v, l]) => <option key={v} value={v}>{v ? l : "Modell: Standard" + (V.defModel ? " (" + V.defModel + ")" : "")}</option>)}
              <option value="*">{custom ? "Eigenes: " + cur : "Eigenes …"}</option>
            </select>
          );
        })()}
        </div>
        {pick && <SkillPick list={skills} known={skKnown} q={skQ} setQ={setSkQ} busy={skBusy} onPick={pickSkill} onEdit={editSkill} onReload={loadSkills}
          onNew={() => { setPick(false); setDlg({ scope: "projekt" }); }} onClose={() => { setPick(false); if (/^\/\S*$/.test(draft)) setDraft(""); }} />}
        {dlg && <SkillDialog init={dlg} api={skillApi} onClose={() => setDlg(null)} onDone={() => { setDlg(null); loadSkills(); }}
          onAskAI={ag && ag.found && !running ? (p) => onSend(p, { mode: "acceptEdits" }) : null} />}
        {chosen.length > 0 && <div className="att">{chosen.map((s) => <span key={s.name} className="att-c sk" title={s.desc}><span className="ic">✦</span><span className="nm">/{s.name}</span><button className="xp" onClick={() => setChosen((c) => c.filter((x) => x !== s))} aria-label={s.name + " entfernen"}>✕</button></span>)}</div>}
        <AttChips files={att} onRemove={(f) => setAtt((a) => a.filter((x) => x !== f))} />
        <textarea ref={taRef} className="txt vd-ta" value={draft} onChange={(e) => onDraft(e.target.value)} onKeyDown={key} onPaste={onPaste} spellCheck={false} id="cal-prompt"
          placeholder={running ? "Nachricht an Claude Code – wird beim nächsten Schritt aufgenommen" : mode === "plan" ? "Was soll geplant werden?" : "Was soll gebaut oder geändert werden?"} />
        {selLabel && opt.ctx && <div className="vd-ctx" title="Wird dem Auftrag als Hinweis vorangestellt">Kontext: <b>{selLabel}</b><button className="xp" onClick={() => setOpt({ ...opt, ctx: false })} aria-label="Kontext nicht mitgeben">✕</button></div>}
        <div className="row">
          <button className="btn primary" disabled={(!draft.trim() && !ready.length && !chosen.length) || uploading || !ag || !ag.found || V.offline} onClick={send}
            title={running ? "Nachricht an den laufenden Auftrag (Enter)" : "Auftrag senden (Enter)"}>{running ? "➤ Senden" : "▶ Senden"}</button>
          {running && <button className="btn stop" onClick={onStop} title="Auftrag abbrechen">■ Stopp</button>}
          <button className="btn icon" onClick={() => fileRef.current && fileRef.current.click()} title="Bilder oder Dateien anhängen – auch per Hineinziehen oder Strg+V" aria-label="Datei anhängen">📎</button>
          {skillApi && <button className={"btn icon sk-btn" + (pick ? " on" : "")} onClick={() => (pick ? setPick(false) : openPick(""))} title="Skill auswählen oder neu anlegen – oder „/“ am Anfang tippen" aria-label="Skills">／</button>}
          <input ref={fileRef} type="file" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
          <span className="hint">{running ? "Geht direkt an Claude Code – wie im Terminal" : MODE_DE[mode] ? MODE_DE[mode][1] : ""}</span>
        </div>
      </div>
    </div>
  );
});

/* ---------- Leiste über dem Diagramm: was sich seit dem Kontrollpunkt geändert hat ---------- */
function ChangeBar({ cnt, baseLabel, layerOn, setLayerOn, only, setOnly, follow, setFollow, onOpen, ai, hasAgent }) {
  const any = cnt && (cnt.nNew + cnt.nChg + cnt.nDel + cnt.eNew + cnt.eDel + cnt.lNew + cnt.lDel > 0);
  if (!any && !ai && !hasAgent) return null;
  return (
    <div className="chgbar">
      {ai && <span className="ai"><span className="spin" />{ai}</span>}
      {any ? (<>
        <button className="lbl" onClick={onOpen} title="Änderungsliste öffnen – womit verglichen wird, stellst du dort ein">Δ seit {baseLabel}</button>
        {cnt.nNew > 0 && <span className="c new"><i />{cnt.nNew} neu</span>}
        {cnt.nChg > 0 && <span className="c chg"><i />{cnt.nChg} geändert</span>}
        {cnt.nDel > 0 && <span className="c del"><i />{cnt.nDel} entfernt</span>}
        {(cnt.lNew > 0 || cnt.eNew > 0) && <span className="c new">⊕ {cnt.lNew || cnt.eNew} Verbindung{(cnt.lNew || cnt.eNew) === 1 ? "" : "en"}</span>}
        {(cnt.lDel > 0 || cnt.eDel > 0) && <span className="c del">⊖ {cnt.lDel || cnt.eDel}</span>}
        <button className={"tg" + (layerOn ? " on" : "")} onClick={() => setLayerOn(!layerOn)} title="Änderungen im Diagramm markieren">Markieren</button>
        <button className={"tg" + (only ? " on" : "")} onClick={() => setOnly(!only)} title="Nur Änderungen zeigen: alles Unveränderte abblenden">Nur Δ</button>
      </>) : !ai && <span className="mut">Δ keine Änderungen seit {baseLabel}</span>}
      {hasAgent && <button className={"tg" + (follow ? " on" : "")} onClick={() => setFollow(!follow)} title="Die Kamera springt dorthin, wo die KI gerade arbeitet – pausiert, solange du selbst schiebst oder zoomst">KI folgen</button>}
    </div>
  );
}

/* ---------- Konsole: Änderungen (Liste + Diff + Zurücksetzen) ---------- */
const DiffView = memo(function DiffView({ path, a, b, line, onEdit, onExt, onRevert, canRevert }) {
  const d = useMemo(() => diffLines(a == null ? "" : a, b == null ? "" : b), [a, b]);
  const H = useMemo(() => hunksOf(d, 3), [d]);
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const rows = [...el.querySelectorAll("[data-b]")]; let hit = null;
    if (line) for (const r of rows) { if (+r.dataset.b >= line) { hit = r; break; } }
    if (hit) hit.scrollIntoView({ block: "center" }); else el.scrollTop = 0;
  }, [path, line, H]);
  const status = a == null ? "neu angelegt" : b == null ? "gelöscht" : "geändert";
  let shown = 0;
  return (
    <div className="dv">
      <div className="dv-h">
        <b>{path.split("/").slice(1).join("/") || path}</b><span className="mut">{status}</span>
        <span className="ok">+{de(d.add)}</span><span className="bad">−{de(d.del)}</span>
        <span className="sp" />
        {b != null && <button className="btn sm" onClick={() => onEdit(path, line || 1)}>Im Editor</button>}
        {b != null && <button className="btn sm" onClick={() => onExt(path, line || 1)}>↗</button>}
        {canRevert && <button className="btn sm stop" onClick={() => onRevert([path])} title="Nur diese Datei auf den Stand des Kontrollpunkts zurücksetzen">↶ Datei zurücksetzen</button>}
      </div>
      <div className="dv-b" ref={ref}>
        {d.rough && <div className="hint">Sehr große Änderung – als vollständiger Austausch dargestellt.</div>}
        {!H.hunks.length && <div className="hint">Kein Unterschied im Text (nur Zeitstempel oder Zeilenenden).</div>}
        {H.hunks.map((h, hi) => {
          if (shown > 2500) return null;
          shown += h.rows.length;
          return (
            <div key={hi}>
              {h.gap > 0 && <div className="dv-gap">⋯ {de(h.gap)} unveränderte Zeile{h.gap > 1 ? "n" : ""}</div>}
              {h.rows.map((r, i) => (
                <div key={i} className={"dl " + (r[0] === "+" ? "add" : r[0] === "-" ? "del" : "")} data-b={r[0] !== "-" ? r[2] + 1 : undefined} onDoubleClick={() => b != null && onEdit(path, r[2] + 1)}>
                  <span className="no">{r[0] !== "+" ? r[1] + 1 : ""}</span><span className="no">{r[0] !== "-" ? r[2] + 1 : ""}</span>
                  <span className="sg">{r[0]}</span><span className="tx">{r[0] === "+" ? d.b[r[2]] : d.a[r[1]]}</span>
                </div>
              ))}
            </div>
          );
        })}
        {H.tail > 0 && H.hunks.length > 0 && <div className="dv-gap">⋯ {de(H.tail)} unveränderte Zeile{H.tail > 1 ? "n" : ""}</div>}
        {shown > 2500 && <div className="hint">Anzeige gekürzt – im Editor öffnen für den ganzen Stand.</div>}
      </div>
    </div>
  );
});

const ChangesTab = memo(function ChangesTab({ ws, base, changes, cps, baseSel, setBaseSel, files, busy, onGoKey, onGoLink, onEdit, onExt, onRestore, onCheckpoint, pick, setPick, undo, onUndo }) {
  const [sure, setSure] = useState(false);
  useEffect(() => { if (!sure) return; const h = setTimeout(() => setSure(false), 4000); return () => clearTimeout(h); }, [sure]);
  const ok = ws && ws.kind === "bridge" && ws.features.includes("checkpoints");
  const d = base && base.diff;
  const fileRows = useMemo(() => {
    if (!d) return [];
    const row = (p, st) => {
      const a = st === "new" ? null : base.texts.get(p), e = files.get(p), b = st === "del" ? null : e && e.text != null ? e.text : null;
      let add = null, del = null;
      if ((a != null || b != null) && (a || "").length + (b || "").length < 600000) { const x = diffLines(a || "", b || ""); add = x.add; del = x.del; if (a == null) del = 0; if (b == null) add = 0; }
      return { p, st, a, b, add, del };
    };
    return [...d.changed.map((p) => row(p, "chg")), ...d.added.map((p) => row(p, "new")), ...d.removed.map((p) => row(p, "del"))];
  }, [d, files, base]);
  const cur = fileRows.find((r) => r.p === (pick && pick.path)) || fileRows[0] || null;
  if (!ok) return <div className="tab-pad"><div className="hint">Änderungen vergleichen und zurücksetzen funktioniert mit der Bridge ab Version 1.5 (Kontrollpunkte liegen im Projektordner unter .codeatlas). ⚙ Verbindungen → Bridge.</div></div>;
  const L = changes ? changes.list : { nodes: [], edges: [], links: [] }, cnt = changes ? changes.cnt : null;
  const structural = L.edges.filter((e) => e.type !== "call" && e.type !== "data");
  const nFiles = fileRows.length;
  return (
    <div className="chg-grid">
      <div className="chg-l">
        <div className="chg-top">
          <select className="txt" value={baseSel} onChange={(e) => setBaseSel(e.target.value)} title="Womit der jetzige Stand verglichen wird">
            <option value="turn">Vergleich: seit dem letzten Auftrag</option>
            <option value="session">Vergleich: seit Start der Bridge</option>
            {cps.map((c) => <option key={c.id} value={c.id}>{clock(c.time)} · {short(c.label || c.source || c.id, 44)}</option>)}
          </select>
          <div className="row">
            <button className="btn sm" onClick={onCheckpoint} title="Kontrollpunkt setzen: den jetzigen Stand als Vergleichsbasis festhalten">＋ Kontrollpunkt</button>
            <button className={"btn sm" + (sure ? " stop" : "")} disabled={!nFiles || busy} onClick={() => { if (sure) { setSure(false); onRestore(null); } else setSure(true); }}
              title="Alle Dateien auf den Stand des Vergleichs zurücksetzen – der jetzige Stand wird vorher gesichert">{sure ? "Wirklich alles zurücksetzen?" : "↶ Alles zurücksetzen"}</button>
            {undo && <button className="btn sm amber" onClick={onUndo} title="Das letzte Zurücksetzen wieder aufheben">↷ Zurücksetzen aufheben</button>}
          </div>
          {base && <div className="hint" title={base.label || ""}>Basis: {short(base.label || "Kontrollpunkt", 54)} · {clock(base.time)}{busy ? " · vergleiche …" : ""}</div>}
        </div>
        {!nFiles && !busy && <div className="hint" style={{ padding: "10px 12px" }}>Seit diesem Kontrollpunkt wurde nichts geändert.</div>}
        {cnt && L.nodes.length > 0 && (<>
          <div className="cl"><span>Bausteine</span><span><b className="ok">+{cnt.nNew}</b> <b className="am">~{cnt.nChg}</b> <b className="bad">−{cnt.nDel}</b></span></div>
          {L.nodes.slice(0, 120).map((n) => (
            <div key={n.dk} className="cn">
              <div className={"cr " + n.st} onClick={() => { onGoKey(n.dk); setPick({ path: n.file, line: 1 }); }}>
                <span className="sg">{ST_SIGN[n.st]}</span><b>{n.name}</b>{KIND_DE[n.kind] && <span className="mut">«{KIND_DE[n.kind]}»</span>}<span className="sp" /><span className="mut fp">{baseName(n.file)}</span>
              </div>
              {n.st !== "del" && n.mem.slice(0, n.st === "new" ? 10 : 30).map((m, i) => (
                <div key={i} className={"cr sub " + m.st} onClick={() => { if (m.st !== "del") onGoKey(n.dk, m.t, m.name); setPick({ path: n.file, line: m.st === "del" ? 1 : m.line }); }}>
                  <span className="sg">{ST_SIGN[m.st]}</span><span>{m.name}{m.t === "m" ? "()" : ""}</span><span className="sp" /><span className="mut">{m.t === "m" ? "Funktion" : "Variable"}{m.st !== "del" && m.line ? " · Z. " + m.line : ""}</span>
                </div>
              ))}
              {n.st === "new" && n.mem.length > 10 && <div className="cr sub mut">… {n.mem.length - 10} weitere</div>}
            </div>
          ))}
        </>)}
        {cnt && L.links.length + structural.length > 0 && (<>
          <div className="cl"><span>Verbindungen</span><span><b className="ok">+{cnt.lNew}</b> <b className="bad">−{cnt.lDel}</b></span></div>
          {L.links.slice(0, 240).map((l, i) => (
            <div key={i} className={"cr lk " + l.st} onClick={() => onGoLink(l)} title={`${l.an}.${l.am}() ${LINK_DE[l.kind] || l.kind} ${l.bn}${l.bm ? "." + l.bm : ""}`}>
              <span className="sg">{ST_SIGN[l.st]}</span>
              <span className="lf"><i>{l.an}</i>{l.am}()</span><span className={"lkind k-" + l.kind}>{LINK_DE[l.kind] || l.kind}</span><span className="lt"><i>{l.a === l.b ? "" : l.bn}</i>{l.bm ? l.bm + (l.bt === "m" ? "()" : "") : l.bn}</span>
            </div>
          ))}
          {L.links.length > 240 && <div className="cr mut">… {de(L.links.length - 240)} weitere</div>}
          {structural.slice(0, 60).map((e, i) => (
            <div key={"e" + i} className={"cr lk " + e.st} onClick={() => onGoLink({ a: e.a, b: e.b })}>
              <span className="sg">{ST_SIGN[e.st]}</span><span className="lf">{e.an}</span><span className="lkind">{(EDGE_T[e.type] || {}).label || e.type}</span><span className="lt">{e.bn}</span>
            </div>
          ))}
        </>)}
        {nFiles > 0 && (<>
          <div className="cl"><span>Dateien</span><span>{de(nFiles)}</span></div>
          {fileRows.map((r) => (
            <div key={r.p} className={"cr fl " + r.st + (cur && cur.p === r.p ? " on" : "")} onClick={() => setPick({ path: r.p, line: 0 })}>
              <span className="sg">{ST_SIGN[r.st]}</span><span className="fp" title={r.p}>{r.p.split("/").slice(1).join("/")}</span><span className="sp" />
              {r.add != null && <span className="mut"><b className="ok">+{de(r.add)}</b> <b className="bad">−{de(r.del)}</b></span>}
              <button className="xp" title="Diese Datei zurücksetzen" onClick={(e) => { e.stopPropagation(); onRestore([r.p]); }}>↶</button>
            </div>
          ))}
        </>)}
      </div>
      <div className="chg-r">
        {cur ? (cur.a == null && cur.b == null ? <div className="hint" style={{ padding: 12 }}>Kein Text zum Vergleichen (Binärdatei oder zu groß).</div>
          : <DiffView path={cur.p} a={cur.a} b={cur.b} line={pick && pick.path === cur.p ? pick.line : 0} onEdit={onEdit} onExt={onExt} onRevert={onRestore} canRevert />)
          : <div className="hint" style={{ padding: 12 }}>Wähle links eine Datei, einen Baustein oder eine Verbindung.</div>}
      </div>
    </div>
  );
});

/* ============================ Tests im Atlas ============================ */
/* Zustand: je Lauf (eine Sprache) die Tests in Reihenfolge; angezeigt wird je Sprache der jüngste Lauf. */
function createTests() { return { runs: new Map(), rev: 0 }; }
function testUp(R, t) {
  const e = R.tests.get(t.id);
  if (!e) { R.tests.set(t.id, { ...t }); R.order.push(t.id); } else Object.assign(e, t);
}
function testApply(T, msg) {
  const run = msg.run || 0;
  if (msg.k === "start" && msg.test) {
    const R = { run, label: msg.label, kind: msg.test, tests: new Map(), order: [], hits: new Map(), done: false, ended: false, summary: null, cov: null, info: {}, cur: null, t0: Date.now(), build: null, partial: !!msg.partial };
    if (R.partial) {   // Teil-Lauf (Filter / nur fehlgeschlagene / ein Test): übrige Tests mit ihrem letzten Stand behalten
      const prev = testLatest(T).find((x) => x.kind === R.kind && x.label.replace(/\s*\(.*$/, "") === R.label.replace(/\s*\(.*$/, ""));
      if (prev) { for (const id of prev.order) { R.tests.set(id, { ...prev.tests.get(id), old: true }); R.order.push(id); if (prev.hits.has(id)) R.hits.set(id, prev.hits.get(id)); } R.cov = prev.cov; R.prevRun = prev.prevRun || prev.run; }
    }
    T.runs.set(run, R);
    const ids = [...T.runs.keys()]; for (const id of ids.slice(0, Math.max(0, ids.length - 8))) T.runs.delete(id);
    T.rev++; return true;
  }
  const R = T.runs.get(run); if (!R) return false;
  if (msg.k === "build") { if (!msg.ok) R.build = msg.output; }
  else if (msg.k === "end") R.ended = true;
  else if (msg.k === "test") {
    if (msg.ev === "info") R.info = msg.info || {};
    else if (msg.ev === "collect") for (const t of msg.tests || []) testUp(R, { ...t, old: false, was: undefined });
    else if (msg.ev === "start") { testUp(R, { id: msg.id, status: "running", old: false }); R.cur = msg.id; }
    else if (msg.ev === "end") { testUp(R, { ...msg.test, old: false }); if (R.cur === msg.test.id) R.cur = null; }
    else if (msg.ev === "hits") R.hits.set(msg.id, msg.codes || []);
  } else if (msg.k === "tests" && msg.ev === "done") {
    R.done = true; R.summary = msg.summary; R.ms = msg.ms; if (!R.partial || !R.cov) R.cov = msg.cov;
    for (const [id, w] of Object.entries(msg.was || {})) { const t = R.tests.get(id); if (t) t.was = w; }
  }
  else return false;
  T.rev++; return true;
}
function testLatest(T) {
  const by = new Map();
  for (const R of T.runs.values()) by.set(R.kind + "|" + R.label.replace(/\s*\(.*$/, ""), R);
  return [...by.values()].sort((a, b) => a.run - b.run);
}
function testSummary(T) {
  const s = { passed: 0, failed: 0, error: 0, skipped: 0, bad: 0, running: false, total: 0, broke: 0, fixed: 0 };
  for (const R of testLatest(T)) {
    if (!R.ended) s.running = true;
    for (const t of R.tests.values()) {
      if (s[t.status] != null) s[t.status]++; s.total++;
      if (t.was === "passed" && (t.status === "failed" || t.status === "error")) s.broke++;
      else if (t.was && t.was !== "passed" && t.status === "passed") s.fixed++;
    }
  }
  s.bad = s.failed + s.error; return s;
}
const TST_IC = { passed: "✓", failed: "✗", error: "!", skipped: "○", queued: "·", running: "" };
const TST_DE = { passed: "bestanden", failed: "fehlgeschlagen", error: "Fehler", skipped: "übersprungen", queued: "wartet", running: "läuft" };
const tPath = (p) => (p ? String(p).split("/").slice(1).join("/") || p : "");
const tName = (t) => t.name || t.id.split("::").slice(1).join("::") || t.id;

function TestDetail({ t, R, onEdit, onPickFn }) {
  const loc = (x, lab) => x && (
    <div className="td-l">
      <span className="lab">{lab}</span>
      <button className="lnk" onClick={() => onEdit(x.path, x.line)} title="Im Editor öffnen">{tPath(x.path)}:{x.line}</button>
      {x.func && <span className="fn">in {x.func}</span>}
      {x.code && <code>{x.code}</code>}
      {x.locals && Object.keys(x.locals).length > 0 && <div className="td-v">{Object.entries(x.locals).slice(0, 10).map(([k, v]) => <span key={k}><b>{k}</b>={v}</span>)}</div>}
    </div>
  );
  return (
    <div className="td">
      {(t.etype || t.msg) && <pre className={"td-m" + (t.status === "skipped" ? " mut" : "")}>{(t.etype ? t.etype + (t.msg ? ": " : "") : "") + (t.msg || "")}</pre>}
      {t.checks && t.checks.map((c, i) => (
        <div key={i} className="td-l"><span className="lab">Prüfung</span><button className="lnk" onClick={() => onEdit(c.path, c.line)}>{tPath(c.path)}:{c.line}</button><code>CHECK({c.expr})</code>{c.detail && <span className="bad">→ {c.detail}</span>}</div>
      ))}
      {!t.checks && loc(t.at, "Prüfung im Test")}
      {loc(t.where, "Fehlerort im Programm")}
      {!t.where && t.status === "failed" && <div className="td-l mut">Kein Programmcode im Traceback – das Programm liefert einen falschen Wert. Verdächtig: die ausgeführten Funktionen unten.</div>}
      {t.frames && t.frames.length > 1 && (
        <div className="td-l"><span className="lab">Aufrufpfad</span>
          {t.frames.slice(-8).map((f, i) => <React.Fragment key={i}>{i > 0 && <span className="mut"> → </span>}<button className="chip" onClick={() => onPickFn(f.path, f.line)} title={tPath(f.path) + ":" + f.line}>{f.func || "?"}</button></React.Fragment>)}
        </div>
      )}
      {t.ran && t.ran.length > 0 && (
        <div className="td-l"><span className="lab">Ausgeführt</span>
          {t.ran.slice(0, 24).map((f, i) => <button key={i} className="chip ran" onClick={() => onPickFn(f.path, f.line)} title={tPath(f.path) + ":" + f.line}>{f.name} <i>×{de(f.n)}</i></button>)}
          {t.ran.length > 24 && <span className="mut">+{t.ran.length - 24}</span>}
        </div>
      )}
      {t.out && t.out.trim() && <pre className="td-o">{t.out.trim().slice(-1500)}</pre>}
    </div>
  );
}

function TestsTab({ T, tick, info, sel, onSel, onRun, onStop, onEdit, onPickFn, onAskAI, hasAgent, auto, setAuto }) {
  const [flt, setFlt] = useState(() => lsGet("cal-tflt", ""));
  const [onlyBad, setOnlyBad] = useState(false);
  const [covOpen, setCovOpen] = useState(null);
  useEffect(() => { lsSet("cal-tflt", flt); }, [flt]);
  const runs = testLatest(T), sum = testSummary(T);
  const files = info ? [info.py && `Python · ${info.py.framework} · ${info.py.files.length} Datei${info.py.files.length === 1 ? "" : "en"}`,
    info.c && `C · atlas_test.h · ${info.c.files.length} Datei${info.c.files.length === 1 ? "" : "en"}${info.c.gcc ? "" : " (gcc fehlt)"}`, ...(info.cmd || []).map((c) => "eigener Befehl: " + c)].filter(Boolean) : [];
  return (
    <div className="tt">
      <div className="tt-bar">
        <button className="btn sm primary" onClick={() => onRun(flt)} disabled={sum.running}>▶ Tests ausführen</button>
        {sum.bad > 0 && !sum.running && <button className="btn sm" onClick={() => onRun("", { failed: true })} title="Nur die fehlgeschlagenen Tests noch einmal – schneller Check nach einer Korrektur">↻ Nur fehlgeschlagene ({de(sum.bad)})</button>}
        {sum.running && <button className="btn sm" onClick={onStop}>■ Stopp</button>}
        <input className="tt-f" value={flt} onChange={(e) => setFlt(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !sum.running) onRun(flt); }} placeholder="Filter: Name oder Datei" aria-label="Testfilter" />
        <label className="tt-cb"><input type="checkbox" checked={onlyBad} onChange={(e) => setOnlyBad(e.target.checked)} /> nur Fehler</label>
        {sum.total > 0 && (
          <span className="tt-sum">
            <span className="ok">✓ {de(sum.passed)}</span>{sum.failed > 0 && <span className="bad">✗ {de(sum.failed)}</span>}{sum.error > 0 && <span className="bad">! {de(sum.error)}</span>}{sum.skipped > 0 && <span className="mut">○ {de(sum.skipped)}</span>}
          </span>
        )}
        {sum.broke > 0 && <span className="tt-reg bad" title="Liefen im vorigen Lauf durch">▼ {de(sum.broke)} neu kaputt</span>}
        {sum.fixed > 0 && <span className="tt-reg ok" title="Schlugen im vorigen Lauf fehl">▲ {de(sum.fixed)} repariert</span>}
        <span className="sp" />
        {hasAgent && setAuto && <label className="tt-cb" title="Nach jedem KI-Auftrag, der Dateien geändert hat, laufen die Tests von selbst – du siehst sofort, ob etwas kaputtgegangen ist"><input type="checkbox" checked={!!auto} onChange={(e) => setAuto(e.target.checked)} /> nach KI-Auftrag automatisch</label>}
        {onAskAI && sum.bad > 0 && !sum.running && <button className="btn sm amber" onClick={onAskAI} title="Fehlerorte, Aufrufpfade und Variablen als Auftrag an Claude">✦ Fehler an KI geben</button>}
      </div>
      {files.length > 0 && <div className="tt-info mut">{files.join("   ·   ")}</div>}
      {!runs.length && (
        <div className="tt-empty">
          <p>{info && !info.py && !info.c ? "Noch keine Testdateien im Projekt." : "Noch kein Testlauf."} Tests laufen hier mit Trace: du siehst im Diagramm, was jeder Test ausführt, und bei Fehlern den genauen Ort im Programm.</p>
          <p className="mut"><b>Python:</b> Dateien <code>test_*.py</code> mit Funktionen <code>test_*()</code> und <code>assert</code> (oder unittest) – pytest wird genutzt, wenn installiert.<br />
            <b>C/C++:</b> Dateien <code>test_*.c</code> mit <code>#include "atlas_test.h"</code> und <code>TEST(name) {"{"} CHECK(…); CHECK_EQ_INT(a, b); {"}"}</code> – kein <code>main()</code>; der Atlas linkt das Programm dazu.</p>
          {hasAgent && <p className="mut">Claude kann Tests selbst schreiben und hier ausführen (Werkzeug <code>tests_run</code>) – z. B. „Schreib Tests für tor.c und lass sie laufen“. Es bekommt dann Fehlerorte und Aufrufpfade statt Konsolentext.</p>}
        </div>
      )}
      {runs.map((R) => {
        const list = R.order.map((id) => R.tests.get(id)).filter((t) => (!onlyBad || t.status === "failed" || t.status === "error"));
        const n = { passed: 0, failed: 0, error: 0, skipped: 0 }; for (const t of R.tests.values()) if (n[t.status] != null) n[t.status]++;
        return (
          <div key={R.run} className="tt-run">
            <div className="tt-rh">
              {!R.ended ? <span className="spin" /> : n.failed + n.error ? <span className="bad">✗</span> : <span className="ok">✓</span>}
              <b>{R.label}</b>
              <span className="mut">{de(R.tests.size)} Test{R.tests.size === 1 ? "" : "s"}{R.ms ? " · " + fmtDur(R.ms) : ""}{R.cur && !R.ended ? " · läuft: " + tName(R.tests.get(R.cur) || { id: R.cur }) : ""}</span>
              <span className="sp" />
              {R.cov && R.cov.total > 0 && (
                <button className={"tt-cov" + (covOpen === R.run ? " on" : "")} onClick={() => setCovOpen(covOpen === R.run ? null : R.run)} title="Programmfunktionen, die mindestens ein Test ausgeführt hat">
                  <span className="bar"><span style={{ width: Math.round((R.cov.reached / R.cov.total) * 100) + "%" }} /></span>
                  Abdeckung {de(R.cov.reached)}/{de(R.cov.total)}
                </button>
              )}
            </div>
            {R.build && <pre className="td-o bad">{R.build.slice(-2500)}</pre>}
            {covOpen === R.run && R.cov && (
              <div className="td-l tt-miss"><span className="lab">Nicht erreicht</span>
                {(R.cov.missing || []).length > 0 && <button className={"btn sm" + (sel && sel.cov && sel.run === R.run ? " on" : "")} onClick={() => onSel(sel && sel.cov && sel.run === R.run ? null : { run: R.run, cov: true })} title="Alle nicht erreichten Funktionen im Diagramm markieren">im Diagramm zeigen</button>}
                {(R.cov.missing || []).length ? R.cov.missing.map((m, i) => <button key={i} className="chip miss" onClick={() => onPickFn(m.path, m.line)} title={tPath(m.path) + ":" + m.line}>{m.name}</button>) : <span className="ok">alle Funktionen erreicht</span>}
              </div>
            )}
            {R.ended && !R.tests.size && !R.build && <div className="tt-empty mut">Keine Tests gefunden (Dateien test_*.py / test_*.c).</div>}
            {list.map((t) => {
              const on = sel && sel.run === R.run && sel.id === t.id, bad = t.status === "failed" || t.status === "error";
              return (
                <div key={t.id} className={"tt-t s-" + t.status + (on ? " on" : "") + (t.old ? " old" : "")}>
                  <div className="tt-row" onClick={() => onSel(on ? null : { run: R.run, id: t.id })} title={"Klick: im Diagramm zeigen, was dieser Test ausführt" + (bad ? " und wo er scheitert" : "")}>
                    <span className="ic">{t.status === "running" ? <span className="spin" /> : TST_IC[t.status] || "·"}</span>
                    <span className="nm">{tName(t)}</span>
                    <span className="fl mut">{tPath(t.file)}{t.line ? ":" + t.line : ""}</span>
                    <span className="sp" />
                    {t.was === "passed" && bad && <span className="rg b" title="Lief im vorigen Lauf durch">NEU KAPUTT</span>}
                    {t.was && t.was !== "passed" && t.status === "passed" && <span className="rg f" title="Schlug im vorigen Lauf fehl">REPARIERT</span>}
                    {bad && t.etype && <span className="et">{t.etype}</span>}
                    {t.ms != null && t.status !== "running" && t.status !== "queued" && <span className="ms mut">{t.ms >= 1 ? fmtDur(Math.round(t.ms)) : "< 1 ms"}</span>}
                    {!sum.running && R.kind !== "cmd" && <button className="tt-re" onClick={(e) => { e.stopPropagation(); onRun("", { only: [t.id] }); }} title="Nur diesen Test noch einmal" aria-label={"Test " + tName(t) + " wiederholen"}>▶</button>}
                  </div>
                  {(on || (bad && !sel)) && t.status !== "running" && t.status !== "queued" && <TestDetail t={t} R={R} onEdit={onEdit} onPickFn={onPickFn} />}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

/* ============================ Projekt öffnen (über die Bridge) ============================ */
function ProjectDialog({ ws, onOpen, onBrowserFolder, onClose }) {
  const [info, setInfo] = useState(null), [path, setPath] = useState(""), [dir, setDir] = useState(null);
  const [err, setErr] = useState(""), [busy, setBusy] = useState(""), [warn, setWarn] = useState(null), [selD, setSelD] = useState(null);
  const browse = async (p) => { try { const d = await ws.projBrowse(p); setDir(d); setSelD(null); if (d.error) setErr(d.error); } catch (e) { setErr(e.message); } };
  useEffect(() => {
    (async () => {
      try { const r = await ws.projRecent(); setInfo(r); setPath(r.current); if (r.switch) browse(r.current); }
      catch (e) { setErr(e.message); setInfo({ switch: false, recent: [] }); }
    })();
  }, []); // eslint-disable-line
  const go = async (p, force) => {
    p = (p || "").trim(); if (!p) return;
    setBusy("Öffne …"); setErr(""); setWarn(null);
    try { await onOpen(p, force); }
    catch (e) { if (e.status === 409) setWarn({ path: p, msg: e.message }); else setErr(e.message); }
    finally { setBusy(""); }
  };
  const native = async () => {
    setBusy("Ordner-Dialog ist geöffnet – er kann hinter diesem Fenster liegen."); setErr("");
    try { const r = await ws.projPick(path || (info && info.current) || ""); setBusy(""); if (r.path) { setPath(r.path); go(r.path); } }
    catch (e) { setBusy(""); setErr(e.message); }
  };
  useEffect(() => { const k = (e) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  return (
    <div className="modal" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="box popen" role="dialog" aria-label="Projekt öffnen">
        <div className="row" style={{ justifyContent: "space-between" }}><div className="kicker">Projekt öffnen</div><button className="btn sm" onClick={onClose} aria-label="Schließen">✕</button></div>
        <div className="hint">Die Bridge wechselt auf den neuen Ordner – gleiche Adresse, gleiches Token, die Oberfläche lädt das Projekt neu.</div>
        <div className="po-now"><span className="lab">Aktuell</span><code>{(info && info.current) || ws.root}</code></div>
        {info && !info.switch && <div className="readout bad">Projektwechsel geht nur am Rechner, auf dem die Bridge läuft (nicht über VPN/Netzwerk). Dort die Bridge mit dem neuen Ordner starten.</div>}
        {info && info.switch && <>
          <div className="row po-path">
            <input className="txt" value={path} onChange={(e) => setPath(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") go(path); }} placeholder="Pfad zum Projektordner, z. B. C:\Projekte\Jarvis" aria-label="Pfad zum Projektordner" autoFocus spellCheck={false} />
            {info.dialog && <button className="btn" onClick={native} disabled={!!busy}>Durchsuchen …</button>}
            <button className="btn primary" onClick={() => go(path)} disabled={!!busy || !path.trim() || path.trim() === info.current}>Öffnen</button>
          </div>
          {busy && <div className="hint am">{busy}</div>}
          {warn && <div className="readout am po-warn">{warn.msg} – sie werden beim Wechsel beendet. <button className="btn sm amber" onClick={() => go(warn.path, true)}>Trotzdem wechseln</button></div>}
          {err && <div className="readout bad">{err}</div>}
          {info.recent && info.recent.length > 0 && (
            <section><h4>Zuletzt geöffnet</h4>
              <div className="po-list">{info.recent.map((r) => (
                <button key={r.path} className="po-it" onClick={() => go(r.path)} title={r.path}><b>{r.name}</b><span>{r.path}</span></button>
              ))}</div>
            </section>
          )}
          {dir && (
            <section><h4>Ordner durchsuchen</h4>
              <div className="po-bar">
                <button className="btn sm" disabled={!dir.parent} onClick={() => browse(dir.parent)} title="Übergeordneter Ordner">↑</button>
                <code className="po-cur" title={dir.path}>{dir.path}</code>
                <button className="btn sm" onClick={() => browse(info.home)} title="Benutzerordner">⌂</button>
                {(dir.roots || []).filter((r) => r !== info.home).slice(0, 8).map((r) => <button key={r} className="btn sm" onClick={() => browse(r)}>{r}</button>)}
              </div>
              <div className="po-dirs" role="listbox" aria-label="Unterordner">
                {dir.dirs.map((d) => (
                  <div key={d.path} role="option" aria-selected={selD === d.path} className={"po-d" + (selD === d.path ? " on" : "")}
                    onClick={() => { setSelD(d.path); setPath(d.path); }} onDoubleClick={() => browse(d.path)} title="Doppelklick: hineinwechseln">
                    <span className="ic">▸</span><span className="nm">{d.name}</span>{d.proj && <span className="tag accent">Projekt</span>}
                    <span className="sp" />
                    <button className="btn sm" onClick={(e) => { e.stopPropagation(); browse(d.path); }} title="Hineinwechseln">→</button>
                    <button className="btn sm" onClick={(e) => { e.stopPropagation(); go(d.path); }}>Öffnen</button>
                  </div>
                ))}
                {!dir.dirs.length && <div className="hint" style={{ padding: 8 }}>keine Unterordner</div>}
                {dir.more > 0 && <div className="hint" style={{ padding: 8 }}>… und {de(dir.more)} weitere</div>}
              </div>
              <div className="row" style={{ marginTop: 6 }}><button className="btn sm" onClick={() => go(dir.path)} disabled={dir.path === info.current}>Diesen Ordner öffnen</button></div>
            </section>
          )}
        </>}
        <div className="hint po-alt">Ohne Bridge (nur ansehen, im Browser): <button className="lnk" onClick={onBrowserFolder}>Ordner im Browser wählen</button></div>
      </div>
    </div>
  );
}

/* ============================ CodeAtlas 4: Graph für Claude, Regeln, Wirkung, Pipeline, Team, Analyse ============================ */
/* Modell → kompakte Form für die Bridge (Werkzeuge atlas_* für Claude) */
function graphSnapshot(M, rules) {
  return {
    v: 1, langs: M.langs, rules,
    classes: M.classes.map((c) => ({ n: c.name, k: c.kind, f: c.file, l: c.line || 0, e: c.endLine || c.line || 0, mo: c.module,
      m: c.methods.map((m) => [m.name, m.file || c.file, m.line || 0, m.endLine || m.line || 0, (m.links || []).filter((l) => l.t === "m").map((l) => [l.id, l.i])]) })),
    edges: M.edges.map((e) => [e.from, e.to, e.type, (e.labels || [])[0] || ""]),
  };
}
/* Muster für Regeln: Modulname, Ordner/Datei-Präfix oder Glob (*, **) – gegen Modul, relativen Pfad und Namen */
function patRe(p) {
  const s = String(p || "").trim().replace(/\\/g, "/");
  if (!s) return null;
  if (/[*?]/.test(s)) return new RegExp("^" + s.replace(/[.+^${}()|[\]]/g, "\\$&").replace(/\*\*/g, "\u0000").replace(/\*/g, "[^/]*").replace(/\?/g, ".").replace(/\u0000/g, ".*") + "$", "i");
  return null;
}
function matchPat(c, p) {
  const s = String(p || "").trim().replace(/\\/g, "/").replace(/\/$/, ""); if (!s) return false;
  const re = patRe(s);
  const cands = [c.module || "", c.rel || "", c.name || "", ...(c.relFiles || [])];
  if (re) return cands.some((x) => re.test(x));
  const sl = s.toLowerCase();
  return cands.some((x) => { const xl = x.toLowerCase(); return xl === sl || xl.startsWith(sl + "/") || xl.replace(/\.[^./]+$/, "") === sl; });
}
/* Zyklen zwischen Modulen (Tarjan) */
function moduleCycles(M) {
  const mods = [...new Set(M.classes.map((c) => c.module))], ix = new Map(mods.map((m, i) => [m, i]));
  const adj = mods.map(() => new Set());
  for (const e of M.edges) { if (e.type === "inherit" || e.type === "implement") { /* zählt mit */ } const a = ix.get(M.classes[e.from].module), b = ix.get(M.classes[e.to].module); if (a !== b) adj[a].add(b); }
  let idx = 0; const st = [], on = new Array(mods.length).fill(false), num = new Array(mods.length).fill(-1), low = new Array(mods.length).fill(0), out = [];
  const strong = (v) => {
    const stack = [[v, adj[v][Symbol.iterator]()]]; num[v] = low[v] = idx++; st.push(v); on[v] = true;
    while (stack.length) {
      const [u, it] = stack[stack.length - 1], n = it.next();
      if (!n.done) { const w = n.value; if (num[w] < 0) { num[w] = low[w] = idx++; st.push(w); on[w] = true; stack.push([w, adj[w][Symbol.iterator]()]); } else if (on[w]) low[u] = Math.min(low[u], num[w]); continue; }
      stack.pop(); if (stack.length) { const p = stack[stack.length - 1][0]; low[p] = Math.min(low[p], low[u]); }
      if (low[u] === num[u]) { const comp = []; let w; do { w = st.pop(); on[w] = false; comp.push(mods[w]); } while (w !== u); if (comp.length > 1) out.push(comp.reverse()); }
    }
  };
  for (let v = 0; v < mods.length; v++) if (num[v] < 0) strong(v);
  return out.slice(0, 40);
}
function evalRules(M, rs) {
  const violations = [];
  if (!M) return { violations, cycles: [] };
  (rs.rules || []).forEach((r, ri) => {
    for (const e of M.edges) {
      const A = M.classes[e.from], Bc = M.classes[e.to];
      if (A === Bc || !matchPat(A, r.from) || !matchPat(Bc, r.to) || matchPat(A, r.to)) continue;
      const m = e.mi != null ? A.methods[e.mi] : null;
      violations.push({ rule: ri, edge: e.id, from: A.id, to: Bc.id, mi: e.mi, path: (m && m.file) || A.file, line: (m && m.line) || A.line || 1,
        text: `${A.name}${m ? "." + m.name : ""} → ${Bc.name}: „${r.from}“ darf nicht auf „${r.to}“ zugreifen${r.text ? " (" + r.text + ")" : ""}` });
      if (violations.length > 400) break;
    }
  });
  return { violations, cycles: moduleCycles(M) };
}
/* Wirkungsbereich: wer hängt (transitiv) an diesen Stellen – Aufrufer auf Funktionsebene, Verwender auf Bausteinebene */
function impactOf(M, targets, depth = 3) {
  const out = [], seen = new Set(), key = (t) => t.id + (t.m ? ":" + t.m.t + t.m.i : "");
  let front = [];
  for (const t of targets) { if (!M.classes[t.id]) continue; seen.add(key(t)); front.push(t); }
  for (let d = 1; d <= depth && front.length; d++) {
    const nxt = [];
    const add = (t) => { const k = key(t); if (seen.has(k)) return; seen.add(k); out.push({ ...t, d }); nxt.push(t); };
    for (const t of front) {
      const c = M.classes[t.id];
      const meths = t.m ? (t.m.t === "m" ? [t.m.i] : []) : c.methods.map((_, i) => i);
      for (const i of meths) for (const cl of (c.methods[i] && c.methods[i].callers) || []) add({ id: cl.id, m: { t: "m", i: cl.i } });
      if (t.m && t.m.t === "f") for (const u of (c.fields[t.m.i] && c.fields[t.m.i].users) || []) add({ id: u.id, m: { t: "m", i: u.i } });
      if (!t.m) for (const eid of M.adj[c.id] || []) { const e = M.edges[eid]; if (e.to === c.id && e.from !== c.id && e.type !== "call") add({ id: e.from, m: null }); }
    }
    front = nxt;
    if (out.length > 600) break;
  }
  return out;
}
const isTestFile = (p) => /(^|\/)(tests?|testing)\/|(^|\/)test_[^/]*$|_test\.[a-z]+$|(^|\/)conftest\.py$/i.test(p || "");
function deadCode(M) {
  const out = [];
  for (const c of M.classes) {
    if (isTestFile(c.file)) continue;
    c.methods.forEach((m, i) => {
      if ((m.callers && m.callers.length) || m.decl || m.macro || m.ctor || m.abstract) return;
      if (/^(main|WinMain|wmain|setup|loop|__\w+__|test\w*|on[A-Z_]\w*|handle\w*|ISR|\w+_IRQHandler|app_main)$/.test(m.name)) return;
      if (c.kind !== "module" && m.vis === "+" && c.inc > 0) return;   // öffentliche Methode einer benutzten Klasse: evtl. von außen
      out.push({ id: c.id, m: { t: "m", i }, name: (c.kind === "module" ? "" : c.name + ".") + m.name, path: m.file || c.file, line: m.line, why: c.kind === "module" ? "Funktion ohne Aufrufer im Projekt" : "Methode ohne Aufrufer" });
    });
    if (c.kind !== "module" && c.kind !== "function" && !c.inc && !c.methods.some((m) => m.name === "main") && c.methods.length) out.push({ id: c.id, m: null, name: c.name, path: c.file, line: c.line, why: "Klasse wird nirgends verwendet" });
  }
  return out.slice(0, 500);
}
/* Kosten eines Auftrags auf die Dateien verteilen, an denen gearbeitet wurde (Lesen 1 Teil, Ändern/Schreiben 3 Teile) */
function costByFile(V) {
  const files = new Map(); let total = 0, turns = 0, tokens = 0;
  for (const T of V.turns) {
    if (T.cost == null) continue;
    total += T.cost; turns++;
    const w = new Map();
    for (const it of T.items) { if (it.type !== "tool" || !it.path || it.dir) continue; const k = TOOL_KIND[it.name], g = k === "edit" || k === "write" ? 3 : 1; w.set(it.path, (w.get(it.path) || 0) + g); }
    const sum = [...w.values()].reduce((a, b) => a + b, 0);
    for (const [p, g] of w) { const e = files.get(p) || { path: p, cost: 0, n: 0 }; e.cost += (T.cost * g) / sum; e.n++; files.set(p, e); }
  }
  return { total, turns, tokens, files: [...files.values()].sort((a, b) => b.cost - a.cost) };
}
/* Architekturkarte für CLAUDE.md */
function claudeMdText(M, rs, ev, ti) {
  if (!M) return "";
  const L = ["## Projektkarte (vom CodeAtlas erzeugt – wird überschrieben)", ""];
  const mods = new Map(); for (const c of M.classes) { if (!mods.has(c.module)) mods.set(c.module, []); mods.get(c.module).push(c); }
  L.push(`${M.classes.length} Bausteine, ${M.classes.reduce((a, c) => a + c.methods.length, 0)} Funktionen, ${M.edges.length} Verbindungen. Sprachen: ${Object.entries(M.langs || {}).map(([k, v]) => k + " " + v).join(", ")}.`, "");
  L.push("### Module");
  for (const [m, cs] of [...mods.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 30)) {
    const top = [...cs].sort((a, b) => b.inc + b.out - (a.inc + a.out)).slice(0, 6).map((c) => c.name);
    L.push(`- **${m}** (${cs.length}): ${top.join(", ")}${cs.length > 6 ? " …" : ""}`);
  }
  const entry = []; for (const c of M.classes) c.methods.forEach((m) => { if (/^(main|WinMain|setup|loop|app_main)$/.test(m.name) && !isTestFile(c.file)) entry.push(`${m.name} (${(m.file || c.file).split("/").slice(1).join("/")}:${m.line})`); });
  if (entry.length) L.push("", "### Einstiegspunkte", ...entry.slice(0, 8).map((x) => "- " + x));
  const central = [...M.classes].filter((c) => !isTestFile(c.file)).sort((a, b) => b.inc + b.out - (a.inc + a.out)).slice(0, 10);
  L.push("", "### Zentrale Bausteine (vorsichtig ändern – viele hängen daran)", ...central.map((c) => `- ${c.name} – ${c.inc} eingehend, ${c.out} ausgehend (${c.rel})`));
  if ((rs.rules || []).length || rs.noCycles) {
    L.push("", "### Architekturregeln (einhalten)");
    for (const r of rs.rules || []) L.push(`- ${r.from} darf nicht auf ${r.to} zugreifen${r.text ? " – " + r.text : ""}`);
    if (rs.noCycles) L.push("- keine Abhängigkeitszyklen zwischen Modulen");
    if (ev && ev.violations.length) L.push(`- Aktuell ${ev.violations.length} Verstöße – siehe atlas_rules`);
  }
  if (ti && (ti.py || ti.c)) L.push("", "### Tests", `- ${[ti.py && "Python (" + ti.py.framework + "): " + ti.py.files.length + " Dateien", ti.c && "C (atlas_test.h): " + ti.c.files.length + " Dateien"].filter(Boolean).join("; ")}`, "- Mit dem Werkzeug tests_run ausführen (nicht über Bash); nach Änderungen tests_run mit betroffene=true.");
  L.push("", "### Arbeitsweise im CodeAtlas", "- Zuerst atlas_orient / atlas_find / atlas_impact statt Dateien zu durchsuchen; atlas_read liefert genau eine Funktion.");
  return L.join("\n");
}

/* ---------------------------- Pipeline ---------------------------- */
const PIPE_STEPS = [["idee", "Idee"], ["spec", "Spezifikation"], ["plan", "Plan"], ["aufgaben", "Aufgaben"], ["umsetzen", "Umsetzen"]];
const TASK_IC = { offen: "○", in_arbeit: "◐", erledigt: "✓", blockiert: "!" };
const PIPE_PROMPT = {
  spec: (idea) => "Erstelle eine Spezifikation für die folgende Idee. Sieh dir dazu mit atlas_orient und atlas_find das bestehende Projekt an. Schreibe als Markdown: Ziel, Nutzer, funktionale Anforderungen, prüfbare Akzeptanzkriterien, Randbedingungen und offene Fragen. Speichere sie mit plan_set_spec. Ändere keine Dateien.\n\nIdee:\n" + idea,
  plan: (hint) => "Die Spezifikation ist freigegeben (plan_get). Erstelle den technischen Plan: Architektur, betroffene Module/Dateien/Funktionen (mit atlas_impact prüfen, Architekturregeln mit atlas_rules beachten), Datenfluss, Risiken, Teststrategie. Speichere ihn mit plan_set_plan. Ändere keine Dateien." + (hint ? "\n\nHinweis des Nutzers: " + hint : ""),
  tasks: (hint) => "Der Plan ist freigegeben (plan_get). Zerlege ihn in kleine, einzeln prüfbare Aufgaben (je eine klar abgegrenzte Änderung, mit Dateien, Symbolen, Abhängigkeiten und einer Prüfung) und speichere sie mit plan_set_tasks. Ändere keine Dateien." + (hint ? "\n\nHinweis des Nutzers: " + hint : ""),
  redo: (which, hint) => `Überarbeite die ${which === "spec" ? "Spezifikation" : "den Plan"} der Pipeline (plan_get) nach diesem Hinweis und speichere sie/ihn erneut mit ${which === "spec" ? "plan_set_spec" : "plan_set_plan"}. Ändere keine Dateien.\n\nHinweis: ${hint}`,
  task: (t) => `Setze Aufgabe ${t.id} der Pipeline um (plan_get liefert Spezifikation, Plan und alle Aufgaben). Setze sie zu Beginn mit plan_task_update auf in_arbeit. Halte dich an Plan und Architekturregeln (atlas_rules), schreibe oder aktualisiere passende Tests und prüfe mit tests_run. Danach plan_task_update auf erledigt (oder blockiert mit Notiz). Nur diese eine Aufgabe.\n\nAufgabe ${t.id}: ${t.title}${t.desc ? "\n" + t.desc : ""}${t.test ? "\nPrüfung: " + t.test : ""}`,
};
function nextTask(P) {
  const done = new Set((P.tasks || []).filter((t) => t.status === "erledigt").map((t) => t.id));
  return (P.tasks || []).find((t) => t.status === "offen" && (t.deps || []).every((d) => done.has(d))) || null;
}
function PipelinePanel({ P, running, hasAgent, chain, setChain, onSave, onPrompt, onShow }) {
  const [idea, setIdea] = useState(P.idea || ""), [hint, setHint] = useState(""), [edit, setEdit] = useState(null);
  useEffect(() => { setIdea(P.idea || ""); }, [P.rev]); // eslint-disable-line
  const ap = P.approved || {}, tasks = P.tasks || [], done = tasks.filter((t) => t.status === "erledigt").length;
  const at = PIPE_STEPS.findIndex(([k]) => k === (P.stage === "fertig" ? "umsetzen" : P.stage));
  const nt = nextTask(P);
  const go = (text, mode) => onPrompt(text, { mode: mode || "default", pipe: true });
  const doc = (which, title) => P[which] ? (
    <section className="pp-doc">
      <div className="pp-h"><b>{title}</b>{ap[which] ? <span className="tag accent">freigegeben</span> : <span className="tag amber">zu prüfen</span>}<span className="sp" />
        <button className="btn sm" onClick={() => setEdit(edit && edit.which === which ? null : { which, text: P[which] })}>{edit && edit.which === which ? "Abbrechen" : "✎ Bearbeiten"}</button></div>
      {edit && edit.which === which
        ? <><textarea className="txt pp-ta" value={edit.text} onChange={(e) => setEdit({ ...edit, text: e.target.value })} /><div className="row"><button className="btn sm primary" onClick={() => { onSave({ [which]: edit.text }); setEdit(null); }}>Speichern</button></div></>
        : <div className="pp-md"><Md text={P[which]} /></div>}
    </section>
  ) : null;
  return (
    <div className="pp">
      <div className="pp-steps">
        {PIPE_STEPS.map(([k, l], i) => <div key={k} className={"pp-st" + (i < at ? " done" : i === at ? " on" : "")}><span className="n">{i < at ? "✓" : i + 1}</span>{l}</div>)}
      </div>
      {!hasAgent && <div className="hint">Die Pipeline braucht Claude Code über die Bridge.</div>}
      <section>
        <div className="pp-h"><b>Idee</b><span className="sp" />{(P.spec || tasks.length) && <button className="btn sm" onClick={() => { if (window.confirm ? window.confirm("Pipeline zurücksetzen? Spezifikation, Plan und Aufgaben gehen verloren.") : true) onSave({ reset: true }); }}>Neu beginnen</button>}</div>
        <textarea className="txt pp-ta sm" value={idea} onChange={(e) => setIdea(e.target.value)} onBlur={() => idea !== (P.idea || "") && onSave({ idea })} placeholder="Was soll entstehen? Ein paar Sätze reichen – Claude macht daraus eine Spezifikation." />
        <div className="row"><button className="btn sm primary" disabled={!idea.trim() || running || !hasAgent} onClick={() => { onSave({ idea, stage: "idee" }); go(PIPE_PROMPT.spec(idea)); }}>{P.spec ? "Spezifikation neu erstellen" : "▶ Spezifikation erstellen"}</button></div>
      </section>
      {doc("spec", "Spezifikation")}
      {P.spec && !ap.spec && (
        <div className="pp-act">
          <button className="btn sm primary" disabled={running} onClick={() => { onSave({ approve: "spec", stage: "plan" }); go(PIPE_PROMPT.plan(hint)); setHint(""); }}>✓ Freigeben & Plan erstellen</button>
          <input className="txt" value={hint} onChange={(e) => setHint(e.target.value)} placeholder="Änderungswunsch zur Spezifikation …" />
          <button className="btn sm" disabled={!hint.trim() || running} onClick={() => { go(PIPE_PROMPT.redo("spec", hint)); setHint(""); }}>Überarbeiten</button>
        </div>
      )}
      {doc("plan", "Plan")}
      {P.plan && !ap.plan && (
        <div className="pp-act">
          <button className="btn sm primary" disabled={running} onClick={() => { onSave({ approve: "plan", stage: "aufgaben" }); go(PIPE_PROMPT.tasks(hint)); setHint(""); }}>✓ Freigeben & Aufgaben erstellen</button>
          <input className="txt" value={hint} onChange={(e) => setHint(e.target.value)} placeholder="Änderungswunsch zum Plan …" />
          <button className="btn sm" disabled={!hint.trim() || running} onClick={() => { go(PIPE_PROMPT.redo("plan", hint)); setHint(""); }}>Überarbeiten</button>
        </div>
      )}
      {tasks.length > 0 && (
        <section className="pp-tasks">
          <div className="pp-h"><b>Aufgaben</b><span className="mut">{done}/{tasks.length} erledigt</span><span className="sp" />
            {!ap.aufgaben && <button className="btn sm" onClick={() => onSave({ approve: "aufgaben", stage: "umsetzen" })}>✓ Freigeben</button>}</div>
          <div className="pp-bar"><span style={{ width: (tasks.length ? (done / tasks.length) * 100 : 0) + "%" }} /></div>
          {tasks.map((t) => (
            <div key={t.id} className={"pp-t s-" + t.status}>
              <div className="pp-tr" onClick={() => onShow(t)} title="Klick: betroffene Stellen im Diagramm zeigen">
                <span className="ic">{TASK_IC[t.status] || "○"}</span><b>{t.id}</b><span className="tt">{t.title}</span><span className="sp" />
                {(t.deps || []).length > 0 && <span className="mut dep">nach {t.deps.join(", ")}</span>}
                {t.status !== "erledigt" && hasAgent && <button className="btn sm" disabled={running} onClick={(e) => { e.stopPropagation(); onSave({ approve: "aufgaben", stage: "umsetzen" }); go(PIPE_PROMPT.task(t), "acceptEdits"); }}>▶</button>}
              </div>
              {(t.desc || t.files.length > 0 || t.note) && <div className="pp-td">{t.desc && <div>{t.desc}</div>}{t.files.length > 0 && <div className="mut">Dateien: {t.files.join(", ")}</div>}{t.test && <div className="mut">Prüfung: {t.test}</div>}{t.note && <div className="am">Notiz: {t.note}</div>}</div>}
            </div>
          ))}
          {hasAgent && done < tasks.length && (
            <div className="pp-act">
              <button className="btn sm primary" disabled={running || !nt} onClick={() => { onSave({ approve: "aufgaben", stage: "umsetzen" }); go(PIPE_PROMPT.task(nt), "acceptEdits"); }}>{nt ? "▶ Nächste: " + nt.id : "keine freie Aufgabe"}</button>
              <label className="chk"><input type="checkbox" checked={chain} onChange={(e) => setChain(e.target.checked)} />alle nacheinander</label>
              <span className="hint">nach jeder Aufgabe automatisch die nächste – stoppt bei Fehlern</span>
            </div>
          )}
          {P.stage === "fertig" && <div className="hint ok">✓ Alle Aufgaben erledigt.</div>}
        </section>
      )}
    </div>
  );
}

/* ---------------------------- Team (parallele Agenten) ---------------------------- */
function TeamPanel({ T, tick, model, onStart, onSend, onStop, onMerge, onDiscard, onDiff, onDecide, onGo }) {
  const [name, setName] = useState(""), [task, setTask] = useState(""), [base, setBase] = useState("stand"), [msg, setMsg] = useState({}), [busy, setBusy] = useState("");
  const git = T.git;
  const run = async (fn, label) => { setBusy(label); try { await fn(); } finally { setBusy(""); } };
  return (
    <div className="tm">
      <div className="hint">Weitere Claude-Code-Agenten arbeiten gleichzeitig, jeder in einem eigenen Git-Worktree (eigener Branch). Ihre Schritte erscheinen im Diagramm in ihrer Farbe; zusammengeführt wird erst, wenn du es willst.</div>
      {git && !git.repo && <div className="readout bad">Kein Git-Repository – im Projektordner einmal <code>git init</code> und einen ersten Commit machen.</div>}
      {git && git.repo && (
        <section className="tm-new">
          <div className="row"><input className="txt" value={name} onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 31))} placeholder="Name, z. B. tests" style={{ flex: 1 }} />
            <select className="txt" value={base} onChange={(e) => setBase(e.target.value)} title="Ausgangsstand des Worktrees"><option value="stand">aktueller Stand</option><option value="head">letzter Commit</option></select></div>
          <textarea className="txt" rows={3} value={task} onChange={(e) => setTask(e.target.value)} placeholder="Auftrag für diesen Agenten …" />
          <div className="row"><button className="btn sm primary" disabled={!name || !task.trim() || !!busy} onClick={() => run(async () => { await onStart(name, task, base); setTask(""); setName(""); }, "start")}>{busy === "start" ? "startet …" : "▶ Agent starten"}</button>
            <span className="hint">Branch atlas/{name || "…"}</span></div>
        </section>
      )}
      {(T.agents || []).map((a) => {
        const V = T.vibes.get(a.id), items = V ? V.turns.flatMap((t) => t.items).filter((x) => x.type === "tool" || x.type === "text").slice(-6) : [];
        const perms = V ? V.perms : [];
        return (
          <section key={a.id} className="tm-a" style={{ "--ac": a.color }}>
            <div className="tm-h"><span className="dot" style={{ background: a.color }} /><b>{a.name}</b><span className="mut">{a.running ? "arbeitet …" : a.turns ? "bereit" : "neu"}</span><span className="sp" />
              {a.cost > 0 && <span className="mut">{fmtCost(a.cost)}</span>}<code className="mut">{a.branch}</code></div>
            {a.conflicts.length > 0 && <div className="readout bad tm-c">⚠ Gleiche Dateien wie {[...new Set(a.conflicts.flatMap((c) => c.with))].join(", ")}: {a.conflicts.map((c) => c.file).join(", ")} – beim Zusammenführen kann es Konflikte geben.</div>}
            {items.map((it, i) => it.type === "tool"
              ? <button key={i} className="tm-i" onClick={() => it.path && onGo(it.path)}>{(TOOL_DE[TOOL_KIND[it.name]] || TOOL_OTHER[it.name] || ["·", it.name])[1]} {it.path ? it.path.split("/").slice(1).join("/") : short(it.cmd || it.desc || "", 50)}</button>
              : <div key={i} className="tm-i say">{short(it.text.trim(), 140)}</div>)}
            {perms.map((p) => (
              <div key={p.id} className="perm sm"><b>Freigabe:</b> {p.cmd || (p.path || "").split("/").slice(1).join("/") || p.name}
                <div className="row"><button className="btn sm primary" onClick={() => onDecide(a.id, p.id, true)}>Erlauben</button><button className="btn sm stop" onClick={() => onDecide(a.id, p.id, false)}>Ablehnen</button></div></div>
            ))}
            {a.changed.length > 0 && <div className="tm-f"><span className="lab">Geändert ({a.changed.length})</span>{a.changed.slice(0, 12).map((f) => <button key={f} className="chip" onClick={() => onGo(model ? model.prefix.split("/")[0] + "/" + f : f)}>{f}</button>)}</div>}
            <div className="row">
              <input className="txt" style={{ flex: 1 }} value={msg[a.id] || ""} onChange={(e) => setMsg({ ...msg, [a.id]: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter" && (msg[a.id] || "").trim()) { onSend(a.id, msg[a.id]); setMsg({ ...msg, [a.id]: "" }); } }} placeholder={a.running ? "Nachricht an den laufenden Agenten …" : "Nächster Auftrag …"} />
              {a.running && <button className="btn sm stop" onClick={() => onStop(a.id)}>■</button>}
            </div>
            <div className="row tm-acts">
              <button className="btn sm" disabled={!a.changed.length} onClick={() => onDiff(a.id)}>Δ Änderungen</button>
              <button className="btn sm primary" disabled={a.running || !a.changed.length || !!busy} onClick={() => run(() => onMerge(a.id), "m" + a.id)}>{busy === "m" + a.id ? "führt zusammen …" : "⇢ Zusammenführen"}</button>
              <button className="btn sm" disabled={!!busy} onClick={() => run(() => onDiscard(a.id), "d" + a.id)}>✕ Verwerfen</button>
            </div>
          </section>
        );
      })}
      {git && git.repo && !(T.agents || []).length && <div className="hint">Noch keine Team-Agenten. Gut geeignet: unabhängige Teile parallel (z. B. „Tests schreiben“ und „Doku“), getrennte Dateien je Agent.</div>}
    </div>
  );
}
function DiffModal({ d, onClose }) {
  return (
    <div className="modal" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="box dm"><div className="row" style={{ justifyContent: "space-between" }}><div className="kicker">Änderungen · {d.id}</div><button className="btn sm" onClick={onClose}>✕</button></div>
        <div className="hint">{d.changed.length} Dateien: {d.changed.join(", ")}{d.cut ? " · gekürzt" : ""}</div>
        <pre className="dm-d">{d.diff.split("\n").map((l, i) => <span key={i} className={l.startsWith("+") && !l.startsWith("+++") ? "a" : l.startsWith("-") && !l.startsWith("---") ? "r" : l.startsWith("@@") ? "h" : l.startsWith("diff ") ? "f" : ""}>{l + "\n"}</span>)}</pre>
      </div>
    </div>
  );
}

/* ---------------------------- Analyse ---------------------------- */
const ANA_TABS = [["cost", "Kosten"], ["hot", "Brennpunkte"], ["dead", "Toter Code"], ["rules", "Regeln & Zyklen"], ["map", "Architekturkarte"]];
function AnalysisTab({ M, V, vtick, ws, sub, setSub, heat, setHeat, rules, saveRules, ev, onPick, onEdit, testInfo, notify }) {
  const [hot, setHot] = useState(null), [days, setDays] = useState(365), [md, setMd] = useState(null), [rf, setRf] = useState({ from: "", to: "", text: "" });
  const cost = useMemo(() => costByFile(V), [vtick]); // eslint-disable-line
  const dead = useMemo(() => (M ? deadCode(M) : []), [M]);
  const mods = useMemo(() => (M ? [...new Set(M.classes.map((c) => c.module))].sort() : []), [M]);
  const gen = useMemo(() => claudeMdText(M, rules, ev, testInfo), [M, rules, ev, testInfo]);
  useEffect(() => { if (sub === "hot" && !hot && ws && ws.gitHotspots) ws.gitHotspots(days).then(setHot).catch((e) => setHot({ error: e.message })); }, [sub, days]); // eslint-disable-line
  useEffect(() => { if (sub === "map" && ws && ws.claudeMd) ws.claudeMd().then(setMd).catch(() => setMd(null)); }, [sub]); // eslint-disable-line
  const byFile = (vals) => { const m = new Map(); if (!M) return m; for (const c of M.classes) for (const f of c.files || [c.file]) if (vals.has(f)) m.set(c.id, Math.max(m.get(c.id) || 0, vals.get(f))); return m; };
  const heatBtn = (key, mk, col, label) => <button className={"btn sm" + (heat && heat.key === key ? " on" : "")} onClick={() => setHeat(heat && heat.key === key ? null : { key, vals: mk(), col, label })}>{heat && heat.key === key ? "Wärmekarte aus" : "im Diagramm als Wärmekarte"}</button>;
  return (
    <div className="ana">
      <div className="ana-t">{ANA_TABS.map(([k, l]) => <button key={k} className={"btn sm" + (sub === k ? " on" : "")} onClick={() => setSub(k)}>{l}{k === "rules" && ev && (ev.violations.length + (rules.noCycles ? ev.cycles.length : 0)) ? <span className="cnt e">{ev.violations.length + (rules.noCycles ? ev.cycles.length : 0)}</span> : null}{k === "dead" && dead.length ? <span className="cnt">{dead.length}</span> : null}</button>)}</div>
      {sub === "cost" && (
        <div className="ana-b">
          <div className="metrics" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
            <div className="metric"><div className="ml">Sitzung</div><div className="mv">{fmtCost(cost.total)}</div></div>
            <div className="metric"><div className="ml">Aufträge</div><div className="mv">{cost.turns}</div></div>
            <div className="metric"><div className="ml">Ø je Auftrag</div><div className="mv">{fmtCost(cost.turns ? cost.total / cost.turns : 0)}</div></div>
          </div>
          <div className="hint">Schätzung von Claude Code (nicht die Abrechnung). Je Datei verteilt nach Lese- (1) und Änderungsschritten (3) im jeweiligen Auftrag – teure Dateien sind oft unübersichtlich oder schlecht auffindbar.</div>
          {cost.files.length > 0 && <div className="row">{heatBtn("cost", () => { const mx = cost.files[0].cost || 1; return byFile(new Map(cost.files.map((f) => [f.path, f.cost / mx]))); }, "amber", "KI-Kosten")}</div>}
          <table className="tbl"><thead><tr><th>Datei</th><th>Kosten</th><th>Aufträge</th></tr></thead><tbody>
            {cost.files.slice(0, 30).map((f) => <tr key={f.path} onClick={() => onEdit(f.path, 1)} className="clk"><td>{f.path.split("/").slice(1).join("/")}</td><td>{fmtCost(f.cost)}</td><td>{f.n}</td></tr>)}
          </tbody></table>
          <div className="cl">Je Auftrag</div>
          <table className="tbl"><tbody>{V.turns.filter((t) => t.cost != null).slice(-20).reverse().map((t) => <tr key={t.n}><td>#{t.n}</td><td className="pr">{short((t.prompt || "").replace(/^\[Kontext[^\]]*\]\s*/, ""), 70)}</td><td>{fmtCost(t.cost)}</td><td>{t.ms != null ? fmtDur(t.ms) : ""}</td></tr>)}</tbody></table>
        </div>
      )}
      {sub === "hot" && (
        <div className="ana-b">
          <div className="row"><span className="hint">Häufig geänderte Dateien (Git-Historie) × Größe: hier entstehen die meisten Fehler.</span><span className="sp" />
            <select className="txt" value={days} onChange={(e) => { setDays(+e.target.value); setHot(null); }}><option value={90}>90 Tage</option><option value={365}>1 Jahr</option><option value={3650}>alles</option></select></div>
          {!hot && <div className="hint">lädt …</div>}
          {hot && hot.error && <div className="readout bad">{/not a git|kein git/i.test(hot.error) ? "Kein Git-Repository – Brennpunkte brauchen die Git-Historie (im Projektordner git init und committen)." : hot.error}</div>}
          {hot && hot.files && (() => {
            const root = M ? M.classes[0] && M.classes[0].file.split("/")[0] : "";
            const size = new Map(); if (M) for (const c of M.classes) for (const f of c.files || [c.file]) size.set(f, Math.max(size.get(f) || 0, c.endLine || 0));
            const rows = hot.files.map((f) => { const p = root + "/" + f.path, ln = size.get(p) || 0; return { ...f, p, ln, score: f.n * Math.log2(2 + ln) }; }).filter((f) => size.has(f.p)).sort((a, b) => b.score - a.score);
            const mx = rows[0] ? rows[0].score : 1;
            return <>
              <div className="row">{heatBtn("hot", () => byFile(new Map(rows.map((r) => [r.p, r.score / mx]))), "red", "Brennpunkte")}<span className="hint">{hot.commits} Commits</span></div>
              <table className="tbl"><thead><tr><th>Datei</th><th>Änderungen</th><th>Autoren</th><th>Zeilen</th></tr></thead><tbody>
                {rows.slice(0, 30).map((r) => <tr key={r.p} className="clk" onClick={() => onEdit(r.p, 1)}><td>{r.path}</td><td>{r.n}</td><td>{r.authors}</td><td>{r.ln || "–"}</td></tr>)}
              </tbody></table>
              {hot.pairs.length > 0 && <><div className="cl">Ändern sich oft gemeinsam (versteckte Kopplung)</div>{hot.pairs.slice(0, 12).map((p, i) => <div key={i} className="mut ana-p">{p.a} ⇄ {p.b} · {p.n}×</div>)}</>}
            </>;
          })()}
        </div>
      )}
      {sub === "dead" && (
        <div className="ana-b">
          <div className="row"><span className="hint">Ohne Aufrufer im statischen Graphen – nur ein Hinweis (Aufrufe über Zeiger, Ereignisse, Reflexion oder von außen sieht der Graph nicht).</span><span className="sp" />
            {dead.length > 0 && heatBtn("dead", () => new Map(dead.map((d) => [d.id, 0.8])), "fg3", "Toter Code")}</div>
          {dead.slice(0, 120).map((d, i) => <button key={i} className="mem" onClick={() => onPick({ id: d.id, m: d.m })}><span className="v mut">∅</span><span className="s">{d.name}</span><span className="ln">{d.why}</span></button>)}
          {!dead.length && <div className="hint ok">Nichts gefunden.</div>}
        </div>
      )}
      {sub === "rules" && (
        <div className="ana-b">
          <div className="hint">Regeln prüft der Atlas bei jedem Neuaufbau; Verstöße stehen unter „Probleme“, Claude kennt sie (atlas_rules) und das Qualitätstor kann sie erzwingen. Muster: Modul/Ordner (z. B. <code>src/gui</code>), Datei oder Glob (<code>**/io*.c</code>).</div>
          <datalist id="ana-mods">{mods.map((m) => <option key={m} value={m} />)}</datalist>
          {(rules.rules || []).map((r, i) => (
            <div key={i} className="ana-r"><code>{r.from}</code><span className="bad"> ↛ </span><code>{r.to}</code>{r.text && <span className="mut"> – {r.text}</span>}<span className="sp" />
              <span className={ev && ev.violations.some((v) => v.rule === i) ? "bad" : "ok"}>{ev ? ev.violations.filter((v) => v.rule === i).length : 0} Verstöße</span>
              <button className="btn sm" onClick={() => saveRules({ ...rules, rules: rules.rules.filter((_, j) => j !== i) })}>✕</button></div>
          ))}
          <div className="row ana-rf">
            <input className="txt" list="ana-mods" value={rf.from} onChange={(e) => setRf({ ...rf, from: e.target.value })} placeholder="von (Modul/Muster)" />
            <span className="bad">darf nicht auf</span>
            <input className="txt" list="ana-mods" value={rf.to} onChange={(e) => setRf({ ...rf, to: e.target.value })} placeholder="nach" />
            <input className="txt" value={rf.text} onChange={(e) => setRf({ ...rf, text: e.target.value })} placeholder="Begründung (optional)" />
            <button className="btn sm primary" disabled={!rf.from.trim() || !rf.to.trim()} onClick={() => { saveRules({ ...rules, rules: [...(rules.rules || []), { ...rf }] }); setRf({ from: "", to: "", text: "" }); }}>+ Regel</button>
          </div>
          <label className="chk"><input type="checkbox" checked={!!rules.noCycles} onChange={(e) => saveRules({ ...rules, noCycles: e.target.checked })} />Keine Abhängigkeitszyklen zwischen Modulen</label>
          {ev && ev.violations.length > 0 && <><div className="cl bad">Verstöße ({ev.violations.length})</div>{ev.violations.slice(0, 80).map((v, i) => <button key={i} className="mem" onClick={() => onPick({ id: v.from, m: v.mi != null ? { t: "m", i: v.mi } : null })}><span className="v bad">✕</span><span className="s">{v.text}</span></button>)}</>}
          {ev && ev.cycles.length > 0 && <><div className={"cl " + (rules.noCycles ? "bad" : "am")}>Zyklen zwischen Modulen ({ev.cycles.length})</div>{ev.cycles.slice(0, 20).map((c, i) => <div key={i} className="ana-p">{c.join(" → ")} → {c[0]}</div>)}</>}
          {ev && !ev.violations.length && !ev.cycles.length && <div className="hint ok">Keine Verstöße, keine Zyklen.</div>}
        </div>
      )}
      {sub === "map" && (
        <div className="ana-b">
          <div className="hint">Kurze Projektkarte für Claude in <code>CLAUDE.md</code> (eigener, markierter Abschnitt – der Rest der Datei bleibt). Claude liest sie bei jeder Sitzung und muss das Projekt nicht erst erkunden.</div>
          <div className="row"><button className="btn sm primary" disabled={!ws || !ws.claudeMdPut} onClick={async () => { try { await ws.claudeMdPut(gen); notify("CLAUDE.md aktualisiert"); setMd(await ws.claudeMd()); } catch (e) { notify(e.message, "bad"); } }}>In CLAUDE.md schreiben</button>
            <span className="hint">{md ? (md.exists ? (md.section ? (md.section.trim() === gen.trim() ? "aktuell" : "veraltet – neu schreiben") : "CLAUDE.md ohne Atlas-Abschnitt") : "CLAUDE.md gibt es noch nicht") : ""}</span></div>
          <pre className="ana-md">{gen}</pre>
        </div>
      )}
    </div>
  );
}

/* ---------------------------- Abspielen eines Auftrags ---------------------------- */
function ReplayBar({ R, onPlay, onStep, onSpeed, onClose }) {
  const n = R.steps.length, s = R.steps[R.i];
  return (
    <div className="rp">
      <span className="rp-k">▶ ABSPIELEN #{R.turn}</span>
      <button className="btn sm" onClick={() => onStep(Math.max(0, R.i - 1))} aria-label="zurück">⏮</button>
      <button className="btn sm primary" onClick={onPlay}>{R.playing ? "⏸" : "▶"}</button>
      <button className="btn sm" onClick={() => onStep(Math.min(n - 1, R.i + 1))} aria-label="vor">⏭</button>
      <input type="range" min={0} max={Math.max(0, n - 1)} value={R.i} onChange={(e) => onStep(+e.target.value)} aria-label="Schritt" />
      <span className="rp-l">{R.i + 1}/{n} · {s ? s.label : ""}</span>
      <select className="txt" value={R.speed} onChange={(e) => onSpeed(+e.target.value)}><option value={1}>1×</option><option value={2}>2×</option><option value={4}>4×</option></select>
      <button className="btn sm" onClick={onClose} aria-label="Abspielen beenden">✕</button>
    </div>
  );
}

/* ---------- CodeAtlas 5: Ansicht (Einfach/Erweitert) und Einstellungen ---------- */
const ACCENTS = [["teal", "Türkis", "#00d4aa"], ["lime", "Limette", "#b9e84c"], ["pink", "Rosa", "#ff7fc6"], ["ice", "Eisblau", "#7cc8ff"]];
const UI0 = { view: "simple", accent: "teal", chatW: "m", minimap: true, ladder: true, motion: true };
const CHAT_W = { s: 360, m: 440, l: 540 };
const SET_TABS = [["view", "Ansicht"], ["ai", "KI"], ["auto", "Automatik"], ["project", "Projekt"], ["keys", "Tastatur"]];
const KEYS_DE = [["I", "Auftrag an die KI schreiben"], ["F", "Diagramm einpassen"], ["0 – 3", "Zoomstufe wählen"], ["+  −", "Hinein- und herauszoomen"], ["Esc", "Auswahl lösen"], ["E", "Auswahl in der IDE öffnen (Umschalt+E: im Editor)"], ["K", "Konsole ein- und ausblenden"], ["B", "Build starten"], ["/", "Suche in der Struktur (Erweitert)"], ["Strg+O", "Projekt öffnen"], ["Strg+,", "Einstellungen"]];
function AtlasMark() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
      <path d="M5.5 6.5 16 5M5.5 6.5 9.5 16.5M16 5 9.5 16.5M16 5l1.5 9" opacity=".55" />
      <circle cx="5.5" cy="6.5" r="2.4" fill="currentColor" stroke="none" /><circle cx="16" cy="5" r="1.9" fill="currentColor" stroke="none" />
      <circle cx="9.5" cy="16.5" r="2.1" fill="currentColor" stroke="none" /><circle cx="17.5" cy="14" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}
function SetRow({ title, hint, off, children }) { return <div className={"set-r" + (off ? " off" : "")}><div className="l"><b>{title}</b>{hint && <span>{hint}</span>}</div>{children}</div>; }
function Sw({ on, set, disabled, label }) { return <label className="swt"><input type="checkbox" checked={!!on} disabled={disabled} aria-label={label} onChange={(e) => set(e.target.checked)} /><i /></label>; }
function SegPick({ value, set, opts, label }) { return <div className="seg" role="group" aria-label={label}>{opts.map(([v, l]) => <button key={v} className={value === v ? "on" : ""} aria-pressed={value === v} onClick={() => set(v)}>{l}</button>)}</div>; }
function SettingsDialog({ tab, setTab, ui, setUi, theme, setTheme, opt, setOpt, V, ws, agentId, setAgentId, onHooks, skillApi, project, wsKind, live, act, onClose }) {
  useEffect(() => { const k = (e) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  const feats = (ws && ws.features) || [], presets = (ws && ws.presets) || [], hooks = (V && V.hooks) || {}, agents = (V && V.agents) || [];
  const hasAgent = feats.includes("agent"), ag = agents.find((a) => a.id === agentId) || agents[0];
  const o = (k) => (v) => setOpt({ ...opt, [k]: v }), u = (k) => (v) => setUi({ ...ui, [k]: v });
  const gate = opt.gate || {}, g = (k) => (v) => setOpt({ ...opt, gate: { ...gate, [k]: v } });
  const go = (fn) => () => { onClose(); fn(); };
  const needBridge = <div className="set-note">Diese Einstellungen wirken, sobald ein Projekt über die Bridge geöffnet ist und Claude Code gefunden wurde.</div>;
  return (
    <div className="modal" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="box set" role="dialog" aria-label="Einstellungen">
        <nav className="set-nav">
          <h2>Einstellungen</h2>
          {SET_TABS.map(([k, l]) => <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>)}
          <span className="sp" />
          <span className="set-ver">CodeAtlas Compile 5.0</span>
        </nav>
        <div className="set-b">
          <button className="set-x" onClick={onClose} aria-label="Einstellungen schließen">✕</button>
          {tab === "view" && <>
            <h3>Ansicht</h3>
            <SetRow title="Oberfläche" hint="Einfach zeigt nur Chat und Diagramm. Erweitert blendet Struktur, Details, Konsole, Ausführen, Plan, Team und Verbindungen ein.">
              <SegPick label="Oberfläche" value={ui.view} set={u("view")} opts={[["simple", "Einfach"], ["adv", "Erweitert"]]} /></SetRow>
            <SetRow title="Farbschema"><SegPick label="Farbschema" value={theme} set={setTheme} opts={[["dark", "Dunkel"], ["light", "Hell"], ["auto", "System"]]} /></SetRow>
            <SetRow title="Akzentfarbe" hint="Gilt für Knöpfe, Markierungen und das Diagramm.">
              <div className="sws" role="group" aria-label="Akzentfarbe">{ACCENTS.map(([k, l, c]) => <button key={k} className={ui.accent === k ? "on" : ""} style={{ "--c": c }} aria-label={l} aria-pressed={ui.accent === k} title={l} onClick={() => u("accent")(k)} />)}</div></SetRow>
            <SetRow title="Breite des Chats" hint="In der einfachen Ansicht."><SegPick label="Breite des Chats" value={ui.chatW} set={u("chatW")} opts={[["s", "Schmal"], ["m", "Mittel"], ["l", "Breit"]]} /></SetRow>
            <SetRow title="Übersichtskarte" hint="Kleine Karte unten rechts im Diagramm."><Sw label="Übersichtskarte" on={ui.minimap} set={u("minimap")} /></SetRow>
            <SetRow title="Zoomstufen-Leiste" hint="Architektur, Beziehungen, Detail, Analyse unten links."><Sw label="Zoomstufen-Leiste" on={ui.ladder} set={u("ladder")} /></SetRow>
            <SetRow title="Animationen" hint="Übergänge und das Lauflicht, während die KI arbeitet."><Sw label="Animationen" on={ui.motion} set={u("motion")} /></SetRow>
          </>}
          {tab === "ai" && <>
            <h3>KI</h3>
            {!hasAgent && needBridge}
            {agents.length > 1 && <SetRow title="Agent"><select className="txt" style={{ width: "auto" }} value={ag ? ag.id : ""} onChange={(e) => setAgentId(e.target.value)}>{agents.map((a) => <option key={a.id} value={a.id} disabled={!a.found}>{a.label}{a.found ? "" : " (nicht gefunden)"}</option>)}</select></SetRow>}
            <SetRow title="Aufwand" hint="Wie gründlich Claude Code nachdenkt. Das Modell wählst du direkt am Eingabefeld.">
              <select className="txt" style={{ width: "auto" }} aria-label="Aufwand" value={opt.effort || ""} onChange={(e) => o("effort")(e.target.value)}>{EFFORT_DE.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></SetRow>
            <SetRow title="Kamera folgt der KI" hint="Pausiert, sobald du selbst schiebst oder zoomst."><Sw label="Kamera folgt der KI" on={opt.follow} set={o("follow")} /></SetRow>
            <SetRow title="Auswahl als Kontext mitgeben" hint="Was im Diagramm markiert ist, geht mit dem Auftrag an die KI."><Sw label="Auswahl als Kontext mitgeben" on={opt.ctx} set={o("ctx")} /></SetRow>
            {hasAgent && <SetRow title="Claude Code im Terminal mitlesen" hint={"Arbeitest du im Terminal oder in VS Code, zeigt der Atlas dieselbe Live-Ansicht. Eingetragen wird in " + ((hooks.file || "").split("/").slice(1).join("/") || ".claude/settings.local.json") + "."}>
              <Sw label="Claude Code im Terminal mitlesen" on={hooks.installed} set={(v) => onHooks(v)} /></SetRow>}
            {skillApi && skillApi.account && <div className="set-acc"><AccountBox api={skillApi} busyRun={!!(V && V.running)} /></div>}
          </>}
          {tab === "auto" && <>
            <h3>Automatik</h3>
            {!hasAgent && needBridge}
            <SetRow title="Build nach jedem Auftrag prüfen" hint={presets.length ? "" : "Kein Compiler gefunden."} off={!presets.length}><Sw label="Build nach jedem Auftrag prüfen" on={opt.autoBuild} disabled={!presets.length} set={o("autoBuild")} /></SetRow>
            <SetRow title="Build-Fehler an die KI zurückgeben" hint="Höchstens 3 Versuche." off={!opt.autoBuild}><Sw label="Build-Fehler an die KI zurückgeben" on={opt.autoFix} disabled={!opt.autoBuild} set={o("autoFix")} /></SetRow>
            <SetRow title="Tests nach jedem Auftrag" hint="Nur die Tests, die geänderten Code ausführen."><Sw label="Tests nach jedem Auftrag" on={opt.autoTest} set={o("autoTest")} /></SetRow>
            {feats.includes("gate") && <>
              <h4>Qualitätstor</h4>
              <div className="set-note">Bevor Claude „fertig“ meldet, prüft der Atlas das Gewählte. Scheitert etwas, bekommt Claude den Bericht und bessert nach (höchstens 3 Runden).</div>
              <SetRow title="Tests"><Sw label="Qualitätstor: Tests" on={gate.tests} set={g("tests")} /></SetRow>
              <SetRow title="Build" off={!presets.length}><Sw label="Qualitätstor: Build" on={gate.build} disabled={!presets.length} set={g("build")} /></SetRow>
              <SetRow title="Architekturregeln"><Sw label="Qualitätstor: Architekturregeln" on={gate.rules} set={g("rules")} /></SetRow>
            </>}
            {(feats.includes("git") || feats.includes("claudemd")) && <h4>Nach dem Auftrag</h4>}
            {feats.includes("git") && <SetRow title="Jeden Auftrag committen" hint="Git-Commit mit Auftrag und Änderungen; einzeln rückgängig zu machen."><Sw label="Jeden Auftrag committen" on={opt.autoCommit} set={o("autoCommit")} /></SetRow>}
            {feats.includes("claudemd") && <SetRow title="Projektkarte in CLAUDE.md aktuell halten" hint="Nach Aufträgen, die etwas geändert haben."><Sw label="Projektkarte in CLAUDE.md aktuell halten" on={opt.autoMap} set={o("autoMap")} /></SetRow>}
          </>}
          {tab === "project" && <>
            <h3>Projekt</h3>
            <SetRow title={project ? project.name : "Kein Projekt geöffnet"} hint={project ? (wsKind === "bridge" ? "Über die Bridge verbunden" : wsKind === "fsa" ? "Ordnerzugriff im Browser" : "Hochgeladen (nur Ansicht)") + (live ? " – " + live : "") : "Öffne einen Ordner oder verbinde die Bridge."}>
              <button className="btn primary" onClick={go(act.open)}>Projekt öffnen</button></SetRow>
            <SetRow title="Verbindungen" hint="Bridge, Ordnerzugriff und Sprung in die IDE einrichten."><button className="btn" onClick={go(act.conn)}>Verbindungen</button></SetRow>
            <SetRow title="Dateien oder ZIP laden" hint="Nur ansehen, ohne Bridge."><button className="btn" onClick={go(act.files)}>Dateien wählen</button></SetRow>
            <SetRow title="Code einfügen" hint="Ein Stück Quelltext als Diagramm ansehen."><button className="btn" onClick={go(act.paste)}>Code einfügen</button></SetRow>
            <h4>Zum Ausprobieren</h4>
            <SetRow title="Demo-Projekt" hint="Kleine Anlagensteuerung."><button className="btn" onClick={go(act.demo)}>Demo laden</button></SetRow>
            <SetRow title="Stresstest" hint="1.500 erzeugte Klassen, um die Geschwindigkeit zu prüfen."><button className="btn" onClick={go(act.stress)}>Stresstest laden</button></SetRow>
          </>}
          {tab === "keys" && <>
            <h3>Tastatur</h3>
            <div className="set-keys">{KEYS_DE.map(([k, l]) => <div key={k}><kbd>{k}</kbd><span>{l}</span></div>)}</div>
          </>}
        </div>
      </div>
    </div>
  );
}

function Drawer({ open, setOpen, tab, setTab, height, setHeight, counts, children }) {
  const drag = useRef(null);
  const down = (e) => { drag.current = { y: e.clientY, h: height }; e.currentTarget.setPointerCapture(e.pointerId); };
  const move = (e) => { if (!drag.current) return; const h = clamp(drag.current.h - (e.clientY - drag.current.y), 140, window.innerHeight * 0.75); setHeight(h); if (!open) setOpen(true); };
  const up = () => { drag.current = null; };
  const T = [["changes", "Δ Änderungen"], ["run", "▶ Ausführen"], ...(counts.hasTests ? [["tests", "✓ Tests"]] : []), ...(counts.hasAna ? [["ana", "◈ Analyse"]] : []), ["editor", "Editor"], ["files", "Dateien"], ["search", "Suche"], ["problems", "Probleme"], ["symbols", "Symbole"], ["export", "Export"]];
  return (
    <div className={"drawer" + (open ? "" : " closed")} style={{ height: open ? height : 35 }}>
      <div className="grip" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />
      <div className="dh">
        {T.map(([k, l]) => (
          <button key={k} className={"dtab" + (open && tab === k ? " on" : "")} onClick={() => { if (open && tab === k) setOpen(false); else { setTab(k); setOpen(true); } }}>
            {k === "run" && counts.running ? <span className="ldot" /> : null}{l}{k === "tests" && counts.testsRunning ? <span className="ldot" /> : null}{k === "ana" && counts.ana ? <span className="cnt e">{counts.ana}</span> : null}{counts[k] ? <span className={"cnt" + ((k === "problems" && counts.err) || k === "run" || (k === "tests" && counts.testsBad) ? " e" : k === "changes" ? " c" : k === "tests" ? " ok" : "")}>{counts[k]}</span> : null}
          </button>
        ))}
        <span className="sp" />
        <button className="dtab" onClick={() => setOpen(!open)} aria-label="Konsole ein/aus" title="Konsole (K)">{open ? "▾" : "▴"}</button>
      </div>
      {open && <div className="dbody">{children}</div>}
    </div>
  );
}

/* ============================ Verbindungen ============================ */
function ConnDialog({ onSwitch, conn, setConn, ws, project, onBridgeLoad, onFsa, onClose, test }) {
  const [url, setUrl] = useState(conn.bridgeUrl), [tok, setTok] = useState(conn.token);
  const [st, setSt] = useState(null), [busy, setBusy] = useState(false);
  const rootName = project && project.rootName;
  const base = (conn.base || {})[rootName || "_"] || "";
  const ping = async () => {
    setBusy(true); setSt(null);
    try { const info = await bfetch(url, tok, "/api/info"); setSt({ ok: true, info }); setConn({ ...conn, bridgeUrl: url, token: tok }); }
    catch (e) { setSt({ ok: false, msg: e.status === 401 ? "Token falsch." : e.message === "Failed to fetch" ? "Bridge nicht erreichbar – läuft sie? (Safari blockiert localhost evtl.; Chrome/Edge nutzen)" : e.message }); }
    finally { setBusy(false); }
  };
  const bridgeEditors = (ws && ws.kind === "bridge" ? ws.editors : st && st.info ? st.info.editors : []) || [];
  const cmd = `python codeatlas_bridge.py "${base || (ws && ws.root) || "C:\\Pfad\\zum\\Projekt"}"`;
  return (
    <div className="modal" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="box conn">
        <div className="row" style={{ justifyContent: "space-between" }}><div className="kicker">Verbindungen</div><button className="btn sm" onClick={onClose}>✕</button></div>
        <section>
          <h4>1 · Lokale Bridge <span className="tag accent">empfohlen</span></h4>
          <p className="hint">Gibt der App Lese- und Schreibzugriff auf deinen Projektordner, öffnet Dateien in deiner IDE an der richtigen Zeile, startet den Compiler und meldet Änderungen live. Nur Python nötig.</p>
          <div className="cmdline"><code>{cmd}</code><button className="btn sm" onClick={() => navigator.clipboard && navigator.clipboard.writeText(cmd)}>Kopieren</button></div>
          <div className="row">
            <input className="txt" style={{ flex: 2, minWidth: 180 }} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="http://127.0.0.1:7878" />
            <input className="txt" style={{ flex: 2, minWidth: 160 }} value={tok} onChange={(e) => setTok(e.target.value)} placeholder="Token aus dem Terminal" type="password" />
            <button className="btn" disabled={busy || !tok} onClick={ping}>{busy ? "…" : "Testen"}</button>
            <button className="btn primary" disabled={busy || !tok} onClick={() => { setConn({ ...conn, bridgeUrl: url, token: tok }); onBridgeLoad(url, tok); }}>Projekt laden</button>
          </div>
          {st && (st.ok
            ? <div className="readout" style={{ marginTop: 8 }}><span className="ok">● verbunden</span> · {st.info.root}<br />Editoren: <b>{st.info.editors.map((e) => e.label).join(", ") || "–"}</b><br />Builds: <b>{st.info.presets.map((p) => p.label).join(", ") || "–"}</b></div>
            : <div className="readout bad" style={{ marginTop: 8 }}>{st.msg}</div>)}
          {ws && ws.kind === "bridge" && <div className="hint ok" style={{ marginTop: 6 }}>Aktiv: {ws.root}{onSwitch && <> · <button className="lnk" onClick={onSwitch}>anderes Projekt öffnen …</button></>}</div>}
        </section>
        <section>
          <h4>2 · Ordnerzugriff im Browser <span className="tag">Chrome / Edge</span></h4>
          {fsaSupported()
            ? <div className="row"><button className="btn" onClick={onFsa}>Ordner mit Schreibzugriff verbinden …</button><span className="hint">Bearbeiten + Speichern + Live-Änderungen ohne Bridge. Kein IDE-Start, kein Compiler.</span></div>
            : <p className="hint">In diesem Browser nicht verfügbar (Safari/iPad, Firefox). Nutze die Bridge.</p>}
        </section>
        <section>
          <h4>3 · Sprung in Editor / IDE</h4>
          <div className="row" style={{ marginBottom: 8 }}>
            <span className="hint" style={{ minWidth: 64 }}>Editor</span>
            <select className="txt" style={{ width: "auto", minWidth: 220 }} value={conn.editor || ""} onChange={(e) => setConn({ ...conn, editor: e.target.value })}>
              <option value="">{ws && ws.kind === "bridge" ? "Standard der Bridge" : "VS Code (Standard)"}</option>
              {EDITOR_LIST.map((e) => {
                const be = bridgeEditors.find((x) => x.id === e.bridge);
                const tag = bridgeEditors.length ? (be ? (be.found === false ? " – nicht gefunden" : " ✓") : " – nicht gefunden") : e.url ? "" : " – nur über Bridge";
                return <option key={e.id} value={e.id}>{e.label}{tag}</option>;
              })}
            </select>
          </div>
          <div className="row" style={{ marginBottom: 8 }}>
            <span className="hint" style={{ minWidth: 64 }}>Weg</span>
            <div className="seg">{[["auto", "Automatisch"], ["bridge", "Bridge (CLI)"], ["url", "URL-Schema"], ["intern", "Nur intern"]].map(([k, l]) => <button key={k} className={conn.mode === k ? "on" : ""} onClick={() => setConn({ ...conn, mode: k })}>{l}</button>)}</div>
          </div>
          <div className="row" style={{ marginBottom: 8 }}>
            <span className="hint" style={{ minWidth: 64 }}>Pfad</span>
            <input className="txt" style={{ flex: 1, minWidth: 220 }} value={base} placeholder={`Absoluter Pfad von „${rootName || "Projekt"}“ (nur für URL-Schema), z. B. E:\\Dev\\${rootName || "Projekt"}`}
              onChange={(e) => setConn({ ...conn, base: { ...(conn.base || {}), [rootName || "_"]: e.target.value } })} />
          </div>
          <p className="hint"><b>Code::Blocks</b> und Notepad++ haben kein URL-Schema – sie öffnen über die Bridge mit <code>--file=datei:zeile</code>. Findet die Bridge Code::Blocks nicht automatisch:
            <br /><code className="acc">python codeatlas_bridge.py "…" --editor codeblocks --editor-path codeblocks="C:\Program Files\CodeBlocks\codeblocks.exe"</code></p>
          <div className="row" style={{ marginTop: 8 }}><button className="btn sm" onClick={test} disabled={!project}>Test-Sprung (erste Datei)</button></div>
        </section>
        <section>
          <h4>4 · Import</h4>
          <label className="chk"><input type="checkbox" checked={!!conn.libs} onChange={(e) => setConn({ ...conn, libs: e.target.checked })} />Bibliotheken mit einlesen (venv, site-packages, third_party, …)</label>
          <p className="hint" style={{ marginTop: 6 }}>Standard: aus – fremder Code bläht große Projekte stark auf (ein venv mit numpy/transformers bringt schnell 30.000+ Klassen). Gilt für Ordner-Upload und Ordnerzugriff; die Bridge nutzt dafür <code>--include-libs</code>.</p>
        </section>
      </div>
    </div>
  );
}
function Toast({ t }) { return t ? <div className={"toast " + (t.kind || "")}>{t.msg}</div> : null; }

/* ============================ Hauptkomponente ============================ */
const CONN0 = { bridgeUrl: "http://127.0.0.1:7878", token: "", mode: "auto", editor: "", bridgeEditor: "", urlEditor: "vscode", base: {}, libs: false };
let projSeq = 0;
function entriesOf(obj) { return Object.entries(obj).map(([path, text]) => ({ path, text, size: text.length, kind: "code", encoding: "utf-8", eol: "\n", mtime: 0 })); }

export default function CodeAtlasLab() {
  const rootRef = useRef(null), cvRef = useRef(null), miniRef = useRef(null), engRef = useRef(null), zoomRef = useRef(null);
  const fileRef = useRef(null), dirRef = useRef(null), modelRef = useRef(null), projRef = useRef(null), selRef = useRef(null), ovRef = useRef(null);
  const liveRef = useRef(null); if (!liveRef.current) liveRef.current = createLive();
  const [liveTick, setLiveTick] = useState(0);
  const [theme, setTheme] = useState(() => lsGet("cal-theme", "dark"));
  const [ui, setUiS] = useState(() => { try { return { ...UI0, ...JSON.parse(lsGet("cal-ui", "{}")) }; } catch { return UI0; } });
  const setUi = useCallback((v) => { setUiS(v); lsSet("cal-ui", JSON.stringify(v)); }, []);
  const [setDlg, setSetDlg] = useState(null);   // offener Reiter des Einstellungsdialogs
  const simple = ui.view !== "adv";
  const [project, setProject] = useState(null);
  const [grouping, setGrouping] = useState(() => lsGet("cal-group", "dir"));
  const [model, setModel] = useState(null);
  const [sel, setSel] = useState(null);
  const [level, setLevel] = useState(1);
  const [types, setTypes] = useState({ inherit: true, implement: true, comp: true, assoc: true, call: true, data: true, imp: true, dep: true });
  const [pat, setPat] = useState("");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(null);
  const [paste, setPaste] = useState(null);
  const [drag, setDrag] = useState(false);
  const [narrow, setNarrow] = useState(false);
  const [lOpen, setLOpen] = useState(false), [rOpen, setROpen] = useState(false);
  const [rFold, setRFold] = useState(() => lsGet("cal-rfold", "0") === "1");
  const setRFoldP = (v) => { setRFold(v); lsSet("cal-rfold", v ? "1" : "0"); setTimeout(() => engRef.current && engRef.current.resize && engRef.current.resize(), 30); };
  const [conn, setConnS] = useState(() => { try { return { ...CONN0, ...JSON.parse(lsGet("cal-conn", "{}")) }; } catch { return CONN0; } });
  const [connOpen, setConnOpen] = useState(false);
  const [projOpen, setProjOpen] = useState(false);
  const [dOpen, setDOpen] = useState(() => lsGet("cal-dopen", "0") === "1");
  const [dTab, setDTab] = useState(() => lsGet("cal-dtab", "editor"));
  const [dH, setDH] = useState(() => +lsGet("cal-dh", "300") || 300);
  const [editReq, setEditReq] = useState(null);
  const [diagRaw, setDiagRaw] = useState(null);
  const [building, setBuilding] = useState(false);
  const [toast, setToast] = useState(null);
  const [live, setLive] = useState("");
  const [budget, setBudget] = useState(() => { const v = +lsGet("cal-budget", "8000"); return Number.isFinite(v) ? v : 8000; });
  const statsRef = useRef(null);
  useEffect(() => { lsSet("cal-budget", String(budget)); engRef.current && engRef.current.setBudget(budget); }, [budget]);
  /* ---------- Vibe: KI-Aktivität, Kontrollpunkte, Änderungsebene ---------- */
  const vibeRef = useRef(null); if (!vibeRef.current) vibeRef.current = createVibe();
  const [vibeTick, setVibeTick] = useState(0);
  const [sideTab, setSideTab] = useState(() => lsGet("cal-side", "ki"));
  const [draft, setDraft] = useState("");
  const [aiMode, setAiMode] = useState(() => lsGet("cal-aimode", "acceptEdits"));
  const [agentId, setAgentId] = useState(() => lsGet("cal-agent", "0"));
  const VOPT0 = { follow: true, ctx: true, autoBuild: false, autoFix: false, autoTest: false, autoCommit: false, autoMap: false, gate: {}, model: "", effort: "" };
  const [vopt, setVoptS] = useState(() => { try { return { ...VOPT0, ...JSON.parse(lsGet("cal-vopt", "{}")) }; } catch { return VOPT0; } });
  const [cps, setCps] = useState({ list: [], session: null });
  const [baseSel, setBaseSel] = useState("turn");      // "turn" = letzter Auftrag · "session" = Start der Bridge · sonst Kontrollpunkt-ID
  const [turnCp, setTurnCp] = useState(null);          // Kontrollpunkt des jüngsten Auftrags
  const [base, setBase] = useState(null);              // Vergleichsbasis: { id, label, time, diff, texts, files, model, touched }
  const [cmpBusy, setCmpBusy] = useState(false);
  const [layerOn, setLayerOn] = useState(true), [onlyChg, setOnlyChg] = useState(false);
  const [chgPick, setChgPick] = useState(null);
  const [undoSnap, setUndoSnap] = useState(null);
  const aiRef = useRef({}); aiRef.current = { mode: aiMode, agent: agentId, opt: vopt };
  const setVopt = useCallback((o) => { setVoptS(o); lsSet("cal-vopt", JSON.stringify(o)); }, []);
  useEffect(() => { lsSet("cal-side", sideTab); lsSet("cal-aimode", aiMode); lsSet("cal-agent", agentId); }, [sideTab, aiMode, agentId]);
  const posMemo = useRef(new Map()), prevFiles = useRef(null), baseTexts = useRef({ id: null, map: new Map() }), baseCache = useRef({ key: "", model: null, files: null });
  const fixTries = useRef(0), vtickRaf = useRef(0), baseSeq = useRef(0);
  const [wsRev, setWsRev] = useState(0);   // zählt hoch, wenn die Bridge andere Build-/Start-Konfigurationen meldet
  const refreshWs = useCallback(async () => {
    const p = projRef.current; if (!p || !p.ws || !p.ws.refresh) return;
    const sig = () => JSON.stringify([p.ws.presets, p.ws.runPresets]), before = sig();
    try { await p.ws.refresh(); if (sig() !== before) setWsRev((n) => n + 1); } catch { /* Bridge gerade nicht erreichbar */ }
  }, []);
  /* Kamera der KI: Hauptansicht folgt ruhig (höchstens alle 2,5 s, nie während du selbst navigierst);
     was die KI gleichzeitig woanders anfasst, zeigt das Bild-im-Bild unten links */
  const [pip, setPip] = useState(null);
  const pipHold = useRef(false), camRef = useRef({ t: -1e9, dk: "" });
  const bumpVibe = useCallback(() => { if (vtickRaf.current) return; vtickRaf.current = requestAnimationFrame(() => { vtickRaf.current = 0; setVibeTick((t) => t + 1); }); }, []);
  /* ---------- Tests im Atlas: Ergebnisse je Lauf, gewählter Test, Testfehler als Probleme ---------- */
  const testRef = useRef(null); if (!testRef.current) testRef.current = createTests();
  const [testTick, setTestTick] = useState(0), [testSel, setTestSel] = useState(null), [testInfo, setTestInfo] = useState(null);
  const testFly = useRef(null);
  const testDiag = useMemo(() => {
    const out = [];
    for (const R of testLatest(testRef.current)) for (const t of R.tests.values()) {
      if (t.status !== "failed" && t.status !== "error") continue;
      const head = `Test ${tName(t)}: ${t.etype || TST_DE[t.status]}${t.msg ? " – " + firstLine(t.msg) : ""}`;
      if (t.where) out.push({ file: t.where.path, line: t.where.line, col: 1, sev: "error", msg: head + "  (Fehlerort)", test: t.id });
      const at = t.checks ? t.checks.map((c) => ({ path: c.path, line: c.line })) : t.at ? [t.at] : [];
      for (const a of at) out.push({ file: a.path, line: a.line, col: 1, sev: t.where ? "warning" : "error", msg: head + "  (Prüfung im Test)", test: t.id });
    }
    return out;
  }, [testTick]); // eslint-disable-line
  /* ---------- CodeAtlas 4: Regeln, Pipeline, Team, Analyse, Wirkung, Abspielen ---------- */
  const [rules, setRules] = useState({ rules: [], noCycles: false });
  const [pipe, setPipe] = useState(null), [chain, setChain] = useState(false);
  const chainRef = useRef(false); chainRef.current = chain;
  const teamRef = useRef(null); if (!teamRef.current) teamRef.current = { agents: [], vibes: new Map(), git: null };
  const [teamTick, setTeamTick] = useState(0), [diffM, setDiffM] = useState(null);
  const [anaSub, setAnaSub] = useState("cost"), [heat, setHeat] = useState(null), [replay, setReplay] = useState(null), [impact, setImpact] = useState(null);
  const rulesRef = useRef(rules); rulesRef.current = rules;
  const ruleEval = useMemo(() => (model ? evalRules(model, rules) : null), [model, rules]);
  const ruleDiag = useMemo(() => {
    if (!ruleEval || !model) return [];
    const out = ruleEval.violations.map((v) => ({ file: v.path, line: v.line, col: 1, sev: "warning", msg: "Architekturregel: " + v.text }));
    if (rules.noCycles) for (const cy of ruleEval.cycles) { const c = model.classes.find((x) => x.module === cy[0]); if (c) out.push({ file: c.file, line: c.line || 1, col: 1, sev: "warning", msg: "Abhängigkeitszyklus: " + cy.join(" → ") + " → " + cy[0] }); }
    return out;
  }, [ruleEval, rules, model]);
  const setConn = useCallback((c) => { setConnS(c); lsSet("cal-conn", JSON.stringify(c)); }, []);
  const notify = useCallback((msg, kind) => { setToast({ msg, kind, t: Date.now() }); }, []);
  useEffect(() => { if (!toast) return; const h = setTimeout(() => setToast(null), toast.kind === "bad" ? 6000 : 3200); return () => clearTimeout(h); }, [toast]);
  useEffect(() => { lsSet("cal-dopen", dOpen ? "1" : "0"); lsSet("cal-dtab", dTab); lsSet("cal-dh", String(Math.round(dH))); }, [dOpen, dTab, dH]);
  projRef.current = project; selRef.current = sel;

  // Engine
  useEffect(() => {
    const eng = createEngine(cvRef.current, miniRef.current, {
      onSelect: (s) => setSel(s),
      onLevel: (l) => setLevel(l),
      onZoom: (k) => { if (zoomRef.current) zoomRef.current.textContent = de(k * 100, k < 0.1 ? 1 : 0) + " %"; },
      onStats: (t) => { if (statsRef.current && statsRef.current.textContent !== t) statsRef.current.textContent = t; },
    }, ovRef.current);
    eng.setLive(liveRef.current);
    engRef.current = eng;
    window.__cal = { eng, model: () => modelRef.current };   // Prüfhilfe für automatische Tests (liest nur)
    { const v = +lsGet("cal-budget", "8000"); eng.setBudget(Number.isFinite(v) ? v : 8000); }
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => eng.redraw());
    const mq = matchMedia("(max-width:900px)"); const upd = () => setNarrow(mq.matches); upd(); mq.addEventListener("change", upd);
    return () => { eng.destroy(); mq.removeEventListener("change", upd); };
  }, []);
  useEffect(() => { const r = rootRef.current; if (theme === "auto") r.removeAttribute("data-theme"); else r.setAttribute("data-theme", theme); lsSet("cal-theme", theme); engRef.current && engRef.current.theme(); }, [theme]);
  useEffect(() => { const t = setTimeout(() => { const e = engRef.current; if (e) { e.theme(); e.resize && e.resize(); } }, 40); return () => clearTimeout(t); }, [ui.view, ui.accent, ui.chatW]);
  useEffect(() => { if (simple && sideTab !== "ki") setSideTab("ki"); }, [simple, sideTab]);
  useEffect(() => { if (simple) setDOpen(false); }, [simple]);   // einfache Ansicht beginnt ohne Konsole; sie klappt nur bei Bedarf auf
  useEffect(() => {
    const k = (e) => { if ((e.ctrlKey || e.metaKey) && e.key === ",") { e.preventDefault(); setSetDlg((d) => (d ? null : "view")); } };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, []);
  useEffect(() => { lsSet("cal-group", grouping); }, [grouping]);
  useEffect(() => { engRef.current && engRef.current.setTypes(types); }, [types]);
  useEffect(() => { engRef.current && engRef.current.setPattern(pat); }, [pat]);

  // Modell bauen – bei Live-Änderungen Layout, Ansicht und Auswahl erhalten
  const lastBuild = useRef({ id: null, grouping: null });
  useEffect(() => {
    if (!project) return;
    const m = buildModel(project.parsed, grouping);
    const prev = modelRef.current, same = lastBuild.current.id === project.id && lastBuild.current.grouping === grouping && prev;
    let restore = null, noted = null;
    const V = vibeRef.current;
    if (same) {
      for (const c of prev.classes) posMemo.current.set(c.dk, { x: c.x, y: c.y });   // letzter Platz – dort bleiben entfernte Knoten als Umriss stehen
      carryLayout(prev, m); restore = selFromKey(m, selKey(prev, selRef.current));
      const pf = prevFiles.current;
      if (pf && pf !== project.files && project.ws && project.ws.watch) {   // was hat diese eine Änderung am Diagramm bewirkt?
        const ch = new Set(); for (const [p, e] of project.files) if (pf.get(p) !== e) ch.add(p); for (const p of pf.keys()) if (!project.files.has(p)) ch.add(p);
        if (ch.size && ch.size < 400) { const inc = diffModels(prev, m, pf, project.files, ch); if (!inc.empty) { noted = vibeNoteChange(V, inc, performance.now()); bumpVibe(); } }
      }
    } else posMemo.current = new Map();
    prevFiles.current = project.files;
    lastBuild.current = { id: project.id, grouping };
    modelRef.current = m;
    liveRetarget(liveRef.current, m);
    vibeRetarget(V, m, project.files, project.rootName);
    setModel(m);
    engRef.current.setModel(m, !!same && prev.classes.length > 0);   // war das Diagramm bisher leer, neu einpassen statt die alte Ansicht zu halten
    if (same) { setSel(restore); if (restore) engRef.current.select(restore, false); }
    else { setSel(null); setPat(""); setDiagRaw(null); }
    engRef.current.agentKick();
    // „KI folgen“: neu entstandene Bausteine ins Bild holen, solange ein Auftrag läuft und du nicht selbst navigierst
    // neu entstandene Bausteine zeigen (Hauptansicht oder Bild im Bild) – geänderte zeigt schon der Schritt, der sie geändert hat
    if (noted && noted.targets.length && V.turns.some((t) => t.open)) {
      const fresh = noted.targets.filter((x) => !x.m && m.classes[x.id] && noted.newDk && noted.newDk.has(m.classes[x.id].dk));
      if (fresh.length) aimAt({ ...noted, targets: fresh, kind: "write" }, null);
    }
  }, [project, grouping]); // eslint-disable-line

  // Diagnosen auf das aktuelle Modell abbilden
  const diag = useMemo(() => {
    const items = [...(diagRaw ? diagRaw.items : []), ...testDiag, ...ruleDiag];
    if (!items.length || !model || !project) return null;
    const r = mapDiags(items, model, [...project.files.keys()], project.rootName);
    const extra = [testDiag.length && "Tests", ruleDiag.length && "Regeln"].filter(Boolean).join(" + ");
    return { ...(diagRaw || { src: extra, log: "" }), items: r.items, map: r.map, src: diagRaw ? diagRaw.src + (extra ? " + " + extra : "") : extra };
  }, [diagRaw, model, project, testDiag, ruleDiag]);
  useEffect(() => { engRef.current && engRef.current.setDiag(diag ? diag.map : null); }, [diag]);

  /* ---------- Laden ---------- */
  const load = useCallback(async (entries, name, opts = {}) => {
    const code = entries.filter((e) => e.kind === "code" && e.text != null);
    const live = !!(opts.ws && opts.ws.kind === "bridge" && opts.ws.watch);   // beobachteter Ordner: darf leer beginnen – die KI legt die Dateien an
    if (!code.length && !live) {
      const sk = Object.entries(opts.skipped || {}).map(([e, n]) => `.${e} ×${n}`).join(", ");
      notify(`Keine Quelltextdateien gefunden${sk ? ` (übersprungen: ${sk})` : ""}.`, "bad"); setBusy(null); return;
    }
    setBusy({ label: `Analysiere ${de(code.length)} Dateien …`, done: 0, total: code.length });
    const parsed = await parseProject(code, (d) => setBusy((b) => b && { ...b, done: d }));
    setBusy(null);
    if (!parsed.classes.length && !parsed.modules.length && !live) { notify("Keine Klassen, Funktionen oder Variablen gefunden.", "bad"); return; }
    const rootName = opts.rootName || (entries.every((e) => e.path.includes("/")) && new Set(entries.map((e) => e.path.split("/")[0])).size === 1 ? entries[0].path.split("/")[0] : null);
    setProject({ id: ++projSeq, name, rootName, ws: opts.ws || memoryWS(), files: new Map(entries.map((e) => [e.path, e])), parsed, rev: 0 });
  }, [notify]);
  const libNote = useCallback(() => {
    const roots = [...LIBS.hits.keys()].sort((a, b) => a.length - b.length).filter((r, i, arr) => !arr.slice(0, i).some((x) => r.startsWith(x + "/")));
    if (roots.length) notify(`Bibliotheken ausgeblendet: ${roots.slice(0, 3).map((r) => r.split("/").pop()).join(", ")}${roots.length > 3 ? ` +${roots.length - 3}` : ""} – einblenden unter ⚙ Verbindungen → Import`);
  }, [notify]);
  const prepLibs = () => { LIBS.ignore = !conn.libs; LIBS.hits.clear(); LIBS.envRoots = []; };
  const loadList = useCallback(async (list, name) => {
    try {
      setBusy({ label: "Lese Dateien …", done: 0, total: 0 });
      const { entries, skipped } = await collect(list);
      await load(entries, name, { skipped }); libNote();
    } catch (e) { notify(e.message, "bad"); setBusy(null); }
  }, [load, notify, libNote]);

  const loadBridge = useCallback(async (url, token) => {
    try {
      setConnOpen(false);
      setBusy({ label: "Verbinde mit Bridge …", done: 0, total: 0 });
      const info = await bfetch(url, token, "/api/info");
      const ws = bridgeWS(url, token, info);
      const entries = await bridgeLoad(ws, (d, t) => setBusy({ label: "Lade Dateien über Bridge …", done: d, total: t }));
      await load(entries, info.rootName, { ws, rootName: info.rootName });
      notify(`Bridge verbunden: ${info.root}`);
    } catch (e) { setBusy(null); notify("Bridge: " + (e.message === "Failed to fetch" ? "nicht erreichbar" : e.message), "bad"); }
  }, [load, notify]);
  // Projekt wechseln: Bridge baut alles für den neuen Ordner neu auf (gleicher Port/Token), dann laden wir neu
  const canSwitch = !!(project && project.ws && project.ws.kind === "bridge" && (project.ws.features || []).includes("switch"));
  const openProject = useCallback(async (path, force) => {
    const ws = projRef.current && projRef.current.ws; if (!ws || !ws.projOpen) return;
    const r = await ws.projOpen(path, force);   // Fehler (409: es läuft noch etwas) zeigt der Dialog
    if (r.same) { notify("Dieses Projekt ist bereits geöffnet"); setProjOpen(false); return; }
    setProjOpen(false);
    setBusy({ label: "Wechsle Projekt: " + r.path + " …", done: 0, total: 0 });
    const t0 = Date.now();
    while (Date.now() - t0 < 30000) {
      await new Promise((res) => setTimeout(res, 350));
      try { const info = await bfetch(ws.url, ws.token, "/api/info"); if (info.root === r.path) { await loadBridge(ws.url, ws.token); return; } } catch { /* Bridge startet gerade neu */ }
    }
    setBusy(null); notify("Projektwechsel: Bridge antwortet nicht – Terminal der Bridge prüfen", "bad");
  }, [loadBridge, notify]);
  useEffect(() => {   // Strg+O: Projekt öffnen
    const k = (e) => { if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && (e.key === "o" || e.key === "O")) { e.preventDefault(); if (canSwitch) setProjOpen(true); else dirRef.current && dirRef.current.click(); } };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [canSwitch]);
  // Von der Bridge ausgeliefert (z. B. auf dem iPad über VPN): automatisch verbinden, Token aus #token=…
  useEffect(() => {
    const auto = typeof window !== "undefined" && (window.__ATLAS_BRIDGE__ || /token=/.test(window.location.hash));
    if (auto && /^https?:$/.test(window.location.protocol)) {
      const m = /token=([^&]+)/.exec(window.location.hash);
      const tok = (m && decodeURIComponent(m[1])) || conn.token;
      if (tok) {
        setConn({ ...conn, bridgeUrl: window.location.origin, token: tok });
        try { window.history.replaceState(null, "", window.location.pathname + window.location.search); } catch { /* egal */ }
        loadBridge(window.location.origin, tok);
        return;
      }
    }
    load(entriesOf(DEMO), "Demo: Anlagensteuerung");
  }, []); // eslint-disable-line
  const loadFsa = useCallback(async () => {
    try {
      setConnOpen(false);
      prepLibs();
      const r = await fsaOpen((n) => setBusy({ label: `Lese Ordner … ${de(n)}`, done: 0, total: 0 }));
      setBusy({ label: "Lese Dateien …", done: 0, total: 0 });
      const { entries, skipped } = await collect(r.list);
      await load(entries, r.name, { ws: r.ws, rootName: r.name, skipped }); libNote();
    } catch (e) { setBusy(null); if (e.name !== "AbortError") notify("Ordnerzugriff: " + e.message, "bad"); }
  }, [load, notify, conn, libNote]); // eslint-disable-line

  /* ---------- Neu analysieren (nach Speichern / externer Änderung) ---------- */
  const reparse = useCallback(async (files) => {
    const p = projRef.current; if (!p) return;
    const code = [...files.values()].filter((e) => e.kind === "code" && e.text != null);
    const parsed = await parseProject(code);
    setProject({ ...projRef.current, files, parsed, rev: p.rev + 1 });
  }, []);
  const saveFile = useCallback(async (path, text, o = {}) => {
    const p = projRef.current; const e = p.files.get(path);
    let r;
    try { r = await p.ws.write(path, text, { encoding: e.encoding, eol: e.eol, mtime: o.mtime != null ? o.mtime : e.mtime, force: o.force }); }
    catch (er) { if (er.status === 409) return { conflict: true }; throw er; }
    const files = new Map(p.files); files.set(path, { ...e, text, mtime: r.mtime, dirty: !p.ws.persistent });
    notify(p.ws.persistent ? `Gespeichert: ${baseName(path)}` : `Im Speicher geändert: ${baseName(path)} – Export → ZIP zum Herunterladen`);
    if (e.kind === "code") await reparse(files); else setProject({ ...p, files });
    return { mtime: r.mtime };
  }, [notify, reparse]);

  // Live-Änderungen von Bridge / Ordnerzugriff
  useEffect(() => {
    const ws = project && project.ws;
    if (!ws || !ws.watch) { setLive(""); return; }
    setLive("live");
    let timer = null; const pend = { changed: new Set(), removed: new Set() };
    const flush = async () => {
      const p = projRef.current; if (!p || p.ws !== ws) return;
      const files = new Map(p.files); let codeTouched = false, n = 0;
      for (const path of pend.removed) { if (files.get(path)?.kind === "code") codeTouched = true; files.delete(path); n++; }
      for (const path of pend.changed) {
        const kind = kindOfPath(path); if (kind === "bin" || ignored(path)) continue;
        try {
          const d = await ws.read(path); const old = files.get(path);
          if (old && old.text === d.text) { files.set(path, { ...old, mtime: d.mtime }); continue; }
          files.set(path, { path, size: d.text.length, kind, text: d.text, encoding: d.encoding, eol: d.eol, mtime: d.mtime }); n++;
          if (kind === "code") codeTouched = true;
        } catch { /* Datei evtl. gerade gesperrt */ }
      }
      const shape = pend.removed.size > 0 || [...pend.changed].some((x) => !p.files.has(x) || /(^|\/)(Makefile|CMakeLists\.txt|package\.json|Cargo\.toml|go\.mod|tsconfig\.json)$|\.(cbp|csproj|sln)$/.test(x));
      pend.changed.clear(); pend.removed.clear();
      if (shape) refreshWs();   // neue/gelöschte Dateien oder geänderte Projektdatei: Build- und Start-Konfigurationen können sich geändert haben
      if (!n) return;
      if (!vibeRef.current.turns.some((t) => t.open)) notify(`Live: ${n} Datei${n > 1 ? "en" : ""} geändert – Diagramm aktualisiert`);   // während ein Auftrag läuft, steht es im KI-Verlauf
      if (codeTouched) await reparse(files); else setProject({ ...projRef.current, files });
    };
    const un = ws.watch((ev) => {
      if (ev.offline !== undefined) { setLive(ev.offline ? "getrennt" : "live"); return; }
      for (const x of ev.changed || []) pend.changed.add(x);
      for (const x of ev.added || []) pend.changed.add(x);
      for (const x of ev.removed || []) pend.removed.add(x);
      clearTimeout(timer); timer = setTimeout(flush, 350);
    });
    return () => { clearTimeout(timer); un && un(); };
  }, [project && project.ws]); // eslint-disable-line

  /* ---------- Ausführen mit Live-Trace ---------- */
  useEffect(() => {
    const ws = project && project.ws;
    if (!ws || !ws.runEvents) return;
    const L = liveRef.current;
    const un = ws.runEvents((msg) => {
      const p = projRef.current;
      const pf = L.pauseFocus;
      liveApply(L, msg, modelRef.current, performance.now());
      if (testApply(testRef.current, msg)) onTestMsg(msg);
      const R = L.runs.get(msg.run || 0);
      if (msg.k === "o" && modelRef.current && p && R && !R.trace) for (const [s2, t] of msg.lines) if (s2 === "err") liveStackScan(L, modelRef.current, p.files, p.rootName, t, msg.run || 0);
      if (L.pauseFocus && L.pauseFocus !== pf) { const c = L.codes.get(L.pauseFocus.key); if (c && c.target && engRef.current) engRef.current.select(c.target, c.target.m ? 3 : 2); notify(`● Haltepunkt: ${c ? c.name : "?"}`, ""); setLiveTick((t) => t + 1); }
      if (msg.k === "build" && !msg.ok) { setDiagRaw({ items: parseDiagnostics(msg.output), log: msg.output, src: "Build für Ausführung" }); notify("Übersetzen fehlgeschlagen – siehe Probleme", "bad"); }
      if (msg.k === "end") {
        const e = msg; const bad = (e.code !== 0 && e.code != null) || e.reason;
        const nm = R ? R.label + " " : "Programm ";
        if (!(R && R.kind && testRef.current.runs.has(msg.run || 0))) notify(bad ? `${nm}beendet: ${e.reason || "Exit " + e.code}` : `${nm}beendet (${de(e.ms / 1000, 1)} s)`, bad && e.reason !== "abgebrochen" ? "bad" : "");
        if (![...L.runs.values()].some((r) => r.status === "running" || r.status === "building")) { L.dbg.reason = ""; }
      }
      engRef.current && engRef.current.liveKick();
      if (msg.k !== "w" && msg.k !== "o") setLiveTick((t) => t + 1);
    });
    return () => un && un();
  }, [project && project.ws]); // eslint-disable-line
  useEffect(() => {
    const h = setInterval(() => { const L = liveRef.current; if (L.status === "running" || L.status === "building" || L._shownRev !== L.rev) { L._shownRev = L.rev; setLiveTick((t) => t + 1); } }, 300);
    return () => clearInterval(h);
  }, []);
  // mehrere Programme nacheinander (kurzer Abstand, damit ein Server zuerst lauscht)
  const runStart = useCallback(async (list) => {
    const p = projRef.current; if (!p || !p.ws.run) return;
    setDTab("run"); setDOpen(true);
    for (let i = 0; i < list.length; i++) {
      const x = list[i];
      const slow = setTimeout(() => notify("Start dauert … die Bridge antwortet nicht. Sind mehrere CodeAtlas-Fenster offen? Eins schließen und neu laden.", "bad"), 8000);
      try { await p.ws.run(x.preset, x.args, x.trace); } catch (e) { notify("Start: " + e.message, "bad"); break; } finally { clearTimeout(slow); }
      if (i < list.length - 1) await new Promise((r) => setTimeout(r, 450));
    }
  }, [notify]);
  const runStop = useCallback(async (run) => { const p = projRef.current; try { await p.ws.runStop(run); } catch (e) { notify(e.message, "bad"); } }, [notify]);
  const runStdin = useCallback(async (run, t) => { const p = projRef.current; try { await p.ws.runStdin(run, t); liveRef.current.out.push({ run, s: "in", t: "› " + t }); setLiveTick((x) => x + 1); } catch (e) { notify(e.message, "bad"); } }, [notify]);
  /* ---------- Debugger: Pause / Schritt / Zeitlupe / Haltepunkte ---------- */
  const sendCtl = useCallback(async (step) => {
    const p = projRef.current, L = liveRef.current; if (!p || !p.ws.runCtl) return;
    try { await p.ws.runCtl({ mode: L.dbg.mode, slow: L.dbg.slow, step: step || 0, bp: L.bps }); } catch (e) { notify("Debugger: " + e.message, "bad"); }
  }, [notify]);
  const runCtl = useCallback((patch) => {
    const L = liveRef.current; L._ctlT = performance.now();
    if (patch.mode) L.dbg.mode = patch.mode;
    if (patch.slow != null) L.dbg.slow = patch.slow;
    if (patch.mode === "run" || patch.step) { L.dbg.reason = patch.step ? "Schritt" : ""; for (const th of L.threads.values()) th.paused = null; L.pauseFocus = null; }
    lsSet("cal-slow", String(L.dbg.slow));
    sendCtl(patch.step); engRef.current && engRef.current.liveKick(); setLiveTick((t) => t + 1);
  }, [sendCtl]);
  const bpSave = (L) => { const p = projRef.current; lsSet("cal-bps:" + (p ? p.rootName : "_"), JSON.stringify(L.bps)); };
  const bpToggle = useCallback((b) => {
    const L = liveRef.current, M = modelRef.current;
    const i = L.bps.findIndex((x) => x.path === b.path && x.line === b.line);
    if (i >= 0) L.bps.splice(i, 1); else L.bps.push(b);
    liveBpTargets(L, M); bpSave(L); sendCtl(); engRef.current && engRef.current.liveKick(); setLiveTick((t) => t + 1);
  }, [sendCtl]);
  const bpClear = useCallback(() => { const L = liveRef.current; L.bps = []; liveBpTargets(L, modelRef.current); bpSave(L); sendCtl(); engRef.current && engRef.current.liveKick(); setLiveTick((t) => t + 1); }, [sendCtl]);
  // Haltepunkte des Projekts laden und an die Bridge geben
  useEffect(() => {
    const p = project; if (!p) return;
    const L = liveRef.current;
    try { L.bps = JSON.parse(lsGet("cal-bps:" + p.rootName, "[]")) || []; } catch { L.bps = []; }
    L.dbg.slow = +lsGet("cal-slow", "0") || 0; L.dbg.mode = "run";
    liveBpTargets(L, modelRef.current);
    if (p.ws && p.ws.runCtl && (L.bps.length || L.dbg.slow)) sendCtl();
  }, [project && project.ws, project && project.rootName]); // eslint-disable-line
  const runReset = useCallback(() => { liveReset(liveRef.current); engRef.current && engRef.current.liveKick(); setLiveTick((t) => t + 1); }, []);
  const runGo = useCallback((c, line) => {
    if (!c) return;
    if (c.target) engRef.current.select(c.target, c.target.m ? 3 : 2);
    if (c.path) setEditReq({ path: c.path, line: line || c.errLine || c.line || 1, n: Date.now() });
  }, []);

  /* ---------- Editor-Sprung ---------- */
  const edDef = () => {
    const ws = projRef.current && projRef.current.ws;
    const id = conn.editor || conn.bridgeEditor || (ws && ws.kind === "bridge" ? ws.defaultEditor : "") || conn.urlEditor || "vscode";
    return EDITOR_LIST.find((e) => e.id === id) || EDITOR_LIST[0];
  };
  const extMode = () => {
    const p = projRef.current, ws = p && p.ws, E = edDef();
    if (conn.mode === "intern") return "intern";
    if ((conn.mode === "auto" || conn.mode === "bridge") && ws && ws.kind === "bridge") return "bridge";
    if ((conn.mode === "auto" || conn.mode === "url") && E.url && (ws && ws.root || (conn.base || {})[p && p.rootName || "_"])) return "url";
    return "intern";
  };
  const extLabel = (() => { const m = extMode(); return m === "intern" ? "Extern" : edDef().label; })();
  const editAt = useCallback((path, line) => { setEditReq({ path, line: line || 1, n: Date.now() }); setDTab("editor"); setDOpen(true); setROpen(false); setLOpen(false); }, []);
  const openExt = useCallback(async (path, line = 1, col = 1) => {
    const p = projRef.current; if (!p) return;
    const mode = extMode(), E = edDef();
    try {
      if (mode === "bridge") { const r = await p.ws.open(path, line, col, E.bridge); notify(`↗ ${r.editor}: ${baseName(path)}:${line}`); return; }
      if (mode === "url") {
        const abs = absPathOf(p.ws.root || conn.base[p.rootName || "_"], path, p.rootName);
        launchUrl(URL_EDITORS[E.url].url(abs, line, col)); notify(`↗ ${E.label}: ${baseName(path)}:${line}`); return;
      }
      editAt(path, line);
      notify(!E.url && conn.mode !== "intern" ? `${E.label} lässt sich nur über die Bridge öffnen – intern geöffnet` : "Im internen Editor geöffnet – externe IDE unter ⚙ Verbindungen einrichten");
    } catch (e) { notify("Editor: " + e.message, "bad"); editAt(path, line); }
  }, [conn, notify, editAt]); // eslint-disable-line
  const memberLoc = useCallback((s) => {
    const M = modelRef.current; if (!M || !s) return null;
    const c = M.classes[s.id]; const x = s.m ? (s.m.t === "f" ? c.fields : c.methods)[s.m.i] : null;
    const path = (x && x.file) || c.file;
    return { path, line: x ? x.line : c.kind === "module" ? 1 : c.line, end: x ? (x.endLine || x.line) : c.kind === "module" ? 1 : c.endLine };
  }, []);
  const hlRange = useMemo(() => { const l = sel && memberLoc(sel); return l ? { path: l.path, from: l.line, to: l.end } : null; }, [sel, model, memberLoc]);
  const locateAt = useCallback((path, line) => {
    const M = modelRef.current; if (!M) return;
    const t = locate(M, path, line);
    if (t) engRef.current.select(t, t.m ? 3 : 2); else notify("An dieser Stelle liegt kein erkanntes Symbol.");
  }, [notify]);

  /* ---------- Build / Diagnosen ---------- */
  const runBuild = useCallback(async (presetId, quiet) => {
    const p = projRef.current; if (!p || !p.ws.build) return null;
    setBuilding(true); if (!quiet) { setDTab("problems"); setDOpen(true); }
    try {
      const r = await p.ws.build(presetId);
      const items = parseDiagnostics(r.output), src = (p.ws.presets.find((x) => x.id === presetId) || {}).label || "Build";
      setDiagRaw({ items, log: r.output, cmd: r.cmd, code: r.code, ms: r.ms, src });
      const ne = items.filter((d) => d.sev === "error").length;
      notify(ne ? `Build: ${ne} Fehler` : r.code === 0 ? "Build erfolgreich ✓" : `Build beendet (Exit ${r.code})`, ne ? "bad" : "");
      if (quiet && (ne || r.code)) { setDTab("problems"); setDOpen(true); }
      return { items, ne, src, code: r.code };
    } catch (e) { notify("Build: " + e.message, "bad"); return null; }
    finally { setBuilding(false); }
  }, [notify]);
  const goDiag = useCallback((d) => {
    if (d.target) engRef.current.select(d.target, d.target.m ? 3 : 2);
    if (d.path) setEditReq({ path: d.path, line: d.line, n: Date.now() });
  }, []);

  /* ---------- Vibe: Vergleichsbasis (Kontrollpunkt) → Modell des alten Stands → Änderungsebene ---------- */
  const refreshCps = useCallback(async (ws) => {
    try { const r = await ws.cpList(); setCps({ list: r.checkpoints || [], session: r.session || null }); } catch { /* Bridge ohne Kontrollpunkte */ }
  }, []);
  const hasCp = !!(project && project.ws && project.ws.kind === "bridge" && project.ws.features.includes("checkpoints"));
  const baseId = !hasCp ? null : baseSel === "turn" ? turnCp || cps.session : baseSel === "session" ? cps.session : baseSel;
  useEffect(() => {
    const ws = project && project.ws;
    if (!hasCp || !baseId) { setBase(null); return; }
    const seq = ++baseSeq.current;
    (async () => {
      try {
        setCmpBusy(true);
        const d = await ws.cpDiff(baseId);
        if (seq !== baseSeq.current) return;
        const T = baseTexts.current.id === baseId ? baseTexts.current : (baseTexts.current = { id: baseId, map: new Map() });
        const need = [...d.changed, ...d.removed].filter((p) => !T.map.has(p) && kindOfPath(p) !== "bin").slice(0, 600);
        await Promise.all(need.map(async (p) => { try { T.map.set(p, (await ws.cpFile(baseId, p)).text); } catch { T.map.set(p, null); } }));
        if (seq !== baseSeq.current) return;
        const files = projRef.current.files, touched = new Set([...d.changed, ...d.added, ...d.removed]);
        let bm = null, bfiles = files;
        if (touched.size) {
          // Modell des alten Stands: heutige Dateien, die berührten durch ihren Inhalt aus dem Kontrollpunkt ersetzt
          const key = baseId + "|" + grouping + "|" + [...touched].sort().join("\n");
          if (baseCache.current.key === key) { bm = baseCache.current.model; bfiles = baseCache.current.files; }
          else {
            bfiles = new Map(files);
            for (const p of d.changed) { const e = files.get(p), t = T.map.get(p); if (e && t != null) bfiles.set(p, { ...e, text: t }); }
            for (const p of d.added) bfiles.delete(p);
            for (const p of d.removed) { const t = T.map.get(p); if (t != null && !ignored(p)) bfiles.set(p, { path: p, size: t.length, kind: kindOfPath(p), text: t, encoding: "utf-8", eol: "\n", mtime: 0 }); }
            const parsed = await parseProject([...bfiles.values()].filter((e) => e.kind === "code" && e.text != null));
            if (seq !== baseSeq.current) return;
            bm = buildModel(parsed, grouping);
            baseCache.current = { key, model: bm, files: bfiles };
          }
        }
        setBase({ id: baseId, label: d.label, time: d.time, diff: d, texts: T.map, files: bfiles, model: bm, touched });
      } catch (e) {
        if (seq !== baseSeq.current) return;
        setBase(null);
        if (e.status === 404 && baseSel !== "turn" && baseSel !== "session") { setBaseSel("turn"); notify("Dieser Kontrollpunkt existiert nicht mehr.", "bad"); }
      } finally { if (seq === baseSeq.current) setCmpBusy(false); }
    })();
  }, [baseId, hasCp, project && project.files, grouping]); // eslint-disable-line
  const changes = useMemo(() => {
    const cur = projRef.current && projRef.current.files;
    if (!base || !base.model || !model || !cur) return null;
    // berührt = laut Kontrollpunkt geändert + alles, was sich seit dem letzten Abgleich im Speicher getan hat
    const ch = new Set(base.touched); for (const [p, e] of cur) if (base.files.get(p) !== e) ch.add(p);
    const d = diffModels(base.model, model, base.files, cur, ch);
    for (const g of d.layer.ghosts) { const p = posMemo.current.get(g.dk); if (p) { g.x = p.x; g.y = p.y; } }
    return d;
  }, [base, model]);
  useEffect(() => { engRef.current && engRef.current.setVibe(layerOn && changes && !changes.empty ? { ...changes.layer, only: onlyChg } : null); }, [changes, layerOn, onlyChg]);
  useEffect(() => { engRef.current && engRef.current.setInset(hasCp ? 40 : 0); }, [hasCp]);

  /* ---------- Vibe: Aufträge an die KI, Freigaben, Sprünge ---------- */
  const sendPrompt = useCallback(async (text, o = {}) => {
    const p = projRef.current; if (!p || !p.ws.agentStart) return;
    if (!o.auto) fixTries.current = 0;
    const mode = o.mode || aiRef.current.mode; if (o.mode) setAiMode(o.mode);
    const attachments = o.attachments || [];
    if (vibeRef.current.running && !o.auto) {   // läuft schon: Nachricht direkt an den laufenden Auftrag (wie im Terminal)
      try { await p.ws.agentSend({ agent: aiRef.current.agent, prompt: text, mode, attachments, model: aiRef.current.opt.model || "", effort: aiRef.current.opt.effort || "" }); setDraft(""); }
      catch (e) { notify("KI: " + e.message, "bad"); }
      return;
    }
    let prompt = text;
    const slash = /^(\/\S+)(?:[ \t]+|$)/.exec(prompt);   // /skill muss am Anfang bleiben, sonst erkennt Claude Code ihn nicht
    const s = selRef.current, M = modelRef.current;
    if (aiRef.current.opt.ctx && !o.auto && s && M && M.classes[s.id]) {
      const l = memberLoc(s), c = M.classes[s.id], x = s.m ? (s.m.t === "f" ? c.fields : c.methods)[s.m.i] : null;
      const rel = l.path.split("/").slice(p.rootName ? 1 : 0).join("/") || l.path;
      const cx = `[Kontext aus dem Diagramm: ${x ? (s.m.t === "f" ? "Variable" : "Funktion") + " `" + x.name + "`" : "Baustein `" + c.name + "`"} in ${rel}${x && l.line ? ", Zeile " + l.line + (l.end > l.line ? "–" + l.end : "") : ""}]`;
      prompt = slash ? slash[1] + " " + cx + "\n\n" + text.slice(slash[0].length) : cx + "\n\n" + text;
    }
    try { await p.ws.agentStart({ agent: aiRef.current.agent, prompt, mode, fresh: !!o.fresh, attachments, model: aiRef.current.opt.model || "", effort: aiRef.current.opt.effort || "", gate: aiRef.current.opt.gate || null }); if (!o.auto) setDraft(""); if (!o.pipe) setSideTab("ki"); }
    catch (e) { notify("KI: " + e.message, "bad"); }
  }, [notify, memberLoc]);
  const aiStop = useCallback(async () => { try { await projRef.current.ws.agentStop(); } catch (e) { notify("KI: " + e.message, "bad"); } }, [notify]);
  const aiDecide = useCallback(async (id, allow, always) => { try { await projRef.current.ws.agentDecide(id, allow, always); } catch (e) { notify("Freigabe: " + e.message, "bad"); } }, [notify]);
  const aiReset = useCallback(async () => { try { await projRef.current.ws.agentReset(); setTurnCp(null); } catch (e) { notify("KI: " + e.message, "bad"); } }, [notify]);
  const aiHooks = useCallback(async (on) => {
    try { vibeRef.current.hooks = await projRef.current.ws.agentHooks(on); bumpVibe(); notify(on ? "Terminal-Sitzungen werden jetzt mitgelesen" : "Mitlesen ausgeschaltet"); }
    catch (e) { notify("Hooks: " + e.message, "bad"); }
  }, [notify, bumpVibe]);
  const goKey = useCallback((dk, t, name) => {
    const M = modelRef.current, c = M && M.byDk.get(dk);
    if (!c) { notify("Dieser Baustein existiert im jetzigen Stand nicht mehr."); return; }
    const i = name ? (t === "f" ? c.fields : c.methods).findIndex((x) => x.name === name) : -1;
    engRef.current.select({ id: c.id, m: i >= 0 ? { t, i } : null }, i >= 0 ? 3 : 2);
  }, [notify]);
  const goLink = useCallback((l) => {
    const M = modelRef.current, a = M && M.byDk.get(l.a), b = M && M.byDk.get(l.b);
    if (!a || !b) { notify("Diese Verbindung gibt es im jetzigen Stand nicht mehr."); return; }
    const i = l.am ? mkOf(a).indexOf(l.am) : -1, j = l.bm ? (l.bt === "f" ? fkOf(b) : mkOf(b)).indexOf(l.bm) : -1;
    engRef.current.select({ id: a.id, m: i >= 0 ? { t: "m", i } : null }, false);
    engRef.current.fitNodes([a.id, b.id]);
    engRef.current.pinLink(a.id, i, b.id, l.bt === "f" ? "f" : "m", j);   // zeigt ein paar Sekunden lang, wo genau die Verbindung verläuft
  }, [notify]);
  const goTool = useCallback((it) => {   // Klick auf einen Schritt der KI: Stelle im Diagramm zeigen, Änderung bzw. Quelltext öffnen
    const p = projRef.current, M = modelRef.current; if (!p || !it.path) return;
    const kind = it.created ? "write" : TOOL_KIND[it.name] || "read";
    const ts = focusTargets({ path: it.path, from: it.from, to: it.to, lines: it.lines, find: it.new || it.old || "", kind }, M, p.files, p.rootName);
    if (ts.length) engRef.current.select({ id: ts[0].id, m: ts[0].m }, ts[0].m ? 3 : 2);
    if (!p.files.has(it.path)) { if (!ts.length) notify("Datei ist nicht (mehr) im Projekt: " + baseName(it.path)); return; }
    const line = (it.lines && it.lines[0] && it.lines[0][0]) || it.from || 1;
    if (kind === "edit" || kind === "write") { setChgPick({ path: it.path, line }); setDTab("changes"); setDOpen(true); }
    else { setEditReq({ path: it.path, line, n: Date.now() }); setDTab("editor"); setDOpen(true); }
  }, [notify]);
  const compareTo = useCallback((cp) => { setBaseSel(cp); setLayerOn(true); setDTab("changes"); setDOpen(true); }, []);
  const aimAt = useCallback((f, it) => {
    const eng = engRef.current, M = modelRef.current, t = f.targets[0], c = M && t && M.classes[t.id]; if (!c) return;
    const now = performance.now(), cam = camRef.current, o = aiRef.current.opt;
    const mem = t.m ? (t.m.t === "f" ? c.fields : c.methods)[t.m.i] : null;
    if (o.follow && eng.idleFor() > 5000 && (now - cam.t > 2500 || cam.dk === c.dk)) {
      eng.reveal(t.id, t.m); camRef.current = { t: now, dk: c.dk };
      setPip((pp) => (pp && pp.dk === c.dk ? null : pp));
      return;
    }
    if (eng.inView(t.id, t.m)) return;
    const kind = f.kind || "read", verb = (TOOL_DE[kind] || ["", kind === "changed" ? "ändert" : "arbeitet an"])[1];
    const where = it ? (it.path ? baseName(it.path) : it.cmd ? short(firstLine(it.desc || it.cmd), 40) : c.name) : c.name;
    const detail = mem ? " › " + mem.name : it && it.from ? " · Zeile " + de(it.from) + (it.to && it.to !== it.from ? "–" + de(it.to) : "") : "";
    setPip({ key: f.id, dk: c.dk, mt: t.m ? t.m.t : null, mName: mem ? mem.name : null, kind, label: verb + " " + where + detail, t0: Date.now(), t1: it && it.ph === "end" ? Date.now() : 0 });
  }, []);
  const pipJump = useCallback((pp) => {
    const M = modelRef.current, c = M && M.byDk && M.byDk.get(pp.dk); if (!c) return;
    const i = pp.mName ? (pp.mt === "f" ? c.fields : c.methods).findIndex((x) => x.name === pp.mName) : -1;
    engRef.current.select({ id: c.id, m: i >= 0 ? { t: pp.mt, i } : null }, 2); camRef.current = { t: performance.now(), dk: c.dk }; setPip(null);
  }, []);
  useEffect(() => {   // Bild im Bild schließt sich ein paar Sekunden nach dem Schritt (nicht, solange die Maus darauf liegt)
    if (!pip || !pip.t1) return;
    const h = setInterval(() => { if (!pipHold.current && Date.now() - pip.t1 > 6000) setPip((pp) => (pp === pip ? null : pp)); }, 500);
    return () => clearInterval(h);
  }, [pip]);
  const showChanges = useCallback(() => { setDTab("changes"); setDOpen(true); }, []);
  const runNow = useCallback(() => {   // nach einem Auftrag: das Programm mit der zuletzt gewählten Start-Konfiguration und Live-Trace laufen lassen
    const p = projRef.current, rp = (p && p.ws.runPresets) || []; if (!rp.length) return;
    const id = lsGet("cal-runp", rp[0].id);
    runStart([{ preset: rp.some((x) => x.id === id) ? id : rp[0].id, args: lsGet("cal-runa", ""), trace: true }]);
  }, [runStart]);
  const restoreTo = useCallback(async (paths) => {
    const p = projRef.current; if (!p || !base) return;
    try {
      const r = await p.ws.cpRestore(base.id, paths);
      if (r.snapshot) setUndoSnap(r.snapshot);
      notify(r.files.length ? `${de(r.files.length)} Datei${r.files.length === 1 ? "" : "en"} zurückgesetzt` : "Nichts zurückzusetzen");
    } catch (e) { notify("Zurücksetzen: " + e.message, "bad"); }
  }, [base, notify]);
  const undoRestore = useCallback(async () => {
    const p = projRef.current; if (!p || !undoSnap) return;
    try { await p.ws.restore(undoSnap); setUndoSnap(null); notify("Zurücksetzen rückgängig gemacht"); } catch (e) { notify("Rückgängig: " + e.message, "bad"); }
  }, [undoSnap, notify]);
  const makeCp = useCallback(async () => {
    const p = projRef.current; if (!p) return;
    try { const c = await p.ws.cpCreate("Kontrollpunkt " + clock(Date.now())); await refreshCps(p.ws); setBaseSel(c.id); notify("Kontrollpunkt gesetzt – ab jetzt wird damit verglichen"); }
    catch (e) { notify("Kontrollpunkt: " + e.message, "bad"); }
  }, [notify, refreshCps]);
  const askFix = useCallback((items, src) => {
    setDraft(fixPrompt(items, src)); setSideTab("ki"); setLOpen(true);
    setTimeout(() => document.getElementById("cal-prompt")?.focus(), 60);
  }, []);
  // nach einem Auftrag: Build prüfen und Fehler – wenn gewünscht – an die KI zurückgeben (höchstens 3 Runden)
  const afterTurn = useCallback(async (turn) => {
    const o = aiRef.current.opt, p = projRef.current, T = vibeRef.current.byTurn.get(turn);
    if (p && o.autoTest && T && T.ok && T.mode !== "plan" && (p.ws.features || []).includes("tests") && T.items.some((it) => it.type === "tool" && ["edit", "write"].includes(TOOL_KIND[it.name]))
      && ![...testRef.current.runs.values()].some((R) => R.t0 >= (T.t1 || Date.now()) - 4000)) {   // nicht doppelt, wenn Claude am Ende selbst getestet hat
      const ti = await p.ws.testInfo().catch(() => null);
      if (ti && (ti.py || ti.c) && !ti.running) testRun("", { affected: true }, true);
    }
    const mut = !!(T && T.ok && T.mode !== "plan" && T.items.some((it) => it.type === "tool" && ["edit", "write", "run"].includes(TOOL_KIND[it.name])));
    if (p && mut && o.autoCommit && (p.ws.features || []).includes("git")) {   // ein Commit je Auftrag
      const files = [...new Set(T.items.filter((it) => it.type === "tool" && it.path && ["edit", "write"].includes(TOOL_KIND[it.name])).map((it) => it.path.split("/").slice(1).join("/")))];
      const msg = "KI: " + short(firstLine((T.prompt || "Auftrag").replace(/^\[Kontext[^\]]*\]\s*/, "")), 70) + "\n\n" + (files.length ? "Geändert: " + files.slice(0, 20).join(", ") + "\n" : "") + "Auftrag #" + T.n + " im CodeAtlas" + (T.cost != null ? " · " + fmtCost(T.cost) : "");
      try { const r = await p.ws.gitCommit(msg); if (r.hash) { T.commit = r.hash; bumpVibe(); notify("Commit " + r.hash); } } catch (e) { notify("Commit: " + e.message, "bad"); }
    }
    if (p && mut && o.autoMap && (p.ws.features || []).includes("claudemd") && modelRef.current) p.ws.claudeMdPut(claudeMdText(modelRef.current, rulesRef.current, null, null)).catch(() => {});
    if (chainRef.current && T && T.mode !== "plan") {   // Pipeline: nächste Aufgabe
      let P = null; try { P = await p.ws.pipeline(); setPipe(P); } catch { /* ignore */ }
      const nt = P && nextTask(P);
      if (!T.ok) { setChain(false); notify("Pipeline angehalten: Auftrag nicht erfolgreich", "bad"); }
      else if (nt) { notify("Pipeline: weiter mit " + nt.id); setTimeout(() => sendPrompt(PIPE_PROMPT.task(nt), { mode: "acceptEdits", auto: true, pipe: true }), 800); return; }
      else { setChain(false); notify(P && P.stage === "fertig" ? "Pipeline: alle Aufgaben erledigt" : "Pipeline: keine freie Aufgabe mehr"); }
    }
    if (!p || !o.autoBuild || !p.ws.presets || !p.ws.presets.length || !T || !T.ok || T.mode === "plan") return;
    const r = await runBuild(lsGet("cal-preset", p.ws.presets[0].id), true);
    if (!r || !r.ne) { fixTries.current = 0; return; }
    if (o.autoFix && fixTries.current < 3) { fixTries.current++; notify(`Build: ${r.ne} Fehler – Versuch ${fixTries.current}/3 geht zurück an die KI`); sendPrompt(fixPrompt(r.items, r.src), { auto: true }); }
    else if (o.autoFix) notify("Build weiter fehlerhaft – nach 3 Versuchen angehalten, bitte selbst ansehen", "bad");
  }, [runBuild, sendPrompt, notify]); // eslint-disable-line
  const afterTurnRef = useRef(null); afterTurnRef.current = afterTurn;

  // Ereignisse der KI (aus dem Atlas gestartet oder über Hooks aus dem Terminal)
  useEffect(() => {
    const ws = project && project.ws, V = vibeRef.current, eng = engRef.current;
    if (!ws || ws.kind !== "bridge" || !ws.features.includes("agent")) { vibeClear(V); V.on = false; V.agents = []; setTurnCp(null); setCps({ list: [], session: null }); eng && eng.setAgent(null); bumpVibe(); return; }
    eng.setAgent(V);
    const un = ws.agentEvents((e) => {
      const it = vibeApply(V, e);
      const fresh = !!e.t && Math.abs(Date.now() - e.t) < 20000;    // beim (Wieder-)Verbinden kommt der ganze Verlauf – nur Aktuelles animieren
      if (e.k === "state") { setTurnCp(null); refreshCps(ws); }
      else if (e.k === "turn" && e.ph === "start") { setTurnCp(e.cp); if (fresh) refreshCps(ws); }
      else if (e.k === "turn" && e.ph === "end" && fresh) {
        const T = V.byTurn.get(e.turn);
        notify(e.ok ? `KI fertig${T && T.ms != null ? " (" + fmtDur(T.ms) + ")" : ""}` : e.reason === "abgebrochen" ? "KI-Auftrag abgebrochen" : "KI: " + (e.reason || "Fehler"), e.ok || e.reason === "abgebrochen" ? "" : "bad");
      }
      else if (e.k === "idle" && fresh) refreshWs().then(() => afterTurnRef.current(e.turn));
      else if (e.k === "tool" && it && fresh) {
        const f = vibeFocus(V, it, performance.now());
        if (f) {
          const p = projRef.current;
          f.targets = focusTargets(f, modelRef.current, p && p.files, p && p.rootName);
          eng.agentKick(true);
          if (e.ph === "start" && !f.aimed && f.targets.length) { f.aimed = true; aimAt(f, it); }   // erst wenn der Schritt wirklich losläuft – kein Springen beim Mitschreiben
          if (e.ph === "end") setPip((pp) => (pp && pp.key === f.id && !pp.t1 ? { ...pp, t1: Date.now() } : pp));
        }
      }
      else if (e.k === "pipeline") loadPipe();
      else if (e.k === "gate" && fresh && e.ph !== "check") notify("Qualitätstor: " + (e.ph === "ok" ? "✓ bestanden" : e.ph === "block" ? "nicht bestanden – Claude bessert nach (Runde " + e.round + "/3)" : e.text), e.ph === "block" || e.ph === "giveup" ? "bad" : "");
      else if (e.k === "perm" && e.ph === "ask" && fresh) { setSideTab("ki"); setLOpen(true); notify("Freigabe nötig: " + short(e.cmd || e.path || e.name || "", 70)); }
      bumpVibe();
    });
    return () => un && un();
  }, [project && project.ws]); // eslint-disable-line

  /* ---------- Tests im Atlas ---------- */
  const loadTestInfo = useCallback(async () => {
    const p = projRef.current; if (!p || !p.ws.testInfo || !(p.ws.features || []).includes("tests")) return;
    try { setTestInfo(await p.ws.testInfo()); } catch { /* Bridge gerade nicht erreichbar */ }
  }, []);
  useEffect(() => { testRef.current = createTests(); setTestTick((t) => t + 1); setTestInfo(null); setTestSel(null); loadTestInfo(); }, [project && project.ws]); // eslint-disable-line
  useEffect(() => { if (dTab === "tests" && dOpen) loadTestInfo(); }, [dTab, dOpen]); // eslint-disable-line
  const testRun = useCallback(async (flt, more, quiet) => {
    const p = projRef.current; if (!p || !p.ws.testRun) return;
    setTestSel(null); if (!quiet) { setDTab("tests"); setDOpen(true); }
    try { const r = await p.ws.testRun(flt, more); if (r.empty && r.note) notify("Tests: " + r.note + " – übersprungen"); else if (r.empty && !quiet) notify("Keine Testdateien gefunden (test_*.py / test_*.c)", "bad"); }
    catch (e) { notify("Tests: " + e.message, "bad"); }
  }, [notify]);
  const testStop = useCallback(async () => { const p = projRef.current; try { await p.ws.testStop(); } catch (e) { notify(e.message, "bad"); } }, [notify]);
  const onTestMsg = useCallback((msg) => {
    setTestTick((t) => t + 1);
    if (msg.k === "tests" && msg.ev === "done") {
      const s = msg.summary || {}, bad = (s.failed || 0) + (s.error || 0), R = testRef.current.runs.get(msg.run || 0);
      const nm = R ? R.label.replace(/\s*\(.*$/, "") : "Tests";
      const broke = Object.entries(msg.was || {}).filter(([id, w]) => w === "passed").length, fixed = Object.keys(msg.was || {}).length - broke;
      notify(R && R.build ? nm + ": Übersetzen fehlgeschlagen" : `${nm}: ${bad ? de(bad) + " fehlgeschlagen · " : ""}${de(s.passed || 0)} bestanden${broke ? " · ▼ " + de(broke) + " neu kaputt" : ""}${fixed ? " · ▲ " + de(fixed) + " repariert" : ""}`, bad || (R && R.build) ? "bad" : "");
      loadTestInfo();
    }
  }, [notify, loadTestInfo]);
  const pickFnAt = useCallback((path, line) => {
    const M = modelRef.current; if (!M || !engRef.current) return;
    const t = locate(M, path, line);
    if (t) engRef.current.select({ id: t.id, m: t.m || null }, t.m ? 3 : 2); else notify("Im Diagramm nicht gefunden: " + tPath(path) + ":" + line);
  }, [notify]);
  const pickTest = useCallback((s) => setTestSel(s), []);
  useEffect(() => {   // Testansicht im Diagramm: was der gewählte Test ausgeführt hat, wo er scheitert
    const eng = engRef.current, M = model; if (!eng) return;
    const R = testSel && testRef.current.runs.get(testSel.run), t = R && R.tests.get(testSel.id);
    if (R && M && testSel.cov) {   // Abdeckung: alle Funktionen, die kein Test erreicht hat
      const miss = ((R.cov && R.cov.missing) || []).map((x) => locate(M, x.path, x.line)).filter(Boolean);
      eng.setTestView({ on: [], fail: [], miss });
      if (testFly.current !== testSel) { testFly.current = testSel; const ids = [...new Set(miss.map((x) => x.id))]; if (ids.length) eng.fitNodes(ids.slice(0, 60)); }
      return;
    }
    if (!t || !M) { eng.setTestView(null); testFly.current = null; return; }
    const L = liveRef.current, on = [], fail = [], seen = new Set();
    const hitRun = t.old ? R.prevRun || R.run : R.run;   // aus dem vorigen Lauf übernommene Tests: Funktionsnummern gehören zu jenem Lauf
    for (const [idx] of R.hits.get(t.id) || []) {
      const c = L.codes.get(hitRun + ":" + idx), tg = c && (c.target || locateCode(M, c));
      if (tg && !seen.has(bpId(tg))) { seen.add(bpId(tg)); on.push(tg); }
    }
    const add = (x, label) => { if (!x) return; const tg = locate(M, x.path, x.line); if (tg) fail.push({ ...tg, label }); };
    add(t.where, "✗ FEHLERORT");
    if (t.checks) t.checks.slice(0, 3).forEach((c, i) => add({ path: c.path, line: c.line }, i ? "" : "✗ PRÜFUNG")); else add(t.at, t.where ? "" : (t.status === "failed" || t.status === "error") ? "✗ PRÜFUNG" : "");
    eng.setTestView({ on, fail });
    if (testFly.current === testSel) return;
    testFly.current = testSel;
    const isTest = (x) => /(^|\/)(tests?|testing)\/|(^|\/)test_[^/]*$|_test\.[a-z]+$/i.test((M.classes[x.id] || {}).file || "");
    const wh = t.where && fail.find((x) => x.label === "✗ FEHLERORT");
    if (wh) { eng.select({ id: wh.id, m: wh.m || null }, wh.m ? 3 : 2); return; }
    // kein Fehlerort im Programm (falscher Rückgabewert): Prüfung im Test und die ausgeführten Programmfunktionen gemeinsam zeigen
    const ids = [...new Set([...fail, ...on.filter((x) => !isTest(x))].map((x) => x.id))];
    if (ids.length > 1) eng.fitNodes(ids.slice(0, 40));
    else if (ids.length) { const f = fail[0] || on[0]; eng.select({ id: f.id, m: f.m || null }, f.m ? 3 : 2); }
  }, [testSel, testTick, model]); // eslint-disable-line
  const askTests = useCallback(async () => {
    const p = projRef.current; if (!p || !p.ws.testResult) return;
    try {
      const r = await p.ws.testResult();
      setDraft("Diese Tests schlagen im CodeAtlas fehl. Behebe die Ursache im Programm (den Test nur ändern, wenn er selbst falsch ist) und prüfe danach mit tests_run.\n\n" + (r.text || ""));
      setSideTab("ki"); setLOpen(true);
      setTimeout(() => document.getElementById("cal-prompt")?.focus(), 60);
    } catch (e) { notify("Tests: " + e.message, "bad"); }
  }, [notify]);
  /* ---------- CodeAtlas 4 ---------- */
  const feat = (f) => !!(project && project.ws && project.ws.kind === "bridge" && (project.ws.features || []).includes(f));
  const hasPipe = feat("pipeline") && feat("agent"), hasTeam = feat("team");
  // Regeln und Pipeline laden
  const loadPipe = useCallback(async () => { const p = projRef.current; if (!p || !p.ws.pipeline) return; try { setPipe(await p.ws.pipeline()); } catch { /* alte Bridge */ } }, []);
  useEffect(() => {
    setPipe(null); setRules({ rules: [], noCycles: false }); setImpact(null); setHeat(null); setReplay(null);
    const p = projRef.current; if (!p || !p.ws.rules || !(p.ws.features || []).includes("rules")) return;
    p.ws.rules().then((r) => setRules({ rules: r.rules || [], noCycles: !!r.noCycles })).catch(() => {});
    loadPipe();
  }, [project && project.ws]); // eslint-disable-line
  const saveRules = useCallback(async (r) => { setRules(r); try { await projRef.current.ws.rulesPut(r); } catch (e) { notify("Regeln: " + e.message, "bad"); } }, [notify]);
  const savePipe = useCallback(async (patch) => { try { setPipe(await projRef.current.ws.pipelinePut(patch)); } catch (e) { notify("Pipeline: " + e.message, "bad"); } }, [notify]);
  // Diagramm an die Bridge: Claude fragt es über atlas_* ab (gebündelt, nicht bei jedem Tastendruck)
  useEffect(() => {
    const ws = project && project.ws; if (!model || !ws || !ws.graphPut || !(ws.features || []).includes("graph") || model.synthetic) return;
    const h = setTimeout(() => {
      const rr = ruleEval ? { violations: ruleEval.violations.slice(0, 200).map((v) => ({ text: v.text, path: v.path, line: v.line })), cycles: ruleEval.cycles } : null;
      ws.graphPut(graphSnapshot(model, rr)).catch(() => {});
    }, 700);
    return () => clearTimeout(h);
  }, [model, ruleEval]); // eslint-disable-line
  useEffect(() => { setHeat(null); setImpact(null); }, [model]);
  useEffect(() => { engRef.current && engRef.current.setHeat(heat ? { vals: heat.vals, col: heat.col } : null); }, [heat]);
  // Wirkungsbereich
  const testsOf = useCallback((ids) => {   // welche Tests haben (laut letztem Lauf) einen dieser Bausteine ausgeführt
    const T = testRef.current, L = liveRef.current, out = new Set(); let known = false;
    for (const R of testLatest(T)) for (const [tid, codes] of R.hits) {
      known = true;
      for (const [idx] of codes) { const c = L.codes.get((R.tests.get(tid) && R.tests.get(tid).old ? R.prevRun || R.run : R.run) + ":" + idx), tg = c && c.target; if (tg && ids.has(tg.id + (tg.m ? ":" + tg.m.t + tg.m.i : ""))) { out.add(tid); break; } }
    }
    return known ? [...out] : null;
  }, []);
  const impactSummary = useCallback((src, label) => {
    const M = modelRef.current; if (!M || !src.length) return null;
    const list = impactOf(M, src, 3), ids = new Set([...src, ...list].map((t) => t.id + (t.m ? ":" + t.m.t + t.m.i : "")));
    const files = new Set(list.map((t) => { const c = M.classes[t.id], m = t.m && t.m.t === "m" ? c.methods[t.m.i] : null; return (m && m.file) || c.file; }));
    return { src, list, n: list.length, files: files.size, tests: testsOf(ids), label };
  }, [testsOf]);
  const showImpact = useCallback((src, label) => {
    const r = impactSummary(src, label); if (!r) return;
    setImpact(r); engRef.current.setImpactView({ list: r.list, src: r.src, label: "WIRKUNG" });
    const ids = [...new Set([...r.src, ...r.list].map((t) => t.id))]; if (ids.length > 1) engRef.current.fitNodes(ids.slice(0, 60));
  }, [impactSummary]);
  useEffect(() => { if (!impact && engRef.current) engRef.current.setImpactView(null); }, [impact]);
  const showImpactSel = useCallback((s) => { const M = modelRef.current; if (!s || !M || !M.classes[s.id]) return; const c = M.classes[s.id], x = s.m ? (s.m.t === "f" ? c.fields : c.methods)[s.m.i] : null; showImpact([{ id: s.id, m: s.m || null }], "Wirkungsbereich von " + (x ? x.name : c.name)); }, [showImpact]);
  const permImpact = useCallback((p) => {
    const M = modelRef.current, pr = projRef.current; if (!M || !pr || !p.path || !/^(Edit|MultiEdit|Write)$/.test(p.name || "")) return null;
    const src = focusTargets({ path: p.path, old: p.old || "", find: p.new || "", kind: "edit" }, M, pr.files, pr.rootName);
    const r = impactSummary(src, "Freigabe: " + baseName(p.path)); if (!r) return null;
    return { n: r.n, files: r.files, tests: r.tests ? r.tests.length : null, show: () => { setImpact(r); engRef.current.setImpactView({ list: r.list, src: r.src, label: "WIRKUNG" }); const ids = [...new Set([...r.src, ...r.list].map((t) => t.id))]; if (ids.length) engRef.current.fitNodes(ids.slice(0, 60)); } };
  }, [impactSummary]);
  const showTask = useCallback((t) => {   // Pipeline-Aufgabe: betroffene Dateien/Symbole markieren
    const M = modelRef.current, pr = projRef.current; if (!M || !pr) return;
    const src = [], seen = new Set(), add = (x) => { const k = x.id + (x.m ? ":" + x.m.t + x.m.i : ""); if (!seen.has(k)) { seen.add(k); src.push(x); } };
    const paths = [...pr.files.keys()];
    for (const f of t.files || []) { const p = matchPath(f, paths, pr.rootName); if (p) for (const c of nodesOfFile(M, p)) add({ id: c.id, m: null }); }
    for (const sy of t.symbols || []) { const nm = String(sy).split(/[.:]/).pop(); for (const c of M.classes) { if (c.name === nm) add({ id: c.id, m: null }); c.methods.forEach((m, i) => { if (m.name === nm) add({ id: c.id, m: { t: "m", i } }); }); } }
    if (!src.length) { notify("Keine passenden Stellen im Diagramm für " + t.id); return; }
    showImpact(src, "Aufgabe " + t.id);
  }, [showImpact, notify]);
  // Team-Agenten
  const teamRefresh = useCallback(async () => { const p = projRef.current; if (!p || !p.ws.team) return; try { const r = await p.ws.team(); teamRef.current.agents = r.agents; teamRef.current.git = r.git; setTeamTick((t) => t + 1); } catch { /* ignore */ } }, []);
  useEffect(() => {
    const ws = project && project.ws, T = teamRef.current;
    T.agents = []; T.vibes = new Map(); T.git = null; setTeamTick((t) => t + 1);
    if (!ws || !ws.teamEvents || !(ws.features || []).includes("team")) return;
    teamRefresh();
    const un = ws.teamEvents((e) => {
      if (e.k === "team") T.agents = e.agents || [];
      else if (e.agent) {
        let V = T.vibes.get(e.agent); if (!V) { V = createVibe(); T.vibes.set(e.agent, V); }
        const it = vibeApply(V, e);
        if (e.k === "tool" && it) { const f = vibeFocus(V, it, performance.now()); if (f) { const p = projRef.current; f.targets = focusTargets(f, modelRef.current, p && p.files, p && p.rootName); } }
        if ((e.k === "turn" && e.ph === "end") || (e.k === "tool" && e.ph === "end" && /^(Edit|MultiEdit|Write)$/.test(e.name || ""))) teamRefresh();
        if (e.k === "perm" && e.ph === "ask" && Math.abs(Date.now() - e.t) < 20000) notify("Team-Agent " + e.agent + ": Freigabe nötig");
      }
      setTeamTick((t) => t + 1);
    });
    return () => un && un();
  }, [project && project.ws]); // eslint-disable-line
  useEffect(() => {   // Team im Diagramm: frische Schritte jedes Agenten in seiner Farbe
    const T = teamRef.current; if (!T.agents.length) { engRef.current && engRef.current.setTeamView(null); return; }
    const tick = () => {
      const now = performance.now(), list = [];
      for (const a of T.agents) {
        const V = T.vibes.get(a.id); if (!V) continue;
        const fs = V.foci.filter((f) => !f.t1 || now - f.t1 < 9000).slice(-3), targets = [];
        for (const f of fs) for (const t of f.targets || []) if (!targets.some((x) => x.id === t.id && JSON.stringify(x.m) === JSON.stringify(t.m))) targets.push(t);
        if (targets.length) list.push({ color: a.color, label: "⇉ " + a.name, targets: targets.slice(0, 8), live: fs.some((f) => !f.t1) });
      }
      engRef.current && engRef.current.setTeamView(list);
    };
    tick(); const h = setInterval(tick, 800);
    const r = T.agents.some((a) => a.running) ? setInterval(teamRefresh, 4000) : null;
    return () => { clearInterval(h); if (r) clearInterval(r); };
  }, [teamTick, model]); // eslint-disable-line
  const teamOp = useCallback(async (op, body) => { try { const r = await projRef.current.ws.teamOp(op, body); teamRefresh(); return r; } catch (e) { notify("Team: " + e.message, "bad"); return null; } }, [notify, teamRefresh]);
  const teamStart = useCallback(async (name, prompt, base) => { const r = await teamOp("start", { name, prompt, base, mode: "acceptEdits", model: aiRef.current.opt.model || "" }); if (r) notify("Team-Agent „" + name + "“ arbeitet in eigenem Worktree"); }, [teamOp, notify]);
  const teamSend = useCallback((id, prompt) => teamOp("send", { id, prompt, mode: "acceptEdits", model: aiRef.current.opt.model || "" }), [teamOp]);
  const teamMerge = useCallback(async (id) => {
    const r = await teamOp("merge", { id }); if (!r) return;
    if (r.ok) { notify(`„${id}“ zusammengeführt: ${r.files.length} Datei${r.files.length === 1 ? "" : "en"}`); refreshWs(); }
    else notify(r.error || "Zusammenführen fehlgeschlagen", "bad");
  }, [teamOp, notify, refreshWs]);
  const teamDiscard = useCallback(async (id) => { if (window.confirm && !window.confirm(`Team-Agent „${id}“ und alle seine Änderungen verwerfen?`)) return; const r = await teamOp("discard", { id }); if (r) { teamRef.current.vibes.delete(id); notify("„" + id + "“ verworfen"); } }, [teamOp, notify]);
  const teamDiffShow = useCallback(async (id) => { try { const r = await projRef.current.ws.teamDiff(id); setDiffM({ ...r, id }); } catch (e) { notify(e.message, "bad"); } }, [notify]);
  const teamGo = useCallback((path) => { const M = modelRef.current; if (!M) return; const p = projRef.current, mp = matchPath(path, [...p.files.keys()], p.rootName); const ns = mp ? nodesOfFile(M, mp) : []; if (ns.length) engRef.current.fitNodes(ns.map((c) => c.id)); }, []);
  // Auftrag abspielen
  const startReplay = useCallback((T) => {
    const steps = T.items.filter((x) => x.type === "tool" && TOOL_KIND[x.name]).map((it) => ({ it, label: ((TOOL_DE[it.created ? "write" : TOOL_KIND[it.name]] || ["", it.name])[1]) + " " + (it.path ? baseName(it.path) : short(firstLine(it.desc || it.cmd || ""), 40)) }));
    if (!steps.length) return;
    setReplay({ turn: T.n, steps, i: 0, playing: true, speed: 1 });
  }, []);
  useEffect(() => {
    const eng = engRef.current; if (!eng) return;
    if (!replay) { eng.setAgent(vibeRef.current); return; }
    const p = projRef.current, M = modelRef.current, now = performance.now(), foci = [];
    for (let j = Math.max(0, replay.i - 2); j <= replay.i; j++) {
      const it = replay.steps[j].it, f = { id: "rp" + j, kind: it.created ? "write" : TOOL_KIND[it.name], path: it.path, dir: it.dir, from: it.from, to: it.to, lines: it.lines, cmd: it.cmd,
        find: it.new || (it.edits && it.edits[0] && it.edits[0].new) || "", old: it.old || (it.edits && it.edits[0] && it.edits[0].old) || "", t0: now - (replay.i - j) * 900, t1: j < replay.i ? now - (replay.i - j - 1) * 900 : 0 };
      f.targets = focusTargets(f, M, p && p.files, p && p.rootName); foci.push(f);
    }
    eng.setAgent({ ...vibeRef.current, foci, running: 1 }); eng.agentKick(true);
    const cur = foci[foci.length - 1]; if (cur && cur.targets[0] && !eng.inView(cur.targets[0].id, cur.targets[0].m)) eng.reveal(cur.targets[0].id, cur.targets[0].m);
    if (!replay.playing) return;
    const h = setTimeout(() => setReplay((r) => (!r ? r : r.i >= r.steps.length - 1 ? { ...r, playing: false } : { ...r, i: r.i + 1 })), 1500 / replay.speed);
    return () => clearTimeout(h);
  }, [replay]); // eslint-disable-line
  /* ---------- Eingaben ---------- */
  const onFiles = (e) => {
    const fl = [...e.target.files]; e.target.value = "";
    if (!fl.length) return;
    const top = (fl[0].webkitRelativePath || fl[0].name).split("/")[0];
    prepLibs();
    loadList(fl.map((f) => ({ file: f, path: f.webkitRelativePath || f.name })), top);
  };
  useEffect(() => { if (dirRef.current) { dirRef.current.setAttribute("webkitdirectory", ""); dirRef.current.setAttribute("directory", ""); } }, []);
  const onDrop = async (e) => {
    e.preventDefault(); setDrag(false);
    const items = [...(e.dataTransfer.items || [])];
    const entries = items.map((i) => i.webkitGetAsEntry && i.webkitGetAsEntry()).filter(Boolean);
    const plain = [...(e.dataTransfer.files || [])];
    try {
      setBusy({ label: "Lese Ordner …", done: 0, total: 0 }); prepLibs();
      const list = entries.length ? await walkEntries(entries) : plain.map((f) => ({ file: f, path: f.name }));
      await loadList(list, entries[0] ? entries[0].name : "Projekt");
    } catch (er) { notify(er.message, "bad"); setBusy(null); }
  };
  const pick = useCallback((id, m) => { engRef.current.select({ id, m: m || null }, m ? 3 : 2); if (narrow) setLOpen(false); }, [narrow]);
  const pickModule = useCallback((key) => { engRef.current.fitGroup(key); if (narrow) setLOpen(false); }, [narrow]);
  const pickMember = useCallback((id, m) => { engRef.current.select({ id, m }, 3); }, []);
  useEffect(() => { if (sel && narrow) setROpen(true); }, [sel, narrow]);

  useEffect(() => {
    const kd = (e) => {
      const t = e.target; if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) { if (e.key === "Escape") t.blur(); return; }
      const eng = engRef.current; if (!eng || e.ctrlKey || e.metaKey || e.altKey) return;
      const s = selRef.current;
      if (e.key === "f" || e.key === "F") eng.fit();
      else if (/^[0-3]$/.test(e.key)) eng.level(+e.key);
      else if (e.key === "+" || e.key === "=") eng.zoom(1.5);
      else if (e.key === "-") eng.zoom(1 / 1.5);
      else if (e.key === "Escape") { eng.select(null); setPat(""); }
      else if (e.key === "/") { e.preventDefault(); setSideTab("tree"); if (narrow) setLOpen(true); setTimeout(() => document.getElementById("cal-search")?.focus(), 30); }
      else if (e.key === "i" || e.key === "I") { e.preventDefault(); setSideTab("ki"); if (narrow) setLOpen(true); setTimeout(() => document.getElementById("cal-prompt")?.focus(), 30); }
      else if ((e.key === "e" || e.key === "E") && s) { const l = memberLoc(s); if (e.shiftKey) editAt(l.path, l.line); else openExt(l.path, l.line); }
      else if (e.key === "k" || e.key === "K") setDOpen((o) => !o);
      else if ((e.key === "b" || e.key === "B") && projRef.current?.ws.build) runBuild(lsGet("cal-preset", "0"));
      else return;
    };
    window.addEventListener("keydown", kd); return () => window.removeEventListener("keydown", kd);
  }, [narrow, memberLoc, editAt, openExt, runBuild]);

  const tIcon = theme === "dark" ? "●" : theme === "light" ? "○" : "◐";
  const nextTheme = () => setTheme(theme === "dark" ? "light" : theme === "light" ? "auto" : "dark");
  const selC = model && sel ? model.classes[sel.id] : null;
  const files = project ? project.files : new Map();
  const wsKind = project ? project.ws.kind : "";
  const nErr = diag ? diag.items.filter((d) => d.sev === "error").length : 0, nWarn = diag ? diag.items.filter((d) => d.sev === "warning").length : 0;
  const LV_ = liveRef.current;
  const liveErr = LV_.errors.filter((r) => r.handled == null).length;
  const VB_ = vibeRef.current, cnt = changes && !changes.empty ? changes.cnt : null;
  const nChgFiles = base && base.diff ? base.diff.changed.length + base.diff.added.length + base.diff.removed.length : 0;
  const tsum = testSummary(testRef.current);
  const counts = { files: files.size, problems: nErr + nWarn, err: nErr, run: liveErr || 0, running: LV_.status === "running" || LV_.status === "building", changes: nChgFiles,
    hasTests: wsKind === "bridge" && project.ws.features.includes("tests"), hasAna: !!model, ana: ruleEval ? ruleEval.violations.length + (rules.noCycles ? ruleEval.cycles.length : 0) : 0, tests: tsum.bad || tsum.passed || 0, testsBad: tsum.bad, testsRunning: tsum.running };
  const hasAgent = wsKind === "bridge" && project.ws.features.includes("agent");
  const openTurn = VB_.turns.length ? [...VB_.turns].reverse().find((t) => t.open) : null;
  const aiNow = (() => {   // eine Zeile: was die KI in diesem Moment tut
    if (!openTurn) return "";
    const it = [...openTurn.items].reverse().find((x) => x.type === "tool" && x.ph !== "end");
    const who = openTurn.src === "terminal" ? "Claude Code (Terminal)" : openTurn.agent || "KI";
    if (it) { const k = it.created ? "write" : TOOL_KIND[it.name]; return who + " " + ((TOOL_DE[k] || ["", "arbeitet"])[1]) + " " + short(k === "run" ? firstLine(it.desc || it.cmd || "") : it.path ? baseName(it.path) : it.pat || "", 46); }
    const st = openTurn.status; return who + " " + (st ? (st.s === "task" && st.detail ? "· " + short(st.detail, 50) : STATUS_DE[st.s] || "arbeitet …") : "arbeitet …");
  })();
  const baseLabel = baseSel === "turn" ? (turnCp ? "letztem Auftrag" : "Start der Bridge") : baseSel === "session" ? "Start der Bridge" : "Kontrollpunkt " + (base ? clock(base.time) : "");
  const selLabel = selC ? selC.name + (sel.m ? " › " + ((sel.m.t === "f" ? selC.fields[sel.m.i] : selC.methods[sel.m.i]) || {}).name + (sel.m.t === "m" ? "()" : "") : "") : "";
  const cmdHint = `python codeatlas_bridge.py "Pfad\\zum\\Projekt" --desktop`;

  return (
    <div className={"cal v-" + (simple ? "simple" : "adv") + (openTurn ? " ai-on" : "") + (ui.motion ? "" : " no-motion") + (ui.minimap ? "" : " no-mini") + (ui.ladder ? "" : " no-ladder")} data-accent={ui.accent} ref={rootRef}
      onDragOver={(e) => { e.preventDefault(); if (!drag) setDrag(true); }}
      onDragLeave={(e) => { if (e.currentTarget === e.target || !e.currentTarget.contains(e.relatedTarget)) setDrag(false); }}
      onDrop={onDrop}>
      <style>{CSS}</style>
      <header className="nav">
        <button className="nav-theme" style={{ display: narrow ? "flex" : "none" }} onClick={() => { setLOpen(!lOpen); setROpen(false); }} aria-label="Struktur">☰</button>
        <div className="nav-logo"><AtlasMark />CodeAtlas<span>Compile</span></div>
        <div className="nav-mid">
          <button className={"btn" + (VB_.running || openTurn ? " on" : "")} onClick={() => { setSideTab("ki"); setLOpen(true); setTimeout(() => document.getElementById("cal-prompt")?.focus(), 40); }} title="Auftrag an die KI (I)">
            {openTurn ? <span className="ldot ai" /> : "✦ "}KI{VB_.perms.length ? " · Freigabe" : ""}
          </button>
          <button className={"btn keep " + (simple && project ? "chip" : "primary")} onClick={() => (canSwitch ? setProjOpen(true) : dirRef.current.click())} title={canSwitch ? "Anderes Projekt über die Bridge öffnen (Strg+O)" : "Ordner im Browser öffnen (Strg+O)"}>
            {simple && project ? <><span className={"dot " + (wsKind === "bridge" || wsKind === "fsa" ? (live === "getrennt" ? "bad" : "ok") : "")} />{project.name}<span className="car">▾</span></> : canSwitch ? "Projekt öffnen" : simple ? "Projekt öffnen" : "Ordner"}</button>
          {simple && openTurn && <span className="keep nav-ai"><span className="ldot ai" />{short(aiNow, 70)}</span>}
          <button className="btn" onClick={() => fileRef.current.click()}>Dateien / ZIP</button>
          <button className="btn" onClick={() => setPaste({ text: "", name: "eingefuegt.c" })}>Code einfügen</button>
          <button className={"btn" + (wsKind === "bridge" || wsKind === "fsa" ? " on" : "")} onClick={() => setConnOpen(true)} title="Bridge, Ordnerzugriff, IDE-Sprung">
            <span className={"dot " + (wsKind === "bridge" || wsKind === "fsa" ? (live === "getrennt" ? "bad" : "ok") : "")} />Verbindungen
          </button>
          {wsKind === "bridge" && <button className={"btn" + (counts.running ? " on" : "")} onClick={() => { setDTab("run"); setDOpen(true); }} title="Programm ausführen und live verfolgen">{counts.running ? <span className="ldot" /> : "▶ "}Ausführen</button>}
          <span className="vsep" />
          <button className="btn" onClick={() => load(entriesOf(DEMO), "Demo: Anlagensteuerung")}>Demo</button>
          <button className="btn amber" onClick={() => { setBusy({ label: "Erzeuge 1.500 Klassen …", done: 0, total: 0 }); setTimeout(() => { setProject({ id: ++projSeq, name: "Stresstest", rootName: null, ws: memoryWS(), files: new Map(), parsed: synthetic(1500), rev: 0 }); setBusy(null); }, 30); }}>Stresstest</button>
          <span className="vsep" />
          <div className="seg" role="group" aria-label="Zoomstufe">
            {LV.map((l, i) => <button key={i} className={level === i ? "on" : ""} onClick={() => engRef.current.level(i)} title={l.hint}><span className="n">{i}</span><span className="hide-n">{l.name}</span></button>)}
          </div>
          <button className="btn" onClick={() => engRef.current.fit()} title="Alles einpassen (F)">Einpassen</button>
        </div>
        <button className={"btn viewtog" + (simple ? "" : " on")} aria-pressed={!simple} onClick={() => setUi({ ...ui, view: simple ? "adv" : "simple" })}
          title={simple ? "Struktur, Details, Konsole, Ausführen, Plan, Team und Verbindungen einblenden" : "Zurück zur einfachen Ansicht: nur Chat und Diagramm"}><span className="vt-ic" aria-hidden="true"><i /><i /><i /></span>Erweitert</button>
        <button className={"nav-theme" + (setDlg ? " on" : "")} onClick={() => setSetDlg(setDlg ? null : "view")} aria-label="Alle Einstellungen" title="Einstellungen (Strg+,)">⚙</button>
        <button className="nav-theme adv" onClick={nextTheme} aria-label="Theme wechseln" title="Theme">{tIcon}</button>
        <button className="nav-theme adv" style={{ display: narrow ? "flex" : "none" }} onClick={() => { setROpen(!rOpen); setLOpen(false); }} aria-label="Details">ⓘ</button>
        <input ref={fileRef} type="file" multiple hidden onChange={onFiles} />
        <input ref={dirRef} type="file" multiple hidden onChange={onFiles} />
      </header>

      <div className={"main" + (["ki", "plan", "team"].includes(sideTab) ? " ki" : "") + (rFold && !narrow ? " rfold" : "")} style={simple && !narrow ? { "--lw": "min(" + (CHAT_W[ui.chatW] || 440) + "px, 44vw)" } : undefined}>
        {!narrow && <button className={"rtog" + (rFold ? " on" : "")} onClick={() => setRFoldP(!rFold)} title={rFold ? "Details-Leiste einblenden" : "Details-Leiste ausblenden – mehr Platz fürs Diagramm"} aria-label="Details-Leiste umschalten">{rFold ? "‹ Details" : "›"}</button>}
        <aside className={"side l" + (lOpen ? " open" : "")} aria-label="KI und Projektstruktur">
          <div className="side-tabs" role="tablist">
            <button role="tab" aria-selected={sideTab === "ki"} className={sideTab === "ki" ? "on" : ""} onClick={() => setSideTab("ki")}>{openTurn ? <span className="ldot ai" /> : "✦ "}KI{VB_.perms.length ? " · Freigabe" : ""}</button>
            {hasPipe && <button role="tab" aria-selected={sideTab === "plan"} className={sideTab === "plan" ? "on" : ""} onClick={() => setSideTab("plan")} title="Pipeline: Idee → Spezifikation → Plan → Aufgaben → Umsetzen">◆ Plan</button>}
            {hasTeam && <button role="tab" aria-selected={sideTab === "team"} className={sideTab === "team" ? "on" : ""} onClick={() => setSideTab("team")} title="Parallele Agenten in eigenen Git-Worktrees">{teamRef.current.agents.some((a) => a.running) ? <span className="ldot ai" /> : "⇉ "}Team{teamRef.current.agents.length ? " " + teamRef.current.agents.length : ""}</button>}
            <button role="tab" aria-selected={sideTab === "tree"} className={sideTab === "tree" ? "on" : ""} onClick={() => setSideTab("tree")}>Struktur</button>
          </div>
          {sideTab === "ki"
            ? <VibeDock V={VB_} tick={vibeTick} ws={project && project.ws} selLabel={selLabel} draft={draft} setDraft={setDraft} mode={aiMode} setMode={setAiMode} agentId={agentId} setAgentId={setAgentId}
                onSend={sendPrompt} onStop={aiStop} onDecide={aiDecide} onGoTool={goTool} onGoKey={goKey} onCompare={compareTo} onShowChanges={showChanges} onReset={aiReset} onHooks={aiHooks} onUpload={project && project.ws && project.ws.agentUpload ? (f) => project.ws.agentUpload(f) : null}
                skillApi={project && project.ws && project.ws.skills ? project.ws : null} onRun={project && project.ws && project.ws.runPresets && project.ws.runPresets.length ? runNow : null}
                rev={wsRev} opt={vopt} setOpt={setVopt} cmdHint={cmdHint} cnt={cnt} onReplay={startReplay} permImpact={permImpact} />
            : sideTab === "plan" && hasPipe ? <div className="side-sc">{pipe ? <PipelinePanel P={pipe} running={!!VB_.running} hasAgent={hasAgent} chain={chain} setChain={setChain} onSave={savePipe} onPrompt={sendPrompt} onShow={showTask} /> : <div className="hint" style={{ padding: 14 }}>lädt …</div>}</div>
            : sideTab === "team" && hasTeam ? <div className="side-sc"><TeamPanel T={teamRef.current} tick={teamTick} model={model} onStart={teamStart} onSend={teamSend} onStop={(id) => teamOp("stop", { id })} onMerge={teamMerge} onDiscard={teamDiscard} onDiff={teamDiffShow} onDecide={(id, pid, allow) => teamOp("decide", { id, pid, allow })} onGo={teamGo} /></div>
            : <Sidebar budget={budget} setBudget={setBudget} model={model} sel={sel} q={q} setQ={setQ} onPick={pick} onModule={pickModule} types={types} setTypes={setTypes} pat={pat} setPat={setPat} grouping={grouping} setGrouping={setGrouping} />}
        </aside>
        <div className="center">
          <section className="stage" aria-label="Klassendiagramm">
            <canvas className="cv" ref={cvRef} />
            <canvas className="cv ovl" ref={ovRef} aria-hidden="true" />
            <div className="ov" style={{ left: 12, top: 10 }}>{LV[level].name.toUpperCase()} · {LV[level].hint}</div>
            <div className="ov stats" ref={statsRef} style={{ left: 12, top: 26 }} />
            {hasCp && <ChangeBar cnt={cnt} baseLabel={baseLabel} layerOn={layerOn} setLayerOn={setLayerOn} only={onlyChg} setOnly={setOnlyChg} follow={vopt.follow} setFollow={(v) => setVopt({ ...vopt, follow: v })}
              onOpen={showChanges} ai={aiNow} hasAgent={hasAgent} />}
            {replay && <ReplayBar R={replay} onPlay={() => setReplay((r) => r && { ...r, playing: !r.playing, i: !r.playing && r.i >= r.steps.length - 1 ? 0 : r.i })} onStep={(i) => setReplay((r) => r && { ...r, i, playing: false })} onSpeed={(v) => setReplay((r) => r && { ...r, speed: v })} onClose={() => setReplay(null)} />}
            {impact && !replay && (
              <div className="impbar">
                <span className="ik">◎ {impact.label}</span>
                <span>{impact.n} abhängige Stelle{impact.n === 1 ? "" : "n"} · {impact.files} Datei{impact.files === 1 ? "" : "en"}{impact.tests ? " · " + impact.tests.length + " betroffene Test" + (impact.tests.length === 1 ? "" : "s") : impact.tests === null ? "" : " · keine Tests"}</span>
                {impact.tests && impact.tests.length > 0 && <button className="btn sm" onClick={() => testRun("", { only: impact.tests })}>▶ betroffene Tests</button>}
                <button className="btn sm" onClick={() => setImpact(null)} aria-label="Wirkungsbereich ausblenden">✕</button>
              </div>
            )}
            {selC && <div className="ov" style={{ right: 12, top: 10, color: "var(--accent)" }}>{selC.name}{sel.m ? " › " + (sel.m.t === "f" ? selC.fields[sel.m.i]?.name : selC.methods[sel.m.i]?.name + "()") : ""}</div>}
            <div className="hud">
              {pip && model && <AgentPip pip={pip} model={model} V={VB_} tick={vibeTick} layer={layerOn && changes && !changes.empty ? { ...changes.layer, only: false } : null}
                onJump={pipJump} onClose={() => setPip(null)} onHold={(h) => { pipHold.current = h; }} />}
              <div className="ladder">
                {[3, 2, 1, 0].map((i) => (
                  <button key={i} className={level === i ? "on" : ""} onClick={() => engRef.current.level(i)}>
                    <span className="bar" style={{ width: 6 + i * 3.4 }} /><span><span className="t">{i} {LV[i].name}</span><span className="h">{LV[i].hint}</span></span>
                  </button>
                ))}
              </div>
              <div className="zrow">
                <button className="btn sm" onClick={() => engRef.current.zoom(1 / 1.6)} aria-label="Herauszoomen">−</button>
                <button className="btn sm" onClick={() => engRef.current.zoom(1.6)} aria-label="Hineinzoomen">+</button>
                <button className="btn sm" onClick={() => engRef.current.fit()}>⤢</button>
              </div>
            </div>
            <canvas className="minimap" ref={miniRef} aria-label="Übersichtskarte" />
          </section>
          <Drawer open={dOpen} setOpen={setDOpen} tab={dTab} setTab={setDTab} height={dH} setHeight={setDH} counts={counts}>
            {dTab === "changes" && <ChangesTab ws={project && project.ws} base={base} changes={changes} cps={cps.list} baseSel={baseSel} setBaseSel={setBaseSel} files={files} model={model} busy={cmpBusy}
              onGoKey={goKey} onGoLink={goLink} onEdit={editAt} onExt={openExt} onRestore={restoreTo} onCheckpoint={makeCp} pick={chgPick} setPick={setChgPick} undo={undoSnap} onUndo={undoRestore} />}
            {dTab === "run" && <RunTab ws={project && project.ws} rev={wsRev} L={liveRef.current} tick={liveTick} onStart={runStart} onStop={runStop} onStdin={runStdin} onReset={runReset} onGo={runGo} onCtl={runCtl} onBpClear={bpClear} />}
            {dTab === "tests" && <TestsTab T={testRef.current} tick={testTick} info={testInfo} sel={testSel} onSel={pickTest} onRun={testRun} onStop={testStop}
              onEdit={editAt} onPickFn={pickFnAt} onAskAI={hasAgent ? askTests : null} hasAgent={hasAgent} auto={vopt.autoTest} setAuto={(v) => setVopt({ ...vopt, autoTest: v })} />}
            {dTab === "ana" && <AnalysisTab M={model} V={VB_} vtick={vibeTick} ws={project && project.ws} sub={anaSub} setSub={setAnaSub} heat={heat} setHeat={setHeat} rules={rules} saveRules={saveRules} ev={ruleEval}
              onPick={(t) => engRef.current && engRef.current.select({ id: t.id, m: t.m || null }, t.m ? 3 : 2)} onEdit={editAt} testInfo={testInfo} notify={notify} />}
            {dTab === "editor" && <CodeEditor files={files} writable={!!project} wsLabel={project ? project.ws.label : ""} req={editReq} diags={diag && diag.items} hlRange={hlRange}
              onSave={saveFile} onExt={openExt} onLocate={locateAt} extLabel={extLabel} notify={notify} />}
            {dTab === "files" && <FilesTab files={files} onEdit={editAt} onExt={openExt} />}
            {dTab === "search" && <SearchTab files={files} ws={project && project.ws} onEdit={editAt} onExt={openExt} />}
            {dTab === "problems" && <ProblemsTab ws={project && project.ws} rev={wsRev} diag={diag} model={model} building={building} runBuild={runBuild}
              setPasted={(t) => setDiagRaw({ items: parseDiagnostics(t), log: t, src: "Eingefügte Ausgabe" })} clear={() => setDiagRaw(null)} onGo={goDiag} onExt={openExt} onAskAI={hasAgent ? askFix : null} />}
            {dTab === "symbols" && <SymbolsTab model={model} onPick={pick} onEdit={editAt} />}
            {dTab === "export" && <ExportTab model={model} project={project} sel={sel} files={files} png={() => engRef.current.png()} />}
          </Drawer>
        </div>
        <Panel model={model} sel={sel} files={files} onPick={(id) => pick(id)} onMember={pickMember} open={rOpen} onEdit={editAt} onExt={openExt} extLabel={extLabel}
          diag={diag} live={liveRef.current} liveTick={liveTick} onLiveGo={runGo} onBp={project && project.ws && project.ws.runCtl ? bpToggle : null} onCtl={runCtl} onImpact={showImpactSel} />
      </div>

      <footer className="status">
        <span><span className={wsKind === "bridge" || wsKind === "fsa" ? (live === "getrennt" ? "bad" : "acc") : "mut"}>●</span> {project ? project.name : "—"}</span>
        <span className="hide-s">{project ? (wsKind === "bridge" ? "Bridge" : wsKind === "fsa" ? "Ordnerzugriff" : "Upload") + (live ? " · " + live : "") : ""}</span>
        {model && <><span className="hide-s">Dateien <b>{de(files.size || model.fileCount)}</b></span><span>Knoten <b>{de(model.classes.length)}</b></span><span className="hide-s">Kanten <b>{de(model.edges.length)}</b></span></>}
        {diag && <span className={nErr ? "bad" : nWarn ? "am" : "ok"}>{nErr} Fehler · {nWarn} Warn.</span>}
        <span className="sp" />
        <span className="hide-s">Stufe <b className="acc">{level} · {LV[level].name}</b></span>
        <span>Zoom <b ref={zoomRef}>—</b></span>
        {openTurn && <span className="acc hide-s">✦ {short(aiNow, 60)}</span>}
        <span className="hide-s">CodeAtlas Compile v5.0</span>
      </footer>

      {drag && <div className="drop">Ordner, Dateien oder ZIP hier ablegen</div>}
      {busy && <div className="busy"><div className="box">{busy.label}{busy.total > 0 && <> <b style={{ color: "var(--accent)" }}>{de(busy.done)}/{de(busy.total)}</b></>}
        <div className="pb"><i style={{ width: busy.total ? (busy.done / busy.total) * 100 + "%" : "35%" }} /></div></div></div>}
      {diffM && <DiffModal d={diffM} onClose={() => setDiffM(null)} />}
      {setDlg && <SettingsDialog tab={setDlg} setTab={setSetDlg} ui={ui} setUi={setUi} theme={theme} setTheme={setTheme} opt={vopt} setOpt={setVopt} V={VB_} ws={project && project.ws}
        agentId={agentId} setAgentId={setAgentId} onHooks={aiHooks} skillApi={project && project.ws && project.ws.skills ? project.ws : null} project={project} wsKind={wsKind} live={live}
        act={{ open: () => (canSwitch ? setProjOpen(true) : dirRef.current.click()), conn: () => setConnOpen(true), files: () => fileRef.current.click(), paste: () => setPaste({ text: "", name: "eingefuegt.c" }),
          demo: () => load(entriesOf(DEMO), "Demo: Anlagensteuerung"),
          stress: () => { setBusy({ label: "Erzeuge 1.500 Klassen …", done: 0, total: 0 }); setTimeout(() => { setProject({ id: ++projSeq, name: "Stresstest", rootName: null, ws: memoryWS(), files: new Map(), parsed: synthetic(1500), rev: 0 }); setBusy(null); }, 30); } }}
        onClose={() => setSetDlg(null)} />}
      {projOpen && project && project.ws && project.ws.projRecent && <ProjectDialog ws={project.ws} onOpen={openProject} onClose={() => setProjOpen(false)}
        onBrowserFolder={() => { setProjOpen(false); dirRef.current.click(); }} />}
      {connOpen && <ConnDialog onSwitch={canSwitch ? () => { setConnOpen(false); setProjOpen(true); } : null} conn={conn} setConn={setConn} ws={project && project.ws} project={project} onBridgeLoad={loadBridge} onFsa={loadFsa} onClose={() => setConnOpen(false)}
        test={() => { const f = [...files.values()].find((e) => e.kind === "code"); if (f) openExt(f.path, 1, 1); }} />}
      {paste && (
        <div className="modal" onClick={(e) => e.target === e.currentTarget && setPaste(null)}>
          <div className="box">
            <div className="kicker">Code einfügen</div>
            <div className="row">
              <input className="txt" style={{ flex: 1, minWidth: 160 }} value={paste.name} onChange={(e) => setPaste({ ...paste, name: e.target.value })} placeholder="dateiname.c" />
              <select className="txt" style={{ width: "auto" }} value={extOf(paste.name)} onChange={(e) => setPaste({ ...paste, name: paste.name.replace(/\.[^.]*$/, "") + "." + e.target.value })}>
                {["c", "h", "cpp", "ts", "js", "java", "cs", "py", "go", "rs", "kt", "swift", "php", "st", "sql", "rb", "lua", "sh"].map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
            </div>
            <textarea className="txt" value={paste.text} onChange={(e) => setPaste({ ...paste, text: e.target.value })} placeholder="Quelltext …" spellCheck={false} />
            <div className="hint">Die Dateiendung bestimmt die Sprache.</div>
            <div className="row" style={{ justifyContent: "flex-end" }}>
              <button className="btn" onClick={() => setPaste(null)}>Abbrechen</button>
              <button className="btn primary" disabled={!paste.text.trim()} onClick={() => { const p = paste; setPaste(null); load([{ path: p.name || "eingefuegt.c", text: p.text, size: p.text.length, kind: "code", encoding: "utf-8", eol: "\n", mtime: Date.now() }], p.name); }}>Visualisieren</button>
            </div>
          </div>
        </div>
      )}
      <Toast t={toast} />
    </div>
  );
}
