export type Chain = "ethereum" | "solana";

export type Holding = {
  asset: string;
  amount: string; // human-readable
  usd: number | null;
};

export type Report = {
  chain: Chain;
  address: string;
  lastActivity: {
    ts: number | null; // unix seconds
    daysAgo: number | null;
    label: string; // e.g. "472 days ago" or "no activity found"
  };
  treasuryUsd: number | null;
  holdings: Holding[];
  status: Status;
  notes: string[];
};

export type Status = {
  code: "alive" | "fading" | "comatose" | "deceased" | "ancient" | "unknown";
  title: string; // "Deceased"
  emoji: string;
  epitaph: string; // tombstone line
  causeOfDeath: string | null;
};
