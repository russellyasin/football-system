from flask import Flask, request, jsonify
from flask_cors import CORS
import math
import os
import pandas as pd
import uuid
from datetime import datetime
import sqlite3

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})

# ✅ DATABASE FILE
DB_FILE = "database.db"

# ===============================
# ✅ DB CONNECTION
# ===============================
def get_conn():
    return sqlite3.connect(DB_FILE)

# ===============================
# ✅ INIT DATABASE
# ===============================
def init_db():
    conn = get_conn()
    c = conn.cursor()

    c.execute("""
    CREATE TABLE IF NOT EXISTS history (
        date TEXT,
        match_id TEXT,
        home TEXT,
        away TEXT,
        league TEXT,
        actual_home_goals TEXT,
        actual_away_goals TEXT,
        exp_home REAL,
        exp_away REAL,
        total REAL,
        home_win_prob REAL,
        draw_prob REAL,
        away_win_prob REAL,
        btts_prob REAL,
        over_2_5 REAL,
        under_2_5 REAL,
        btts_strength REAL,
        handicap_edge REAL,
        value_edge REAL,
        confidence REAL,
        best_pick TEXT
    )
    """)

    conn.commit()
    conn.close()

init_db()

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
# ✅ STORE (FINAL FIX)
# ===============================
def store_prediction(data):
    try:
        conn = get_conn()
        c = conn.cursor()

        c.execute("""
        INSERT INTO history VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            datetime.now().strftime("%Y-%m-%d %H:%M"),
            str(uuid.uuid4()),
            data.get("home", ""),
            data.get("away", ""),
            data.get("league", "UNKNOWN"),

            "",  # actual_home_goals
            "",  # actual_away_goals

            data.get("exp_home"),
            data.get("exp_away"),
            data.get("total"),

            None, None, None, None,  # probabilities
            data.get("over_2_5"),
            None, None, None, None,

            data.get("confidence"),
            data.get("market")
        ))

        conn.commit()
        conn.close()

        print("✅ SAVED TO DB")

    except Exception as e:
        print("STORE ERROR:", e)


# ===============================
# ✅ ROOT
# ===============================
@app.route("/")
def home():
    return "Football API is LIVE ✅"


# ===============================
# ✅ PREDICT
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

        # ✅ simple base model
        h, a = 1.5, 1.2

        eh, ea, hw, dr, aw, btts = model(h, a)
        total = eh + ea
        over = max(0, min(100, (total - 2.5) * 40 + 50))

        result = {
            "home": home,
            "away": away,
            "league": league,
            "exp_home": round(eh, 2),
            "exp_away": round(ea, 2),
            "total": round(total, 2),
            "over_2_5": round(over, 2),
            "confidence": 6,
            "market": "Over 2.5 Goals"
        }

        # ✅ STORE IN DATABASE (FIXED)
        store_prediction(result)

        return jsonify(result)

    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ===============================
# ✅ PICKS (READ FROM DB)
# ===============================
@app.route("/api/picks")
def picks():
    try:
        conn = get_conn()

        df = pd.read_sql_query(
            "SELECT * FROM history ORDER BY ROWID DESC LIMIT 10",
            conn
        )

        conn.close()

        return jsonify({
            "top3": df.head(3).to_dict("records"),
            "picks": df.to_dict("records")
        })

    except Exception as e:
        print("PICKS ERROR:", e)
        return jsonify({"top3": [], "picks": []})


if __name__ == "__main__":
    app.run()
