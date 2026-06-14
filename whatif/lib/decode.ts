import {
  decodeFunctionData,
  encodeFunctionData,
  getAddress,
  type Address,
  type Hex,
  type Log,
} from "viem";
import {
  QUOTER_V2,
  quoterV2Abi,
  TRANSFER_TOPIC,
  uniV2RouterAbi,
  uniV3RouterAbi,
} from "./abi";
import { anvil } from "./clients";

// Collect the unique ERC-20 contract addresses touched by a tx, from its
// Transfer logs. These are the tokens whose balances are worth diffing.
export function extractTokens(logs: Log[]): Address[] {
  const set = new Set<string>();
  for (const log of logs) {
    if (log.topics[0]?.toLowerCase() === TRANSFER_TOPIC) {
      set.add(getAddress(log.address));
    }
  }
  return [...set] as Address[];
}

// ---- Uniswap V2 -----------------------------------------------------------

const V2_AMOUNT_OUT_MIN_INDEX: Record<string, number> = {
  swapExactTokensForTokens: 1,
  swapExactTokensForETH: 1,
  swapExactTokensForTokensSupportingFeeOnTransferTokens: 1,
  swapExactTokensForETHSupportingFeeOnTransferTokens: 1,
  swapExactETHForTokens: 0,
  swapExactETHForTokensSupportingFeeOnTransferTokens: 0,
};

type V2Swap = {
  kind: "v2";
  functionName: string;
  args: readonly unknown[];
  amountIn: bigint;
  path: readonly Address[];
};

function detectV2(input: Hex, value: bigint): V2Swap | null {
  try {
    const { functionName, args } = decodeFunctionData({ abi: uniV2RouterAbi, data: input });
    if (!(functionName in V2_AMOUNT_OUT_MIN_INDEX)) return null;
    const ethIn = functionName.startsWith("swapExactETH");
    const amountIn = ethIn ? value : (args[0] as bigint);
    const path = (ethIn ? args[1] : args[2]) as readonly Address[];
    return { kind: "v2", functionName, args, amountIn, path };
  } catch {
    return null;
  }
}

// ---- Uniswap V3 -----------------------------------------------------------

// Decoded struct for exactInputSingle (deadline present only on SwapRouter v1).
type V3SingleParams = {
  tokenIn: Address;
  tokenOut: Address;
  fee: number;
  recipient: Address;
  deadline?: bigint;
  amountIn: bigint;
  amountOutMinimum: bigint;
  sqrtPriceLimitX96: bigint;
};
type V3PathParams = {
  path: Hex;
  recipient: Address;
  deadline?: bigint;
  amountIn: bigint;
  amountOutMinimum: bigint;
};

type V3Swap = {
  kind: "v3";
  mode: "single" | "path";
  functionName: "exactInputSingle" | "exactInput";
  params: V3SingleParams | V3PathParams;
};

function detectV3(input: Hex): V3Swap | null {
  try {
    const { functionName, args } = decodeFunctionData({ abi: uniV3RouterAbi, data: input });
    if (functionName === "exactInputSingle") {
      return { kind: "v3", mode: "single", functionName, params: args[0] as V3SingleParams };
    }
    if (functionName === "exactInput") {
      return { kind: "v3", mode: "path", functionName, params: args[0] as V3PathParams };
    }
    return null;
  } catch {
    return null;
  }
}

// ---- Public API -----------------------------------------------------------

export type SwapInfo = (V2Swap | V3Swap) & { router: Address };

export function detectSwap(input: Hex, to: Address, value: bigint): SwapInfo | null {
  const v2 = detectV2(input, value);
  if (v2) return { ...v2, router: to };
  const v3 = detectV3(input);
  if (v3) return { ...v3, router: to };
  return null;
}

const applySlippage = (expectedOut: bigint, slippageBps: number) =>
  (expectedOut * BigInt(10000 - slippageBps)) / 10000n;

// Re-quote the swap on the fork and rewrite amountOutMin(imum) for the new
// slippage tolerance. Returns fresh calldata for the same router function.
export async function rewriteSlippage(
  swap: SwapInfo,
  slippageBps: number
): Promise<{ data: Hex; expectedOut: bigint; newMin: bigint }> {
  if (swap.kind === "v2") {
    const amounts = (await anvil.readContract({
      address: swap.router,
      abi: uniV2RouterAbi,
      functionName: "getAmountsOut",
      args: [swap.amountIn, swap.path as Address[]],
    })) as bigint[];
    const expectedOut = amounts[amounts.length - 1];
    const newMin = applySlippage(expectedOut, slippageBps);

    const idx = V2_AMOUNT_OUT_MIN_INDEX[swap.functionName];
    const newArgs = [...swap.args];
    newArgs[idx] = newMin;
    const data = encodeFunctionData({
      abi: uniV2RouterAbi,
      functionName: swap.functionName as never,
      args: newArgs as never,
    });
    return { data, expectedOut, newMin };
  }

  // V3: re-quote via QuoterV2, then rewrite amountOutMinimum in the struct.
  if (swap.mode === "single") {
    const p = swap.params as V3SingleParams;
    const [expectedOut] = (await anvil.readContract({
      address: QUOTER_V2,
      abi: quoterV2Abi,
      functionName: "quoteExactInputSingle",
      args: [
        {
          tokenIn: p.tokenIn,
          tokenOut: p.tokenOut,
          amountIn: p.amountIn,
          fee: p.fee,
          sqrtPriceLimitX96: 0n,
        },
      ],
    })) as [bigint, bigint, number, bigint];
    const newMin = applySlippage(expectedOut, slippageBps);
    const newParams = { ...p, amountOutMinimum: newMin };
    const data = encodeFunctionData({
      abi: uniV3RouterAbi,
      functionName: "exactInputSingle",
      args: [newParams as never],
    });
    return { data, expectedOut, newMin };
  }

  const p = swap.params as V3PathParams;
  const [expectedOut] = (await anvil.readContract({
    address: QUOTER_V2,
    abi: quoterV2Abi,
    functionName: "quoteExactInput",
    args: [p.path, p.amountIn],
  })) as [bigint, bigint[], number[], bigint];
  const newMin = applySlippage(expectedOut, slippageBps);
  const newParams = { ...p, amountOutMinimum: newMin };
  const data = encodeFunctionData({
    abi: uniV3RouterAbi,
    functionName: "exactInput",
    args: [newParams as never],
  });
  return { data, expectedOut, newMin };
}
