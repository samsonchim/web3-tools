import { formatUnits } from "viem";
import { ETH_RPC, rpc } from "./clients";
import { getPrices } from "./prices";
import type { Holding } from "./types";

// Curated set of "treasury" assets we can price confidently. Stablecoins are
// pinned at $1; WETH tracks the ETH price.
const TOKENS: { addr: string; sym: string; dec: number; kind: "stable" | "weth" }[] = [
  { addr: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", sym: "USDC", dec: 6, kind: "stable" },
  { addr: "0xdac17f958d2ee523a2206206994597c13d831ec7", sym: "USDT", dec: 6, kind: "stable" },
  { addr: "0x6b175474e89094c44da98b954eedeac495271d0f", sym: "DAI", dec: 18, kind: "stable" },
  { addr: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2", sym: "WETH", dec: 18, kind: "weth" },
];

const CATEGORIES = ["external", "erc20", "erc721", "erc1155"];

type Transfer = { metadata?: { blockTimestamp?: string } };
type TransfersResult = { transfers?: Transfer[] };

async function latestTransferTs(params: Record<string, unknown>): Promise<number | null> {
  const result = await rpc<TransfersResult>(ETH_RPC, "alchemy_getAssetTransfers", [
    {
      fromBlock: "0x0",
      toBlock: "latest",
      order: "desc",
      maxCount: "0x1",
      withMetadata: true,
      excludeZeroValue: false,
      ...params,
    },
  ]);
  const iso = result.transfers?.[0]?.metadata?.blockTimestamp;
  return iso ? Math.floor(new Date(iso).getTime() / 1000) : null;
}

export type EthInspection = {
  lastTs: number | null;
  treasuryUsd: number | null;
  holdings: Holding[];
  notes: string[];
};

export async function inspectEth(address: string): Promise<EthInspection> {
  const notes: string[] = [];
  const prices = await getPrices();
  if (prices.stale) notes.push("price feed unavailable — USD values use fallback estimates");

  // Last activity: newest of outgoing, incoming, and (if it's a collection)
  // any NFT transfer of the contract itself.
  const [out, inc, coll] = await Promise.allSettled([
    latestTransferTs({ fromAddress: address, category: CATEGORIES }),
    latestTransferTs({ toAddress: address, category: CATEGORIES }),
    latestTransferTs({ contractAddresses: [address], category: ["erc721", "erc1155"] }),
  ]);
  const tsList = [out, inc, coll]
    .map((r) => (r.status === "fulfilled" ? r.value : null))
    .filter((v): v is number => v != null);
  const lastTs = tsList.length ? Math.max(...tsList) : null;
  if (coll.status === "fulfilled" && coll.value != null) {
    notes.push("address looks like an NFT collection (has ERC-721/1155 transfers)");
  }

  // Treasury: native ETH + the curated token set.
  const holdings: Holding[] = [];
  let treasuryUsd = 0;

  const wei = BigInt(await rpc<string>(ETH_RPC, "eth_getBalance", [address, "latest"]));
  const eth = Number(formatUnits(wei, 18));
  const ethUsd = eth * prices.eth;
  treasuryUsd += ethUsd;
  if (eth > 0) holdings.push({ asset: "ETH", amount: eth.toFixed(4), usd: ethUsd });

  try {
    const tb = await rpc<{ tokenBalances?: { contractAddress: string; tokenBalance: string }[] }>(
      ETH_RPC,
      "alchemy_getTokenBalances",
      [address, TOKENS.map((t) => t.addr)]
    );
    for (const bal of tb.tokenBalances ?? []) {
      const meta = TOKENS.find((t) => t.addr === bal.contractAddress.toLowerCase());
      if (!meta || !bal.tokenBalance || bal.tokenBalance === "0x" ) continue;
      const raw = BigInt(bal.tokenBalance);
      if (raw === 0n) continue;
      const amount = Number(formatUnits(raw, meta.dec));
      const unit = meta.kind === "stable" ? 1 : prices.eth;
      const usd = amount * unit;
      treasuryUsd += usd;
      holdings.push({ asset: meta.sym, amount: amount.toFixed(meta.kind === "stable" ? 2 : 4), usd });
    }
  } catch (e) {
    notes.push(`token balances unavailable: ${(e as Error).message}`);
  }

  return { lastTs, treasuryUsd, holdings, notes };
}
