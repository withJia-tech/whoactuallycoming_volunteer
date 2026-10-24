# Setting up the draft workflow (test version)

About 20 minutes. Use made-up volunteers until the plan's gate passes.

## What it does

Every night between 8 and 9 pm, for each event that is **Published** in your sheet **and** ticked as checked against onePA:

1. Messages with no reply after 24 hours become **No reply**, and that place reopens.
2. Roles that are still short get **invitation drafts**: regulars first, then newcomers.
3. Two days before the event, everyone who said yes gets a **confirmation draft**.
4. One line goes into the **Runs** tab with the counts.

It never sends anything. Each draft has a WhatsApp link. Tap it, check the message, and send it from your own phone.

## 1. Make the sheet

1. Create a new Google Sheet.
2. Make six tabs and import the matching file from `sample-data/` into each (File → Import → Upload → *Replace current sheet*):
   `Settings`, `Events`, `Roles`, `Volunteers`, `Invites`, `Runs`.
3. **Before tapping any link**, change the `mobile` column in `Volunteers` to your own number and the second organiser's. The sample numbers are made up but could belong to real people.

## 2. Add the script

1. In the sheet: Extensions → Apps Script.
2. Create four script files and paste in the matching files from `apps-script/`: `Code.gs`, `Logic.gs`, `Prompt.gs`, `Model.gs`.
3. Project Settings → tick *Show "appsscript.json"*, then paste in `apps-script/appsscript.json`.
4. Save, reload the sheet. A **Volunteers** menu appears.

## 3. Try it

1. Volunteers → **Make drafts now**. Approve the permissions Google asks for.
2. Open the `Invites` tab. You should see drafts for the Lantern Craft Day test event only: the Open Mic event isn't checked against onePA yet, and the Batik event isn't published.
3. Tap a link. WhatsApp opens with the message typed in.
4. Set the row's `status` to **Sent**. The time is stamped automatically.
5. Type their reply into `reply_text` (for example "can lah", "👍" or "不行"). The status becomes **Yes** or **No**. If the reply is unclear, the `note` column says so and you decide.

Volunteers → **Turn on nightly run** to have it run every evening.

## 4. Settings tab

| Key | Default | Meaning |
|---|---|---|
| `COOLDOWN_DAYS` | 14 | Don't invite someone who was messaged in the last N days |
| `REPLY_WINDOW_HOURS` | 24 | No reply after this long counts as "not coming" |
| `CONFIRM_DAYS_BEFORE` | 2 | When to draft the confirmation message |
| `RUN_HOUR` | 20 | The nightly run happens between this hour and the next |
| `ORDER` | `regulars` | `regulars`: regulars first, always. `fit`: people whose interests match the role first, regulars first within them |

## 5. Turning on an AI model (optional)

Without this, the script uses the standard templates and the priority order. That is enough for the test.

Apps Script → Project Settings → Script Properties:

| Property | Value |
|---|---|
| `AI_PROVIDER` | `anthropic`, `openai` or `gemini` (default `mock`, meaning no AI) |
| `AI_MODEL` | Model ID. Defaults to `claude-opus-5-5` for Anthropic; required for the others |
| `AI_API_KEY` | The provider's key. Only ever here, never in the repo or the sheet |

With a model set, it picks from the shortlist and writes each message in the volunteer's language. It only sees a volunteer ID, interests, language and whether they've volunteered before, never names or numbers. If the model fails or returns nonsense, the script falls back to the templates and writes why in `Runs`.

For Anthropic, the script turns on server-side fallback: if a safety check declines a request, the API retries it on another model.

## 6. Alert from Zapier (optional)

Point a Zap at **Google Sheets → New spreadsheet row** on the `Runs` tab, then send yourself the WhatsApp alert you already use, for example: *"{invite_drafts} invites and {confirm_drafts} confirmations ready."* That's one alert a night instead of one per sign-up.

## Before using real volunteers

- The plan's gate has passed (both test events).
- SCEC has agreed where volunteer data may sit (the Sheet; Zapier if you use the alert; the AI provider if you turn one on).
- A native speaker has checked the Chinese and Malay templates in `Logic.gs`.
- Role names and dates are in English inside the Chinese and Malay messages. Decide whether that's fine.
