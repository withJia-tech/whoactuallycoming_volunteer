// End-to-end check of Code.gs against an in-memory stand-in for Google Sheets,
// loaded from sample-data/*.csv. Uses the mock provider, so no AI is called.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const TZ = 'Asia/Singapore';

function loadCsv(name) {
  const text = fs.readFileSync(path.join(ROOT, 'sample-data', name + '.csv'), 'utf8').trim();
  return text.split('\n').map((line) => line.split(','));
}

function fakeSheet(name, values) {
  const sheet = {
    values,
    getName: () => name,
    getLastRow: () => sheet.values.length,
    getLastColumn: () => sheet.values[0].length,
    getMaxRows: () => 1000,
    setFrozenRows() {},
    getDataRange: () => ({ getValues: () => sheet.values.map((r) => r.slice()) }),
    getRange(row, col, numRows = 1, numCols = 1) {
      return {
        setValue(v) { while (sheet.values.length < row) sheet.values.push([]); sheet.values[row - 1][col - 1] = v; },
        setValues(rows) {
          rows.forEach((r, i) => {
            while (sheet.values.length < row + i) sheet.values.push([]);
            r.forEach((v, j) => { sheet.values[row - 1 + i][col - 1 + j] = v; });
          });
          return { setFontWeight() {} };
        },
        getValue: () => (sheet.values[row - 1] || [])[col - 1],
        getValues: () => sheet.values.slice(row - 1, row - 1 + numRows).map((r) => r.slice(col - 1, col - 1 + numCols)),
        setDataValidation() {},
      };
    },
  };
  return sheet;
}

function formatDate(date, tz, pattern) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hour: 'numeric', minute: '2-digit', hour12: true,
  }).formatToParts(date).map((p) => [p.type, p.value]));
  const monthShort = new Intl.DateTimeFormat('en-GB', { timeZone: tz, month: 'short' }).format(date);
  if (pattern === 'yyyy-MM-dd') return `${parts.year}-${parts.month}-${parts.day}`;
  if (pattern === 'EEE d MMM') return `${parts.weekday} ${Number(parts.day)} ${monthShort}`;
  if (pattern === 'EEE d MMM, h:mm a') return `${parts.weekday} ${Number(parts.day)} ${monthShort}, ${parts.hour}:${parts.minute} ${parts.dayPeriod.toUpperCase()}`;
  throw new Error('Unhandled pattern ' + pattern);
}

function setup(nowIso) {
  const sheets = {};
  for (const name of ['Settings', 'Events', 'Roles', 'Volunteers', 'Invites', 'Runs']) sheets[name] = fakeSheet(name, loadCsv(name));
  const RealDate = Date;
  const fixed = new RealDate(nowIso).getTime();
  class FixedDate extends RealDate {
    constructor(...a) { if (a.length === 0) super(fixed); else super(...a); }
    static now() { return fixed; }
  }
  const ctx = vm.createContext({
    Date: FixedDate,
    SpreadsheetApp: { getActive: () => ({ getSpreadsheetTimeZone: () => TZ, getSheetByName: (n) => sheets[n] || null }) },
    Utilities: { formatDate },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => null }) },
    encodeURIComponent,
  });
  for (const f of ['Logic.gs', 'Prompt.gs', 'Model.gs', 'Code.gs']) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'apps-script', f), 'utf8'), ctx, { filename: f });
  }
  const rows = (name) => {
    const [h, ...r] = sheets[name].values;
    return r.map((row) => Object.fromEntries(h.map((k, i) => [k, row[i]])));
  };
  return { ctx, sheets, rows };
}

test('nightly run drafts invites for the ready event only, regulars first', () => {
  const { ctx, rows } = setup('2026-11-20T12:00:00Z'); // 15 days before E1
  ctx.makeDrafts();
  const invites = rows('Invites');
  // Only E1 is Published + onePA-verified.
  assert.ok(invites.every((i) => i.event_id === 'E1'));
  // E1 needs 2 + 2 + 1 = 5; there are 6 volunteers with valid numbers, one per run each.
  assert.equal(invites.length, 5);
  assert.ok(invites.every((i) => i.status === 'Draft' && i.kind === 'invite'));
  // Setup goes to the two regulars first.
  const setup1 = invites.filter((i) => i.role === 'Setup').map((i) => i.first_name).sort();
  assert.deepEqual(setup1, ['Test Alice', 'Test Boon']);
  // Nobody is invited twice, the volunteer with no number is skipped.
  const ids = invites.map((i) => i.volunteer_id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(!ids.includes('V07'));
  // Messages are filled and links open WhatsApp with the message typed in.
  for (const i of invites) {
    assert.ok(!i.message.includes('{'), i.message);
    assert.ok(i.message.includes(i.first_name), i.message);
    assert.ok(i.link.startsWith('https://wa.me/65'), i.link);
  }
  const zh = invites.find((i) => i.language === 'ZH');
  assert.ok(zh && /您好/.test(zh.message));
  const runs = rows('Runs');
  assert.equal(runs.length, 1);
  assert.equal(runs[0].event_id, 'E1');
  assert.equal(runs[0].invite_drafts, 5);
});

test('a second run adds nothing while drafts still hold the places', () => {
  const { ctx, rows } = setup('2026-11-20T12:00:00Z');
  ctx.makeDrafts();
  ctx.makeDrafts();
  assert.equal(rows('Invites').length, 5);
});

test('silence rule reopens places, and T-2 confirmations go to people who said yes', () => {
  const { ctx, sheets, rows } = setup('2026-11-20T12:00:00Z');
  ctx.makeDrafts();
  const inv = sheets.Invites;
  const h = inv.values[0];
  const col = (k) => h.indexOf(k);
  // First two invites: one said yes, one never replied (sent 3 days ago).
  inv.values[1][col('status')] = 'Yes';
  inv.values[2][col('status')] = 'Sent';
  inv.values[2][col('sent_at')] = '2026-11-30T12:00:00Z';
  // Remaining drafts were not sent; mark them No so they free up too.
  for (let r = 3; r < inv.values.length; r++) inv.values[r][col('status')] = 'No';

  // Run again on 3 Dec, two days before E1.
  const later = setup('2026-12-03T12:00:00Z');
  later.sheets.Invites.values = inv.values.map((r) => r.slice());
  later.ctx.makeDrafts();
  const after = later.rows('Invites');
  assert.equal(after[1].status, 'No reply', 'silent invite is marked No reply');
  const confirms = after.filter((i) => i.kind === 'confirm');
  assert.equal(confirms.length, 1);
  assert.equal(confirms[0].volunteer_id, after[0].volunteer_id);
  assert.match(confirms[0].message, /reply 1 to confirm|回复 1|balas 1/i);
});

test('onEdit stamps Sent time and reads replies into Yes/No', () => {
  const { ctx, sheets, rows } = setup('2026-11-20T12:00:00Z');
  ctx.makeDrafts();
  const h = sheets.Invites.values[0];
  const edit = (row, key, value) => {
    sheets.Invites.values[row - 1][h.indexOf(key)] = value;
    ctx.onEdit({
      value,
      range: {
        getSheet: () => sheets.Invites, getRow: () => row, getColumn: () => h.indexOf(key) + 1,
        getNumRows: () => 1, getNumColumns: () => 1,
      },
    });
  };
  edit(2, 'status', 'Sent');
  edit(2, 'reply_text', 'Can lah');
  edit(3, 'reply_text', 'what time ah?');
  const invites = rows('Invites');
  assert.ok(invites[0].sent_at, 'sent_at stamped');
  assert.equal(invites[0].status, 'Yes');
  assert.equal(invites[1].note, 'Reply unclear, please check');
  const vol = rows('Volunteers').find((v) => v.volunteer_id === invites[0].volunteer_id);
  assert.ok(vol.last_contacted, 'last_contacted updated');
});
