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
    personaPresetStore.ts  named, reusable persona presets (persona/guardrails/filler)
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
    fillerPhrases.ts       default ㅋㅋㅋ/인정-style filler reaction whitelist
  bot/
    triggerEngine.ts     direct-mention detection (name/@name/alias)
    contextJudge.ts       asks the LLM to pick none/filler/meaningful, and for the reply
    messageContent.ts      turns stickers/photos into loggable placeholder text
    humanize.ts          typing delay + optional message splitting
    messageHandler.ts    end-to-end incoming-message pipeline
  scripts/
    login.ts             interactive one-time login script
    setPersona.ts        CLI: set a room-specific persona override
    setAliases.ts         CLI: set room-specific mention aliases/nicknames
    setGuardrails.ts       CLI: set room-specific hard rules/guardrails
    setFillerPhrases.ts    CLI: set room-specific filler-reaction whitelist
    listRooms.ts          CLI: inspect what the bot remembers per room
    listChannels.ts       CLI: list joined rooms (name + chatId)
    analyzeExport.ts      CLI: analyze an exported chat .txt into a named room profile
    linkProfile.ts         CLI: apply a named room profile to a real room by chatId
    savePreset.ts           CLI: snapshot a configured room into a reusable persona preset
    applyPreset.ts           CLI: apply a saved persona preset to another room
    listPresets.ts            CLI: inspect saved persona presets
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
   | `SPONTANEOUS_COOLDOWN_MESSAGES` | messages that must pass since the bot last gave a real, meaningful spontaneous reply before it's allowed to consider another one (default `6`) |
   | `FILLER_COOLDOWN_MESSAGES` | messages that must pass since the bot last sent a cheap filler reaction (ㅋㅋㅋ, 인정, ...) before it's allowed to consider another one (default `2`) |
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
- `fillerPhrases` (`{ phrase, context, frequency }[]`) — the whitelist of cheap
  filler reactions (ㅋㅋㅋ, 인정, ...) this room's bot may send. `context` says
  when a phrase actually fits (e.g. "인정" only for agreement, not for
  something funny) and `frequency` (`high`/`medium`/`low`) says how often this
  persona reaches for it — e.g. a blunt persona can set "ㅎㅎ" to `low` while a
  soft one sets it to `high`. Falls back to `DEFAULT_FILLER_PHRASES`
  (`src/persona/fillerPhrases.ts`, which also includes 3–8-character "ㅋㅋㅋ"
  variants) if unset. A whitelist rather than free LLM generation, so a
  coarser phrase allowed in one room can never leak into another that wasn't
  configured to allow it.
- `summary` (string) — the room's rolling long-term memory, auto-generated.
- `messagesSinceSummary` (number) — internal counter, resets each time `summary`
  is refreshed.
- `messagesSinceSpontaneousReply` (number) — internal counter, resets only when
  the bot sends a real, meaningful reply; gates the meaningful-reply cooldown.
- `messagesSinceFillerReply` (number) — internal counter, resets only when the
  bot sends a filler reaction; gates the (much shorter) filler cooldown,
  independently of the meaningful-reply one.

Messages are stored under `rooms/{channelId}/messages` and capped at the 20 most
recent (this is the short-term window fed to the LLM verbatim). Once
`SUMMARY_UPDATE_INTERVAL` new messages accumulate in a room, the bot asks the LLM
to fold them into `summary` **and** into per-participant profiles — this is what
lets the bot "remember" things (who's who, running jokes, past events) well beyond
the 20-message short-term window.

### Stickers and photos

Messages with no literal text aren't ignored outright (`src/bot/messageContent.ts`):

- **Stickers/emoticons** carry a short Kakao-provided description (e.g. "빵터짐")
  in their attachment data, which is read and logged as `[이모티콘: 빵터짐]` —
  the bot reacts to that description like any other message (through the same
  none/filler/meaningful judgment above).
- **Photos** have no such description. Actually understanding what's in a photo
  needs vision (downloading the image and passing it to a multimodal LLM call),
  which **isn't implemented yet** — see "Planned / not yet implemented" below.
  For now a photo is only logged as `[사진을 보냄]`, so the bot knows one arrived
  and can react generically (e.g. a filler "오"), but can't describe or respond
  to its actual content. The persona prompt is explicitly told not to pretend
  otherwise (`src/persona/promptBuilder.ts`'s `formatNote`), so it doesn't
  hallucinate details about a photo it never saw.
- Other message types (video, file, voice call, etc.) are currently ignored.

### How the bot decides whether to reply

1. **Direct mention → always sends a real reply.** A message counts as a mention
   if it contains `KAKAO_BOT_NAME`, `@KAKAO_BOT_NAME`, or any of the room's
   `aliases` as a substring — this naturally also catches Korean vocative forms
   like "길동아" or "길동아 뭐하냐" as long as "길동" is registered as the name or
   an alias (see `src/bot/triggerEngine.ts`). This bypasses both cooldowns below.
2. **Otherwise → two independent cooldown-gated registers.** Real people fill
   most of a group chat with cheap filler (ㅋㅋㅋ, 인정, ㄹㅇ) and only occasionally
   send an actual reply, so the bot tracks two separate cooldowns per room:
   - **Filler** — gated by `FILLER_COOLDOWN_MESSAGES` (short, default `2`).
   - **Meaningful reply** — gated by `SPONTANEOUS_COOLDOWN_MESSAGES` (longer,
     default `6`).

   Once *either* cooldown has elapsed, the bot asks the LLM, in a single call,
   to pick one of the modes that are currently allowed — `none`, `filler`
   (must echo one of the room's exact whitelisted phrases), or `meaningful`
   (a real, freely-written reply) — and to produce that reaction in the same
   call (see `src/bot/contextJudge.ts`). A filler reply that isn't an exact
   whitelist match is discarded (treated as `none`) rather than let through,
   so the phrase pool stays under explicit control per room.
3. **Each register resets only its own cooldown.** Sending a filler reaction
   resets `messagesSinceFillerReply` but leaves the meaningful-reply cooldown
   ticking, and vice versa — so a quick "ㅋㅋㅋ" never blocks (or is blocked by)
   the next real reply, matching how a real person actually chats. A mention
   reply resets the meaningful-reply cooldown (being addressed directly counts
   as "the bot just spoke"). If the LLM picks `none`, no cooldown resets, so it
   keeps getting asked on later messages until it finds a natural moment.

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

```bash
npm run set-filler -- <chatId> "ㅋㅋㅋ:자주:웃긴 상황일 때,인정:가끔:동의할 때,ㅎㅎ:거의안씀:그냥 순한 맛으로만"
```
Sets the room's filler-reaction whitelist. Each entry is
`표현:빈도:언제 쓰는지` (빈도 = `자주`/`가끔`/`거의안씀`; comma-separated,
overwrites the full list, falls back to `DEFAULT_FILLER_PHRASES` if never
set). The context hint is what stops a phrase like "인정" from firing on
something that isn't actually agreement, and the frequency is what lets a
blunt persona barely ever say "ㅎㅎ" while a soft one leans on it constantly. A
room where coarser banter is normal can include phrases here that would be
out of place in a tamer room — since it's an explicit whitelist, the bot can
never send a filler phrase that wasn't approved for that specific room.

## Reusable persona presets

`personaOverride`, `guardrails`, and `fillerPhrases` all live per-room — there's
no separate "persona" object, so getting the same character (e.g. "상남자") into
several rooms means setting the same three things repeatedly. Persona presets
solve that: configure one room the way you want, snapshot it under a name, then
stamp that name onto any other room.

1. **Configure one room fully**, using the commands above:

   ```bash
   npm run set-persona -- <chatId> "..."
   npm run set-guardrails -- <chatId> "..."
   npm run set-filler -- <chatId> "..."
   ```

2. **Snapshot it as a named preset:**

   ```bash
   npm run save-preset -- tough-guy <chatId>
   ```

   Copies that room's current `personaOverride` + `guardrails` + `fillerPhrases`
   into `personaPresets/tough-guy`. Fails if the room has no `personaOverride`
   set yet (nothing distinctive to save).

3. **Apply it to any other room:**

   ```bash
   npm run apply-preset -- tough-guy <otherChatId>
   ```

   Overwrites that room's `personaOverride`/`guardrails`/`fillerPhrases` with
   the preset's. Each room stays independently editable afterward — applying a
   preset is a one-time copy, not a live link, so later `set-persona`/
   `set-filler` calls on either room don't affect the other.

4. **`npm run list-presets`** to see everything saved so far.

Note that `aliases` (mention nicknames) are intentionally **not** part of a
preset — what a bot is called is tied to that specific room's people, not to
its personality.

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

## Planned / not yet implemented

Ideas raised during development that are deliberately deferred, kept here so
they aren't lost between sessions:

- **Photo vision** — actually understanding what's in a photo (not just
  acknowledging one arrived). Needs downloading the image
  (`PhotoAttachment`/`MultiPhotoAttachment` URLs are already available via
  node-kakao) and passing it through a multimodal call, which means extending
  `LlmContext`/`LlmProvider` and both `gemini.ts`/`openai.ts` to carry image
  content — a real scope increase over the current text-only `generateReply`.
- **Bot-initiated photo sending** — `channel.sendMedia()` exists in node-kakao,
  so it's technically possible, but needs images stored somewhere (Firebase
  Storage, not Firestore) plus logic for *when* the bot would decide to send
  one. Not started.
- **Rate-limit / retry handling** — if multiple active rooms exhaust the LLM
  provider's RPM/TPM quota, the current code has no retry/backoff; the call
  just fails and that message goes unanswered. Fine for light use, worth
  addressing before running many active rooms at once.
- **Active-hours throttling** — replying at 4am just as fast as at 2pm reads as
  bot-like. Could slow down or skip spontaneous replies during a configured
  "asleep" window per room/persona.
- **Spontaneous, unprompted topic-starting** — right now the bot only ever
  reacts to messages; it never speaks first into a quiet room. Doing this
  properly needs a timer/scheduler independent of the message-event loop
  (nothing in the codebase polls on a clock today), not just a bigger
  cooldown.
- **Multi-message "burst" splitting review** — `humanize.ts` already splits
  long replies into a few sentence-sized messages, but this hasn't been
  tuned/reviewed against how a real person actually paces a run of short
  messages.
- **Usage/cost monitoring** — no tracking today of how many LLM calls or
  tokens each room is costing, so a very active or many-room deployment could
  run up unexpected spend with no visibility.

## License

MIT. Provided as-is, with no warranty. See the risk disclaimer above.
