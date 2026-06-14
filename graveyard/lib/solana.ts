import { rpc, SOL_RPC } from "./clients";
import { getPrices } from "./prices";
import type { Holding } from "./types";

const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

type SigInfo = { blockTime?: number | null };
type Balance = { value: number };
type TokenAccounts = {
  value: { account: { data: { parsed: { info: { mint: string; tokenAmount: { uiAmount: number } } } } } }[];
};

export type SolInspection = {
  lastTs: number | null;
  treasuryUsd: number | null;
  holdings: Holding[];
  notes: string[];
};

export async function inspectSolana(address: string): Promise<SolInspection> {
  const notes: string[] = [];
  const prices = await getPrices();
  if (prices.stale) notes.push("price feed unavailable — USD values use fallback estimates");

  // Last activity: the most recent signature that touched this account.
  let lastTs: number | null = null;
  try {
    const sigs = await rpc<SigInfo[]>(SOL_RPC, "getSignaturesForAddress", [address, { limit: 1 }]);
    lastTs = sigs?.[0]?.blockTime ?? null;
  } catch (e) {
    notes.push(`signature lookup failed: ${(e as Error).message}`);
  }

  // Treasury: native SOL + any USDC token accounts.
  const holdings: Holding[] = [];
  let treasuryUsd = 0;

  try {
    const bal = await rpc<Balance>(SOL_RPC, "getBalance", [address]);
    const sol = (bal?.value ?? 0) / 1e9;
    const solUsd = sol * prices.sol;
    treasuryUsd += solUsd;
    if (sol > 0) holdings.push({ asset: "SOL", amount: sol.toFixed(4), usd: solUsd });
  } catch (e) {
    notes.push(`balance lookup failed: ${(e as Error).message}`);
  }

  try {
    const accs = await rpc<TokenAccounts>(SOL_RPC, "getTokenAccountsByOwner", [
      address,
      { mint: USDC_MINT },
      { encoding: "jsonParsed" },
    ]);
    let usdc = 0;
    for (const a of accs?.value ?? []) usdc += a.account.data.parsed.info.tokenAmount.uiAmount ?? 0;
    if (usdc > 0) {
      treasuryUsd += usdc;
      holdings.push({ asset: "USDC", amount: usdc.toFixed(2), usd: usdc });
    }
  } catch {
    // public RPC sometimes rejects getTokenAccountsByOwner — non-fatal.
    notes.push("token accounts unavailable (public RPC limits) — SOL only");
  }

  return { lastTs, treasuryUsd: holdings.length ? treasuryUsd : null, holdings, notes };
}
