/**
 * The one prompt the workflow sends to an AI model. It is plain text, so it
 * works the same with any provider (see Model.gs).
 *
 * Privacy: the model never sees names or phone numbers. It gets an ID,
 * interests, language and whether the person has volunteered before, and it
 * writes {name} where the first name goes. The script fills the name in
 * afterwards.
 */

var MATCH_SYSTEM_PROMPT = [
  'You help a volunteer organiser at a Singapore community centre invite volunteers to a role at an event.',
  'You choose who to invite from a candidate list and write each person a short, warm WhatsApp invitation.',
  '',
  'How to choose:',
  '- Pick at most the number of people asked for.',
  '- The list is already in the organiser\'s priority order. Keep that order unless someone clearly does not fit the role.',
  '- Prefer people whose interests fit the role. If nobody fits well, still pick from the top of the list.',
  '- Only use volunteer_id values from the list.',
  '',
  'How to write each message:',
  "- Write in the person's language: EN = English, ZH = Simplified Chinese, MS = Bahasa Melayu.",
  '- Start with "{name}" exactly as written, where the first name goes. Never invent a name.',
  '- At most three short sentences: the role, event, date, time and venue; if their interests match the role, one line saying so (never claim a fit that is not in their interests); then "Reply 1 for yes, 2 for not this time" (translated).',
  '- No mention of other volunteers. No emojis beyond one at most. Plain, friendly tone suitable for older volunteers.',
  '',
  'For each pick, give a one-line reason the organiser can read, in English.',
].join('\n');

/** JSON shape the model must return. Kept strict so every provider can enforce it. */
var MATCH_SCHEMA = {
  type: 'object',
  properties: {
    picks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          volunteer_id: { type: 'string' },
          reason: { type: 'string' },
          message: { type: 'string' },
        },
        required: ['volunteer_id', 'reason', 'message'],
        additionalProperties: false,
      },
    },
  },
  required: ['picks'],
  additionalProperties: false,
};

function buildMatchPrompt(event, role, pool, limit) {
  var candidates = pool.map(function (v) {
    return {
      volunteer_id: String(v.volunteer_id),
      regular: isRegular(v),
      language: langCode(v.language),
      interests: splitList(v.interests),
    };
  });
  return [
    'Event: ' + event.name,
    'Date: ' + event.date + ', venue: ' + event.venue,
    'Role: ' + role.role + ' at ' + role.time,
    'Interests that fit this role: ' + (splitList(role.tags).join(', ') || 'any'),
    'Number of people to invite: ' + limit,
    '',
    'Candidates (in priority order):',
    JSON.stringify(candidates, null, 2),
    '',
    'Reply with JSON only: {"picks": [{"volunteer_id": "...", "reason": "...", "message": "..."}]}',
  ].join('\n');
}
