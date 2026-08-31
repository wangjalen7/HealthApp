/** Rank names already saved by this user; the app deliberately ships with no seeded exercise list. */
function searchableName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function rankSavedNames(names: string[], query: string): string[] {
  const normalized = searchableName(query); if (!normalized) return [];
  const terms = normalized.split(/\s+/).filter(Boolean);
  return [...new Set(names.map((name) => name.trim()).filter(Boolean))]
    .map((name) => { const candidate = searchableName(name); const compactCandidate = candidate.replace(/\s/g, ""); const compactQuery = normalized.replace(/\s/g, ""); const score = (candidate.includes(normalized) || compactCandidate.includes(compactQuery) ? 100 : 0) + terms.filter((term) => candidate.includes(term)).length * 15 + (candidate.startsWith(normalized) ? 10 : 0); return { name, score }; })
    .filter((item) => item.score > 0).sort((left, right) => right.score - left.score || left.name.localeCompare(right.name)).slice(0, 5).map((item) => item.name);
}
