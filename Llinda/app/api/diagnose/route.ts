import { NextRequest, NextResponse } from "next/server";
import { isHex } from "viem";
import { diagnose } from "@/lib/diagnose";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { hash } = await req.json();
    if (typeof hash !== "string" || !isHex(hash) || hash.length !== 66) {
      return NextResponse.json(
        { error: "Provide a valid 32-byte transaction hash (0x… 66 chars)." },
        { status: 400 }
      );
    }
    return NextResponse.json(await diagnose(hash));
  } catch (e) {
    const message = (e as Error).message ?? "Diagnosis failed.";
    const hint = /not be found|could not be found|TransactionNotFound/i.test(message)
      ? " — is the hash correct and on Ethereum mainnet?"
      : "";
    return NextResponse.json({ error: message + hint }, { status: 500 });
  }
}
