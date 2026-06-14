import {
  decodeAbiParameters,
  parseAbiParameters,
  slice,
  toFunctionSelector,
  type Hex,
} from "viem";

// ---- Low-level revert-data decoding --------------------------------------

// Solidity Panic(uint256) codes — emitted by `assert`, overflow, div-by-zero…
const PANIC_CODES: Record<number, string> = {
  0x00: "generic compiler panic",
  0x01: "assert(false) — an invariant the contract assumed to be true was violated",
  0x11: "arithmetic overflow or underflow",
  0x12: "division or modulo by zero",
  0x21: "an enum was set to an out-of-range value",
  0x22: "access to an incorrectly encoded storage byte array",
  0x31: "called .pop() on an empty array",
  0x32: "array index out of bounds",
  0x41: "out of memory (allocated too much)",
  0x51: "called an uninitialized internal function",
};

const ERROR_STRING_SELECTOR = "0x08c379a0"; // Error(string)
const PANIC_SELECTOR = "0x4e487b71"; // Panic(uint256)

// A curated set of common custom-error signatures, resolved to selectors at
// load time. Extend freely — anything not here still shows its raw selector.
const KNOWN_CUSTOM_ERRORS: { sig: string; name: string; meaning: string }[] = [
  { sig: "TransferFromFailed()", name: "TransferFromFailed", meaning: "an ERC-20 transferFrom returned false / reverted (allowance or balance)" },
  { sig: "TransferFailed()", name: "TransferFailed", meaning: "an ERC-20 transfer returned false / reverted" },
  { sig: "InsufficientBalance()", name: "InsufficientBalance", meaning: "the account did not hold enough of the token" },
  { sig: "InsufficientAllowance()", name: "InsufficientAllowance", meaning: "the spender was not approved for enough tokens" },
  { sig: "STF()", name: "STF", meaning: "Uniswap V3 SafeTransferFrom failed (allowance or balance)" },
  { sig: "T()", name: "T", meaning: "Uniswap V3: transaction too old (past the deadline)" },
  { sig: "Expired()", name: "Expired", meaning: "the transaction's deadline had already passed" },
  { sig: "Slippage()", name: "Slippage", meaning: "output fell below the minimum you accepted (price moved)" },
  { sig: "PriceSlippageCheck()", name: "PriceSlippageCheck", meaning: "output fell below the minimum you accepted (price moved)" },
  { sig: "ExcessiveInputAmount()", name: "ExcessiveInputAmount", meaning: "the swap needed more input than the maximum you allowed" },
  { sig: "TooLittleReceived()", name: "TooLittleReceived", meaning: "you received less than your minimum-out (slippage)" },
  { sig: "AllowanceExpired(uint256)", name: "AllowanceExpired", meaning: "the Permit2 allowance had expired" },
  { sig: "InsufficientAllowance(uint256)", name: "InsufficientAllowance", meaning: "the Permit2 allowance was too small" },
];

const CUSTOM_BY_SELECTOR = new Map<string, { name: string; meaning: string }>();
for (const e of KNOWN_CUSTOM_ERRORS) {
  try {
    CUSTOM_BY_SELECTOR.set(toFunctionSelector(`error ${e.sig}`), {
      name: e.name,
      meaning: e.meaning,
    });
  } catch {
    /* skip malformed signature */
  }
}

export type DecodedRevert = {
  kind: "error-string" | "panic" | "custom" | "empty" | "raw";
  text: string; // best human-readable revert message
  selector?: Hex;
};

export function decodeRevert(data?: Hex): DecodedRevert {
  if (!data || data === "0x") {
    return { kind: "empty", text: "reverted without a reason string" };
  }
  const selector = slice(data, 0, 4);

  if (selector === ERROR_STRING_SELECTOR) {
    try {
      const [reason] = decodeAbiParameters(parseAbiParameters("string"), slice(data, 4));
      return { kind: "error-string", text: reason as string, selector };
    } catch {
      return { kind: "raw", text: data, selector };
    }
  }

  if (selector === PANIC_SELECTOR) {
    try {
      const [code] = decodeAbiParameters(parseAbiParameters("uint256"), slice(data, 4));
      const n = Number(code);
      return {
        kind: "panic",
        text: PANIC_CODES[n] ?? `panic code 0x${n.toString(16)}`,
        selector,
      };
    } catch {
      return { kind: "raw", text: data, selector };
    }
  }

  const known = CUSTOM_BY_SELECTOR.get(selector);
  if (known) return { kind: "custom", text: `${known.name}: ${known.meaning}`, selector };

  return { kind: "custom", text: `custom error ${selector}`, selector };
}

// ---- Plain-English classification ----------------------------------------

export type Category = {
  title: string;
  english: string;
  fix: string;
};

// First matching pattern wins. Ordered most-specific → most-generic.
const PATTERNS: { match: RegExp; cat: Category }[] = [
  {
    match: /INSUFFICIENT_OUTPUT_AMOUNT|Too ?little ?received|TooLittleReceived|return amount is not enough|min(imum)?[_ ]?(return|out)|PriceSlippageCheck|Slippage/i,
    cat: {
      title: "Slippage — you got less than your minimum",
      english:
        "The price moved between when you submitted and when the swap executed, so the output dropped below the minimum amount you set. The contract rejected the trade to protect you.",
      fix: "Increase your slippage tolerance slightly, trade a smaller size, or retry when the market is calmer. Beware: very high slippage invites sandwich bots.",
    },
  },
  {
    match: /INSUFFICIENT_LIQUIDITY|INSUFFICIENT_(A|B)_AMOUNT|not enough liquidity|SPL\b/i,
    cat: {
      title: "Insufficient liquidity in the pool",
      english:
        "The liquidity pool didn't have enough depth to fill your trade at an acceptable price. Large trades against thin pools move the price too far.",
      fix: "Split the trade into smaller pieces, route through a different pool/aggregator, or pick a more liquid pair.",
    },
  },
  {
    match: /EXPIRED|deadline|\bT\(\)|transaction too old/i,
    cat: {
      title: "Deadline expired",
      english:
        "Your transaction sat in the mempool past the deadline encoded in it, so the contract refused to execute a stale trade.",
      fix: "Resubmit with a longer deadline, or a higher gas fee so it confirms before the deadline.",
    },
  },
  {
    match: /TRANSFER_FROM_FAILED|TransferFromFailed|\bSTF\b|exceeds allowance|insufficient allowance|InsufficientAllowance|ERC20: transfer amount exceeds allowance|SafeERC20/i,
    cat: {
      title: "Token approval / allowance problem",
      english:
        "The contract tried to pull your tokens via transferFrom but you hadn't approved it for enough (or any) of them — so the transfer failed.",
      fix: "Approve the spender for the token first (or raise the allowance), then retry. Some tokens (e.g. USDT) require resetting the allowance to 0 before setting a new value.",
    },
  },
  {
    match: /transfer amount exceeds balance|insufficient balance|InsufficientBalance|ds-math-sub-underflow|subtraction overflow/i,
    cat: {
      title: "Not enough token balance",
      english:
        "The sender tried to move more of a token than it actually holds. The transfer underflowed and reverted.",
      fix: "Check the actual balance and decimals — amounts are in the token's smallest unit. Account for fees-on-transfer tokens that reduce the received amount.",
    },
  },
  {
    match: /ExcessiveInputAmount|EXCESSIVE_INPUT_AMOUNT/i,
    cat: {
      title: "Swap needed more input than allowed",
      english:
        "For an exact-output swap, the price moved so the input required exceeded the maximum you were willing to spend.",
      fix: "Raise your maximum input (amountInMaximum) or retry at a better price.",
    },
  },
  {
    match: /Pausable: paused|contract is paused|\bpaused\b|enforced pause/i,
    cat: {
      title: "Contract is paused",
      english:
        "The target contract has been paused by its admins (often a safety switch), so it rejects interactions right now.",
      fix: "Wait until it's unpaused — check the project's status page or socials. Nothing on your end to fix.",
    },
  },
  {
    match: /Ownable|caller is not the owner|AccessControl|not authorized|Unauthorized|forbidden/i,
    cat: {
      title: "Permission denied",
      english:
        "The function you called is restricted to a privileged role (owner/admin), and your address isn't authorized.",
      fix: "This action can only be performed by the contract's owner/admin. Make sure you're calling from the right account.",
    },
  },
  {
    match: /arithmetic (overflow|underflow)|overflow|underflow|panic code 0x11/i,
    cat: {
      title: "Arithmetic overflow / underflow",
      english:
        "A calculation inside the contract went out of range (a subtraction below zero or a value too large), which Solidity 0.8+ rejects automatically.",
      fix: "Usually a symptom of a bad input amount (e.g. more than a balance) or an edge case in the contract. Double-check the amounts you passed.",
    },
  },
  {
    match: /division or modulo by zero|panic code 0x12/i,
    cat: {
      title: "Division by zero",
      english: "The contract divided by zero — often because a pool reserve or supply was 0.",
      fix: "This typically means interacting with an empty/uninitialized pool or market. Verify the target is set up.",
    },
  },
];

export function classify(decoded: DecodedRevert): Category {
  for (const { match, cat } of PATTERNS) {
    if (match.test(decoded.text)) return cat;
  }
  return {
    title: "Transaction reverted",
    english:
      decoded.kind === "empty"
        ? "The contract reverted without giving a reason string, so the EVM only knows it failed. This often means a require() with no message, or a low-level call that failed."
        : `The contract rejected the transaction with: “${decoded.text}”. This is a contract-specific condition that wasn't met.`,
    fix: "Read the contract's source for the failing require/revert, or simulate the call to see where it stops. The raw reason above is the contract's own wording.",
  };
}

export const OUT_OF_GAS: Category = {
  title: "Out of gas",
  english:
    "Execution used up the entire gas limit before finishing, so the EVM halted and rolled everything back. The gas was still spent.",
  fix: "Resend with a higher gas limit. Let your wallet estimate it, then add ~20–30% headroom — gas use can vary with on-chain state.",
};
