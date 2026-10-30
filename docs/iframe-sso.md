# Автоматический вход в DataLens внутри iframe

Приложение один раз передаёт свой bearer-токен в DataLens. BFF проверяет токен через backend приложения, входит в существующий общий аккаунт DataLens и устанавливает обычные cookies. После этого можно открыть полный интерфейс в iframe.

Проверка приложения выполняется **только при входе**. Дальше работают штатные сессии DataLens. Redis, ticket и дополнительные настройки MCP не нужны.

## 1. Настройте DataLens

Основное приложение и DataLens должны работать по HTTPS на соседних поддоменах одного сайта, например `https://app.example.com` и `https://bi.example.com`. Все родительские страницы iframe также должны находиться в этом сайте.

В окружении UI/BFF задайте:

```dotenv
AUTH_ENABLED=true
SSO_ENABLED=true
SSO_HOST_ORIGIN=https://app.example.com
SSO_BI_ORIGIN=https://bi.example.com
SSO_VERIFICATION_URL=https://dev-ahmad.factorydirector.pro/api/v1/bi/verify
SSO_SHARED_LOGIN=existing-account-login
SSO_SHARED_PASSWORD=existing-account-password
SSO_SHARED_USER_ID=encoded-datalens-user-id
```

`SSO_SHARED_USER_ID` — закодированный идентификатор существующего пользователя DataLens, от имени которого будут работать все пользователи приложения. Он нужен для проверки ответа auth. Создавать отдельные аккаунты пользователей не требуется. Логин и пароль общего аккаунта хранятся только на сервере.

Уже используемые `AUTH_ENDPOINT`, `AUTH_TOKEN_PUBLIC_KEY` и необязательный `AUTH_COOKIE_NAME` должны соответствовать сервису auth. Для параметров SSO поддерживается суффикс `_FILE`, например `SSO_SHARED_PASSWORD_FILE=/run/secrets/datalens-password`. Флаги `AUTH_ENABLED` и `SSO_ENABLED` задаются непосредственно переменными окружения.

В окружении auth задайте:

```dotenv
UI_APP_ENDPOINT=https://bi.example.com
DISABLE_WILDCARD_COOKIE=true
```

Cookies авторизации ограничены хостом DataLens и имеют параметры Secure, HttpOnly, SameSite=Strict, Path=/. Отдельная cookie срока действия доступна JavaScript и содержит только время истечения access token. Срок хранения берётся из обычного ответа auth.

Готовый overlay находится в соседнем репозитории `datalens/docker-compose.sso.yaml`. Задайте перечисленные переменные и `SSO_UI_IMAGE` с именем собранного образа UI, затем из репозитория `datalens` выполните:

```sh
docker compose -f docker-compose.yaml -f docker-compose.sso.yaml up -d
```

В overlay адрес проверки уже задан по умолчанию: `https://dev-ahmad.factorydirector.pro/api/v1/bi/verify`. Для другого окружения переопределите `SSO_VERIFICATION_URL` либо `SSO_VERIFICATION_URL_FILE`; файл должен быть смонтирован внутрь контейнера UI. Адрес проверки не определяет `SSO_HOST_ORIGIN`: там нужен точный origin frontend, который открывает iframe.

### Coolify

Самостоятельный `datalens/docker-compose.coolify.yaml` передаёт параметры SSO в UI и использует тот же адрес проверки по умолчанию. В настройках окружения Coolify задайте `SSO_ENABLED=true`, `SSO_HOST_ORIGIN`, `SSO_BI_ORIGIN`, `SSO_SHARED_LOGIN`, `SSO_SHARED_PASSWORD` и `SSO_SHARED_USER_ID`. `SSO_BI_ORIGIN` должен совпадать с публичным HTTPS origin DataLens (`SERVICE_URL_UI`); `AUTH_ENABLED` должен оставаться `true`. Сохраните секретность пароля общего аккаунта. Для параметров SSO доступны также переменные `_FILE`, если соответствующие файлы смонтированы в UI.

После сохранения настроек пересоздайте сервисы с образом UI, содержащим SSO. Отдельный overlay и `SSO_UI_IMAGE` для Coolify не требуются. Без `SSO_ENABLED=true` обычный вход работает как прежде.

## 2. Проверка bearer на backend приложения

BFF отправляет запрос на фиксированный `SSO_VERIFICATION_URL`:

```http
POST /api/v1/bi/verify
Authorization: Bearer <токен пользователя приложения>
Content-Type: application/json

{}
```

Backend должен проверить bearer своей штатной аутентификацией и разрешение `datalens_access`. При успешной проверке ответ:

```json
{"active": true, "datalens_access": true}
```

Контракт ответа:

| Ответ backend                                                        | Результат входа                      |
| -------------------------------------------------------------------- | ------------------------------------ |
| HTTP 200, оба поля равны `true`                                      | Создаётся сессия DataLens            |
| HTTP 401/403 либо одно из полей равно `false`                        | Отказ с кодом `HOST_DENIED`          |
| Недоступность, тайм-аут, другой ошибочный статус или неверный формат | HTTP 503, `VERIFICATION_UNAVAILABLE` |

Оба поля должны быть логическими значениями. Тайм-аут проверки — две секунды. BFF не следует перенаправлениям. Используйте HTTPS либо закрытую доверенную сервисную сеть, поскольку запрос содержит пользовательский bearer.

Рабочий backend приложения находится вне этого workspace. Ручка `https://dev-ahmad.factorydirector.pro/api/v1/bi/verify` проверена с действующим bearer: HTTP 200 и оба поля `true`; без bearer и с неверным bearer она возвращает HTTP 401. Пример изолированного backend для тестов находится в `tests/sso/host-backend.mjs`. Пользовательский bearer не сохраняется в конфигурации DataLens.

## 3. Откройте iframe из frontend

Скопируйте `dist/public/sso-bridge.js` во frontend приложения и подключите его на родительской странице. При открытии экрана DataLens вызовите функцию:

```html
<script src="/sso-bridge.js"></script>
<iframe id="datalens" title="DataLens" hidden></iframe>
```

```js
await openDataLens({
  iframe: document.getElementById('datalens'),
  biOrigin: 'https://bi.example.com',
  bearer: currentAccessToken, // Текущий bearer-токен вашего приложения.
});
```

Функция вызывает `POST /sso/login` с заголовком `Authorization: Bearer …` и `credentials: 'include'`. После ответа HTTP 204 браузер сохраняет cookies DataLens, а функция показывает iframe и открывает в нём `/`. При ошибке iframe остаётся скрытым, промис отклоняется; поле `error.code` содержит код отказа. Пароль общего аккаунта и токены DataLens в тело ответа не попадают.

Если библиотека не нужна, тот же вход можно вызвать обычным `fetch`:

```js
const response = await fetch('https://bi.example.com/sso/login', {
  method: 'POST',
  credentials: 'include',
  headers: {Authorization: `Bearer ${currentAccessToken}`},
});
if (!response.ok) throw new Error('Не удалось войти в DataLens');
iframe.src = 'https://bi.example.com/';
iframe.hidden = false;
```

CORS разрешён только для точного `SSO_HOST_ORIGIN`. Он обрабатывается для `/sso/login`, включая запрос OPTIONS. Настройте CSP приложения: `connect-src` должен разрешать запрос к DataLens, а `frame-src` — его iframe. Обратный прокси должен сохранять заданный BFF `frame-ancestors` и не добавлять конфликтующий `X-Frame-Options`. Сохраните отдельные правила для анонимных Public link и Embed.

Не передавайте bearer в URL и не записывайте его в логи. Теперь он передаётся доверенному BFF DataLens для однократной проверки, но не сохраняется там.

## Сессии и выход

После входа DataLens работает независимо от backend приложения. Отзыв разрешения или выход из приложения запрещает новый автоматический вход, но **не завершает уже созданную сессию DataLens**. Недоступность приложения также не мешает существующей сессии. Обновление токенов и выход обрабатываются штатным auth.

При выходе из приложения скройте iframe или удалите его компонент. Если запрос входа ещё выполняется, можно передать функции `signal` от `AbortController` и вызвать `abort()` при закрытии экрана. Это прекращает загрузку интерфейса, но не является отзывом уже выданных cookies.

Обычный вход по логину и паролю и выход DataLens сохраняются. После выхода внутри iframe отображается стандартная форма входа; автоматического повторного входа нет. Для нового автовхода снова вызовите `openDataLens`. Каждый успешный вызов создаёт отдельную сессию общего аккаунта. Вкладки одного профиля браузера разделяют cookies DataLens.

Public link, Embed и существующий MCP продолжают работать по прежним правилам. Внутренние auth, US, data/control API и `ui-api` остаются в закрытой сервисной сети.

При переходе с предыдущей реализации удалите настройки `SSO_TICKET_*`, `SSO_SERVICE_TOKEN`, `SSO_REDIS_URL`, `SSO_MACHINE_*` и `DATALENS_BFF_MACHINE_TOKEN`. Замените `DataLensSSO/getTicket` на вызов `openDataLens`. Реестр Redis больше не используется, в том числе для ранее созданных сессий: они переходят на обычные правила DataLens.

## Проверки в Docker

Из репозитория UI выполните:

```sh
bash tests/sso/run.sh
# Только Chromium:
bash tests/sso/run.sh --project=chromium login.test.ts
```

Стенд собирает локальные UI и US, запускает неизменённый auth 0.34.0, тестовый backend и HTTPS-прокси. Playwright проверяет Chromium, Firefox и WebKit. Redis в стенде отсутствует. Отчёты сохраняются в `tests/artifacts/sso`. Скрипт удаляет только контейнеры и временные тома этого тестового проекта.

Тестовый backend и его управляющие маршруты предназначены только для стенда. Рабочий backend и настоящий Safari проверяются отдельно. Фактическое состояние прогонов указано в [отчёте проверок](./iframe-sso-validation.md).
