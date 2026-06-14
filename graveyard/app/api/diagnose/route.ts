import { NextRequest, NextResponse } from "next/server";
import { diagnose } from "@/lib/diagnose";
import type { Chain } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { address, chain } = await req.json();
    if (typeof address !== "string" || address.length < 32) {
      return NextResponse.json({ error: "Provide a contract or wallet address." }, { status: 400 });
    }
    const report = await diagnose(address.trim(), chain as Chain | undefined);
    return NextResponse.json(report);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message ?? "Lookup failed." }, { status: 500 });
  }
}
