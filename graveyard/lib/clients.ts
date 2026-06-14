export const ETH_RPC = process.env.RPC_URL ?? "";
export const SOL_RPC = process.env.SOLANA_RPC ?? "https://api.mainnet-beta.solana.com";

if (!ETH_RPC) {
  console.warn("[graveyard] RPC_URL is not set — copy .env.example to .env first.");
}

// Minimal JSON-RPC caller used for both chains (and Alchemy's alchemy_* methods).
export async function rpc<T = unknown>(
  url: string,
  method: string,
  params: unknown[]
): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`${method}: HTTP ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(`${method}: ${json.error.message}`);
  return json.result as T;
}
