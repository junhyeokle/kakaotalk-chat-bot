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
   long-term summary and per-participant profiles if enough new messages have
   accumulated → checks if it was directly mentioned (name, `@name`, or a
   configured alias/nickname) → if mentioned, always replies; otherwise, once
   the spontaneous-reply cooldown has elapsed, asks the LLM itself to judge
   whether jumping into the conversation right now is natural given the
   context (and if so, generate the reply, in the same call) → waits a
   human-like typing delay → sends → logs the reply.

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
    configStore.ts       per-room enabled flag, aliases, persona, long-term
                          summary + message counter, spontaneous-reply cooldown
    participantStore.ts  per-room, per-userId participant profiles
    roomProfileStore.ts  named pre-analyzed room profiles (vibe/rating/topics/persona)
  llm/
    types.ts             LlmProvider interface
    gemini.ts            Gemini implementation
    openai.ts            OpenAI implementation
    index.ts             factory selecting provider via LLM_PROVIDER
    jsonUtil.ts           tolerant JSON parsing for structured LLM responses
  persona/
    defaultPersona.ts    default persona system prompt
    promptBuilder.ts     persona + room summary + participants + history -> LLM context
    summarizer.ts        folds recent history into the room summary + participant profiles
    exportAnalyzer.ts     analyzes an exported chat file into vibe/rating/topics/persona
  bot/
    triggerEngine.ts     direct-mention detection (name/@name/alias)
    contextJudge.ts       asks the LLM whether to jump in unprompted, and for the reply
    humanize.ts          typing delay + optional message splitting
    messageHandler.ts    end-to-end incoming-message pipeline
  scripts/
    login.ts             interactive one-time login script
    setPersona.ts        CLI: set a room-specific persona override
    setAliases.ts         CLI: set room-specific mention aliases/nicknames
    setGuardrails.ts       CLI: set room-specific hard rules/guardrails
    listRooms.ts          CLI: inspect what the bot remembers per room
    listChannels.ts       CLI: list joined rooms (name + chatId)
    analyzeExport.ts      CLI: analyze an exported chat .txt into a named room profile
    linkProfile.ts         CLI: apply a named room profile to a real room by chatId
    lib/parseKakaoExport.ts  parser for KakaoTalk's "export chat" .txt format
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
   | `SPONTANEOUS_COOLDOWN_MESSAGES` | messages that must pass since the bot last spoke unprompted before it's even allowed to consider jumping in again (default `6`) |
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
- `aliases` (string[]) — extra names/nicknames that count as a direct mention in
  this room, on top of `KAKAO_BOT_NAME`.
- `personaOverride` (string) — replace the default persona prompt for that room.
- `guardrails` (string) — hard rules injected into every prompt for that room
  (e.g. topics to avoid, how far dark humor/profanity can go). Kept separate
  from `personaOverride` so rewriting the persona's tone never accidentally
  drops the room's rules; there is no global default, each room is fully
  independent.
- `summary` (string) — the room's rolling long-term memory, auto-generated.
- `messagesSinceSummary` (number) — internal counter, resets each time `summary`
  is refreshed.
- `messagesSinceSpontaneousReply` (number) — internal counter, resets whenever the
  bot replies (mentioned or not); gates the spontaneous-reply cooldown.

Messages are stored under `rooms/{channelId}/messages` and capped at the 20 most
recent (this is the short-term window fed to the LLM verbatim). Once
`SUMMARY_UPDATE_INTERVAL` new messages accumulate in a room, the bot asks the LLM
to fold them into `summary` **and** into per-participant profiles — this is what
lets the bot "remember" things (who's who, running jokes, past events) well beyond
the 20-message short-term window.

### How the bot decides whether to reply

1. **Direct mention → always replies.** A message counts as a mention if it
   contains `KAKAO_BOT_NAME`, `@KAKAO_BOT_NAME`, or any of the room's `aliases` as
   a substring — this naturally also catches Korean vocative forms like "길동아"
   or "길동아 뭐하냐" as long as "길동" is registered as the name or an alias
   (see `src/bot/triggerEngine.ts`).
2. **Otherwise → cooldown-gated LLM judgment.** The bot doesn't call the LLM on
   every single message (too slow/expensive and too eager). It only *considers*
   replying once `SPONTANEOUS_COOLDOWN_MESSAGES` messages have passed since it
   last spoke. Once that threshold is met, every subsequent message asks the LLM,
   in a single call, to judge whether jumping in right now fits the conversation
   — and if so, produce the reply — using the same persona + long-term summary +
   participant profiles + recent history context as a normal reply (see
   `src/bot/contextJudge.ts`). If the LLM says no, nothing is sent and the
   cooldown does *not* reset, so it keeps getting asked on later messages until it
   finds a natural moment to jump in.
3. **Any successful reply resets the cooldown**, whether it came from a mention
   or the spontaneous judgment, so the bot doesn't immediately try to speak again
   right after it just did.

### Per-participant memory (within a room)

Each room also has a `rooms/{channelId}/participants/{userId}` sub-collection.
Every time the summary refreshes, the LLM is asked "who showed up in this batch of
messages, and what do we now know about them" (personality, interests, running
jokes, relationships to others in the room) and the result is merged in, keyed by
the sender's stable KakaoTalk `userId` (not their nickname, since that can
change). This is scoped **per room** — the same person in two different rooms
gets two independent profiles.

### Inspecting and configuring memory from the CLI

```bash
npm run list-rooms
```
Prints every room the bot has seen: its config, current summary, and the full
list of participant profiles. Use this to find a room's `chatId`.

```bash
npm run set-persona -- <chatId> "이 방에서만 쓸 페르소나 텍스트"
```
Overrides the persona for one specific room (e.g. give the bot a different
character per group chat). Persists to Firestore immediately; takes effect on
the room's next message.

```bash
npm run set-aliases -- <chatId> 길동,길동이,길동봇
```
Sets the room-specific mention aliases (comma-separated, overwrites the full
list). Useful when people call the bot by a nickname or shortened name instead
of its full `KAKAO_BOT_NAME`.

```bash
npm run set-guardrails -- <chatId> "정치·종교 얘기는 피해라. 19금 드립은 절대 하지 마라."
```
Sets hard rules for one specific room, independent of its persona. There's no
global guardrail baked into the bot — every room is configured on its own, so
one room can be told to keep things tame while another is left wide open.

## Pre-analyzing a room before the bot joins

If you export a room's past conversation from KakaoTalk before the bot is ever
added to it, you can have the LLM figure out that room's vibe, content rating,
and common topics ahead of time, and turn that into a ready-made persona — so
the bot fits in immediately instead of starting from the generic default
persona and slowly building up memory from scratch.

This is a **three-step, fully manual** process on purpose: the exported file
only has a room *title*, not KakaoTalk's internal `chatId`, and titles can
collide or change. Rather than guessing which live room a profile belongs to,
you explicitly link them — so the bot can never mistake one room for another.

1. **Export the chat** from KakaoTalk (PC app: room settings → "대화 내보내기"),
   which gives you a `.txt` file.

2. **Analyze it** and save the result under a name you choose (`profileId`):

   ```bash
   npm run analyze-export -- ~/Downloads/우리방_카톡대화.txt friends-room [샘플개수]
   ```

   This parses the export (`src/scripts/lib/parseKakaoExport.ts`), takes the
   most recent `샘플개수` messages (default 800 — recent messages reflect the
   room's *current* vibe better than the whole history, and keeps the LLM call
   cheap), and asks the LLM to produce a vibe description, a content-rating
   note, a topic list, and a ready-to-use persona prompt
   (`src/persona/exportAnalyzer.ts`). The result is saved to
   `roomProfiles/{profileId}` in Firestore — not yet applied to any live room.

3. **Find the real room's `chatId`** once the bot has joined it:

   ```bash
   npm run list-channels
   ```

4. **Link the profile to that room:**

   ```bash
   npm run link-profile -- <chatId> friends-room
   ```

   This sets the room's `personaOverride` to the generated persona and seeds
   its `summary` with the vibe/rating/topics — the same fields the live
   `summarizer.ts` keeps refreshing afterward, so the pre-analysis is just the
   *starting point*; ongoing conversation keeps updating it from there.

A room the bot joins **without** ever being linked to a profile just behaves
normally: default persona, empty summary that builds up from scratch as
described above. Linking is opt-in per room.

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
