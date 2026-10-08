const ICONS = {
  trophy: <><path d="M8 4h8v5a4 4 0 0 1-8 0V4Zm0 2H5v2a3 3 0 0 0 3 3m8-5h3v2a3 3 0 0 1-3 3M12 13v5m-4 2h8m-6-2h4"/></>,
  pin: <><path d="M18 10c0 5-6 10-6 10S6 15 6 10a6 6 0 1 1 12 0Z"/><circle cx="12" cy="10" r="2"/></>,
  cards: <><rect x="5" y="4" width="10" height="15" rx="2" transform="rotate(-9 10 12)"/><path d="m16 5 3 1a2 2 0 0 1 1 2l-2 11a2 2 0 0 1-2 2l-3-1M9 9l2-2 2 2-2 2Z"/></>,
  age: <><circle cx="12" cy="12" r="8"/><path d="M7 10h1v5m3-3c-2-3 4-3 2 0-3 4 4 4 1 0m3-2v4m-2-2h4"/></>,
};

export function ClubOverview() {
  const cards = [
    { title: "Рейтинговые турниры", icon: "trophy" as const, image: "/images/club-overview/tournaments-v1.webp", className: "club-fact-tournaments", content: <p>Очки за результаты и игровые комбинации.</p> },
    { title: "Адрес", icon: "pin" as const, image: "/images/club-overview/venue-v1.webp", className: "club-fact-address", content: <p>Ульяновск, ул. Гагарина, 25</p> },
    { title: "Texas Hold’em", icon: "cards" as const, image: "/images/club-overview/holdem-v1.webp", className: "club-fact-format", content: <p>Безлимитный холдем.<br/>Большой блайнд + анте.</p> },
    { title: "Участие 18+", icon: "age" as const, image: "/images/club-overview/adults-v1.webp", className: "club-fact-age", content: <p>При себе - документ, удостоверяющий личность.</p> },
  ];
  return <section className="club-overview" aria-labelledby="club-overview-title">
    <header className="club-overview-heading"><h2 id="club-overview-title">О клубе</h2></header>
    <div className="club-facts-grid">{cards.map(card => <article className={`club-fact ${card.className}`} key={card.icon}>
      <img src={card.image} alt="" loading="lazy" decoding="async"/>
      <div className="club-fact-content">
        <span className="club-fact-icon"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{ICONS[card.icon]}</svg></span>
        <h3>{card.title}</h3>{card.content}
      </div>
    </article>)}</div>
  </section>;
}
