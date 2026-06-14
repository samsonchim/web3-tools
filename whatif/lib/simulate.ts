import { formatEther, formatUnits, parseEther, parseGwei, type Address, type Hex } from "viem";
import { anvil, mainnetClient, RPC_URL } from "./clients";
import { erc20Abi } from "./abi";
import { detectSwap, extractTokens, rewriteSlippage } from "./decode";

export type Overrides = {
  gasGwei?: number; // override effective gas price
  slippageBps?: number; // new slippage tolerance in basis points (50 = 0.5%)
  blockDelay?: number; // re-execute N blocks later
};

export type TokenDelta = {
  token: Address;
  symbol: string;
  decimals: number;
  before: string;
  after: string;
  delta: string; // signed, human-readable
};

export type RunResult = {
  label: string;
  targetBlock: string;
  status: "success" | "reverted";
  gasUsed: string;
  gasPriceGwei: string;
  gasCostEth: string;
  ethDelta: string;
  tokens: TokenDelta[];
  notes: string[];
  error?: string;
};

export type SimResponse = {
  meta: {
    hash: Hex;
    from: Address;
    to: Address;
    block: string;
    swapDetected: boolean;
  };
  baseline: RunResult;
  modified: RunResult;
};

const ZERO = "0x0000000000000000000000000000000000000000" as Address;

async function tokenMeta(token: Address) {
  try {
    const [symbol, decimals] = await Promise.all([
      anvil.readContract({ address: token, abi: erc20Abi, functionName: "symbol" }),
      anvil.readContract({ address: token, abi: erc20Abi, functionName: "decimals" }),
    ]);
    return { symbol: symbol as string, decimals: decimals as number };
  } catch {
    return { symbol: token.slice(0, 8), decimals: 18 };
  }
}

async function tokenBalance(token: Address, owner: Address): Promise<bigint> {
  try {
    return (await anvil.readContract({
      address: token,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [owner],
    })) as bigint;
  } catch {
    return 0n;
  }
}

function signed(value: bigint, decimals: number): string {
  const s = formatUnits(value < 0n ? -value : value, decimals);
  return (value < 0n ? "-" : value > 0n ? "+" : "") + s;
}

// Execute the tx on a freshly-forked Anvil at `baseBlock + blockDelay - 1`,
// applying overrides, and report the resulting balance deltas for `from`.
async function runOnFork(
  tx: Awaited<ReturnType<typeof mainnetClient.getTransaction>>,
  tokens: Address[],
  baseBlock: bigint,
  ov: Overrides,
  label: string
): Promise<RunResult> {
  const notes: string[] = [];
  const targetBlock = baseBlock + BigInt(ov.blockDelay ?? 0);
  const forkBlock = targetBlock - 1n;

  // Re-fork mainnet at the block just before execution.
  await anvil.reset({ jsonRpcUrl: RPC_URL, blockNumber: forkBlock });

  const account = tx.from;
  const to = tx.to as Address;

  const gasPrice =
    ov.gasGwei != null ? parseGwei(String(ov.gasGwei)) : tx.gasPrice ?? 0n;

  // Fund the sender so the experiment isolates the tx's own mechanics rather
  // than incidental balance changes — e.g. replaying an ETH-spending swap at a
  // later block where the sender has already spent that ETH on the real chain.
  const needed = tx.value + tx.gas * gasPrice + parseEther("0.1");
  if ((await anvil.getBalance({ address: account })) < needed) {
    await anvil.setBalance({ address: account, value: needed });
    notes.push("funded sender to cover gas + value (insufficient at this block)");
  }

  // Resolve token metadata + pre-execution balances.
  const metas = await Promise.all(tokens.map(tokenMeta));
  const ethBefore = await anvil.getBalance({ address: account });
  const tokBefore = await Promise.all(tokens.map((t) => tokenBalance(t, account)));

  // Build calldata, optionally rewriting slippage.
  let data = tx.input;
  if (ov.slippageBps != null) {
    const swap = detectSwap(tx.input, to, tx.value);
    if (swap) {
      try {
        const r = await rewriteSlippage(swap, ov.slippageBps);
        data = r.data;
        notes.push(
          `slippage set to ${(ov.slippageBps / 100).toFixed(2)}% → amountOutMin ${r.newMin} (re-quoted expectedOut ${r.expectedOut})`
        );
      } catch (e) {
        notes.push(`slippage rewrite failed (re-quote reverted): ${(e as Error).message}`);
      }
    } else {
      notes.push("slippage override ignored: tx is not a recognized Uniswap-V2 swap");
    }
  }

  if (ov.gasGwei != null) notes.push(`gas price overridden to ${ov.gasGwei} gwei`);
  if (ov.blockDelay) notes.push(`executed ${ov.blockDelay} block(s) later (block ${targetBlock})`);

  let status: "success" | "reverted" = "success";
  let gasUsed = 0n;
  let error: string | undefined;

  try {
    await anvil.impersonateAccount({ address: account });
    const hash = await anvil.sendTransaction({
      account,
      to,
      data,
      value: tx.value,
      gas: tx.gas,
      gasPrice,
      // Anvil keeps the forked chain's id (1), but the client is configured as
      // Foundry (31337). chain: null skips viem's chain-match assertion so the
      // impersonated tx is dispatched via eth_sendTransaction.
      chain: null,
    });
    await anvil.mine({ blocks: 1 });
    const receipt = await anvil.getTransactionReceipt({ hash });
    status = receipt.status;
    gasUsed = receipt.gasUsed;
    if (status === "reverted") error = "transaction reverted on-fork";
  } catch (e) {
    status = "reverted";
    error = (e as Error).message;
  } finally {
    await anvil.stopImpersonatingAccount({ address: account });
  }

  // Post-execution balances → deltas.
  const ethAfter = await anvil.getBalance({ address: account });
  const tokAfter = await Promise.all(tokens.map((t) => tokenBalance(t, account)));

  const tokenDeltas: TokenDelta[] = tokens.map((token, i) => ({
    token,
    symbol: metas[i].symbol,
    decimals: metas[i].decimals,
    before: formatUnits(tokBefore[i], metas[i].decimals),
    after: formatUnits(tokAfter[i], metas[i].decimals),
    delta: signed(tokAfter[i] - tokBefore[i], metas[i].decimals),
  }));

  return {
    label,
    targetBlock: targetBlock.toString(),
    status,
    gasUsed: gasUsed.toString(),
    gasPriceGwei: formatUnits(gasPrice, 9),
    gasCostEth: formatEther(gasUsed * gasPrice),
    ethDelta: signed(ethAfter - ethBefore, 18),
    tokens: tokenDeltas,
    notes,
    error,
  };
}

export async function simulate(hash: Hex, overrides: Overrides): Promise<SimResponse> {
  const tx = await mainnetClient.getTransaction({ hash });
  if (!tx.to) throw new Error("Contract-creation transactions are not supported.");
  if (tx.blockNumber == null) throw new Error("Transaction is pending / not yet mined.");

  const receipt = await mainnetClient.getTransactionReceipt({ hash });
  const tokens = extractTokens(receipt.logs);
  const baseBlock = tx.blockNumber;

  // Baseline = same tx replayed with no overrides (apples-to-apples vs modified).
  const baseline = await runOnFork(tx, tokens, baseBlock, {}, "Actual (replayed)");
  const modified = await runOnFork(tx, tokens, baseBlock, overrides, "What-if");

  return {
    meta: {
      hash,
      from: tx.from,
      to: (tx.to as Address) ?? ZERO,
      block: baseBlock.toString(),
      swapDetected: detectSwap(tx.input, tx.to as Address, tx.value) != null,
    },
    baseline,
    modified,
  };
}
