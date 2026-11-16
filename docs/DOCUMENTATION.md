# CodeAtlas Compile – Documentation

Version: 16 Nov 2026 · Interface 5.1 · Bridge 2.1

CodeAtlas Compile is a "compiler for vibe coding". You describe what should be built or changed, Claude Code implements it, and you watch live in the diagram what happens:

- **what the AI reads, edits and runs**,
- **what is added, changed or removed** – down to the individual function and variable,
- **which connections appear and where** (calls, variable access, includes, inheritance …),
- **how the program behaves afterwards** (running with live tracing),
- **and planned instead of blind:** Claude queries the graph, works through a pipeline, the quality gate checks before "done", several agents work in parallel (chapter 4A).

You can step in at any time: change values and code in the editor, start build and program by hand, reset everything.

The interface is available in German and English (⚙ → *View* → *Language*; default: browser language). This documentation describes the English interface.

---

## Contents

1. [Quick start](#1-quick-start)
2. [Architecture: bridge and interface](#2-architecture-bridge-and-interface)
3. [The interface at a glance](#3-the-interface-at-a-glance)
4. [Vibe coding with Claude Code](#4-vibe-coding-with-claude-code)
4A. [Planned vibe coding: graph, pipeline, quality gate, team](#4a-planned-vibe-coding-graph-pipeline-quality-gate-team-since-40--bridge-20)
5. [Seeing changes: the change layer](#5-seeing-changes-the-change-layer)
6. [Checkpoints, comparing and resetting](#6-checkpoints-comparing-and-resetting)
7. [The diagram](#7-the-diagram)
8. [Right panel: details](#8-right-panel-details)
9. [Console: the tabs at the bottom](#9-console-the-tabs-at-the-bottom)
10. [Build, run, live trace and tests](#10-build-run-live-trace-and-tests)
11. [Following Claude Code in the terminal (hooks)](#11-following-claude-code-in-the-terminal-hooks)
12. [What is stored where](#12-what-is-stored-where)
13. [Security](#13-security)
14. [Bridge start options](#14-bridge-start-options)
15. [Bridge interface (HTTP)](#15-bridge-interface-http)
16. [Supported languages](#16-supported-languages)
17. [Building the interface yourself](#17-building-the-interface-yourself)
18. [Keyboard shortcuts](#18-keyboard-shortcuts)
19. [Limitations, known issues, open work](#19-limitations-known-issues-open-work)
20. [Troubleshooting](#20-troubleshooting)

---

## 1. Quick start

**Requirements**

- Python 3.8 or later (standard library only, no packages needed)
- Claude Code, signed in once in a terminal with `claude`
- Edge or Chrome (for the own window; otherwise any browser)

**Start**

```
python codeatlas_bridge.py "C:\path\to\project" --desktop
```

On Windows you can also drag the project folder onto `CodeAtlas-starten.bat` (or double-click it and enter the path). `CodeAtlas.html` must sit next to `codeatlas_bridge.py`.

Without `--desktop` the bridge prints the address in the terminal (line "App", including the token). With `--open` it opens the default browser.

**First request**

1. The chat with Claude Code is on the left.
2. Choose a mode: **Plan**, **Ask** or **Edit**.
3. Type the request, **Enter** (Shift+Enter = new line).
4. Watch: the steps run on the left, the spots where the AI works light up in the diagram.
5. Afterwards: **Δ compare** below the request and the **Δ Changes** tab show what changed. **▶ run** starts the program.

An empty folder works too – Claude Code creates the files and the diagram fills up live.

### 1.1 Opening another project (since 3.8 / bridge 1.11)

The bridge does not need to be restarted: **Open project** at the top (or **Ctrl+O**) sends the new path to the bridge.

- **Browse …** opens the operating system's normal folder dialog (Windows Explorer dialog, Finder dialog on the Mac). It appears on the bridge's computer and may be behind the browser window.
- Or **type** / paste the path and press **Enter**.
- **Recently opened:** the last 12 projects (stored in `~/.codeatlas_recent.json`).
- **Browse folders:** built-in folder browser (↑ parent, ⌂ home folder, drives). Click selects, double-click or → goes into it, **Open** opens it. Folders containing `.git`, `.cbp`, `pyproject.toml`, `package.json`, `CMakeLists.txt` or `Makefile` carry the label **Project**. It also works when Python has no tkinter (then only *Browse …* is missing).

When switching, the bridge rebuilds everything for the new folder – same address, same token – and the interface reloads the project after about a second. If an AI request or a program is running, the dialog asks first (**Switch anyway** stops both). The AI history and the checkpoints belong to each project (`.codeatlas/` in the project folder) and are back when you switch back.

For security reasons switching only works on the bridge's own computer (access via 127.0.0.1), not over VPN/network. Without the bridge the button opens a folder in the browser (view only).

---

## 2. Architecture: bridge and interface

```
┌──────────────────────────┐   HTTP + event streams (SSE)    ┌──────────────────────────────┐
│ Interface                │ ◄─────────────────────────────► │ Bridge (codeatlas_bridge.py) │
│ CodeAtlas.html (React)   │   127.0.0.1 only, with token    │ Python, standard library only │
│ diagram, AI history,     │                                 │ files, build, running,        │
│ changes, editor          │                                 │ checkpoints, Claude Code      │
└──────────────────────────┘                                 └──────────────┬───────────────┘
                                                                            │ starts / follows
                                                     ┌──────────────────────┴───────────────┐
                                                     │ claude -p … --output-format stream-json│
                                                     │ (or Claude Code in a terminal + hooks)│
                                                     └────────────────────────────────────────┘
```

**Bridge** (`codeatlas_bridge.py`) – the local core:

- reads the project folder, watches file changes and reports them to the interface,
- starts build and program (only configurations fixed in advance, "presets only"),
- writes files (one by one or as a patch across several files, all or nothing),
- creates checkpoints and resets to them,
- starts Claude Code, translates its event stream into understandable steps and handles approvals,
- serves the interface (`CodeAtlas.html`).

**Interface** (`CodeAtlas.html`, built from `src/CodeAtlasLab.jsx`):

- analyses the source heuristically (patterns, not real compiler parsers) and builds the model from it: units, functions, variables, connections,
- draws the diagram on a canvas (one layer for the diagram, one overlay for live effects),
- compares models (before/after) and shows the differences,
- also works in a limited way without the bridge (open the file directly, load a folder/ZIP, paste code) – then without AI, build and live watching.

**Why the file system is the truth:** Claude Code does not always change files through its Edit tool, often also through shell commands. That is why the atlas reads changes from the file system (checkpoint before ↔ current state), not from the tool messages. It uses the messages only to show *where the AI is working right now*.

---

## 3. The interface at a glance

### 3.0 Two views: Simple and Advanced (since 5.0)

The atlas starts in the **simple view**: the chat with Claude Code on the left, the diagram with all functions on the right – nothing else.

```
┌ CodeAtlas · ● project name ▾                                   [Advanced]  ⚙ ┐
├───────────────────────┬──────────────────────────────────────────────────────┤
│ Chat                  │                                                      │
│ history, approvals,   │                    Diagram                           │
│ input field           │  zoom levels                             overview    │
└───────────────────────┴──────────────────────────────────────────────────────┘
```

- **Project name** at the top opens the "Open project" dialog.
- **Advanced** (top right) shows everything else: the Plan, Team and Structure tabs, the details panel, the console (Changes, Run, Tests, Analysis, Editor …), the tool buttons (Connections, Run, Files/ZIP, Paste code, Demo) and the status bar. A second click goes back. The choice is remembered.
- If you need something from the console in the simple view – e.g. via "Δ compare" below a request or the K key – it **opens** and disappears again when you close it with ▾.
- While the AI is working, a light bar runs below the header, and next to it you see what it is doing.

### 3.0.1 Settings (⚙ top right or Ctrl+,)

| Section | Contents |
|---|---|
| **View** | Simple/Advanced, language (German/English), colour scheme (dark/light/system), accent colour (teal, lime, pink, ice blue – also applies to the diagram), chat width, overview map, zoom level bar, animations |
| **AI** | agent, effort, camera follows the AI, selection as context, follow Claude Code in the terminal, account |
| **Automation** | check build, return build errors, tests after every request, quality gate (tests/build/rules), commit per request, project map in CLAUDE.md |
| **Project** | open project, connections, files/ZIP, paste code, demo, stress test |
| **Keyboard** | all keyboard shortcuts |

The AI and automation switches are the same as under ⚙ in the AI panel of the advanced view; both places change the same value. They are stored in the browser (`cal-ui`, `cal-vopt`, `cal-theme`, `cal-lang`).

### 3.1 Advanced view

```
┌ Header: logo · ✦ AI · Open project · Files/ZIP · Paste code · Connections · Run · Demo · zoom levels · Advanced · ⚙ · theme ┐
├──────────────┬─────────────────────────────────────────────────────────────┬─────────────────┤
│ Left panel   │ Bar: Δ since … · counters · Highlight · Only Δ · Follow AI  │ Right panel     │
│ ✦ AI         │                                                             │ details of the  │
│ Structure    │                 Diagram                          [›]        │ selection       │
│              │                                                             │ (collapsible)   │
│              │ zoom ladder                                 minimap         │                 │
│              ├─────────────────────────────────────────────────────────────┤                 │
│              │ Console: Δ Changes · Run · Editor · Files · …               │                 │
├──────────────┴─────────────────────────────────────────────────────────────┴─────────────────┤
│ Status bar: project · connection · files · nodes · edges · level · zoom · version           │
└────────────────────────────────────────────────────────────────────────────────────────────┘
```

- **Left panel:** tabs **✦ AI** (requests, history, approvals), **◆ Plan**, **⇉ Team** and **Structure** (file tree, search, filters).
- **Centre:** the diagram. Above it the change bar, at the bottom left the zoom ladder, at the bottom right the minimap.
- **Right panel:** details of the selection. Sections collapse by clicking their heading, the whole panel via **›** at the top right of the diagram.
- **Console at the bottom:** tabs for Changes, Run, Tests, Analysis, Editor, Files, Search, Problems, Symbols, Export. The **K** key opens and closes it.
- **Narrow windows (≤ 900 px):** the side panels become drawers, reachable via the buttons in the header.
- **Colour scheme:** dark, light or automatic (button on the right of the header).

---

## 4. Vibe coding with Claude Code

### 4.1 Making a request

In the **✦ AI** tab:

- **Input field:** what should be built or changed? **Enter** sends, **Shift+Enter** makes a new line. The **I** key jumps into the field from anywhere.
- **Context:** if something is selected in the diagram (unit, function, variable), "Context: …" appears below the field. When sending, a line is prepended to the request, e.g. `[Context from the diagram: function tor_zyklus in src/tor.c, line 23]`. That way "make this faster" refers to exactly this spot. **×** removes the context.
- **Send / Stop:** while a request is running, **➤ Send** and **■ Stop** sit side by side. Stop interrupts Claude Code (gently first, then hard).

### 4.1a Messages while it works

As in the terminal you can write to Claude Code while it is working – e.g. "use a function instead of a macro" or "don't touch io.c".

- Just type in the field and press **Enter**. The message appears in the history with a violet border.
- Status below it: *sent to Claude Code – picked up at the next step …* → **✓ picked up by Claude Code**. Claude Code takes it into account in the same request; no new request is created.
- If the message arrives only when the request is already finishing, it automatically becomes the **next request** in the same session ("runs as the next request").
- On **Stop**, waiting messages are discarded (note in the history).

How it works: the bridge starts Claude Code with `--input-format stream-json --replay-user-messages`. The input stays open during the request; every message goes in as another user message. Claude Code confirms with a "replay" acknowledgement when it has picked it up. The bridge closes the request only when all sent messages are acknowledged and the result is there – then it closes the input and Claude Code exits.

### 4.1b Attaching images and files

- **📎** next to Send, **drag** files into the input field, or paste an image with **Ctrl+V** (e.g. a screenshot).
- Attachments appear as cards above the field (images with a preview, ✕ removes them) and are uploaded to the bridge right away. Sending works as soon as the upload is done; even without text.
- Works for new requests and for messages while it works.
- **Images** (PNG, JPEG, GIF, WebP up to about 3.7 MB) are given to Claude Code **directly as an image** – so it really sees them.
- **All files** (also PDFs, data sheets, logs, larger images) are stored under `.codeatlas/uploads/` in the project; the request contains a note with the path, and Claude Code reads them with its Read tool (which can also read PDFs).
- At most 10 MB per file, up to 20 attachments per message. File names are sanitised.
- Attachments do not count as project changes and do not end up in the checkpoints.
- Preview images in the history exist only in the running session; after a reload the file name is shown instead.

### 4.1c Choosing and creating skills

Claude Code uses skills by itself when their description matches the request. With the picker you can specify a skill explicitly.

**Choosing**

- **／** next to the paper clip opens the list – or simply type **/** at the start of the input field (as in Claude Code) and keep typing, the list filters along.
- Grouped by **Project**, **Personal**, **Plugins** and **Built-in**, with a description. Search via the field at the top, **↑↓** and **Enter** to choose, **Esc** closes.
- Chosen skills appear as cards above the input field (✕ removes, **Backspace** in the empty field removes the last one).
- When sending, the first skill is placed at the start as `/name` – so Claude Code invokes it directly, your text after it is its arguments. Further skills are added as a note "Also use the skill …". For messages while it works, all are added as a note in the text.
- Commands (`.claude/commands/*.md`) appear with the label "Command" and their argument hint if any.
- When Claude Code uses a skill, the history shows **✦ uses skill /name**.

**Where the list comes from**

| Location | Path | editable |
|---|---|---|
| Project | `<project>\.claude\skills\<name>\SKILL.md`, commands in `.claude\commands\` | yes |
| Personal | `%USERPROFILE%\.claude\skills\<name>\SKILL.md`, commands in `%USERPROFILE%\.claude\commands\` | yes |
| Plugins | from `%USERPROFILE%\.claude\plugins\installed_plugins.json` and the plugin paths Claude Code reports at start-up | view only |
| Built-in | names Claude Code reports at start-up, without a file of their own | no |

The bridge re-reads the files every time the list opens (↻ forces it). It also remembers which skills Claude Code reported as active at its last start (`.codeatlas\claude-init.json`). Before the first request built-in skills may therefore be missing; skills Claude Code did not report (e.g. a disabled plugin) are marked "inactive".

**Creating** – "＋ New skill" at the bottom of the list:

- **Name** (becomes `/name`; lowercase letters, digits, hyphens), **location** (project or personal), **when to use it?** (the description – Claude Code decides from it when to use the skill) and the **instructions** in Markdown.
- **Create** writes `…\skills\<name>\SKILL.md` with a YAML header right away. An existing skill is not overwritten.
- **✦ Let Claude Code write it** sends a request instead: Claude Code writes the skill from your idea itself (using a skill creator if available). You watch it live in the history.

**Editing** – ✎ on a project or personal skill opens the complete SKILL.md for editing; 👁 shows plugin skills read-only.

### 4.1d Model and effort

- **Model:** picker next to the modes – *Default*, *Fable*, *Opus*, *Sonnet*, *Haiku* or *Custom …* (full model name, e.g. `claude-opus-5-5`). Applies from the next request, also in the middle of a session; Claude Code continues the history with the new model.
- *Default* means: the model from the bridge start option `--model` (then shown in brackets), otherwise Claude Code's default.
- **Effort** (⚙ → Effort): *default*, low, medium, high, very high, maximum – how thoroughly Claude Code thinks (`--effort`).
- Every request shows in its header the model Claude Code actually reported (e.g. `haiku-5-5 · low`).
- Technically: `--model <name>` and `--effort <level>` when starting Claude Code. Only model names made of letters, digits and `. _ - : [ ]` are allowed.

### 4.1e Account

Under ⚙ → **Account (Claude Code)** you see whether and how Claude Code is signed in: email, organisation and plan (as far as Claude Code reports them), otherwise sign-in method and provider.

- **Sign in again / Sign in:** choose *Claude subscription* (Pro, Max, Team …) or *Console* (billed by API usage). Claude Code opens the sign-in page in the browser; **Open sign-in page ↗** does it by hand. If the page shows a code, paste it into the field and click **Send**. You can cancel at any time; after 15 minutes the bridge cancels by itself.
- **Sign out** (with confirmation) – not while a request is running.
- ↻ refreshes the status.

Technically the bridge calls the official commands `claude auth status --json`, `claude auth login [--claudeai|--console]` and `claude auth logout`. Credentials stay with Claude Code; the bridge only sees the status information and passes the code on to `claude auth login`.

### 4.2 The three modes

| Mode | What Claude Code may do | When it makes sense |
|---|---|---|
| **Plan** | only read and present a plan, no changes | before larger rebuilds; afterwards **Implement plan** appears |
| **Ask** | every file change and every command needs your approval | delicate spots, unfamiliar code, when you want to see every step |
| **Edit** | change files freely; shell commands need your approval | normal work |

Technically: Plan = `--permission-mode plan`, Edit = `--permission-mode acceptEdits`, Ask = no mode (every action triggers an approval request).

**▶ Implement plan** sends the follow-up request "Implement the presented plan now." in the same session in the Edit mode. Alternatively, write change requests for the plan below.

### 4.3 Approvals

When Claude Code wants to do something that needs your consent, an **approval card** appears in the history:

- shows the tool and its content (command, file, old/new text),
- **Allow** / **Decline**,
- **Always** remembers the kind for the running bridge session, e.g. `Bash:make` (all `make` calls) or a tool,
- without an answer it is declined automatically after 5 minutes.

How it works: the bridge starts Claude Code with its own settings file (`.codeatlas/agent-settings.json`) that registers a `PermissionRequest` hook. When Claude Code wants to do something that needs approval, it calls the hook; the hook asks the bridge and waits until you have decided in the interface.

### 4.4 The history

Every request is a block with number, agent, mode, time and your request text. Inside, in chronological order:

| Line | Meaning |
|---|---|
| ◉ **reads** `file` · line a–b | Claude Code reads a file |
| ⌕ **searches** `pattern` | search in the project |
| ✎ **edits** `file` · line … | change to an existing file, with a mini diff (expand ▸) |
| ✚ **writes** `file` | new file or completely rewritten |
| ▸ **runs** `command` | shell command, with description and output (expandable) |
| **Δ** + `name()` ~ `name()` − `name()` | change-layer note: what actually changed in the model, plus new connections |
| Text | answers from Claude Code (Markdown: bold, `code`, lists) |

**Clicking a step** jumps to the spot in the diagram and, for changes, opens the file's diff. Clicking a Δ note shows the unit.

At the end of every request there is a summary: **✓ done** / **cancelled** / **error**, number of steps, duration, estimated costs, declined approvals. Plus:

- **▶ run** – start the program with live tracing (only after the last successful request, if a run configuration exists),
- **Δ compare** – compare diagram and change list with the state *before this request*,
- **▶ replay** – replay the request step by step over the diagram.

While Claude Code works, the header of the history shows the state: *asking*, *thinking*, *working* with details.

### 4.5 Sessions

- The next request continues the running Claude Code session (`--resume`), so Claude Code knows the previous history. The header then shows "ready · with history".
- **New** starts a fresh session and clears the history in the interface.
- The history survives reloading the page (the bridge replays it), but not quitting the bridge (see [section 12](#12-what-is-stored-where)).

### 4.6 Settings (⚙ in the AI panel)

| Setting | Effect |
|---|---|
| **Agent** | choice, if further agents are set up with `--agent` (e.g. Claude Code with Haiku) |
| **Camera follows the AI** | the camera moves to where the AI works – once per step, at most every 2.5 s; pauses while you pan, zoom or move the mouse over the diagram yourself (5 s). See 5.4 |
| **Send the diagram selection as context** | automatically prepend the diagram selection to the request |
| **Check the build after every request** | starts the chosen build configuration after a successful request |
| **Return build errors to the AI automatically** | on build errors, automatically send a fix request (repair loop, at most 3 attempts, then stop) |
| **Quality gate** | check tests (affected) / build / architecture rules before "done", see 4A.5 |
| **Commit after every request** | Git commit per request with changes, see 4A.9 |
| **Keep the project map in CLAUDE.md up to date** | see 4A.8 |
| **Follow Claude Code in the terminal** | register/remove hooks in `.claude/settings.local.json` (see [section 11](#11-following-claude-code-in-the-terminal-hooks)) |

The settings are remembered in the browser.

### 4.7 Sending errors to the AI

In the **Problems** tab, **✦ Send errors to AI** passes the current compiler errors to Claude Code as a request (file, line, message, with the request to change only what is needed). This is the same text the automatic repair loop uses.

### 4.8 What happens in the background (course of a request)

1. The interface sends `POST /api/agent/start` with agent, request, mode and language.
2. The bridge creates a **checkpoint** (state of all text files) – named after the request.
3. The bridge starts `claude -p --output-format stream-json --verbose --include-partial-messages --input-format stream-json --replay-user-messages [--permission-mode …] [--resume <id>] --settings .codeatlas/agent-settings.json`. The request (text + images) goes in as a JSON message via standard input, which stays open for messages while it works.
4. Every line of the event stream is translated into a normalised event (`turn`, `text`, `tool`, `perm`, `status`, `note`, `idle`) and sent to the interface via `GET /api/agent/events`.
5. The interface shows the steps, sets focus points in the diagram (where does the AI read/edit?) and reloads changed files as soon as the file watcher reports them.
6. After every reload it compares the old and new model → Δ notes, highlights, new connections.
7. At the end: summary, the file watcher is triggered right away, build/run configurations are detected again (new files!), optionally build and repair loop.

---

## 4A. Planned vibe coding: graph, pipeline, quality gate, team (since 4.0 / bridge 2.0)

From version 4 on, Claude no longer works just *under* the atlas but *with* it: the diagram, the test mapping, rules and plans are available to Claude as tools, and the atlas checks results before Claude may report "done".

### 4A.1 The graph as a tool for Claude

After every rebuild the interface sends the diagram (units, functions, callers/callees, lines) to the bridge (`POST /api/graph`, stored in `.codeatlas/graph.json`). With it, the MCP server `codeatlas` offers Claude:

| Tool | Returns |
|---|---|
| `atlas_orient` | overview: modules, central units, entry points, test situation – instead of reading many files |
| `atlas_find` | find a symbol (name, partial name, `file:line` or a line from a stack trace) |
| `atlas_impact` | impact: who depends (in levels) on a function, which files, **which tests** |
| `atlas_trace` | call path from A to B |
| `atlas_read` | source of exactly one function + its callers and callees |
| `atlas_rules` | architecture rules and current violations |
| `plan_get`, `plan_set_spec`, `plan_set_plan`, `plan_set_tasks`, `plan_task_update` | read and fill the pipeline (4A.3) |
| `tests_run` with `betroffene` | only the tests that execute changed code |

Claude is told in the system prompt to use these tools before reading whole files (in English when the interface is set to English). Without the interface (terminal only) the last graph sent is in `graph.json`; if it is outdated, the tool says so.

### 4A.2 Impact and affected tests

- **Right panel → ◎ Impact of …** colours all dependent spots in the diagram (level 1 strong, further levels paler) and shows a bar at the top "n dependent spots · m files" with the affected tests.
- **Approval card:** when Claude wants to change a file, the approval shows how many spots depend on it and which tests it affects.
- **Test mapping:** on every test run the bridge remembers which test executes which functions (`.codeatlas/test-map.json`). "Tests after every request" and the quality gate then only run the affected tests; while the mapping is still empty, all run. If no test touches the change, the run is skipped with a note; if Claude wrote a new test file, all tests run.

### 4A.3 Pipeline: idea → specification → plan → tasks → implement

The **◆ Plan** tab on the left. You write the idea; Claude creates the specification, the plan and the tasks one after another and saves them via the plan tools (`.codeatlas/pipeline.json`). You approve each stage, revise it with a note or edit it yourself. Tasks have files, symbols, dependencies and a check; clicking a task shows its spots in the diagram.

- **▶ Next** implements the next open task (Edit mode). Claude sets the status itself (in progress → done/blocked with a note).
- **all in a row** automatically starts the next task after each finished one and stops on errors or blocked tasks.
- **Start over** clears the pipeline.

### 4A.4 Architecture rules

**Console → ◈ Analysis → Rules & cycles**: rules of the form "pattern ↛ pattern" (module/folder, file or glob, e.g. `src/gui ↛ src/db`). The atlas checks them on every rebuild, shows violations with file/line under **Problems** and finds dependency cycles between modules. Stored in `.codeatlas/rules.json`; Claude reads them via `atlas_rules`.

### 4A.5 Quality gate (stop hook)

⚙ → **Quality gate**: tests (affected), build, architecture rules – each can be switched off. When Claude wants to finish the request, Claude Code calls the stop hook; the bridge checks what you selected. If something fails, Claude gets the report (failed tests with location, build errors, rule violations) and keeps working – at most 3 rounds, then the gate gives up and says so. In the history the rounds appear as entries "QUALITY GATE · round n" with an expandable report.

### 4A.6 Team: parallel agents in Git worktrees

The **⇉ Team** tab (the project must be a Git repository with at least one commit). Every further agent gets its own worktree under `.codeatlas/team/<name>` on the branch `atlas/<name>` – starting either from the current state (including uncommitted changes) or from the last commit.

- Its steps appear in the diagram **in its colour**; you answer its approvals in its card.
- The card shows changed files, costs and **conflicts** (a file also changed by another agent or in the main project).
- **Δ Changes** shows the diff, **⇢ Merge** commits in the worktree and merges with `--no-ff`. If there are conflicts, the merge is aborted and the main project stays unchanged; the conflicting files are named. **✕ Discard** removes worktree and branch.
- Team agents have no atlas tools (the graph belongs to the main project).

### 4A.7 Replaying requests

Below every finished request, **▶ replay** starts a playback: the steps run one after another over the diagram (the camera follows), with a bar for pause, single step, speed (1×, 2×, 4×) and stop.

### 4A.8 Analysis: costs, hotspots, dead code, architecture map

Console → **◈ Analysis**:

| Sub-tab | Contents |
|---|---|
| **Costs** | total and costs per request; costs per file – a request's cost is distributed over the files it touched (editing counts three times, reading once). Can be shown as a heat map in the diagram. Estimates by Claude Code. |
| **Hotspots** | from the Git history (90 days / 1 year / all): how often and by how many people changed × size, plus files that often change together. Heat map in the diagram. |
| **Dead code** | functions without callers in the static graph (excluding entry points, tests, handlers) – just a hint. |
| **Rules & cycles** | see 4A.4 |
| **Architecture map** | compact project map (modules, dependencies, central units, entry points, rules, tests); **Write to CLAUDE.md** puts it between `<!-- codeatlas:start -->` and `<!-- codeatlas:end -->` – the rest of the file stays untouched. ⚙ → "Keep the project map in CLAUDE.md up to date" renews it after every request with changes. The map is written in the interface language. |

### 4A.9 Commit per request

⚙ → **Commit after every request**: if a request changed files, the atlas commits afterwards (message "KI: <request>" plus a list of changes; as "CodeAtlas" if no Git identity is set up). The hash appears below the request in the history – so every request can be reverted on its own with Git (`git revert <hash>`).

---

## 5. Seeing changes: the change layer

### 5.1 Colours and labels

| Appearance | Meaning |
|---|---|
| **blue** frame, label "✦ READING" / "SEARCHING" | the AI is reading there right now |
| **yellow/orange** frame, "✦ EDITING" / "WRITING" | the AI is changing something there (pulses while the step runs) |
| **violet** frame, "✦ RUNNING" | a shell command is running |
| fine dotted line | gaze path: where the AI came from last |
| green label **NEW** + green frame | the unit is new |
| yellow label **CHANGED +n ~n −n** | unit changed (new / changed / removed functions and variables) |
| red dashed **REMOVED** | the unit no longer exists (shown as a "ghost" at its last position) |
| row with green / yellow background | a single function or variable new / changed (from zoom level 2) |
| green edge with **+** | new connection |
| yellow edge | connection changed (e.g. more calls) |
| red dashed edge with **−** | connection removed |

### 5.2 The bar above the diagram

- **Δ since …** – what is compared with (last request, bridge start or a checkpoint). A click opens the list of changes.
- **Counters** – new / changed / removed units and new connections.
- **Highlight** – change layer on/off.
- **Only Δ** – dim everything unchanged.
- **Follow AI** – the camera follows the AI.

### 5.3 How the comparison works

- Every unit gets a **stable key** from language, kind, file and name. It stays the same even when line numbers shift or the project is analysed again – that is why the labels do not flicker.
- Every connection has the key `from > to > kind`.
- Functions and variables are compared by name, their content by the source excerpt. That way the atlas recognises "function changed" even if only the body differs.
- Connections at line level (function A calls B, reads/writes variable X) are compared individually.
- Line diffs use the Myers algorithm (like git diff).

There are two comparisons at the same time:

1. **step by step** (previous model ↔ new model, on every reload) → Δ notes in the history and the short flash,
2. **against a base** (checkpoint ↔ now) → the lasting labels, counters and the list of changes.

---

### 5.4 AI camera and picture-in-picture

**Main camera ("Follow AI"):**
- The camera aims **once per tool step**, as soon as the target file is known – not on every chunk of the streamed input (that used to cause jitter).
- At most **one move every 2.5 s**; further steps on the *same* structure may follow right away.
- If the spot is already readable in view, nothing moves.
- For *edit* the atlas finds the lines via the **old** text (the new one is not in the file yet) – so the camera lands on the right function.
- After the model is rebuilt, the camera only jumps to **newly created** units, not to every changed one.
- **You take priority:** panning, zooming, the minimap or moving the mouse over the diagram pause the following for 5 s.

**Picture-in-picture (bottom left):**
- If the AI accesses **another structure** that is not in view and the main camera may not move (you are working yourself, *Follow AI* is off, or the last move was < 2.5 s ago), a small window opens at the bottom left.
- It is a **second, full view** of the same visualisation: same rendering, change layer and AI highlights (READING / EDITING / focus lines), centred on the unit or function.
- Header: coloured dot by kind (blue = reads, yellow = edits, green = creates, violet = runs) and text like "edits rechnung.py › rechnung_schritt_6".
- **Clicking the window or ⤢** jumps there in the main diagram and closes the window; **✕** closes it.
- Closes by itself 6 s after the step ends (not while the mouse is over it). If the main camera moves to this structure itself, it disappears.
- Hidden below 760 px width.

## 6. Checkpoints, comparing and resetting

### 6.1 What a checkpoint is

A checkpoint records the state of **all text files** of the project. The bridge creates one automatically:

- when the bridge starts ("bridge start"),
- before every request to the AI (named after the request, without the context line).

You can also set one yourself at any time (**＋ Checkpoint**).

Storage: content-addressed in `.codeatlas/objects/` (each file version only once, name = SHA-1), description in `.codeatlas/checkpoints/<id>.json`. The last 80 checkpoints are kept; file versions no longer needed are cleaned up. Binary files and hidden tool folders (`.git`, `.claude`, `.vscode` …) are not included.

### 6.2 The "Δ Changes" tab

At the top the **comparison base**: *since the last request* (default), *since the bridge started* or any checkpoint.

On the left three lists:

- **Units** – with + ~ − and the individual functions/variables,
- **Connections** – new/removed, with kind (calls, reads, writes, include, inherits …),
- **Files** – with a line balance (+n −n).

On the right the **diff** of the selected file (with context lines).

Clicking a **unit** shows it in the diagram. Clicking a **connection** brings both ends into view and **highlights the connection for a few seconds** – from the calling function to the target function or variable.

### 6.3 Resetting

- **↶ on a file** – reset only this file to the base.
- **↶ Reset all** – reset all files to the base (with the confirmation "Really?"). New files are deleted, deleted files restored.
- **Undo reset** – undoes the last reset. This works because every reset creates a snapshot itself first.

Technically resetting runs through the same patch mechanism as all writes: all or nothing, with a check for changes in the meantime, preserving line endings and encoding.

### 6.4 Manual changes

If you change a file yourself (in the atlas editor or in your IDE), the change appears just the same in the list of changes and in the diagram – the atlas does not distinguish who changed it, it shows the difference to the base.

---

## 7. The diagram

### 7.1 What is shown

- **Units (nodes):** classes, interfaces, enums, structs – and in procedural languages (C, Python modules, ST …) **modules**: a `.c` with its `.h` forms a unit «module» with functions and global variables.
- **Folder frames:** units from the same folder sit in a shared frame (e.g. `src · 7`).
- **Rows:** fields/variables at the top, methods/functions at the bottom, with visibility (`+` public, `-` private/static, `#` protected).

### 7.2 Kinds of connections

| Kind | Meaning |
|---|---|
| inherits | inheritance |
| implements | interface |
| owns (composition/association) | field of another class's type |
| calls | function call into another unit |
| accesses (reads/writes) | access to another unit's variables |
| include / import | `#include`, `import`, `use` … |
| uses (type) | type used as parameter, return value or similar |

From zoom level 2 on, edges show **which function uses which function/variable** (row to row).

### 7.3 Zoom levels

| Level | Name | Contents |
|---|---|---|
| 0 | Architecture | folders and units as blocks |
| 1 | Relationships | units with connections and labels |
| 2 | Detail | variables and functions individually, clickable |
| 3 | Analysis | additionally row-level access, patterns |

The level changes automatically with the zoom (mouse wheel, pinch, zoom ladder bottom left) or with the keys **0–3**.

### 7.4 Controls

- **Click** selects a unit, **double-click** flies in, in detail zoom rows can be selected individually.
- **Drag** moves the view, single units or (by the frame label) whole folders.
- **Minimap** bottom right to jump.
- **F** fits everything, **Esc** clears the selection.
- The layout is kept on reload: new units are placed near their neighbours, existing ones keep their place.

### 7.5 Pattern detection

The atlas heuristically detects design patterns (singleton, factory, builder, observer, strategy, decorator, composite, adapter) and shows them as a badge in the right panel. This is a hint, not a guarantee.

---

### 7.6 Performance in large projects

The cost of a frame lies almost entirely in the **edges** – more precisely, in the pixel length of all drawn curves the GPU has to rasterise. Dashed lines are the most expensive because every dash is computed individually. Nodes and text hardly matter. That is why (since 3.5):

- **Clipping to the visible part:** every curve is split recursively (de Casteljau). Only the pieces in view are drawn; edges whose hull only grazes the view are dropped entirely. When zooming in, thousands of edges used to reach tens of thousands of pixels beyond the edge and were still dashed and rasterised.
- **Length budget:** in addition to the count there is a limit for the visible total length (at rest ≈ 700,000 px, while navigating ≈ 260,000 px). Important kinds first (inheritance → … → type dependency), within a kind the **short, readable connections first**. Selected, highlighted and changed connections are always drawn. The budget switch on the right (2k … 60k) scales the limit, **"all"** turns it off. The status bar shows "Edges x / y in view (long/excess hidden)".
- **Light frames while moving:** while panning, zooming and during camera moves fewer edges, no edge labels, and with more than 250 edges of a dashed kind solid, paler lines instead of dashes. 170 ms after the movement the full frame follows once.
- **Dashes only where readable:** if the total dashed length of a kind exceeds ≈ 90,000 px, it is drawn solid even at rest (the colour still distinguishes the kind).
- **Real frame time:** the interval between consecutive frames is measured, not just JavaScript time, so GPU rasterisation counts too. If even the light frame is too slow (> 30 ms), the last frame is shown moved/scaled during the movement and redrawn sharply afterwards.
- Smaller savings: dot grid as a single path, node headers without clip paths.

Measurement (Chromium with software rasterisation, 1,344 classes / 15,550 edges, full frame including rasterisation; on a real GPU all values are many times smaller, the ratio is what matters):

| Zoom | before | 3.5 |
|---|---|---|
| 20 % | 1,243 ms | 229 ms |
| 45 % | 1,194 ms | 264 ms |
| 100 % | 645 ms | 248 ms |
| 250 % | 236 ms | 131 ms |

**Python or C?** Python only lives in the bridge: reading and writing files, starting Claude Code, passing on its output. Computing and drawing happens in the browser (parser and diagram in JavaScript, rasterisation on the GPU). A bridge in C would not change any stutter.

## 8. Right panel: details

**Without a selection:** project name, languages, **central classes** (the units with the most connections), usage help, parser warnings.

**With a unit selected:**

- header: kind, language, name, file and lines, patterns; **✎ Edit** (built-in editor) and **↗ IDE** (external IDE at the line), **◎ Impact**,
- live block during a program run (calls, breakpoints),
- problems of this unit from the last build,
- key figures: fields/variables, methods/functions, incoming and outgoing connections,
- with a function/variable selected: signature, visibility, **calls / called by / writes / reads**, for variables **written/read by** (with a warning if several modules write the same variable),
- relationship sections: inherits from, implements, owns, calls functions in, called by, accesses variables in, include/import, included by, uses …,
- fields/variables and methods/functions as a list,
- source excerpt (clicking a line opens the editor there).

**Collapsing:**

- Clicking a **section heading** collapses or expands the section (▾/▸). The state applies to all units alike and survives a reload. Also works by keyboard (Tab, Enter/Space).
- **›** at the top right of the diagram hides the whole panel, **‹ Details** shows it again. The diagram then uses the full width.

---

## 9. Console: the tabs at the bottom

| Tab | Contents |
|---|---|
| **Δ Changes** | comparison, diff, reset ([section 6](#6-checkpoints-comparing-and-resetting)) |
| **Run** | start a program, console with input/output, live trace, breakpoints |
| **✓ Tests** | run tests, result per test with failure location, call path, variables, executed functions, coverage (see 10.4) |
| **◈ Analysis** | costs, hotspots, dead code, rules & cycles, architecture map (see 4A.8) |
| **Editor** | built-in editor with saving, conflict detection (file was changed in the meantime), jump into the IDE |
| **Files** | all files of the project |
| **Search** | text or regex in all files (via the bridge) |
| **Problems** | start a build, compiler messages, test failures and rule violations, jump to the spot, **✦ Send errors to AI** |
| **Symbols** | all classes, functions, variables as a searchable list |
| **Export** | diagram as PNG, model as JSON and more |

---

## 10. Build, run, live trace and tests

### 10.1 Build configurations

The bridge detects build options automatically, e.g.:

- **C/C++:** `make`, CMake, Code::Blocks project (`.cbp`), gcc syntax check over all `.c` files,
- **Python:** syntax check,
- **JavaScript/TypeScript:** `tsc --noEmit`, `npm run build`,
- **C#:** `dotnet build`, **Go:** `go vet`, **Rust:** `cargo check`.

Custom configurations: `--build "Name=command"`.

The configurations are **detected again on every query** – if the AI creates or deletes files, they are included in build and run right away, without restarting the bridge.

### 10.2 Running

- Run configurations are detected too (C/C++: compile and start; Python: start the script). Custom ones: `--run "Name=command"` (without trace).
- **▶ run** at the end of a request uses the last chosen run configuration with live tracing.
- In the **Run** tab: choose a configuration, arguments, input to the running program (stdin), stop.

### 10.3 Live trace

With tracing, the diagram shows **how the program runs**: which functions are called (call counter on the unit), which connections are being used (edges light up), durations. Breakpoints and single-stepping are available via the controls in the tab and in the right panel.

- **C/C++:** via instrumentation at compile time,
- **Python:** via a bundled tracer (`atlas_tracer.py`, generated by the bridge).

Other languages: running yes (custom command), live trace no.

### 10.4 Tests in the atlas (since 3.6 / bridge 1.9, extended in 3.7 / 1.10)

Tests run **in the atlas with tracing** – for you in the **✓ Tests** tab and in the diagram, for Claude as a tool with structured feedback. Instead of console text you get for every failure:

- **failure location in the program** – the deepest spot in the traceback that is not in a test file (file:line, function, code line) with the **variable values** there,
- **check in the test** – the failing line in the test (for C every failed `CHECK` line with actual ≠ expected),
- **call path** from the test to the failure,
- **executed program functions** of this one test with call count – important when the program just returns a wrong value and no program code appears in the traceback,
- **crashes and endless loops** are assigned to the test (signal or "time limit", spot at the abort); the test program restarts and continues after this test,
- **coverage:** how many program functions at least one test reached, and which not.

**Writing tests**

| Language | Files | Contents | Run with |
|---|---|---|---|
| Python | `test_*.py`, `*_test.py` | functions `test_*()` with `assert`, classes `Test*`, `unittest.TestCase` | pytest if installed (including fixtures), otherwise a built-in runner (unittest + simple functions) |
| C/C++ | `test_*.c`, `*_test.c` (also .cpp) | `#include "atlas_test.h"`, `TEST(name) { CHECK(…); CHECK_EQ_INT(a, b); CHECK_EQ_STR(a, b); CHECK_NEAR(a, b, eps); REQUIRE(…); }` – **no `main()`** | one test program from all test files + all program files **without** `main()` + the atlas's `main()`; compiler options/includes from the `.cbp` if present |
| other | – | custom command `--test "Jest=npx jest"` | only exit code and output, without failure location |

The bridge puts `atlas_test.h` into `.codeatlas/`; it is found automatically when compiling the tests. Declare helper functions in C test files `static` (all test files end up in one program). Time limit per test: 30 s (environment variable `CODEATLAS_TEST_TIMEOUT`); it does not apply in the debugger (pause, breakpoints, slow motion).

**In the atlas**

- **✓ Tests** tab: *▶ Run tests*, filter (name/file), *errors only*, counters (✓ ✗ ! ○), per language the last run with duration and **coverage** (expandable: unreached functions, clickable).
- Failed tests show their details directly; clicking file references opens the editor, clicking functions jumps there in the diagram.
- **Clicking a test** marks everything this test executed in the diagram (dashed), and in red the **failure location** or the **check**. With a failure location the camera flies there, otherwise it shows the check and the executed functions together.
- During the run: live trace as with ▶ run (call counters, glowing edges).
- Test failures also appear under **Problems** and as red rows/marks in the diagram.
- **✦ Send errors to AI** puts the complete test report into the input field as a request (to review, then send).

**Fast loop (since 3.7)**

- **↻ Only failed** repeats exactly the tests that failed last; **▶ on a row** (on hover) repeats a single test. The other tests stay in the list with their last state (slightly dimmed), coverage stays that of the last full run.
- **Comparison with the previous run:** tests that passed before and fail now carry **NEWLY BROKEN**; previously failing ones that pass now, **FIXED**. The total is shown at the top (▼ n newly broken · ▲ n fixed), also in the message at the end of the run and in the report to Claude. The comparison lasts as long as the bridge runs.
- **Automatically after AI request:** if a request changed files, the affected tests run on their own afterwards (without switching tabs; not if Claude tested itself at the end). So you notice right away when a change breaks something else.
- **Coverage in the diagram:** in the expanded coverage box, *show in diagram* marks all functions no test reaches (yellow dashed).
- After a crash or time limit in Python tests, the restarted process continues counting the functions after the previous ones – the mapping "which test executed what" stays correct afterwards too.

**For Claude: tools (MCP server `codeatlas`)**

When the atlas starts Claude Code, it gives it the tools (`--mcp-config .codeatlas/mcp.json`) and a short note to use them (`--append-system-prompt`). They are allowed without asking (`permissions.allow: mcp__codeatlas` in `.codeatlas/agent-settings.json`), because they only start tests in the atlas or read the graph and the plan.

| Tool | Purpose |
|---|---|
| `tests_info` | which test files exist, which framework, how to write tests |
| `tests_run` | run tests (optional `filter`, `sprache` = alle/python/c, `nur_fehlgeschlagene`, `betroffene`), waits for the result (up to 280 s) and returns the report as above |
| `tests_last` | report of the last run (also if you tested yourself) |
| `atlas_*`, `plan_*` | graph and pipeline tools, see 4A.1 |

In the AI history the step appears as **"tests in the atlas"**; the run itself can be watched live in the tab and in the diagram.

How it works internally: `python codeatlas_bridge.py --mcp` is a small MCP server (stdio) that Claude Code starts itself. It finds the bridge via the environment or `.codeatlas/bridge.json` and passes every call on to `POST /api/mcp/call` (only from 127.0.0.1, with the hook token). Python tests run under the tracer via `.codeatlas/atlas_testrun.py`, C tests as an instrumented program; test runner and tracer mark the test boundaries in the trace, so the calls can be assigned to each individual test.

Claude in the **terminal** (instead of from the atlas) gets the tools with this, once, in the project folder:

    claude mcp add codeatlas -- python "C:\path\to\codeatlas_bridge.py" --mcp

To switch off: start the bridge with `--no-mcp`.

---

## 11. Following Claude Code in the terminal (hooks)

If you prefer working with Claude Code in the terminal or in VS Code, you still get the live view.

**Turning it on:** ⚙ → **Follow Claude Code in the terminal**. The bridge then registers hooks in the project's `.claude/settings.local.json` (`UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `Stop`, `SubagentStop`, `Notification`, `SessionEnd`). Existing foreign entries are kept; turning it off removes only its own.

**How it works:**

1. On every event Claude Code calls `python codeatlas_bridge.py --hook codeatlas` (asynchronously, blocks nothing).
2. This fast hook mode reads the event, finds the bridge via `.codeatlas/bridge.json` (address and hook token) and sends it to `POST /api/agent/hook`.
3. The bridge turns it into the same events as for requests from the atlas. In the history the session appears as its own block with the label **TERMINAL**.

If the bridge is not running, the hook ends silently – Claude Code is not disturbed. For terminal sessions, approvals still happen in the terminal, not in the atlas.

---

## 12. What is stored where

| What | Where | How long |
|---|---|---|
| history on the left (requests, steps, answers) | the bridge's memory | until the bridge quits; survives reloading the page |
| complete conversation with Claude Code | `%USERPROFILE%\.claude\projects\<project path>\<session ID>.jsonl` (Linux/macOS `~/.claude/projects/…`) | permanent, according to Claude Code's retention rule |
| plans from "Plan" | `%USERPROFILE%\.claude\plans\*.md` | permanent |
| attachments (images, files) | `.codeatlas\uploads\` in the project | until you delete them |
| skills | `.claude\skills\` (project), `%USERPROFILE%\.claude\skills\` (personal) | permanent |
| last reported active skills | `.codeatlas\claude-init.json` | updated on every request |
| checkpoints (file states) | `.codeatlas\checkpoints\`, `.codeatlas\objects\` in the project | the last 80 |
| snapshots before patches/resets | `.codeatlas\snapshots\` | the last 200 |
| settings for started agents | `.codeatlas\agent-settings.json` | rewritten on every start |
| address of the running bridge (for hooks) | `.codeatlas\bridge.json` | removed when quitting |
| recently opened projects | `%USERPROFILE%\.codeatlas_recent.json` | at most 12 |
| tools for Claude | `.codeatlas\mcp.json` | rewritten on every start |
| test helper files | `.codeatlas\atlas_test.h`, `atlas_test_main.c`, `atlas_testrun.py` | renewed as needed |
| test results of a run | `.codeatlas\tests_<run>.jsonl` | until the next run with the same number |
| diagram for Claude's tools | `.codeatlas\graph.json` | on every rebuild |
| pipeline (idea, specification, plan, tasks) | `.codeatlas\pipeline.json` | until "Start over" |
| architecture rules | `.codeatlas\rules.json` | permanent |
| mapping test → functions | `.codeatlas\test-map.json` | extended on every test run |
| team worktrees | `.codeatlas\team\<name>` + branch `atlas/<name>` | until merge/discard |
| project map | section in `CLAUDE.md` between the codeatlas markers | until you delete it |
| hooks for following | `.claude\settings.local.json` | until you turn them off |
| token | `~/.codeatlas_token` (or `--token`) | permanent |
| interface settings (mode, options, collapsed sections, theme, language …) | the browser's localStorage | permanent in that browser |

`.codeatlas\` contains its own `.gitignore` (`*`) and therefore does not end up in Git.

**Continuing an old session:** run `claude --resume` in the project folder and choose the session. If "follow in the terminal" is on, you see it live in the atlas.

---

## 13. Security

- **This PC only:** the bridge listens on `127.0.0.1` by default. Remote access only deliberately with `--listen` and `--allow` (e.g. a VPN network). The connection is then unencrypted (HTTP).
- **Token:** every request needs the token (`X-Atlas-Token` or `#token=` in the address). The hook endpoints have their own token and only accept requests from `127.0.0.1`.
- **Presets only:** the browser cannot start arbitrary commands. Build, run and agent commands are fixed when the bridge starts; the browser only sends the choice and the request text.
- **Approvals:** the AI's shell commands only run after your consent (unless you chose "always allow"). Without an answer: declined after 5 minutes. In Plan mode, attempts to leave plan mode are declined automatically.
- **Test tools:** Claude may start tests without asking. Tests are code from the project and run with your permissions – like ▶ run. If you don't want that: `--no-mcp`.
- **AI code runs with your permissions.** Running starts programs on your computer – look at the code before starting an unknown program for the first time.
- **Way back:** a checkpoint before every request, every reset can itself be undone.

---

## 14. Bridge start options

```
python codeatlas_bridge.py [PROJECT_FOLDER] [options]
```

| Option | Meaning |
|---|---|
| `PROJECT_FOLDER` | folder to open (default: current folder) |
| `--desktop` | interface as its own window (Edge/Chrome in app mode), connected right away |
| `--open` | open the interface in the default browser |
| `--port N` | port (default 7878) |
| `--token TEXT` | fixed token (otherwise from `~/.codeatlas_token` or newly generated) |
| `--test "NAME=COMMAND"` | additional test command (without failure-location analysis), can be repeated |
| `--no-mcp` | don't give Claude Code the atlas tools |
| `--model MODEL` | default model for Claude Code (`fable`, `opus`, `sonnet`, `haiku` or a full name); switchable in the interface |
| `--agent "Name=command"` | offer another agent, can be repeated, e.g. `--agent "Haiku=claude --model haiku"` |
| `--build "Name=command"` | additional build configuration, can be repeated |
| `--run "Name=command"` | additional run configuration (without trace), can be repeated |
| `--editor ID` | default IDE: vscode, cursor, vscodium, codeblocks, notepadpp, sublime, clion, pycharm, idea, devenv, gedit, kate … or custom |
| `--editor-cmd "…"` | custom editor command, e.g. `"notepad++ -n{line} {file}"` |
| `--editor-path ID=PATH` | set the path to an IDE |
| `--include-libs` | don't hide libraries (venv, site-packages, third_party …) |
| `--listen ADDRESS` | 127.0.0.1 (default), 0.0.0.0 or a VPN IP |
| `--allow NETWORK` | only allow these networks, e.g. `10.8.0.0/24` |
| `--host-name NAME` | additionally allowed host name |
| `--app PATH` | path to `CodeAtlas.html` (default: next to the bridge) |
| `--hook codeatlas` | internal hook mode (called by Claude Code, not by hand) |

Claude Code is found automatically (agent "Claude Code"). On Windows `claude.cmd`/`claude.exe` are started via `cmd /d /s /c`.

---

## 15. Bridge interface (HTTP)

All requests with the header `X-Atlas-Token: <token>` (or `?token=`). Responses are JSON; event streams are server-sent events.

**Project and files**

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/info` | version, capabilities, build/run configurations, editors, agent state |
| GET | `/api/tree` | file list |
| GET/PUT | `/api/file` | read / write a file (atomic, with conflict check) |
| GET | `/api/events` | event stream: files changed/new/deleted |
| GET | `/api/search` | full-text/regex search |
| POST | `/api/open` | open a file in the IDE |
| POST | `/api/patch` | change/create/delete/rename several files, all or nothing, optionally with a Git commit |
| GET | `/api/snapshots` | snapshots |
| POST | `/api/snapshot/restore` | restore a snapshot |

**Build and run**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/build` | run a build configuration |
| POST | `/api/run` | start a program (optionally with trace) |
| GET | `/api/run/events` | event stream: output, trace |
| POST | `/api/run/stdin` | input to the running program |
| POST | `/api/run/ctl` | breakpoints, pause, single step |
| GET | `/api/stream?topics=files,run,agent,team` | one shared event stream (SSE, `event:` = topic) instead of several – from bridge 1.9.1 |
| GET | `/api/project/recent` | current and recently opened projects, whether switching/dialog is possible |
| GET | `/api/project/browse?path=` | subfolders of a folder (local only) |
| POST | `/api/project/pick` | show the native folder dialog on the bridge's computer (local only) |
| POST | `/api/project/open` | switch project (`path`, `force`; local only; 409 if something is still running) |
| GET | `/api/test/info` | test files found, framework, last run |
| POST | `/api/test/run` | start a test run (`filter`, `kinds`: py / c / cmd, `failed`: only the last failed, `only`: list of test IDs, `affected`: only affected tests) |
| POST | `/api/test/stop` | cancel the test run |
| GET | `/api/test/result` | result of the last run (data + report as text) |
| POST | `/api/mcp/call` | tool call of the MCP server (hook token, 127.0.0.1 only) |
| POST | `/api/run/stop` | stop the program |

**Graph, pipeline, rules, Git, team (from bridge 2.0)**

| Method | Path | Purpose |
|---|---|---|
| GET/POST | `/api/graph`, `/api/graph/info` | take over the diagram from the interface / query its state |
| GET/POST | `/api/pipeline` | read / change the pipeline (`idea`, `spec`, `plan`, `stage`, `approve`, `tasks`, `reset`) |
| GET/POST | `/api/rules` | architecture rules |
| GET | `/api/git/status`, `/api/git/hotspots?days=` | Git state, hotspots |
| POST | `/api/git/commit` | commit everything: `{message}` |
| GET/POST | `/api/claudemd` | read / write the atlas section in CLAUDE.md |
| GET | `/api/team`, `/api/team/diff?name=` | team agents, diff of a worktree |
| POST | `/api/team/start\|send\|stop\|decide\|merge\|discard` | control a team agent |
| POST | `/api/agent/gate` | stop hook of the quality gate (local only, hook token) |

**Checkpoints**

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/checkpoints` | list + ID of the start checkpoint |
| POST | `/api/checkpoint` | set a checkpoint (`label`) |
| GET | `/api/checkpoint/diff?id=` | changed / new / deleted since the checkpoint |
| GET | `/api/checkpoint/file?id=&path=` | file content in the checkpoint |
| POST | `/api/checkpoint/restore` | reset everything or single paths; returns a snapshot ID for undoing |

**Agent (Claude Code)**

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/agent/state` | state (running, session, agents) |
| GET | `/api/agent/events` | event stream (state first, then the whole history, then live) |
| POST | `/api/agent/start` | start a request: `{agent, prompt, mode, fresh, attachments, model, effort, gate, lang}` (409 if one is already running) |
| POST | `/api/agent/send` | message while it works: `{prompt, attachments}`; if nothing is running, a new request is started |
| POST | `/api/agent/upload` | upload an attachment: `{name, mime, data}` (Base64) → `{id, path, img, …}` |
| POST | `/api/agent/stop` | cancel the request |
| GET | `/api/account` | Claude Code account status + running sign-in (`?fresh=1` without cache) |
| POST | `/api/account/login` | start sign-in: `{console}` |
| POST | `/api/account/code` | pass the code from the sign-in page: `{code}` |
| POST | `/api/account/cancel` | cancel sign-in |
| POST | `/api/account/logout` | sign out |
| GET | `/api/skills` | all skills and commands: name, description, location, path, editable, active |
| GET | `/api/skills/file?name=` | read a skill's SKILL.md |
| POST | `/api/skills/create` | create a skill: `{scope: projekt\|persönlich, name, description, body}` |
| POST | `/api/skills/save` | save SKILL.md (project/personal only): `{name, content}` |
| POST | `/api/agent/permission` | answer an approval: `{id, allow, always}` |
| POST | `/api/agent/reset` | new session, clear history |
| POST | `/api/agent/hooks` | following on/off: `{install}` |
| POST | `/api/agent/hook` | hook event from Claude Code (local only, hook token) |
| POST | `/api/agent/permit` | blocking approval request of the hook (local only, hook token) |

**Events in the agent stream** (each with a running number `n` and time `t`):

| `k` | Contents |
|---|---|
| `turn` | request start (`ph: start`, source atlas/terminal, request, checkpoint, mode) or end (`ph: end`, ok, text, duration, costs, steps, declines) |
| `text` | answer text, in pieces (`d`) or whole (`full`) |
| `tool` | tool step: `draft` (being formulated), `start`, `end`; with path, command, old/new, line ranges, result |
| `user` | message while it works: `sent`, `ack` (picked up by Claude Code), `queued` (runs as the next request) |
| `perm` | approval requested (`ask`) / decided (`done`: allow, deny, timeout, auto) |
| `gate` | quality gate: `check`, `ok`, `block` (with report), `giveup` |
| `pipeline` | the pipeline changed |
| `status` | asking / thinking / subtask (not stored in the history) |
| `note` | hint or error message |
| `idle` | agent ready again |
| `reset` | history cleared |

---

## 16. Supported languages

**Analysis and diagram** (units, functions, variables, connections):

- Brace languages: C, C++ (including `.ino`, CUDA), Java, C#, JavaScript, TypeScript, Kotlin, Swift, PHP, Scala, Dart, Groovy, Rust, Solidity, D, Vala, Haxe, Zig, Go
- Python
- Structured Text (IEC 61131-3: `.st`, `.scl`, TwinCAT files)
- SQL
- simplified: Ruby, Lua, Perl, Shell, PowerShell, R, Julia, Elixir, Nim, Crystal, Tcl, Haskell, Elm, VHDL, Ada, Verilog, MATLAB, Erlang, Fortran, Visual Basic, Pascal, OCaml/F# and more

**Build check, running, live trace:**

| Language | Build check | Run | Live trace |
|---|---|---|---|
| C / C++ | gcc, make, CMake, Code::Blocks | yes | yes |
| Python | syntax check | yes | yes |
| JavaScript / TypeScript | tsc, npm | custom command | no |
| C# | dotnet | custom command | no |
| Go | go vet | custom command | no |
| Rust | cargo check | custom command | no |
| Java | – (custom command) | custom command | no |

---

## 17. Building the interface yourself

`CodeAtlas.html` is a prebuilt bundle of `src/CodeAtlasLab.jsx` and React 18.3.1.

```
cd build
npm install
node build.mjs          # release build (~650 kB)
node build.mjs --dev    # development build with readable error messages
```

The result ends up as `CodeAtlas.html` in the parent folder. The bridge serves it at `/` and sets `window.__ATLAS_BRIDGE__ = true`; the interface then connects by itself with the token from `#token=`.

The JSX is (still) a single file of about 9,000 lines. Splitting it into modules is planned.

**Languages:** the interface is written in German. For English, a translation layer at the top of `src/CodeAtlasLab.jsx` (`I18N_EN`, `tr()`) translates everything visible: text nodes, tooltips, placeholders, labels drawn on the canvas and the page title. User content (code, diffs, Claude's answers, inputs) is left untouched. Texts that go to Claude (pipeline prompts, build-fix requests, context line) are chosen explicitly per language, and the bridge gives Claude an English system prompt. New interface texts need an entry in `I18N_EN`; `#` stands for a number, `{}` for any part.

---

## 18. Keyboard shortcuts

| Key | Action |
|---|---|
| **Ctrl+O** | open project (with bridge: switch project, otherwise a folder in the browser) |
| **Ctrl+,** | settings |
| **I** | jump to the request field |
| **Enter** / **Shift+Enter** | send request / new line |
| **/** | search (Structure tab) |
| **F** | fit everything |
| **0 – 3** | zoom level |
| **+** / **−** | zoom |
| **Esc** | clear selection (in the input field: leave focus) |
| **E** / **Shift+E** | open the selection in the external IDE / in the built-in editor |
| **K** | console open/closed |
| **B** | build with the last chosen configuration |

---

## 19. Limitations, known issues, open work

**Limitations**

- The parser is heuristic. Unusually formatted code may be missing from the diagram even though it is correct. The build remains authoritative.
- The cost per request is Claude Code's estimate, not the bill.
- The history in the interface does not survive quitting the bridge (Claude Code stores the conversation itself).
- Approvals for terminal sessions happen in the terminal, not in the atlas.
- Code comments and identifiers are in German.

**Tested**

- model switching (Haiku, low effort) and account status with the real Claude Code – sign-in itself only simulated,
- skill invocation via `/name` and detection of active skills with the real Claude Code,
- messages while it works and image attachments also with the real Claude Code via the bridge (image recognised, message considered in the same request),
- over 100 automated checks of the bridge (including skill directory, model choice, account, graph, pipeline, quality gate, team),
- interface tests in the browser with simulated Claude Code events (request, approval, decline, stop, crash, reload in the middle of a request, removal, reset/undo, plan, hooks, build loop, empty folder, narrow windows, light scheme, collapsing),
- real runs with Claude Code through the interface on Linux (versions up to 3.x).
- Version 4: pipeline over all stages, quality gate (blocks, Claude fixes, passes), commit per request, replay, team (start, conflict detection, diff, merge, conflict abort, discard), rules, impact, CLAUDE.md – with a simulated Claude Code (same events, hooks and MCP calls as the real one).
- Version 5: simple view, Advanced switch, settings dialog, accent colours, light scheme, narrow windows, English interface.

**Not tested:** version 4 and later with the real Claude Code (in particular how often the real model uses the atlas tools on its own and how the stop hook reacts in the current CLI version). Windows – starting `claude.cmd`, hooks with `python.exe`, the Edge window, `CodeAtlas-starten.bat`. If the approval hook fails there, the AI's shell commands are declined instead of asked about.

**Open**

- store the history permanently and continue earlier sessions from the atlas,
- planned units from the pipeline drawn dashed in the diagram,
- adapters for chat models (Ollama, Claude API),
- change values directly in the detail panel, lock areas for the AI,
- split `CodeAtlasLab.jsx` into modules, move the analysis into a background thread,
- English code comments.

---

## 20. Troubleshooting

| Problem | Cause / solution |
|---|---|
| ▶ Start (or anything else) does nothing, no message | Before 3.6.1: too many open CodeAtlas windows – each held three persistent connections, the browser allows only ~6 per address, further requests hung silently. From 3.6.1 one connection per window; if a start takes > 8 s, a note appears. Otherwise: close extra windows, reload. |
| "Claude Code was not found" | `claude` is not in the PATH. Check `claude --version` in a terminal; if needed specify it with `--agent "Claude Code=C:\…\claude.cmd"`. |
| Request ends immediately with a login/API key error | Claude Code is not signed in: run `claude` once in a terminal and sign in. |
| Shell commands are always declined | The approval hook does not reach the bridge (e.g. Python path). The Edit mode still works for file changes; check the bridge output in the terminal. |
| Interface shows "disconnected" | Bridge quit or port in use. Restart the bridge; the page reloads the history when it reconnects. |
| Diagram stays the same after a change | The file is not recognised as code (extension) or is in a hidden folder (`build`, `dist`, hidden folders, libraries → `--include-libs`). |
| "▶ run" is missing | No run configuration detected (e.g. no `main`). Check in the Run tab or specify `--run`. |
| Desktop window does not open | Edge/Chrome not found → the default browser is used; the address is in the terminal. |
| `.claude` entries get in the way | ⚙ → turning off "Follow Claude Code in the terminal" removes only the atlas entries. |
| Interface is in the wrong language | ⚙ → View → Language. The default follows the browser language. |
