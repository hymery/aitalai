const REWARD_BASE = `${import.meta.env.BASE_URL}rewards/`;

const rewardImages = (id) => ({
  img: `${REWARD_BASE}${id}.webp`,
  imgLocked: `${REWARD_BASE}${id}-locked.webp`,
});

export const AWARDS = [
  { id: "first_answer", title: "Первый голос", desc: "Проверь первую фразу в Китапхане", goal: 1, ...rewardImages("first-vote") },
  { id: "corrector", title: "Внимательный редактор", desc: "Предложи первое исправление перевода", goal: 1, ...rewardImages("attentive-editor") },
  { id: "hundred_points", title: "Сотня очков", desc: "Набери 100 очков", goal: 100, ...rewardImages("hundred-points") },
  { id: "ten_answers", title: "Хранитель языка", desc: "Проверь 10 фраз в Китапхане", goal: 10, ...rewardImages("language-keeper") },
  { id: "boss-1", title: "Чаепитие у Өләсәй", desc: "Пройди раздел «Чаепитие у Өләсәй»", goal: 4, unitId: 1, ...rewardImages("tea-at-olesey") },
  { id: "boss-2", title: "Моя семья и друзья", desc: "Пройди раздел «Моя семья и друзья»", goal: 4, unitId: 2, ...rewardImages("family-friends") },
  { id: "boss-3", title: "Путешествие с Аҡбүзатом", desc: "Пройди раздел «Путешествие с Аҡбүзатом»", goal: 4, unitId: 3, ...rewardImages("akbuzat-journey") },
];

export const AVATAR_UNLOCK = {
  maskot: null,
  olesey: "boss-1",
  shurale: "ten_answers",
  uralbatyr: "hundred_points",
  humay: "boss-2",
  akbuzat: "boss-3",
  salavat: "corrector",
};

export const AVATAR_CHARACTERS = [
  { id: "maskot", name: "Мальчик", sprite: "boy" },
  { id: "olesey", name: "Өләсәй", sprite: "granny" },
  { id: "shurale", name: "Шурале" },
  { id: "uralbatyr", name: "Урал батыр" },
  { id: "humay", name: "Хумай" },
  { id: "akbuzat", name: "Аҡбүзат", sprite: "akbuzat" },
  { id: "salavat", name: "Салават" },
];

export const AVATAR_COLORS = ["blue-500", "green-500", "gold-500", "red-500", "blue-100", "green-100"];
