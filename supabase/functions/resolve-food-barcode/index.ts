import { createClient } from "npm:@supabase/supabase-js@2.112.4";

import { corsHeaders } from "../_shared/cors.ts";
import {
  normalizeBarcode,
  type BarcodeType,
} from "../_shared/barcode-normalization.ts";
import {
  finite,
  normalizeFoodProduct,
  openFoodFactsProductResult,
  positiveFinite,
  sentenceCaseFoodName,
} from "../_shared/food-normalization.ts";

type CatalogProduct = {
  id: string;
  provider: "open_food_facts";
  provider_id: string;
  barcode: string;
  food_name: string;
  brand: string | null;
  serving_label: string | null;
  serving_weight_grams: number | null;
  serving_volume_ml: number | null;
  household_quantity_per_serving: number | null;
  household_unit: string | null;
  calories_per_serving: number | null;
  protein_grams_per_serving: number | null;
  carbohydrate_grams_per_serving: number | null;
  fat_grams_per_serving: number | null;
  fiber_grams_per_serving: number | null;
  sugar_grams_per_serving: number | null;
  sodium_mg_per_serving: number | null;
  source_url: string | null;
  normalization_version: number;
  expires_at: string;
};

const NORMALIZATION_VERSION = 4;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function defaultKey(variable: string, legacy: string): string | undefined {
  const raw = Deno.env.get(variable);
  if (raw) {
    try {
      const values = JSON.parse(raw) as Record<string, string>;
      if (values.default) return values.default;
    } catch {
      // Hosted projects expose the new key collection as JSON. Fall through to
      // the legacy variable when running against an older local CLI.
    }
  }
  return Deno.env.get(legacy);
}

function responseProduct(product: CatalogProduct, cache: "fresh" | "refreshed" | "stale") {
  const hasServingBasis = Boolean(product.serving_label) ||
    positiveFinite(product.serving_weight_grams) !== null ||
    positiveFinite(product.serving_volume_ml) !== null ||
    positiveFinite(product.household_quantity_per_serving) !== null;
  return {
    catalogProductId: product.id,
    name: sentenceCaseFoodName(product.food_name),
    brand: product.brand,
    barcode: product.barcode,
    source: "open_food_facts",
    sourceUrl: product.source_url,
    servingLabel: product.serving_label,
    servingWeightGrams: positiveFinite(product.serving_weight_grams),
    servingVolumeMl: positiveFinite(product.serving_volume_ml),
    householdQuantityPerServing: positiveFinite(product.household_quantity_per_serving),
    householdUnit: product.household_unit,
    nutrientsPerServing: {
      calories: finite(product.calories_per_serving),
      proteinGrams: finite(product.protein_grams_per_serving),
      carbohydrateGrams: finite(product.carbohydrate_grams_per_serving),
      fatGrams: finite(product.fat_grams_per_serving),
      fiberGrams: finite(product.fiber_grams_per_serving),
      sugarGrams: finite(product.sugar_grams_per_serving),
      sodiumMg: finite(product.sodium_mg_per_serving),
    },
    complete:
      finite(product.calories_per_serving) !== null &&
      finite(product.protein_grams_per_serving) !== null &&
      hasServingBasis,
    cache,
  };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ code: "method_not_allowed", message: "Use POST." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const publishableKey = defaultKey("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
  const secretKey = defaultKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
  const authorization = request.headers.get("Authorization");
  if (!supabaseUrl || !publishableKey || !secretKey) {
    return json({ code: "server_configuration", message: "Food lookup is not configured." }, 500);
  }
  if (!authorization?.startsWith("Bearer ")) {
    return json({ code: "unauthorized", message: "Sign in before scanning food." }, 401);
  }
  const userClient = createClient(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const { data: authData, error: authError } = await userClient.auth.getUser(
    authorization.slice("Bearer ".length),
  );
  if (authError || !authData.user) {
    return json({ code: "unauthorized", message: "Your session is no longer valid." }, 401);
  }

  let body: { barcode?: unknown; type?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ code: "invalid_request", message: "Enter a barcode." }, 400);
  }
  const rawBarcode = typeof body.barcode === "string" ? body.barcode : "";
  const rawType = typeof body.type === "string" ? body.type : "unknown";
  const type: BarcodeType = ["ean13", "ean8", "upc_a", "upc_e"].includes(rawType)
    ? rawType as BarcodeType
    : "unknown";
  const normalized = normalizeBarcode(rawBarcode, type);
  if (!normalized) {
    return json({ code: "invalid_barcode", message: "That UPC/EAN barcode is not valid." }, 400);
  }

  const admin = createClient(supabaseUrl, secretKey, { auth: { persistSession: false } });
  const { data: lookup } = await admin
    .from("food_barcode_lookups")
    .select("product_id, status, expires_at")
    .eq("barcode", normalized.canonical)
    .maybeSingle();
  const now = Date.now();
  const fresh = lookup && new Date(lookup.expires_at).getTime() > now;
  if (fresh && lookup.status === "not_found") {
    return json({ code: "not_found", message: "No product was found. Create a private label instead." }, 404);
  }
  let staleProduct: CatalogProduct | null = null;
  if (lookup?.product_id) {
    const { data } = await admin
      .from("food_catalog_products")
      .select("*")
      .eq("id", lookup.product_id)
      .maybeSingle();
    staleProduct = data as CatalogProduct | null;
    if (
      fresh && staleProduct &&
      staleProduct.normalization_version >= NORMALIZATION_VERSION
    ) {
      return json(responseProduct(staleProduct, "fresh"));
    }
  }

  const userAgent = Deno.env.get("OPEN_FOOD_FACTS_USER_AGENT");
  if (!userAgent) {
    return json({ code: "server_configuration", message: "Open Food Facts identification is not configured." }, 500);
  }
  try {
    const fields = [
      "code", "product_name", "product_name_en", "brands", "serving_size",
      "serving_quantity", "serving_quantity_unit", "quantity",
      "product_quantity", "product_quantity_unit", "packagings", "nutrition",
    ].join(",");
    const response = await fetch(
      `https://world.openfoodfacts.org/api/v3.6/product/${normalized.providerBarcode}.json?fields=${fields}`,
      {
        headers: { "User-Agent": userAgent, Accept: "application/json" },
        signal: AbortSignal.timeout(8000),
      },
    );
    if (response.status === 404) {
      const expiresAt = new Date(now + 24 * 60 * 60 * 1000).toISOString();
      await admin.from("food_barcode_lookups").upsert({
        barcode: normalized.canonical,
        product_id: null,
        status: "not_found",
        checked_at: new Date().toISOString(),
        expires_at: expiresAt,
      });
      return json({ code: "not_found", message: "No product was found. Create a private label instead." }, 404);
    }
    if (!response.ok) throw new Error(`Open Food Facts returned ${response.status}`);
    const payload = await response.json();
    const providerResult = openFoodFactsProductResult(payload);
    if (providerResult.kind === "not_found") {
      const expiresAt = new Date(now + 24 * 60 * 60 * 1000).toISOString();
      await admin.from("food_barcode_lookups").upsert({
        barcode: normalized.canonical,
        product_id: null,
        status: "not_found",
        checked_at: new Date().toISOString(),
        expires_at: expiresAt,
      });
      return json({ code: "not_found", message: "No product was found. Create a private label instead." }, 404);
    }
    if (providerResult.kind !== "found") {
      throw new Error("Open Food Facts returned an invalid product response");
    }
    const value = normalizeFoodProduct(
      providerResult.product,
      normalized.providerBarcode,
    );
    const expiresAt = new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString();
    const sourceUrl = `https://world.openfoodfacts.org/product/${normalized.providerBarcode}`;
    const { data: saved, error: saveError } = await admin
      .from("food_catalog_products")
      .upsert({
        provider: "open_food_facts",
        provider_id: value.providerId,
        barcode: normalized.canonical,
        food_name: value.foodName,
        brand: value.brand,
        serving_label: value.serving.label,
        serving_weight_grams: value.serving.weightGrams,
        serving_volume_ml: value.serving.volumeMl,
        household_quantity_per_serving: value.serving.householdQuantity,
        household_unit: value.serving.householdUnit,
        calories_per_serving: value.nutrients.calories,
        protein_grams_per_serving: value.nutrients.proteinGrams,
        carbohydrate_grams_per_serving: value.nutrients.carbohydrateGrams,
        fat_grams_per_serving: value.nutrients.fatGrams,
        fiber_grams_per_serving: value.nutrients.fiberGrams,
        sugar_grams_per_serving: value.nutrients.sugarGrams,
        sodium_mg_per_serving: value.nutrients.sodiumMg,
        source_url: sourceUrl,
        normalization_version: NORMALIZATION_VERSION,
        fetched_at: new Date().toISOString(),
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      }, { onConflict: "provider,provider_id" })
      .select("*")
      .single();
    if (saveError || !saved) throw new Error(saveError?.message ?? "Could not cache product");
    await admin.from("food_barcode_lookups").upsert({
      barcode: normalized.canonical,
      product_id: saved.id,
      status: "found",
      checked_at: new Date().toISOString(),
      expires_at: expiresAt,
    });
    return json(responseProduct(saved as CatalogProduct, "refreshed"));
  } catch (error) {
    if (
      staleProduct &&
      staleProduct.normalization_version >= NORMALIZATION_VERSION
    ) {
      return json(responseProduct(staleProduct, "stale"));
    }
    return json({
      code: "provider_unavailable",
      message: "Open Food Facts is temporarily unavailable. Try again. If the scanned digits look wrong, type the barcode manually.",
      detail: error instanceof Error ? error.message : undefined,
    }, 503);
  }
});
