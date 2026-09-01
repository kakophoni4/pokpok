import { Link } from "react-router-dom";
import { Card, PageHeader } from "../components/ui";

export function RulesPage() {
  return (
    <>
      <PageHeader title="Правила клуба" />

      <Card className="space-y-4 text-sm leading-relaxed text-stone-300">
        <section>
          <h2 className="mb-1 font-semibold text-stone-100">Не азартная игра</h2>
          <p>
            Клуб проводит спортивный покер без денежных ставок. Вход, ребай, адон и бар — это
            оплата участия и сервиса клуба. Призовой фонд в деньгах не разыгрывается: результат
            вечера выражается рейтингом.
          </p>
        </section>

        <section>
          <h2 className="mb-1 font-semibold text-stone-100">Поведение за столом</h2>
          <p>
            Уважайте игроков и персонал. Оскорбления, давление, читерство и порча имущества не
            допускаются. Организатор может отказать в участии без объяснения причин.
          </p>
        </section>

        <section>
          <h2 className="mb-1 font-semibold text-stone-100">Регистрация и рейтинг</h2>
          <p>
            Запись на турнир — через сайт или бота. Места в рейтинге отмечаются только призовые.
            Ник в таблице меняет администратор.
          </p>
        </section>

        <section>
          <h2 className="mb-1 font-semibold text-stone-100">Согласие</h2>
          <p>
            Пользуясь сайтом и ботом, вы подтверждаете, что ознакомились с этими правилами и что
            игра не ведётся на деньги.
          </p>
        </section>

        <p>
          <Link to="/" className="text-gold-400 hover:underline">
            ← К расписанию
          </Link>
        </p>
      </Card>
    </>
  );
}
