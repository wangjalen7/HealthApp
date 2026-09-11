# ADR-004: Consented AI meal estimates through Supabase

**Status:** Accepted — 2026-09-11

## Decision

Use a Supabase Edge Function calling OpenAI Responses for the first AI Coach feature: separate food labels from a meal photo and/or description. Keep API credentials on the server, require a valid signed-in user and per-request consent, and send only the explicitly supplied meal input. No personal history or other health context is queried for this feature.

Validate strict structured output on both sides. Use a reproducible one-serving nutrient basis plus a distinct consumed amount so the existing portion calculator remains authoritative. Countable foods use a singular household unit and per-item serving, so eight dumplings remain editable as `8 dumplings`; other foods include estimated serving weight or volume. Users review/edit/remove components before accepting them into their existing meal draft. Acceptance creates private reusable profiles; the existing Save meal action writes immutable history. Label descriptions and AI source provenance survive persistence and reuse.

## Consequences

- Reuses the existing nutrition/profile/RLS workflow and installed camera/image modules; no separate backend or native dependency.
- Photos remain transient inputs, and no raw meal inputs or provider bodies are logged by the function. `store: false` does not override the provider account's retention policies.
- Server-side atomic per-user daily quotas, finite timeouts and bounded inputs limit spending and resource use. No paid automatic retries. Provider project spending limits are a separate operational setting.
- Treat a photo and its optional description as two views of one meal. Prompt the model to return each component once, then remove normalized duplicate names at the trust boundary and exact duplicate entries at draft append time.
- Use `gpt-5.4-mini` by default as the quality/cost balance for food-photo decomposition. Keep high image detail and strict validation, cap output at 3,500 tokens, and allow a server-secret model override for measured comparisons. Do not move to the much cheaper `gpt-4o-mini` without evaluating portion/nutrition accuracy on representative meals.
- Nutrition and portions are estimates, particularly hidden ingredients and unmeasured photos. Confidence and assumptions remain visible; this feature gives no diagnoses or dietary prescriptions.
- Missing credentials show a clear setup message while manual logging remains usable. Activation, deployment and live-quality evaluation are documented in [AI_MEAL_SETUP.md](../AI_MEAL_SETUP.md).
- Broader daily coaching, USDA grounding, persisted raw AI sessions and a measured food-photo evaluation dataset remain outside this first feature.
