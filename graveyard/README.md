# 🪦 NFT Graveyard

> Dead NFT collections, abandoned DAOs, rug pulls and inactive protocols — given a proper burial.

Paste a contract or wallet address (Ethereum **or** Solana) and the Graveyard
issues a death certificate:

```
Last transaction:   472 days ago
Treasury remaining:  $14
Status:              💀 Deceased
Cause of death:      Slow death by abandonment — nothing left to fund development.
```

…rendered on an actual tombstone, with an epitaph.

## What it measures

| Signal | Ethereum | Solana |
| --- | --- | --- |
| **Last activity** | newest of incoming/outgoing/collection transfers (`alchemy_getAssetTransfers`) | newest signature (`getSignaturesForAddress`) |
| **Treasury** | native ETH + USDC/USDT/DAI/WETH (`alchemy_getTokenBalances`) | native SOL + USDC token accounts |
| **USD pricing** | CoinGecko (free) with a safe fallback | same |

**Status** is derived from days-since-activity, escalated by an empty treasury:

| Idle | Status |
| --- | --- |
| < 30d | 🟢 Alive & on-chain |
| 30–180d | 🟡 On life support |
| 180–365d | 🟠 Comatose |
| 365–730d | 💀 Deceased |
| > 730d | ⚰️ Ancient remains |
| no activity | 🪦 Unmarked grave |

Treasury under ~$10 + long silence is flagged as a likely **rug / drain** in the
cause of death.

## Verified

```
BAYC          → 🟢 Alive (traded today), treasury priced, detected as a collection
CryptoKitties → 🟢 Alive (still has daily transfers)
Solana USDC   → 🟢 Alive, SOL + USDC treasury via public RPC
classifier    → 💀 "472 days ago / $14" → Deceased, with cause of death
```

## Setup

```bash
npm install
cp .env.example .env     # add RPC_URL (Alchemy ETH). SOLANA_RPC defaults to public.
npm run dev              # http://localhost:3000
```

### Smoke test

```bash
npm run smoke                       # BAYC + CryptoKitties
npm run smoke -- <address>          # any ETH or Solana address (auto-detected)
```

> **Free-tier note:** works entirely on free RPCs. The public Solana endpoint is
> rate-limited; set `SOLANA_RPC` to an Alchemy/Helius URL for reliability. If
> CoinGecko is rate-limited, USD falls back to estimates (flagged in the output).

## Roadmap
- Curated "Hall of the Dead" — a seeded list of famous rugs/abandoned projects.
- Floor price & holder count (liveness beyond raw transfers).
- More treasury assets + Gnosis Safe / Realms DAO awareness.
- ENS / collection-name resolution for nicer headstones.
- Shareable death-certificate image (OG card).

## Stack
Next.js (App Router) · TypeScript · viem · plain JSON-RPC (multi-chain). No Anvil.
