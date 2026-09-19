import assert from "node:assert/strict";
import test from "node:test";
import { serviceErrorMessage } from "./service-errors";

test("missing hardening schema explains the service update without suggesting data was lost", () => {
  for (const message of [
    "Could not find the function public.read_vital_changes(p_after, p_limit, p_through, p_user_id) in the schema cache",
    "column user_food_profiles.version does not exist",
    "column workout_sessions.version does not exist",
  ])
    assert.match(
      serviceErrorMessage({ message }),
      /service update is pending.*retained/,
    );
  assert.equal(
    serviceErrorMessage(new Error("Network unavailable")),
    "Network unavailable",
  );
});
