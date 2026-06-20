from flask import Flask, request, jsonify
from flask_cors import CORS
import math
import os
import pandas as pd

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})

PICKS_FILE = "picks.csv"
HISTORY_FILE = "history.csv"

# ✅ SAFE FILE INIT (NO CRASH)
if not os.path.exists(PICKS_FILE):
    pd.DataFrame().to_csv(PICKS_FILE, index=False)

if not os.path.exists(HISTORY_FILE):
    pd.DataFrame(columns=["home", "away", "exp_home", "exp_away"]).to_csv(HISTORY_FILE, index=False)

try:
    all_predictions = pd.read_csv(PICKS_FILE).to_dict("records")
except:
    all_predictions = []


# ===============================
# ✅ TEAM STRENGTH
# ===============================
def get_team_strength(team_name):
    try:
        if not team_name:
            return 1.2

        team = str(team_name).lower()
        df = pd.read_csv(HISTORY_FILE)

        if df.empty:
            return 1.2

        matches = df[
            (df["home"].astype(str).str.lower() == team) |
            (df["away"].astype(str).str.lower() == team)
        ]

        if len(matches) >= 3:
            avg = matches["exp_home"].mean()

            if pd.isna(avg):
                return 1.2

            return max(0.8, min(2.2, float(avg)))

        return 1.2

    except Exception as e:
        print("TEAM ERROR:", e)
        return 1.2


# ===============================
# ✅ MODEL SAFE
# ===============================
def poisson_prob(lmbda, k):
    try:
        return (math.exp(-lmbda) * (lmbda ** k)) / math.factorial(k)
    except Exception as e:
        print("POISSON ERROR:", e)
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
# ✅ HELPERS
# ===============================
def detect_value(prob, odds):
    try:
        return round(prob - (100 / odds), 2)
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
        pd.DataFrame([data]).to_csv(HISTORY_FILE, mode='a', header=False, index=False)
    except Exception as e:
        print("STORE ERROR:", e)


# ===============================
# ✅ ROOT
# ===============================
@app.route("/")
def home():
    return "Football API is LIVE ✅"


# ===============================
# ✅ FINAL DEBUG PREDICT (KEY FIX)
# ===============================
@app.route("/api/predict", methods=["POST"])
def predict():
    try:
        data = request.get_json(force=True)

        print("✅ DATA RECEIVED:", data)

        if not data:
            return jsonify({"error": "no data"}), 400

        home = data.get("home")
        away = data.get("away")

        if not home or not away:
            return jsonify({"error": "missing teams"}), 400

        h = get_team_strength(home)
        a = get_team_strength(away)

        print("✅ TEAM STRENGTH:", h, a)

        eh, ea, hw, dr, aw, btts = model(h, a)

        print("✅ MODEL:", eh, ea)

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

        print("✅ RESULT:", result)

        store_prediction(result)
        all_predictions.append(result)

        return jsonify(result)

    except Exception as e:
        print("🔥 CRITICAL ERROR:", str(e))
        return jsonify({"error": str(e)}), 500


# ===============================
# ✅ PICKS
# ===============================
@app.route("/api/picks")
def picks():
    try:
        df = pd.read_csv(HISTORY_FILE)
        return jsonify({"top3": [], "picks": df.to_dict("records")[-10:]})
    except Exception as e:
        print("PICKS ERROR:", e)
        return jsonify({"top3": [], "picks": []})


if __name__ == "__main__":
    app.run()