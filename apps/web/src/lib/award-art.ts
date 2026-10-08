import type { Achievement } from "@poker/contracts";

export const AWARD_ART = [
  { id: "trophy", title: "Кубок", src: "/images/awards/trophy.svg" },
  { id: "crown", title: "Корона", src: "/images/awards/crown.svg" },
  { id: "laurel", title: "Лавровый венок", src: "/images/awards/laurel.svg" },
  { id: "ace", title: "Туз", src: "/images/awards/ace.svg" },
  { id: "chip", title: "Фишка", src: "/images/awards/chip.svg" },
  { id: "shield", title: "Щит", src: "/images/awards/shield.svg" },
  { id: "flame", title: "Пламя", src: "/images/awards/flame.svg" },
  { id: "phoenix", title: "Феникс", src: "/images/awards/phoenix.svg" },
  { id: "star", title: "Звезда", src: "/images/awards/star.svg" },
  { id: "target", title: "Мишень", src: "/images/awards/target.svg" },
  { id: "lightning", title: "Молния", src: "/images/awards/lightning.svg" },
  { id: "mountain", title: "Вершина", src: "/images/awards/mountain.svg" },
  { id: "clock", title: "Часы", src: "/images/awards/clock.svg" },
  { id: "calendar", title: "Календарь", src: "/images/awards/calendar.svg" },
  { id: "compass", title: "Компас", src: "/images/awards/compass.svg" },
  { id: "diamond", title: "Бриллиант", src: "/images/awards/diamond.svg" },
  { id: "key", title: "Ключ", src: "/images/awards/key.svg" },
  { id: "handshake", title: "Рукопожатие", src: "/images/awards/handshake.svg" },
  { id: "podium", title: "Подиум", src: "/images/awards/podium.svg" },
  { id: "flag", title: "Флаг", src: "/images/awards/flag.svg" },
  { id: "swords", title: "Мечи", src: "/images/awards/swords.svg" },
  { id: "book", title: "Книга", src: "/images/awards/book.svg" },
  { id: "orbit", title: "Орбита", src: "/images/awards/orbit.svg" },
  { id: "heart", title: "Сердце клуба", src: "/images/awards/heart.svg" },
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
  if (match) return `/images/awards/${match[1]}.svg`;
  let hash = 0;
  for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return AWARD_ART[hash % AWARD_ART.length]!.src;
}
