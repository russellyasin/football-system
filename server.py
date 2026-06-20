from flask import Flask, request, jsonify
from flask_cors import CORS
import math
import os
import pandas as pd

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})

all_predictions = []
PICKS_FILE = "picks.csv"

if os.path.exists(PICKS_FILE):
    try:
        all_predictions = pd.read_csv(PICKS_FILE).to_dict("records")
    except:
        all_predictions = []


# ===============================
# ✅ SAFE TEAM STRENGTH
# ===============================
def get_team_strength(team_name):
    try:
        if not team_name:
            return 1.2

        team = str(team_name).lower()
        base = 1.2

        file = "history.csv"
        if os.path.exists(file):
            df = pd.read_csv(file)

            if "home" not in df.columns or "away" not in df.columns:
                return base

            team_matches = df[
                (df["home"].astype(str).str.lower() == team) |
                (df["away"].astype(str).str.lower() == team)
            ]

            if len(team_matches) >= 3 and "exp_home" in df.columns:
                avg_home = team_matches["exp_home"].mean()
                avg_home = float(avg_home) if not pd.isna(avg_home) else base

                return max(0.8, min(2.2, avg_home))

        return base
    except:
        return 1.2


# ===============================
# ✅ SAFE MATH FUNCTIONS (FIX)
# ===============================
def poisson_prob(lmbda, k):
    try:
        lmbda = float(lmbda)
        k = int(k)

        if lmbda <= 0:
            return 0

        return (math.exp(-lmbda) * (lmbda ** k)) / math.factorial(k)
    except:
        return 0


def model(h, a):
    try:
        h = float(h)
        a = float(a)
    except:
        return 1, 1, 0, 0, 0, 0

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
# ✅ HELPERS SAFE
# ===============================
def detect_value(prob, odds):
    try:
        return round(float(prob) - (100 / float(odds)), 2)
    except:
        return 0


def rescale_confidence(base, edge):
    try:
        return min(10, round(base + max(0, edge / 5), 1))
    except:
        return base


def evaluate_bet(edge, conf, total):
    try:
        return round(edge * 0.5 + conf * 0.3 + total * 2, 2)
    except:
        return 0


def store_prediction(data):
    try:
        df = pd.DataFrame([data])
        file = "history.csv"

        if os.path.exists(file):
            df.to_csv(file, mode='a', header=False, index=False)
        else:
            df.to_csv(file, index=False)
    except:
        pass


# ===============================
# ✅ ROOT
# ===============================
@app.route("/", methods=["GET"])
def home():
    return "Football API is live ✅"


# ===============================
# ✅ FINAL SAFE PREDICT
# ===============================
@app.route("/api/predict", methods=["GET", "POST"])
def predict():

    if request.method == "GET":
        return jsonify({"message": "API live ✅"})

    try:
        data = request.get_json()

        if not data:
            return jsonify({"error": "No data"}), 400

        home = data.get("home")
        away = data.get("away")

        if not home or not away:
            return jsonify({"error": "Missing teams"}), 400

        h = get_team_strength(home)
        a = get_team_strength(away)

        eh, ea, hw, dr, aw, btts = model(h, a)

        total = float(eh + ea)
        over = max(0, min(100, (total - 2.5) * 40 + 50))

        edge = detect_value(over, 2.2)
        conf = rescale_confidence(6, edge)
        score = evaluate_bet(edge, conf, total)

        result = {
            "home": home,
            "away": away,
            "exp_home": round(eh, 2),
            "exp_away": round(ea, 2),
            "total": round(total, 2),
            "over_2_5": round(over, 2),
            "value_edge": edge,
            "confidence": conf,
            "market": "Over 2.5 Goals",
            "bet_score": score
        }

        store_prediction(result)
        all_predictions.append(result)

        return jsonify(result)

    except Exception as e:
        print("CRASH:", e)
        return jsonify({"error": "Internal error"}), 500


# ===============================
# ✅ PICKS
# ===============================
@app.route("/api/picks", methods=["GET"])
def picks():
    try:
        s = sorted(all_predictions, key=lambda x: x.get("bet_score", 0), reverse=True)
        return jsonify({"top3": s[:3], "picks": s[:10]})
    except:
        return jsonify({"top3": [], "picks": []})


if __name__ == "__main__":
    app.run(debug=True)