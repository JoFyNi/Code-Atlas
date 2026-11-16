// Bündelt CodeAtlasLab.jsx samt React zu einer einzigen Datei CodeAtlas.html, die die Bridge ausliefert.
//   cd build && npm install && node build.mjs
import { build } from "esbuild";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const dev = process.argv.includes("--dev");
const r = await build({
  entryPoints: [join(here, "entry.jsx")], bundle: true, write: false, format: "iife", target: ["es2020"],
  minify: !dev, sourcemap: dev ? "inline" : false, legalComments: "none",
  define: { "process.env.NODE_ENV": dev ? '"development"' : '"production"' },
  loader: { ".jsx": "jsx" }, jsx: "transform", logLevel: "warning", nodePaths: [join(here, "node_modules")],
});
const js = r.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
const html = `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="color-scheme" content="dark light">
<title>CodeAtlas Compile</title>
<style>html,body,#root{height:100%;margin:0}body{background:#0a0b0d;overflow:hidden}</style>
</head>
<body>
<div id="root"></div>
<script>${js}</script>
</body>
</html>
`;
const out = join(here, "..", "CodeAtlas.html");
writeFileSync(out, html);
console.log("CodeAtlas.html", (html.length / 1024).toFixed(0) + " kB", dev ? "(Entwicklung)" : "");
