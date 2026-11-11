// Bundles the game into one self-contained HTML file.
//   dist/wallbreaker.html  page fragment for publishing (the host adds <html>/<head>/<body>)
//   dist/play-local.html   full document you can open directly in a browser
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const result = await build({
  entryPoints: ['src/ui/main.js'],
  bundle: true,
  format: 'iife',
  target: 'es2020',
  minify: false,
  write: false,
  legalComments: 'none',
});
const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const page = readFileSync('src/ui/page.html', 'utf8');
const [before, after] = page.split('/*__BUNDLE__*/');
const html = before + js + after;
mkdirSync('dist', { recursive: true });
writeFileSync('dist/wallbreaker.html', html);
writeFileSync(
  'dist/play-local.html',
  `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"></head><body>\n${html}\n</body></html>\n`,
);
console.log(`Built dist/wallbreaker.html (${(html.length / 1024).toFixed(0)} KB)`);
