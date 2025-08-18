# MyXSpend - Полное логирование всех запросов и ответов

## 🔍 Что теперь логируется

### В auth.php:
- 🔐 **Входящие данные**: email, password (замаскирован), полные данные запроса
- 🌐 **Запрос к MyXSpend**: URL, заголовки, тело запроса, размер
- 📤 **CURL детали**: все опции, настройки SSL, таймауты
- 📥 **Сырой ответ**: HTTP код, заголовки ответа, тело ответа, полный ответ
- 📊 **Анализ ответа**: длина, разбор JSON, тип данных
- 📋 **Разобранный ответ**: все поля, ключи, токен (полный)
- ✅/❌ **Результат**: успех/ошибка с полными деталями
- 🔚 **Финальный ответ**: что отправляется клиенту

### В payment.php (основной):
- 🔐 **ШАГ 1 - Аутентификация**: 
  - email, password, URL аутентификации
  - Полный токен, длина токена, превью токена
  - Заголовки запроса и ответа
- 🔐 **ШАГ 2 - Создание платежа**:
  - Используемый токен, API ключ, Company ID
  - Данные платежа, URL, заголовки
  - Сырой ответ, разобранный ответ
- 📊 **Анализ каждого ответа**: JSON парсинг, ошибки, hex дамп при ошибках

### В payment_traffer.php (для traffer.uk):
- 🔑 **Заголовки аутентификации**: Bearer токен, API ключ, Company ID
- 🌐 **Запрос к MyXSpend API**: все заголовки, тело запроса
- 📥 **Сырой ответ**: заголовки, тело, HTTP код
- 📋 **Разобранный ответ**: все поля ответа
- 🔚 **Финальный ответ**: что возвращается клиенту

## 📝 Структура логов

### Логи аутентификации (`logs/myxspend_auth.log`):
```
[2025-01-17 12:34:56] [IP] [User-Agent] 🔐 Proxying authentication request to MyXSpend API | Data: {"email":"test@example.com","password_provided":"yes","password_length":10,"full_request_data":{...}}
[2025-01-17 12:34:56] [IP] [User-Agent] 🌐 Sending request to MyXSpend API | Data: {"url":"https://api.myxspend.com/v1/auth/login","email":"test@example.com","password":"***MASKED***","request_body":"{...}","request_size":123}
[2025-01-17 12:34:56] [IP] [User-Agent] 📤 CURL REQUEST DETAILS | Data: {"url":"...","method":"POST","headers":[...],"body":"{...}","curl_options":"..."}
[2025-01-17 12:34:57] [IP] [User-Agent] 📥 RAW RESPONSE RECEIVED | Data: {"http_code":200,"curl_error":"none","response_headers":"...","response_body":"{...}","response_length":456,"full_response":"...","curl_info":{...}}
[2025-01-17 12:34:57] [IP] [User-Agent] ✅ MyXSpend authentication successful | Data: {"email":"test@example.com","http_code":200,"has_token":true,"token_length":789,"token_preview":"eyJhbGciOiJIUzI1NiI...","full_token":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...","full_response":{...}}
```

### Логи платежей (`logs/myxspend_payment.log`):
```
[2025-01-17 12:35:01] [IP] [User-Agent] 🔐 STEP 1: Authenticating with MyXSpend | Data: {"auth_url":"...","email":"...","password":"***MASKED***","actual_password_length":10,"auth_request_body":"{...}"}
[2025-01-17 12:35:02] [IP] [User-Agent] ✅ Authentication successful | Data: {"has_token":true,"token_length":789,"token_preview":"eyJhbGciOiJIUzI1NiI...","full_token":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...","auth_result":{...}}
[2025-01-17 12:35:02] [IP] [User-Agent] 🔐 STEP 2: Creating payment with token | Data: {"payment_url":"...","customerOrderId":"...","amount":100,"currency":"USD","token_used":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...","api_key_used":"EODO9BsIPsW4w3QTjkxN8uwCg9uDqb1pJ8XvxY1TjUhvQZYhCT","company_id_used":"82dcbd4a-a838-47f9-ae21-8dac9a8f1622","request_data":{...}}
[2025-01-17 12:35:03] [IP] [User-Agent] ✅ Payment creation successful | Data: {"customerOrderId":"...","http_code":200,"has_payment_link":true,"has_payment_code":true,"response_code":"200","full_response":{...},"payment_link":"https://...","payment_code":"..."}
```

## 🔧 Проблемы, которые теперь можно диагностировать:

1. **401 Unauthorized**: 
   - Видим точный токен, который отправляется
   - Видим API ключ и Company ID
   - Видим все заголовки запроса

2. **Проблемы с JSON**:
   - Hex дамп ответа при ошибках парсинга
   - Посимвольный разбор ответа

3. **Проблемы с SSL/сетью**:
   - Полная информация CURL
   - Детали соединения и таймаутов

4. **Проблемы с API MyXSpend**:
   - Точные заголовки и тело запроса
   - Полный ответ с заголовками

## 🚀 Как тестировать

1. Сделайте запрос на создание платежа через MyXSpend
2. Проверьте логи в `/logs/myxspend_auth.log` и `/logs/myxspend_payment.log`
3. Найдите проблему по эмодзи:
   - 🔐 = аутентификация
   - 🌐 = сетевые запросы  
   - 📥 = ответы
   - ❌ = ошибки
   - ✅ = успех

## 📍 Файлы обновлены:
- ✅ `c:\work\trapayend\payment.php` - с полным логированием двухэтапного процесса
- ✅ `c:\work\trapayend\auth.php` - с детальным логированием аутентификации
- ✅ `c:\work\trapayend\payment_traffer.php` - с логированием прямых вызовов API

Теперь в логах будет видно **ВСЁ**: все токены, ключи, запросы, ответы и ошибки!
