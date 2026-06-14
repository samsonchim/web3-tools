import { simulate } from "../lib/simulate";

// Real mainnet swaps found live on the fork.
const V2_HASH =
  "0xa0dfd500c9f1eae16f6e8a84e0a5488c75f18811e44509f9304d6cfa0989dfe8" as const; // swapExactETHForTokens
const V3_HASH =
  "0xb83d8ac2b4c1fa109bf87643d122e1ac3da88d0bd54649eedd065134328556ed" as const; // SwapRouter02 exactInputSingle

// Pick the case via CLI arg: `tsx smoke.ts v3` (defaults to v2).
const HASH = process.argv[2] === "v3" ? V3_HASH : V2_HASH;

const bigintReplacer = (_k: string, v: unknown) =>
  typeof v === "bigint" ? v.toString() : v;

async function main() {
  console.log("→ simulating", HASH);
  const res = await simulate(HASH, {
    gasGwei: 1, // override gas price
    slippageBps: 10, // 0.10% slippage
    blockDelay: 3, // execute 3 blocks later
  });
  console.log(JSON.stringify(res, bigintReplacer, 2));
}

main().catch((e) => {
  console.error("SMOKE FAILED:", e);
  process.exit(1);
});
