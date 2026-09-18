// Curated educational references only; these never seed a user's exercise catalog.
const base = "https://www.acefitness.org/resources/everyone/exercise-library/";
const guides = [
  {
    names: ["push up", "push ups", "pushup", "pushups"],
    path: "41/push-up/",
    cue: "Brace your trunk, lower with control, then press the floor away. Keep hips and shoulders moving together.",
    easier: "Try the bent-knee version while building control.",
  },
  {
    names: ["bodyweight squat", "body weight squat", "air squat", "air squats"],
    path: "135/bodyweight-squat/",
    cue: "Keep your feet grounded. Bend hips and knees together, lower to a comfortable depth, then stand steadily.",
    easier:
      "Start with a smaller comfortable range and practice without added load.",
  },
  {
    names: ["bent over row", "barbell row", "barbell bent over row"],
    path: "12/bent-over-row/",
    cue: "Hinge at the hips and hold your torso steady. Pull the bar toward your trunk, then lower under control.",
    easier: "Practice the hinge and use a light load before adding weight.",
  },
  {
    names: ["front plank", "plank", "forearm plank"],
    path: "32/front-plank/",
    cue: "Brace your trunk and keep hips aligned with shoulders. Breathe normally rather than holding your breath.",
    easier:
      "Use short holds with good alignment. This is a timed hold, not a repetition exercise.",
  },
  {
    names: [
      "bent knee push up",
      "knee push up",
      "knee push ups",
      "kneeling push up",
    ],
    path: "13/bent-knee-push-up/",
    cue: "Support yourself on hands and knees. Brace your trunk and move from the knees without folding at the hips.",
    easier:
      "Reduce the lowering range until you can control the whole movement.",
  },
];
export function exerciseGuide(name: string) {
  const normalized = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const guide = guides.find((item) => item.names.includes(normalized));
  return guide ? { ...guide, url: base + guide.path } : undefined;
}
export const exerciseLibraryUrl = base;
