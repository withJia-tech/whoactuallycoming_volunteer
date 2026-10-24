# Who's Actually Coming

Volunteer management for Keat Hong arts & culture events.

**The problem:** volunteers say yes, fewer turn up, and organisers find out on the day after hours of chasing people one by one.

**The goal:** 48 hours before an event, the organiser knows who is coming, by name and role, and how many people each role is short, with less chasing than today.

## Status

Planning, plus a test version of the draft workflow that runs on made-up data only (see below). No real volunteer gets a message until the plan's gate passes. The plan tests one rule on two real events:

> Send one private message 48 hours before, naming the volunteer's role and time. They reply 1 to confirm or 2 if they can't come.

| Now | Next (after the gate) | Later (only if both events pass) |
|---|---|---|
| Baseline numbers from the last event | Prepare the sheet, message templates and organiser how-to | Automatic reply logging |
| Desk check: no-show rate by role | Run on a onePA event | Day-before reminder, buddy pairing |
| Talk to 3–5 no-shows | Run on a ground event, sent by a second organiser | Light role matching |
| Gate: is the cause soft yeses, or role fit? | Review | Overbooking per time slot |

## How it works today

Google Form → Google Sheet → Zapier → WhatsApp alert **to the organiser** (not to volunteers). The organiser then messages each volunteer by hand.

## Design direction

- Messages go out from the organiser's own WhatsApp, using pre-written links (`wa.me`) built in the sheet. This keeps them personal, needs no WhatsApp Business account, and gets no third-party bulk sender involved.
- Any AI step (matching interests to roles, drafting messages in English, 中文 and Melayu, reading replies) works with any model provider, not just one. A person approves every message before it is sent.

## Draft workflow (test version)

A Google Apps Script that runs inside the Sheet every night at 8 pm. For events that are Published and checked against onePA, it drafts invitations (regulars first, then newcomers) and the T−2 confirmations, each with a WhatsApp link the organiser taps to send. It never sends anything itself.

- `apps-script/`: the script (`Code.gs`), the rules (`Logic.gs`), the AI prompt (`Prompt.gs`) and the provider switch (`Model.gs`)
- `sample-data/`: made-up tabs to import into a test Sheet
- `docs/setup.md`: how to set it up
- `test/`: run `npm test` (Node 18+)

## Data rules

This repo is **public**. It holds code, templates and made-up test data only.

- Never commit real names, phone numbers, form exports or chat screenshots.
- Never commit API keys. Keep them in the script's settings.
- No reliability scores or "unreliable volunteer" flags, anywhere.
