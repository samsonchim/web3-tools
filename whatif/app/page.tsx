"use client";

import { useState } from "react";
import type { RunResult, SimResponse } from "@/lib/simulate";

function deltaClass(v: string) {
  if (v.startsWith("+")) return "delta-pos";
  if (v.startsWith("-")) return "delta-neg";
  return "";
}

function Pane({ run }: { run: RunResult }) {
  return (
    <div className="pane card">
      <h3>
        {run.label}
        <span className={`pill ${run.status === "success" ? "ok" : "bad"}`}>
          {run.status}
        </span>
      </h3>
      <div className="kv">
        <span>block</span>
        <span>{run.targetBlock}</span>
      </div>
      <div className="kv">
        <span>gas used</span>
        <span>{Number(run.gasUsed).toLocaleString()}</span>
      </div>
      <div className="kv">
        <span>gas price</span>
        <span>{Number(run.gasPriceGwei).toFixed(2)} gwei</span>
      </div>
      <div className="kv">
        <span>gas cost</span>
        <span>{Number(run.gasCostEth).toFixed(6)} ETH</span>
      </div>
      <div className="kv">
        <span>ETH balance Δ</span>
        <span className={deltaClass(run.ethDelta)}>{run.ethDelta}</span>
      </div>
      {run.tokens.map((t) => (
        <div className="kv" key={t.token}>
          <span>{t.symbol} Δ</span>
          <span className={deltaClass(t.delta)}>{t.delta}</span>
        </div>
      ))}
      {run.notes.length > 0 && (
        <div className="notes">{run.notes.map((n, i) => <div key={i}>• {n}</div>)}</div>
      )}
      {run.error && <div className="error">{run.error}</div>}
    </div>
  );
}

const SAMPLE = "0x";

export default function Home() {
  const [hash, setHash] = useState("");
  const [gasGwei, setGasGwei] = useState("");
  const [slippageBps, setSlippageBps] = useState("");
  const [blockDelay, setBlockDelay] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SimResponse | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/simulate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ hash, gasGwei, slippageBps, blockDelay }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Simulation failed.");
      setResult(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="wrap">
      <div className="tag">git diff — but for blockchain transactions</div>
      <h1>Transaction What-If Simulator</h1>
      <p className="sub">
        Paste a mainnet tx hash, change the rules, and replay it on a local Anvil fork.
      </p>

      <div className="card">
        <label>Transaction hash</label>
        <input
          placeholder="0x…"
          value={hash}
          onChange={(e) => setHash(e.target.value.trim())}
        />
        <div className="grid3">
          <div>
            <label>Gas price (gwei)</label>
            <input placeholder="unchanged" value={gasGwei} onChange={(e) => setGasGwei(e.target.value)} />
          </div>
          <div>
            <label>Slippage (bps)</label>
            <input placeholder="e.g. 10 = 0.1%" value={slippageBps} onChange={(e) => setSlippageBps(e.target.value)} />
          </div>
          <div>
            <label>Block delay</label>
            <input placeholder="e.g. 10" value={blockDelay} onChange={(e) => setBlockDelay(e.target.value)} />
          </div>
        </div>
        <button onClick={run} disabled={loading || hash.length !== 66}>
          {loading ? "Forking & replaying…" : "Simulate"}
        </button>
        {error && <div className="error">{error}</div>}
      </div>

      {result && (
        <>
          <div className="meta">
            from {result.meta.from} → to {result.meta.to}
            <br />
            original block {result.meta.block} · swap detected:{" "}
            {result.meta.swapDetected ? "yes (V2)" : "no"}
          </div>
          <div className="diff">
            <Pane run={result.baseline} />
            <Pane run={result.modified} />
          </div>
        </>
      )}
    </div>
  );
}
