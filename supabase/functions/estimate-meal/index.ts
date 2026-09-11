import { createClient } from "npm:@supabase/supabase-js@2.112.4";
import { corsHeaders } from "../_shared/cors.ts";
import { createMealHandler } from "./handler.ts";

function key(collection: string, legacy: string) {
  try {
    const value = JSON.parse(Deno.env.get(collection) ?? "{}");
    if (typeof value.default === "string") return value.default;
  } catch {
    /* Older projects expose only the legacy variable. */
  }
  return Deno.env.get(legacy);
}

Deno.serve(
  createMealHandler({
    apiKey: Deno.env.get("OPENAI_API_KEY"),
    model: Deno.env.get("OPENAI_MEAL_MODEL") || "gpt-5.4-mini",
    headers: corsHeaders,
    authenticate: async (token) => {
      const url = Deno.env.get("SUPABASE_URL");
      const publicKey = key("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
      if (!url || !publicKey) throw new Error("Missing Supabase configuration");
      const client = createClient(url, publicKey, {
        auth: { persistSession: false },
      });
      const { data, error } = await client.auth.getUser(token);
      return error ? undefined : data.user?.id;
    },
    consumeQuota: async (userId) => {
      const url = Deno.env.get("SUPABASE_URL");
      const secret = key("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
      if (!url || !secret) throw new Error("Missing Supabase configuration");
      const admin = createClient(url, secret, {
        auth: { persistSession: false },
      });
      const { data, error } = await admin.rpc("consume_meal_estimate_quota", {
        p_user_id: userId,
      });
      if (error) throw new Error("Meal quota unavailable");
      return data === true;
    },
    reportProviderFailure: (failure) => {
      // Only operational metadata is logged. Never log the key, meal input,
      // image, provider message, provider body, or generated content.
      console.error("OpenAI meal estimate request failed", failure);
    },
  }),
);
