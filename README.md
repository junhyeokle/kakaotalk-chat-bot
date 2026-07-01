# KakaoTalk Chat Bot

A group-chat AI bot that logs into a **real KakaoTalk account** via the unofficial
[`node-kakao`](https://www.npmjs.com/package/node-kakao) library, joins group chats,
and replies like a human friend using an LLM (Gemini or OpenAI). It keeps per-room
conversation memory and configuration in Firebase Firestore.

> ⚠️ **Risk disclaimer — read before using.**
> `node-kakao` is an **unofficial, reverse-engineered** client that is no longer
> actively maintained. Automating a personal KakaoTalk account this way **violates
> KakaoTalk's Terms of Service** and can result in **temporary or permanent account
> suspension**. Use a throwaway/secondary account, never your primary one, and
> understand you are doing this **at your own risk**. This project is for
> educational purposes only.

---

## How it works

1. **Login (one-time):** `npm run login` prompts for your KakaoTalk email/password,
   completes device-passcode registration if needed, and saves the session tokens
   to `.kakao-session.json` (gitignored — it grants full account access).
2. **Run:** `npm run dev` reuses the saved session to reconnect and starts listening
   for messages.
3. For each incoming message the bot: logs it to Firestore → refreshes the room's
   long-term summary if enough new messages have accumulated → decides whether to
   respond (always if its name is mentioned, otherwise a configurable random
   chance) → builds an LLM prompt from the persona + room summary + recent
   room history → generates a reply → waits a human-like typing delay → sends →
   logs the reply.

## Project structure

```
src/
  index.ts               bootstrap: login with saved session, register listeners
  config.ts              loads/validates env vars
  kakao/
    client.ts            TalkClient wrapper: login, chat subscription, send helper
    session.ts           persist/reuse login session (.kakao-session.json)
  firebase/
    admin.ts             firebase-admin init from service account
    memoryStore.ts       per-room recent message history (capped at 20)
    configStore.ts       per-room enabled flag, engagement probability, persona,
                          long-term summary + message counter
  llm/
    types.ts             LlmProvider interface
    gemini.ts            Gemini implementation
    openai.ts            OpenAI implementation
    index.ts             factory selecting provider via LLM_PROVIDER
  persona/
    defaultPersona.ts    default persona system prompt
    promptBuilder.ts     persona + room summary + history + message -> LLM context
    summarizer.ts         folds recent history into the room's rolling long-term summary
  bot/
    triggerEngine.ts     mention/probabilistic engagement decision
    humanize.ts          typing delay + optional message splitting
    messageHandler.ts    end-to-end incoming-message pipeline
  scripts/
    login.ts             interactive one-time login script
```

## Prerequisites

- Node.js 18+
- A **Firebase project** with Firestore enabled, and a service account JSON key
  (Project Settings → Service accounts → Generate new private key).
- An LLM API key: **Gemini** (`GEMINI_API_KEY`) or **OpenAI** (`OPENAI_API_KEY`).
- A KakaoTalk account (preferably a secondary/test account — see disclaimer).

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Configure environment:

   ```bash
   cp .env.example .env
   ```

   Then edit `.env`:

   | Variable | Description |
   | --- | --- |
   | `LLM_PROVIDER` | `gemini` or `openai` |
   | `GEMINI_API_KEY` | required if `LLM_PROVIDER=gemini` |
   | `OPENAI_API_KEY` | required if `LLM_PROVIDER=openai` |
   | `KAKAO_BOT_NAME` | the name the bot responds to when mentioned |
   | `ENGAGEMENT_PROBABILITY` | default chance (0–1) of replying when not mentioned (e.g. `0.15`) |
   | `FIREBASE_SERVICE_ACCOUNT_PATH` | path to your Firebase service account JSON |
   | `SUMMARY_UPDATE_INTERVAL` | messages per room before the long-term summary is refreshed (default `30`) |

3. Place your Firebase service account JSON at the path in
   `FIREBASE_SERVICE_ACCOUNT_PATH` (default `./firebase-service-account.json`).
   This file is gitignored.

## First-time login

```bash
npm run login
```

You'll be prompted for your KakaoTalk email and password. If the device isn't
registered yet, KakaoTalk sends a **passcode** (via email/SMS/the app) — enter it
when asked. On success a `.kakao-session.json` file is written and reused on every
subsequent run, so you won't need to log in again unless the session expires.

## Running the bot

```bash
npm run dev        # development (ts-node)
```

or build and run compiled output:

```bash
npm run build
npm start
```

## Per-room configuration

Room settings live in Firestore under `rooms/{channelId}`:

- `enabled` (boolean) — turn the bot off for a room without stopping the process.
- `engagementProbability` (number) — override the default random reply chance.
- `personaOverride` (string) — replace the default persona prompt for that room.
- `summary` (string) — the room's rolling long-term memory, auto-generated.
- `messagesSinceSummary` (number) — internal counter, resets each time `summary`
  is refreshed.

Messages are stored under `rooms/{channelId}/messages` and capped at the 20 most
recent (this is the short-term window fed to the LLM verbatim). Once
`SUMMARY_UPDATE_INTERVAL` new messages accumulate in a room, the bot asks the LLM
to fold them into `summary` — this is what lets the bot "remember" things (who's
who, running jokes, past events) well beyond the 20-message short-term window.

## Running 24/7 on a VPS

The bot only stays connected to KakaoTalk while its Node process is running, so
for a group chat to get replies at any hour it needs to run on a server that's
always on (Oracle Cloud free tier, AWS EC2, Naver Cloud, etc. — any Ubuntu/Debian
VPS works the same way).

1. **Provision a small VPS** (1 vCPU / 1GB RAM is enough) and SSH in.

2. **Install Node.js 18+** (via [nvm](https://github.com/nvm-sh/nvm) is easiest):

   ```bash
   curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
   source ~/.bashrc
   nvm install 18
   ```

3. **Install PM2** globally — it keeps the process alive, restarts it on crash,
   and can bring it back up after a server reboot:

   ```bash
   npm install -g pm2
   ```

4. **Get the code onto the server** (`git clone`/`scp`/`rsync`, whichever you use),
   then on the server:

   ```bash
   npm install
   cp .env.example .env   # fill in real values, same as local setup
   # copy your firebase-service-account.json onto the server too
   npm run login           # one-time interactive KakaoTalk login
   npm run build
   ```

5. **Start it under PM2** using the included `ecosystem.config.js`:

   ```bash
   npm run pm2:start
   pm2 save                # persist the process list
   pm2 startup             # prints a command to run once, so PM2 restarts on reboot
   ```

   Useful commands: `npm run pm2:logs` (tail logs), `npm run pm2:restart`,
   `npm run pm2:stop`, `pm2 status`.

6. **Redeploying after code changes:** pull the new code, `npm install` if
   dependencies changed, `npm run build`, then `npm run pm2:restart`.

Notes:
- `.env`, `firebase-service-account.json`, and `.kakao-session.json` are all
  gitignored — they must be created/copied onto the server separately, they
  won't come from `git clone`.
- The KakaoTalk session (`.kakao-session.json`) is tied to the device UUID
  generated during `npm run login`. Don't regenerate it unnecessarily — reusing
  the same session file is what lets the bot reconnect without repeating device
  passcode verification.
- If the VPS's outbound IP changes (e.g. you rebuild the instance), KakaoTalk
  may treat it as a new device and require passcode verification again.

## A note on `node-kakao`'s API

`node-kakao` is unofficial and its exported class/method names have shifted across
versions and may shift again. This code was written against **v4.5.0** using the
actual type definitions in `node_modules/node-kakao/dist`. If you upgrade the
package and something stops compiling, re-check the installed `.d.ts` files (start
with `dist/index.d.ts`, `dist/api/auth-api-client.d.ts`, and
`dist/talk/client/index.d.ts`) and adjust `src/kakao/*` and `src/scripts/login.ts`
accordingly.

## License

MIT. Provided as-is, with no warranty. See the risk disclaimer above.
