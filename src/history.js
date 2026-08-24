// src/history.js — Member 5: Historical Tracking
// Appends one line per audit to history.csv and prints a table via --history.
const fs = require('fs');
const path = require('path');

const HISTORY_FILE = path.join(process.cwd(), 'history.csv');
const HEADER = 'date,url,grade,carbon_grams,total_kb,requests,load_ms,dom_nodes,script_ms,cached';

const esc = (v) => {
  const s = v === undefined || v === null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const r2 = (n) => (Number.isFinite(n) ? Math.round(n * 100) / 100 : '');

/**
 * Append an audit to history.csv.
 * @param {string} url           normalized URL that was audited
 * @param {object} data          object returned by analyzePage()
 * @param {number} carbonGrams   from estimateCarbon()
 * @param {string} grade         from getGrade()
 * @param {boolean} fromCache    whether this run used the cached snapshot
 */
function appendHistory(url, data, carbonGrams, grade, fromCache = false, historyFile = HISTORY_FILE) {
  const row = [
    new Date().toISOString(),
    url,
    grade,
    r2(carbonGrams),
    r2(data.totalBytes / 1024),
    data.resourceCount ?? '',
    data.loadTime ?? '',
    data.domNodeCount ?? '',
    r2((data.scriptDuration || 0) * 1000),
    fromCache ? 'yes' : 'no'
  ];
  const exists = fs.existsSync(historyFile);
  fs.appendFileSync(historyFile, (exists ? '' : HEADER + '\n') + row.map(esc).join(',') + '\n');
  return historyFile;
}

function parseLine(line) {
  const out = [];
  let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

function readHistory(historyFile = HISTORY_FILE) {
  if (!fs.existsSync(historyFile)) return [];
  const lines = fs.readFileSync(historyFile, 'utf8').split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',');
  return lines.slice(1).map((l) => {
    const cells = parseLine(l);
    return Object.fromEntries(headers.map((h, i) => [h, cells[i] ?? '']));
  });
}

/** Print all past audits (optionally filtered by URL substring) plus per-URL trend. */
function printHistory({ url, historyFile = HISTORY_FILE } = {}) {
  let rows = readHistory(historyFile);
  if (url) rows = rows.filter((r) => r.url.includes(url));

  if (rows.length === 0) {
    console.log('\n📭 No audit history yet. Run `node index.js <url>` to create the first entry.\n');
    return;
  }

  console.log(`\n📜 AUDIT HISTORY — ${rows.length} record${rows.length === 1 ? '' : 's'} (${historyFile})\n`);
  console.table(
    rows.map((r) => ({
      Date: r.date.slice(0, 16).replace('T', ' '),
      URL: r.url.length > 42 ? r.url.slice(0, 39) + '...' : r.url,
      Grade: r.grade,
      'CO2e (g)': r.carbon_grams,
      'Weight (KB)': r.total_kb,
      Requests: r.requests,
      'DOM nodes': r.dom_nodes,
      'Script (ms)': r.script_ms,
      Cached: r.cached
    }))
  );

  const byUrl = {};
  for (const r of rows) (byUrl[r.url] ||= []).push(r);
  const trends = [];
  for (const [u, list] of Object.entries(byUrl)) {
    if (list.length < 2) continue;
    const first = Number(list[0].carbon_grams);
    const last = Number(list[list.length - 1].carbon_grams);
    if (!(first > 0) || !Number.isFinite(last)) continue;
    const pct = ((last - first) / first) * 100;
    const verdict = pct < -0.5 ? '🌱 greener' : pct > 0.5 ? '🔥 worse' : '➡️  unchanged';
    trends.push(`  ${u}: ${list[0].grade} → ${list[list.length - 1].grade}, ${first}g → ${last}g (${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%) ${verdict} over ${list.length} audits`);
  }
  if (trends.length) {
    console.log('📈 TRENDS (first vs latest audit per site)');
    trends.forEach((t) => console.log(t));
    console.log();
  }
}

function clearHistory(historyFile = HISTORY_FILE) {
  if (fs.existsSync(historyFile)) {
    fs.unlinkSync(historyFile);
    console.log('🗑️  History cleared.');
  } else {
    console.log('Nothing to clear.');
  }
}

module.exports = { HISTORY_FILE, appendHistory, readHistory, printHistory, clearHistory };
