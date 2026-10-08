import type { Achievement } from "@poker/contracts";

export const AWARD_ART = [
  { id: "trophy", title: "Кубок", src: "/images/awards/textured-v1/trophy.webp" },
  { id: "crown", title: "Корона", src: "/images/awards/textured-v1/crown.webp" },
  { id: "laurel", title: "Лавровый венок", src: "/images/awards/textured-v1/laurel.webp" },
  { id: "ace", title: "Туз", src: "/images/awards/textured-v1/ace.webp" },
  { id: "chip", title: "Фишка", src: "/images/awards/textured-v1/chip.webp" },
  { id: "shield", title: "Щит", src: "/images/awards/textured-v1/shield.webp" },
  { id: "flame", title: "Пламя", src: "/images/awards/textured-v1/flame.webp" },
  { id: "phoenix", title: "Феникс", src: "/images/awards/textured-v1/phoenix.webp" },
  { id: "star", title: "Звезда", src: "/images/awards/textured-v1/star.webp" },
  { id: "target", title: "Мишень", src: "/images/awards/textured-v1/target.webp" },
  { id: "lightning", title: "Молния", src: "/images/awards/textured-v1/lightning.webp" },
  { id: "mountain", title: "Вершина", src: "/images/awards/textured-v1/mountain.webp" },
  { id: "clock", title: "Часы", src: "/images/awards/textured-v1/clock.webp" },
  { id: "calendar", title: "Календарь", src: "/images/awards/textured-v1/calendar.webp" },
  { id: "compass", title: "Компас", src: "/images/awards/textured-v1/compass.webp" },
  { id: "diamond", title: "Бриллиант", src: "/images/awards/textured-v1/diamond.webp" },
  { id: "key", title: "Ключ", src: "/images/awards/textured-v1/key.webp" },
  { id: "handshake", title: "Рукопожатие", src: "/images/awards/textured-v1/handshake.webp" },
  { id: "podium", title: "Подиум", src: "/images/awards/textured-v1/podium.webp" },
  { id: "flag", title: "Флаг", src: "/images/awards/textured-v1/flag.webp" },
  { id: "swords", title: "Мечи", src: "/images/awards/textured-v1/swords.webp" },
  { id: "book", title: "Книга", src: "/images/awards/textured-v1/book.webp" },
  { id: "orbit", title: "Орбита", src: "/images/awards/textured-v1/orbit.webp" },
  { id: "heart", title: "Сердце клуба", src: "/images/awards/textured-v1/heart.webp" },
] as const;

export function defaultAwardArt(achievement: Pick<Achievement, "code" | "title">): string {
  const key = `${achievement.code} ${achievement.title}`.toLocaleLowerCase("ru-RU");
  const choices: Array<[RegExp, string]> = [
    [/сезон.*чемпион|чемпион.*сезон|season.champion/, "crown"],
    [/триумф|triumph|три.*побед/, "laurel"],
    [/душа|помощ|soul|helper/, "heart"],
    [/пропущ|attendance|посещ/, "calendar"],
    [/подиум|top.3|podium/, "podium"],
    [/постоян|regular|завсегдат/, "clock"],
    [/перв.*побед|first.win/, "trophy"],
    [/перв.*турнир|first.tournament/, "ace"],
    [/финал|final/, "flag"],
    [/легенд|legend/, "phoenix"],
    [/ветеран|veteran/, "shield"],
    [/побед|win|victory/, "star"],
  ];
  const match = choices.find(([pattern]) => pattern.test(key));
  if (match) return `/images/awards/textured-v1/${match[1]}.webp`;
  let hash = 0;
  for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return AWARD_ART[hash % AWARD_ART.length]!.src;
}

/** Keep existing selected library icons without changing stored achievements. */
export function resolveAwardArt(source: string): string {
  const old = source.match(/^\/images\/awards\/([a-z]+)\.svg$/);
  return old ? AWARD_ART.find(art => art.id === old[1])?.src ?? source : source;
}