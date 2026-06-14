import type { Status } from "./types";

// Decide how dead something is from (a) days since last on-chain activity and
// (b) how much value is left in the address. Treasury near-zero + long silence
// is the classic rug/abandonment signature.
export function classify(daysAgo: number | null, treasuryUsd: number | null): Status {
  if (daysAgo == null) {
    return {
      code: "unknown",
      title: "Unmarked grave",
      emoji: "🪦",
      epitaph: "No activity could be found. Either pristine… or buried without a headstone.",
      causeOfDeath: null,
    };
  }

  const broke = treasuryUsd != null && treasuryUsd < 100;
  const drained = treasuryUsd != null && treasuryUsd < 10;

  if (daysAgo < 30) {
    return {
      code: "alive",
      title: "Alive & on-chain",
      emoji: "🟢",
      epitaph: "Still breathing. Reports of its death are greatly exaggerated.",
      causeOfDeath: null,
    };
  }

  if (daysAgo < 180) {
    return {
      code: "fading",
      title: "On life support",
      emoji: "🟡",
      epitaph: "Activity has slowed to a trickle. The vibes are terminal.",
      causeOfDeath: broke ? "Funds nearly gone — running on fumes." : null,
    };
  }

  if (daysAgo < 365) {
    return {
      code: "comatose",
      title: "Comatose",
      emoji: "🟠",
      epitaph: "Hasn't stirred in months. The Discord is just bots talking to bots.",
      causeOfDeath: broke ? "Treasury drained — likely abandoned after the money left." : null,
    };
  }

  if (daysAgo < 730) {
    return {
      code: "deceased",
      title: "Deceased",
      emoji: "💀",
      epitaph: "Here lies a project that promised the moon and delivered a 404.",
      causeOfDeath: drained
        ? "Rug pull / drain — funds vanished and so did the team."
        : broke
        ? "Slow death by abandonment — nothing left to fund development."
        : "Abandoned — wallet still holds value, but nobody's home.",
    };
  }

  return {
    code: "ancient",
    title: "Ancient remains",
    emoji: "⚰️",
    epitaph: "A relic of a past cycle. Archaeology, not analytics, from here.",
    causeOfDeath: drained
      ? "Long-dead rug — drained years ago."
      : "Fossilized — untouched for over two years.",
  };
}

export function humanizeAge(daysAgo: number | null): string {
  if (daysAgo == null) return "no activity found";
  if (daysAgo === 0) return "today";
  if (daysAgo === 1) return "1 day ago";
  if (daysAgo < 365) return `${daysAgo} days ago`;
  const years = (daysAgo / 365).toFixed(1);
  return `${daysAgo} days ago (~${years} yr)`;
}
