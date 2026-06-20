from flask import Flask, request, jsonify
from flask_cors import CORS
import math
import os
import pandas as pd
import uuid
from datetime import datetime

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})

PICKS_FILE = "picks.csv"
HISTORY_FILE = "history.csv"

# ✅ SAFE FILE INIT
if not os.path.exists(PICKS_FILE):
    pd.DataFrame().to_csv(PICKS_FILE, index=False)

if not os.path.exists(HISTORY_FILE):
    pd.DataFrame().to_csv(HISTORY_FILE, index=False)

# ✅ ✅ CRITICAL FIX: FORCE REQUIRED COLUMNS (WORKS ON OLD FILE)
def ensure_columns():
    try:
        df = pd.read_csv(HISTORY_FILE)

        required_cols = [
            "match_id", "date", "league",
            "home", "away",
            "exp_home", "exp_away",
            "actual_home_goals", "actual_away_goals",
            "total", "over_2_5", "confidence", "market"
        ]

        for col in required_cols:
            if col not in df.columns:
                df[col] = None

        df.to_csv(HISTORY_FILE, index=False)

    except Exception as e:
        print("COLUMN FIX ERROR:", e)

ensure_columns()

try:
    all_predictions = pd.read_csv(PICKS_FILE).to_dict("records")
except:
    all_predictions = []


# ===============================
# ✅ NORMALIZE TEAM
# ===============================
def normalize_team(name):
    return str(name).lower().strip().replace(" fc", "")


# ===============================
# ✅ FIXED STORE (NO DUPLICATE + ADD ID/DATE/LEAGUE)
# ===============================
def update_or_store_prediction(data):
    try:
        df = pd.read_csv(HISTORY_FILE)

        home_n = normalize_team(data["home"])
        away_n = normalize_team(data["away"])

        df["home_norm"] = df["home"].astype(str).apply(normalize_team)
        df["away_norm"] = df["away"].astype(str).apply(normalize_team)

        mask = (df["home_norm"] == home_n) & (df["away_norm"] == away_n)

        if not mask.any():
            data["match_id"] = str(uuid.uuid4())
            data["date"] = datetime.now().strftime("%Y-%m-%d %H:%M")
            data["league"] = data.get("league", "UNKNOWN")

            df = pd.concat([df, pd.DataFrame([data])], ignore_index=True)
        else:
            print("✅ Duplicate avoided")

        df = df.drop(columns=["home_norm", "away_norm"], errors="ignore")
        df.to_csv(HISTORY_FILE, index=False)

    except Exception as e:
        print("STORE ERROR:", e)


# ===============================
# ✅ TEAM STRENGTH
# ===============================
def get_team_strength(team_name):
    try:
        team = normalize_team(team_name)
        df = pd.read_csv(HISTORY_FILE)

        if df.empty:
            return 1.2

        df["home_norm"] = df["home"].astype(str).apply(normalize_team)
        df["away_norm"] = df["away"].astype(str).apply(normalize_team)

        matches = df[
            (df["home_norm"] == team) |
            (df["away_norm"] == team)
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
# ✅ MODEL
# ===============================
def poisson_prob(lmbda, k):
    try:
        return (math.exp(-lmbda) * (lmbda ** k)) / math.factorial(k)
    except:
        return 0


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


# ===============================
# ✅ ROOT
# ===============================
@app.route("/")
def home():
    return "Football API is LIVE ✅"


# ===============================
# ✅ PREDICT (NOW INCLUDES LEAGUE + ID)
# ===============================
@app.route("/api/predict", methods=["POST"])
def predict():
    try:
        data = request.get_json(force=True)

        home = data.get("home")
        away = data.get("away")
        league = data.get("league", "UNKNOWN")

        if not home or not away:
            return jsonify({"error": "missing teams"}), 400

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
            "league": league,
            "exp_home": round(eh, 2),
            "exp_away": round(ea, 2),
            "total": round(total, 2),
            "over_2_5": round(over, 2),
            "confidence": conf,
            "market": "Over 2.5 Goals"
        }

        update_or_store_prediction(result)

        return jsonify(result)

    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ===============================
# ✅ RESULT UPDATE (FIXED)
# ===============================
@app.route("/api/result", methods=["POST"])
def update_result():
    try:
        data = request.get_json(force=True)

        home = data.get("home")
        away = data.get("away")
        hg = data.get("home_goals")
        ag = data.get("away_goals")

        df = pd.read_csv(HISTORY_FILE)

        df["home_norm"] = df["home"].apply(normalize_team)
        df["away_norm"] = df["away"].apply(normalize_team)

        mask = (
            (df["home_norm"] == normalize_team(home)) &
            (df["away_norm"] == normalize_team(away))
        )

        if mask.any():
            df.loc[mask, "actual_home_goals"] = hg
            df.loc[mask, "actual_away_goals"] = ag

        df = df.drop(columns=["home_norm", "away_norm"], errors="ignore")
        df.to_csv(HISTORY_FILE, index=False)

        return jsonify({"status": "updated"})

    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ===============================
# ✅ PICKS
# ===============================
@app.route("/api/picks")
def picks():
    try:
        df = pd.read_csv(HISTORY_FILE)
        return jsonify({"top3": [], "picks": df.to_dict("records")[-10:]})
    except:
        return jsonify({"top3": [], "picks": []})


if __name__ == "__main__":
    app.run()
