/**
 * Pure rules for the draft workflow. Nothing in this file touches the Sheet,
 * the network or the clock, so it can be tested locally with Node
 * (see test/logic.test.js).
 */

var INVITE_STATUS = {
  DRAFT: 'Draft',
  SENT: 'Sent',
  YES: 'Yes',
  NO: 'No',
  NO_REPLY: 'No reply',
};

/** Returns "65XXXXXXXX" for a valid Singapore mobile, otherwise null. */
function normaliseMobile(raw) {
  if (raw === null || raw === undefined) return null;
  var digits = String(raw).replace(/\D/g, '');
  if (digits.length === 10 && digits.indexOf('65') === 0) digits = digits.slice(2);
  if (!/^[3689]\d{7}$/.test(digits)) return null;
  return '65' + digits;
}

/** Click-to-chat link that opens WhatsApp with the message already typed. */
function waLink(mobile, text) {
  var number = normaliseMobile(mobile);
  if (!number) return '';
  return 'https://wa.me/' + number + '?text=' + encodeURIComponent(text);
}

function isTruthy(value) {
  if (value === true) return true;
  var s = String(value === undefined || value === null ? '' : value).trim().toLowerCase();
  return s === 'true' || s === 'yes' || s === 'y' || s === '1';
}

function isRegular(volunteer) {
  return isTruthy(volunteer.volunteered_before);
}

/** An event gets drafts only once it is published in the sheet AND checked against onePA. */
function isEventReady(event) {
  return String(event.status || '').trim().toLowerCase() === 'published' &&
    isTruthy(event.onepa_verified);
}

/** Whole days from one "yyyy-mm-dd" date to another. */
function daysBetween(fromYmd, toYmd) {
  var a = String(fromYmd).split('-').map(Number);
  var b = String(toYmd).split('-').map(Number);
  return Math.round((Date.UTC(b[0], b[1] - 1, b[2]) - Date.UTC(a[0], a[1] - 1, a[2])) / 86400000);
}

function splitList(value) {
  return String(value || '')
    .split(/[;,]/)
    .map(function (s) { return s.trim().toLowerCase(); })
    .filter(function (s) { return s && s !== 'na' && s !== 'nil' && s !== 'none'; });
}

/** How many of the role's interest tags this volunteer ticked. */
function interestScore(volunteer, role) {
  var mine = splitList(volunteer.interests);
  return splitList(role.tags).filter(function (tag) {
    return mine.some(function (m) { return m.indexOf(tag) !== -1 || tag.indexOf(m) !== -1; });
  }).length;
}

function hoursSince(isoOrDate, nowMs) {
  if (!isoOrDate) return Infinity;
  var t = new Date(isoOrDate).getTime();
  if (isNaN(t)) return Infinity;
  return (nowMs - t) / 3600000;
}

/** A sent message with no reply after the reply window counts as "not coming". */
function isExpired(invite, nowMs, windowHours) {
  return invite.status === INVITE_STATUS.SENT && hoursSince(invite.sent_at, nowMs) > windowHours;
}

/** Places still open for one role: needed, minus yeses, drafts and messages still waiting for a reply. */
function shortfall(role, invites, nowMs, windowHours) {
  var held = invites.filter(function (inv) {
    if (String(inv.event_id) !== String(role.event_id) || inv.role !== role.role) return false;
    if ((inv.kind || 'invite') !== 'invite') return false;
    if (inv.status === INVITE_STATUS.YES || inv.status === INVITE_STATUS.DRAFT) return true;
    return inv.status === INVITE_STATUS.SENT && !isExpired(inv, nowMs, windowHours);
  }).length;
  return Math.max(0, Number(role.need || 0) - held);
}

/**
 * Who may be invited to this role, best first: regulars before newcomers,
 * then by interest match, then whoever was contacted longest ago.
 * With opts.mode === 'fit', anyone whose interests match the role comes
 * before anyone whose don't (regulars still first within each group).
 * Skips invalid numbers, anyone already invited to this event, and anyone
 * contacted within the cooldown so the same people aren't asked every time.
 */
function orderCandidates(volunteers, role, invites, opts) {
  var invitedThisEvent = {};
  invites.forEach(function (inv) {
    if (String(inv.event_id) === String(role.event_id)) invitedThisEvent[String(inv.volunteer_id)] = true;
  });
  var skip = opts.skipIds || {};
  return volunteers
    .filter(function (v) {
      var id = String(v.volunteer_id);
      if (!id || invitedThisEvent[id] || skip[id]) return false;
      if (!normaliseMobile(v.mobile)) return false;
      return hoursSince(v.last_contacted, opts.nowMs) >= opts.cooldownDays * 24;
    })
    .map(function (v) {
      return { v: v, regular: isRegular(v), score: interestScore(v, role), idle: hoursSince(v.last_contacted, opts.nowMs) };
    })
    .sort(function (a, b) {
      // "fit" mode: people whose interests match the role come first, regulars first within them.
      if (opts.mode === 'fit' && (a.score > 0) !== (b.score > 0)) return a.score > 0 ? -1 : 1;
      if (a.regular !== b.regular) return a.regular ? -1 : 1;
      if (a.score !== b.score) return b.score - a.score;
      return b.idle - a.idle;
    })
    .map(function (x) { return x.v; });
}

/** Keeps only picks that are in the pool, unique, and capped at `limit`. */
function validatePicks(picks, pool, limit) {
  var allowed = {};
  pool.forEach(function (v) { allowed[String(v.volunteer_id)] = true; });
  var seen = {};
  var out = [];
  (picks || []).forEach(function (p) {
    var id = String(p && p.volunteer_id);
    if (!allowed[id] || seen[id] || out.length >= limit) return;
    seen[id] = true;
    out.push({ volunteer_id: id, reason: String(p.reason || '').trim(), message: String(p.message || '').trim() });
  });
  return out;
}

/** Picks without an AI model: the first `limit` people in the ordered pool. */
function mockPicks(pool, role, event, limit) {
  return pool.slice(0, limit).map(function (v) {
    var lang = langCode(v.language);
    return {
      volunteer_id: String(v.volunteer_id),
      reason: (isRegular(v) ? 'Regular' : 'Newcomer') + '; interests match ' + interestScore(v, role) + ' of the role tags',
      message: inviteTemplate(lang, { role: role.role, event: event.name, date: event.date, time: role.time, venue: event.venue, fit: interestScore(v, role) > 0 }),
    };
  });
}

function langCode(value) {
  var s = String(value || '').trim().toLowerCase();
  if (s === 'zh' || s === '中文' || s.indexOf('chinese') !== -1 || s === '华语') return 'ZH';
  if (s === 'ms' || s === 'bm' || s.indexOf('malay') !== -1 || s.indexOf('melayu') !== -1) return 'MS';
  return 'EN';
}

/** Replaces the {name} placeholder. The AI only ever sees the placeholder, never the name. */
function fillName(message, firstName) {
  var text = String(message || '');
  var name = String(firstName || '').trim() || 'there';
  if (text.indexOf('{name}') === -1) return text;
  return text.split('{name}').join(name);
}

/**
 * The message that goes into the sheet. Falls back to the standard template
 * if the AI forgot the {name} placeholder or slipped in anything that looks
 * like a phone number.
 */
function finalInviteMessage(pickMessage, volunteer, fields) {
  var msg = String(pickMessage || '');
  if (msg.indexOf('{name}') === -1 || /\d{8}/.test(msg.replace(/\s/g, ''))) {
    msg = inviteTemplate(langCode(volunteer.language), fields);
  }
  return fillName(msg, volunteer.first_name);
}

function fill_(template, f) {
  return template.replace(/\{(\w+)\}/g, function (all, key) {
    return f[key] === undefined || f[key] === null ? all : String(f[key]);
  });
}

/** Invitation text. Only says "good fit" when the volunteer's interests actually match the role. */
function inviteTemplate(lang, f) {
  var t = {
    EN: 'Hi {name}, we have a {role} slot at {event} on {date}, {time} at {venue}.{fit} Would you like to join? Reply 1 for yes, 2 for not this time.',
    ZH: '{name} 您好！{event} 有一个 {role} 的岗位，时间：{date} {time}，地点：{venue}。{fit}愿意参加的话请回复 1，这次不方便请回复 2。',
    MS: 'Salam {name}, ada tugas {role} untuk {event} pada {date}, {time} di {venue}.{fit} Sudi sertai? Balas 1 untuk ya, 2 jika tidak kali ini.',
  };
  var fitLine = { EN: ' It matches the interests you shared with us.', ZH: '这和您登记的兴趣很相符。', MS: ' Ia sesuai dengan minat yang anda kongsi.' };
  var key = t[lang] ? lang : 'EN';
  var fields = {};
  Object.keys(f).forEach(function (k) { fields[k] = f[k]; });
  fields.fit = f.fit ? fitLine[key] : '';
  return fill_(t[key], fields);
}

/** The T-2 confirmation from the plan (section 6). Chinese and Malay still need a native-speaker check. */
function confirmTemplate(lang, f) {
  var t = {
    EN: "Hi {name}, you're on {role} for {event} on {date}, {time} at {venue}. Please reply 1 to confirm, or 2 if you can't make it. If we don't hear from you by {deadline}, we'll offer the slot to someone else, so thank you for letting us know!",
    ZH: '{name} 您好！您在 {event} 担任 {role}，时间：{date} {time}，地点：{venue}。请回复 1 确认，或回复 2 表示无法出席。如在 {deadline} 前未收到回复，我们会把这个岗位安排给其他义工，谢谢您！',
    MS: 'Salam {name}, anda bertugas sebagai {role} untuk {event} pada {date}, {time} di {venue}. Sila balas 1 untuk sahkan, atau 2 jika tidak dapat hadir. Jika tiada balasan sebelum {deadline}, kami akan tawarkan tugas ini kepada sukarelawan lain, terima kasih!',
  };
  return fill_(t[lang] || t.EN, f);
}

/** Sorts a volunteer's reply into "1" (yes), "2" (no) or "unclear". Unclear ones go to the organiser. */
function parseReply(text) {
  var s = String(text || '').trim().toLowerCase().replace(/[.!~\s]+$/g, '');
  if (!s) return 'unclear';
  if (/^1(\uFE0F?\u20E3)?$/.test(s)) return '1';
  if (/^2(\uFE0F?\u20E3)?$/.test(s)) return '2';
  if (/^(no problem|no prob|np)\b/.test(s)) return '1';
  if (/^(no|nope|cannot|can't|cant|sorry|not this time|tidak|tak boleh|tak dapat)\b/.test(s)) return '2';
  if (/^(不行|不能|不可以|不方便|没空|来不了)/.test(s)) return '2';
  if (/^(ok|okay|okey|can|yes|y|sure|confirm|will come|see you|boleh|ya|insyaallah)\b/.test(s)) return '1';
  if (/^(👍|好|可以|会来)/.test(s)) return '1';
  return 'unclear';
}

/** Pulls a JSON object out of a model reply, tolerating code fences or stray text. */
function parseModelJson(text) {
  var s = String(text || '').trim();
  try { return JSON.parse(s); } catch (e) { /* fall through */ }
  var start = s.indexOf('{');
  var end = s.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('Model reply had no JSON object');
  return JSON.parse(s.slice(start, end + 1));
}
