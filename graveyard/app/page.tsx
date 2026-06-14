"use client";

import { useState } from "react";
import type { Report } from "@/lib/types";

const fmtUsd = (n: number | null) =>
  n == null ? "—" : n >= 1 ? `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : `$${n.toFixed(2)}`;

export default function Home() {
  const [address, setAddress] = useState("");
  const [chain, setChain] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<Report | null>(null);

  async function run(addr = address) {
    if (!addr) return;
    setLoading(true);
    setError(null);
    setReport(null);
    try {
      const res = await fetch("/api/diagnose", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address: addr, chain: chain || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Lookup failed.");
      setReport(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="wrap">
      <div className="title">
        <span className="skull">🪦</span>
        <h1>NFT Graveyard</h1>
      </div>
      <p className="sub">Dead collections, abandoned DAOs, rug pulls & inactive protocols — given a proper burial.</p>

      <div className="card">
        <label>Contract or wallet address</label>
        <div className="controls">
          <input placeholder="0x… or Solana base58" value={address} onChange={(e) => setAddress(e.target.value.trim())} />
          <select value={chain} onChange={(e) => setChain(e.target.value)}>
            <option value="">Auto-detect</option>
            <option value="ethereum">Ethereum</option>
            <option value="solana">Solana</option>
          </select>
        </div>
        <button onClick={() => run()} disabled={loading || !address}>
          {loading ? "Exhuming…" : "Check the grave"}
        </button>
        {error && <div className="error">{error}</div>}
        <div className="examples">
          Try:{" "}
          <code onClick={() => { setAddress("0x06012c8cf97BEaD5deAe237070F9587f8E7A266d"); }}>
            CryptoKitties
          </code>{" "}
          ·{" "}
          <code onClick={() => { setAddress("0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D"); }}>
            BAYC
          </code>
        </div>
      </div>

      {report && (
        <>
          <div className="tomb">
            <div className="rip">R · I · P</div>
            <div className="badge">{report.status.emoji}</div>
            <div className="status">{report.status.title}</div>
            <div className="addr">{report.address}</div>
            <div className="epitaph">“{report.status.epitaph}”</div>
          </div>

          <div className="facts">
            <div className="fact">
              <div className="k">Last transaction</div>
              <div className="v big">{report.lastActivity.label}</div>
            </div>
            <div className="fact">
              <div className="k">Treasury remaining</div>
              <div className="v big">{fmtUsd(report.treasuryUsd)}</div>
            </div>
          </div>

          {report.status.causeOfDeath && (
            <div className="cause">
              <b>Cause of death:</b> {report.status.causeOfDeath}
            </div>
          )}

          {report.holdings.length > 0 && (
            <div className="card holdings">
              <label>Remains found in the wallet</label>
              {report.holdings.map((h) => (
                <div className="h" key={h.asset}>
                  <span>{h.amount} {h.asset}</span>
                  <span>{fmtUsd(h.usd)}</span>
                </div>
              ))}
            </div>
          )}

          {report.notes.length > 0 && (
            <div className="notes">{report.notes.map((n, i) => <div key={i}>• {n}</div>)}</div>
          )}
        </>
      )}
    </div>
  );
}
