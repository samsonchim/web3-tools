# Transaction What-If Simulator

> Git diff — but for blockchain transactions.

Paste any mainnet transaction hash, change the rules it ran under, and replay it
on a local [Anvil](https://book.getfoundry.sh/anvil/) fork. The app shows a
**before/after diff** of balances and gas so you can answer questions like:

- _What if gas were 50% cheaper?_ → override the gas price.
- _What if slippage were 0.1% instead of 5%?_ → re-quotes the swap and rewrites `amountOutMin`.
- _What if it executed 10 blocks later?_ → re-forks at a later block (and shows when it would have reverted).

Both the **actual** replay and the **what-if** run execute on the same fork, so
the comparison is apples-to-apples.

## How it works

```
tx hash ─▶ read real tx + receipt (archive RPC)
        ─▶ anvil_reset → fork mainnet at block N-1
        ─▶ snapshot ETH + ERC-20 balances (tokens pulled from Transfer logs)
        ─▶ impersonate sender, replay tx with overrides
        ─▶ snapshot balances again  ─▶  DIFF
```

## Setup

**1. Install [Foundry](https://book.getfoundry.sh/getting-started/installation)** (provides `anvil`):

```bash
curl -L https://foundry.paradigm.xyz | bash && foundryup
```

**2. Install deps & configure:**

```bash
npm install
cp .env.example .env   # then add your Alchemy/Infura RPC_URL
```

**3. Run Anvil (terminal 1) and the app (terminal 2):**

```bash
npm run anvil   # forks mainnet, listens on :8545
npm run dev     # http://localhost:3000
```

## Scope (v1)

| Override | Status |
| --- | --- |
| Gas price | ✅ |
| Block delay | ✅ |
| Slippage (Uniswap V2 + forks) | ✅ re-quotes via `getAmountsOut` |
| Slippage (Uniswap V3, direct `exactInput`/`exactInputSingle`) | ✅ re-quotes via QuoterV2 |
| Slippage (V3 `multicall`-wrapped / Universal Router) | ⬜ different calldata envelope |
| Slippage (aggregators: 1inch, 0x) | ⬜ |
| MEV-free reconstruction | ⬜ research / v2 — see notes |

> The sender is auto-funded on the fork (`anvil_setBalance`) so a replay isolates
> the tx's own mechanics rather than incidental balance changes — e.g. replaying
> an ETH-spend at a later block where the sender already spent that ETH.

### Verify the engine
With Anvil running against a fork, replay two real swaps end-to-end:

```bash
npm run smoke        # Uniswap V2 swapExactETHForTokens
npm run smoke v3     # Uniswap V3 SwapRouter02 exactInputSingle
```

### Future work
- V3 `multicall` / Universal Router + aggregator (1inch, 0x) slippage rewriting.
- Full call-trace via `debug_traceTransaction` for step-level diffs.
- "MEV-free" block reconstruction (remove sandwich txs, re-order) — the hard one.

## Stack
Next.js (App Router) · TypeScript · viem · Foundry/Anvil.
