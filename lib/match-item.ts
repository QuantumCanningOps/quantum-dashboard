/**
 * Match an extracted ingredient/item description to a catalog item.
 * Prefers exact normalized matches; requires enough confidence that
 * short/ambiguous names do not false-positive across similar items.
 */

export type MatchableItem = {
  id: string;
  name: string;
};

function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function significantTokens(normalized: string): string[] {
  return normalized.split(" ").filter((token) => token.length >= 3);
}

/** Minimum score required to accept a fuzzy match (exact = 100). */
const MIN_ACCEPT_SCORE = 50;

function scoreMatch(description: string, itemName: string): number {
  const desc = normalizeName(description);
  const name = normalizeName(itemName);
  if (!desc || !name) return 0;
  if (desc === name) return 100;

  const descTokens = significantTokens(desc);
  const nameTokens = significantTokens(name);
  if (descTokens.length === 0 || nameTokens.length === 0) return 0;

  // Multi-token descriptions: require majority exact token overlap.
  if (descTokens.length >= 2) {
    const overlap = descTokens.filter((token) =>
      nameTokens.includes(token)
    ).length;
    if (overlap === 0) return 0;
    const ratio = overlap / descTokens.length;
    // Strict majority of description tokens must match exactly.
    if (ratio <= 0.5) return 0;
    // Prefer fuller coverage of the catalog name as a tie-breaker later.
    return Math.round(ratio * 60 + (overlap / nameTokens.length) * 10);
  }

  // Single-token descriptions: only accept when that token is the final
  // significant token of the item name (e.g. "Water" → "Filtered Water"),
  // and never for very short tokens.
  const token = descTokens[0];
  if (token.length < 4) return 0;
  if (nameTokens[nameTokens.length - 1] === token) {
    return 60 + Math.min(token.length, 10);
  }
  return 0;
}

export function matchItemByDescription(
  description: string,
  items: MatchableItem[]
): string {
  const desc = description.trim();
  if (!desc || items.length === 0) return "";

  const scored = items
    .map((item) => ({ id: item.id, score: scoreMatch(desc, item.name) }))
    .filter((entry) => entry.score >= MIN_ACCEPT_SCORE)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) return "";

  // Ambiguous: two equally good matches → leave for the user.
  if (scored.length > 1 && scored[0].score === scored[1].score) {
    return "";
  }

  return scored[0].id;
}
