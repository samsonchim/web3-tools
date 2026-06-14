import {
  createPublicClient,
  createTestClient,
  http,
  publicActions,
  walletActions,
} from "viem";
import { foundry, mainnet } from "viem/chains";

export const RPC_URL = process.env.RPC_URL ?? "";
export const ANVIL_URL = process.env.ANVIL_URL ?? "http://127.0.0.1:8545";

if (!RPC_URL) {
  // Surfaced clearly at request time rather than crashing the whole server.
  console.warn("[whatif] RPC_URL is not set — copy .env.example to .env first.");
}

// Reads the real, already-mined transaction from a forkable archive node.
export const mainnetClient = createPublicClient({
  chain: mainnet,
  transport: http(RPC_URL, { timeout: 30_000 }),
});

// Drives the local Anvil fork: reset/fork, impersonate, send, mine, read.
// anvil_reset re-forks mainnet and lazily downloads state, so it needs a
// generous timeout — the viem default of 10s often isn't enough.
export const anvil = createTestClient({
  chain: foundry,
  mode: "anvil",
  transport: http(ANVIL_URL, { timeout: 90_000 }),
})
  .extend(publicActions)
  .extend(walletActions);

export type Anvil = typeof anvil;
