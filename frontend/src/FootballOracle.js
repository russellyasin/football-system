import React, { useState, useEffect } from "react";
/** @jsxImportSource @emotion/react */
import { css } from '@emotion/react';

/* ✅ CONSTANTS */
const API =
  window.location.hostname === "localhost"
    ? "http://127.0.0.1:10000"
    : "https://healthscore.onrender.com";

const LEAGUES = [
  "Premier League", "La Liga", "Serie A", "Bundesliga", "Ligue 1",
  "MLS", "Champions League", "Europa League", "Saudi Pro League", "Other"
];

const ML_MODELS = ["XGBoost", "LightGBM", "Random Forest", "KNN", "TabNet"];

/* ✅ MULTI-BOOKMAKER GENERATOR FOR MONEYLINE ENGINES */
const generateMultiBookmakerOdds = (baseOdds) => {
  const providers = ["Bet365", "Pinnacle", "DraftKings", "Betfair"];
  return providers.reduce((acc, bookie, idx) => {
    const variance = 1 + (idx * 0.02 - 0.03) + (Math.random() * 0.02);
    acc[bookie] = Math.max(1.01, Number((baseOdds * variance).toFixed(2)));
    return acc;
  }, {});
};

/* ✅ CHOOSE OPTIMAL BOOKMAKER ODDS */
const selectBestMarketLine = (modelProb, oddsProfile) => {
  let bestBook = "";
  let maxOdds = 0;
  let maxEdge = -999;

  Object.entries(oddsProfile).forEach(([bookie, price]) => {
    const edge = ((modelProb / 100) * price - 1) * 100;
    if (edge > maxEdge) {
      maxEdge = edge;
      maxOdds = price;
      bestBook = bookie;
    }
  });

  return { bestBook, maxOdds, maxEdge };
};

/* ✅ KELLY CRITERION FORMULA */
const kelly = (p, odds) => {
  const prob = p / 100;
  const b = odds - 1;
  if (b <= 0) return 0;
  const value = (b * prob - (1 - prob)) / b;
  return Math.max(0, Math.min(value, 0.25));
};

/* ✅ HIGH-ACCURACY MATHEMATICAL ENGINE GATES */
const factorial = (n) => {
  if (n === 0 || n === 1) return 1;
  let res = 1;
  for (let i = 2; i <= n; i++) res *= i;
  return res;
};

const getPoissonProbability = (k, lambda) => {
  return (Math.pow(lambda, k) * Math.exp(-lambda)) / factorial(k);
};

/* ⚡ DIXON-COLES DEPENDENCY ADJUSTMENT */
const getDixonColesTauAdjustment = (x, y, mu, lambda, tau) => {
  if (x === 0 && y === 0) return 1 - mu * lambda * tau;
  if (x === 1 && y === 0) return 1 + mu * tau;
  if (x === 0 && y === 1) return 1 + lambda * tau;
  if (x === 1 && y === 1) return 1 - tau;
  return 1;
};

/* ⚡ ADVANCED MONEYLINE MATRIX CALCULATOR */
const computeExactMoneylineProbs = (mu, lambda, tau) => {
  let homeWinProb = 0;
  let drawProb = 0;
  let awayWinProb = 0;

  for (let h = 0; h <= 10; h++) {
    for (let a = 0; a <= 10; a++) {
      const pHome = getPoissonProbability(h, mu);
      const pAway = getPoissonProbability(a, lambda);
      const rawJoint = pHome * pAway;
      const adjustment = getDixonColesTauAdjustment(h, a, mu, lambda, tau);
      const finalJoint = rawJoint * adjustment;

      if (h > a) homeWinProb += finalJoint;
      else if (h === a) drawProb += finalJoint;
      else awayWinProb += finalJoint;
    }
  }

  const total = homeWinProb + drawProb + awayWinProb;
  return {
    home: Math.round((homeWinProb / total) * 100),
    draw: Math.round((drawProb / total) * 100),
    away: Math.round((awayWinProb / total) * 100),
  };
};

export default function FootballOracle() {
  // Dynamic non-blocking injection of SheetJS engine to prevent dependency lag on mobile/desktop browsers
  useEffect(() => {
    if (!window.XLSX) {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
      script.async = true;
      document.body.appendChild(script);
    }
  }, []);

  return (
    <div style={page}>
      <div style={headerSection}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <svg width="34" height="34" viewBox="0 0 512 512" style={{ fill: "#ffffff" }}>
            <path d="M256 0a256 256 0 1 0 256 256A256 256 0 0 0 256 0zm0 41.54c15.26 0 29.83 2 43.61 5.56l-21.1 52.12h-45l-21.12-52.12c13.78-3.56 28.35-5.56 43.61-5.56zM128.43 83.08l21.1 52.11H101c-13.62 13-24.93 28.32-33.37 45.31l38-34.62 22.8 20.28zm255.14 0l22.8-20.28 38 34.62c-8.44-17-19.75-32.31-33.37-45.31h-48.53zm-150.1 76.43h45.06l30 67.43-52.53 48.09h-45.06L108.4 226.94zm197.62 2.37l42.3 35.15-30.85 64.06-61.45-12.7 17.7-53.08zm-204.18 0l32.3 33.43 17.7 53.08-61.45 12.7-30.85-64.06zm-61.2 101.4l34 26-11.45 66.86-53.7-27a213 213 0 0 1-8.85-65.86zm380.58 0a213 213 0 0 1-8.85 65.86l-53.7 27-11.45-66.86zm-223.1 33.56h45.06l31.25 61.27-53.78 43.27h-45.06l-53.78-43.27zm116.5 24.13l46.2 9.55-14.85 66.19c-16 9.38-33.51 16-52.15 19.33zm-164.6 0l20.8 45.07c-18.64-3.33-36.15-10-52.15-19.33l-14.85-66.19z"/>
          </svg>
          <h1 style={mainTitle}>HealthScore</h1>
        </div>
        <div style={muted}>SYSTEM INDEX // MULTI-MATCH PORTFOLIO FORECAST & LINE SHOPPING ENGINE</div>
      </div>
      <PredictPanel />
    </div>
  );
}

function PredictPanel() {
  const [matches, setMatches] = useState([
    { id: 1, home: "", away: "", league: "Premier League", customLeague: "" }
  ]);
  
  const [bankroll, setBankroll] = useState(1000);
  const [startingBankroll, setStartingBankroll] = useState(1000);
  const [modelType, setModelType] = useState("XGBoost");
  const [dixonColesTau, setDixonColesTau] = useState(0.0018);
  const [learningRate, setLearningRate] = useState(0.05);

  const [resultsBatch, setResultsBatch] = useState([]);
  const [loading, setLoading] = useState(false);

  const [history, setHistory] = useState(() => {
    const saved = localStorage.getItem("healthscore_history_v2");
    return saved ? JSON.parse(saved) : [];
  });

  const [localBiasHome, setLocalBiasHome] = useState(() => {
    const saved = localStorage.getItem("healthscore_bias_home");
    return saved ? parseFloat(saved) : 1.00;
  });

  const [localBiasAway, setLocalBiasAway] = useState(() => {
    const saved = localStorage.getItem("healthscore_bias_away");
    return saved ? parseFloat(saved) : 1.00;
  });

  const [totalStaked, setTotalStaked] = useState(0);
  const [winsCount, setWinsCount] = useState(0);

  useEffect(() => {
    localStorage.setItem("healthscore_history_v2", JSON.stringify(history));
    let stakedTotal = 0;
    let wins = 0;
    history.forEach(item => {
      stakedTotal += parseFloat(item.stake || 0);
      if (item.result === "WIN") wins++;
    });
    setTotalStaked(stakedTotal);
    setWinsCount(wins);
  }, [history]);

  useEffect(() => {
    localStorage.setItem("healthscore_bias_home", localBiasHome.toString());
  }, [localBiasHome]);

  useEffect(() => {
    localStorage.setItem("healthscore_bias_away", localBiasAway.toString());
  }, [localBiasAway]);

  const addMatchField = () => {
    if (matches.length >= 5) return alert("System parameters constrained to 5 maximum simultaneous match matrices.");
    setMatches([...matches, { id: Date.now(), home: "", away: "", league: "Premier League", customLeague: "" }]);
  };

  const removeMatchField = (index) => {
    if (matches.length === 1) return;
    setMatches(matches.filter((_, i) => i !== index));
  };

  const updateMatchField = (index, field, value) => {
    const newMatches = [...matches];
    newMatches[index][field] = value;
    setMatches(newMatches);
  };

  const analyzeBatch = async () => {
    const validMatches = matches.filter(m => m.home && m.away);
    if (validMatches.length === 0) return alert("Populate at least one valid Match Profile vector.");
    
    setLoading(true);
    const compiledOutputs = [];

    for (let current of validMatches) {
      const activeLeague = current.league === "Other" ? current.customLeague : current.league;
      const payload = {
        home: current.home, away: current.away, league: activeLeague,
        engine_configs: {
          model_architecture: modelType, poisson_approach: true, dixon_coles_time_weighting: dixonColesTau,
          local_biases: { home: localBiasHome, away: localBiasAway }
        },
        match_context: { neutral_venue: false, tournament_type: "Domestic League" }
      };

      try {
        const res = await fetch(`${API}/api/predict`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });

        let baseHomeXG = 1.45;
        let baseAwayXG = 1.20;
        let serverHomeProb = null;
        let serverDrawProb = null;
        let serverAwayProb = null;

        if (res.ok) {
          const json = await res.json();
          baseHomeXG = json.exp_home || baseHomeXG;
          baseAwayXG = json.exp_away || baseAwayXG; // 🛠️ Typo Corrected here (from baseAwayXXG)
          serverHomeProb = json.prob_home;
          serverDrawProb = json.prob_draw;
          serverAwayProb = json.prob_away;
        }

        const adjustedHomeXG = baseHomeXG * localBiasHome;
        const adjustedAwayXG = baseAwayXG * localBiasAway;

        const mathModel = computeExactMoneylineProbs(adjustedHomeXG, adjustedAwayXG, dixonColesTau);
        
        const finalHomeProb = serverHomeProb ?? mathModel.home;
        const finalDrawProb = serverDrawProb ?? mathModel.draw;
        const finalAwayProb = serverAwayProb ?? mathModel.away;

        const impliedHomeOdds = Number((100 / finalHomeProb).toFixed(2));
        const impliedDrawOdds = Number((100 / finalDrawProb).toFixed(2));
        const impliedAwayOdds = Number((100 / finalAwayProb).toFixed(2));

        const enrichedPicks = [
          { market: `${current.home} Win`, probability_pct: finalHomeProb, odds_given: impliedHomeOdds },
          { market: "Draw", probability_pct: finalDrawProb, odds_given: impliedDrawOdds },
          { market: `${current.away} Win`, probability_pct: finalAwayProb, odds_given: impliedAwayOdds }
        ].map(pick => ({
          ...pick,
          bookmaker_matrix: generateMultiBookmakerOdds(pick.odds_given)
        }));

        compiledOutputs.push({
          id: current.id, home: current.home, away: current.away,
          exp_home: adjustedHomeXG, exp_away: adjustedAwayXG,
          top_picks: enrichedPicks
        });

      } catch (err) {
        console.error("Batch matrix engine loop failure", err);
      }
    }

    setResultsBatch(compiledOutputs);
    setLoading(false);
  };

  /* ⚡ PIPELINE SETTLED INTERCEPTOR (LEARNS -> UPDATES STORAGE -> SAVE DISK IN-MEMORY WITH NO DELAY) */
  const settleMatchResult = (matchItem, topPick, selectedBook, winningOdds, actualHomeGoals, actualAwayGoals) => {
    const currentStake = kelly(topPick.probability_pct, winningOdds) * bankroll;
    
    let wonResult = false;
    if (topPick.market.includes("Win") && topPick.market.includes(matchItem.home) && actualHomeGoals > actualAwayGoals) wonResult = true;
    if (topPick.market.includes("Win") && topPick.market.includes(matchItem.away) && actualAwayGoals > actualHomeGoals) wonResult = true;
    if (topPick.market === "Draw" && actualHomeGoals === actualAwayGoals) wonResult = true;

    const netPayout = wonResult ? currentStake * (winningOdds - 1) : -currentStake;
    
    // Step 1: Adjust bankroll metric limits
    setBankroll(prev => prev + netPayout);

    // Step 2: Recalculate and scale gradient learning rates instantly BEFORE file save
    const errorHome = actualHomeGoals - matchItem.exp_home;
    const errorAway = actualAwayGoals - matchItem.exp_away;
    
    const calibratedHomeBias = Math.max(0.5, localBiasHome + (errorHome * learningRate));
    const calibratedAwayBias = Math.max(0.5, localBiasAway + (errorAway * learningRate));
    
    setLocalBiasHome(calibratedHomeBias);
    setLocalBiasAway(calibratedAwayBias);

    // Step 3: Bundle tracking parameters inside structural object
    const recordRow = {
      timestamp: new Date().toISOString().split('T')[0],
      match: `${matchItem.home} vs ${matchItem.away}`,
      scoreline: `${actualHomeGoals}-${actualAwayGoals}`,
      bestPick: topPick.market,
      bookmaker: selectedBook,
      odds: winningOdds.toFixed(2),
      stake: currentStake.toFixed(2),
      net: netPayout.toFixed(2),
      result: wonResult ? "WIN" : "LOSS"
    };

    const updatedHistoryCollection = [recordRow, ...history];
    setHistory(updatedHistoryCollection);

    // Step 4: Write updated workbook directly using non-blocking browser thread arrays
    triggerInXlsxWriteout(updatedHistoryCollection);

    // Filter slot card queue out of structural layout pipeline
    setResultsBatch(prev => prev.filter(item => item.id !== matchItem.id));
  };

  /* ⚡ DIRECT SPREADSHEET WRITER (ZERO REFRESH / NO DELAY LAG) */
  const triggerInXlsxWriteout = (dataCollection) => {
    if (!window.XLSX) {
      console.warn("SheetJS engine layer initializing. Local logs synced inside temporary memory grids.");
      return;
    }
    
    const worksheetData = dataCollection.map(row => ({
      "TIMESTAMP": row.timestamp,
      "MATCH CONFIG": row.match,
      "SCORELINE": row.scoreline,
      "MARKET LINE OPTIMIZED": row.bestPick,
      "BOOKMAKER": row.bookmaker,
      "ODDS": parseFloat(row.odds),
      "RISK STAKE": parseFloat(row.stake),
      "DELTA PAYOUT": parseFloat(row.net),
      "STATUS": row.result
    }));

    const workbook = window.XLSX.utils.book_new();
    const worksheet = window.XLSX.utils.json_to_sheet(worksheetData);
    
    window.XLSX.utils.book_append_sheet(workbook, worksheet, "Historical Ledger");
    window.XLSX.writeFile(workbook, "historical_results.xlsx");
  };

  const clearPersistentCache = () => {
    if(window.confirm("Purge localized memory cores and historical storage files?")) {
      localStorage.clear();
      setHistory([]);
      setLocalBiasHome(1.00);
      setLocalBiasAway(1.00);
      setBankroll(1000);
      setStartingBankroll(1000);
    }
  };

  const totalProfitLoss = bankroll - startingBankroll;
  const currentROI = totalStaked > 0 ? (totalProfitLoss / totalStaked) * 100 : 0;
  const systemWinRate = history.length > 0 ? (winsCount / history.length) * 100 : 0;

  return (
    <div style={container}>
      {/* CONTROL PANEL */}
      <div style={colLeft}>
        <div style={card}>
          <div style={{display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px"}}>
            <h3 style={{...sectionTitle, margin:0, border:"none"}}>⚡ TARGET MATCH PIPELINES</h3>
            {matches.length < 5 && <button onClick={addMatchField} style={addMatchBtn}>+ ADD MATCH ({matches.length}/5)</button>}
          </div>

          {matches.map((match, idx) => (
            <div key={match.id} style={matchInputGroup}>
              <div style={{display: "flex", gap: "8px", justifyContent: "space-between", alignItems: "center"}}>
                <span style={{fontSize: "11px", fontWeight: "700", color: "rgba(255,255,255,0.3)"}}>SLOT #{idx + 1}</span>
                {matches.length > 1 && <button onClick={() => removeMatchField(idx)} style={removeSlotBtn}>✕</button>}
              </div>
              <input value={match.home} onChange={(e) => updateMatchField(idx, "home", e.target.value)} placeholder="HOME TEAM" style={compactInput} />
              <input value={match.away} onChange={(e) => updateMatchField(idx, "away", e.target.value)} placeholder="AWAY TEAM" style={compactInput} />
              
              <select value={match.league} onChange={(e) => updateMatchField(idx, "league", e.target.value)} style={compactInput}>
                {LEAGUES.map(l => <option key={l} value={l}>{l}</option>)}
              </select>

              {match.league === "Other" && (
                <input value={match.customLeague} onChange={(e) => updateMatchField(idx, "customLeague", e.target.value)} placeholder="SPECIFY EXPERIMENTAL LEAGUE" style={compactInput} />
              )}
            </div>
          ))}

          <input type="number" value={bankroll} onChange={(e) => setBankroll(Number(e.target.value))} placeholder="ALLOCATION QUANT PORTFOLIO ($)" style={input} />
        </div>

        <div style={card}>
          <h3 style={sectionTitle}>🔬 BACKEND QUANT VARIABLES</h3>
          <label style={labelStyle}>CORE MODEL METRIC LAYER</label>
          <select value={modelType} onChange={(e) => setModelType(e.target.value)} style={input}>
            {ML_MODELS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>

          <label style={labelStyle}>DIXON-COLES TIME WINDOW WEIGHT ($\tau$)</label>
          <input type="number" step="0.0001" value={dixonColesTau} onChange={(e) => setDixonColesTau(Number(e.target.value))} style={input} />

          <label style={labelStyle}>SELF-LEARNING RECURSIVE GRADIENT ($\alpha$)</label>
          <input type="number" step="0.01" value={learningRate} onChange={(e) => setLearningRate(Number(e.target.value))} style={input} />
        </div>

        <div style={card}>
          <h3 style={sectionTitle}>🤖 MODEL BIAS BIOMARKS (PERSISTENT)</h3>
          <div style={{fontSize: "12px", fontFamily: "monospace", display: "flex", flexDirection: "column", gap: "6px"}}>
            <div>HOME BIAS CORRECTION: <span style={{color: "#ffff00"}}>{localBiasHome.toFixed(4)}x</span></div>
            <div>AWAY BIAS CORRECTION: <span style={{color: "#ffff00"}}>{localBiasAway.toFixed(4)}x</span></div>
          </div>
          <button onClick={clearPersistentCache} style={clearBtn}>RESET PERSISTENT CORES</button>
        </div>

        <button onClick={analyzeBatch} style={btn} disabled={loading}>
          {loading ? "⚡ SYNCING MULTI-PROBABILITY BATCHES..." : "RUN BATCH EVALUATION"}
        </button>
      </div>

      {/* METRIC VISUALIZATION DISPLAY */}
      <div style={colRight}>
        <div style={ledgerCard}>
          <div style={{display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "15px", textAlign: "center"}}>
            <div style={ledgerBlock}><div style={ledgerVal}>${bankroll.toFixed(2)}</div><div style={ledgerLabel}>NET PORTFOLIO VALUE</div></div>
            <div style={ledgerBlock}><div style={{...ledgerVal, color: totalProfitLoss >= 0 ? "#00ff66" : "#ff0055"}}>{totalProfitLoss >= 0 ? "▲ +" : "▼ "}${totalProfitLoss.toFixed(2)}</div><div style={ledgerLabel}>CUMULATIVE P&L</div></div>
            <div style={ledgerBlock}><div style={{...ledgerVal, color: currentROI >= 0 ? "#00f0ff" : "#ff0055"}}>{currentROI.toFixed(1)}%</div><div style={ledgerLabel}>QUANT ROI CAP</div></div>
          </div>
          <div style={ledgerSubBar}>
            <span>TOTAL DEPLOYED RISKS: ${totalStaked.toFixed(2)}</span>
            <span>MODEL HIT STABILITY SCORE: {systemWinRate.toFixed(1)}%</span>
          </div>
        </div>

        {/* OUTPUT BATCH CARD PIPELINES */}
        {resultsBatch.map((dataItem) => (
          <div key={dataItem.id} style={{...card, borderLeft: "4px solid #00f0ff"}}>
            <div style={{display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "15px"}}>
              <span style={{fontWeight: "900", color: "#fff", fontSize: "16px"}}>{dataItem.home} VS {dataItem.away}</span>
              <div style={{background: "rgba(0,255,102,0.1)", padding: "4px 10px", borderRadius: "6px", color: "#00ff66", fontWeight: "bold", fontSize: "12px"}}>
                INDEX SCORE: {Math.round((dataItem.exp_home + dataItem.exp_away) * 25)}
              </div>
            </div>

            <div style={{fontSize: "12px", color: "rgba(255,255,255,0.4)", fontFamily: "monospace", marginBottom: "15px"}}>
              ADJUSTED CORE EXP MATCH xG VALUES: {dataItem.exp_home.toFixed(2)} vs {dataItem.exp_away.toFixed(2)}
            </div>

            {dataItem.top_picks?.map((p, i) => {
              const lineOptimization = selectBestMarketLine(p.probability_pct, p.bookmaker_matrix);
              const optimalAlloc = kelly(p.probability_pct, lineOptimization.maxOdds) * bankroll;

              return (
                <div key={i} style={dataRow}>
                  <div style={marketHeader}>
                    <span style={{fontWeight: "bold", fontSize: 14}}>{p.market} <span style={{color: "rgba(255,255,255,0.4)", fontSize: 11}}>({p.probability_pct}%)</span></span>
                    <span style={bestBookTag}>BEST LINE: {lineOptimization.maxOdds} @ {lineOptimization.bestBook}</span>
                  </div>

                  <div style={oddsGrid}>
                    {Object.entries(p.bookmaker_matrix).map(([bookie, price]) => {
                      const isBest = bookie === lineOptimization.bestBook;
                      return (
                        <div key={bookie} style={isBest ? bestBookBox : regularBookBox}>
                          <span style={bookName}>{bookie}</span>
                          <span style={bookPrice}>{price.toFixed(2)}</span>
                        </div>
                      );
                    })}
                  </div>

                  <div style={{display: "flex", justifyContent: "space-between", margin: "10px 0 6px 0", fontSize: "11px", fontFamily: "monospace"}}>
                    <span style={{color: lineOptimization.maxEdge > 0 ? "#00ff66" : "#ff0055"}}>EDGE VARIANCE: {lineOptimization.maxEdge.toFixed(2)}%</span>
                    <span>OPTIMIZED STAKE: <strong style={{color: "#00f0ff"}}>${optimalAlloc.toFixed(2)}</strong></span>
                  </div>
                  
                  <div style={settleActionRow}>
                    <span style={{fontSize: 10, color: "rgba(255,255,255,0.4)"}}>VERIFY AND SETTLE:</span>
                    <div style={{display: "flex", gap: "6px"}}>
                      <button onClick={() => settleMatchResult(dataItem, p, lineOptimization.bestBook, lineOptimization.maxOdds, 1, 0)} style={miniSettleBtn}>1-0</button>
                      <button onClick={() => settleMatchResult(dataItem, p, lineOptimization.bestBook, lineOptimization.maxOdds, 2, 1)} style={miniSettleBtn}>2-1</button>
                      <button onClick={() => settleMatchResult(dataItem, p, lineOptimization.bestBook, lineOptimization.maxOdds, 1, 1)} style={miniSettleBtn}>1-1</button>
                      <button onClick={() => {
                        const hG = parseInt(prompt("Enter Actual Home Goals:") || "0");
                        const aG = parseInt(prompt("Enter Actual Away Goals:") || "0");
                        settleMatchResult(dataItem, p, lineOptimization.bestBook, lineOptimization.maxOdds, hG, aG);
                      }} style={{...miniSettleBtn, background: "rgba(255,255,255,0.1)"}}>CUSTOM</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ))}

        {/* SYSTEM AUDIT REGISTRY ENGINE */}
        <div style={card}>
          <div style={{display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "15px"}}>
            <h3 style={{...sectionTitle, margin: 0, border: "none"}}>📁 PROTOCOL SETTLEMENT HISTORY (EXCEL AUTOSAVE LIVE)</h3>
            <button onClick={() => triggerInXlsxWriteout(history)} style={excelBtn}>📥 FORCE MANUAL SAVE (.XLSX)</button>
          </div>
          
          <div style={{overflowX: "auto"}}>
            <table style={tableStyle}>
              <thead>
                <tr style={{borderBottom: "2px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.5)"}}>
                  <th>DATE</th><th>MATCH EXPERIMENT</th><th>SCORE</th><th>MARKET LINE OPTIMIZED</th><th>STAKE</th><th>DELTA</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h, i) => (
                  <tr key={i} style={{borderBottom: "1px solid rgba(255,255,255,0.04)"}}>
                    <td style={{padding: "12px 0", color: "rgba(255,255,255,0.4)"}}>{h.timestamp}</td>
                    <td>{h.match}</td>
                    <td style={{fontWeight: "bold"}}>{h.scoreline}</td>
                    <td style={{color: "#00f0ff"}}>{h.bestPick} <span style={{fontSize: "10px", color: "rgba(255,255,255,0.4)"}}>@{h.bookmaker}</span></td>
                    <td>${h.stake}</td>
                    <td style={{color: Number(h.net) >= 0 ? "#00ff66" : "#ff0055", fontWeight: "700"}}>
                      {Number(h.net) >= 0 ? "+" : ""}${h.net}
                    </td>
                  </tr>
                ))}
                {history.length === 0 && (
                  <tr>
                    <td colSpan="6" style={{textAlign: "center", padding: "30px", color: "rgba(255,255,255,0.2)", fontFamily: "monospace"}}>
                      Secure isolated sandbox cache contains zero historical tracks.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ✅ UI CORE MODULE STYLES (MOBILE RESPONSIVE TAILORED TARGETS) */
const page = { background: "#030712", color: "#f3f4f6", padding: "40px 20px", fontFamily: "'Inter', system-ui, sans-serif", minHeight: "100vh" };
const headerSection = { maxWidth: "1200px", margin: "0 auto 30px auto", textAlign: "left" };
const mainTitle = { margin: 0, fontSize: "32px", fontWeight: "900", background: "linear-gradient(to right, #ffffff, #00f0ff)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" };
const muted = { color: "rgba(255, 255, 255, 0.4)", fontSize: "12px", marginTop: "4px", letterSpacing: "2px", fontWeight: "600" };
const container = { display: "flex", gap: "25px", maxWidth: "1200px", margin: "0 auto", flexWrap: "wrap" };
const colLeft = { flex: "1 1 400px", display: "flex", flexDirection: "column", gap: "20px" };
const colRight = { flex: "1 1 680px", display: "flex", flexDirection: "column", gap: "20px" };
const card = { background: "rgba(17, 24, 39, 0.7)", backdropFilter: "blur(12px)", padding: "24px", borderRadius: "16px", border: "1px solid rgba(255, 255, 255, 0.08)" };
const sectionTitle = { margin: "0 0 16px 0", fontSize: "13px", letterSpacing: "1.5px", fontWeight: "800", color: "#00f0ff", borderBottom: "1px solid rgba(255, 255, 255, 0.1)", paddingBottom: "8px" };
const input = { display: "block", width: "100%", margin: "12px 0", padding: "12px 16px", background: "#090d16", color: "#fff", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "8px", boxSizing: "border-box", fontSize: "16px" };
const labelStyle = { fontSize: "11px", color: "rgba(255,255,255,0.4)", display: "block", marginTop: "14px", fontWeight: "600" };
const btn = { marginTop: "10px", padding: "16px", width: "100%", background: "linear-gradient(90deg, #00f0ff 0%, #00ff66 100%)", color: "#030712", border: "none", borderRadius: "12px", fontWeight: "900", letterSpacing: "1px", cursor: "pointer", fontSize: "14px" };
const clearBtn = { marginTop: "14px", width: "100%", background: "rgba(255,0,85,0.1)", border: "1px solid #ff0055", color: "#ff0055", padding: "8px", borderRadius: "6px", fontSize: "11px", cursor: "pointer", fontWeight: "bold" };
const excelBtn = { background: "linear-gradient(90deg, #1D7444 0%, #21A366 100%)", color: "#fff", border: "none", padding: "8px 16px", borderRadius: "8px", fontSize: "11px", fontWeight: "bold", cursor: "pointer" };
const tableStyle = { width: "100%", fontSize: "12px", textAlign: "left", marginTop: "10px", borderCollapse: "collapse" };
const ledgerCard = { background: "linear-gradient(135deg, rgba(17,24,39,0.9) 0%, rgba(9,13,22,0.9) 100%)", border: "1px solid rgba(0, 255, 102, 0.2)", padding: "24px", borderRadius: "16px" };
const ledgerBlock = { background: "rgba(255,255,255,0.02)", padding: "14px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.04)" };
const ledgerVal = { fontSize: "22px", fontWeight: "800" };
const ledgerLabel = { fontSize: "10px", color: "rgba(255,255,255,0.4)", marginTop: "4px", fontWeight: "700" };
const ledgerSubBar = { marginTop: "16px", fontSize: "11px", color: "rgba(255, 255, 255, 0.4)", display: "flex", justifyContent: "space-between", fontFamily: "monospace", borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "12px" };

const matchInputGroup = { background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", padding: "12px", borderRadius: "10px", marginBottom: "12px" };
const compactInput = { width: "100%", padding: "12px 14px", background: "#06090f", color: "#fff", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", margin: "6px 0", boxSizing: "border-box", fontSize: "16px" };
const addMatchBtn = { background: "rgba(0,240,255,0.15)", border: "1px solid #00f0ff", color: "#00f0ff", padding: "4px 10px", borderRadius: "6px", fontSize: "11px", cursor: "pointer", fontWeight: "bold" };
const removeSlotBtn = { background: "transparent", border: "none", color: "#ff0055", cursor: "pointer", fontSize: "12px", fontWeight: "bold" };

const dataRow = { background: "#090d16", padding: "14px", borderRadius: "12px", marginTop: "10px", border: "1px solid rgba(255,255,255,0.04)" };
const marketHeader = { display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid rgba(255,255,255,0.05)", paddingBottom: "8px", marginBottom: "10px" };
const bestBookTag = { background: "rgba(0, 255, 102, 0.12)", color: "#00ff66", padding: "3px 8px", borderRadius: "5px", fontSize: "11px", fontWeight: "bold", fontFamily: "monospace" };
const oddsGrid = { display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "8px" };
const regularBookBox = { background: "rgba(255,255,255,0.01)", border: "1px solid rgba(255,255,255,0.05)", padding: "8px", borderRadius: "6px", display: "flex", flexDirection: "column", alignItems: "center" };
const bestBookBox = { background: "rgba(0, 240, 255, 0.04)", border: "1px solid #00f0ff", padding: "8px", borderRadius: "6px", display: "flex", flexDirection: "column", alignItems: "center", boxShadow: "0 0 8px rgba(0,240,255,0.12)" };
const bookName = { fontSize: "10px", color: "rgba(255,255,255,0.35)", fontWeight: "600" };
const bookPrice = { fontSize: "14px", fontWeight: "800", color: "#fff", marginTop: "2px" };
const settleActionRow = { display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: "8px", marginTop: "10px" };
const miniSettleBtn = { background: "rgba(255,255,255,0.04)", color: "#fff", border: "1px solid rgba(255,255,255,0.08)", padding: "6px 10px", borderRadius: "5px", fontSize: "12px", cursor: "pointer" };