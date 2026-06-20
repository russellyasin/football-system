import { useState, useEffect } from "react";

export default function FootballOracle() {

  const [homeTeam, setHomeTeam] = useState("");
  const [awayTeam, setAwayTeam] = useState("");
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);
  const [waking, setWaking] = useState(false);
  const [serverReady, setServerReady] = useState(false);

  const [picks, setPicks] = useState([]);
  const [top3, setTop3] = useState([]);

  // ✅ ✅ ✅ FIXED API (ONLY CHANGE)
  const API = "https://football-system-v5ot.onrender.com";

  const wakeServer = async () => {
    setWaking(true);
    setServerReady(false);

    const MAX_ATTEMPTS = 12;
    const DELAY_MS = 5000;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      setResult(`⏳ Starting server (attempt ${attempt}/${MAX_ATTEMPTS})...`);

      try {
        const res = await fetch(API);
        if (res.ok) {
          setServerReady(true);
          setResult("✅ Server ready — now click Analyse");
          setWaking(false);
          return;
        }
      } catch {
        // ignore while waking
      }

      if (attempt < MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, DELAY_MS));
      }
    }

    setResult("❌ Server still sleeping after a minute — try clicking Wake Server again");
    setWaking(false);
  };

  const fetchData = async (url, options = {}) => {
    const res = await fetch(url, options);
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || "Server error");
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
    const interval = setInterval(loadPicks, 10000);
    return () => clearInterval(interval);
  }, []);

  const runPrediction = async () => {
    if (!homeTeam || !awayTeam) return;

    if (!serverReady) {
      setResult("⚠️ Click 'Wake Server' first");
      return;
    }

    setLoading(true);
    setResult("⏳ Getting prediction...");

    try {
      const data = await fetchData(`${API}/api/predict`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          home: homeTeam,
          away: awayTeam
        })
      });

      const top = data.top_scorelines && data.top_scorelines[0];

      setResult(`
${homeTeam} vs ${awayTeam}

Expected Goals:
Home: ${data.exp_home}
Away: ${data.exp_away}

Home Win: ${data.markets.home_win}%
Draw: ${data.markets.draw}%
Away Win: ${data.markets.away_win}%
BTTS: ${data.markets.btts_yes}%
Over 2.5: ${data.markets.over_2_5}%

Most Likely Score: ${top ? `${top.home}-${top.away} (${top.prob_pct}%)` : "n/a"}
Best Pick: ${data.best_pick}
      `);

    } catch {
      setResult("❌ Failed — try again");
    }

    setLoading(false);
  };

  return (
    <div style={{
      background: "#0f172a",
      minHeight: "100vh",
      color: "#fff",
      padding: "20px"
    }}>

      <h1 style={{ color: "#38bdf8" }}>⚽ Football Oracle</h1>

      <button onClick={wakeServer} style={buttonStyle} disabled={waking}>
        {waking ? "🔄 Waking..." : "🔄 Wake Server"}
      </button>

      <div style={{
        background: "#1e293b",
        padding: "20px",
        borderRadius: "10px"
      }}>
        <input
          placeholder="Home Team"
          value={homeTeam}
          onChange={(e) => setHomeTeam(e.target.value)}
          style={inputStyle}
        />

        <input
          placeholder="Away Team"
          value={awayTeam}
          onChange={(e) => setAwayTeam(e.target.value)}
          style={inputStyle}
        />

        <button onClick={runPrediction} style={buttonStyle}>
          {loading ? "Analyzing..." : "Analyse Match"}
        </button>
      </div>

      {result && (
        <div style={cardStyle}>
          <pre>{result}</pre>
        </div>
      )}

      <h2 style={{ color: "#facc15" }}>🔥 Top 3 Picks</h2>

      <div style={{ display: "flex", gap: "10px" }}>
        {top3.map((p, i) => (
          <div key={i} style={topCard}>
            {p.home} vs {p.away}
          </div>
        ))}
      </div>

      <h2 style={{ color: "#22c55e" }}>✅ Best Picks</h2>

      {picks.map((p, i) => (
        <div key={i} style={listCard}>
          {p.home} vs {p.away} → {p.best_pick}
        </div>
      ))}

    </div>
  );
}

// styles unchanged
const inputStyle = { padding: "10px", margin: "10px 0", width: "100%" };
const buttonStyle = { padding: "10px", margin: "10px 5px", cursor: "pointer" };
const cardStyle = { marginTop: "20px", padding: "10px", background: "#1e293b" };
const topCard = { background: "orange", padding: "10px" };
const listCard = { background: "#1e293b", padding: "10px", margin: "8px 0" };