import { useState, useEffect } from "react";

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
  btts_yes: "BTTS \u2014 Yes",
  btts_no: "BTTS \u2014 No",
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

  return (
    <div className="oracle-root">
      <style>{css}</style>

      <header className="oracle-header">
        <div className="brand">
          <span className="brand-mark">FO</span>
          <div>
            <div className="brand-title">Football Oracle</div>
            <div className="brand-sub">Dixon-Coles model &middot; live market board</div>
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
      const res = await fetch(`${API}/api/predict`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ home, away, league: effectiveLeague, odds: cleanOdds }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Backend error");
      setResult(data);
    } catch {
      setError("Couldn't reach the server \u2014 it may be waking up from idle (Render free tier). Try again shortly.");
    }
    setLoading(false);
  };

  return (
    <div className="stack">
      <section className="panel">
        <div className="panel-head">
          <h2>Match inputs</h2>
          <span className={`model-badge ${result ? "model-badge-" + result.model : ""}`}>
            {result ? (result.model === "elite_mle" ? "Elite model" : "Baseline model") : "\u2014"}
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
          {showOdds ? "\u2212 Hide odds" : "+ Add your odds to check for value"}
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
          {loading ? "Analyzing\u2026" : "Analyze match"}
        </button>
        {error && <p className="error-text">{error}</p>}
      </section>

      {result && <AnalyzeResult result={result} />}
    </div>
  );
}

function AnalyzeResult({ result }) {
  const { home, away, exp_home, exp_away, sample_size, markets, top_scorelines, value_bets, top_picks, best_pick, rho } = result;

  return (
    <>
      <section className="panel hero-panel">
        <div className="hero-matchup">{home} <span className="vs">vs</span> {away}</div>
        <div className="hero-xg">
          <div className="xg-block">
            <span className="xg-num">{exp_home}</span>
            <span className="xg-label">{home} xG</span>
          </div>
          <div className="xg-divider">–</div>
          <div className="xg-block">
            <span className="xg-num">{exp_away}</span>
            <span className="xg-label">{away} xG</span>
          </div>
        </div>
        <p className="hero-note">
          {sample_size.home_matches === 0 && sample_size.away_matches === 0
            ? "No recorded history yet for these teams \u2014 league-average baseline used."
            : `${home}: ${sample_size.home_matches} matches on record \u00b7 ${away}: ${sample_size.away_matches} matches on record`}
          {"  \u00b7  \u03c1 = "}{rho.toFixed(3)}
        </p>
      </section>

      <section className="panel">
        <h2>Top picks</h2>
        <div className="ticker-row">
          {top_picks.map((p, i) => (
            <div key={i} className={`ticker-pill ${i === 0 ? "ticker-pill-best" : ""}`}>
              <span className="ticker-market">{p.market}</span>
              <span className="ticker-prob">{p.probability_pct}%</span>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2>All markets</h2>
        <div className="market-grid">
          {Object.entries(markets).map(([k, v]) => (
            <div key={k} className={`market-tile ${MARKET_LABELS[k] === best_pick ? "market-tile-best" : ""}`}>
              <span className="market-label">{MARKET_LABELS[k] || k}</span>
              <span className="market-value">{v}%</span>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2>Likeliest scorelines</h2>
        <div className="score-grid">
          {top_scorelines.map((s, i) => (
            <div key={i} className={`score-cell ${i === 0 ? "score-cell-best" : ""}`}>
              <span className="score-line">{s.home}-{s.away}</span>
              <span className="score-prob">{s.prob_pct}%</span>
              <span className="score-odds">{s.fair_decimal}</span>
            </div>
          ))}
        </div>
      </section>

      {value_bets.length > 0 && (
        <section className="panel">
          <h2>Value vs. your odds</h2>
          {value_bets.map((vb, i) => (
            <ValueRow key={i} vb={vb} />
          ))}
        </section>
      )}
    </>
  );
}

function ValueRow({ vb }) {
  const isValue = vb.is_value;
  return (
    <div className={`value-row ${isValue ? "value-row-up" : "value-row-down"}`}>
      <span className="value-market">{MARKET_LABELS[vb.market] || vb.market}</span>
      <span className="value-odds">@ {vb.odds_given}</span>
      <span className="value-model">model {vb.model_prob_pct}%</span>
      {vb.market_devigged_pct != null && (
        <span className="value-devig">market (devig) {vb.market_devigged_pct}%</span>
      )}
      <span className={`value-edge ${isValue ? "edge-up" : "edge-down"}`}>
        {isValue ? "\u25B2" : "\u25BC"} {vb.edge_pct > 0 ? "+" : ""}{vb.edge_pct}pp
      </span>
    </div>
  );
}

/* ============================================================
   LIVE BOARD
============================================================ */
function LiveBoardTab() {
  const [league, setLeague] = useState("Premier League");
  const [minEdge, setMinEdge] = useState(3);
  const [picks, setPicks] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const scan = async () => {
    setLoading(true);
    setError("");
    setPicks(null);
    try {
      const res = await fetch(`${API}/api/live-picks?league=${encodeURIComponent(league)}&min_edge=${minEdge}`);
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Backend error");
      setPicks(data);
    } catch (e) {
      setError(
        e.message && e.message.includes("ODDS_API_KEY")
          ? "No odds API key configured on the server yet \u2014 set ODDS_API_KEY as an environment variable."
          : "Couldn't reach the server \u2014 it may be waking up from idle. Try again shortly."
      );
    }
    setLoading(false);
  };

  return (
    <div className="stack">
      <section className="panel">
        <h2>Scan for live value</h2>
        <div className="row-2">
          <select className="field" value={league} onChange={(e) => setLeague(e.target.value)}>
            {LEAGUES_WITH_LIVE_ODDS.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
          <label className="odds-field">
            <span>Minimum edge (pp)</span>
            <input
              className="field field-mono"
              value={minEdge}
              onChange={(e) => setMinEdge(e.target.value)}
            />
          </label>
        </div>
        <button className="btn-primary" onClick={scan} disabled={loading}>
          {loading ? "Scanning\u2026" : "Scan fixtures"}
        </button>
        {error && <p className="error-text">{error}</p>}
      </section>

      {picks && (
        <section className="panel">
          <h2>{picks.league} — {picks.checked} fixtures checked, {picks.picks.length} showing value</h2>
          {picks.picks.length === 0 ? (
            <p className="empty-note">No value above {minEdge}pp right now. Try a lower threshold or check back later.</p>
          ) : (
            <div className="stack-tight">
              {picks.picks.map((p) => (
                <FixtureCard key={p.fixture_id} pick={p} />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function FixtureCard({ pick }) {
  return (
    <div className="fixture-card">
      <div className="fixture-head">
        <span className="fixture-teams">{pick.home} vs {pick.away}</span>
        <span className="fixture-time">{formatKickoff(pick.commence_time)}</span>
      </div>
      <div className="fixture-xg">xG {pick.exp_home} – {pick.exp_away} &middot; best pick: {pick.best_pick}</div>

      {pick.top_picks && (
        <div className="ticker-row ticker-row-compact">
          {pick.top_picks.map((tp, i) => (
            <div key={i} className="ticker-pill ticker-pill-small">
              <span className="ticker-market">{tp.market}</span>
              <span className="ticker-prob">{tp.probability_pct}%</span>
            </div>
          ))}
        </div>
      )}

      {pick.value_bets.map((vb, i) => (
        <div key={i} className="bookmaker-block">
          <div className="bookmaker-block-head">
            <span className="value-market">{MARKET_LABELS[vb.market] || vb.market}</span>
            <span className={`value-edge ${vb.edge_pct > 0 ? "edge-up" : "edge-down"}`}>
              ▲ +{vb.edge_pct}pp vs best price
              {vb.edge_vs_devigged_pct != null && ` (${vb.edge_vs_devigged_pct > 0 ? "+" : ""}${vb.edge_vs_devigged_pct}pp vs devigged market)`}
            </span>
          </div>
          <div className="bookmaker-ticker">
            {vb.all_bookmakers.map((b, j) => (
              <div key={j} className={`book-pill ${b.bookmaker === vb.best_bookmaker ? "book-pill-best" : ""}`}>
                <span className="book-name">{b.bookmaker}</span>
                <span className="book-odds">{b.odds.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function formatKickoff(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit", month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}

/* ============================================================
   TRACK
============================================================ */
function TrackTab() {
  const [form, setForm] = useState({ home: "", away: "", league: "Premier League", home_goals: "", away_goals: "" });
  const [status, setStatus] = useState("");
  const [stats, setStats] = useState(null);
  const [picks, setPicks] = useState([]);

  const load = async () => {
    try {
      const s = await fetch(`${API}/api/stats`).then((r) => r.json());
      setStats(s);
    } catch {
      setStats(null);
    }
    try {
      const p = await fetch(`${API}/api/picks`).then((r) => r.json());
      setPicks(p.picks || []);
    } catch {
      setPicks([]);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const submit = async () => {
    if (!form.home || !form.away || form.home_goals === "" || form.away_goals === "") return;
    setStatus("Saving\u2026");
    try {
      const res = await fetch(`${API}/api/result`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Backend error");
      setStatus(data.settled_prediction ? "Result recorded and matched to a prior prediction." : "Result recorded \u2014 team ratings updated.");
      setForm({ home: "", away: "", league: form.league, home_goals: "", away_goals: "" });
      load();
    } catch {
      setStatus("Couldn't save \u2014 try again shortly.");
    }
  };

  return (
    <div className="stack">
      <section className="panel">
        <h2>Record a final score</h2>
        <div className="row-2">
          <input className="field" placeholder="Home team" value={form.home} onChange={(e) => setForm({ ...form, home: e.target.value })} />
          <input className="field" placeholder="Away team" value={form.away} onChange={(e) => setForm({ ...form, away: e.target.value })} />
        </div>
        <div className="row-2">
          <input className="field field-mono" placeholder="Home goals" value={form.home_goals} onChange={(e) => setForm({ ...form, home_goals: e.target.value })} />
          <input className="field field-mono" placeholder="Away goals" value={form.away_goals} onChange={(e) => setForm({ ...form, away_goals: e.target.value })} />
        </div>
        <button className="btn-primary" onClick={submit}>Save result</button>
        {status && <p className="hint-text">{status}</p>}
      </section>

      <section className="panel">
        <h2>Calibration &amp; accuracy</h2>
        {!stats || !stats.settled ? (
          <p className="empty-note">No settled predictions yet.</p>
        ) : (
          <div className="market-grid">
            <div className="market-tile"><span className="market-label">Settled</span><span className="market-value">{stats.settled}</span></div>
            <div className="market-tile market-tile-best"><span className="market-label">Hit rate</span><span className="market-value">{stats.hit_rate_pct}%</span></div>
            <div className="market-tile"><span className="market-label">Brier 1X2</span><span className="market-value">{stats.brier_1x2}</span></div>
            <div className="market-tile"><span className="market-label">Brier BTTS</span><span className="market-value">{stats.brier_btts}</span></div>
            <div className="market-tile"><span className="market-label">Brier O/U 2.5</span><span className="market-value">{stats.brier_over_2_5}</span></div>
          </div>
        )}
      </section>

      <section className="panel">
        <h2>Recent predictions</h2>
        {picks.length === 0 ? (
          <p className="empty-note">Nothing logged yet.</p>
        ) : (
          picks.map((p, i) => (
            <div key={i} className="recent-row">
              <span>{p.home} vs {p.away}</span>
              <span className="hint-text">{p.best_pick}</span>
            </div>
          ))
        )}
      </section>
    </div>
  );
}

/* ============================================================
   STYLES
============================================================ */
const css = `
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap');

* { box-sizing: border-box; }

.oracle-root {
  --ink: #0B0F14;
  --panel: #121822;
  --panel-2: #1A2230;
  --line: rgba(231,236,242,0.09);
  --chalk: #E7ECF2;
  --mute: #6B7686;
  --green: #3DDC84;
  --red: #FF5C5C;
  --amber: #FFB020;

  background: var(--ink);
  color: var(--chalk);
  font-family: 'Inter', sans-serif;
  min-height: 100%;
  padding: 18px 16px 40px;
}

.mono, .field-mono { font-family: 'IBM Plex Mono', monospace; }

.oracle-header {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-bottom: 18px;
}
.brand { display: flex; align-items: center; gap: 10px; }
.brand-mark {
  font-family: 'Space Grotesk', sans-serif;
  font-weight: 700;
  font-size: 14px;
  background: var(--amber);
  color: var(--ink);
  border-radius: 8px;
  padding: 6px 9px;
  letter-spacing: 0.02em;
}
.brand-title { font-family: 'Space Grotesk', sans-serif; font-weight: 600; font-size: 19px; }
.brand-sub { font-size: 11.5px; color: var(--mute); margin-top: 1px; }

.tab-pills { display: flex; gap: 6px; background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 4px; }
.pill {
  flex: 1;
  background: transparent;
  border: none;
  color: var(--mute);
  font-weight: 600;
  font-size: 13px;
  padding: 9px 8px;
  border-radius: 7px;
  cursor: pointer;
  font-family: 'Inter', sans-serif;
}
.pill-active { background: var(--amber); color: var(--ink); }

.oracle-main { display: flex; flex-direction: column; gap: 14px; }
.stack { display: flex; flex-direction: column; gap: 14px; }
.stack-tight { display: flex; flex-direction: column; gap: 10px; }

.panel { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 16px; }
.panel h2 {
  font-family: 'Space Grotesk', sans-serif;
  font-size: 14px;
  font-weight: 600;
  margin: 0 0 12px;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--chalk);
}
.panel-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.panel-head h2 { margin: 0; }

.model-badge {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 10.5px;
  padding: 4px 8px;
  border-radius: 6px;
  border: 1px solid var(--line);
  color: var(--mute);
}
.model-badge-elite_mle { color: var(--green); border-color: rgba(61,220,132,0.4); }
.model-badge-shrinkage_baseline { color: var(--amber); border-color: rgba(255,176,32,0.4); }

.row-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px; }
@media (max-width: 480px) { .row-2 { grid-template-columns: 1fr; } }

.field {
  background: var(--panel-2);
  border: 1px solid var(--line);
  border-radius: 8px;
  color: var(--chalk);
  font-size: 13.5px;
  padding: 10px 11px;
  font-family: 'Inter', sans-serif;
  width: 100%;
}
.field:focus { outline: 1px solid var(--amber); }

.link-btn {
  background: none; border: none; color: var(--amber);
  font-size: 12.5px; cursor: pointer; padding: 0; margin: 2px 0 10px;
  font-family: 'Inter', sans-serif; font-weight: 600;
}

.odds-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px; }
@media (max-width: 480px) { .odds-grid { grid-template-columns: 1fr; } }
.odds-field { display: flex; flex-direction: column; gap: 5px; font-size: 11.5px; color: var(--mute); }

.btn-primary {
  width: 100%;
  background: var(--amber);
  color: var(--ink);
  border: none;
  border-radius: 8px;
  padding: 11px;
  font-weight: 700;
  font-size: 13.5px;
  cursor: pointer;
  font-family: 'Inter', sans-serif;
}
.btn-primary:disabled { opacity: 0.6; cursor: default; }

.error-text { color: var(--red); font-size: 12.5px; margin-top: 8px; }
.hint-text { color: var(--mute); font-size: 12px; margin-top: 8px; }
.empty-note { color: var(--mute); font-size: 13px; }

.hero-panel { text-align: center; }
.hero-matchup { font-family: 'Space Grotesk', sans-serif; font-size: 16px; margin-bottom: 12px; }
.vs { color: var(--mute); font-size: 12px; }
.hero-xg { display: flex; align-items: center; justify-content: center; gap: 18px; }
.xg-block { display: flex; flex-direction: column; align-items: center; gap: 2px; }
.xg-num { font-family: 'Space Grotesk', sans-serif; font-size: 34px; font-weight: 700; color: var(--amber); }
.xg-label { font-size: 11px; color: var(--mute); }
.xg-divider { font-size: 22px; color: var(--mute); }
.hero-note { font-size: 11.5px; color: var(--mute); margin: 12px 0 0; }

.ticker-row { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 2px; }
.ticker-row-compact { margin: 10px 0; }
.ticker-pill {
  flex-shrink: 0;
  background: var(--panel-2);
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 8px 12px;
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 110px;
}
.ticker-pill-small { padding: 6px 9px; min-width: 90px; }
.ticker-pill-best { border-color: rgba(255,176,32,0.5); background: rgba(255,176,32,0.08); }
.ticker-market { font-size: 11px; color: var(--mute); }
.ticker-prob { font-family: 'IBM Plex Mono', monospace; font-size: 15px; font-weight: 600; color: var(--chalk); }
.ticker-pill-best .ticker-prob { color: var(--amber); }

.market-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
@media (max-width: 480px) { .market-grid { grid-template-columns: repeat(2, 1fr); } }
.market-tile {
  background: var(--panel-2); border: 1px solid var(--line); border-radius: 8px;
  padding: 10px; display: flex; flex-direction: column; gap: 4px;
}
.market-tile-best { border-color: rgba(255,176,32,0.5); }
.market-label { font-size: 10.5px; color: var(--mute); text-transform: uppercase; letter-spacing: 0.02em; }
.market-value { font-family: 'IBM Plex Mono', monospace; font-size: 16px; font-weight: 600; }
.market-tile-best .market-value { color: var(--amber); }

.score-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
@media (max-width: 480px) { .score-grid { grid-template-columns: repeat(2, 1fr); } }
.score-cell {
  background: var(--panel-2); border: 1px solid var(--line); border-radius: 8px;
  padding: 10px; display: flex; flex-direction: column; align-items: center; gap: 3px;
}
.score-cell-best { border-color: rgba(255,176,32,0.5); background: rgba(255,176,32,0.08); }
.score-line { font-family: 'Space Grotesk', sans-serif; font-size: 18px; font-weight: 700; }
.score-prob { font-family: 'IBM Plex Mono', monospace; font-size: 12px; color: var(--mute); }
.score-odds { font-family: 'IBM Plex Mono', monospace; font-size: 11px; color: var(--mute); }

.value-row {
  display: flex; flex-wrap: wrap; align-items: center; gap: 10px;
  padding: 10px 12px; border-radius: 8px; border: 1px solid var(--line);
  margin-bottom: 8px; font-size: 12.5px;
}
.value-row-up { border-color: rgba(61,220,132,0.4); background: rgba(61,220,132,0.06); }
.value-row-down { border-color: var(--line); }
.value-market { font-weight: 600; }
.value-odds, .value-model, .value-devig { color: var(--mute); font-family: 'IBM Plex Mono', monospace; font-size: 11.5px; }
.value-edge { margin-left: auto; font-family: 'IBM Plex Mono', monospace; font-weight: 700; font-size: 12.5px; }
.edge-up { color: var(--green); }
.edge-down { color: var(--red); }

.fixture-card { background: var(--panel-2); border: 1px solid var(--line); border-radius: 10px; padding: 14px; }
.fixture-head { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; flex-wrap: wrap; }
.fixture-teams { font-family: 'Space Grotesk', sans-serif; font-weight: 600; font-size: 14.5px; }
.fixture-time { font-size: 11px; color: var(--mute); font-family: 'IBM Plex Mono', monospace; }
.fixture-xg { font-size: 12px; color: var(--mute); margin-top: 4px; }

.bookmaker-block { margin-top: 12px; border-top: 1px solid var(--line); padding-top: 10px; }
.bookmaker-block-head { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px; margin-bottom: 8px; font-size: 12.5px; }
.bookmaker-ticker { display: flex; gap: 6px; overflow-x: auto; }
.book-pill {
  flex-shrink: 0; display: flex; flex-direction: column; gap: 2px;
  background: var(--panel); border: 1px solid var(--line); border-radius: 7px; padding: 6px 10px;
}
.book-pill-best { border-color: rgba(61,220,132,0.5); background: rgba(61,220,132,0.08); }
.book-name { font-size: 10px; color: var(--mute); text-transform: capitalize; }
.book-odds { font-family: 'IBM Plex Mono', monospace; font-size: 13px; font-weight: 600; }
.book-pill-best .book-odds { color: var(--green); }

.recent-row {
  display: flex; justify-content: space-between; padding: 9px 0;
  border-bottom: 1px solid var(--line); font-size: 13px;
}
.recent-row:last-child { border-bottom: none; }
`;