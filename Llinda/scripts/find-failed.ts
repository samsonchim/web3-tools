import { client } from "../lib/clients";
import { diagnose } from "../lib/diagnose";

async function main() {
  const head = await client.getBlockNumber();
  const rpc = client.request as unknown as (a: { method: string; params: unknown[] }) => Promise<any[]>;
  const failures: string[] = [];
  for (let i = 0n; i < 3n && failures.length < 2; i++) {
    const bn = "0x" + (head - i).toString(16);
    const receipts = await rpc({ method: "eth_getBlockReceipts", params: [bn] });
    for (const r of receipts) if (r.status === "0x0" && failures.length < 2) failures.push(r.transactionHash);
  }
  console.log("failed txs:", failures);
  for (const h of failures) {
    const d = await diagnose(h as `0x${string}`);
    console.log(`\n=== ${h} ===`);
    console.log("title :", d.category.title);
    console.log("source:", d.source, "| kind:", d.reason?.kind);
    console.log("raw   :", d.reason?.text);
    console.log("gas   :", d.meta.gasUsedPct + "%");
  }
}
main().catch((e) => { console.error("ERR", e?.message ?? e); process.exit(1); });
