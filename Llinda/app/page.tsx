"use client";

import { useState } from "react";
import type { Diagnosis } from "@/lib/diagnose";

export default function Home() {
  const [hash, setHash] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Diagnosis | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/diagnose", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ hash }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Diagnosis failed.");
      setResult(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="wrap">
      <div className="brand">
        <h1>Llinda</h1>
        <span className="why">why did my transaction fail?</span>
      </div>
      <p className="sub">Paste a failed Ethereum tx hash. Get the real reason — in plain English.</p>

      <div className="card">
        <label>Transaction hash</label>
        <input placeholder="0x…" value={hash} onChange={(e) => setHash(e.target.value.trim())} />
        <button onClick={run} disabled={loading || hash.length !== 66}>
          {loading ? "Diagnosing…" : "Diagnose"}
        </button>
        {error && <div className="error">{error}</div>}
      </div>

      {result && (
        <div className="verdict card">
          <div className="head">
            <span className={`dot ${result.failed ? "fail" : "ok"}`} />
            <h2>{result.category.title}</h2>
          </div>

          <p className="english">{result.category.english}</p>

          <div className="fix">
            <b>How to fix:</b> {result.category.fix}
          </div>

          <div className="gasbar">
            <div className="track">
              <div className="fill" style={{ width: `${Math.min(100, result.meta.gasUsedPct)}%` }} />
            </div>
            <div className="lbl">
              gas used {Number(result.meta.gasUsed).toLocaleString()} /{" "}
              {Number(result.meta.gasLimit).toLocaleString()} ({result.meta.gasUsedPct}%)
            </div>
          </div>

          {result.reason && result.reason.kind !== "empty" && (
            <div className="raw">
              {result.reason.selector ? `${result.reason.selector}  ` : ""}
              {result.reason.text}
            </div>
          )}

          <details className="tech">
            <summary>Technical details</summary>
            <div className="kv"><span>from</span><span>{result.meta.from}</span></div>
            <div className="kv"><span>to</span><span>{result.meta.to ?? "—"}</span></div>
            <div className="kv"><span>block</span><span>{result.meta.block}</span></div>
            <div className="kv"><span>revert kind</span><span>{result.reason?.kind ?? "n/a"}</span></div>
            <div className="src">reason source: {result.source}</div>
          </details>
        </div>
      )}
    </div>
  );
}
