from flask import Flask, request, jsonify
from flask_cors import CORS
import math
import os
import pandas as pd

app = Flask(__name__)
CORS(app)

# ✅ NEW (SAFE ADD)
all_predictions = []
PICKS_FILE = "picks.csv"

# ✅ LOAD PICKS ON START
if os.path.exists(PICKS_FILE):
    try:
        all_predictions = pd.read_csv(PICKS_FILE).to_dict("records")
    except:
        all_predictions = []

# ===============================
# ✅ TEAM STRENGTH
# ===============================
def get_team_strength(team_name):
    team = team_name.lower()
    base_attack = 1.2

    file = "history.csv"
    if os.path.exists(file):
        try:
            df = pd.read_csv(file)

            team_matches = df[
                (df["home"].str.lower() == team) |
                (df["away"].str.lower() == team)
            ]

            if len(team_matches) >= 3:

                if "actual_home_goals" in df.columns and "actual_away_goals" in df.columns:
                    goals_scored = []
                    goals_conceded = []
                    wins = 0

                    for _, row in team_matches.iterrows():
                        if row["home"].lower() == team:
                            goals_scored.append(row["actual_home_goals"])
                            goals_conceded.append(row["actual_away_goals"])
                            if row["actual_home_goals"] > row["actual_away_goals"]:
                                wins += 1
                        else:
                            goals_scored.append(row["actual_away_goals"])
                            goals_conceded.append(row["actual_home_goals"])
                            if row["actual_away_goals"] > row["actual_home_goals"]:
                                wins += 1

                    avg_scored = sum(goals_scored) / len(goals_scored)
                    avg_conceded = sum(goals_conceded) / len(goals_conceded)
                    win_rate = wins / len(team_matches)

                    learned_strength = (avg_scored * 0.7) + ((2 - avg_conceded) * 0.3)
                    learned_strength += win_rate * 0.3
                else:
                    avg_home = team_matches["exp_home"].mean()
                    avg_away = team_matches["exp_away"].mean()
                    learned_strength = (avg_home + avg_away) / 2

                return max(0.8, min(2.2, learned_strength))
        except:
            pass

    if "man city" in team or "liverpool" in team:
        return 1.8
    elif "arsenal" in team or "chelsea" in team:
        return 1.5
    elif "united" in team or "city" in team:
        return 1.4
    elif "fc" in team:
        return 1.3
    else:
        return base_attack


# ===============================
# ✅ INTERACTION + CONTEXT
# ===============================
def adjust_for_opponent(home_team, away_team, h, a):
    diff = h - a
    adj = diff * 0.1
    return max(0.8, min(2.5, h + adj)), max(0.8, min(2.5, a - adj))


def apply_context(home_team, away_team, h, a):
    h += 0.15
    return max(0.8, min(2.5, h)), max(0.8, min(2.5, a))


# ===============================
# ✅ MODEL
# ===============================
def poisson_prob(lmbda, k):
    return (math.exp(-lmbda) * (lmbda ** k)) / math.factorial(k)


def model(h, a):
    hw = dr = aw = btts = 0
    for x in range(6):
        for y in range(6):
            p = poisson_prob(h, x) * poisson_prob(a, y)
            if x > y:
                hw += p
            elif x == y:
                dr += p
            else:
                aw += p
            if x > 0 and y > 0:
                btts += p
    return h, a, hw, dr, aw, btts


# ===============================
# ✅ MARKETS
# ===============================
def calculate_markets(h, a):
    total = h + a
    over = min(100, max(0, (total - 2.5) * 40 + 50))
    return round(over, 1), round(100 - over, 1)


# ===============================
# ✅ VALUE + CONF
# ===============================
def detect_value(prob, odds):
    return round(prob - (100 / odds), 2)


def rescale_confidence(base, edge):
    return min(10, round(base + max(0, edge / 5), 1))


def evaluate_bet(edge, conf, total):
    return round(edge * 0.5 + conf * 0.3 + total * 2, 2)


# ===============================
# ✅ STORAGE
# ===============================
def store_prediction(data):
    file = "history.csv"
    df = pd.DataFrame([data])
    if os.path.exists(file):
        df.to_csv(file, mode='a', header=False, index=False)
    else:
        df.to_csv(file, index=False)


# ===============================
# ✅ API
# ===============================
@app.route("/api/predict", methods=["POST"])
def predict():
    try:
        data = request.get_json()

        home = data.get("home")
        away = data.get("away")

        # ✅ NEW odds input
        odds_over = data.get("odds_over", 2.2)
        odds_under = data.get("odds_under", 2.2)

        h = get_team_strength(home)
        a = get_team_strength(away)

        h, a = adjust_for_opponent(home, away, h, a)
        h, a = apply_context(home, away, h, a)

        eh, ea, hw, dr, aw, btts = model(h, a)

        over, under = calculate_markets(eh, ea)

        # ✅ VALUE COMPARISON (NEW CORE FIX)
        value_over = detect_value(over, odds_over)
        value_under = detect_value(100 - over, odds_under)

        if value_over > value_under:
            best_market = "Over 2.5 Goals"
            value_edge = value_over
            used_odds = odds_over
        else:
            best_market = "Under 2.5 Goals"
            value_edge = value_under
            used_odds = odds_under

        confidence = rescale_confidence(6, value_edge)

        result = {
            "home": home,
            "away": away,
            "exp_home": round(eh, 2),
            "exp_away": round(ea, 2),
            "total": round(eh + ea, 2),
            "over_2_5": over,
            "value_edge": value_edge,
            "confidence": confidence,
            "market": best_market,
            "odds_used": used_odds,
            "bet_score": evaluate_bet(value_edge, confidence, eh + ea)
        }

        store_prediction(result)

        all_predictions.append(result)

        df_pick = pd.DataFrame([result])
        if os.path.exists(PICKS_FILE):
            df_pick.to_csv(PICKS_FILE, mode='a', header=False, index=False)
        else:
            df_pick.to_csv(PICKS_FILE, index=False)

        return jsonify(result)

    except Exception as e:
        return jsonify({"error": str(e)})


@app.route("/api/picks", methods=["GET"])
def get_picks():
    s = sorted(all_predictions, key=lambda x: x["bet_score"], reverse=True)
    return jsonify({"top3": s[:3], "picks": s[:10]})


# ===============================
# ✅ RUN
# ===============================
if __name__ == "__main__":
    app.run(debug=True, port=5000)