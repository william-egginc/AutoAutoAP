import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import bot  # noqa: E402
import fixtures as fx  # noqa: E402

ID = re.compile(r"EI\d{16}")
FAKE = "EI" + "7" * 16  # built at run time; not a real id
TZ = "America/Denver"


def all_text(embeds):
    return "\n".join(f"{e['title']}{e['description']}{e.get('footer') or ''}"
                     + "".join(f['name'] + f['value'] for f in e.get('fields', [])) for e in embeds)


def test_mask_player_id():
    assert bot.mask(f"hi {FAKE} there") == "hi EI… there"
    assert not ID.search(bot.mask(FAKE + "EI" + "3" * 16))


def test_replies_never_contain_player_id():
    data = fx.instant()
    data["goalName"] = f"Egg Day {FAKE}"
    data["chosen"]["next"]["label"] = FAKE
    texts = [all_text(bot.instant_embeds(bot.build_instant_report(data, TZ, fx.NOW))),
             bot.render_embeds_text(bot.instant_embeds(bot.build_instant_report(data, TZ, fx.NOW)))]
    m = fx.myruns()
    m["goalLine"] = f"x {FAKE}"
    m["eggs"][0]["nextLine"] = FAKE
    m["nextStep"]["what"] = FAKE
    embeds = bot.build_myruns_embeds(m, TZ, fx.NOW)
    texts += [all_text(embeds), bot.render_embeds_text(embeds), all_text([bot.help_embed()])]
    assert all(not ID.search(t) for t in texts)


def test_times_are_12_hour():
    assert bot.fmt_time(fx.DEADLINE, TZ) == "Jul 14, 2027 at 10:00 am"
    assert bot.fmt_time(fx.DEADLINE + 3 * 3600 + 300, TZ) == "Jul 14, 2027 at 1:05 pm"
    assert bot.am_pm("Nov 14 at 1:51 AM, in 16d") == "Nov 14 at 1:51 am, in 16d"
    for goal in ("date", "fastest"):
        text = all_text(bot.instant_embeds(bot.build_instant_report(fx.instant(goal), TZ, fx.NOW)))
        assert not re.search(r"\b(1[3-9]|2[0-3]):\d\d\b", text)
    text = all_text(bot.build_myruns_embeds(fx.myruns(), TZ, fx.NOW))
    assert " AM" not in text and " PM" not in text


def test_headline_date_goal():
    rep = bot.build_instant_report(fx.instant("date"), TZ, fx.NOW)
    assert rep["headline"] == "285 TE by Jul 14, 2027 at 10:00 am · 39h 24m to spare · instant answer"
    assert rep["route"] == "200 → 220 → 240 → 285"
    assert any("Prefer fewer" in n for n in rep["notes"])


def test_headline_fastest_goal():
    rep = bot.build_instant_report(fx.instant("fastest", preferred=False), TZ, fx.NOW)
    assert rep["headline"].startswith("490 TE by ") and "instant answer" in rep["headline"]
    assert not any("Prefer fewer" in n for n in rep["notes"])


def test_table_fits_a_phone():
    for goal in ("date", "fastest"):
        rep = bot.build_instant_report(fx.instant(goal), TZ, fx.NOW)
        assert max(len(l) for l in rep["table"].splitlines()) <= bot.WIDTH
        assert any(l.startswith(">") for l in rep["table"].splitlines())  # the chosen row is marked
    m = bot.build_myruns_embeds(fx.myruns(), TZ, fx.NOW)
    block = m[0]["fields"][1]["value"].strip("`\n")
    assert max(len(l) for l in block.splitlines()) <= bot.WIDTH


def test_route_short():
    assert bot.route_short([274]) == "274"
    assert bot.route_short([224, 297]) == "224→297"
    assert bot.route_short([199, 228, 279, 307]) == "199→…→307"


def test_embed_limits_and_packing():
    long = fx.instant("date")
    long["rows"] = long["rows"] * 12
    e = bot.instant_embeds(bot.build_instant_report(long, TZ, fx.NOW))[0]
    assert len(e["fields"][0]["value"]) <= bot.EMBED_FIELD_MAX
    assert len(e["description"]) <= bot.EMBED_DESC_MAX and len(e["title"]) <= 256
    embeds = bot.build_myruns_embeds(fx.myruns(), TZ, fx.NOW)
    for group in bot.pack_messages(embeds * 4):
        assert sum(bot.embed_size(x) for x in group) <= 6000 and len(group) <= 10


def test_myruns_content():
    first, eggs = bot.build_myruns_embeds(fx.myruns(), TZ, fx.NOW)
    assert "Next step" in first["description"] and "Shift to Humility" in first["description"]
    assert [f["name"] for f in first["fields"]][0] == "Next shifts"
    assert "A1" in first["fields"][1]["value"] and "A2" in first["fields"][1]["value"]
    assert "Curiosity 35 TE" in eggs["description"]
    facts = eggs["fields"][0]["value"]
    for word in ("Shifts done", "Next shift cost", "Silos", "Habs", "Clothed TE"):
        assert word in facts


def test_footer_link_and_help():
    rep = bot.build_instant_report(fx.instant(), TZ, fx.NOW)
    assert rep["footer"].startswith("Beta") and rep["footer"].endswith(bot.SITE_URL)
    assert rep["url"] == "https://egg-beta.williamstest.fyi/ascension-planner/"
    names = [f["name"] for f in bot.help_embed()["fields"]]
    assert names == ["/instant", "/myruns", "/next", "/help"]


def test_date_validation():
    import datetime as dt
    today = dt.date(2026, 10, 28)
    assert bot.parse_date("2027-03-01", today) == "2027-03-01"
    for bad in ("", None, "03/01/2027", "2027-13-01", "2026-10-28", "2020-01-01", "2027-03-01; rm"):
        try:
            bot.parse_date(bad, today)
        except ValueError:
            continue
        raise AssertionError(bad)


def test_span():
    assert bot.fmt_span(39 * 3600 + 24 * 60) == "39h 24m"
    assert bot.fmt_span(5 * 86400 + 3 * 3600) == "5d 3h"


def test_next_shows_two_steps_and_no_id():
    m = fx.myruns()
    m["goalLine"] += " " + FAKE
    e = bot.build_next_embed(m, TZ)
    assert "**Next:** Shift to Humility" in e["description"] and "**Then:** Prestige at 200 TE" in e["description"]
    assert " PM" not in e["description"] and not ID.search(all_text([e]))


# ---------------------------------------------------------------- player id (eid) handling

import json as _json  # noqa: E402
import subprocess  # noqa: E402

CFG = {"SAVE_PATH": "", "TABLES_DIR": ".", "NODE": "node", "TIMEZONE": TZ, "TIMEOUT": 5}


class FakeProc:
    def __init__(self, code=0, out="", err=""):
        self.returncode, self.stdout, self.stderr = code, out, err


def patch_runner(monkeypatch, tmp_path, proc, seen):
    (tmp_path / "dist").mkdir(exist_ok=True)
    script = tmp_path / "dist" / "instant_json.mjs"
    script.write_text("")
    monkeypatch.setattr(bot, "HERE", tmp_path)
    monkeypatch.setattr(bot, "find_node", lambda c: "node")
    cfg = dict(CFG, TABLES_DIR=str(tmp_path))

    def run(cmd, **kw):
        seen["cmd"], seen["input"] = cmd, kw.get("input")
        if isinstance(proc, Exception):
            raise proc
        return proc

    monkeypatch.setattr(subprocess, "run", run)
    return cfg


def test_eid_goes_on_stdin_never_in_arguments(monkeypatch, tmp_path):
    eid, seen = FAKE, {}
    out = _json.dumps(fx.myruns())
    cfg = patch_runner(monkeypatch, tmp_path, FakeProc(0, out), seen)
    bot.run_planner(cfg, "myruns", "eggday", eid=eid)
    assert seen["input"] == eid
    assert not any(eid in part for part in seen["cmd"]) and "--eid-stdin" in seen["cmd"]
    assert "--save" not in seen["cmd"]


def test_eid_scrubbed_from_every_error(monkeypatch, tmp_path):
    for eid in (FAKE, "weird-id-" + "9" * 12):  # a shape the EI+16 mask would miss
        for proc in (FakeProc(1, "", f"boom {eid} and more"),
                     FakeProc(0, "not json " + eid),
                     subprocess.TimeoutExpired(["x"], 5),
                     OSError(f"failed for {eid}")):
            seen = {}
            cfg = patch_runner(monkeypatch, tmp_path, proc, seen)
            try:
                bot.run_planner(cfg, "instant", "eggday", eid=eid)
            except RuntimeError as e:
                assert eid not in str(e) and not ID.search(str(e))
            else:
                raise AssertionError("expected an error")


def test_eid_scrubbed_from_data_and_replies(monkeypatch, tmp_path):
    seen = {}
    d = fx.myruns()
    d["goalLine"] = f"line {FAKE}"
    cfg = patch_runner(monkeypatch, tmp_path, FakeProc(0, _json.dumps(d)), seen)
    embeds = bot.myruns_for(cfg, "eggday", FAKE)
    assert FAKE not in all_text(embeds) and not ID.search(bot.render_embeds_text(embeds))
    nxt = bot.next_for(cfg, "eggday", FAKE)
    assert FAKE not in all_text(nxt)


def test_bad_eid_is_refused_without_echo(monkeypatch, tmp_path):
    cfg = patch_runner(monkeypatch, tmp_path, FakeProc(0, "{}"), {})
    bogus = "not-an-id-" + "5" * 8
    try:
        bot.run_planner(cfg, "instant", "eggday", eid=bogus)
    except RuntimeError as e:
        assert bogus not in str(e) and "player ID" in str(e)
    else:
        raise AssertionError("expected an error")
    assert not bot.valid_eid(bogus) and bot.valid_eid(FAKE)


def test_eid_reply_always_private():
    assert bot.effective_private(False, FAKE) is True
    assert bot.effective_private(False, None) is False
    assert bot.effective_private(True, None) is True


def test_every_command_is_user_installable_and_eid_aware():
    src = Path(bot.__file__).read_text()
    assert src.count("@bot.tree.command(") == 4 and src.count("@everywhere") == 4
    assert "allowed_installs(guilds=True, users=True)" in src
    assert "allowed_contexts(guilds=True, dms=True, private_channels=True)" in src
    assert src.count("eid: Optional[str] = None") >= 3
    assert "--eid-stdin" in src


def test_dry_run_never_takes_an_id_on_the_command_line():
    src = Path(bot.__file__).read_text()
    assert '"--eid"' not in src and "add_argument(\"--eid\"" not in src


def test_every_reply_carries_the_beta_footer():
    one = "Beta \u00b7 answers can be off; check the site for your exact plan \u2192 https://egg-beta.williamstest.fyi/ascension-planner/"
    assert bot.FOOTER == one
    embeds = (bot.instant_embeds(bot.build_instant_report(fx.instant(), TZ, fx.NOW))
              + bot.build_myruns_embeds(fx.myruns(), TZ, fx.NOW) + [bot.build_next_embed(fx.myruns(), TZ), bot.help_embed()])
    assert all(e["footer"] == one for e in embeds)


def test_saved_save_is_owner_only():
    assert bot.may_use_saved_save(111, "111") and bot.may_use_saved_save("111", " 111 ")
    assert not bot.may_use_saved_save(222, "111")
    assert not bot.may_use_saved_save(111, "") and not bot.may_use_saved_save(111, None or "")
    assert "player ID" in bot.NEED_EID and not ID.search(bot.NEED_EID)


def test_private_defaults():
    assert bot.effective_private(None, None, from_save=True) is True      # owner, saved save: private
    assert bot.effective_private(False, None, from_save=True) is False    # unless private:false
    assert bot.effective_private(False, FAKE, from_save=True) is True     # an eid always wins
    assert bot.effective_private(None, None, from_save=False) is False    # /help and the like stay public


def test_non_owner_never_reaches_the_planner():
    src = Path(bot.__file__).read_text()
    # every data command asks owner_only() before any planner run when there is no eid
    assert src.count("if not eid and not await owner_only(interaction):") == 3
    assert src.index("owner_only(interaction)") < src.index("await reply(interaction, private, lambda")


def test_table_notes_follow_the_sites_check():
    d = fx.myruns()
    d["tableKind"] = "maxed"
    assert "Assumes maxed gear; your real times may be later." in all_text(bot.build_myruns_embeds(d, TZ, fx.NOW))
    assert "Assumes maxed gear" in all_text([bot.build_next_embed(d, TZ)])
    i = fx.instant()
    i["tableKind"] = "maxed"
    assert "Assumes maxed gear" in all_text(bot.instant_embeds(bot.build_instant_report(i, TZ, fx.NOW)))
    d["tableKind"] = "shifted"
    assert "moved to your gear" in all_text(bot.build_myruns_embeds(d, TZ, fx.NOW))
    for kind in ("own", "gear"):
        d["tableKind"] = kind
        assert "Assumes maxed" not in all_text(bot.build_myruns_embeds(d, TZ, fx.NOW))


def test_register_globally_only_and_clear_flag():
    src = Path(bot.__file__).read_text()
    assert "copy_global_to" not in src
    assert "tree.clear_commands(guild=guild)" in src and "await self.tree.sync(guild=guild)" in src
    assert "--clear-guild-commands" in src
