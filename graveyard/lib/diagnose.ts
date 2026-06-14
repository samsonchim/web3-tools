import { isAddress } from "viem";
import { inspectEth } from "./eth";
import { inspectSolana } from "./solana";
import { classify, humanizeAge } from "./status";
import type { Chain, Report } from "./types";

const DAY = 86_400;

// Loose base58 check (Solana addresses are 32-44 base58 chars, no 0/O/I/l).
const isSolAddress = (a: string) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a);

export function detectChain(address: string): Chain | null {
  if (isAddress(address)) return "ethereum";
  if (isSolAddress(address)) return "solana";
  return null;
}

export async function diagnose(address: string, chain?: Chain): Promise<Report> {
  const resolved = chain ?? detectChain(address);
  if (!resolved) throw new Error("Unrecognized address — expected an EVM (0x…) or Solana base58 address.");

  const insp =
    resolved === "ethereum" ? await inspectEth(address) : await inspectSolana(address);

  const now = Math.floor(Date.now() / 1000);
  const daysAgo = insp.lastTs != null ? Math.floor((now - insp.lastTs) / DAY) : null;
  const status = classify(daysAgo, insp.treasuryUsd);

  return {
    chain: resolved,
    address,
    lastActivity: { ts: insp.lastTs, daysAgo, label: humanizeAge(daysAgo) },
    treasuryUsd: insp.treasuryUsd,
    holdings: insp.holdings,
    status,
    notes: insp.notes,
  };
}
