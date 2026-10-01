/**
 * Заглушка на странице возврата после оплаты. Никаких ссылок, кнопок и
 * редиректов на проект: вкладка просто сообщает, что её можно закрыть, — а
 * статус платежа живёт там, откуда он пришёл. Показывается всем, кроме
 * владельца счёта: и покупателю внешнего проекта, и чужому пользователю.
 */
export function GatewayReturn() {
  return (
    <div
      role="status"
      className="rounded-panel border border-line bg-panel p-8 text-center"
    >
      <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink">
        Оплата
      </h1>
      <p className="mt-2 text-sm leading-6 text-muted">
        Можете закрыть эту страницу — статус платежа обновится автоматически.
      </p>
    </div>
  );
}
