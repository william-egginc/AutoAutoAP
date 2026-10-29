# AutoAutoAP /instant (proof of concept)

Discord slash commands that behave like the planner's CLI, with NO searches: only instant answers
(worked out ahead of time from tables) and reads of one saved save file. Meant to move to Wonky later.

| Command | What it does |
| --- | --- |
| `/instant goal date prefer private` | The instant answer and the "every number of ascensions" table. `goal`: Highest TE by Egg Day (default), Fastest to 490 TE, or Highest TE by a date (give `date` as YYYY-MM-DD; 9:00 am Pacific = 10:00 am Mountain, the site's own time). `prefer`: same TE (default; the site's Prefer fewer rule, including its quick-first-stop rule, Fastest within 12 h) or off. |
| `/myruns goal private` | My runs' "Right now" and "Your eggs": the goal line, next step, next shifts (about 6), the prestige table A1..An, then each egg's TE and next TE time, shifts done, next shift cost, planned shifts, silos, habs and clothed TE. |
| `/next goal private` | Only the next step and the one after it, with their times. |
| `/help` | Lists the commands. |

Replies are public unless you set `private:true`, except that anything from the owner's saved save defaults to private and anything with an `eid` is always private. Every reply carries a one-line beta notice with the site link. Tables are cut to 40 characters a line so they do not wrap
on a phone (routes show first and last stop; the `#` column is the ascension count, `>` marks the route the
site's green box leads with).

Every command also takes an optional `eid` (a player ID, `EI` and 16 digits). With it the bot loads that player's
save from the Egg, Inc. server the way the site does (`lib/saveLoad.ts` `requestSave`) and the reply is **always
private**, whatever `private` says. Without it the bot uses `SAVE_PATH`, the bot owner's save, but only for `OWNER_ID`; anyone else is asked for their `eid`. The ID goes to the
planner process on stdin only (not in its arguments), is never logged, echoed, cached or written to disk, and
every error text is scrubbed of it. The bot picks the table with the site's own check (`chooseInstantTable`, `instantScaleOf`): if no table
fits the player's gear the reply says "Assumes maxed gear; your real times may be later" (or that the maxed
table was moved to their gear, as the site does). The site fetches a player's own table itself; the bot does not. Times use the bot's `TIMEZONE`.

## How it works

`instant_json.ts` calls the planner's own code, bundled by `build.mjs` into `dist/instant_json.mjs` (the
planner repo is only read, never changed). `/instant` runs the same functions as `scripts/precompute.ts
--instant2` and the site's instant answer (`chooseInstantTable`, `instantFirstLegs`, `instantPricingOptions`,
`findRoutes`, `polishFound`, `boxRouteOf` for Prefer fewer). `/myruns` prices the chosen route with its
shifts as My runs' estimate does and feeds the site's `nowPlan`, `instantSteps`, `farmFacts`, `nextTeEgg`,
`shiftCost`, `soulEggs` and `farmNow` functions; no game maths is written in Python. Without a followed route
saved on the site, the plan is the instant answer. A1 is not simulated on the live farm, so its times are
rounded to the hour, and the reply says so.
The save is read in place from the path you give; nothing is copied. Player ids (EI + 16 digits) are
masked to `EI...` on everything printed or sent.

## Windows setup

1. Install Python 3.11+ (tick "Add to PATH") and Node 22+ (Node 23/24 also fine; tested on 23.10).
2. In this folder:
   ```
   py -m venv .venv
   .venv\Scripts\pip install -r requirements.txt
   ```
3. Build the planner bundle once (needs the AutoAutoAP checkout with `pnpm install` done):
   ```
   set PLANNER_DIR=C:\path\to\AutoAutoAP\wasmegg\ascension-planner
   node build.mjs
   ```
   Rebuild after the planner's code changes. `dist\` is not in git.
4. Config, as environment variables or a `config.toml` next to `bot.py` (see `config.example.toml`):
   - `SAVE_PATH`: your save JSON (read in place)
   - `TABLES_DIR`: a folder holding `table.bin` and `table-v2.bin`, downloaded from the site's public
     precompute folder (the same files the site loads). A player's own table is fetched by the site, not by
     this bot, so the bot answers from the shared maxed table unless you also put such a file there yourself
     (do not publish those files)
   - `OWNER_ID`: your Discord user id (Developer Mode, right-click yourself, Copy User ID). Without an `eid`,
     `SAVE_PATH` is used ONLY for this user, and the reply defaults to private (`private:false` makes it public).
     Everyone else without an `eid` gets a private reply asking for theirs. Unset: nobody uses `SAVE_PATH`.
   - `NODE` (default `node`), `TIMEZONE` (default `America/Denver`), `TIMEOUT` (seconds, default 180)
5. Try it without Discord:
   ```
   .venv\Scripts\python bot.py --dry-run instant
   ```
   Also `--goal fastest`, `--goal date --date 2027-03-01`, `--prefer off`, `--dry-run myruns`, `--dry-run next`,
   `--dry-run help`.
   ```
   ```
6. Discord developer portal: create an application and a bot. Then Installation: tick **User Install** (and
   Guild Install if you want it on servers), with the scope `applications.commands` (add `bot` only to list it as
   a server member). People can then add it to their own account from the install link and use every command
   anywhere, DMs included, without inviting it to a server. All commands are set installable on a server or a
   user, and usable in servers, DMs and group chats. No message intents are needed.
7. Set the token yourself, in your own shell. Never put it in a file or paste it into chat:
   ```
   set DISCORD_TOKEN=your-token
   ```
8. Commands are registered globally only (servers, user installs and DMs all use that; a new command can take up
   to an hour to show). If an earlier version left guild-scoped copies in your server (you see each command
   twice), remove them once with your server's id, then restart normally:
   ```
   set GUILD_ID=123456789012345678
   .venv\Scripts\python bot.py --clear-guild-commands
   .venv\Scripts\python bot.py
   ```
9. Type `/instant`, `/myruns` or `/help` in the server. A run takes about 10 to 30 seconds; runs are queued one at a time.

## Tests

`.venv\Scripts\python -m pytest` (formatting, limits, masking, phone width; the fixtures in `tests/fixtures.py` are made up in code, no real save).

## Notes

Instant answers are worked out ahead of time from tables; for an exact account run Fast/Exact on egg-beta.

## Publishing

Saves, tables, builds and the token never belong in git: `.gitignore` excludes `*.json`, `dist/`, `*.bin`,
`*.gz`, `config.toml`, `.env` and `.venv/`. The tests use no data files.
