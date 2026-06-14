import { diagnose, detectChain } from "../lib/diagnose";

// Usage: npm run smoke -- <address> [ethereum|solana]
// With no args, runs a couple of known examples.
const DEFAULTS = [
  "0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D", // BAYC (very alive — sanity check)
  "0x06012c8cf97BEaD5deAe237070F9587f8E7A266d", // CryptoKitties (old, slow)
];

async function one(addr: string) {
  const chain = detectChain(addr);
  const r = await diagnose(addr);
  console.log(`\n=== ${addr} (${chain}) ===`);
  console.log("last activity:", r.lastActivity.label);
  console.log("treasury     :", r.treasuryUsd == null ? "n/a" : `$${r.treasuryUsd.toFixed(2)}`);
  console.log("holdings     :", r.holdings.map((h) => `${h.amount} ${h.asset}`).join(", ") || "none");
  console.log("status       :", r.status.emoji, r.status.title);
  console.log("epitaph      :", r.status.epitaph);
  if (r.status.causeOfDeath) console.log("cause        :", r.status.causeOfDeath);
  if (r.notes.length) console.log("notes        :", r.notes.join(" | "));
}

async function main() {
  const arg = process.argv[2];
  const list = arg ? [arg] : DEFAULTS;
  for (const a of list) {
    try {
      await one(a);
    } catch (e) {
      console.log(`\n=== ${a} ===\nERR:`, (e as Error).message);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
