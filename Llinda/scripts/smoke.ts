import { diagnose } from "../lib/diagnose";

// Pass a hash on the CLI: `npm run smoke -- 0x…`. Otherwise the route scans for
// a recent failed tx automatically (see scripts/find-failed.ts).
const hash = process.argv[2] as `0x${string}` | undefined;

async function main() {
  if (!hash) {
    console.error("usage: tsx scripts/smoke.ts <txHash>");
    process.exit(1);
  }
  console.log("→ diagnosing", hash);
  const d = await diagnose(hash);
  console.log(JSON.stringify(d, null, 2));
}

main().catch((e) => {
  console.error("SMOKE FAILED:", e);
  process.exit(1);
});
