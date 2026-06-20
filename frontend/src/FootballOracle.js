import { useState, useEffect } from "react";

export default function FootballOracle() {
  const [homeTeam, setHomeTeam] = useState("");
  const [awayTeam, setAwayTeam] = useState("");
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [interpreterResult, setInterpreterResult] = useState("");
  const [interpreterLoading, setInterpreterLoading] = useState(false);

  const [picks, setPicks] = useState([]);
  const [top3, setTop3] = useState([]);

  const loadPicks = async () => {
    try {
      const res = await fetch("http://localhost:5000/api/picks");
      const data = await res.json();

      setTop3(data.top3 || []);
      setPicks(data.picks || []);
    } catch {
      console.log("Failed to load picks");
    }
  };

  useEffect(() => {
    loadPicks();
    const interval = setInterval(loadPicks, 5000);
    return () => clearInterval(interval);
  }, []);

  const runPrediction = async () => {
    if (!homeTeam || !awayTeam) return;

    setLoading(true);

    try {
      const res = await fetch("http://localhost:5000/api/predict", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          home: homeTeam,
          away: awayTeam
        })
      });

      const data = await res.json();

      setResult(`
${homeTeam} vs ${awayTeam}

Expected: ${data.exp_home} - ${data.exp_away}
Total: ${data.total}

Over 2.5: ${data.over_2_5}%
Confidence: ${data.confidence}/10

Best Pick: ${data.market || data.best_pick}
      `);

    } catch {
      setResult("❌ Backend connection failed");
    }

    setLoading(false);
  };

  return (
    <div style={{ 
      background: "#0f172a", 
      minHeight: "100vh", 
      color: "#fff", 
      padding: "20px",
      fontFamily: "Arial"
    }}>

      <h1 style={{ color: "#38bdf8" }}>⚽ Football Oracle</h1>

      {/* INPUT CARD */}
      <div style={{
        background: "#1e293b",
        padding: "20px",
        borderRadius: "12px",
        marginBottom: "20px"
      }}>
        <h2>Match Analysis</h2>

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

      {/* RESULT CARD */}
      {result && (
        <div style={cardStyle}>
          <h3>📊 Prediction Result</h3>
          <pre style={{ whiteSpace: "pre-wrap" }}>{result}</pre>
        </div>
      )}

      {/* TOP PICKS */}
      <h2 style={{ marginTop: "30px", color: "#facc15" }}>🔥 Top 3 Elite Picks</h2>

      <div style={{ display: "flex", gap: "15px", flexWrap: "wrap" }}>
        {top3.map((p, i) => (
          <div key={i} style={topCard}>
            <h3>{p.home} vs {p.away}</h3>
            <p>🎯 {p.market}</p>
            <p>Edge: {p.value_edge}</p>
            <p>Conf: {p.confidence}</p>
          </div>
        ))}
      </div>

      {/* PICKS LIST */}
      <h2 style={{ marginTop: "30px", color: "#22c55e" }}>✅ Best Picks</h2>

      {picks.map((p, i) => (
        <div key={i} style={listCard}>
          <div>
            <strong>{p.home} vs {p.away}</strong>
            <div style={{ fontSize: "12px", opacity: 0.7 }}>
              {p.market}
            </div>
          </div>

          <div>
            🎯 {p.bet_score}
            <br />
            <small>Conf: {p.confidence}</small>
          </div>
        </div>
      ))}

    </div>
  );
}

/* ================= STYLES ================= */

const inputStyle = {
  display: "block",
  width: "100%",
  padding: "10px",
  margin: "10px 0",
  borderRadius: "6px",
  border: "none",
  background: "#0f172a",
  color: "#fff"
};

const buttonStyle = {
  padding: "10px 20px",
  background: "#38bdf8",
  border: "none",
  borderRadius: "6px",
  color: "#000",
  fontWeight: "bold",
  cursor: "pointer",
  marginTop: "10px"
};

const cardStyle = {
  background: "#1e293b",
  padding: "15px",
  borderRadius: "10px",
  marginTop: "20px"
};

const topCard = {
  flex: "1",
  minWidth: "250px",
  background: "linear-gradient(135deg, #facc15, #f59e0b)",
  padding: "15px",
  borderRadius: "10px",
  color: "#000",
  fontWeight: "bold"
};

const listCard = {
  display: "flex",
  justifyContent: "space-between",
  background: "#1e293b",
  padding: "12px",
  borderRadius: "8px",
  margin: "10px 0",
  borderLeft: "4px solid #22c55e"
};