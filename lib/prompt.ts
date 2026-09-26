/**
 * Сборка промпта из выбранных стилей.
 *
 * Единственное место, где русские лейблы Студии превращаются в английские
 * фрагменты промпта. Используется на сервере при генерации.
 */

export type SelectionValue = string | string[] | null;
export type Selections = Record<string, SelectionValue>;

/** Базовое описание кадра: фотореализм и сохранение личности. */
const BASE =
  "Photorealistic editorial photograph of a real adult person (21+). " +
  "Natural skin texture and pores, sharp focus on the face, cinematic color grading, " +
  "professional photography, high detail.";

const KEEP_FACE =
  "Preserve the person's identity and facial features exactly from the reference photo.";

const FRAGMENTS: Record<string, Record<string, string>> = {
  location: {
    original: "Keep the original background, setting and location from the reference photo",
    beach:
      "The scene is set on a sunlit sandy beach with turquoise ocean water in the background",
    penthouse:
      "The scene is set inside a luxury penthouse with floor-to-ceiling windows and a city skyline",
    "night-city":
      "The scene is set on a neon-lit city street at night with soft bokeh lights",
    pool: "The scene is set at a luxury swimming pool with clear blue water and sun loungers",
    studio: "The scene is set in a minimalist professional photo studio with a seamless backdrop",
    nature:
      "The scene is set in lush green nature with soft sunlight filtering through the trees",
  },
  look: {
    original: "Keep the original clothing, outfit and styling from the reference photo",
    business: "wearing a tailored business suit, elegant and confident",
    evening: "wearing an elegant evening gown, sophisticated",
    casual: "wearing stylish casual clothes",
    swimwear: "wearing an elegant designer swimsuit",
    robe: "wearing a soft luxurious bathrobe",
    dress: "wearing a beautiful fitted dress",
  },
  light: {
    original: "Keep the original lighting from the reference photo",
    soft: "Soft diffused beauty lighting with flattering shadows",
    rim: "Dramatic rim lighting outlining the silhouette",
    neon: "Vibrant neon lighting with pink and blue accents",
    "golden-hour": "Warm golden-hour sunlight with a soft glow",
  },
  angle: {
    original: "Keep the original framing and camera angle from the reference photo",
    portrait: "Medium portrait framing, waist-up composition",
    "full-body": "Full-body composition, head to toe",
    back: "Viewed from behind, looking back over the shoulder",
  },
  explicit: {
    original:
      "Keep the original state of dress and clothing from the reference photo",
    erotic:
      "Tasteful erotic adult content (18+): sheer or revealing lingerie, sensual alluring pose, soft intimate mood",
    nude: "Artistic full nudity (18+): the person is completely undressed, tasteful nude photography, natural body, no clothing",
  },
  extras: {
    stockings: "wearing sheer thigh-high stockings",
    "police-cap": "wearing a police officer's peaked cap",
    "lace-gloves": "wearing long lace gloves",
    choker: "wearing a black choker necklace",
    sunglasses: "wearing stylish sunglasses",
    "wide-brim-hat": "wearing an elegant wide-brim hat",
  },
};

/** Добавляет фрагменты выбранных стилей в порядке категорий. */
function fragmentsFor(selections: Selections): string[] {
  const parts: string[] = [];
  // Полная нагота противоречит описанию одежды — пропускаем фрагмент «Образ».
  const nude = selections.explicit === "nude";
  for (const [category, options] of Object.entries(FRAGMENTS)) {
    const chosen = selections[category];
    if (!chosen) continue;
    if (category === "look" && nude) continue;
    const ids = Array.isArray(chosen) ? chosen : [chosen];
    for (const id of ids) {
      const fragment = options[id];
      if (fragment) parts.push(fragment);
    }
  }
  return parts;
}

/** Промпт для image-to-image (edit-lora). */
export function buildImagePrompt(
  selections: Selections,
  options: { keepFace?: boolean } = {},
): string {
  const parts = [BASE, ...fragmentsFor(selections)];
  parts.push(
    options.keepFace === false
      ? "You may restyle the person while keeping the overall pose."
      : KEEP_FACE,
  );
  return parts.join(" ");
}

/** Промпт для image-to-video (движение + те же стилистические акценты). */
export function buildVideoPrompt(selections: Selections): string {
  const parts = [BASE, ...fragmentsFor(selections)];
  parts.push(
    "Subtle cinematic camera push-in, natural hair and fabric movement, realistic motion, " +
      "smooth 24fps footage.",
  );
  return parts.join(" ");
}
