export const PLAYER_CHAR = "boy";
export const LESSON_ROTATION = ["boy", "girl", "bear", "akbuzat"];
export const ROTATE_PER = "lesson";
export const UNIT_CAST = {
  1: { guides: ["boy", "granny"], boss: "granny" },
  2: { guides: ["girl", "bear", "akbuzat"], boss: "bear" },
  3: { guides: ["girl", "boy"], boss: "akbuzat" },
};

export function lessonCharacter(unitId, lessonId, stepIndex = 0) {
  const cast = UNIT_CAST[unitId] || UNIT_CAST[1];
  if (ROTATE_PER === "step") return LESSON_ROTATION[stepIndex % LESSON_ROTATION.length];
  return cast.guides[(lessonId - 1) % cast.guides.length] || LESSON_ROTATION[lessonId % LESSON_ROTATION.length];
}
