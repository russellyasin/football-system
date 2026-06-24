
const API =
  window.location.hostname === "localhost"
    ? "http://127.0.0.1:10000"
    : "https://football-system-v50t.onrender.com";
const LEAGUES_WITH_LIVE_ODDS = [
  "Premier League",
  "La Liga",
  "Serie A",
  "Bundesliga",
  "Ligue 1",
  "MLS",
  "Champions League",
];

const MARKET_LABELS = {
  home_win: "Home Win",
  draw: "Draw",
  away_win: "Away Win",
  btts_yes: "BTTS — Yes",
  btts_no: "BTTS — No",
  over_1_5: "Over 1.5",
  under_1_5: "Under 1.5",
  over_2_5: "Over 2.5",
  under_2_5: "Under 2.5",
  over_3_5: "Over 3.5",
  under_3_5: "Under 3.5",
};

const ODDS_FIELDS = ["home_win", "draw", "away_win", "btts_yes", "over_2_5", "under_2_5"];

export default function FootballOracle() {
  const [tab, setTab] = useState("analyze");

  // ✅ FIX: moved here (was outside)
  useEffect(() => {
    fetch("https://football-system-v50t.onrender.com")
      .then(() => console.log("Backend awake ✅"))
      .catch(() => console.log("Waking backend..."));
  }, []);

  return (
    <div className="oracle-root">
      <style>{css}</style>

      <header className="oracle-header">
        <div className="brand">
          <span className="brand-mark">FO</span>
          <div>
            <div className="brand-title">Football Oracle</div>
            <div className="brand-sub">Dixon-Coles model · live market board</div>
          </div>
        </div>

        <nav className="tab-pills">
          <button className={tab === "analyze" ? "pill pill-active" : "pill"} onClick={() => setTab("analyze")}>
            Analyze
          </button>
          <button className={tab === "live" ? "pill pill-active" : "pill"} onClick={() => setTab("live")}>
            Live Board
          </button>
          <button className={tab === "track" ? "pill pill-active" : "pill"} onClick={() => setTab("track")}>
            Track
          </button>
        </nav>
      </header>

      <main className="oracle-main">
        {tab === "analyze" && <AnalyzeTab />}
        {tab === "live" && <LiveBoardTab />}
        {tab === "track" && <TrackTab />}
      </main>
    </div>
  );
}

/* ============================================================
   ANALYZE
============================================================ */

function AnalyzeTab() {
  const [home, setHome] = useState("");
  const [away, setAway] = useState("");
  const [league, setLeague] = useState("Premier League");
  const [customLeague, setCustomLeague] = useState("");
  const [showOdds, setShowOdds] = useState(false);
  const [odds, setOdds] = useState({});
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const effectiveLeague = league === "Other" ? customLeague || "General" : league;

  const analyze = async () => {
    if (!home || !away) return;
    setLoading(true);
    setError("");
    setResult(null);

    const cleanOdds = {};
    ODDS_FIELDS.forEach((f) => {
      const v = parseFloat(odds[f]);
      if (!isNaN(v) && v > 1) cleanOdds[f] = v;
    });

    try {
      let res;

      for (let i = 0; i < 4; i++) {
        try {
          res = await fetch(`${API}/api/predict`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              home,
              away,
              league: effectiveLeague,
              odds: cleanOdds,
            }),
          });

          if (res.ok) break;
        } catch (err) {}

        console.log("Retry attempt:", i + 1);
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }

      if (!res || !res.ok) {
        throw new Error("Server not ready");
      }

      const data = await res.json();
      setResult(data);

    } catch (err) {
      setError("Server is waking up... please wait and try again.");
    }

    setLoading(false);
  };

  // ✅ FIX: THIS WAS MISSING
  return (
    <div className="stack">
      <section className="panel">
        <div className="panel-head">
          <h2>Match inputs</h2>
          <span className={`model-badge ${result ? "model-badge-" + result.model : ""}`}>
            {result ? (result.model === "elite_mle" ? "Elite model" : "Baseline model") : "—"}
          </span>
        </div>

        <div className="row-2">
          <input className="field" placeholder="Home team" value={home} onChange={(e) => setHome(e.target.value)} />
          <input className="field" placeholder="Away team" value={away} onChange={(e) => setAway(e.target.value)} />
        </div>

        <div className="row-2">
          <select className="field" value={league} onChange={(e) => setLeague(e.target.value)}>
            {LEAGUES_WITH_LIVE_ODDS.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
            <option value="Other">Other / custom…</option>
          </select>

          {league === "Other" && (
            <input
              className="field"
              placeholder="League name"
              value={customLeague}
              onChange={(e) => setCustomLeague(e.target.value)}
            />
          )}
        </div>

        <button className="link-btn" onClick={() => setShowOdds(!showOdds)}>
          {showOdds ? "− Hide odds" : "+ Add your odds to check for value"}
        </button>

        {showOdds && (
          <div className="odds-grid">
            {ODDS_FIELDS.map((f) => (
              <label key={f} className="odds-field">
                <span>{MARKET_LABELS[f]}</span>
                <input
                  className="field field-mono"
                  placeholder="1.00"
                  value={odds[f] || ""}
                  onChange={(e) => setOdds({ ...odds, [f]: e.target.value })}
                />
              </label>
            ))}
          </div>
        )}

        <button className="btn-primary" onClick={analyze} disabled={loading}>
          {loading ? "Analyzing…" : "Analyze match"}
        </button>

        {error && <p className="error-text">{error}</p>}
      </section>

      {result && <AnalyzeResult result={result} />}
    </div>
  );
}
