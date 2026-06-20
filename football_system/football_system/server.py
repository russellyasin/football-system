from flask import Flask, request, jsonify
from flask_cors import CORS
import math

app = Flask(__name__)
CORS(app)

def poisson_prob(lmbda, k):
    return (math.exp(-lmbda) * (lmbda ** k)) / math.factorial(k)

def model(home_attack, away_attack):
    exp_home = home_attack
    exp_away = away_attack

    home_win = draw = away_win = btts = 0

    for h in range(6):
        for a in range(6):
            p = poisson_prob(exp_home, h) * poisson_prob(exp_away, a)

            if h > a:
                home_win += p
            elif h == a:
                draw += p
            else:
                away_win += p

            if h > 0 and a > 0:
                btts += p

    return exp_home, exp_away, home_win, draw, away_win, btts

@app.route("/api/predict", methods=["POST"])
def predict():
    data = request.get_json()

    home = data.get("home")
    away = data.get("away")

    exp_home, exp_away, hw, dr, aw, btts = model(1.5, 1.2)

    return jsonify({
        "exp_home": exp_home,
        "exp_away": exp_away,
        "home_win_prob": hw * 100,
        "draw_prob": dr * 100,
        "away_win_prob": aw * 100,
        "btts_prob": btts * 100,
        "best_pick": "Over 2.5 Goals",
        "confidence": 7
    })

if __name__ == "__main__":
    app.run(debug=True, port=5000)