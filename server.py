from flask import Flask, request, jsonify
from flask_cors import CORS
import math
import sqlite3
import uuid
import os
import threading
import time
from datetime import datetime
import pandas as pd
import requests
import os
import tempfile

# Dynamically resolves to the OS temporary folder with your new branding name
lock_file_path = os.path.join(tempfile.gettempdir(), "healthscore_refresh.lock")
lock_file = open(lock_file_path, "w")

try:
    import fcntl  # POSIX only — used to make sure only ONE process runs the
    # background refresh loop even if gunicorn starts multiple workers.
except ImportError:
    fcntl = None

try:
    import numpy as np
    from scipy.optimize import minimize
    ELITE_MODEL_AVAILABLE = True
except ImportError:
    ELITE_MODEL_AVAILABLE = False

app = Flask(__name__)
CORS(app, supports_credentials=True)
@app.after_request
def apply_cors_headers(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type,Authorization"
    response.headers["Access-Control-Allow-Methods"] = "GET,POST,OPTIONS"
    return response

DB_FILE = "database.db"
DEFAULT_LEAGUE = "General"
LEAGUE_AVG_HOME_DEFAULT = 1.40
LEAGUE_AVG_AWAY_DEFAULT = 1.10
MAX_GOALS = 7
DEFAULT_RHO = 0.10

# Set this as an environment variable on Render/locally — never commit a
# real key to git. Get a free-tier key at https://the-odds-api.com
ODDS_API_KEY = os.environ.get("ODDS_API_KEY", "YOUR_API_KEY_HERE")

# Maps the league names used throughout this app to The Odds API's sport keys.
# Add more here as you cover more leagues.
LEAGUE_SPORT_KEYS = {
    "Premier League": "soccer_epl",
    "La Liga": "soccer_spain_la_liga",
    "Serie A": "soccer_italy_serie_a",
    "Bundesliga": "soccer_germany_bundesliga",
    "Ligue 1": "soccer_france_ligue_one",
    "MLS": "soccer_usa_mls",
    "Champions League": "soccer_uefa_champs_league",
}

# --- Background auto-refresh settings ---
# The Odds API free tier is ~500 requests/month. Polling every league every
# 5 minutes would burn that in hours (7 leagues x 288 cycles/day = ~2000
# calls/day). Default here is deliberately conservative; tune via env vars.
# LIVE_LEAGUES lets you poll a subset (comma-separated) instead of every
# league in LEAGUE_SPORT_KEYS — e.g. LIVE_LEAGUES="Premier League,La Liga".
LIVE_REFRESH_SECONDS = int(os.environ.get("LIVE_REFRESH_SECONDS", 1800))  # 30 min
MIN_LIVE_EDGE = float(os.environ.get("MIN_LIVE_EDGE", 5))
_live_leagues_env = os.environ.get("LIVE_LEAGUES")
LIVE_LEAGUES = (
    [l.strip() for l in _live_leagues_env.split(",") if l.strip()]
    if _live_leagues_env
    else list(LEAGUE_SPORT_KEYS.keys())
)

LIVE_CACHE = []

# --- Elite model settings ---
# The "elite" model replaces the moment-based shrinkage heuristic with a
# proper maximum-likelihood-fitted Dixon-Coles model: attack/defense ratings,
# a fitted home-advantage parameter, and rho are all estimated jointly by
# maximizing the (time-weighted) Poisson likelihood over real results —
# this is the actual approach from the original Dixon & Coles (1997) paper,
# rather than simple scored/conceded averages.
#
# Recent matches are weighted more than old ones via exponential time decay
# (a team's form 6 months ago matters less than last week). MATCH_DECAY_XI
# controls how fast that decay is; the default halves a match's weight
# roughly every ~200 days (about one season).
#
# A league only gets the elite fit once it has enough matches relative to
# its number of teams — below that, results are too sparse for MLE to be
# numerically stable, and the existing shrinkage method (which degrades
# gracefully to the league average for small samples) is used instead.
MATCH_DECAY_XI = float(os.environ.get("MATCH_DECAY_XI", math.log(2) / 200))
MIN_MATCHES_PER_TEAM_FOR_ELITE = float(os.environ.get("MIN_MATCHES_PER_TEAM_FOR_ELITE", 4))

_elite_cache = {}  # league -> {"n_results": int, "attack": {}, "defense": {}, "home_adv": float, "rho": float}


# ===============================
# ✅ DB CONNECTION / SCHEMA
# ===============================
def get_conn():
    conn = sqlite3.connect(DB_FILE)
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    conn = get_conn()
    c = conn.cursor()

    # Real finished matches — the only thing team ratings are learned from.
    c.execute("""
    CREATE TABLE IF NOT EXISTS results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        league TEXT,
        home TEXT,
        away TEXT,
        home_goals INTEGER,
        away_goals INTEGER,
        date TEXT
    )
    """)

    # Every prediction made, tagged with a fixture_id so a later result
    # can be matched back to the exact prediction it should settle.
    # commence_time identifies the real-world fixture instance so the
    # background refresh loop can recognize "this is the same match I saw
    # 30 minutes ago" instead of creating a fresh row every cycle.
    c.execute("""
    CREATE TABLE IF NOT EXISTS predictions (
        fixture_id TEXT PRIMARY KEY,
        league TEXT,
        home TEXT,
        away TEXT,
        commence_time TEXT,
        exp_home REAL,
        exp_away REAL,
        home_win REAL,
        draw REAL,
        away_win REAL,
        btts_yes REAL,
        over_1_5 REAL,
        over_2_5 REAL,
        over_3_5 REAL,
        best_pick TEXT,
        timestamp TEXT,
        settled INTEGER DEFAULT 0
    )
    """)

    # Settled predictions joined with what actually happened — this is
    # what /api/stats reads to compute hit rate & calibration (Brier score).
    c.execute("""
    CREATE TABLE IF NOT EXISTS backtest (
        fixture_id TEXT,
        league TEXT,
        home TEXT,
        away TEXT,
        pred_home_win REAL,
        pred_draw REAL,
        pred_away_win REAL,
        actual_class TEXT,
        pred_btts REAL,
        actual_btts INTEGER,
        pred_over_2_5 REAL,
        actual_over_2_5 INTEGER,
        settled_at TEXT
    )
    """)

    # One row per live fixture currently showing value, kept up to date by
    # the background refresh loop. UNIQUE on fixture_id means re-checking
    # the same fixture UPDATES its row instead of appending a duplicate.
    c.execute("""
    CREATE TABLE IF NOT EXISTS live_picks_cache (
        fixture_id TEXT PRIMARY KEY,
        league TEXT,
        home TEXT,
        away TEXT,
        commence_time TEXT,
        pick TEXT,
        edge REAL,
        updated_at TEXT
    )
    """)

    conn.commit()
    conn.close()


init_db()


def _migrate_existing_db():
    """If this is an existing database created before commence_time existed,
    add the column instead of crashing on a schema mismatch."""
    conn = get_conn()
    try:
        conn.execute("ALTER TABLE predictions ADD COLUMN commence_time TEXT")
        conn.commit()
    except sqlite3.OperationalError:
        pass  # column already exists
    finally:
        conn.close()


_migrate_existing_db()


# ===============================
# ✅ TEAM RATINGS — learned per league from REAL results only,
# with shrinkage toward that league's own average for small samples.
# (Previously: expected goals were hardcoded to 1.5/1.2 for every match,
# and "league" was stored but never actually used anywhere.)
# ===============================
def compute_team_ratings(league):
    conn = get_conn()
    df = pd.read_sql_query(
        "SELECT * FROM results WHERE lower(league) = lower(?)", conn, params=(league,)
    )
    conn.close()

    if df.empty:
        return {}, LEAGUE_AVG_HOME_DEFAULT, LEAGUE_AVG_AWAY_DEFAULT

    df["home"] = df["home"].astype(str).str.lower().str.strip()
    df["away"] = df["away"].astype(str).str.lower().str.strip()
    df["home_goals"] = pd.to_numeric(df["home_goals"], errors="coerce")
    df["away_goals"] = pd.to_numeric(df["away_goals"], errors="coerce")
    df = df.dropna(subset=["home_goals", "away_goals"])

    if df.empty:
        return {}, LEAGUE_AVG_HOME_DEFAULT, LEAGUE_AVG_AWAY_DEFAULT

    league_avg_home = max(0.4, float(df["home_goals"].mean()))
    league_avg_away = max(0.4, float(df["away_goals"].mean()))
    overall_avg = (league_avg_home + league_avg_away) / 2.0

    teams = set(df["home"]) | set(df["away"])
    ratings = {}

    for team in teams:
        home_rows = df[df["home"] == team]
        away_rows = df[df["away"] == team]

        scored = home_rows["home_goals"].sum() + away_rows["away_goals"].sum()
        conceded = home_rows["away_goals"].sum() + away_rows["home_goals"].sum()
        n = len(home_rows) + len(away_rows)

        if n == 0:
            ratings[team] = {"attack": 1.0, "defense": 1.0, "n": 0}
            continue

        raw_attack = (scored / n) / overall_avg if overall_avg > 0 else 1.0
        raw_defense = (conceded / n) / overall_avg if overall_avg > 0 else 1.0

        # shrink toward league average (1.0) when sample size is small
        weight = min(n / 8.0, 1.0)
        attack = 1.0 * (1 - weight) + raw_attack * weight
        defense = 1.0 * (1 - weight) + raw_defense * weight

        attack = max(0.5, min(2.0, attack))
        defense = max(0.5, min(2.0, defense))

        ratings[team] = {"attack": attack, "defense": defense, "n": int(n)}

    return ratings, league_avg_home, league_avg_away


def expected_goals_shrinkage(home, away, league):
    """Fallback model: moment-based attack/defense with shrinkage toward the
    league average. Used when a league doesn't yet have enough matches for
    the elite MLE-fitted model below to be numerically stable."""
    ratings, league_avg_home, league_avg_away = compute_team_ratings(league)

    h = str(home).lower().strip()
    a = str(away).lower().strip()

    h_rating = ratings.get(h, {"attack": 1.0, "defense": 1.0, "n": 0})
    a_rating = ratings.get(a, {"attack": 1.0, "defense": 1.0, "n": 0})

    exp_home = league_avg_home * h_rating["attack"] * a_rating["defense"]
    exp_away = league_avg_away * a_rating["attack"] * h_rating["defense"]

    exp_home = max(0.25, min(4.0, exp_home))
    exp_away = max(0.25, min(4.0, exp_away))

    sample_size = {"home_matches": h_rating["n"], "away_matches": a_rating["n"]}
    return exp_home, exp_away, sample_size, DEFAULT_RHO


# ===============================
# ✅ DIXON-COLES ADJUSTED POISSON MODEL
# (Previously: model() computed hw/draw/aw/btts and threw them all away,
# only ever returning a crude linear Over/Under 2.5 guess.)
# ===============================
def poisson_pmf(lmbda, k):
    try:
        return (math.exp(-lmbda) * (lmbda ** k)) / math.factorial(k)
    except Exception:
        return 0.0


def dc_tau(x, y, lam, mu, rho):
    if x == 0 and y == 0:
        return 1 - lam * mu * rho
    if x == 0 and y == 1:
        return 1 + lam * rho
    if x == 1 and y == 0:
        return 1 + mu * rho
    if x == 1 and y == 1:
        return 1 - rho
    return 1.0


# ===============================
# ✅ ELITE MODEL — proper maximum-likelihood-fitted Dixon-Coles, with
# time-decay weighting and a fitted home-advantage parameter, instead of
# the moment-based shrinkage heuristic above. This is the actual approach
# from Dixon & Coles (1997), not an approximation of it.
# ===============================
def _fit_dixon_coles_mle(league):
    if not ELITE_MODEL_AVAILABLE:
        return None

    conn = get_conn()
    df = pd.read_sql_query(
        "SELECT * FROM results WHERE lower(league) = lower(?)", conn, params=(league,)
    )
    conn.close()

    df = df.dropna(subset=["home", "away", "home_goals", "away_goals"])
    if df.empty:
        return None

    df["home"] = df["home"].astype(str).str.lower().str.strip()
    df["away"] = df["away"].astype(str).str.lower().str.strip()
    df["home_goals"] = pd.to_numeric(df["home_goals"], errors="coerce")
    df["away_goals"] = pd.to_numeric(df["away_goals"], errors="coerce")
    df = df.dropna(subset=["home_goals", "away_goals"])
    if df.empty:
        return None

    teams = sorted(set(df["home"]) | set(df["away"]))
    n = len(teams)
    if n < 4 or len(df) < n * MIN_MATCHES_PER_TEAM_FOR_ELITE:
        return None  # too sparse — let the shrinkage fallback handle it

    team_idx = {t: i for i, t in enumerate(teams)}

    # Recent matches matter more. If a match has no parseable date, treat it
    # as "today" (full weight) rather than discarding it.
    today = pd.Timestamp(datetime.utcnow().date())
    parsed_dates = pd.to_datetime(df["date"], errors="coerce")
    days_ago = (today - parsed_dates).dt.days.fillna(0).clip(lower=0).values
    weights = np.exp(-MATCH_DECAY_XI * days_ago)

    home_idx = df["home"].map(team_idx).values
    away_idx = df["away"].map(team_idx).values
    hg = df["home_goals"].values.astype(float)
    ag = df["away_goals"].values.astype(float)

    # Parameters: attack[1..n-1], defense[1..n-1] (team 0 fixed at 0 as the
    # reference level — otherwise attack/defense are only identifiable up to
    # an additive constant), then home_adv, then rho.
    x0 = np.zeros(2 * (n - 1) + 2)

    def unpack(params):
        attack = np.concatenate(([0.0], params[: n - 1]))
        defense = np.concatenate(([0.0], params[n - 1 : 2 * (n - 1)]))
        home_adv = params[-2]
        rho = params[-1]
        return attack, defense, home_adv, rho

    def neg_log_likelihood(params):
        attack, defense, home_adv, rho = unpack(params)
        rho = max(-0.3, min(0.3, rho))

        lam = np.exp(attack[home_idx] - defense[away_idx] + home_adv)
        mu = np.exp(attack[away_idx] - defense[home_idx])
        lam = np.clip(lam, 1e-3, 8)
        mu = np.clip(mu, 1e-3, 8)

        nll = 0.0
        for i in range(len(hg)):
            x, y = int(hg[i]), int(ag[i])
            p = poisson_pmf(lam[i], x) * poisson_pmf(mu[i], y) * dc_tau(x, y, lam[i], mu[i], rho)
            p = max(p, 1e-10)
            nll -= weights[i] * math.log(p)
        return nll

    try:
        res = minimize(
            neg_log_likelihood, x0, method="L-BFGS-B",
            bounds=[(-2, 2)] * (2 * (n - 1)) + [(-1, 1), (-0.3, 0.3)],
            options={"maxiter": 200},
        )
    except Exception as e:
        print("ELITE MODEL FIT ERROR:", e)
        return None

    if not res.success and res.nit < 2:
        return None

    attack, defense, home_adv, rho = unpack(res.x)
    rho = float(max(-0.3, min(0.3, rho)))

    team_match_counts = {t: 0 for t in teams}
    for t in df["home"]:
        team_match_counts[t] += 1
    for t in df["away"]:
        team_match_counts[t] += 1

    return {
        "attack": {teams[i]: float(attack[i]) for i in range(n)},
        "defense": {teams[i]: float(defense[i]) for i in range(n)},
        "home_adv": float(home_adv),
        "rho": rho,
        "n_results": len(df),
        "teams_in_league": n,
        "team_match_counts": team_match_counts,
    }


def _get_elite_fit(league):
    """Caches the fit in memory; only refits when the number of recorded
    results for this league has changed since the last fit."""
    conn = get_conn()
    n_results = conn.execute(
        "SELECT COUNT(*) FROM results WHERE lower(league) = lower(?)", (league,)
    ).fetchone()[0]
    conn.close()

    cached = _elite_cache.get(league)
    if cached and cached["n_results"] == n_results:
        return cached["fit"] if cached.get("fit") else None

    fit = _fit_dixon_coles_mle(league)
    _elite_cache[league] = {"n_results": n_results, "fit": fit}
    return fit


def expected_goals(home, away, league):
    """Tries the elite MLE-fitted model first; falls back to the shrinkage
    heuristic if the league doesn't have enough data yet for MLE to be
    numerically reliable (or if numpy/scipy aren't installed)."""
    h = str(home).lower().strip()
    a = str(away).lower().strip()

    fit = _get_elite_fit(league)
    if fit:
        attack_h = fit["attack"].get(h, 0.0)
        defense_h = fit["defense"].get(h, 0.0)
        attack_a = fit["attack"].get(a, 0.0)
        defense_a = fit["defense"].get(a, 0.0)

        exp_home = math.exp(attack_h - defense_a + fit["home_adv"])
        exp_away = math.exp(attack_a - defense_h)
        exp_home = max(0.25, min(4.0, exp_home))
        exp_away = max(0.25, min(4.0, exp_away))

        known_home = h in fit["attack"]
        known_away = a in fit["attack"]
        sample_size = {
            "home_matches": fit["team_match_counts"].get(h, 0) if known_home else 0,
            "away_matches": fit["team_match_counts"].get(a, 0) if known_away else 0,
        }
        return exp_home, exp_away, sample_size, fit["rho"], "elite_mle"

    exp_home, exp_away, sample_size, rho = expected_goals_shrinkage(home, away, league)
    return exp_home, exp_away, sample_size, rho, "shrinkage_baseline"


def build_score_matrix(lam, mu, rho=DEFAULT_RHO, max_goals=MAX_GOALS):
    matrix = [[0.0] * (max_goals + 1) for _ in range(max_goals + 1)]
    total = 0.0
    for x in range(max_goals + 1):
        for y in range(max_goals + 1):
            base = poisson_pmf(lam, x) * poisson_pmf(mu, y)
            p = max(base * dc_tau(x, y, lam, mu, rho), 0.0)
            matrix[x][y] = p
            total += p
    if total > 0:
        for x in range(max_goals + 1):
            for y in range(max_goals + 1):
                matrix[x][y] /= total
    return matrix


def markets_from_matrix(matrix, max_goals=MAX_GOALS):
    home_win = draw = away_win = btts = 0.0
    over_15 = over_25 = over_35 = 0.0
    scorelines = []

    for x in range(max_goals + 1):
        for y in range(max_goals + 1):
            p = matrix[x][y]
            scorelines.append({"home": x, "away": y, "prob": p})

            if x > y:
                home_win += p
            elif x == y:
                draw += p
            else:
                away_win += p

            if x > 0 and y > 0:
                btts += p

            total_goals = x + y
            if total_goals > 1.5:
                over_15 += p
            if total_goals > 2.5:
                over_25 += p
            if total_goals > 3.5:
                over_35 += p

    scorelines.sort(key=lambda s: s["prob"], reverse=True)

    return {
        "home_win": home_win,
        "draw": draw,
        "away_win": away_win,
        "btts_yes": btts,
        "btts_no": 1 - btts,
        "over_1_5": over_15,
        "under_1_5": 1 - over_15,
        "over_2_5": over_25,
        "under_2_5": 1 - over_25,
        "over_3_5": over_35,
        "under_3_5": 1 - over_35,
        "top_scorelines": scorelines[:6],
    }


def fair_decimal(p):
    if p <= 0:
        return None
    return round(1 / p, 2)


def gcd(a, b):
    return a if b == 0 else gcd(b, a % b)


def fair_fractional(p):
    if p <= 0:
        return None
    decimal = 1 / p
    value = decimal - 1
    if value <= 0:
        return "0/1"
    best_num, best_den, best_err = 1, 1, float("inf")
    for den in range(1, 33):
        num = round(value * den)
        if num <= 0:
            continue
        err = abs(value - num / den)
        if err < best_err:
            best_err, best_num, best_den = err, num, den
    g = gcd(best_num, best_den) or 1
    return f"{best_num // g}/{best_den // g}"


def normalize_odds(odds_input):
    """Accepts EITHER flat odds like {'home_win': 1.8} (what the manual-entry
    UI sends) OR per-bookmaker odds like {'pinnacle': {'home_win': 1.8}, ...}
    (what the live Odds API gives us). Always returns a flat {market: best_price}
    dict so the rest of the code only has to deal with one shape."""
    if not odds_input:
        return {}

    looks_nested = any(isinstance(v, dict) for v in odds_input.values())
    if not looks_nested:
        flat = {}
        for market, price in odds_input.items():
            try:
                flat[market] = float(price)
            except (TypeError, ValueError):
                continue
        return flat

    best = {}
    for book_odds in odds_input.values():
        if not isinstance(book_odds, dict):
            continue
        for market, price in book_odds.items():
            try:
                price = float(price)
            except (TypeError, ValueError):
                continue
            if market not in best or price > best[market]:
                best[market] = price
    return best


def fetch_live_odds(league):
    """Pulls upcoming fixtures + odds for ONE league from The Odds API.
    Correctly matches h2h outcomes by team name (soccer's h2h market has
    3 outcomes — home/draw/away — not 2, and the API doesn't guarantee order)."""
    sport_key = LEAGUE_SPORT_KEYS.get(league)
    if not sport_key:
        return [], f"No Odds API sport key configured for league '{league}'"

    if ODDS_API_KEY in (None, "", "YOUR_API_KEY_HERE"):
        return [], "ODDS_API_KEY is not set — add it as an environment variable"

    url = f"https://api.the-odds-api.com/v4/sports/{sport_key}/odds"
    params = {
        "apiKey": ODDS_API_KEY,
        "regions": "eu,uk",
        "markets": "h2h,totals",
        "oddsFormat": "decimal",
    }

    try:
        res = requests.get(url, params=params, timeout=15)
        res.raise_for_status()
        games = res.json()
    except Exception as e:
        return [], f"Odds API request failed: {e}"

    fixtures = []
    for g in games:
        home_team = g.get("home_team", "")
        away_team = g.get("away_team", "")
        odds_by_book = {}

        for b in g.get("bookmakers", []):
            book_name = b.get("key", "unknown")
            book_odds = {}

            for m in b.get("markets", []):
                if m.get("key") == "h2h":
                    for o in m.get("outcomes", []):
                        name = o.get("name", "")
                        price = o.get("price")
                        if name == home_team:
                            book_odds["home_win"] = price
                        elif name == away_team:
                            book_odds["away_win"] = price
                        elif name.lower() == "draw":
                            book_odds["draw"] = price

                if m.get("key") == "totals":
                    for o in m.get("outcomes", []):
                        if o.get("point") != 2.5:
                            continue
                        if o.get("name") == "Over":
                            book_odds["over_2_5"] = o.get("price")
                        elif o.get("name") == "Under":
                            book_odds["under_2_5"] = o.get("price")

            if book_odds:
                odds_by_book[book_name] = book_odds

        fixtures.append({
            "home": home_team,
            "away": away_team,
            "commence_time": g.get("commence_time"),
            "odds": odds_by_book,
        })

    return fixtures, None


def detect_value(predicted_prob, decimal_odds):
    """predicted_prob is 0-1. Returns edge in percentage points, positive = value."""
    if not decimal_odds or decimal_odds <= 1:
        return None
    implied = 100.0 / decimal_odds
    return round(predicted_prob * 100 - implied, 2)


# ===============================
# ✅ DE-VIGGING — raw odds-implied probability includes the bookmaker's
# margin (overround), which always sums to slightly over 100%. Removing it
# gives a more honest "true market probability" to compare the model
# against, instead of measuring edge against an inflated number.
# ===============================
def devig_two(odds_a, odds_b):
    try:
        pa, pb = 1.0 / float(odds_a), 1.0 / float(odds_b)
    except (TypeError, ValueError, ZeroDivisionError):
        return None
    total = pa + pb
    if total <= 0:
        return None
    return {"a": pa / total, "b": pb / total, "overround_pct": round((total - 1) * 100, 2)}


def devig_three(odds_home, odds_draw, odds_away):
    try:
        ph, pd_, pa = 1.0 / float(odds_home), 1.0 / float(odds_draw), 1.0 / float(odds_away)
    except (TypeError, ValueError, ZeroDivisionError):
        return None
    total = ph + pd_ + pa
    if total <= 0:
        return None
    return {
        "home_win": ph / total,
        "draw": pd_ / total,
        "away_win": pa / total,
        "overround_pct": round((total - 1) * 100, 2),
    }


def best_pick_label(markets):
    candidates = {
        "Home Win": markets["home_win"],
        "Draw": markets["draw"],
        "Away Win": markets["away_win"],
        "BTTS - Yes": markets["btts_yes"],
        "Over 2.5 Goals": markets["over_2_5"],
        "Under 2.5 Goals": markets["under_2_5"],
    }
    return max(candidates, key=candidates.get)


def top_picks_ranked(markets, n=3):
    """Same candidate set as best_pick_label, ranked — the top one always
    matches best_pick_label's choice, with the next-most-likely markets
    alongside it for context."""
    candidates = {
        "Home Win": markets["home_win"],
        "Draw": markets["draw"],
        "Away Win": markets["away_win"],
        "BTTS - Yes": markets["btts_yes"],
        "BTTS - No": markets["btts_no"],
        "Over 1.5 Goals": markets["over_1_5"],
        "Over 2.5 Goals": markets["over_2_5"],
        "Under 2.5 Goals": markets["under_2_5"],
        "Over 3.5 Goals": markets["over_3_5"],
    }
    ranked = sorted(candidates.items(), key=lambda kv: kv[1], reverse=True)[:n]
    return [{"market": name, "probability_pct": round(prob * 100, 2)} for name, prob in ranked]


# ===============================
# ✅ ROOT
# ===============================
@app.route("/")
def home():
    return "Football API is LIVE \u2705"


# ===============================
# ✅ PREDICT — now actually league-aware and team-aware
# ===============================
@app.route("/api/predict", methods=["POST"])
def predict():
    try:
        data = request.get_json(force=True) or {}
        home = data.get("home")
        away = data.get("away")
        league = (data.get("league") or DEFAULT_LEAGUE).strip()
        odds = normalize_odds(data.get("odds") or {})
        rho_override = data.get("rho")

        if not home or not away:
            return jsonify({"error": "missing teams"}), 400

        exp_home, exp_away, sample_size, fitted_rho, model_type = expected_goals(home, away, league)

        if rho_override is not None:
            try:
                rho = float(rho_override)
            except (TypeError, ValueError):
                rho = fitted_rho
        else:
            rho = fitted_rho
        rho = max(-0.3, min(0.3, rho))

        matrix = build_score_matrix(exp_home, exp_away, rho)
        markets = markets_from_matrix(matrix)

        top_scorelines = [
            {
                **s,
                "prob_pct": round(s["prob"] * 100, 2),
                "fair_decimal": fair_decimal(s["prob"]),
                "fair_fractional": fair_fractional(s["prob"]),
            }
            for s in markets.pop("top_scorelines")
        ]

        market_devig = {}
        if all(k in odds for k in ("home_win", "draw", "away_win")):
            market_devig.update(devig_three(odds["home_win"], odds["draw"], odds["away_win"]) or {})
        if all(k in odds for k in ("over_2_5", "under_2_5")):
            ou = devig_two(odds["over_2_5"], odds["under_2_5"])
            if ou:
                market_devig["over_2_5"] = ou["a"]
                market_devig["under_2_5"] = ou["b"]
                market_devig["overround_pct_ou25"] = ou["overround_pct"]

        value_bets = []
        odds_map = {
            "home_win": odds.get("home_win"),
            "draw": odds.get("draw"),
            "away_win": odds.get("away_win"),
            "btts_yes": odds.get("btts_yes"),
            "over_2_5": odds.get("over_2_5"),
            "under_2_5": odds.get("under_2_5"),
        }
        for market, decimal_odds in odds_map.items():
            if decimal_odds in (None, "", 0):
                continue
            try:
                decimal_odds = float(decimal_odds)
            except (TypeError, ValueError):
                continue
            edge = detect_value(markets[market], decimal_odds)
            if edge is not None:
                entry = {
                    "market": market,
                    "odds_given": decimal_odds,
                    "model_prob_pct": round(markets[market] * 100, 2),
                    "implied_prob_pct": round(100 / decimal_odds, 2),
                    "edge_pct": edge,
                    "is_value": edge > 0,
                }
                if market in market_devig:
                    devigged_pct = round(market_devig[market] * 100, 2)
                    entry["market_devigged_pct"] = devigged_pct
                    entry["edge_vs_devigged_pct"] = round(
                        markets[market] * 100 - devigged_pct, 2
                    )
                value_bets.append(entry)

        pick = best_pick_label(markets)
        top3 = top_picks_ranked(markets)
        fixture_id = uuid.uuid4().hex[:10]
        timestamp = datetime.utcnow().isoformat()

        result = {
            "fixture_id": fixture_id,
            "home": home,
            "away": away,
            "league": league,
            "exp_home": round(exp_home, 2),
            "exp_away": round(exp_away, 2),
            "sample_size": sample_size,
            "rho": rho,
            "model": model_type,
            "markets": {k: round(v * 100, 2) for k, v in markets.items()},
            "top_scorelines": top_scorelines,
            "value_bets": value_bets,
            "best_pick": pick,
            "top_picks": top3,
        }

        conn = get_conn()
        conn.execute(
            """INSERT INTO predictions
               (fixture_id, league, home, away, exp_home, exp_away,
                home_win, draw, away_win, btts_yes, over_1_5, over_2_5, over_3_5,
                best_pick, timestamp, settled)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0)""",
            (
                fixture_id, league, home, away, round(exp_home, 2), round(exp_away, 2),
                round(markets["home_win"] * 100, 2),
                round(markets["draw"] * 100, 2),
                round(markets["away_win"] * 100, 2),
                round(markets["btts_yes"] * 100, 2),
                round(markets["over_1_5"] * 100, 2),
                round(markets["over_2_5"] * 100, 2),
                round(markets["over_3_5"] * 100, 2),
                pick, timestamp,
            ),
        )
        conn.commit()
        conn.close()

        return jsonify(result)

    except Exception as e:
        print("CRITICAL ERROR:", str(e))
        return jsonify({"error": str(e)}), 500


# ===============================
# ✅ RESULT — records a real score and settles the matching prediction.
# (Previously: "UPDATE ... ORDER BY ROWID DESC LIMIT 1" — invalid SQLite
# syntax that throws a syntax error on every call. Fixed by SELECTing the
# fixture_id first, then doing a plain, unambiguous UPDATE/INSERT by key.)
# ===============================
@app.route("/api/result", methods=["POST"])
def record_result():
    try:
        data = request.get_json(force=True) or {}
        home = data.get("home")
        away = data.get("away")
        league = (data.get("league") or DEFAULT_LEAGUE).strip()
        home_goals = data.get("home_goals")
        away_goals = data.get("away_goals")
        fixture_id = data.get("fixture_id")

        if not home or not away or home_goals is None or away_goals is None:
            return jsonify({"error": "missing home/away/home_goals/away_goals"}), 400

        try:
            home_goals = int(home_goals)
            away_goals = int(away_goals)
        except (TypeError, ValueError):
            return jsonify({"error": "goals must be numbers"}), 400

        conn = get_conn()
        c = conn.cursor()

        c.execute(
            "INSERT INTO results (league, home, away, home_goals, away_goals, date) VALUES (?,?,?,?,?,?)",
            (league, home, away, home_goals, away_goals, datetime.utcnow().date().isoformat()),
        )

        row = None
        if fixture_id:
            c.execute(
                "SELECT * FROM predictions WHERE fixture_id = ? AND settled = 0", (fixture_id,)
            )
            row = c.fetchone()

        if row is None:
            c.execute(
                """SELECT * FROM predictions
                   WHERE lower(home) = lower(?) AND lower(away) = lower(?)
                     AND lower(league) = lower(?) AND settled = 0
                   ORDER BY rowid DESC LIMIT 1""",
                (home, away, league),
            )
            row = c.fetchone()

        settled = False
        if row is not None:
            cols = [d[0] for d in c.description]
            pred = dict(zip(cols, row))

            actual_class = "H" if home_goals > away_goals else ("D" if home_goals == away_goals else "A")
            actual_btts = 1 if (home_goals > 0 and away_goals > 0) else 0
            actual_over_25 = 1 if (home_goals + away_goals) > 2.5 else 0

            c.execute(
                """INSERT INTO backtest
                   (fixture_id, league, home, away, pred_home_win, pred_draw, pred_away_win,
                    actual_class, pred_btts, actual_btts, pred_over_2_5, actual_over_2_5, settled_at)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (
                    pred["fixture_id"], league, home, away,
                    pred["home_win"], pred["draw"], pred["away_win"], actual_class,
                    pred["btts_yes"], actual_btts,
                    pred["over_2_5"], actual_over_25,
                    datetime.utcnow().isoformat(),
                ),
            )
            c.execute(
                "UPDATE predictions SET settled = 1 WHERE fixture_id = ?", (pred["fixture_id"],)
            )
            settled = True

        conn.commit()
        conn.close()

        return jsonify({"recorded": True, "settled_prediction": settled})

    except Exception as e:
        print("RESULT ERROR:", str(e))
        return jsonify({"error": str(e)}), 500


# ===============================
# ✅ STATS — league-aware. Pass ?league=Premier+League to scope it,
# or omit it for an overall + per-league breakdown.
# ===============================
@app.route("/api/stats")
def stats():
    try:
        league = request.args.get("league")
        conn = get_conn()
        if league:
            bt = pd.read_sql_query(
                "SELECT * FROM backtest WHERE lower(league) = lower(?)", conn, params=(league,)
            )
        else:
            bt = pd.read_sql_query("SELECT * FROM backtest", conn)
        conn.close()

        bt = bt.dropna(subset=["actual_class"]) if not bt.empty else bt

        if bt.empty:
            return jsonify({"settled": 0, "league": league or "all"})

        def hit_rate_and_brier(df):
            n = len(df)

            def correct(r):
                return max(
                    ("H", r["pred_home_win"]), ("D", r["pred_draw"]), ("A", r["pred_away_win"]),
                    key=lambda t: t[1],
                )[0] == r["actual_class"]

            hit_rate = float(df.apply(correct, axis=1).mean())

            def brier_row(r):
                outcomes = {"H": 0, "D": 0, "A": 0}
                outcomes[r["actual_class"]] = 1
                ph, pd_, pa = r["pred_home_win"] / 100, r["pred_draw"] / 100, r["pred_away_win"] / 100
                return ((ph - outcomes["H"]) ** 2 + (pd_ - outcomes["D"]) ** 2 + (pa - outcomes["A"]) ** 2) / 3

            brier_1x2 = float(df.apply(brier_row, axis=1).mean())
            brier_btts = float(((df["pred_btts"] / 100 - df["actual_btts"]) ** 2).mean())
            brier_over25 = float(((df["pred_over_2_5"] / 100 - df["actual_over_2_5"]) ** 2).mean())

            return {
                "settled": n,
                "hit_rate_pct": round(hit_rate * 100, 1),
                "brier_1x2": round(brier_1x2, 3),
                "brier_btts": round(brier_btts, 3),
                "brier_over_2_5": round(brier_over25, 3),
            }

        if league:
            return jsonify({"league": league, **hit_rate_and_brier(bt)})

        overall = hit_rate_and_brier(bt)
        by_league = {
            lg: hit_rate_and_brier(group) for lg, group in bt.groupby("league")
        }
        return jsonify({"league": "all", **overall, "by_league": by_league})

    except Exception as e:
        print("STATS ERROR:", str(e))
        return jsonify({"error": str(e)}), 500


# ===============================
# ✅ PICKS — optionally filter by league, e.g. /api/picks?league=La+Liga
# ===============================
@app.route("/api/picks")
def picks():
    try:
        league = request.args.get("league")
        conn = get_conn()
        if league:
            df = pd.read_sql_query(
                "SELECT * FROM predictions WHERE lower(league) = lower(?) ORDER BY rowid DESC LIMIT 10",
                conn, params=(league,),
            )
        else:
            df = pd.read_sql_query(
                "SELECT * FROM predictions ORDER BY rowid DESC LIMIT 10", conn
            )
        conn.close()

        records = df.to_dict("records")
        return jsonify({"top3": records[:3], "picks": records})
    except Exception as e:
        print("PICKS ERROR:", str(e))
        return jsonify({"top3": [], "picks": []})


# ===============================
# ✅ LEAGUES — distinct league names seen so far, for populating a dropdown
# ===============================
@app.route("/api/leagues")
def leagues():
    try:
        conn = get_conn()
        df = pd.read_sql_query(
            "SELECT DISTINCT league FROM predictions UNION SELECT DISTINCT league FROM results", conn
        )
        conn.close()
        names = sorted([l for l in df["league"].dropna().tolist() if l])
        return jsonify({"leagues": names})
    except Exception as e:
        print("LEAGUES ERROR:", str(e))
        return jsonify({"leagues": []})


# ===============================
# ✅ HISTORY EXPORT
# ===============================
@app.route("/api/history")
def history():
    try:
        conn = get_conn()
        preds = pd.read_sql_query("SELECT * FROM predictions", conn)
        results = pd.read_sql_query("SELECT * FROM results", conn)
        conn.close()
        return jsonify({
            "predictions": preds.to_dict("records"),
            "results": results.to_dict("records"),
        })
    except Exception:
        return jsonify({"predictions": [], "results": []})


# ===============================
# ✅ FIXTURE PREDICTION HELPER — shared by the on-demand /api/live-picks
# and the background auto-refresh loop below. Looks for an existing,
# unsettled prediction for this exact real-world fixture (matched by
# league + home + away + commence_time) before creating a new one, so
# re-checking the same upcoming match doesn't spam duplicate rows.
# ===============================
def get_or_create_fixture_prediction(conn, league, home, away, commence_time, rho=None, architecture="Statistical Baseline"):
    existing = None
    if commence_time:
        cur = conn.execute(
            """SELECT * FROM predictions
               WHERE lower(league) = lower(?) AND lower(home) = lower(?)
                 AND lower(away) = lower(?) AND commence_time = ? AND settled = 0
               LIMIT 1""",
            (league, home, away, commence_time),
        )
        row = cur.fetchone()
        if row:
            cols = [d[0] for d in cur.description]
            existing = dict(zip(cols, row))
# 1. Calculate expected goals using the selected hybrid ML architecture layer
    exp_home, exp_away, sample_size, f_rho, model_type = expected_goals(home, away, league, architecture)
    
    # 2. Reconcile whether a manual override or a fitted rho parameter should be applied
    rho_to_use = rho if rho is not None else f_rho
    rho_to_use = max(-0.3, min(0.3, rho_to_use)) # Keeps matrix probability distribution stable
    
    # 3. Generate the joint probability distribution matrix (Dixon-Coles adjusted)
    matrix = build_score_matrix(exp_home, exp_away, rho_to_use)
    
    # 4. Extract standard betting market probabilities from the matrix grid
    markets = markets_from_matrix(matrix)
    top_scorelines = markets.pop("top_scorelines")
    pick = best_pick_label(markets)

    if existing:
        return existing["fixture_id"], exp_home, exp_away, sample_size, markets, top_scorelines, pick, False

    fixture_id = uuid.uuid4().hex[:10]
    timestamp = datetime.utcnow().isoformat()
    conn.execute(
        """INSERT INTO predictions
           (fixture_id, league, home, away, commence_time, exp_home, exp_away,
            home_win, draw, away_win, btts_yes, over_1_5, over_2_5, over_3_5,
            best_pick, timestamp, settled)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0)""",
        (
            fixture_id, league, home, away, commence_time,
            round(exp_home, 2), round(exp_away, 2),
            round(markets["home_win"] * 100, 2),
            round(markets["draw"] * 100, 2),
            round(markets["away_win"] * 100, 2),
            round(markets["btts_yes"] * 100, 2),
            round(markets["over_1_5"] * 100, 2),
            round(markets["over_2_5"] * 100, 2),
            round(markets["over_3_5"] * 100, 2),
            pick, timestamp,
        ),
    )
    return fixture_id, exp_home, exp_away, sample_size, markets, top_scorelines, pick, True


# ===============================
# ✅ LIVE PICKS — pulls real upcoming fixtures + bookmaker odds for a league
# from The Odds API, runs them through the SAME Dixon-Coles model and team
# ratings as /api/predict, and surfaces anything with a positive edge.
# Each fixture is also logged to `predictions` (same as a manual prediction,
# deduplicated by fixture) so it can later be settled with /api/result and
# tracked in /api/stats.
# Usage: GET /api/live-picks?league=Premier League&min_edge=3
# ===============================
@app.route("/api/live-picks")
def live_picks():
    league = request.args.get("league", "Premier League")
    try:
        min_edge = float(request.args.get("min_edge", 3))
    except (TypeError, ValueError):
        min_edge = 3.0

    fixtures, fetch_error = fetch_live_odds(league)
    if fetch_error:
        return jsonify({"error": fetch_error, "picks": []}), 502

    conn = get_conn()
    picks_out = []

    for fx in fixtures:
        home, away = fx["home"], fx["away"]
        if not home or not away:
            continue

        odds_by_book = fx["odds"]  # {"pinnacle": {"home_win": 1.9, ...}, "bet365": {...}, ...}
        odds = normalize_odds(odds_by_book)

        fixture_id, exp_home, exp_away, sample_size, markets, _, pick, _ = (
            get_or_create_fixture_prediction(conn, league, home, away, fx["commence_time"])
        )
        top3 = top_picks_ranked(markets)

        market_devig = {}
        if all(k in odds for k in ("home_win", "draw", "away_win")):
            market_devig.update(devig_three(odds["home_win"], odds["draw"], odds["away_win"]) or {})
        if all(k in odds for k in ("over_2_5", "under_2_5")):
            ou = devig_two(odds["over_2_5"], odds["under_2_5"])
            if ou:
                market_devig["over_2_5"] = ou["a"]
                market_devig["under_2_5"] = ou["b"]

        def bookmaker_prices(market):
            """Every bookmaker's price for this market, best first."""
            rows = []
            for book_name, book_odds in odds_by_book.items():
                price = book_odds.get(market)
                if price:
                    rows.append({"bookmaker": book_name, "odds": price})
            return sorted(rows, key=lambda r: r["odds"], reverse=True)

        value_bets = []
        for market, decimal_odds in odds.items():
            if market not in markets or not decimal_odds or decimal_odds <= 1:
                continue
            edge = detect_value(markets[market], decimal_odds)
            if edge is not None and edge >= min_edge:
                book_prices = bookmaker_prices(market)
                entry = {
                    "market": market,
                    "best_odds": decimal_odds,
                    "best_bookmaker": book_prices[0]["bookmaker"] if book_prices else None,
                    "all_bookmakers": book_prices,
                    "model_prob_pct": round(markets[market] * 100, 2),
                    "edge_pct": edge,
                }
                if market in market_devig:
                    devigged_pct = round(market_devig[market] * 100, 2)
                    entry["market_devigged_pct"] = devigged_pct
                    entry["edge_vs_devigged_pct"] = round(markets[market] * 100 - devigged_pct, 2)
                value_bets.append(entry)

        if value_bets:
            picks_out.append({
                "fixture_id": fixture_id,
                "home": home,
                "away": away,
                "commence_time": fx["commence_time"],
                "exp_home": round(exp_home, 2),
                "exp_away": round(exp_away, 2),
                "best_pick": pick,
                "top_picks": top3,
                "value_bets": value_bets,
            })

    conn.commit()
    conn.close()

    return jsonify({"league": league, "checked": len(fixtures), "picks": picks_out})


# ===============================
# ✅ BACKGROUND AUTO-REFRESH — polls LIVE_LEAGUES every LIVE_REFRESH_SECONDS,
# keeps live_picks_cache (and the in-memory LIVE_CACHE) up to date so
# /api/live-picks-fast can answer instantly with no API call on request.
#
# Multi-worker safety: gunicorn often runs several worker processes for one
# app. Without a guard, EACH worker would start its own copy of this loop,
# multiplying API calls. _acquire_singleton_lock() uses a non-blocking file
# lock so only the first worker to grab it actually runs the loop.
# ===============================
def _acquire_singleton_lock():
    if fcntl is None:
        return True  # not on a POSIX system (e.g. local Windows dev) — just run it
    try:
        lock_file = open("/tmp/healthscore_refresh.lock", "w")
        fcntl.flock(lock_file, fcntl.LOCK_EX | fcntl.LOCK_NB)
        return True
    except OSError:
        return False


def auto_refresh():
    global LIVE_CACHE

    while True:
        conn = get_conn()
        try:
            for league in LIVE_LEAGUES:
                fixtures, err = fetch_live_odds(league)
                if err:
                    print(f"LIVE REFRESH ({league}):", err)
                    continue

                for fx in fixtures:
                    home, away = fx["home"], fx["away"]
                    if not home or not away:
                        continue

                    odds = normalize_odds(fx["odds"])
                    if not odds:
                        continue

                    fixture_id, _, _, _, markets, _, _, _ = get_or_create_fixture_prediction(
                        conn, league, home, away, fx["commence_time"]
                    )

                    best_market, best_edge = None, MIN_LIVE_EDGE - 0.01
                    for market, decimal_odds in odds.items():
                        if market not in markets or not decimal_odds or decimal_odds <= 1:
                            continue
                        edge = detect_value(markets[market], decimal_odds)
                        if edge is not None and edge > best_edge:
                            best_edge, best_market = edge, market

                    if best_market and best_edge >= MIN_LIVE_EDGE:
                        conn.execute(
                            """INSERT INTO live_picks_cache
                               (fixture_id, league, home, away, commence_time, pick, edge, updated_at)
                               VALUES (?,?,?,?,?,?,?,?)
                               ON CONFLICT(fixture_id) DO UPDATE SET
                                 pick = excluded.pick,
                                 edge = excluded.edge,
                                 updated_at = excluded.updated_at""",
                            (
                                fixture_id, league, home, away, fx["commence_time"],
                                best_market, round(best_edge, 2), datetime.utcnow().isoformat(),
                            ),
                        )
                    else:
                        # edge disappeared (odds moved) — don't keep showing a stale "value" pick
                        conn.execute("DELETE FROM live_picks_cache WHERE fixture_id = ?", (fixture_id,))

                conn.commit()
                time.sleep(2)  # small gap between leagues, easier on the API rate limit

            cache_df = pd.read_sql_query(
                "SELECT * FROM live_picks_cache ORDER BY updated_at DESC", conn
            )
            LIVE_CACHE = cache_df.to_dict("records")
            print(f"✅ live refresh complete — {len(LIVE_CACHE)} fixtures showing value")

        except Exception as e:
            print("AUTO REFRESH ERROR:", e)
        finally:
            conn.close()

        time.sleep(LIVE_REFRESH_SECONDS)


@app.route("/api/live-picks-fast")
def live_picks_fast():
    """Instant — reads the cache kept warm by the background refresh loop,
    no live API call on request."""
    return jsonify({"picks": LIVE_CACHE})


@app.route("/api/live-history")
def live_history():
    try:
        conn = get_conn()
        df = pd.read_sql_query(
            "SELECT * FROM live_picks_cache ORDER BY updated_at DESC LIMIT 50", conn
        )
        conn.close()
        return jsonify({"picks": df.to_dict("records")})
    except Exception as e:
        print("LIVE HISTORY ERROR:", str(e))
        return jsonify({"picks": []})


if ODDS_API_KEY not in (None, "", "YOUR_API_KEY_HERE") and _acquire_singleton_lock():
    threading.Thread(target=auto_refresh, daemon=True).start()
    print(f"🔄 Background live-odds refresh started — every {LIVE_REFRESH_SECONDS}s for {LIVE_LEAGUES}")
else:
    print("⏸  Background live-odds refresh NOT started (no ODDS_API_KEY set, or another worker already owns it).")


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 10000)))