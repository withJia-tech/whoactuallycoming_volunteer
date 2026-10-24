// Tests for apps-script/Logic.gs. Run with: npm test
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ctx = vm.createContext({});
for (const file of ['Logic.gs', 'Prompt.gs']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'apps-script', file), 'utf8'), ctx);
}
const L = ctx;

const NOW = Date.UTC(2026, 11, 1, 12); // 1 Dec 2026, 12:00 UTC
const hoursAgo = (h) => new Date(NOW - h * 3600000).toISOString();

test('normaliseMobile accepts SG mobiles and rejects the rest', () => {
  assert.equal(L.normaliseMobile('9123 4567'), '6591234567');
  assert.equal(L.normaliseMobile('+65 8123-4567'), '6581234567');
  assert.equal(L.normaliseMobile(81234567), '6581234567');
  assert.equal(L.normaliseMobile(''), null);
  assert.equal(L.normaliseMobile('1234567'), null);
  assert.equal(L.normaliseMobile('71234567'), null);
});

test('waLink encodes Chinese and spaces, and is empty without a valid number', () => {
  const link = L.waLink('91234567', '您好 Hi');
  assert.equal(link, 'https://wa.me/6591234567?text=' + encodeURIComponent('您好 Hi'));
  assert.equal(L.waLink('', 'Hi'), '');
});

test('event is ready only when Published and checked against onePA', () => {
  assert.equal(L.isEventReady({ status: 'Published', onepa_verified: true }), true);
  assert.equal(L.isEventReady({ status: 'published', onepa_verified: 'TRUE' }), true);
  assert.equal(L.isEventReady({ status: 'Published', onepa_verified: false }), false);
  assert.equal(L.isEventReady({ status: 'Draft', onepa_verified: true }), false);
});

test('daysBetween counts calendar days', () => {
  assert.equal(L.daysBetween('2026-12-03', '2026-12-05'), 2);
  assert.equal(L.daysBetween('2026-12-31', '2027-01-01'), 1);
  assert.equal(L.daysBetween('2026-12-05', '2026-12-03'), -2);
});

test('splitList drops empty "NA" and "nil" answers from the form', () => {
  assert.deepEqual([...L.splitList('Excursion; NA')], ['excursion']);
  assert.deepEqual([...L.splitList('Creating art, nil')], ['creating art']);
});

test('shortfall counts yeses, drafts and unexpired sent messages', () => {
  const role = { event_id: 'E1', role: 'Setup', need: 4 };
  const invites = [
    { event_id: 'E1', role: 'Setup', kind: 'invite', status: 'Yes' },
    { event_id: 'E1', role: 'Setup', kind: 'invite', status: 'Draft' },
    { event_id: 'E1', role: 'Setup', kind: 'invite', status: 'Sent', sent_at: hoursAgo(2) },
    { event_id: 'E1', role: 'Setup', kind: 'invite', status: 'Sent', sent_at: hoursAgo(30) }, // expired
    { event_id: 'E1', role: 'Setup', kind: 'invite', status: 'No' },
    { event_id: 'E1', role: 'Setup', kind: 'confirm', status: 'Draft' }, // confirmations don't hold places
    { event_id: 'E2', role: 'Setup', kind: 'invite', status: 'Yes' },
  ];
  assert.equal(L.shortfall(role, invites, NOW, 24), 1);
});

test('orderCandidates puts regulars first, then interest match, and skips who it should', () => {
  const role = { event_id: 'E1', role: 'Craft helper', tags: 'Creating art' };
  const volunteers = [
    { volunteer_id: 'N1', mobile: '81110001', volunteered_before: 'No', interests: 'Creating art' },
    { volunteer_id: 'R1', mobile: '81110002', volunteered_before: 'Yes', interests: 'Organizing events' },
    { volunteer_id: 'R2', mobile: '81110003', volunteered_before: 'Yes', interests: 'Creating art' },
    { volunteer_id: 'R3', mobile: '', volunteered_before: 'Yes', interests: 'Creating art' }, // no number
    { volunteer_id: 'R4', mobile: '81110004', volunteered_before: 'Yes', interests: 'Creating art', last_contacted: hoursAgo(24) }, // cooldown
    { volunteer_id: 'R5', mobile: '81110005', volunteered_before: 'Yes', interests: 'Creating art' }, // already invited
    { volunteer_id: 'N2', mobile: '81110006', volunteered_before: 'No', interests: 'Digital arts' },
  ];
  const invites = [{ event_id: 'E1', role: 'Setup', volunteer_id: 'R5', status: 'No' }];
  const ids = L.orderCandidates(volunteers, role, invites, { nowMs: NOW, cooldownDays: 14, skipIds: {} })
    .map((v) => v.volunteer_id);
  assert.deepEqual([...ids], ['R2', 'R1', 'N1', 'N2']);
});

test('fit mode puts matching interests first, regulars first within them', () => {
  const role = { event_id: 'E1', role: 'Craft helper', tags: 'Creating art' };
  const volunteers = [
    { volunteer_id: 'R0', mobile: '81110001', volunteered_before: 'Yes', interests: 'Performing arts' },
    { volunteer_id: 'N1', mobile: '81110002', volunteered_before: 'No', interests: 'Creating art' },
    { volunteer_id: 'R1', mobile: '81110003', volunteered_before: 'Yes', interests: 'Creating art' },
  ];
  const ids = L.orderCandidates(volunteers, role, [], { nowMs: NOW, cooldownDays: 14, mode: 'fit' }).map((v) => v.volunteer_id);
  assert.deepEqual([...ids], ['R1', 'N1', 'R0']);
});

test('invite only claims a good fit when interests match', () => {
  const f = { role: 'Setup', event: 'Test Day', date: 'Sat 5 Dec', time: '08:30', venue: 'Hall' };
  assert.match(L.inviteTemplate('EN', { ...f, fit: true }), /matches the interests/);
  assert.doesNotMatch(L.inviteTemplate('EN', { ...f, fit: false }), /matches the interests|good fit/);
  assert.doesNotMatch(L.inviteTemplate('ZH', { ...f, fit: false }), /\{fit\}|相符/);
});

test('validatePicks drops unknown or repeated IDs and caps the count', () => {
  const pool = [{ volunteer_id: 'A' }, { volunteer_id: 'B' }, { volunteer_id: 'C' }];
  const picks = [
    { volunteer_id: 'Z', reason: 'x', message: 'm' },
    { volunteer_id: 'A', reason: 'x', message: 'm' },
    { volunteer_id: 'A', reason: 'x', message: 'm' },
    { volunteer_id: 'B', reason: 'x', message: 'm' },
    { volunteer_id: 'C', reason: 'x', message: 'm' },
  ];
  assert.deepEqual([...L.validatePicks(picks, pool, 2).map((p) => p.volunteer_id)], ['A', 'B']);
});

test('finalInviteMessage fills the name and falls back when the AI misbehaves', () => {
  const v = { first_name: 'Mei', language: 'ZH' };
  const fields = { role: 'Setup', event: 'Test Day', date: 'Sat 5 Dec', time: '08:30', venue: 'Hall' };
  assert.equal(L.finalInviteMessage('{name}, join us?', v, fields), 'Mei, join us?');
  const noPlaceholder = L.finalInviteMessage('Hi there, join us?', v, fields);
  assert.match(noPlaceholder, /^Mei 您好/);
  const withNumber = L.finalInviteMessage('{name}, call 9123 4567', v, fields);
  assert.match(withNumber, /^Mei 您好/);
});

test('templates fill every field and keep the name placeholder for later', () => {
  const f = { role: 'Setup', event: 'Test Day', date: 'Sat 5 Dec', time: '08:30', venue: 'Hall', deadline: 'Fri 4 Dec, 8:00 PM' };
  for (const lang of ['EN', 'ZH', 'MS']) {
    const msg = L.confirmTemplate(lang, f);
    assert.ok(msg.includes('{name}'), lang);
    assert.ok(!/\{(role|event|date|time|venue|deadline)\}/.test(msg), lang);
  }
});

test('parseReply understands common yes and no replies', () => {
  for (const s of ['1', '1️⃣', 'ok', 'OK!', 'can', 'Can lah', 'yes', '👍', '👍🏽', '好的', '可以', 'boleh', 'ya', 'no problem']) {
    assert.equal(L.parseReply(s), '1', s);
  }
  for (const s of ['2', 'no', "can't", 'cannot make it', 'sorry', 'tak boleh', '不行', '来不了']) {
    assert.equal(L.parseReply(s), '2', s);
  }
  for (const s of ['', 'what time?', 'maybe', 'noted']) {
    assert.equal(L.parseReply(s), 'unclear', s);
  }
});

test('parseModelJson copes with code fences', () => {
  assert.equal(JSON.stringify(L.parseModelJson('```json\n{"picks": []}\n```')), '{"picks":[]}');
  assert.throws(() => L.parseModelJson('no json here'));
});

test('the AI prompt never contains names or phone numbers', () => {
  const pool = [{ volunteer_id: 'V01', first_name: 'Secret Name', mobile: '91234567', language: 'EN', volunteered_before: 'Yes', interests: 'Creating art' }];
  const prompt = L.buildMatchPrompt({ name: 'Test Day', date: 'Sat 5 Dec', venue: 'Hall' }, { role: 'Setup', time: '08:30', tags: 'Creating art' }, pool, 1);
  assert.ok(!prompt.includes('Secret Name'));
  assert.ok(!prompt.includes('91234567'));
  assert.ok(prompt.includes('V01'));
});
