import { useState } from "react";

const QUESTIONS = [
  ["Я никогда не играл в покер. Можно прийти?", "Да, опыт не обязателен. Перед началом скажите хостес, что это ваша первая игра."],
  ["Это игра на деньги?", "Нет. Играем на рейтинг клуба, без денежных ставок и денежного призового фонда."],
  ["Как записаться на турнир?", "Войдите через Telegram и выберите турнир в расписании. Запись можно отменить в той же карточке."],
  ["Мест нет. Есть смысл приходить?", "Можно записаться в лист ожидания. Участие станет доступно, когда освободится место."],
  ["Я опаздываю к началу", "Проверьте время закрытия регистрации в параметрах турнира. Присоединиться можно, пока регистрация открыта."],
  ["Что взять с собой?", "Документ, удостоверяющий личность, для подтверждения возраста. Запись и личный кабинет доступны через Telegram."],
  ["Что такое ребай и адон?", "Ребай - повторный вход после потери стека. Адон - дополнительные фишки в предусмотренный структурой турнира момент."],
  ["Как устроен рейтинг?", "Очки начисляются за результаты турниров, игровые комбинации и клубные награды. Сезонный рейтинг складывается из набранных за сезон очков."],
] as const;

export function ScheduleFaq() {
  const [openQuestion, setOpenQuestion] = useState<string | null>(null);
  const columns = [[0, 2, 3, 4], [1, 5, 6, 7]] as const;
  return <section className="schedule-faq" aria-labelledby="schedule-faq-title">
    <header className="schedule-faq-heading"><h2 id="schedule-faq-title">Вопросы перед первой игрой</h2></header>
    <div className="schedule-faq-grid">{columns.map((column, index) => <div className="schedule-faq-column" key={index}>
      {column.map(item => {
        const [question, answer] = QUESTIONS[item];
        return <details className="schedule-faq-item" key={question} open={openQuestion === question}>
          <summary onClick={event => {
            event.preventDefault();
            setOpenQuestion(current => current === question ? null : question);
          }}><span>{question}</span><svg viewBox="0 0 16 16" width="16" height="16" aria-hidden><path className="faq-minus" d="M3 8h10"/><path className="faq-plus" d="M8 3v10"/></svg></summary>
          <p>{answer}</p>
        </details>;
      })}
    </div>)}</div>
  </section>;
}
