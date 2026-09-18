# ADR-006: Reusable recipes from immutable ingredient snapshots

**Status:** Accepted — 2026-09-17

## Decision

Store each user-owned recipe with a name, optional description, declared serving yield, and the exact reviewed meal-draft entries used as its ingredients. Recipe ingredients are immutable nutrition snapshots, matching Food History semantics: later edits or archival of an individual food label do not silently rewrite a saved recipe. Editing a recipe is a future explicit replacement operation rather than an automatic cascade.

Derive recipe nutrition by totaling every ingredient and dividing by the declared yield. Required calories and protein always total; an optional nutrient remains unknown if any ingredient omits it. A recipe cannot contain another recipe, avoiding opaque nesting and circular composition.

At logging time, represent one declared recipe serving through the existing portion calculator. Users may enter a decimal/fractional serving or select the whole-recipe unit and enter a fraction such as `1/4`. A yield of one represents a complete single-serving item such as a sandwich. Completed nutrition entries retain `recipe_id` plus their immutable consumed nutrition snapshot.

## Consequences

- Recipe calculations reuse the tested food amount and nutrient model instead of maintaining separate logging arithmetic.
- Ingredient amounts remain visible in recipe management, while Food History stays concise as one consumed recipe entry.
- Archived recipes disappear from selection but remain available to historical foreign keys; past meals never change.
- Every recipe is scoped by `user_id`, protected by RLS, and included in portable data export.
- Snapshot semantics favor reproducibility. Recipe ingredients are assembled in a recipe-only draft rather than borrowed from the current meal. If a food label or preparation changes, the user creates a new recipe with the revised ingredients.
