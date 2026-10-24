/**
 * Calls whichever AI model is set in Script Properties. Swapping provider is
 * a settings change, not a code change:
 *
 *   AI_PROVIDER  mock (default, no AI, no cost) | anthropic | openai | gemini
 *   AI_MODEL     model ID (defaults to claude-opus-5-5 for anthropic; required for the others)
 *   AI_API_KEY   the provider's API key. Keep it here, never in the repo.
 *
 * Every provider returns the same thing: the parsed JSON object from the reply.
 */

function getAiConfig_() {
  var props = PropertiesService.getScriptProperties();
  var provider = String(props.getProperty('AI_PROVIDER') || 'mock').trim().toLowerCase();
  var model = String(props.getProperty('AI_MODEL') || '').trim();
  if (!model && provider === 'anthropic') model = 'claude-opus-5-5';
  return { provider: provider, model: model, key: props.getProperty('AI_API_KEY') || '' };
}

function callModelJson_(system, user, schema) {
  var cfg = getAiConfig_();
  if (cfg.provider === 'mock') throw new Error('callModelJson_ should not be used with the mock provider');
  if (!cfg.key) throw new Error('AI_API_KEY is not set in Script Properties');
  if (!cfg.model) throw new Error('AI_MODEL is not set in Script Properties');
  var adapters = { anthropic: anthropicRequest_, openai: openaiRequest_, gemini: geminiRequest_ };
  var adapter = adapters[cfg.provider];
  if (!adapter) throw new Error('Unknown AI_PROVIDER: ' + cfg.provider);
  return parseModelJson(adapter(cfg, system, user, schema));
}

function postJson_(url, headers, body) {
  var res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: headers,
    payload: JSON.stringify(body),
    muteHttpExceptions: true,
  });
  var code = res.getResponseCode();
  var text = res.getContentText();
  if (code < 200 || code >= 300) throw new Error('AI request failed (' + code + '): ' + text.slice(0, 500));
  return JSON.parse(text);
}

/** Anthropic Messages API. Structured output keeps the reply to the schema. */
function anthropicRequest_(cfg, system, user, schema) {
  var data = postJson_('https://api.anthropic.com/v1/messages', {
    'x-api-key': cfg.key,
    'anthropic-version': '2026-10-21',
    // If a safety check declines the request, the API retries it on a fallback model.
    'anthropic-beta': 'server-side-fallback-2026-07-01',
  }, {
    model: cfg.model,
    max_tokens: 16000,
    system: system,
    messages: [{ role: 'user', content: user }],
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: schema } },
    fallbacks: 'default',
  });
  if (data.stop_reason === 'refusal') throw new Error('The model declined this request');
  if (data.stop_reason === 'max_tokens') throw new Error('The model reply was cut off; too many candidates?');
  return (data.content || [])
    .filter(function (b) { return b.type === 'text'; })
    .map(function (b) { return b.text; })
    .join('');
}

/** OpenAI Chat Completions with a strict JSON schema. */
function openaiRequest_(cfg, system, user, schema) {
  var data = postJson_('https://api.openai.com/v1/chat/completions', {
    Authorization: 'Bearer ' + cfg.key,
  }, {
    model: cfg.model,
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    response_format: { type: 'json_schema', json_schema: { name: 'picks', schema: schema, strict: true } },
  });
  return data.choices && data.choices[0] && data.choices[0].message ? data.choices[0].message.content : '';
}

/** Google Gemini generateContent, asking for JSON back. */
function geminiRequest_(cfg, system, user, schema) {
  var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(cfg.model) + ':generateContent';
  var data = postJson_(url, { 'x-goog-api-key': cfg.key }, {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: user }] }],
    generationConfig: { responseMimeType: 'application/json' },
  });
  var parts = data.candidates && data.candidates[0] && data.candidates[0].content ? data.candidates[0].content.parts : [];
  return (parts || []).map(function (p) { return p.text || ''; }).join('');
}
