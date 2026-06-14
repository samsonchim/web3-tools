import { NextRequest, NextResponse } from "next/server";
import { isHex } from "viem";
import { simulate, type Overrides } from "@/lib/simulate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const hash = body?.hash;

    if (typeof hash !== "string" || !isHex(hash) || hash.length !== 66) {
      return NextResponse.json(
        { error: "Provide a valid 32-byte transaction hash (0x… 66 chars)." },
        { status: 400 }
      );
    }

    const overrides: Overrides = {};
    if (body.gasGwei != null && body.gasGwei !== "") overrides.gasGwei = Number(body.gasGwei);
    if (body.slippageBps != null && body.slippageBps !== "")
      overrides.slippageBps = Math.max(0, Math.min(10000, Number(body.slippageBps)));
    if (body.blockDelay != null && body.blockDelay !== "")
      overrides.blockDelay = Math.max(0, Number(body.blockDelay));

    const result = await simulate(hash, overrides);
    return NextResponse.json(result);
  } catch (e) {
    const message = (e as Error).message ?? "Simulation failed.";
    // Most common cause in dev: Anvil isn't running on ANVIL_URL.
    const hint = /fetch failed|ECONNREFUSED/i.test(message)
      ? " — is Anvil running? Start it with `npm run anvil`."
      : "";
    return NextResponse.json({ error: message + hint }, { status: 500 });
  }
}
