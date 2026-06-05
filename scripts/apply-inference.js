/**
 * Manual-mode helper: takes the JSON an LLM produced (from your clipboard, or
 * piped via --stdin), validates it, and writes it to
 * public/inference/inference.json — so you don't edit the file by hand.
 *
 *   npm run apply           # read the JSON from the clipboard
 *   npm run apply:stdin     # paste into the terminal, then press Ctrl-D
 */
const fs = require('fs');
const { execSync } = require('child_process');

const OUT = './public/inference/inference.json';

function readClipboard() {
  const p = process.platform;
  if (p === 'darwin') return execSync('pbpaste').toString();
  if (p === 'win32') return execSync('powershell -NoProfile -Command Get-Clipboard').toString();
  try {
    return execSync('xclip -selection clipboard -o').toString();
  } catch {
    return execSync('xsel --clipboard --output').toString();
  }
}

let raw;
try {
  raw = process.argv.includes('--stdin') ? fs.readFileSync(0, 'utf8') : readClipboard();
} catch (e) {
  console.error('Could not read input:', e.message);
  console.error('Tip: use `npm run apply:stdin` and paste, then press Ctrl-D.');
  process.exit(1);
}

// Strip Markdown code fences if the model wrapped the JSON, then isolate the object.
let text = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
const start = text.indexOf('{');
const end = text.lastIndexOf('}');
if (start === -1 || end === -1) {
  console.error('No JSON object found in the input.');
  process.exit(1);
}

let obj;
try {
  obj = JSON.parse(text.slice(start, end + 1));
} catch (err) {
  console.error('Invalid JSON:', err.message);
  process.exit(1);
}
if (typeof obj !== 'object' || Array.isArray(obj) || Object.keys(obj).length === 0) {
  console.error('Expected a non-empty JSON object of inference blocks.');
  process.exit(1);
}

fs.writeFileSync(OUT, JSON.stringify(obj, null, 2));
console.log(`✅  Updated ${OUT} (${Object.keys(obj).length} blocks).`);
