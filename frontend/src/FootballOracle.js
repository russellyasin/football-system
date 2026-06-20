import { useState, useEffect } from "react";

export default function FootballOracle() {

  const [homeTeam, setHomeTeam] = useState("");
  const [awayTeam, setAwayTeam] = useState("");
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);

  const [picks, setPicks] = useState([]);
  const [top3, setTop3] = useState([]);

  const API = "https://football-system-v50t.onrender.com";

  // ✅ LONG WAIT FETCH (KEY FIX)
  const waitFetch = async (url, options = {}) => {
    return new Promise(async (resolve, reject) => {

      let timeout = setTimeout(() => {
        reject("timeout");
      }, 60000); // ✅ wait up to 60 seconds

      try {
        const res = await fetch(url, options);
        clearTimeout(timeout);
        resolve(await res.json());
      } catch (err) {
        clearTimeout(timeout);
        reject(err);
      }
    });
  };

  // ✅ LOAD PICKS
  const loadPicks = async () => {
    try {
      const res = await fetch(`${API}/api/picks`);
      const data = await res.json();
      setTop3(data.top3 || []);
      setPicks(data.picks || []);
    } catch {
      console.log("picks failed (server sleeping)");
    }
  };

  useEffect(() => {
    loadPicks();

    const interval = setInterval(loadPicks, 10000);
    return () => clearInterval(interval);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ✅ MAIN FIX HERE
  const runPrediction = async () => {
    if (!homeTeam || !awayTeam) return;

    setLoading(true);
    setResult("⏳ Connecting to live server (can take up to 30s)...");

    try {
      const data = await waitFetch(`${API}/api/predict`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          home: homeTeam,
          away: awayTeam
        })
      });

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

    } catch (err) {

      if (err === "timeout") {
        setResult("⚠️ Server took too long. Click again once.");
      } else {
        setResult("❌ API error — check backend");
      }
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
          <pre style={{ whiteSpace: "pre-wrap" }}>{result}</pre>
        </div>
      )}

      <h2 style={{ color: "#facc15" }}>
        🔥 Top 3 Picks
      </h2>

      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
        {top3.map((p, i) => (
          <div key={i} style={topCard}>
            {p.home} vs {p.away}
          </div>
        ))}
      </div>

      <h2 style={{ color: "#22c55e" }}>
        ✅ Best Picks
      </h2>

      {picks.map((p, i) => (
        <div key={i} style={listCard}>
          {p.home} vs {p.away} → {p.market}
        </div>
      ))}

    </div>
  );
}

// styles

const inputStyle = {
  display: "block",
  width: "100%",
  padding: "10px",
  margin: "10px 0",
  borderRadius: "6px",
  background: "#0f172a",
  color: "#fff",
  border: "none"
};

const buttonStyle = {
  padding: "10px",
  background: "#38bdf8",
  border: "none",
  borderRadius: "6px",
  cursor: "pointer"
};

const cardStyle = {
  background: "#1e293b",
  marginTop: "20px",
  padding: "10px",
  borderRadius: "8px"
};

const topCard = {
  background: "orange",
  padding: "10px",
  borderRadius: "6px",
  color: "#000"
};

const listCard = {
  background: "#1e293b",
  padding: "10px",
  margin: "8px 0",
  borderRadius: "6px"
};