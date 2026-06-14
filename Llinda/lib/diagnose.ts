import { BaseError, type Hex } from "viem";
import { client } from "./clients";
import { classify, decodeRevert, OUT_OF_GAS, type Category, type DecodedRevert } from "./errors";

export type Diagnosis = {
  hash: Hex;
  failed: boolean;
  category: Category;
  reason: DecodedRevert | null;
  source: "trace" | "replay" | "receipt" | "none";
  meta: {
    from: string;
    to: string | null;
    block: string;
    gasUsed: string;
    gasLimit: string;
    gasUsedPct: number;
  };
};

// ---- geth callTracer frame ------------------------------------------------

type CallFrame = {
  type: string;
  from: string;
  to?: string;
  input?: Hex;
  output?: Hex;
  error?: string;
  revertReason?: string;
  calls?: CallFrame[];
};

// Walk the call tree and return the deepest reverting frame — that's the actual
// origin of the failure (an inner call usually reverts before the outer one).
function deepestRevert(frame: CallFrame): CallFrame | null {
  for (const child of frame.calls ?? []) {
    const inner = deepestRevert(child);
    if (inner) return inner;
  }
  return frame.error ? frame : null;
}

async function traceRevert(hash: Hex): Promise<{ data?: Hex; reason?: string; oog: boolean }> {
  // debug_* isn't in viem's default RPC schema, so call the transport directly.
  const rpc = client.request as unknown as (a: {
    method: string;
    params: unknown[];
  }) => Promise<CallFrame>;
  const trace = await rpc({
    method: "debug_traceTransaction",
    params: [hash, { tracer: "callTracer" }],
  });

  const culprit = deepestRevert(trace) ?? trace;
  const oog = /out of gas/i.test(culprit.error ?? "") || /out of gas/i.test(trace.error ?? "");
  return { data: culprit.output, reason: culprit.revertReason, oog };
}

// Fallback for nodes without debug tracing: re-run the tx with eth_call at its
// block. viem throws a contract error carrying the revert data, which we mine.
async function replayRevert(tx: Awaited<ReturnType<typeof client.getTransaction>>): Promise<Hex | undefined> {
  try {
    await client.call({
      account: tx.from,
      to: tx.to ?? undefined,
      data: tx.input,
      value: tx.value,
      gas: tx.gas,
      blockNumber: tx.blockNumber ?? undefined,
    });
    return undefined; // replay didn't revert (state drifted) — no data to show
  } catch (err) {
    if (err instanceof BaseError) {
      const data = err.walk((e) => typeof (e as { data?: unknown }).data === "string");
      const hex = (data as { data?: Hex } | null)?.data;
      if (hex && hex !== "0x") return hex;
    }
    return undefined;
  }
}

export async function diagnose(hash: Hex): Promise<Diagnosis> {
  const [tx, receipt] = await Promise.all([
    client.getTransaction({ hash }),
    client.getTransactionReceipt({ hash }),
  ]);

  const gasUsedPct = Number(receipt.gasUsed) / Number(tx.gas);
  const meta = {
    from: tx.from,
    to: tx.to,
    block: (tx.blockNumber ?? 0n).toString(),
    gasUsed: receipt.gasUsed.toString(),
    gasLimit: tx.gas.toString(),
    gasUsedPct: Math.round(gasUsedPct * 1000) / 10,
  };

  if (receipt.status === "success") {
    return {
      hash,
      failed: false,
      category: {
        title: "This transaction succeeded",
        english: "It was mined and did not revert — nothing failed here.",
        fix: "If you expected a failure, double-check the hash.",
      },
      reason: null,
      source: "receipt",
      meta,
    };
  }

  // Failed: get the revert data, preferring a real trace, falling back to replay.
  let data: Hex | undefined;
  let traceReason: string | undefined;
  let oog = false;
  let source: Diagnosis["source"] = "none";

  try {
    const t = await traceRevert(hash);
    data = t.data;
    traceReason = t.reason;
    oog = t.oog;
    source = "trace";
  } catch {
    data = await replayRevert(tx);
    source = data ? "replay" : "none";
  }

  // Out of gas: the tracer says so, or the tx consumed ~all of its gas limit.
  if (oog || (!data && gasUsedPct > 0.97)) {
    return { hash, failed: true, category: OUT_OF_GAS, reason: null, source, meta };
  }

  const decoded = decodeRevert(data);
  // Prefer geth's already-decoded revert string when our decode came up empty.
  if (decoded.kind === "empty" && traceReason) {
    decoded.kind = "error-string";
    decoded.text = traceReason;
  }

  return { hash, failed: true, category: classify(decoded), reason: decoded, source, meta };
}
