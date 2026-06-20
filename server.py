from flask import Flask, request, jsonify
from flask_cors import CORS
import math
import os
import pandas as pd

app = Flask(__name__)

# ✅ FIXED CORS (IMPORTANT)
CORS(app, resources={r"/*": {"origins": "*"}})

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

    return base_attack


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
# ✅ VALUE
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
# ✅ ROOT ROUTE
# ===============================
@app.route("/", methods=["GET"])
def home():
    return "Football API is live ✅"


# ===============================
# ✅ PREDICT ROUTE
# ===============================
@app.route("/api/predict", methods=["GET", "POST"])
def predict():
    if request.method == "GET":
        return jsonify({
            "message": "API working ✅ Use POST",
            "example": {
                "home": "arsenal",
                "away": "chelsea"
            }
        })

    try:
        data = request.get_json()

        home = data.get("home")
        away = data.get("away")

        h = get_team_strength(home)
        a = get_team_strength(away)

        eh, ea, hw, dr, aw, btts = model(h, a)

        total = eh + ea
        over = min(100, max(0, (total - 2.5) * 40 + 50))

        value_edge = detect_value(over, 2.2)
        confidence = rescale_confidence(6, value_edge)

        result = {
            "home": home,
            "away": away,
            "exp_home": round(eh, 2),
            "exp_away": round(ea, 2),
            "total": round(total, 2),
            "over_2_5": over,
            "value_edge": value_edge,
            "confidence": confidence,
            "market": "Over 2.5 Goals",
            "bet_score": evaluate_bet(value_edge, confidence, total)
        }

        store_prediction(result)
        all_predictions.append(result)

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
    app.run(debug=True)