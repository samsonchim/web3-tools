import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";

export const RPC_URL = process.env.RPC_URL ?? "";

if (!RPC_URL) {
  console.warn("[llinda] RPC_URL is not set — copy .env.example to .env first.");
}

export const client = createPublicClient({
  chain: mainnet,
  transport: http(RPC_URL, { timeout: 30_000 }),
});
