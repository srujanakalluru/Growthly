const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const { applySetup } = require('./apply-setup');

const EXCEL_PATH  = process.argv[2] || 'data-source/Feeding Log.xlsx';
const DAILY_OUT   = 'generated/feeding-data.csv';
const SESSION_OUT = 'generated/sessions-data.csv';

// Optional extra date shift applied to the CSV output (0 = use the Excel's dates
// as-is). The project Excel already carries the anonymised (shifted) dates, so
// this stays 0; the parser only ever reads the workbook, never writes it.
const DATE_OFFSET_DAYS = 0;

// Maps any hour (0-23) to the nearest canonical 3-hour slot label.
// Pumping schedules drift over time (e.g. 12 AM → 1 AM, 3 AM → 4 AM) so we
// use circular nearest-anchor matching rather than exact hour lookup.
// Catchment is ±1.5 h: hours 0,1 → 12 AM; hours 2,3,4 → 3 AM; etc.
const SLOT_ANCHORS = [
  { hour:  0, label: '12:00 AM' },
  { hour:  3, label:  '3:00 AM' },
  { hour:  6, label:  '6:00 AM' },
  { hour:  9, label:  '9:00 AM' },
  { hour: 12, label: '12:00 PM' },
  { hour: 15, label:  '3:00 PM' },
  { hour: 18, label:  '6:00 PM' },
  { hour: 21, label:  '9:00 PM' },
];

function hourToNearestSlot(hour) {
  let bestLabel = null, bestDist = Infinity;
  for (const { hour: anchor, label } of SLOT_ANCHORS) {
    // circular distance on a 24-h clock
    const dist = Math.min(Math.abs(hour - anchor), 24 - Math.abs(hour - anchor));
    if (dist < bestDist) { bestDist = dist; bestLabel = label; }
  }
  return bestLabel;
}

// Plain object alias so HOUR_TO_SLOT[h] lookups resolve.
const HOUR_TO_SLOT = Object.fromEntries(
  Array.from({ length: 24 }, (_, h) => [h, hourToNearestSlot(h)])
);

if (!fs.existsSync(EXCEL_PATH)) {
  console.error(`Error: File not found → ${EXCEL_PATH}`);
  process.exit(1);
}

console.log(`Reading: ${EXCEL_PATH}`);
const workbook = XLSX.readFile(EXCEL_PATH);

// If the workbook has a "Setup" sheet, dump its values into the config files
// and the medical-context text file. No-op when the sheet is absent.
const setup = applySetup(workbook, {
  XLSX,
  configPaths: ['generated/config.js'],
  babyDataPath: 'src/app/core/config/baby-data.ts',
  contextPath: 'generated/Medical context.txt',
  offsetDays: DATE_OFFSET_DAYS,
});
if (setup) {
  console.log(`Setup applied → ${setup.name} (${setup.sex}), born ${setup.birth}, ${setup.early} early entries, ${setup.purchases} purchases, ${setup.contextChars} ctx chars`);
}

const dailySummaries = [];
const allSessions    = [];

workbook.SheetNames.forEach(sheetName => {
  // -- 1. Parse date from sheet name (DD-MM-YYYY) --------------------------
  const nameParts = sheetName.trim().split('-');
  if (nameParts.length !== 3) return;                       // skip malformed sheets

  const [dd, mm, yyyy] = nameParts;
  if (isNaN(parseInt(dd)) || isNaN(parseInt(mm)) || isNaN(parseInt(yyyy))) return;

  const shifted = new Date(Date.UTC(+yyyy, +mm - 1, +dd) + DATE_OFFSET_DAYS * 86400000);
  const p = (n) => String(n).padStart(2, '0');
  const sdd = p(shifted.getUTCDate());
  const smm = p(shifted.getUTCMonth() + 1);
  const syyyy = shifted.getUTCFullYear();
  const shortDate = `${sdd}/${smm}/${syyyy}`;              // DD/MM/YYYY  ← app format (shifted)
  const fullDate  = `${syyyy}-${smm}-${sdd}`;              // YYYY-MM-DD  ← app format (shifted)

  const sheet = workbook.Sheets[sheetName];
  const rows  = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });

  if (!rows || rows.length < 5) return;

  // Row 0: [date, null, null, bfLeftMins, null, bfRightMins, null,
  //         "Weight: X.XXX kg", "Height: XX.X cm", "Head Circumference: XX cm"]
  const row0 = rows[0] || [];

  const weight   = extractMeasurement(row0[7],  /Weight[:\s]*([\d.]+)/i);
  const height   = extractMeasurement(row0[8],  /Height[:\s]*([\d.]+)/i);
  const headCirc = extractMeasurement(row0[9],  /(?:Head\s*Circumference|Head\s*Circ|HC)[:\s]*([\d.]+)/i);

  let headerRowIndex = -1;
  for (let r = 0; r < Math.min(rows.length, 10); r++) {
    if (rows[r] && String(rows[r][0] ?? '').trim().toLowerCase().startsWith('time interval')) {
      headerRowIndex = r;
      break;
    }
  }
  if (headerRowIndex === -1) return;   // sheet doesn't have expected structure

  // Data rows start 2 after the header (skipping the Left/Right sub-header)
  const dataStart = headerRowIndex + 2;

  // Columns: 0=TimeSlot  1=BFLeft  2=BFRight  3=ExprMilk  4=Formula  5=PumpL  6=PumpR  7=FeedTime  8=PumpTime
  const daySessions = [];

  for (let i = dataStart; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;

    const firstCell = String(row[0] ?? '').trim();

    // Stop at the Total header row
    if (firstCell.toLowerCase().startsWith('total')) break;

    // Time slot is stored as an Excel datetime; extract the hour
    const timeSlot = parseTimeSlot(row[0]);
    if (!timeSlot) continue;   // row with no recognisable time slot → skip

    const exprMilk  = num(row[3]);
    const formula   = num(row[4]);
    const pumpLeft  = num(row[5]);
    const pumpRight = num(row[6]);

    const rawFeedTime = formatTimeCell(row[7]);
    const rawPumpTime = formatTimeCell(row[8]);

    const hasFeedData = exprMilk > 0 || formula > 0;
    const hasPumpData = pumpLeft > 0 || pumpRight > 0;

    // If no data → mark with ❌; if data exists → use actual time (or null if not entered)
    // Never overwrite an existing ❌
    const feedTime = hasFeedData ? rawFeedTime : '❌';
    const pumpTime = hasPumpData ? rawPumpTime : '❌';

    if (!hasFeedData && rawFeedTime && rawFeedTime !== '❌') {
      console.warn(`  ⚠ ${shortDate} ${timeSlot}: feedTime "${rawFeedTime}" cleared — no feed data`);
    }
    if (!hasPumpData && rawPumpTime && rawPumpTime !== '❌') {
      console.warn(`  ⚠ ${shortDate} ${timeSlot}: pumpTime "${rawPumpTime}" cleared — no pump data`);
    }

    // Only include rows that have at least one recorded value (❌ markers count)
    if (exprMilk || formula || pumpLeft || pumpRight || feedTime || pumpTime) {
      daySessions.push({ date: shortDate, timeSlot, exprMilk, formula, pumpLeft, pumpRight, feedTime, pumpTime });
    }
  }

  allSessions.push(...daySessions);

  // Layout after the "Total" header row:
  //   [null, bfLeft, bfRight, expr, formula, pumpLeft, pumpRight, deficit, ...]
  let expr = 0, form = 0, pumpLeft = 0, pumpRight = 0;

  const totalHeaderIdx = rows.findIndex(r => r && String(r[0] ?? '').trim().toLowerCase().startsWith('total'));
  if (totalHeaderIdx !== -1 && rows[totalHeaderIdx + 1]) {
    const totRow = rows[totalHeaderIdx + 1];
    expr      = num(totRow[3]);
    form      = num(totRow[4]);
    pumpLeft  = num(totRow[5]);
    pumpRight = num(totRow[6]);
  } else {
    // Fallback: sum from sessions if Total row is missing
    daySessions.forEach(s => {
      expr      += s.exprMilk;
      form      += s.formula;
      pumpLeft  += s.pumpLeft;
      pumpRight += s.pumpRight;
    });
  }

  // Count pump sessions: rows where a pumpTime was recorded
  const pumpCount = daySessions.filter(s => s.pumpTime).length;

  dailySummaries.push({ date: shortDate, fullDate, weight, height, headCirc, pumpLeft, pumpRight, expr, form, pumpCount });
});

if (!fs.existsSync('data')) fs.mkdirSync('data');

// Sort chronologically
dailySummaries.sort((a, b) => new Date(a.fullDate) - new Date(b.fullDate));
allSessions.sort((a, b) => {
  const da = dailySummaries.find(d => d.date === a.date)?.fullDate ?? a.date;
  const db = dailySummaries.find(d => d.date === b.date)?.fullDate ?? b.date;
  return new Date(da) - new Date(db) || a.timeSlot.localeCompare(b.timeSlot);
});

const dailyCSV = [
  'date,fullDate,weight,height,headCirc,pumpLeft,pumpRight,expr,form,pumpCount',
  ...dailySummaries.map(d =>
    [d.date, d.fullDate, d.weight ?? '', d.height ?? '', d.headCirc ?? '',
     d.pumpLeft, d.pumpRight, d.expr, d.form, d.pumpCount].join(',')
  )
].join('\n');

const sessionCSV = [
  'date,timeSlot,exprMilk,formula,pumpLeft,pumpRight,feedTime,pumpTime',
  ...allSessions.map(s =>
    [s.date, s.timeSlot, s.exprMilk, s.formula, s.pumpLeft, s.pumpRight,
     s.feedTime ?? '', s.pumpTime ?? ''].join(',')
  )
].join('\n');

fs.writeFileSync(DAILY_OUT,   dailyCSV);
fs.writeFileSync(SESSION_OUT, sessionCSV);

console.log(`\n✓ ${dailySummaries.length} days  →  ${DAILY_OUT}`);
console.log(`✓ ${allSessions.length} sessions  →  ${SESSION_OUT}`);

const withWeight = dailySummaries.filter(d => d.weight).length;
const withPump   = dailySummaries.filter(d => d.pumpLeft > 0 || d.pumpRight > 0).length;
console.log(`\n  Weight recorded : ${withWeight} days`);
console.log(`  Pump data       : ${withPump} days`);
if (dailySummaries.length > 0) {
  console.log(`  Date range      : ${dailySummaries[0].date} → ${dailySummaries[dailySummaries.length - 1].date}`);
}

/** Parse a number from a cell value (handles nulls, strings like "30ml") */
function num(val) {
  if (typeof val === 'number') return Math.round(val);
  if (!val) return 0;
  const m = String(val).match(/(\d+(\.\d+)?)/);
  return m ? Math.round(parseFloat(m[1])) : 0;
}

/** Extract a numeric measurement from a string cell like "Weight: 6.964 kg" */
function extractMeasurement(cell, regex) {
  if (!cell) return null;
  const m = String(cell).match(regex);
  return m ? parseFloat(m[1]) : null;
}

/**
 * Convert an Excel time-slot cell to a canonical slot label.
 * The cell is stored as an Excel datetime; XLSX decodes it to an object
 * with hour/minute, or it may already be a formatted string.
 */
function parseTimeSlot(cell) {
  if (cell == null) return null;

  // Already a string (e.g. "09:00:00" or "1:15:00")
  // Fuzzy-match: hour 1 → 12 AM slot, hour 4 → 3 AM slot, etc.
  if (typeof cell === 'string') {
    const m = cell.match(/^(\d{1,2}):(\d{2})/);
    if (m) return HOUR_TO_SLOT[parseInt(m[1])]; // always defined for 0-23
    return null;
  }

  // XLSX numeric time fraction (fraction of a 24-h day)
  if (typeof cell === 'number') {
    const totalMins = Math.round(cell * 24 * 60);
    const hour = Math.floor(totalMins / 60) % 24;
    return HOUR_TO_SLOT[hour];
  }

  // Already a JS Date decoded by XLSX
  if (cell instanceof Date) {
    return HOUR_TO_SLOT[cell.getHours()];
  }

  return null;
}

/** Format a feed/pump time cell to "H:MM AM/PM" string */
function formatTimeCell(cell) {
  if (cell == null) return null;

  if (typeof cell === 'string' && cell.trim()) return cell.trim();

  let h, m;

  if (typeof cell === 'number') {
    const totalMins = Math.round(cell * 24 * 60);
    h = Math.floor(totalMins / 60) % 24;
    m = totalMins % 60;
  } else if (cell instanceof Date) {
    h = cell.getHours();
    m = cell.getMinutes();
  } else {
    return null;
  }

  const period = h < 12 ? 'AM' : 'PM';
  const h12    = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}