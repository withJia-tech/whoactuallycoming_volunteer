/**
 * Who's Actually Coming: draft workflow (test version).
 *
 * Every night at 8 pm, for each event that is Published in the sheet AND
 * checked against onePA, this script:
 *   1. marks messages with no reply after the reply window as "No reply" (their place reopens),
 *   2. drafts invitations for roles that are still short: regulars first, then newcomers,
 *   3. drafts the T-2 confirmation for everyone who said yes,
 *   4. logs a line in the Runs tab (Zapier can alert you from it).
 *
 * It never sends anything. Each draft has a WhatsApp link: you tap it, check
 * the message, and send it from your own phone.
 */

var TABS = {
  Settings: ['key', 'value'],
  Events: ['event_id', 'name', 'date', 'start_time', 'venue', 'status', 'onepa_verified', 'onepa_ref'],
  Roles: ['event_id', 'role', 'time', 'need', 'tags'],
  Volunteers: ['volunteer_id', 'first_name', 'mobile', 'language', 'volunteered_before', 'interests', 'last_contacted'],
  Invites: ['created_at', 'event_id', 'role', 'kind', 'group', 'volunteer_id', 'first_name', 'language', 'reason', 'message', 'link', 'status', 'sent_at', 'reply_text', 'note'],
  Runs: ['run_at', 'event_id', 'invite_drafts', 'confirm_drafts', 'newcomers_waiting', 'note'],
};

// ORDER: 'regulars' = regulars first, always. 'fit' = people whose interests match the role first, regulars first within them.
var DEFAULT_SETTINGS = { COOLDOWN_DAYS: 14, REPLY_WINDOW_HOURS: 24, CONFIRM_DAYS_BEFORE: 2, RUN_HOUR: 20, ORDER: 'regulars' };

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Volunteers')
    .addItem('Make drafts now', 'makeDrafts')
    .addSeparator()
    .addItem('Set up tabs', 'setUpSheet')
    .addItem('Turn on nightly run', 'turnOnNightlyRun')
    .addItem('Turn off nightly run', 'turnOffNightlyRun')
    .addToUi();
}

/** Creates any missing tabs with their header row, and a status dropdown on Invites. */
function setUpSheet() {
  var ss = SpreadsheetApp.getActive();
  Object.keys(TABS).forEach(function (name) {
    var sheet = ss.getSheetByName(name) || ss.insertSheet(name);
    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, TABS[name].length).setValues([TABS[name]]).setFontWeight('bold');
      sheet.setFrozenRows(1);
    }
  });
  var invites = ss.getSheetByName('Invites');
  var statusCol = TABS.Invites.indexOf('status') + 1;
  var rule = SpreadsheetApp.newDataValidation()
    .requireValueInList([INVITE_STATUS.DRAFT, INVITE_STATUS.SENT, INVITE_STATUS.YES, INVITE_STATUS.NO, INVITE_STATUS.NO_REPLY], true)
    .build();
  invites.getRange(2, statusCol, invites.getMaxRows() - 1, 1).setDataValidation(rule);
}

function turnOnNightlyRun() {
  turnOffNightlyRun();
  var hour = Number(readSettings_().RUN_HOUR);
  ScriptApp.newTrigger('makeDrafts').timeBased().atHour(hour).everyDays(1).create();
  SpreadsheetApp.getActive().toast('Drafts will be made every day between ' + hour + ':00 and ' + (hour + 1) + ':00.');
}

function turnOffNightlyRun() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'makeDrafts') ScriptApp.deleteTrigger(t);
  });
}

/** Main run. Safe to run by hand at any time; it only adds drafts for places still open. */
function makeDrafts() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return;
  try {
    makeDraftsLocked_();
  } finally {
    lock.releaseLock();
  }
}

function makeDraftsLocked_() {
  var ss = SpreadsheetApp.getActive();
  var tz = ss.getSpreadsheetTimeZone();
  var settings = readSettings_();
  var nowMs = Date.now();
  var now = new Date(nowMs);
  var today = Utilities.formatDate(now, tz, 'yyyy-MM-dd');
  var windowHours = Number(settings.REPLY_WINDOW_HOURS);

  var events = readTab_('Events');
  var roles = readTab_('Roles').rows;
  var volunteers = readTab_('Volunteers').rows;
  var invitesTab = readTab_('Invites');

  // 1. Silence rule: no reply after the window means not coming, and the place reopens.
  invitesTab.rows.forEach(function (inv) {
    if (isExpired(inv, nowMs, windowHours)) {
      inv.status = INVITE_STATUS.NO_REPLY;
      setCell_(invitesTab, inv, 'status', INVITE_STATUS.NO_REPLY);
    }
  });

  var newInvites = [];
  var runRows = [];
  var pickedThisRun = {};
  var byId = {};
  volunteers.forEach(function (v) { byId[String(v.volunteer_id)] = v; });
  var deadline = Utilities.formatDate(new Date(nowMs + windowHours * 3600000), tz, 'EEE d MMM, h:mm a');

  var ready = events.rows.filter(isEventReady);
  ready.forEach(function (ev) {
    var evYmd = toYmd_(ev.date, tz);
    var days = daysBetween(today, evYmd);
    if (!evYmd || days < 0) return;
    var view = { name: ev.name, venue: ev.venue, date: Utilities.formatDate(new Date(evYmd + 'T12:00:00'), tz, 'EEE d MMM') };
    var all = function () { return invitesTab.rows.concat(newInvites); };
    var notes = [];
    var inviteCount = 0;
    var confirmCount = 0;

    // 2. Invitations for roles that are still short.
    roles.filter(function (r) { return String(r.event_id) === String(ev.event_id); }).forEach(function (role) {
      var need = shortfall(role, all(), nowMs, windowHours);
      if (!need) return;
      var ordered = orderCandidates(volunteers, role, all(), {
        nowMs: nowMs, cooldownDays: Number(settings.COOLDOWN_DAYS), skipIds: pickedThisRun,
        mode: String(settings.ORDER).trim().toLowerCase(),
      });
      var pool = ordered.slice(0, need * 2 + 2);
      if (!pool.length) {
        notes.push(role.role + ': short ' + need + ', no one left to invite');
        return;
      }
      choosePicks_(view, role, pool, need, notes).forEach(function (p) {
        var v = byId[p.volunteer_id];
        var fields = { role: role.role, event: view.name, date: view.date, time: role.time, venue: view.venue, fit: interestScore(v, role) > 0 };
        var message = finalInviteMessage(p.message, v, fields);
        newInvites.push({
          created_at: now, event_id: ev.event_id, role: role.role, kind: 'invite',
          group: isRegular(v) ? 'Regular' : 'Newcomer', volunteer_id: p.volunteer_id,
          first_name: v.first_name, language: langCode(v.language), reason: p.reason,
          message: message, link: waLink(v.mobile, message), status: INVITE_STATUS.DRAFT,
          sent_at: '', reply_text: '', note: '',
        });
        pickedThisRun[p.volunteer_id] = true;
        inviteCount++;
      });
    });

    // Visible trade-off of "regulars first": how many newcomers are free but not invited.
    var waiting = orderCandidates(volunteers, { event_id: ev.event_id, tags: '' }, all(), {
      nowMs: nowMs, cooldownDays: Number(settings.COOLDOWN_DAYS), skipIds: pickedThisRun,
    }).filter(function (v) { return !isRegular(v); }).length;

    // 3. T-2 confirmations for everyone who said yes (also catches short-notice events).
    if (days <= Number(settings.CONFIRM_DAYS_BEFORE)) {
      var confirmed = {};
      all().forEach(function (inv) {
        if (String(inv.event_id) === String(ev.event_id) && inv.kind === 'confirm') confirmed[String(inv.volunteer_id)] = true;
      });
      all().filter(function (inv) {
        return String(inv.event_id) === String(ev.event_id) && (inv.kind || 'invite') === 'invite' &&
          inv.status === INVITE_STATUS.YES && !confirmed[String(inv.volunteer_id)];
      }).forEach(function (inv) {
        var v = byId[String(inv.volunteer_id)];
        if (!v) return;
        var roleRow = roles.filter(function (r) { return String(r.event_id) === String(ev.event_id) && r.role === inv.role; })[0] || {};
        var message = fillName(confirmTemplate(langCode(v.language), {
          role: inv.role, event: view.name, date: view.date, time: roleRow.time || ev.start_time, venue: view.venue, deadline: deadline,
        }), v.first_name);
        newInvites.push({
          created_at: now, event_id: ev.event_id, role: inv.role, kind: 'confirm', group: inv.group,
          volunteer_id: inv.volunteer_id, first_name: v.first_name, language: langCode(v.language),
          reason: 'T-2 confirmation', message: message, link: waLink(v.mobile, message),
          status: INVITE_STATUS.DRAFT, sent_at: '', reply_text: '', note: '',
        });
        confirmed[String(inv.volunteer_id)] = true;
        confirmCount++;
      });
    }

    runRows.push([now, ev.event_id, inviteCount, confirmCount, waiting, notes.join('; ')]);
  });

  if (!ready.length) runRows.push([now, '', 0, 0, '', 'No events are both Published and checked against onePA']);
  appendObjects_('Invites', newInvites);
  appendRows_('Runs', runRows);
}

/** Uses the AI model if one is set; otherwise, or if it fails, takes the top of the ordered list. */
function choosePicks_(event, role, pool, limit, notes) {
  if (getAiConfig_().provider === 'mock') return mockPicks(pool, role, event, limit);
  try {
    var reply = callModelJson_(MATCH_SYSTEM_PROMPT, buildMatchPrompt(event, role, pool, limit), MATCH_SCHEMA);
    var picks = validatePicks(reply.picks, pool, limit);
    if (picks.length) return picks;
    notes.push(role.role + ': AI returned no usable picks, used the ordered list');
  } catch (err) {
    notes.push(role.role + ': AI failed (' + String(err.message || err).slice(0, 120) + '), used the ordered list');
  }
  return mockPicks(pool, role, event, limit);
}

/**
 * Small conveniences while you work the Invites tab:
 * - set status to Sent and the time is stamped, and the volunteer's last_contacted updates;
 * - type their reply into reply_text and status becomes Yes or No when the reply is clear.
 */
function onEdit(e) {
  var range = e.range;
  var sheet = range.getSheet();
  if (sheet.getName() !== 'Invites' || range.getRow() === 1 || range.getNumRows() !== 1 || range.getNumColumns() !== 1) return;
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var col = headers[range.getColumn() - 1];
  var row = range.getRow();
  var cell = function (name) { return sheet.getRange(row, headers.indexOf(name) + 1); };

  if (col === 'status' && e.value === INVITE_STATUS.SENT && !cell('sent_at').getValue()) {
    var now = new Date();
    cell('sent_at').setValue(now);
    markContacted_(cell('volunteer_id').getValue(), now);
  }
  if (col === 'reply_text') {
    var answer = parseReply(e.value);
    if (answer === '1') cell('status').setValue(INVITE_STATUS.YES);
    else if (answer === '2') cell('status').setValue(INVITE_STATUS.NO);
    cell('note').setValue(answer === 'unclear' ? 'Reply unclear, please check' : '');
  }
}

function markContacted_(volunteerId, when) {
  var tab = readTab_('Volunteers');
  tab.rows.forEach(function (v) {
    if (String(v.volunteer_id) === String(volunteerId)) setCell_(tab, v, 'last_contacted', when);
  });
}

// ---- Sheet helpers ---------------------------------------------------------

function readTab_(name) {
  var sheet = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sheet) throw new Error('Missing tab "' + name + '". Use Volunteers > Set up tabs.');
  var values = sheet.getDataRange().getValues();
  var headers = values.length ? values[0].map(String) : [];
  var rows = values.slice(1).map(function (r, i) {
    var o = { _row: i + 2 };
    headers.forEach(function (h, j) { o[h] = r[j]; });
    return o;
  }).filter(function (o) {
    return headers.some(function (h) { return o[h] !== '' && o[h] !== null; });
  });
  return { sheet: sheet, headers: headers, rows: rows };
}

function setCell_(tab, rowObj, header, value) {
  var col = tab.headers.indexOf(header);
  if (col === -1) throw new Error('Tab "' + tab.sheet.getName() + '" has no column "' + header + '"');
  tab.sheet.getRange(rowObj._row, col + 1).setValue(value);
}

function appendObjects_(name, objects) {
  if (!objects.length) return;
  var headers = readTab_(name).headers;
  appendRows_(name, objects.map(function (o) {
    return headers.map(function (h) { return o[h] === undefined ? '' : o[h]; });
  }));
}

function appendRows_(name, rows) {
  if (!rows.length) return;
  var sheet = SpreadsheetApp.getActive().getSheetByName(name);
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
}

function readSettings_() {
  var out = {};
  Object.keys(DEFAULT_SETTINGS).forEach(function (k) { out[k] = DEFAULT_SETTINGS[k]; });
  var sheet = SpreadsheetApp.getActive().getSheetByName('Settings');
  if (!sheet) return out;
  sheet.getDataRange().getValues().slice(1).forEach(function (r) {
    var key = String(r[0]).trim();
    if (key && r[1] !== '' && r[1] !== null) out[key] = r[1];
  });
  return out;
}

function toYmd_(value, tz) {
  if (value instanceof Date) return Utilities.formatDate(value, tz, 'yyyy-MM-dd');
  var s = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
}
