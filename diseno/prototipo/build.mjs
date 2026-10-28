// Construye un único HTML autocontenido: React + Tailwind compilados e incrustados.
import { build } from "esbuild";
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const svg = (f) => readFileSync(f, "utf8").replace(/<\?xml.*?\?>/, "").trim();
const uri = (s) => "data:image/svg+xml;base64," + Buffer.from(s).toString("base64");
const land = svg("assets/landscape.svg");
const rev = land.replace(/fill:\s*#002060/, "fill: #f4f1e8");
const emblem = land.replace(/viewBox="[^"]+"/, 'viewBox="0 0 233 233"');
writeFileSync("src/logo.js", `export const LOGO_LANDSCAPE = "${uri(land)}";\nexport const LOGO_LANDSCAPE_REV = "${uri(rev)}";\nexport const LOGO_EMBLEM = "${uri(emblem)}";\n`);

const js = await build({ entryPoints: ["src/main.jsx"], bundle: true, minify: true, write: false, format: "iife", jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' }, target: "es2020", logLevel: "warning" });
execSync(`npx @tailwindcss/cli -i src/styles.css -o out.css --minify`, { stdio: "inherit" });
const css = readFileSync("out.css", "utf8");
const code = js.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
const html = `<!doctype html>
<html lang="es-CO">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Expediente foliado</title>
<meta name="description" content="Prototipo clicable de la nueva Gestión de Procesos de Alejandra Muñoz | Abogada y Asociados">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Gelasio:wght@400;500;600&family=Public+Sans:wght@400;500;600;700&family=Roboto+Mono:wght@400;500&display=swap">
<style>${css}</style>
</head>
<body>
<div id="root"></div>
<script>${code}</script>
</body>
</html>
`;
writeFileSync("prototipo.html", html);
console.log("ok", (html.length / 1024).toFixed(0) + " KB");
