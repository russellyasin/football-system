import { useState, useEffect } from "react";

// ✅ ✅ FIXED URL (REMOVED HTML BUG)
const API = "https://football-system-v5ot.onrender.com";

const MARKET_LABELS = {
  home_win: "Home Win",
  draw: "Draw",
  away_win: "Away Win",
  btts_yes: "BTTS - Yes",
  btts_no: "BTTS - No",
  over_1_5: "Over 1.5",
  under_1_5: "Under 1.5",
  over_2_5: "Over 2.5",
  under_2_5: "Under 2.5",
  over_3_5: "Over 3.5",
  under_3_5: "Under 3.5",
};

const ODDS_FIELDS = [
  "home_win",
  "draw",
  "away_win",
  "btts_yes",
  "over_2_5",
  "under_2_5"
];

export default function FootballOracle() {
  const [tab, setTab] = useState("predict");

  return (
    <div style={page}>
      <h1>⚽ Football Oracle</h1>

      <div style={tabRow}>
        <button onClick={() => setTab("predict")} style={tab === "predict" ? tabBtnActive : tabBtn}>
          Predict
        </button>
        <button onClick={() => setTab("track")} style={tab === "track" ? tabBtnActive : tabBtn}>
          Track Results & Accuracy
        </button>
      </div>

      {tab === "predict" ? <PredictPanel /> : <TrackPanel />}
    </div>
  );
}

/* ============================= */
/* ✅ PREDICT PANEL */
/* ============================= */
function PredictPanel() {
  const [homeTeam, setHomeTeam] = useState("");
  const [awayTeam, setAwayTeam] = useState("");
  const [rho, setRho] = useState(0.1);
  const [odds, setOdds] = useState({});
  const [showOdds, setShowOdds] = useState(false);

  // ✅ ✅ MULTI-LEAGUE (ADDED — NO STRUCTURE CHANGE)
  const [league, setLeague] = useState("DEFAULT");

  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const runPrediction = async () => {
    if (!homeTeam || !awayTeam) return;

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const res = await fetch(`${API}/api/predict`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          home: homeTeam,
          away: awayTeam,
          rho,
          odds,
          league   // ✅ ✅ NEW FIELD
        })
      });

      const data = await res.json();

      if (!res.ok || data.error) throw new Error(data.error);

      setResult(data);

    } catch (err) {
      setError("❌ API failed — try again (server may be waking)");
    }

    setLoading(false);
  };

  return (
    <div style={card}>

      {/* ✅ ✅ MULTI-LEAGUE DROPDOWN */}
      <select value={league} onChange={e => setLeague(e.target.value)} style={inputStyle}>
        <option value="EPL">EPL</option>
        <option value="LA_LIGA">La Liga</option>
        <option value="SERIE_A">Serie A</option>
        <option value="BUNDESLIGA">Bundesliga</option>
        <option value="DEFAULT">Other</option>
      </select>

      <input placeholder="Home Team" value={homeTeam} onChange={e => setHomeTeam(e.target.value)} style={inputStyle} />
      <input placeholder="Away Team" value={awayTeam} onChange={e => setAwayTeam(e.target.value)} style={inputStyle} />

      <button onClick={runPrediction} style={buttonStyle}>
        {loading ? "Analysing..." : "Analyse Match"}
      </button>

      {error && <div>{error}</div>}

      {result && <ResultDisplay result={result} />}
    </div>
  );
}

/* ============================= */
/* ✅ RESULT DISPLAY */
/* ============================= */
function ResultDisplay({ result }) {
  return (
    <div>
      <h2>{result.home} vs {result.away}</h2>

      <p>xG: {result.exp_home} - {result.exp_away}</p>

      <h3>Markets</h3>
      {Object.keys(result.markets || {}).map(k => (
        <div key={k}>
          {MARKET_LABELS[k] || k}: {result.markets[k]}%
        </div>
      ))}

      <h3>Best Pick:</h3>
      <b>{result.best_pick}</b>
    </div>
  );
}

/* ============================= */
/* ✅ TRACK PANEL */
/* ============================= */
function TrackPanel() {
  const [picks, setPicks] = useState([]);

  useEffect(() => {
    fetch(`${API}/api/picks`)
      .then(res => res.json())
      .then(data => setPicks(data.picks || []))
      .catch(() => {});
  }, []);

  return (
    <div>
      {picks.map((p,i) => (
        <div key={i}>
          {p.home} vs {p.away} → {p.best_pick}
        </div>
      ))}
    </div>
  );
}

/* ============================= */
/* STYLES */
/* ============================= */
const page = { padding: 20 };
const card = { padding: 20, background: "#1e293b" };
const tabRow = { display: "flex", gap: 10 };
const tabBtn = { padding: 10 };
const tabBtnActive = { padding: 10, background: "blue", color: "#fff" };
const inputStyle = { display: "block", margin: 10 };
const buttonStyle = { padding: 10 };