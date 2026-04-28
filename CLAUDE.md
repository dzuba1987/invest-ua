# investment-calculator

PWA для управління інвестиційним портфелем (ОВДП, депозити, облігації) + календар витрат + Telegram-бот. Українською. Деплоїться через GitHub Pages (CNAME → `investua.app`).

## Мова

Усі коментарі, рядки UI, повідомлення комітів — **українською**. Технічні ідентифікатори, ключі i18n, імена змінних — англійською.

## Архітектура файлів

| Файл | Призначення |
|---|---|
| `index.html` | Розмітка. **Без inline `<style>` чи `<script>`** (окрім `<script src="...">`). |
| `styles.css` | Усі стилі. |
| `app.js` | Старий моноліт — НЕ додавати сюди нову функціональність. Тільки фікси і поступовий міграційний рефакторинг у `modules/`. |
| `i18n.js` | Локалізація (uk/en). Кожен новий рядок UI має ключ в обох мовах. |
| `modules/<feature>.js` | **Усе нове** живе тут: `purchase-calendar.js`, `purchase-form.js`, `firebase.js`, `telegram.js`, `ui-dialog.js` тощо. |
| `sw.js` | Service Worker. Список `ASSETS` має включати кожен файл, який потрібно офлайн. |

### Separation of concerns (тверде правило)

- HTML — структура. CSS — вигляд. JS — поведінка. Не змішувати.
- Нові фічі — окремий файл `modules/<feature>.js`, експорт через `window.<Feature>` або ES-import згідно з існуючим стилем модуля.
- Якщо тимчасово потрібен inline-блок (PWA install hint тощо) — обґрунтуй у коментарі і відкрий тікет на винесення.

## Service Worker і кеш

`sw.js → CACHE_NAME = 'invest-calc-vNNN'`. Версію треба **бампати щоразу**, коли змінюється будь-який файл зі списку `ASSETS`, інакше користувачі отримають старий код.

При додаванні нового статичного ассета:
1. Додай шлях у масив `ASSETS` в `sw.js`.
2. Інкрементуй `CACHE_NAME` (`v121` → `v122`).
3. Перевір, що `node -c sw.js` проходить.

`pre-push` hook (`.githooks/pre-push`) автоматично регенерує `changelog.js` і бампає `sw.js`, але тільки коли є нові коміти — не покладайся лише на нього.

## Числові таблиці

Колонки з числами (суми, відсотки, дати у форматі `YYYY-MM-DD`) — **праворуч**:

```html
<th class="num">Сума</th>
<td class="num">12 345.67</td>
```

CSS-правило вже існує (`.saved-table th.num`, `.history-table th.num` тощо). Перш ніж додавати нову таблицю — постав `class="num"` на числові `<th>` одразу.

## Витрати, що повторюються (recurring)

Логіка проєкції на майбутні місяці — `_projectRecurringForMonth(items, cm)` у `modules/purchase-calendar.js`. Він використовується **і** календарною сіткою, **і** дашбордом — не дублювати.

Правила:
- Recurring елемент, не куплений, у минулому місяці — НЕ показувати у "Прострочено" коли активний місяць у майбутньому (`if (p.recurring && cm > realCm && pm >= realCm) return;`).
- На календарі spojена точка для прогнозу — `.purchase-calendar-day-dot.is-projected` (dashed border, transparent bg).

## Calculator math (важливі інваріанти)

- Період у роках = `days / 365.25` (а не `/365`) — щоб коректно обробляти високосні роки. Якщо період охоплює 29 лютого, ставка `36%` річних показує `36.02%` за період (529/365.25 \* 36 ≈ ...).
- Hero-блок показує **після податку** ("Сума отримання (на руки)", "Прибуток (після податку)").
- Форма приймає **до податку** ("Сума отримання (грн, до податку)").
- Якщо період містить 29.02 — додається ℹ️ tooltip, який пояснює, чому не рівно 36%.
- Compound (реінвест): `dailyGross = expectedProfit / days` — і деталь, і дашборд мають збігатись.

## Тестування

```bash
npm test           # Playwright — tests/*.spec.js
```

Конфіг: `modules/playwright.config.js`. Сервер на `8081` — `npx serve -l 8081 -s ..` стартує автоматично.

**Перед закриттям UI-задачі**: відкрий локально (`npx serve -l 8081 .` + `http://localhost:8081`) і перевір у браузері. Тести покривають логіку, не перевіряють вигляд. Якщо не запускав вживу — скажи це явно у звіті.

## Коміт-конвенції

- Українською, у форматі `Section: коротко що змінилось`. Приклади з `git log`:
  - `Refactor: extract purchase form, calendar, and date helpers into modules`
  - `Profile: add Telegram purchase-reminder settings (toggle + lead time)`
  - `Budget card: shorten title to «Бюджет на <Місяць>» (capitalized, no year)`
- Без emoji в title (вони ламають деякі CI парсери). Якщо emoji треба — у body.
- Не пушити з `--no-verify` — `pre-push` робить корисну роботу (регенерація changelog).

## Слеш-команди

| Команда | Дія |
|---|---|
| `/test-pwa` | Прогін Playwright + smoke-чекліст |
| `/bump-cache` | Інкремент `CACHE_NAME` + verify ASSETS відповідає файловій системі |
| `/check-soc` | Аудит порушень separation of concerns |

## Зовнішні залежності

- **Firebase Firestore** — `purchases`, `sharedPurchases`, `income` колекції під `users/{uid}/...`. Конфіг — `config.js`.
- **Telegram Bot** — backend живе у сусідньому репо `invest-notify` (Laravel, Hostinger). Не намагайся правити бот тут — тільки змінні (URL до webhook) у `config.js`.
- **Mof.gov.ua** — джерело курсів ОВДП (через бекенд).

## Чого НЕ робити

- НЕ додавати inline `<style>`/`<script>` в `index.html` (крім `<script src>`).
- НЕ створювати нові .js файли в корені — тільки в `modules/`.
- НЕ забувати інкрементити `CACHE_NAME`, навіть якщо здається "це маленька зміна".
- НЕ додавати i18n ключ в одну мову — обидві (`uk` + `en`) обов'язково.
- НЕ amend-ити коміти, що вже у `origin/main` — створювати нові.
