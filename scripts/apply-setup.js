/**
 * Reads the "Setup" sheet from the workbook and dumps the user-entered values
 * into the config files (between the SETUP markers) and the medical-context text
 * file. If the workbook has no "Setup" sheet, this is a no-op.
 *
 * Setup sheet layout — column A holds the label, column B (and C, D, …) the value:
 *
 *   Baby Name                       | <name>
 *   Birth Date                      | <date>
 *   Gestational Age (weeks)         | <number>
 *   Gestational Age (days)          | <number>
 *   Birth Weight (kg)               | <number>
 *   Birth Length (cm)               | <number>
 *   Birth Head Circumference (cm)   | <number>
 *
 *   Early Weight Entries                                   (section header)
 *   Date | Weight (kg) | Height (cm) | Head Circ (cm)      (column headers)
 *   <rows… until a blank Date>
 *
 *   Formula Purchases                                      (section header)
 *   Date | Units | Product | Pack Size (g) | Price per Unit
 *   <rows… until a blank Date>
 *
 *   Medical Context                                        (section header)
 *   <free text, one paragraph per row, until the end of the sheet>
 */
const fs = require('fs');

const pad = (n) => String(n).padStart(2, '0');
const fmtDMY = (d) => `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
const fmtISO = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const shiftDate = (d, off) => new Date(d.getTime() + off * 86400000);

function excelSerialToDate(serial) {
  return new Date(Date.UTC(1899, 11, 30) + Math.round(serial) * 86400000);
}

function coerceDate(cell) {
  if (cell == null || cell === '') return null;
  if (cell instanceof Date) return new Date(Date.UTC(cell.getFullYear(), cell.getMonth(), cell.getDate()));
  if (typeof cell === 'number') return excelSerialToDate(cell);
  const s = String(cell).trim();
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return null;
}

function gestationalCategory(weeks, days) {
  const w = weeks + days / 7;
  if (w < 37) return 'preterm';
  if (w < 39) return 'early term';
  if (w < 41) return 'full term';
  if (w < 42) return 'late term';
  return 'post term';
}

const jsStr = (s) => "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
const numOrNull = (v) => (v == null || v === '' ? 'null' : Number(v));

function injectBetween(src, beginTag, endTag, inner) {
  const re = new RegExp('(// <<< ' + beginTag + '[^\\n]*>>>\\n)[\\s\\S]*?(\\n[ \\t]*// <<< ' + endTag + ' >>>)');
  if (!re.test(src)) throw new Error('SETUP marker not found: ' + beginTag);
  return src.replace(re, (_m, a, b) => a + inner + b);
}

function applySetup(workbook, opts) {
  const { XLSX, configPaths, babyDataPath, contextPath, offsetDays = 0 } = opts;
  const sheetName = workbook.SheetNames.find((n) => n.trim().toLowerCase() === 'setup');
  if (!sheetName) return false;

  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: null, raw: true });
  const findLabel = (label) =>
    rows.findIndex((r) => r && String(r[0] ?? '').trim().toLowerCase() === label);
  const valOf = (label) => {
    const i = findLabel(label);
    return i >= 0 ? rows[i][1] : null;
  };

  const name = valOf('baby name');
  const bDate = coerceDate(valOf('birth date'));
  if (!name || !bDate) throw new Error('Setup sheet must have "Baby Name" and "Birth Date".');

  const sexRaw = String(valOf('gender') ?? valOf('sex') ?? '').trim().toLowerCase();
  const sex = /^(f|girl|female)/.test(sexRaw) ? 'female' : 'male';

  // Optional override; 'auto' (or blank) lets the app infer from the data.
  const fmRaw = String(valOf('feeding mode') ?? '').trim().toLowerCase().replace(/\s+/g, '-');
  const feedingMode = ['combination', 'formula-only', 'breastfeeding-only'].includes(fmRaw)
    ? fmRaw
    : 'auto';

  const gaW = Number(valOf('gestational age (weeks)')) || 0;
  const gaD = Number(valOf('gestational age (days)')) || 0;
  const birth = shiftDate(bDate, offsetDays);

  const ewStart = findLabel('early weight entries');
  const early = [];
  if (ewStart >= 0) {
    for (let i = ewStart + 2; i < rows.length; i++) {
      const r = rows[i];
      const d = r && coerceDate(r[0]);
      if (!d) break;
      early.push({ d: shiftDate(d, offsetDays), w: r[1], h: r[2], hc: r[3] });
    }
  }

  const fpStart = findLabel('formula purchases');
  const purchases = [];
  if (fpStart >= 0) {
    for (let i = fpStart + 2; i < rows.length; i++) {
      const r = rows[i];
      const d = r && coerceDate(r[0]);
      if (!d) break;
      purchases.push({ d: shiftDate(d, offsetDays), units: r[1], product: r[2], packSizeG: r[3], price: r[4] });
    }
  }

  // Medical context. Tolerates either layout: the "Medical Context" header in its
  // own cell with the body in the rows/cell below, OR the header and the whole
  // body merged into a single multi-line cell (header on the first line).
  let mcStart = -1;
  let inlineBody = '';
  for (let i = 0; i < rows.length; i++) {
    const cell = rows[i] && rows[i][0] != null ? String(rows[i][0]) : '';
    if (cell.split('\n')[0].trim().toLowerCase() === 'medical context') {
      mcStart = i;
      const nl = cell.indexOf('\n');
      if (nl >= 0) inlineBody = cell.slice(nl + 1);
      break;
    }
  }
  let context = '';
  if (mcStart >= 0) {
    const lines = [];
    if (inlineBody) lines.push(inlineBody);
    for (let i = mcStart + 1; i < rows.length; i++) {
      const cell = rows[i] ? rows[i][0] : null;
      lines.push(cell == null ? '' : String(cell));
    }
    context = lines.join('\n').replace(/\n+$/, '') + '\n';
  }

  const display = `${gaW} weeks ${gaD} day${gaD === 1 ? '' : 's'}`;
  const category = gestationalCategory(gaW, gaD);
  const earlyLines = early
    .map(
      (e) =>
        `    { date: ${jsStr(fmtDMY(e.d))}, fullDate: ${jsStr(fmtISO(e.d))}, weight: ${numOrNull(e.w)}, height: ${numOrNull(e.h)}, headCirc: ${numOrNull(e.hc)} }`,
    )
    .join(',\n');

  const topInner =
    `  name: ${jsStr(name)},\n` +
    `  sex: ${jsStr(sex)},\n` +
    `  feedingMode: ${jsStr(feedingMode)},\n` +
    `  birthDate: new Date(${birth.getUTCFullYear()}, ${birth.getUTCMonth()}, ${birth.getUTCDate()}),\n` +
    `  birthDateString: ${jsStr(fmtDMY(birth))},\n\n` +
    `  gestationalAge: {\n` +
    `    weeks: ${gaW},\n    days: ${gaD},\n    display: ${jsStr(display)},\n    category: ${jsStr(category)}\n  },\n\n` +
    `  birthMeasurements: {\n` +
    `    weight: ${numOrNull(valOf('birth weight (kg)'))},\n    length: ${numOrNull(valOf('birth length (cm)'))},\n    headCirc: ${numOrNull(valOf('birth head circumference (cm)'))}\n  },\n\n` +
    `  earlyWeightEntries: [\n${earlyLines}\n  ],`;

  const purchaseLines = purchases
    .map(
      (p) =>
        `    {\n      date:          ${jsStr(fmtDMY(p.d))},\n      units:         ${Number(p.units) || 0},\n      product:       ${jsStr(p.product || '')},\n      packSizeG:     ${Number(p.packSizeG) || 0},\n      pricePerUnit:  ${Number(p.price) || 0}\n    }`,
    )
    .join(',\n');
  const purchasesInner = `  formulaPurchases: [\n${purchaseLines}\n  ],`;

  const costInner =
    `  formulaCostBasis: {\n` +
    `    product: ${jsStr(String(valOf('formula product') ?? ''))},\n` +
    `    packSizeG: ${Number(valOf('formula pack size (g)')) || 0},\n` +
    `    packPrice: ${Number(valOf('formula pack price')) || 0},\n` +
    `    packYieldMl: ${Number(valOf('formula pack yield (ml)')) || 0},\n` +
    `    sourceNote: ${jsStr(String(valOf('formula price source') ?? ''))}\n` +
    `  },`;

  for (const cp of configPaths) {
    let src = fs.readFileSync(cp, 'utf8');
    src = injectBetween(src, 'SETUP:BEGIN', 'SETUP:END', topInner);
    src = injectBetween(src, 'SETUP:PURCHASES:BEGIN', 'SETUP:PURCHASES:END', purchasesInner);
    fs.writeFileSync(cp, src);
  }

  // The Angular app reads per-baby fields from this standalone, gitignored module
  // so no infant data is ever committed to source control.
  if (babyDataPath) {
    const babyData =
      `// Per-baby data — generated from the Excel "Setup" sheet by \`npm run data\`.\n` +
      `// Gitignored on purpose: edit the Setup sheet, never this file.\n` +
      `export const BABY_DATA = {\n${topInner}\n\n${purchasesInner}\n\n${costInner}\n};\n`;
    fs.writeFileSync(babyDataPath, babyData);
  }

  if (context && contextPath) fs.writeFileSync(contextPath, context);

  return { name, sex, birth: fmtDMY(birth), early: early.length, purchases: purchases.length, contextChars: context.length };
}

module.exports = { applySetup };
