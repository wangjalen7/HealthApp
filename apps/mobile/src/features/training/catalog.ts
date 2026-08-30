/** Rank names already saved by this user; the app deliberately ships with no seeded exercise list. */
export function rankSavedNames(names: string[], query: string): string[] {
  const normalized = query.trim().toLowerCase(); if (!normalized) return [];
  const terms = normalized.split(/\s+/).filter(Boolean);
  return [...new Set(names.map((name) => name.trim()).filter(Boolean))]
    .map((name) => { const candidate = name.toLowerCase(); const score = (candidate.includes(normalized) ? 100 : 0) + terms.filter((term) => candidate.includes(term)).length * 15 + (candidate.startsWith(normalized) ? 10 : 0); return { name, score }; })
    .filter((item) => item.score > 0).sort((left, right) => right.score - left.score || left.name.localeCompare(right.name)).slice(0, 5).map((item) => item.name);
}
