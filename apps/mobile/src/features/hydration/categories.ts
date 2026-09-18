export const drinkCategories = [
  { id: "water", label: "Water", group: "Water" },
  { id: "sparkling_water", label: "Sparkling water", group: "Water" },
  { id: "flavored_water", label: "Flavored water", group: "Water" },
  { id: "electrolytes", label: "Electrolyte water", group: "Water" },
  { id: "sports_drink", label: "Sports drink", group: "Water" },
  {
    id: "rehydration_solution",
    label: "Oral rehydration solution",
    group: "Water",
  },
  { id: "coffee", label: "Coffee", group: "Coffee & tea" },
  { id: "espresso", label: "Espresso / cold brew", group: "Coffee & tea" },
  { id: "milk_coffee", label: "Milk coffee / latte", group: "Coffee & tea" },
  { id: "tea", label: "Tea", group: "Coffee & tea" },
  { id: "herbal_tea", label: "Herbal / decaf tea", group: "Coffee & tea" },
  { id: "iced_tea", label: "Iced / sweet tea", group: "Coffee & tea" },
  { id: "matcha_chai", label: "Matcha / chai / mate", group: "Coffee & tea" },
  { id: "soda", label: "Soda", group: "Soft drinks" },
  { id: "diet_soda", label: "Diet / zero soda", group: "Soft drinks" },
  { id: "energy_drink", label: "Energy drink", group: "Soft drinks" },
  {
    id: "energy_shot",
    label: "Energy shot / pre-workout",
    group: "Soft drinks",
  },
  { id: "milk", label: "Milk / flavored milk", group: "Milk & shakes" },
  { id: "plant_milk", label: "Plant milk", group: "Milk & shakes" },
  { id: "yogurt", label: "Drinkable yogurt / kefir", group: "Milk & shakes" },
  { id: "cocoa", label: "Hot chocolate", group: "Milk & shakes" },
  {
    id: "protein_shake",
    label: "Protein / meal shake",
    group: "Milk & shakes",
  },
  { id: "smoothie", label: "Smoothie / milkshake", group: "Milk & shakes" },
  { id: "juice", label: "Fruit / vegetable juice", group: "Other drinks" },
  { id: "lemonade", label: "Lemonade / juice drink", group: "Other drinks" },
  { id: "coconut_water", label: "Coconut water", group: "Other drinks" },
  { id: "bubble_tea", label: "Bubble tea", group: "Other drinks" },
  {
    id: "kombucha",
    label: "Kombucha / fermented drink",
    group: "Other drinks",
    askAlcohol: true,
  },
  { id: "alcohol_free", label: "0.0% drink / mocktail", group: "Other drinks" },
  { id: "broth", label: "Broth / clear soup", group: "Other drinks" },
  {
    id: "beer",
    label: "Beer / cider / hard seltzer",
    group: "Alcohol",
    alcohol: true,
  },
  { id: "wine", label: "Wine", group: "Alcohol", alcohol: true },
  {
    id: "spirits",
    label: "Spirits / liqueurs",
    group: "Alcohol",
    alcohol: true,
  },
  { id: "cocktail", label: "Cocktail", group: "Alcohol", alcohol: true },
  { id: "other", label: "Other", group: "Other drinks", askAlcohol: true },
] as const;
export type DrinkCategoryId = (typeof drinkCategories)[number]["id"];
export type AlcoholStatus = "nonalcoholic" | "alcoholic" | "unknown";
export function getDrinkCategory(id: string) {
  return drinkCategories.find((category) => category.id === id);
}
export function categoryAlcoholStatus(
  id: DrinkCategoryId,
  answer?: AlcoholStatus,
): AlcoholStatus {
  const category = getDrinkCategory(id);
  if (!category) throw new Error("Choose a drink category.");
  if ("alcohol" in category) return "alcoholic";
  if ("askAlcohol" in category) return answer ?? "unknown";
  return "nonalcoholic";
}
