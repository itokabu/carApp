// public/ の画面ファイルを annotation プロジェクト（annotations-lab.com）の /games/arenante/ にコピーする。
// 車のデータは GitHub Pages（毎月自動更新）から読むので、data/ はコピーしない。
//   npm run export                 → 既定の場所にコピー
//   npm run export -- <出力先フォルダ>

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'public');
const DEST = process.argv[2] ?? path.resolve(ROOT, '..', '※＠', 'annotation', 'public', 'games', 'arenante');
const SITE_URL = 'https://annotations-lab.com/games/arenante/';
const DATA_URL = 'https://itokabu.github.io/carApp/data/cars.json';
const FILES = ['index.html', 'app.js', 'style.css', 'sw.js', 'icon.svg', 'og.png', 'manifest.webmanifest'];

fs.mkdirSync(DEST, { recursive: true });
for (const file of FILES) {
  let content = fs.readFileSync(path.join(SRC, file));
  if (file === 'index.html') {
    content = content.toString()
      .replace(/(<meta name="arenante:data" content=")[^"]*(")/, `$1${DATA_URL}$2`)
      .replace('<meta property="og:type" content="website">', [
        '<meta property="og:type" content="website">',
        `  <meta property="og:url" content="${SITE_URL}">`,
        `  <meta property="og:image" content="${SITE_URL}og.png">`,
        '  <meta name="twitter:card" content="summary_large_image">',
        `  <link rel="canonical" href="${SITE_URL}">`,
      ].join('\n'));
    if (!content.includes(DATA_URL)) throw new Error('index.html のデータURLを書き換えられませんでした');
  }
  fs.writeFileSync(path.join(DEST, file), content);
}
console.log(`コピーしました: ${DEST}`);
