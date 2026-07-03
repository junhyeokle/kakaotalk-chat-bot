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
    photoStore.ts           photo catalog (Storage path + tags + description) and tag lookup
  llm/
    types.ts             LlmProvider interface
    gemini.ts            Gemini implementation
    openai.ts            OpenAI implementation
    index.ts             factory selecting provider via LLM_PROVIDER
    jsonUtil.ts           tolerant JSON parsing for structured LLM responses
    retry.ts               exponential-backoff retry for transient (429/5xx) LLM errors
  persona/
    defaultPersona.ts    default persona system prompt
    promptBuilder.ts     persona + room summary + participants + history -> LLM context
    summarizer.ts        folds recent history into the room summary + participant profiles
    exportAnalyzer.ts     analyzes an exported chat file into vibe/rating/topics/persona
    fillerPhrases.ts       default ㅋㅋㅋ/인정-style filler reaction whitelist
  bot/
    triggerEngine.ts     direct-mention detection (name/@name/alias)
    contextJudge.ts       asks the LLM to pick none/filler/meaningful/photo, and for the reply
    messageContent.ts      turns stickers/photos into loggable placeholder text
    activityHours.ts        computes whether "now" is within a room's sleep window
    humanize.ts          typing delay w/ jitter + multi-bubble message splitting
    messageHandler.ts    end-to-end incoming-message pipeline
  scripts/
    login.ts             interactive one-time login script
    setPersona.ts        CLI: set a room-specific persona override
    setAliases.ts         CLI: set room-specific mention aliases/nicknames
    setGuardrails.ts       CLI: set room-specific hard rules/guardrails
    setFillerPhrases.ts    CLI: set room-specific filler-reaction whitelist
    setSleepHours.ts        CLI: set a room-specific sleep window
    setPhotoTags.ts          CLI: set a room-specific photo-tag whitelist
    addPhoto.ts               CLI: upload a photo to the catalog
    listPhotos.ts              CLI: inspect the photo catalog
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
- A **Firebase project** with Firestore **and Storage** enabled (Storage is
  only needed if you want the bot to send photos — see "Sending photos"), and
  a service account JSON key (Project Settings → Service accounts → Generate
  new private key).
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
   | `FIREBASE_STORAGE_BUCKET` | Storage bucket name; leave blank to default to `<project_id>.appspot.com` (only matters if you use photo-sending) |
   | `SUMMARY_UPDATE_INTERVAL` | messages per room before the long-term summary is refreshed (default `30`) |
   | `TIMEZONE` | IANA time zone used to evaluate sleep hours (default `Asia/Seoul`) |
   | `SLEEP_START_HOUR` / `SLEEP_END_HOUR` | global default sleep window, 0–23 (default `2`–`7`); set both to the same value to disable sleep entirely |
   | `SLEEP_EXTRA_DELAY_MS` | extra delay added on top of the normal typing delay when replying to a mention during sleep hours (default `90000` = 1.5 min) |
   | `PHOTO_COOLDOWN_MESSAGES` | messages that must pass since the bot last sent a photo before it's allowed to consider another one (default `20`) |
   | `LLM_RETRY_MAX_ATTEMPTS` | max attempts (including the first) for an LLM call that fails with a retryable error — 429 rate-limit or 500/503 (default `3`) |
   | `LLM_RETRY_BASE_DELAY_MS` | base delay before the first retry, doubling each attempt (default `1000`; so attempt 2 waits ~1s, attempt 3 waits ~2s) |

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
- `sleepStartHour` / `sleepEndHour` (number, 0–23) — per-room override of the
  sleep window; falls back to `SLEEP_START_HOUR`/`SLEEP_END_HOUR` if unset. Set
  both to the same value to keep this specific room always awake.
- `photoTags` (string[]) — whitelist of photo-catalog tags this room may
  receive (see "Sending photos" below). Empty/unset means this room never
  gets a photo, however tagged — there is no global default.
- `messagesSincePhotoReply` (number) — internal counter, resets only when the
  bot sends a photo; gates the (typically much longer) photo cooldown,
  independently of the other two.

Messages are stored under `rooms/{channelId}/messages` and capped at the 20 most
recent (this is the short-term window fed to the LLM verbatim). Once
`SUMMARY_UPDATE_INTERVAL` new messages accumulate in a room, the bot asks the LLM
to fold them into `summary` **and** into per-participant profiles — this is what
lets the bot "remember" things (who's who, running jokes, past events) well beyond
the 20-message short-term window.

### Sleep hours

Replying at 4am exactly as fast as at 2pm reads as bot-like, so each room has a
configurable "asleep" window (`src/bot/activityHours.ts`):

- **While asleep, the bot never considers a spontaneous reply or filler
  reaction** — the cooldown checks are forced to fail regardless of how long
  it's actually been, so no LLM call happens at all for unprompted messages.
- **A direct mention still gets a reply** (ignoring one outright would look
  broken/rude), but only after an extra `SLEEP_EXTRA_DELAY_MS` on top of the
  normal typing delay — like someone who only glances at their phone
  occasionally while sleeping instead of replying instantly.
- The window is evaluated in `TIMEZONE` and wraps past midnight correctly
  (e.g. `23`–`6` means asleep from 11pm to 6am). Setting `sleepStartHour ===
  sleepEndHour` (globally via env, or per-room) disables sleep entirely.

```bash
npm run set-sleep-hours -- <chatId> 1 8
```
Overrides the sleep window for one room (1am–8am here). Omit this and a room
just uses the global `SLEEP_START_HOUR`/`SLEEP_END_HOUR` defaults.

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

### Sending photos

The bot can also send photos it's been given ahead of time — never generated,
never fetched from the web, only from a pre-uploaded, pre-tagged catalog. The
model never "sees" a photo either; all it gets is the `description` text you
wrote for it, so pick descriptions that actually convey what the photo shows
and when it fits.

1. **Enable Firebase Storage** for your project (Firebase console → Build →
   Storage) if you haven't already — Firestore alone isn't enough, photo files
   themselves live in Storage.

2. **Upload a photo and tag it:**

   ```bash
   npm run add-photo -- ~/Pictures/funny-cat.jpg "웃김,밈" "고양이가 놀라서 점프하는 사진, 빵터질 때 씀"
   ```

   Uploads the file to Storage under `photos/{uuid}.{ext}` and registers it in
   `photos/{photoId}` in Firestore with those tags and description.

3. **Whitelist tags for a room:**

   ```bash
   npm run set-photo-tags -- <chatId> 웃김,밈
   ```

   A room only ever receives a photo whose tags overlap this list — **by
   default (unset), a room gets no photos at all**, so a funny meme tagged
   "웃김" can never land in a room that was never configured to accept that
   tag. A serious/info-focused room could instead be whitelisted for `정보,진지`
   tags only, and the two photo pools would never cross.

4. **`npm run list-photos`** to see everything in the catalog and its tags.

Sending is otherwise governed like filler/meaningful replies: gated by its own
cooldown (`PHOTO_COOLDOWN_MESSAGES`, longest by default since it's the
rarest/biggest action), asleep rooms never send one, and the LLM only ever
picks from the exact candidate ids it was offered (see below) — never an
arbitrary or made-up id.

### How the bot decides whether to reply

1. **Direct mention → always sends a real reply.** A message counts as a mention
   if it contains `KAKAO_BOT_NAME`, `@KAKAO_BOT_NAME`, or any of the room's
   `aliases` as a substring — this naturally also catches Korean vocative forms
   like "길동아" or "길동아 뭐하냐" as long as "길동" is registered as the name or
   an alias (see `src/bot/triggerEngine.ts`). This bypasses all cooldowns below.
2. **Otherwise → three independent cooldown-gated registers.** Real people fill
   most of a group chat with cheap filler (ㅋㅋㅋ, 인정, ㄹㅇ), occasionally send
   an actual reply, and rarer still, share a photo — so the bot tracks three
   separate cooldowns per room:
   - **Filler** — gated by `FILLER_COOLDOWN_MESSAGES` (shortest, default `2`).
   - **Meaningful reply** — gated by `SPONTANEOUS_COOLDOWN_MESSAGES` (longer,
     default `6`).
   - **Photo** — gated by `PHOTO_COOLDOWN_MESSAGES` (longest, default `20`),
     and only even possible if the room has a non-empty `photoTags` whitelist
     with at least one matching photo in the catalog.

   Once *any* cooldown has elapsed, the bot asks the LLM, in a single call, to
   pick one of the modes that are currently allowed — `none`, `filler` (must
   echo one of the room's exact whitelisted phrases), `meaningful` (a real,
   freely-written reply), or `photo` (must pick one of the room's whitelisted
   candidate photos by id) — and to produce that reaction in the same call
   (see `src/bot/contextJudge.ts`). A filler/photo choice that doesn't exactly
   match an offered candidate is discarded (treated as `none`) rather than let
   through, so both phrase and photo pools stay under explicit control per room.
3. **Each register resets only its own cooldown.** Sending a filler reaction
   resets `messagesSinceFillerReply` but leaves the meaningful-reply and photo
   cooldowns ticking, and so on for each — so a quick "ㅋㅋㅋ" never blocks (or is
   blocked by) the next real reply or photo, matching how a real person
   actually chats. A mention reply resets the meaningful-reply cooldown (being
   addressed directly counts as "the bot just spoke"). If the LLM picks `none`,
   no cooldown resets, so it keeps getting asked on later messages until it
   finds a natural moment.

### Sending replies as multiple bubbles

A real person rarely sends one grammatically tidy sentence — they send a few
short bursts instead ("ㅋㅋㅋ" / "그건 좀 아니지 않냐" / "근데 이해는 감"). The
default persona (`src/persona/defaultPersona.ts`) explicitly tells the model to
write separate thoughts on separate lines (`\n`) rather than one long sentence,
and `sendHumanized` (`src/bot/humanize.ts`) turns those lines into individual
KakaoTalk messages:

- Splits primarily on the model's own line breaks.
- Any single line still longer than ~60 characters (the model didn't break it
  up) is further split on sentence punctuation as a fallback.
- Capped at 5 bubbles per reply — beyond that the tail is merged back into the
  last bubble rather than spamming the room.
- Each bubble waits a length-proportional "typing" delay before sending, with
  ±20% random jitter so the pacing isn't perfectly mechanical.

A `personaOverride` that doesn't mention this convention will just get
single/long-sentence replies from the LLM — worth carrying the instruction over
if you're writing a persona from scratch instead of building on the default.

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

## Handling LLM rate limits

Gemini and OpenAI both cap requests per minute (and tokens per minute) per API
key. Every LLM call the bot makes — replies, the none/filler/meaningful/photo
judgment, and long-term summarization — shares that one key, so a burst of
activity across several active rooms can exceed a low-tier quota.

When that happens, both providers return a `429` (rate-limited) response — or
occasionally a `500`/`503` (transiently unavailable). `src/llm/retry.ts` wraps
every provider call (`gemini.ts`, `openai.ts`) to retry those specific
statuses with exponential backoff (`LLM_RETRY_BASE_DELAY_MS`, doubling each
attempt, up to `LLM_RETRY_MAX_ATTEMPTS`), while any other kind of error (bad
API key, malformed request, network failure) still fails immediately — no
point retrying something that isn't transient. If every retry is exhausted,
the call still fails and that one message goes unanswered (logged to the
console via the `.catch()` in `src/index.ts`); this only helps with short-lived
quota spikes, not a sustained overload of the account's quota tier.

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
- **Spontaneous, unprompted topic-starting** — right now the bot only ever
  reacts to messages; it never speaks first into a quiet room. Doing this
  properly needs a timer/scheduler independent of the message-event loop
  (nothing in the codebase polls on a clock today), not just a bigger
  cooldown.
- **Usage/cost monitoring** — no tracking today of how many LLM calls or
  tokens each room is costing, so a very active or many-room deployment could
  run up unexpected spend with no visibility.

## License

MIT. Provided as-is, with no warranty. See the risk disclaimer above.
