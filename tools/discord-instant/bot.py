"""AutoAutoAP /instant, /myruns and /help: proof-of-concept Discord commands.

Behaves like the planner's CLI but with NO searches: only instant answers (worked out ahead of time from
tables) and reads of one saved save file, in place. The maths is the site's own code, run through
dist/instant_json.mjs (built by build.mjs); nothing is reimplemented here. The Discord token comes from
DISCORD_TOKEN only. Every string that leaves this file (Discord, console, logs) goes through mask().

    python bot.py --dry-run instant [--goal eggday|fastest|date] [--date YYYY-MM-DD] [--prefer same|off]
    python bot.py --dry-run myruns [--goal eggday|fastest]
    python bot.py                       # run the bot
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import re
import shutil
import subprocess
import sys
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Optional

try:  # module level so discord.py can resolve the commands' type hints
    import discord
    from discord import app_commands
except ImportError:  # tests and --dry-run work without it
    discord = None  # type: ignore

try:  # Python 3.11+
    import tomllib  # type: ignore
except ImportError:  # pragma: no cover
    tomllib = None

HERE = Path(__file__).resolve().parent
SITE_URL = "https://egg-beta.williamstest.fyi/ascension-planner/"
FOOTER = "Beta \u00b7 answers can be off; check the site for your exact plan \u2192 " + SITE_URL
GOALS = {"eggday": "Highest TE by Egg Day", "fastest": "Fastest to 490 TE", "date": "Highest TE by a date"}
PLAYER_ID = re.compile(r"EI\d{16}")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
EMBED_DESC_MAX = 4096
EMBED_FIELD_MAX = 1024
EMBED_TOTAL_MAX = 5500  # Discord caps one message's embeds at 6000 characters in all
WIDTH = 40  # a phone fits about 40 monospace characters in a code block
ELLIPSIS = "\u2026"
ARROW = "\u2192"

HELP_LINES = [
    ("/instant", "The instant answer. goal: Highest TE by Egg Day (default), Fastest to 490 TE, or Highest TE by a "
                 "date (add date as YYYY-MM-DD). prefer: same TE (default, the site's Prefer fewer) or off. "
                 "private:true replies only to you."),
    ("/myruns", "My runs' Right now card and Your eggs from the saved save: next step, next shifts, the prestige "
                "table, the goal, and each egg's TE, shifts, silos, habs and clothed TE. private:true available."),
    ("/next", "Just the next step and the one after it, with their times, from the instant answer. "
              "goal and private:true as for /myruns."),
    ("/help", "This list. Every command takes an optional eid (your player ID): the reply is then always "
              "private and nothing about the ID is stored or shown."),
]


def mask(text: str) -> str:
    """Replace any player id (EI + 16 digits) before output."""
    return PLAYER_ID.sub("EI" + ELLIPSIS, text)


def scrub(text: str, eid: Optional[str] = None) -> str:
    """mask(), and the exact text of a player id that was given, whatever its shape."""
    if eid:
        text = text.replace(eid, "EI" + ELLIPSIS)
    return mask(text)


def valid_eid(eid: Optional[str]) -> bool:
    return bool(eid) and bool(re.fullmatch(r"EI\d{16}", eid.strip()))


def effective_private(private: Optional[bool], eid: Optional[str], from_save: bool = False) -> bool:
    """Whose data decides: an eid reply is always private; the owner's saved save is private unless the owner
    says private:false; everything else is public unless private:true."""
    if eid:
        return True
    if from_save:
        return private is not False
    return bool(private)


NEED_EID = ("Give your player ID in the eid option and I will use your own save. "
            "This reply is only visible to you, and the ID is never stored or shown.")


def may_use_saved_save(user_id, owner_id: str) -> bool:
    """SAVE_PATH is the owner's: only the configured OWNER_ID may use it without an eid."""
    return bool(owner_id) and str(user_id) == str(owner_id).strip()


def am_pm(text: str) -> str:
    """The site writes '5:00 PM'; this bot writes '5:00 pm'."""
    return re.sub(r"(\d:\d\d) ?([AP])M\b", lambda m: f"{m.group(1)} {m.group(2).lower()}m", text)


def clean(text: str) -> str:
    return mask(am_pm(text))


# ---------------------------------------------------------------- config

def load_config(env=None, toml_path: Optional[Path] = None) -> dict:
    env = os.environ if env is None else env
    file_cfg: dict = {}
    path = toml_path or HERE / "config.toml"
    if path.exists():
        if tomllib is None:
            raise SystemExit("config.toml needs Python 3.11+; use env vars instead (see README).")
        file_cfg = tomllib.loads(path.read_text(encoding="utf-8"))

    def get(key: str, default: str = "") -> str:
        return env.get(key) or str(file_cfg.get(key.lower(), "")) or default

    return {
        "SAVE_PATH": get("SAVE_PATH"),
        "PLANNER_DIR": get("PLANNER_DIR"),  # only needed to rebuild dist/ (build.mjs)
        "TABLES_DIR": get("TABLES_DIR"),
        "NODE": get("NODE", "node"),
        "TIMEZONE": get("TIMEZONE", "America/Denver"),
        "TIMEOUT": int(get("TIMEOUT", "180")),
        "GUILD_ID": get("GUILD_ID"),  # only used by --clear-guild-commands
        "OWNER_ID": get("OWNER_ID"),  # the one Discord user id allowed to use SAVE_PATH without an eid
    }


# ---------------------------------------------------------------- time/format

def _tz(name: str):
    try:
        from zoneinfo import ZoneInfo

        return ZoneInfo(name)
    except Exception:
        return timezone.utc


def _clock(d: datetime) -> str:
    hour = d.hour % 12 or 12
    return f"{hour}:{d.minute:02d} {'am' if d.hour < 12 else 'pm'}"


def fmt_time(unix: float, tz_name: str = "America/Denver", with_year: bool = True) -> str:
    """'Jul 14, 2027 at 10:00 am' (12-hour, am/pm, lowercase)."""
    d = datetime.fromtimestamp(unix, _tz(tz_name))
    date_part = f"{d.strftime('%b')} {d.day}" + (f", {d.year}" if with_year else "")
    return f"{date_part} at {_clock(d)}"


def num(row: dict) -> str:
    """Row number with the chosen route marked: '>4', ' 7', '10'."""
    return f"{'>' if row['chosen'] else ' '}{row['ascensions']:>2}"


def fmt_short(unix: float, tz_name: str, now: Optional[float] = None, year: bool = True) -> str:
    """'Jul 12 1:51p', with a 2-digit year only when it is not this year: 'Sep 28 '28 6:47a'."""
    d = datetime.fromtimestamp(unix, _tz(tz_name))
    ref = datetime.fromtimestamp(now if now is not None else datetime.now(timezone.utc).timestamp(), _tz(tz_name))
    year = f" '{d.year % 100:02d}" if year and d.year != ref.year else ""
    hour = d.hour % 12 or 12
    return f"{d.strftime('%b')} {d.day}{year} {hour}:{d.minute:02d}{'a' if d.hour < 12 else 'p'}"


def fmt_day(unix: float, tz_name: str, now: Optional[float] = None) -> str:
    """'Sep 28 '28': the day alone (a far-off finish needs no clock)."""
    d = datetime.fromtimestamp(unix, _tz(tz_name))
    ref = datetime.fromtimestamp(now if now is not None else datetime.now(timezone.utc).timestamp(), _tz(tz_name))
    return f"{d.strftime('%b')} {d.day}" + (f" '{d.year % 100:02d}" if d.year != ref.year else "")


def fmt_span(seconds: float) -> str:
    """'39h 24m', or '3d 4h' once past two days."""
    s = max(0, int(seconds // 60)) * 60
    d, rem = divmod(s, 86400)
    h, rem = divmod(rem, 3600)
    m = rem // 60
    if d >= 2:
        return f"{d}d {h}h"
    return f"{d * 24 + h}h {m:02d}m"


def fmt_route(chain, limit: Optional[int] = None) -> str:
    text = f" {ARROW} ".join(str(c) for c in chain)
    if limit and len(text) > limit:
        text = text[: limit - 1].rstrip(f" {ARROW}") + ELLIPSIS
    return text


def route_short(chain) -> str:
    """First and last stop: '199\u2192\u2026\u2192307' ('224\u2192297' for two, '274' for one)."""
    if len(chain) == 1:
        return str(chain[0])
    if len(chain) == 2:
        return f"{chain[0]}{ARROW}{chain[1]}"
    return f"{chain[0]}{ARROW}{ELLIPSIS}{ARROW}{chain[-1]}"


def table_text(cols, rows, aligns=None) -> str:
    """A monospace table; every line is cut to WIDTH so it never wraps on a phone."""
    aligns = aligns or ["l"] * len(cols)
    widths = [max(len(c), *(len(r[i]) for r in rows)) if rows else len(c) for i, c in enumerate(cols)]
    fit = lambda cells: " ".join(
        (c.rjust(widths[i]) if aligns[i] == "r" else c.ljust(widths[i])) for i, c in enumerate(cells)
    ).rstrip()
    lines = [fit(cols)] + [fit(r) for r in rows]
    return "\n".join(l[:WIDTH] for l in lines)


def code_block(text: str, limit: int = EMBED_FIELD_MAX) -> str:
    block = f"```\n{text}\n```"
    while len(block) > limit and "\n" in text:
        text = text.rsplit("\n", 1)[0]
        block = f"```\n{text}\n```"
    return block


# ---------------------------------------------------------------- /instant

def parse_date(value: Optional[str], today: Optional[date] = None) -> str:
    """Validate YYYY-MM-DD, a real day in the future."""
    if not value or not DATE_RE.match(value):
        raise ValueError("Give the date as YYYY-MM-DD, for example 2027-03-01.")
    try:
        d = date.fromisoformat(value)
    except ValueError:
        raise ValueError("That is not a real date; use YYYY-MM-DD.") from None
    if d <= (today or datetime.now(timezone.utc).date()):
        raise ValueError("Pick a date in the future.")
    return value


def build_instant_report(data: dict, tz: str = "America/Denver", now: Optional[float] = None) -> dict:
    """Pure: instant JSON -> {title, headline, route, notes, table, footer, url}."""
    goal = data["goal"]
    chosen = data["chosen"]
    if not chosen:
        raise ValueError("No route reaches that goal in the instant data.")
    if goal == "date":
        headline = (
            f"{chosen['te']} TE by {fmt_time(data['deadline'], tz)} \u00b7 "
            f"{fmt_span(chosen['spare'])} to spare \u00b7 instant answer"
        )
        cols = ("#", "TE", "Spare", "Reached", "Route")
        aligns = ["l", "r", "r", "l", "l"]
        rows = [
            (num(r), str(r["te"]), fmt_span(r["spare"]), fmt_short(r["reached"], tz, now, year=False),
             route_short(r["route"]))
            for r in data["rows"]
        ]
    else:
        headline = (
            f"{chosen['te']} TE by {fmt_time(chosen['reached'], tz)} \u00b7 "
            f"{chosen['ascensions']} ascensions \u00b7 instant answer"
        )
        cols = ("#", "Takes", "Reached", "Route")
        aligns = ["l", "r", "l", "l"]
        rows = [
            (num(r), fmt_span(r["reached"] - data["planStart"]), fmt_day(r["reached"], tz, now),
             route_short(r["route"]))
            for r in data["rows"]
        ]
    notes = []
    best = data.get("best")
    if data.get("preferred") and best:
        saved = best["ascensions"] - chosen["ascensions"]
        notes.append(
            f"Prefer fewer ({'same TE' if goal != 'fastest' else 'within 12 h'}): {chosen['ascensions']} ascensions "
            f"instead of the best route's {best['ascensions']} ({route_short(best['route'])}, "
            f"{best['te']} TE). {saved} fewer. Use prefer:off to see the best."
        )
    step = next_step_text(chosen.get("next"), tz)
    if step:
        notes.append(f"Next step: {step}")
    tn = table_note(data)
    if tn:
        notes.append(tn)
    return {
        "title": f"{data['goalName']}",
        "headline": headline,
        "route": fmt_route(chosen["route"]),
        "notes": notes,
        "table": table_text(cols, rows, aligns),
        "footer": FOOTER,
        "url": SITE_URL,
    }


NOTE_A1 = "A1 is from the instant answer, not a simulation of your live farm; times are rounded to the hour."


def table_note(d: dict) -> Optional[str]:
    """The site's own table check (chooseInstantTable / instantScaleOf): say when no table fits this account."""
    kind = d.get("tableKind")
    if kind == "maxed":
        return "Assumes maxed gear; your real times may be later."
    if kind == "shifted":
        return "No table built on your exact gear: uses the maxed table moved to your gear, as the site does; your real times may be later."
    return None


def next_step_text(nxt: Optional[dict], tz: str) -> Optional[str]:
    if not nxt:
        return None
    when = fmt_time(nxt["end"], tz, with_year=False)
    if nxt.get("label") in ("continue", "buildup"):
        return f"keep going on this ascension and prestige at {nxt.get('endTE', nxt.get('to'))} TE around {when}."
    return f"prestige now; the first ascension reaches {nxt.get('endTE', nxt.get('to'))} TE around {when}."


def instant_embeds(rep: dict) -> list:
    """Embed dicts (title/description/fields/footer/url), masked and under the limits."""
    desc = clean(f"{rep['headline']}\n\n**Route:** {rep['route']}" + "".join(f"\n{n}" for n in rep["notes"]))
    return [{
        "title": clean(rep["title"])[:256],
        "description": desc[:EMBED_DESC_MAX],
        "fields": [{"name": "Every number of ascensions", "value": code_block(clean(rep["table"]))}],
        "footer": clean(rep["footer"])[:2048],
        "url": rep["url"],
    }]


def render_embeds_text(embeds: list) -> str:
    out = []
    for e in embeds:
        out.append(e["title"])
        out.append(e["description"])
        for f in e.get("fields", []):
            out.append(f"[{f['name']}]\n{f['value']}")
        if e.get("footer"):
            out.append(e["footer"])
        if e.get("url"):
            out.append(e["url"])
        out.append("")
    return mask("\n".join(out))


# ---------------------------------------------------------------- /myruns

def build_myruns_embeds(d: dict, tz: str = "America/Denver", now: Optional[float] = None) -> list:
    now = datetime.now(timezone.utc).timestamp() if now is None else now
    route = fmt_route(d["chain"])
    lines = [d["goalLine"], f"Following {route}", f"From your save of {d['saveWhen']} ({d['saveTE']} TE)."]
    if d.get("preferred"):
        lines.append("Route chosen with Prefer fewer (same TE), as the site's green box does.")
    step = d.get("nextStep")
    lines.append(f"**Next step:** {step['what']} \u00b7 {step['when']}" if step else "**Next step:** none left in the plan")
    tn = table_note(d)
    if tn:
        lines.append(tn)
    lines.append(NOTE_A1)
    desc = [clean("\n".join(lines))]
    shifts = []
    for e in d["nextShifts"]:
        mark = "\u2022" if not e["past"] else "\u00b7"
        shifts.append(f"{mark} {e['what']} \u2013 {e['when']}" + (" (not done yet)" if e.get("notDone") else ""))
    fields = [{"name": "Next shifts", "value": clean("\n".join(shifts))[:EMBED_FIELD_MAX] or "none"}]
    rows = []
    for a in d["ascensions"]:
        when = "now" if a["now"] else fmt_short(a["prestigeAt"], tz, now)
        far = "" if a["now"] else a["prestigeIn"].replace("in ", "")
        rows.append((f"A{a['asc']}", f"{a['fromTE']}{ARROW}{a['stopTE']}", when, far))
    fields.append({
        "name": "Prestiges (A1 is the farm you are in)",
        "value": code_block(table_text(("", "TE", "Prestige at", "In"), rows, ["l", "l", "l", "r"])),
    })
    first = {"title": clean(f"Right now \u00b7 {d['goalName'] if 'goalName' in d else GOALS['eggday' if d['goal'] == 'date' else 'fastest']}")[:256],
             "description": desc[0][:EMBED_DESC_MAX], "fields": fields, "footer": FOOTER, "url": SITE_URL}
    # Your eggs
    egg_lines = []
    for e in d["eggs"]:
        head = f"**{e['egg']} {e['te']} TE**{' (laying)' if e['current'] else ''} \u00b7 {e['pct']}% to next"
        body = [e["nextLine"]]
        if e.get("clock"):
            body.append(e["clock"])
        egg_lines.append(clean(head + "\n" + "\n".join(body)))
    f = d["facts"]
    if d.get("afterShiftNote"):
        egg_lines.append(clean(d["afterShiftNote"]))
    tiles = [f"Shifts done: {f['shiftsDone']}", f"Next shift cost: {f['nextShiftCost']}"]
    if f.get("planned"):
        tiles.append(f"Planned shifts: {f['planned']['value']}, {f['planned']['note']}")
    if f.get("silos"):
        tiles.append(f"Silos: {f['silos']['value']} ({f['silos']['note']})")
    if f.get("habs"):
        tiles.append(f"Habs: {f['habs']}")
    if f.get("clothed"):
        tiles.append(f"Clothed TE: {f['clothed']}")
    eggs_embed = {
        "title": "Your eggs \u00b7 from your save",
        "description": clean("\n\n".join(egg_lines))[:EMBED_DESC_MAX],
        "fields": [{"name": "Facts", "value": clean("\n".join(tiles))[:EMBED_FIELD_MAX]}],
        "footer": FOOTER,
        "url": SITE_URL,
    }
    return [first, eggs_embed]


def build_next_embed(d: dict, tz: str = "America/Denver") -> dict:
    """The next step and the one after it (the site's Next shifts list), nothing else."""
    ahead = [e for e in d["nextShifts"] if not e["past"] and e["kind"] != "goal"] or [
        e for e in d["nextShifts"] if not e["past"]]
    lines = []
    for label, e in zip(("Next", "Then"), ahead[:2]):
        lines.append(f"**{label}:** {e['what']} \u00b7 {e['when']}" + (" (not done yet)" if e.get("notDone") else ""))
    if not lines:
        lines = ["Nothing left in the plan."]
    lines.append(f"\n{d['goalLine']}")
    if table_note(d):
        lines.append(table_note(d))
    return {"title": "Next step", "description": clean("\n".join(lines))[:EMBED_DESC_MAX], "fields": [],
            "footer": FOOTER, "url": SITE_URL}


def next_for(cfg: dict, goal: str, eid: Optional[str] = None) -> list:
    return [build_next_embed(run_planner(cfg, "myruns", goal, eid=eid), cfg["TIMEZONE"])]


def embed_size(e: dict) -> int:
    return (len(e.get("title", "")) + len(e.get("description", "")) + len(e.get("footer") or "")
            + sum(len(f["name"]) + len(f["value"]) for f in e.get("fields", [])))


def pack_messages(embeds: list, limit: int = EMBED_TOTAL_MAX) -> list:
    """Group embeds into messages under Discord's 6000-character total (and 10 embeds)."""
    out, cur, size = [], [], 0
    for e in embeds:
        n = embed_size(e)
        if cur and (size + n > limit or len(cur) >= 10):
            out.append(cur)
            cur, size = [], 0
        cur.append(e)
        size += n
    if cur:
        out.append(cur)
    return out


def help_embed() -> dict:
    return {
        "title": "AutoAutoAP commands (proof of concept)",
        "description": "Instant answers and My runs from the saved save. No searches are run.",
        "fields": [{"name": n, "value": v[:EMBED_FIELD_MAX]} for n, v in HELP_LINES],
        "footer": FOOTER,
        "url": SITE_URL,
    }


# ---------------------------------------------------------------- running the planner

def find_node(cmd: str) -> str:
    found = shutil.which(cmd)
    if not found:
        raise RuntimeError(f"Node not found ({cmd!r}); install Node 22+ or set NODE.")
    return found


def run_planner(cfg: dict, mode: str, goal: str = "eggday", date_str: Optional[str] = None,
                prefer: str = "same", eid: Optional[str] = None) -> dict:
    """Run the wrapper. With `eid` the id goes to the wrapper on stdin only; every error text is scrubbed."""
    eid = eid.strip() if eid else None
    try:
        return _run_planner(cfg, mode, goal, date_str, prefer, eid)
    except RuntimeError as e:
        raise RuntimeError(scrub(str(e), eid)) from None
    except Exception as e:  # never let an unexpected text carry the id out
        raise RuntimeError(scrub(f"Unexpected {type(e).__name__}.", eid)) from None


def _run_planner(cfg: dict, mode: str, goal: str, date_str: Optional[str], prefer: str, eid: Optional[str]) -> dict:
    if eid and not valid_eid(eid):
        raise RuntimeError("That does not look like a player ID.")
    save = Path(cfg["SAVE_PATH"]).expanduser() if cfg["SAVE_PATH"] else None
    tables = Path(cfg["TABLES_DIR"]).expanduser() if cfg["TABLES_DIR"] else None
    script = HERE / "dist" / "instant_json.mjs"
    if not eid and (not save or not save.is_file()):
        raise RuntimeError("SAVE_PATH is not set or the file is missing.")
    if not tables or not tables.is_dir():
        raise RuntimeError("TABLES_DIR is not set or is not a folder.")
    if not script.is_file():
        raise RuntimeError("dist/instant_json.mjs missing; run: node build.mjs (see README).")
    if goal not in GOALS or prefer not in ("same", "off") or mode not in ("instant", "myruns"):
        raise RuntimeError("Unknown option.")
    cmd = [find_node(cfg["NODE"]), str(script), "--mode", mode, "--tables", str(tables),
           "--goal", goal, "--prefer", prefer, "--zone", cfg["TIMEZONE"]]
    cmd += ["--eid-stdin"] if eid else ["--save", str(save)]
    if goal == "date":
        cmd += ["--date", parse_date(date_str)]
    try:
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=cfg["TIMEOUT"], encoding="utf-8",
                           input=eid if eid else None)
    except subprocess.TimeoutExpired:
        raise RuntimeError(f"The planner took longer than {cfg['TIMEOUT']}s.") from None
    if p.returncode != 0:
        tail = scrub(p.stderr.strip().splitlines()[-1] if p.stderr.strip() else "no message", eid)
        raise RuntimeError(f"The planner failed: {tail[:200]}")
    return json.loads(scrub(p.stdout.strip().splitlines()[-1], eid))


def instant_for(cfg: dict, goal: str, date_str: Optional[str], prefer: str, eid: Optional[str] = None) -> list:
    data = run_planner(cfg, "instant", goal, date_str, prefer, eid)
    return instant_embeds(build_instant_report(data, cfg["TIMEZONE"]))


def myruns_for(cfg: dict, goal: str, eid: Optional[str] = None) -> list:
    data = run_planner(cfg, "myruns", goal, eid=eid)
    return build_myruns_embeds(data, cfg["TIMEZONE"])


# ---------------------------------------------------------------- discord

def to_discord(e: dict):
    emb = discord.Embed(title=e.get("title"), description=e.get("description"), url=e.get("url"),
                        colour=discord.Colour.green())
    for f in e.get("fields", []):
        emb.add_field(name=f["name"], value=f["value"], inline=False)
    if e.get("footer"):
        emb.set_footer(text=e["footer"])
    return emb


def clear_guild_commands(cfg: dict) -> None:
    """One-time clean-up: remove the guild-scoped copies of the commands for GUILD_ID, then exit."""
    if discord is None:
        raise SystemExit("discord.py is not installed (pip install -r requirements.txt).")
    token = os.environ.get("DISCORD_TOKEN")
    if not token or not cfg["GUILD_ID"].isdigit():
        raise SystemExit("Set DISCORD_TOKEN and GUILD_ID (digits) first (see README).")

    class Cleaner(discord.Client):
        def __init__(self):
            super().__init__(intents=discord.Intents.none())
            self.tree = app_commands.CommandTree(self)

        async def setup_hook(self):
            guild = discord.Object(id=int(cfg["GUILD_ID"]))
            self.tree.clear_commands(guild=guild)
            await self.tree.sync(guild=guild)
            print("Guild-scoped commands removed; the global ones stay.")
            await self.close()

    Cleaner().run(token)


def run_bot(cfg: dict) -> None:
    if discord is None:
        raise SystemExit("discord.py is not installed (pip install -r requirements.txt).")
    token = os.environ.get("DISCORD_TOKEN")
    if not token:
        raise SystemExit("Set DISCORD_TOKEN in your environment first (see README).")

    class Bot(discord.Client):
        def __init__(self):
            super().__init__(intents=discord.Intents.none())
            self.tree = app_commands.CommandTree(self)
            self.busy = None

        async def setup_hook(self):
            self.busy = asyncio.Lock()  # one planner run at a time
            await self.tree.sync()  # globally only: what servers, user installs and DMs all use

    bot = Bot()

    async def reply(interaction, private, make, eid: Optional[str] = None):
        private = effective_private(private, eid, from_save=not eid)
        await interaction.response.defer(thinking=True, ephemeral=private)
        try:
            async with bot.busy:
                embeds = await asyncio.get_running_loop().run_in_executor(None, make)
        except Exception as e:  # shown to the asker only, scrubbed of any id
            await interaction.followup.send(scrub(f"Could not work that out: {e}", eid)[:1900], ephemeral=private)
            return
        for group in pack_messages(embeds):
            await interaction.followup.send(embeds=[to_discord(x) for x in group], ephemeral=private)

    async def bad_eid(interaction) -> bool:
        """True (and answered, privately, without echoing it) when the id given is not a player ID."""
        await interaction.response.send_message("That does not look like a player ID.", ephemeral=True)
        return True

    async def owner_only(interaction) -> bool:
        """Without an eid only the owner may use the saved save; anyone else is asked for theirs, privately."""
        if may_use_saved_save(interaction.user.id, cfg["OWNER_ID"]):
            return True
        await interaction.response.send_message(NEED_EID, ephemeral=True)
        return False

    goal_choices = [app_commands.Choice(name=GOALS[k], value=k) for k in ("eggday", "fastest", "date")]
    EID_HELP = "Your own player ID (reply is then private); leave out to use the bot owner's save"
    # Installable on a server or on a user's own account, usable anywhere, DMs included.
    everywhere = lambda f: app_commands.allowed_contexts(guilds=True, dms=True, private_channels=True)(
        app_commands.allowed_installs(guilds=True, users=True)(f))

    @bot.tree.command(name="instant", description="Instant answer from an AutoAutoAP save")
    @everywhere
    @app_commands.describe(goal="What to aim for", date="For 'Highest TE by a date': YYYY-MM-DD",
                           prefer="Prefer fewer ascensions: same TE (default) or off",
                           private="Reply only to you (default for the owner's own save)", eid=EID_HELP)
    @app_commands.choices(goal=goal_choices, prefer=[
        app_commands.Choice(name="same TE (default)", value="same"),
        app_commands.Choice(name="off", value="off"),
    ])
    async def instant(interaction: discord.Interaction, goal: Optional[app_commands.Choice[str]] = None,
                      date: Optional[str] = None, prefer: Optional[app_commands.Choice[str]] = None,
                      private: Optional[bool] = None, eid: Optional[str] = None):
        g = goal.value if goal else "eggday"
        p = prefer.value if prefer else "same"
        if eid and not valid_eid(eid):
            await bad_eid(interaction)
            return
        if g == "date":
            try:
                parse_date(date)
            except ValueError as e:
                await interaction.response.send_message(str(e), ephemeral=True)
                return
        if not eid and not await owner_only(interaction):
            return
        await reply(interaction, private, lambda: instant_for(cfg, g, date, p, eid), eid)

    @bot.tree.command(name="myruns", description="My runs: Right now and Your eggs")
    @everywhere
    @app_commands.describe(goal="Which plan (default Egg Day)", private="Reply only to you (default for the owner's own save)", eid=EID_HELP)
    @app_commands.choices(goal=[c for c in goal_choices if c.value != "date"])
    async def myruns(interaction: discord.Interaction, goal: Optional[app_commands.Choice[str]] = None,
                     private: Optional[bool] = None, eid: Optional[str] = None):
        g = goal.value if goal else "eggday"
        if eid and not valid_eid(eid):
            await bad_eid(interaction)
            return
        if not eid and not await owner_only(interaction):
            return
        await reply(interaction, private, lambda: myruns_for(cfg, g, eid), eid)

    @bot.tree.command(name="next", description="Just the next step and the one after it")
    @everywhere
    @app_commands.describe(goal="Which plan (default Egg Day)", private="Reply only to you (default for the owner's own save)", eid=EID_HELP)
    @app_commands.choices(goal=[c for c in goal_choices if c.value != "date"])
    async def next_cmd(interaction: discord.Interaction, goal: Optional[app_commands.Choice[str]] = None,
                       private: Optional[bool] = None, eid: Optional[str] = None):
        g = goal.value if goal else "eggday"
        if eid and not valid_eid(eid):
            await bad_eid(interaction)
            return
        if not eid and not await owner_only(interaction):
            return
        await reply(interaction, private, lambda: next_for(cfg, g, eid), eid)

    @bot.tree.command(name="help", description="List the AutoAutoAP commands")
    @everywhere
    @app_commands.describe(private="Reply only to you")
    async def help_cmd(interaction: discord.Interaction, private: Optional[bool] = None):
        await interaction.response.send_message(embed=to_discord(help_embed()), ephemeral=bool(private))

    bot.run(token)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="AutoAutoAP Discord bot")
    ap.add_argument("--dry-run", choices=["instant", "myruns", "next", "help"], help="print a command's embed text, no Discord")
    ap.add_argument("--goal", choices=list(GOALS), default="eggday")
    ap.add_argument("--date", help="for --goal date: YYYY-MM-DD")
    ap.add_argument("--prefer", choices=["same", "off"], default="same")
    ap.add_argument("--clear-guild-commands", action="store_true",
                    help="remove the guild-scoped copies of the commands for GUILD_ID, then exit")
    args = ap.parse_args(argv)
    cfg = load_config()
    eid = os.environ.get("DRY_RUN_EID") or None  # a dry run never takes an id on the command line
    if args.clear_guild_commands:
        clear_guild_commands(cfg)
        return 0
    if args.dry_run:
        if args.dry_run == "help":
            embeds = [help_embed()]
        elif args.dry_run == "instant":
            embeds = instant_for(cfg, args.goal, args.date, args.prefer, eid)
        elif args.dry_run == "next":
            embeds = next_for(cfg, "fastest" if args.goal == "fastest" else "eggday", eid)
        else:
            embeds = myruns_for(cfg, "fastest" if args.goal == "fastest" else "eggday", eid)
        for i, group in enumerate(pack_messages(embeds), 1):
            print(f"--- message {i} ---")
            print(render_embeds_text(group))
        return 0
    run_bot(cfg)
    return 0


if __name__ == "__main__":
    sys.exit(main())
