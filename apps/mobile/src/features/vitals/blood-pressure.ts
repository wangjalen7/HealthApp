export const bloodPressureCategories = [
  {
    id: "normal",
    label: "Normal",
    color: "#18794E",
    backgroundColor: "#E8F5EE",
  },
  {
    id: "elevated",
    label: "Elevated",
    color: "#A86000",
    backgroundColor: "#FFF3D6",
  },
  {
    id: "stage_1",
    label: "Stage 1 Hypertension",
    color: "#C24E00",
    backgroundColor: "#FFF0E5",
  },
  {
    id: "stage_2",
    label: "Stage 2 Hypertension",
    color: "#B42318",
    backgroundColor: "#FDECEC",
  },
] as const;

export type BloodPressureCategory = (typeof bloodPressureCategories)[number];

const categoryById = Object.fromEntries(
  bloodPressureCategories.map((category) => [category.id, category]),
) as Record<BloodPressureCategory["id"], BloodPressureCategory>;

export function classifyBloodPressure(
  systolic: number,
  diastolic: number,
): BloodPressureCategory {
  if (systolic >= 140 || diastolic >= 90) return categoryById.stage_2;
  if (systolic >= 130 || diastolic >= 80) return categoryById.stage_1;
  if (systolic >= 120 && diastolic < 80) return categoryById.elevated;
  return categoryById.normal;
}
