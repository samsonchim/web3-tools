# Llinda — Why Did My Transaction Fail?

> Paste a failed tx hash. Get the real reason — in plain English.

One of the most frustrating things in crypto is a transaction that just says
**"failed"** (or a useless `out of gas`). Llinda pulls the *actual* revert reason
out of the EVM and translates it into something a human can act on:

```
Insufficient liquidity in the pool          ← not just "execution reverted"
Token approval / allowance problem           ← not just "STF"
Slippage — you got less than your minimum    ← not just "0x08c379a0…"
```

…each with a one-line **"how to fix."**

## How it works

```
tx hash ─▶ read tx + receipt
        ─▶ status success?  → "this didn't fail"
        ─▶ get revert data:
             1. debug_traceTransaction (callTracer) — finds the *deepest*
                reverting call (the true origin), if the node supports it
             2. fallback: eth_call replay at the tx's block — viem surfaces
                the revert data, which we decode
        ─▶ decode: Error(string) · Panic(uint256) · custom-error selector
        ─▶ classify against a knowledge base → plain English + likely fix
```

> ⚠️ **Free-tier RPCs** (e.g. Alchemy Free) block `debug_traceTransaction`, so
> Llinda automatically uses the `eth_call` replay path. It works — in testing it
> recovered a real `STF` (Uniswap V3 SafeTransferFrom) revert. A node with
> tracing (Pay-As-You-Go / your own geth) gives more precise, nested results.

## What it recognises

Error strings, `Panic` codes, and common custom errors are mapped to categories:
slippage / min-out, insufficient liquidity, expired deadline, approval &
allowance, insufficient balance, excessive input, paused contract, permission
denied, arithmetic overflow/underflow, division by zero, and out-of-gas
(detected from gas-used vs. gas-limit). Anything unknown still shows its raw,
decoded reason rather than hiding it.

Extend the knowledge base in [`lib/errors.ts`](lib/errors.ts) — add custom-error
signatures to `KNOWN_CUSTOM_ERRORS` and revert-string patterns to `PATTERNS`.

## Setup

```bash
npm install
cp .env.example .env     # add your mainnet RPC_URL
npm run dev              # http://localhost:3000
```

### Smoke test (no UI)

```bash
npm run smoke -- 0x<failed-tx-hash>
# or auto-find a recent failure and diagnose it:
node --env-file=.env node_modules/.bin/tsx scripts/find-failed.ts
```

## Stack
Next.js (App Router) · TypeScript · viem. No Anvil required.

## Roadmap
- Wider custom-error dictionary (Permit2, Universal Router, Aave, Compound…).
- 4byte.directory lookup for unknown selectors.
- Multi-chain (L2s) — the logic is chain-agnostic; just swap the RPC.
- Optional Anvil-replay backend for exact reproduction on free-tier keys.
