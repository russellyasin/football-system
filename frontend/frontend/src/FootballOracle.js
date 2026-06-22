import { useState, useEffect } from "react";

// ✅ ✅ FIXED (NO HTML, REAL URL)
const API = "https://football-system-v5ot.onrender.com";

const MARKET_LABELS = {
  home_win: "Home Win",
  draw: "Draw",
  away_win: "Away Win",
  btts_yes: "BTTS",
  over_2_5: "Over 2.5"
};

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
          Track
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
  const [league, setLeague] = useState("DEFAULT");

  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);

  const [waking, setWaking] = useState(false);
  const [serverReady, setServerReady] = useState(false);

  const [picks, setPicks] = useState([]);
  const [top3, setTop3] = useState([]);

  const wakeServer = async () => {
    setWaking(true);
    setServerReady(false);

    try {
      const res = await fetch(API);

      if (res.ok) {
        setServerReady(true);
        setResult("✅ Server ready");
      } else {
        setResult("❌ Server still sleeping");
      }

    } catch {
      setResult("❌ Wake failed");
    }

    setWaking(false);
  };

  const fetchData = async (url, options = {}) => {
    const res = await fetch(url, options);
    const data = await res.json();
    if (!res.ok || data.error) throw new Error();
    return data;
  };

  const loadPicks = async () => {
    try {
      const data = await fetchData(`${API}/api/picks`);
      const list = data.picks || [];
      setPicks(list);
      setTop3(list.slice(0, 3));
    } catch {}
  };

  useEffect(() => {
    loadPicks();
  }, []);

  const runPrediction = async () => {

    if (!homeTeam || !awayTeam) return;

    if (!serverReady) {
      setResult("⚠️ Click 'Wake Server' first");
      return;
    }

    setLoading(true);
    setResult("⏳ Analyzing...");

    try {

      const data = await fetchData(`${API}/api/predict`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          home: homeTeam,
          away: awayTeam,
          league   // ✅ now correctly sent
        })
      });

      if (data.markets) {
        setResult(`
${data.home} vs ${data.away}

xG: ${data.exp_home} - ${data.exp_away}

${Object.keys(data.markets).map(k =>
  `${MARKET_LABELS[k] || k}: ${data.markets[k]}%`
).join("\n")}

Best Pick: ${data.best_pick}
        `);
      } else {
        setResult(`
${homeTeam} vs ${awayTeam}

Expected Goals:
Home: ${data.exp_home}
Away: ${data.exp_away}
Total: ${data.total}

Over 2.5: ${data.over_2_5}%
Confidence: ${data.confidence}/10

Best Pick: ${data.market}
        `);
      }

    } catch {
      setResult("❌ Failed — try again");
    }

    setLoading(false);
  };

  return (
    <div style={card}>

      <select value={league} onChange={e => setLeague(e.target.value)} style={inputStyle}>
        <option value="EPL">EPL</option>
        <option value="LA_LIGA">La Liga</option>
        <option value="SERIE_A">Serie A</option>
        <option value="BUNDESLIGA">Bundesliga</option>
        <option value="DEFAULT">Other</option>
      </select>

      <button onClick={wakeServer} style={buttonStyle}>
        🔄 Wake Server
      </button>

      <input placeholder="Home Team" value={homeTeam} onChange={e => setHomeTeam(e.target.value)} style={inputStyle} />
      <input placeholder="Away Team" value={awayTeam} onChange={e => setAwayTeam(e.target.value)} style={inputStyle} />

      <button onClick={runPrediction} style={buttonStyle}>
        {loading ? "Analyzing..." : "Analyse Match"}
      </button>

      {result && <pre style={cardStyle}>{result}</pre>}

      <h3>🔥 Top 3 Picks</h3>
      <div style={{ display: "flex", gap: "10px" }}>
        {top3.map((p, i) => (
          <div key={i} style={topCard}>
            {p.home} vs {p.away}
          </div>
        ))}
      </div>

      <h3>✅ Best Picks</h3>
      {picks.map((p, i) => (
        <div key={i} style={listCard}>
          {p.home} vs {p.away} → {p.best_pick || p.market}
        </div>
      ))}

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
      {picks.map((p, i) => (
        <div key={i}>
          {p.home} vs {p.away} → {p.best_pick || p.market}
        </div>
      ))}
    </div>
  );
}

/* ============================= */
/* STYLES */
/* ============================= */
const page = { padding: 20, background: "#0f172a", color: "#fff" };
const card = { padding: 20, background: "#1e293b", borderRadius: 10 };
const tabRow = { display: "flex", gap: 10 };
const tabBtn = { padding: 10 };
const tabBtnActive = { padding: 10, background: "#38bdf8", color: "#000" };
const inputStyle = { display: "block", margin: 10, padding: 10 };
const buttonStyle = { padding: 10, margin: 5 };
const cardStyle = { marginTop: 20, background: "#111827", padding: 10 };
const topCard = { background: "orange", padding: 10 };
const listCard = { background: "#1e293b", padding: 10, margin: "5px 0" };