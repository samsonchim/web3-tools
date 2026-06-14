// Native-asset USD prices from CoinGecko's free (keyless) endpoint, with a safe
// fallback so the graveyard still works if the API is down or rate-limited.
const FALLBACK = { eth: 3000, sol: 150 };

export type Prices = { eth: number; sol: number; stale: boolean };

let cache: { at: number; data: Prices } | null = null;
const TTL = 60_000;

export async function getPrices(): Promise<Prices> {
  if (cache && Date.now() - cache.at < TTL) return cache.data;
  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=ethereum,solana&vs_currencies=usd",
      { headers: { accept: "application/json" } }
    );
    const j = await res.json();
    const data: Prices = {
      eth: j?.ethereum?.usd ?? FALLBACK.eth,
      sol: j?.solana?.usd ?? FALLBACK.sol,
      stale: false,
    };
    cache = { at: Date.now(), data };
    return data;
  } catch {
    return { ...FALLBACK, stale: true };
  }
}
