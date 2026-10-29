"""Made-up planner output for the tests, built in code (no real save, no data files)."""
from __future__ import annotations

DEADLINE = 1815580800  # Jul 14, 2027 9:00 am Pacific = 10:00 am Mountain
PLAN_START = 1793236136
NOW = 1793240000.0


def _route(k: int, te: int) -> list:
    return [200 + 20 * i for i in range(k - 1)] + [te]


def instant(goal: str = "date", preferred: bool = True) -> dict:
    spares = [(250, 90000), (270, 120000), (280, 60000), (285, 141840), (285, 150000)]
    rows = []
    for k, (te, spare) in enumerate(spares, start=1):
        reached = DEADLINE - spare if goal == "date" else 1850000000 + k * 1000
        rows.append({"ascensions": k, "te": te if goal == "date" else 490, "reached": reached,
                     "spare": spare if goal == "date" else None, "route": _route(k, te if goal == "date" else 490),
                     "chosen": k == 4})
    nxt = {"label": "continue", "to": 200, "start": PLAN_START, "end": PLAN_START + 140000, "endTE": 200}

    def pack(r):
        return {"route": r["route"], "te": r["te"], "reached": r["reached"], "spare": r["spare"],
                "ascensions": r["ascensions"], "next": nxt}

    return {
        "saveTE": 150, "planStart": PLAN_START, "goalName": "Egg Day 2027" if goal == "date" else "Fastest to 490 TE",
        "goal": goal, "deadline": DEADLINE if goal == "date" else None, "final": 490, "prefer": "same",
        "best": pack(rows[-1]), "chosen": pack(rows[3]), "preferred": preferred, "rows": rows,
    }


def myruns() -> dict:
    ev = lambda what, when, at, kind="shift", nxt=False: {"what": what, "when": when, "at": at, "kind": kind,
                                                          "past": False, "notDone": False, "next": nxt, "asc": 1}
    return {
        "goal": "date", "goalName": "Egg Day 2027",
        "goalLine": "Egg Day 2027: 285 TE, last TE Jul 14, 2027 at 5:17 AM (41h 40m to spare)",
        "saveTE": 150, "onVirtue": True, "saveWhen": "Oct 18 at 5:00 PM", "chain": [200, 220, 240, 285],
        "preferred": True,
        "nextStep": ev("Shift to Humility", "today at 6:30 PM, in 2h 10m", NOW + 7800, nxt=True),
        "nextShifts": [ev("Shift to Humility", "today at 6:30 PM, in 2h 10m", NOW + 7800, nxt=True),
                       ev("Prestige at 200 TE", "Nov 14 at 1:51 AM, in 16d", NOW + 1400000, "prestige")],
        "ascensions": [
            {"asc": 1, "fromTE": 150, "stopTE": 200, "now": True, "prestigeAt": PLAN_START, "reachedAt": NOW + 1400000,
             "prestigeIn": "", "reachedIn": "in 16d", "shifts": 0},
            {"asc": 2, "fromTE": 200, "stopTE": 220, "now": False, "prestigeAt": NOW + 1400100,
             "reachedAt": NOW + 7000000, "prestigeIn": "in 16d", "reachedIn": "in 80d", "shifts": 5},
        ],
        "eggs": [
            {"egg": "Curiosity", "te": 35, "current": True, "pct": 87, "nextLine": "next TE in 3h 20m at your save's rate",
             "clock": "next TE about Thu, Oct 29 at 4:46 AM", "toGoal": "", "toGoalClock": ""},
            {"egg": "Kindness", "te": 40, "current": False, "pct": 13,
             "nextLine": "next TE in ~2d 20h after you shift here", "clock": "", "toGoal": "", "toGoalClock": ""},
        ],
        "afterShiftNote": "After a shift: your farm as in the save",
        "facts": {"shiftsDone": 66, "nextShiftCost": "26.4Q soul eggs",
                  "planned": {"value": "35 shifts", "note": "will cost about 1.8s soul eggs"},
                  "silos": {"value": "empty", "note": "since Oct 19 at 5:00 PM"}, "habs": "100% full",
                  "clothed": "321 (equipped 192) with your earnings set"},
    }
