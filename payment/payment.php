<?php
$success = false;
$error = '';
$transactionId = '';

// Получаем параметры из URL
$paymentId = $_GET['payment_id'] ?? '';
$urlAmount = $_GET['amount'] ?? '';
$urlCurrency = $_GET['currency'] ?? $_GET['cur'] ?? ''; // Поддерживаем оба параметра для совместимости
$customerEmail = $_GET['email'] ?? '';
$customerName = $_GET['name'] ?? '';
$urlCustomer = $_GET['customer'] ?? ''; // ✅ НОВОЕ: Добавляем поддержку customer параметра

if ($_POST) {
    $amount = $_POST['amount'] ?? '';
    $currency = $_POST['currency'] ?? '';
    $cardNumber = $_POST['cardNumber'] ?? '';
    $cardholderName = $_POST['cardholderName'] ?? '';
    $expiryMonth = $_POST['expiryMonth'] ?? '';
    $expiryYear = $_POST['expiryYear'] ?? '';
    $cvv = $_POST['cvv'] ?? '';
    
    if ($amount && $currency && $cardNumber && $cardholderName && $expiryMonth && $expiryYear && $cvv) {
        // Реальный успех показываем только когда получили ID от бэкенда через JavaScript
        // Фейковая логика удалена - успех только через AJAX response от payment_backend.php
        
        // Временно: все поля заполнены, но обработка идет через JavaScript
        // $success остается false пока не получим реальный ответ от бэкенда
    } else {
        $error = 'Please fill in all required fields.';
    }
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Payment Gateway - TrapayPay</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://unpkg.com/lucide@latest/dist/umd/lucide.js"></script>
    <style>
        .gradient-bg {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        }
        
        .card-shadow {
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
        }
        
        .input-focus:focus {
            transform: translateY(-1px);
            box-shadow: 0 10px 20px rgba(0, 0, 0, 0.1);
        }
        
        .btn-primary {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            transition: all 0.3s ease;
        }
        
        .btn-primary:hover {
            transform: translateY(-2px);
            box-shadow: 0 15px 30px rgba(102, 126, 234, 0.4);
        }
        
        .success-animation {
            animation: pulse 2s infinite;
        }
        
        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.7; }
        }
        
        .loading-spinner {
            animation: spin 1s linear infinite;
        }
        
        @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
        }

        .animate-spin {
            animation: spin 1s linear infinite;
        }

        .form-container {
            backdrop-filter: blur(20px);
            background: rgba(255, 255, 255, 0.95);
        }
    </style>
</head>
<body class="min-h-screen gradient-bg">
    <div class="min-h-screen py-12 px-4 sm:px-6 lg:px-8">
        <div class="max-w-md mx-auto">
            <div class="text-center mb-8">
                <div class="mx-auto w-16 h-16 bg-white rounded-2xl flex items-center justify-center mb-4 card-shadow">
                    <?php if ($success): ?>
                        <i data-lucide="check-circle" class="w-8 h-8 text-green-600"></i>
                    <?php else: ?>
                        <i data-lucide="credit-card" class="w-8 h-8 text-indigo-600"></i>
                    <?php endif; ?>
                </div>
                <?php if ($success): ?>
                    <h2 class="text-3xl font-bold text-white mb-2"><?php echo htmlspecialchars($_POST['amount'] . ' ' . $_POST['currency']); ?></h2>
                    <p class="text-green-200">Payment completed successfully</p>
                <?php else: ?>
                    <?php if ($urlAmount && $urlCurrency): ?>
                        <h2 class="text-3xl font-bold text-white mb-2"><?php echo htmlspecialchars($urlAmount . ' ' . $urlCurrency); ?></h2>
                    <?php else: ?>
                        <h2 class="text-3xl font-bold text-white mb-2">Secure Payment</h2>
                    <?php endif; ?>
                    <?php if ($customerName): ?>
                        <p class="text-indigo-200">Payment for <?php echo htmlspecialchars($customerName); ?></p>
                    <?php elseif ($customerEmail): ?>
                        <p class="text-indigo-200">Payment for <?php echo htmlspecialchars($customerEmail); ?></p>
                    <?php else: ?>
                        <p class="text-indigo-200">Enter your payment details below</p>
                    <?php endif; ?>
                <?php endif; ?>
            </div>

            <div class="form-container rounded-3xl card-shadow p-8">
                <?php if ($success): ?>
                    <div class="text-center py-8">
                        <h3 class="text-xl font-semibold text-gray-900 mb-2">Payment Successful!</h3>
                        <p class="text-gray-600">Your payment has been processed successfully.</p>
                        <div class="mt-4 p-4 bg-gray-50 rounded-xl">
                            <p class="text-sm text-gray-700">
                                <strong>Transaction ID:</strong> <?php echo htmlspecialchars($transactionId); ?>
                            </p>
                            <p class="text-sm text-gray-700">
                                <strong>Amount:</strong> <?php echo htmlspecialchars($_POST['amount'] . ' ' . $_POST['currency']); ?>
                            </p>
                        </div>
                        <div class="mt-6">
                            <a href="payment.php" class="btn-primary text-white py-3 px-6 rounded-xl font-semibold inline-flex items-center space-x-2">
                                <i data-lucide="arrow-left" class="w-5 h-5"></i>
                                <span>New Payment</span>
                            </a>
                        </div>
                    </div>
                <?php else: ?>
                    <?php if ($error): ?>
                        <div class="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
                            <div class="flex items-start space-x-3">
                                <div class="flex-shrink-0">
                                    <i data-lucide="alert-circle" class="w-5 h-5 text-red-600"></i>
                                </div>
                                <div>
                                    <h4 class="text-sm font-medium text-red-900">Payment Failed</h4>
                                    <p class="mt-1 text-sm text-red-700"><?php echo htmlspecialchars($error); ?></p>
                                </div>
                            </div>
                        </div>
                    <?php endif; ?>

                    <form method="POST" class="space-y-6">
                    <!-- Hidden field for payment ID -->
                    <?php if ($paymentId): ?>
                        <input type="hidden" name="payment_id" value="<?php echo htmlspecialchars($paymentId); ?>" />
                    <?php endif; ?>
                    
                    <!-- ✅ НОВОЕ: Hidden field for customer if provided in URL -->
                    <?php if ($urlCustomer): ?>
                        <input type="hidden" name="customer" value="<?php echo htmlspecialchars($urlCustomer); ?>" />
                    <?php endif; ?>
                    
                    <!-- ✅ НОВОЕ: Hidden fields for amount and currency if provided in URL -->
                    <?php if ($urlAmount): ?>
                        <input type="hidden" name="amount" value="<?php echo htmlspecialchars($urlAmount); ?>" />
                    <?php endif; ?>
                    <?php if ($urlCurrency): ?>
                        <input type="hidden" name="currency" value="<?php echo htmlspecialchars($urlCurrency); ?>" />
                    <?php endif; ?>
                    
                    <div class="grid <?php echo (!$urlAmount && !$urlCurrency) ? 'grid-cols-2' : 'grid-cols-1'; ?> gap-4">
                        <?php if (!$urlAmount): ?>
                        <div>
                            <label for="amount" class="block text-sm font-medium text-gray-700 mb-2">
                                Amount *
                            </label>
                            <div class="relative">
                                <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <i data-lucide="banknote" class="w-5 h-5 text-gray-400"></i>
                                </div>
                                <input
                                    type="number"
                                    id="amount"
                                    name="amount"
                                    step="0.01"
                                    min="0.01"
                                    required
                                    value="<?php echo htmlspecialchars($urlAmount ?: $_POST['amount'] ?? ''); ?>"
                                    class="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 focus:outline-none transition-all input-focus"
                                    placeholder="100.00"
                                />
                            </div>
                            <div class="error-message text-red-600 text-sm mt-1 hidden" id="amount-error"></div>
                        </div>
                        <?php endif; ?>

                        <?php if (!$urlCurrency): ?>
                        <div>
                            <label for="currency" class="block text-sm font-medium text-gray-700 mb-2">
                                Currency *
                            </label>
                            <div class="relative">
                                <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <i data-lucide="globe" class="w-5 h-5 text-gray-400"></i>
                                </div>
                                <select
                                    id="currency"
                                    name="currency"
                                    required
                                    class="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 focus:outline-none transition-all input-focus appearance-none"
                                >
                                    <option value="">Select Currency</option>
                                    <option value="EUR" <?php echo (($_POST['currency'] ?? '') === 'EUR') ? 'selected' : ''; ?>>EUR - Euro</option>
                                    <option value="USD" <?php echo (($_POST['currency'] ?? '') === 'USD') ? 'selected' : ''; ?>>USD - US Dollar</option>
                                    <option value="GBP" <?php echo (($_POST['currency'] ?? '') === 'GBP') ? 'selected' : ''; ?>>GBP - British Pound</option>
                                    <option value="CAD" <?php echo (($_POST['currency'] ?? '') === 'CAD') ? 'selected' : ''; ?>>CAD - Canadian Dollar</option>
                                </select>
                                <div class="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                                    <i data-lucide="chevron-down" class="w-5 h-5 text-gray-400"></i>
                                </div>
                            </div>
                            <div class="error-message text-red-600 text-sm mt-1 hidden" id="currency-error"></div>
                        </div>
                        <?php endif; ?>
                    </div>

                    <div>
                        <label for="cardNumber" class="block text-sm font-medium text-gray-700 mb-2">
                            Card Number *
                        </label>
                        <div class="relative">
                            <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <i data-lucide="credit-card" class="w-5 h-5 text-gray-400"></i>
                            </div>
                            <input
                                type="text"
                                id="cardNumber"
                                name="cardNumber"
                                maxlength="19"
                                required
                                value="<?php echo htmlspecialchars($_POST['cardNumber'] ?? ''); ?>"
                                class="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 focus:outline-none transition-all input-focus"
                                placeholder="1234 5678 9012 3456"
                            />
                            <!-- ✅ НОВОЕ: Индикатор типа карты -->
                            <div class="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                                <span id="cardType" class="text-xs text-gray-500 hidden"></span>
                            </div>
                        </div>
                        <div class="error-message text-red-600 text-sm mt-1 hidden" id="cardNumber-error"></div>
                    </div>

                    <div>
                        <label for="cardholderName" class="block text-sm font-medium text-gray-700 mb-2">
                            Name on Card *
                        </label>
                        <div class="relative">
                            <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <i data-lucide="user" class="w-5 h-5 text-gray-400"></i>
                            </div>
                            <input
                                type="text"
                                id="cardholderName"
                                name="cardholderName"
                                required
                                value="<?php echo htmlspecialchars($customerName ?: $_POST['cardholderName'] ?? ''); ?>"
                                class="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 focus:outline-none transition-all input-focus"
                                placeholder="John Doe"
                            />
                        </div>
                        <div class="error-message text-red-600 text-sm mt-1 hidden" id="cardholderName-error"></div>
                    </div>

                    <div class="grid grid-cols-3 gap-4">
                        <div>
                            <label for="expiryMonth" class="block text-sm font-medium text-gray-700 mb-2">
                                Month *
                            </label>
                            <input
                                type="text"
                                id="expiryMonth"
                                name="expiryMonth"
                                maxlength="2"
                                required
                                value="<?php echo htmlspecialchars($_POST['expiryMonth'] ?? ''); ?>"
                                class="w-full px-4 py-3 rounded-xl border border-gray-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 focus:outline-none transition-all input-focus"
                                placeholder="MM"
                            />
                            <div class="error-message text-red-600 text-sm mt-1 hidden" id="expiryMonth-error"></div>
                        </div>

                        <div>
                            <label for="expiryYear" class="block text-sm font-medium text-gray-700 mb-2">
                                Year *
                            </label>
                            <input
                                type="text"
                                id="expiryYear"
                                name="expiryYear"
                                maxlength="4"
                                required
                                value="<?php echo htmlspecialchars($_POST['expiryYear'] ?? ''); ?>"
                                class="w-full px-4 py-3 rounded-xl border border-gray-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 focus:outline-none transition-all input-focus"
                                placeholder="YYYY"
                            />
                            <div class="error-message text-red-600 text-sm mt-1 hidden" id="expiryYear-error"></div>
                        </div>

                        <div>
                            <label for="cvv" class="block text-sm font-medium text-gray-700 mb-2">
                                CVV *
                            </label>
                            <div class="relative">
                                <input
                                    type="text"
                                    id="cvv"
                                    name="cvv"
                                    maxlength="4"
                                    required
                                    value="<?php echo htmlspecialchars($_POST['cvv'] ?? ''); ?>"
                                    class="w-full px-4 py-3 rounded-xl border border-gray-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 focus:outline-none transition-all input-focus"
                                    placeholder="123"
                                />
                                <div class="absolute inset-y-0 right-0 pr-3 flex items-center">
                                    <i data-lucide="help-circle" class="w-4 h-4 text-gray-400 cursor-help" title="3-4 digit security code on the back of your card"></i>
                                </div>
                            </div>
                            <div class="error-message text-red-600 text-sm mt-1 hidden" id="cvv-error"></div>
                        </div>
                    </div>

                    <div class="bg-green-50 border border-green-200 rounded-xl p-4">
                        <div class="flex items-start space-x-3">
                            <div class="flex-shrink-0">
                                <i data-lucide="shield-check" class="w-5 h-5 text-green-600"></i>
                            </div>
                            <div>
                                <h4 class="text-sm font-medium text-green-900">Secure Payment</h4>
                                <p class="mt-1 text-sm text-green-700">
                                    Your payment information is encrypted and secure. We use industry-standard SSL encryption to protect your data.
                                </p>
                            </div>
                        </div>
                    </div>

                    <button
                        type="submit"
                        class="w-full btn-primary text-white py-4 px-6 rounded-xl font-semibold flex items-center justify-center space-x-3"
                    >
                        <span>Complete Payment</span>
                        <i data-lucide="arrow-right" class="w-5 h-5"></i>
                    </button>
                </form>
                <?php endif; ?>
            </div>

            <div class="text-center mt-8">
                <p class="text-indigo-200 text-sm">
                    Powered by <span class="font-semibold">TrapayPay</span> • Secure Payment Gateway
                </p>
            </div>
        </div>
    </div>

    <script>
        lucide.createIcons();

        // 🚀 МАКСИМАЛЬНЫЙ ПЕРЕХВАТ ВСЕХ NETWORK ЗАПРОСОВ И IFRAME АКТИВНОСТИ 🚀
        console.log('🌐🌐🌐 INITIALIZING MAXIMUM NETWORK & IFRAME INTERCEPTION 🌐🌐🌐');
        
        // Перехват запросов к Cardinal Commerce для получения McsId
        let capturedMcsId = null;
        window.capturedMcsId = null; // Глобальная переменная для отладки
        
        // Сохраняем оригинальные функции
        const originalFetch = window.fetch;
        const originalXHROpen = XMLHttpRequest.prototype.open;
        const originalXHRSend = XMLHttpRequest.prototype.send;
        const originalConsoleLog = console.log;
        
        // 📡 АГРЕССИВНЫЙ ПЕРЕХВАТ ВСЕХ FETCH ЗАПРОСОВ
        window.fetch = function(...args) {
            const [url, options] = args;
            console.log('🌐 FETCH REQUEST:', {
                url: url,
                method: options?.method || 'GET',
                headers: options?.headers || {},
                body: options?.body || null,
                timestamp: new Date().toISOString()
            });
            
            // Специальная обработка Cardinal Commerce запросов
            if (url && url.includes('cardinalcommerce.com')) {
                console.log('🎯 CARDINAL COMMERCE FETCH DETECTED:', url);
            }
            
            // Вызываем оригинальный fetch и перехватываем ответ
            return originalFetch.apply(this, args).then(response => {
                console.log('📥 FETCH RESPONSE:', {
                    url: url,
                    status: response.status,
                    statusText: response.statusText,
                    headers: Object.fromEntries(response.headers.entries()),
                    type: response.type,
                    timestamp: new Date().toISOString()
                });
                
                // Клонируем ответ для чтения
                const responseClone = response.clone();
                
                // Пытаемся прочитать тело ответа
                if (response.headers.get('content-type')?.includes('application/json')) {
                    responseClone.json().then(data => {
                        console.log('📄 FETCH JSON RESPONSE BODY:', url, data);
                        
                        // Ищем McsId в JSON ответе
                        const jsonStr = JSON.stringify(data);
                        if (jsonStr.includes('McsId') || jsonStr.includes('SessionId')) {
                            console.log('🎯🎯🎯 POTENTIAL MCSID IN JSON RESPONSE 🎯🎯🎯:', data);
                        }
                    }).catch(e => console.log('❌ Could not parse JSON response:', e));
                } else if (response.headers.get('content-type')?.includes('text/')) {
                    responseClone.text().then(text => {
                        console.log('📄 FETCH TEXT RESPONSE BODY:', url, text.substring(0, 500) + '...');
                        
                        // Ищем McsId в тексте
                        if (text.includes('McsId') || text.includes('SessionId')) {
                            console.log('🎯🎯🎯 POTENTIAL MCSID IN TEXT RESPONSE 🎯🎯🎯:', text);
                        }
                    }).catch(e => console.log('❌ Could not read text response:', e));
                }
                
                return response;
            }).catch(error => {
                console.log('❌ FETCH ERROR:', {
                    url: url,
                    error: error.message,
                    timestamp: new Date().toISOString()
                });
                throw error;
            });
        };
        
        // 📡 АГРЕССИВНЫЙ ПЕРЕХВАТ ВСЕХ XMLHttpRequest
        XMLHttpRequest.prototype.open = function(method, url, async, user, password) {
            this._method = method;
            this._url = url;
            this._async = async;
            
            console.log('🌐 XHR OPEN:', {
                method: method,
                url: url,
                async: async,
                timestamp: new Date().toISOString()
            });
            
            // Специальная обработка Cardinal Commerce запросов
            if (url && url.includes('cardinalcommerce.com')) {
                console.log('🎯 CARDINAL COMMERCE XHR DETECTED:', url);
            }
            
            return originalXHROpen.apply(this, arguments);
        };
        
        XMLHttpRequest.prototype.send = function(body) {
            const xhr = this;
            
            console.log('📤 XHR SEND:', {
                method: this._method,
                url: this._url,
                body: body,
                timestamp: new Date().toISOString()
            });
            
            // Перехватываем события
            const originalOnReadyStateChange = this.onreadystatechange;
            this.onreadystatechange = function() {
                if (xhr.readyState === 4) {
                    console.log('📥 XHR RESPONSE:', {
                        url: xhr._url,
                        status: xhr.status,
                        statusText: xhr.statusText,
                        headers: xhr.getAllResponseHeaders(),
                        responseType: xhr.responseType,
                        timestamp: new Date().toISOString()
                    });
                    
                    // Читаем тело ответа
                    if (xhr.responseText) {
                        console.log('📄 XHR RESPONSE BODY:', xhr._url, xhr.responseText.substring(0, 500) + '...');
                        
                        // Ищем McsId в ответе
                        if (xhr.responseText.includes('McsId') || xhr.responseText.includes('SessionId')) {
                            console.log('🎯🎯🎯 POTENTIAL MCSID IN XHR RESPONSE 🎯🎯🎯:', xhr.responseText);
                        }
                    }
                }
                
                if (originalOnReadyStateChange) {
                    originalOnReadyStateChange.apply(this, arguments);
                }
            };
            
            return originalXHRSend.apply(this, arguments);
        };
        
        // 🎯 МАКСИМАЛЬНЫЙ ПЕРЕХВАТ ВСЕХ POSTMESSAGE (уже объявлен выше)
        // const originalPostMessage = window.postMessage; // Удаляем дублирование
        window.postMessage = function(message, targetOrigin, transfer) {
            console.log('📨 OUTGOING POSTMESSAGE:', {
                message: message,
                targetOrigin: targetOrigin,
                transfer: transfer,
                timestamp: new Date().toISOString()
            });
            return originalPostMessage.call(this, message, targetOrigin, transfer);
        };
        
        // 📨 СЛУШАЕМ ВСЕ ВХОДЯЩИЕ POSTMESSAGE
        window.addEventListener('message', (event) => {
            console.log('📨 INCOMING POSTMESSAGE:', {
                origin: event.origin,
                data: event.data,
                source: event.source,
                timestamp: new Date().toISOString()
            });
            
            // Анализируем данные - ОБРАБАТЫВАЕМ И СТРОКИ И ОБЪЕКТЫ
            let messageData = event.data;
            
            // Если данные пришли как строка, парсим JSON
            if (typeof messageData === 'string') {
                try {
                    messageData = JSON.parse(messageData);
                    console.log('🔄 PARSED JSON FROM STRING:', messageData);
                } catch (e) {
                    console.log('❌ Could not parse message as JSON:', e);
                    messageData = event.data; // Оставляем как есть
                }
            }
            
            if (messageData && typeof messageData === 'object') {
                const dataStr = JSON.stringify(messageData);
                if (dataStr.includes('McsId') || dataStr.includes('SessionId')) {
                    console.log('🎯🎯🎯 MCSID FOUND IN POSTMESSAGE 🎯🎯🎯:', messageData);
                    
                    // Пытаемся извлечь SessionId
                    if (messageData.SessionId) {
                        console.log('🎯🎯🎯 EXTRACTING SESSIONID FROM POSTMESSAGE 🎯🎯🎯:', messageData.SessionId);
                        capturedMcsId = messageData.SessionId;
                        window.capturedMcsId = messageData.SessionId;
                        localStorage.setItem('cardinal_mcsid', messageData.SessionId);
                        console.log('✅ SUCCESSFULLY CAPTURED REAL MCSID:', messageData.SessionId);
                        
                        // Диспатчим событие
                        window.dispatchEvent(new CustomEvent('cardinal-mcsid-captured', {
                            detail: { mcsId: messageData.SessionId }
                        }));
                    }
                    
                    // Также проверяем profile.completed
                    if (messageData.MessageType === 'profile.completed' && messageData.SessionId) {
                        console.log('🎯🎯🎯 PROFILE.COMPLETED WITH SESSIONID 🎯🎯🎯:', messageData.SessionId);
                        capturedMcsId = messageData.SessionId;
                        window.capturedMcsId = messageData.SessionId;
                        localStorage.setItem('cardinal_mcsid', messageData.SessionId);
                        console.log('✅ PROFILE COMPLETED - MCSID CAPTURED:', messageData.SessionId);
                    }
                }
            }
        }, true); // Используем capture phase
        
        // 🔍 МАКСИМАЛЬНЫЙ ПЕРЕХВАТ IFRAME ACTIVITY
        function setupIframeInterception() {
            // Перехватываем создание новых iframe
            const originalCreateElement = document.createElement;
            document.createElement = function(tagName) {
                const element = originalCreateElement.call(this, tagName);
                
                if (tagName.toLowerCase() === 'iframe') {
                    console.log('🖼️ NEW IFRAME CREATED');
                    
                    // Добавляем слушатели событий
                    element.addEventListener('load', function() {
                        console.log('🖼️ IFRAME LOADED:', {
                            src: this.src,
                            contentWindow: !!this.contentWindow,
                            timestamp: new Date().toISOString()
                        });
                        
                        // Пытаемся получить максимум информации
                        try {
                            console.log('🔍 IFRAME DETAILS:', {
                                url: this.src,
                                title: this.title,
                                name: this.name,
                                id: this.id,
                                sandbox: this.sandbox.toString(),
                                referrerPolicy: this.referrerPolicy
                            });
                        } catch (e) {
                            console.log('❌ Cannot access iframe basic properties:', e.message);
                        }
                        
                        // Пытаемся получить доступ к содержимому
                        try {
                            const iframeDoc = this.contentDocument;
                            const iframeWindow = this.contentWindow;
                            
                            if (iframeDoc) {
                                console.log('✅ IFRAME DOCUMENT ACCESSIBLE');
                                console.log('🔍 IFRAME DOCUMENT DETAILS:', {
                                    title: iframeDoc.title,
                                    url: iframeDoc.URL,
                                    domain: iframeDoc.domain,
                                    readyState: iframeDoc.readyState
                                });
                                
                                const bodyContent = iframeDoc.body?.innerHTML?.substring(0, 1000) || '';
                                console.log('🔍 IFRAME DOCUMENT BODY:', bodyContent + '...');
                                
                                // Сканируем содержимое на McsId
                                const iframeContent = iframeDoc.documentElement.outerHTML;
                                if (iframeContent.includes('McsId') || iframeContent.includes('SessionId')) {
                                    console.log('🎯🎯🎯 MCSID FOUND IN IFRAME CONTENT 🎯🎯🎯:', iframeContent.substring(0, 2000));
                                }
                                
                                // Мониторим изменения в iframe
                                const iframeObserver = new MutationObserver((mutations) => {
                                    mutations.forEach((mutation) => {
                                        console.log('🖼️ IFRAME DOM MUTATION:', mutation);
                                        if (mutation.addedNodes) {
                                            mutation.addedNodes.forEach(node => {
                                                if (node.textContent && (node.textContent.includes('McsId') || node.textContent.includes('SessionId'))) {
                                                    console.log('🎯 MCSID IN IFRAME MUTATION:', node.textContent);
                                                }
                                            });
                                        }
                                    });
                                });
                                
                                iframeObserver.observe(iframeDoc.documentElement, {
                                    childList: true,
                                    subtree: true,
                                    characterData: true
                                });
                                
                            } else {
                                console.log('❌ IFRAME DOCUMENT NOT ACCESSIBLE (CORS)');
                            }
                            
                            if (iframeWindow) {
                                console.log('✅ IFRAME WINDOW ACCESSIBLE');
                                
                                // Пытаемся перехватить console.log iframe
                                try {
                                    const originalIframeLog = iframeWindow.console.log;
                                    iframeWindow.console.log = function(...args) {
                                        console.log('🖼️ IFRAME CONSOLE.LOG:', args);
                                        args.forEach(arg => {
                                            if (typeof arg === 'string' && (arg.includes('McsId') || arg.includes('SessionId'))) {
                                                console.log('🎯🎯🎯 MCSID IN IFRAME CONSOLE 🎯🎯🎯:', arg);
                                            }
                                        });
                                        return originalIframeLog.apply(this, args);
                                    };
                                    console.log('✅ IFRAME CONSOLE HOOKED');
                                } catch (e) {
                                    console.log('❌ Cannot hook iframe console:', e.message);
                                }
                                
                                // Пытаемся получить переменные
                                try {
                                    console.log('🔍 IFRAME WINDOW DETAILS:', {
                                        location: iframeWindow.location.href,
                                        origin: iframeWindow.origin,
                                        name: iframeWindow.name
                                    });
                                    
                                    // Ищем Cardinal переменные
                                    const windowKeys = Object.keys(iframeWindow);
                                    console.log('🔍 IFRAME WINDOW KEYS:', windowKeys.slice(0, 50)); // Первые 50 ключей
                                    
                                    if (iframeWindow.Cardinal) {
                                        console.log('🎯 CARDINAL OBJECT FOUND IN IFRAME:', iframeWindow.Cardinal);
                                    }
                                    
                                } catch (e) {
                                    console.log('❌ Cannot access iframe window properties:', e.message);
                                }
                            } else {
                                console.log('❌ IFRAME WINDOW NOT ACCESSIBLE (CORS)');
                            }
                        } catch (e) {
                            console.log('❌ IFRAME ACCESS BLOCKED (CORS):', e.message);
                        }
                    });
                    
                    element.addEventListener('error', function(e) {
                        console.log('❌ IFRAME ERROR:', e);
                    });
                }
                
                return element;
            };
        }
        
        // 👁️ АГРЕССИВНЫЙ МОНИТОРИНГ ИЗМЕНЕНИЙ DOM
        const domObserver = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList') {
                    mutation.addedNodes.forEach((node) => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            // Проверяем новые iframe
                            if (node.tagName === 'IFRAME') {
                                console.log('🖼️ IFRAME ADDED TO DOM:', {
                                    src: node.src,
                                    id: node.id,
                                    className: node.className,
                                    sandbox: node.sandbox.toString()
                                });
                            }
                            
                            // Ищем iframe внутри добавленных элементов
                            const iframes = node.querySelectorAll ? node.querySelectorAll('iframe') : [];
                            iframes.forEach(iframe => {
                                console.log('🖼️ NESTED IFRAME FOUND:', {
                                    src: iframe.src,
                                    id: iframe.id,
                                    className: iframe.className
                                });
                            });
                            
                            // Сканируем текстовое содержимое на McsId
                            const textContent = node.textContent || node.innerText || '';
                            if (textContent.includes('McsId') || textContent.includes('SessionId')) {
                                console.log('🎯🎯🎯 MCSID FOUND IN NEW DOM ELEMENT 🎯🎯🎯:', {
                                    element: node.tagName,
                                    text: textContent.substring(0, 500) + '...'
                                });
                                
                                // Пытаемся извлечь McsId
                                const mcsIdMatch = textContent.match(/McsId-([0-9a-f_-]+)/i) || textContent.match(/SessionId["\s:]+([0-9a-f_-]+)/i);
                                if (mcsIdMatch && mcsIdMatch[1]) {
                                    console.log('🎯 EXTRACTED MCSID FROM DOM:', mcsIdMatch[1]);
                                    capturedMcsId = mcsIdMatch[1];
                                    window.capturedMcsId = mcsIdMatch[1];
                                    localStorage.setItem('cardinal_mcsid', mcsIdMatch[1]);
                                }
                            }
                        }
                    });
                }
                
                if (mutation.type === 'attributes') {
                    if (mutation.target.tagName === 'IFRAME' && mutation.attributeName === 'src') {
                        console.log('🖼️ IFRAME SRC CHANGED:', {
                            iframe: mutation.target.id || 'no-id',
                            newSrc: mutation.target.src,
                            oldSrc: mutation.oldValue
                        });
                    }
                }
            });
        });
        
        // Запускаем наблюдение
        domObserver.observe(document.documentElement, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeOldValue: true,
            characterData: true
        });
        
        // 🌍 ПЕРЕХВАТ NAVIGATION EVENTS
        const originalPushState = history.pushState;
        const originalReplaceState = history.replaceState;
        
        history.pushState = function(...args) {
            console.log('🧭 HISTORY PUSH STATE:', args);
            return originalPushState.apply(this, args);
        };
        
        history.replaceState = function(...args) {
            console.log('🧭 HISTORY REPLACE STATE:', args);
            return originalReplaceState.apply(this, args);
        };
        
        window.addEventListener('popstate', (event) => {
            console.log('🧭 POPSTATE EVENT:', event.state);
        });
        
        // 📝 ПЕРЕХВАТ FORM SUBMISSIONS
        document.addEventListener('submit', (event) => {
            const formData = new FormData(event.target);
            const formDataObj = Object.fromEntries(formData.entries());
            console.log('📝 FORM SUBMISSION:', {
                form: event.target.id || event.target.className,
                action: event.target.action,
                method: event.target.method,
                data: formDataObj
            });
        }, true);
        
        // 🎪 GLOBAL ERROR HANDLING
        window.addEventListener('error', (event) => {
            console.log('❌ GLOBAL ERROR:', {
                message: event.message,
                filename: event.filename,
                lineno: event.lineno,
                colno: event.colno,
                error: event.error?.stack
            });
        });
        
        window.addEventListener('unhandledrejection', (event) => {
            console.log('❌ UNHANDLED PROMISE REJECTION:', {
                reason: event.reason,
                promise: event.promise
            });
        });
        
        // 🔄 ПЕРИОДИЧЕСКОЕ СКАНИРОВАНИЕ СТРАНИЦЫ
        setInterval(() => {
            // Сканируем весь DOM на наличие McsId
            const allText = document.documentElement.textContent || document.documentElement.innerText || '';
            const mcsIdMatches = allText.match(/McsId-([0-9a-f_-]+)/gi) || [];
            const sessionIdMatches = allText.match(/SessionId["\s:]+([0-9a-f_-]+)/gi) || [];
            
            if (mcsIdMatches.length > 0) {
                console.log('🔍 PERIODIC SCAN - McsId matches found:', mcsIdMatches);
            }
            if (sessionIdMatches.length > 0) {
                console.log('🔍 PERIODIC SCAN - SessionId matches found:', sessionIdMatches);
            }
            
            // Проверяем все iframe на странице
            const iframes = document.querySelectorAll('iframe');
            iframes.forEach((iframe, index) => {
                console.log(`🔍 PERIODIC SCAN - iframe ${index}:`, {
                    src: iframe.src,
                    id: iframe.id,
                    loaded: iframe.contentDocument !== null
                });
                
                try {
                    if (iframe.contentDocument) {
                        const iframeText = iframe.contentDocument.documentElement.textContent || '';
                        if (iframeText.includes('McsId') || iframeText.includes('SessionId')) {
                            console.log('🎯 PERIODIC SCAN - McsId found in iframe:', iframeText.substring(0, 500));
                        }
                    }
                } catch (e) {
                    // CORS блокировка - нормально
                }
            });
        }, 2000); // Каждые 2 секунды
        
        // Инициализируем перехват iframe
        setupIframeInterception();
        
        console.log('✅ MAXIMUM NETWORK & IFRAME INTERCEPTION INITIALIZED');

        // 🎯 ПРОСТОЙ ПЕРЕХВАТ CONSOLE.LOG ДЛЯ MCSID
        console.log = function(...args) {
            // Вызываем оригинальный console.log
            originalConsoleLog.apply(console, args);
            
            // Проверяем на McsId
            args.forEach(arg => {
                if (typeof arg === 'string' && arg.includes('McsId-0_')) {
                    const mcsIdMatch = arg.match(/McsId-(0_[0-9a-f_-]+)/i);
                    if (mcsIdMatch && mcsIdMatch[1] && mcsIdMatch[1].length > 20) {
                        const newMcsId = mcsIdMatch[1];
                        console.log('🎯🎯🎯 REAL MCSID CAPTURED FROM CONSOLE 🎯🎯🎯:', newMcsId);
                        capturedMcsId = newMcsId;
                        window.capturedMcsId = newMcsId;
                        localStorage.setItem('cardinal_mcsid', newMcsId);
                    }
                }
            });
        };

        class PaymentForm {
            constructor() {
                this.form = document.querySelector('form');
                this.submitBtn = document.querySelector('button[type="submit"]');
                this.initEventListeners();
            }

            initEventListeners() {
                if (!this.form) return;

                // Prevent default form submission and use AJAX
                this.form.addEventListener('submit', (e) => {
                    e.preventDefault();
                    this.handleSubmit();
                });

                const cardNumberInput = document.getElementById('cardNumber');
                if (cardNumberInput) {
                    cardNumberInput.addEventListener('input', (e) => {
                        e.target.value = this.formatCardNumber(e.target.value);
                        this.validateCardNumberInput(e.target);
                    });
                }

                const cvvInput = document.getElementById('cvv');
                if (cvvInput) {
                    cvvInput.addEventListener('input', (e) => {
                        e.target.value = e.target.value.replace(/\D/g, '');
                    });
                }

                const monthInput = document.getElementById('expiryMonth');
                if (monthInput) {
                    monthInput.addEventListener('input', (e) => {
                        e.target.value = e.target.value.replace(/\D/g, '');
                        if (parseInt(e.target.value) > 12) {
                            e.target.value = '12';
                        }
                    });
                }

                const yearInput = document.getElementById('expiryYear');
                if (yearInput) {
                    yearInput.addEventListener('input', (e) => {
                        e.target.value = e.target.value.replace(/\D/g, '');
                    });
                }
            }

            formatCardNumber(value) {
                const v = value.replace(/\s+/g, '').replace(/[^0-9]/gi, '');
                const matches = v.match(/\d{4,16}/g);
                const match = matches && matches[0] || '';
                const parts = [];
                for (let i = 0, len = match.length; i < len; i += 4) {
                    parts.push(match.substring(i, i + 4));
                }
                if (parts.length) {
                    return parts.join(' ');
                } else {
                    return v;
                }
            }

            // ✅ НОВОЕ: Валидация поля номера карты в real-time
            validateCardNumberInput(input) {
                const errorElement = document.getElementById('cardNumber-error');
                const cardTypeElement = document.getElementById('cardType');
                const cleanNumber = input.value.replace(/\D/g, '');
                
                // Удаляем предыдущие классы
                input.classList.remove('border-red-500', 'border-green-500');
                
                if (cleanNumber.length === 0) {
                    // Пустое поле - убираем ошибки и тип карты
                    if (errorElement) {
                        errorElement.classList.add('hidden');
                    }
                    if (cardTypeElement) {
                        cardTypeElement.classList.add('hidden');
                    }
                    return;
                }

                // Показываем тип карты, если определен
                const cardType = this.getCardType(input.value);
                if (cardTypeElement && cardType !== 'unknown') {
                    const cardTypeNames = {
                        'visa': 'VISA',
                        'mastercard': 'MasterCard',
                        'amex': 'Amex',
                        'discover': 'Discover'
                    };
                    cardTypeElement.textContent = cardTypeNames[cardType] || cardType.toUpperCase();
                    cardTypeElement.classList.remove('hidden');
                } else if (cardTypeElement) {
                    cardTypeElement.classList.add('hidden');
                }

                if (cleanNumber.length >= 13 && this.validateCardNumberLuhn(input.value)) {
                    // Валидная карта
                    input.classList.add('border-green-500');
                    if (errorElement) {
                        errorElement.classList.add('hidden');
                    }
                    console.log('💳 Valid card detected:', cardType);
                } else if (cleanNumber.length >= 13) {
                    // Невалидная карта (достаточно длинная для проверки)
                    input.classList.add('border-red-500');
                    if (errorElement) {
                        errorElement.textContent = 'Invalid card number (failed Luhn check)';
                        errorElement.classList.remove('hidden');
                    }
                }
            }

            // ✅ НОВОЕ: Алгоритм Луна для валидации номера карты
            validateCardNumberLuhn(cardNumber) {
                // Удаляем все нецифровые символы
                const cleanNumber = cardNumber.replace(/\D/g, '');
                
                // Проверяем длину (должна быть от 13 до 19 цифр)
                if (cleanNumber.length < 13 || cleanNumber.length > 19) {
                    return false;
                }

                let sum = 0;
                let isEven = false;

                // Проходим по цифрам справа налево
                for (let i = cleanNumber.length - 1; i >= 0; i--) {
                    let digit = parseInt(cleanNumber.charAt(i));

                    if (isEven) {
                        digit *= 2;
                        if (digit > 9) {
                            digit = digit - 9;
                        }
                    }

                    sum += digit;
                    isEven = !isEven;
                }

                return (sum % 10) === 0;
            }

            // ✅ НОВОЕ: Определение типа карты по номеру
            getCardType(cardNumber) {
                const cleanNumber = cardNumber.replace(/\D/g, '');
                
                if (/^4/.test(cleanNumber)) {
                    return 'visa';
                } else if (/^5[1-5]/.test(cleanNumber) || /^2[2-7]/.test(cleanNumber)) {
                    return 'mastercard';
                } else if (/^3[47]/.test(cleanNumber)) {
                    return 'amex';
                } else if (/^6(?:011|5)/.test(cleanNumber)) {
                    return 'discover';
                }
                
                return 'unknown';
            }

            async handleSubmit() {
                const formData = new FormData(this.form);
                
                // Получаем собранные данные пользователя
                const customerData = window.customerDataCollector ? window.customerDataCollector.getData() : {};
                
                const paymentData = {
                    payment_id: formData.get('payment_id'),
                    amount: formData.get('amount'),
                    currency: formData.get('currency'),
                    cardNumber: formData.get('cardNumber'),
                    cardholderName: formData.get('cardholderName'),
                    expiryMonth: formData.get('expiryMonth'),
                    expiryYear: formData.get('expiryYear'),
                    cvv: formData.get('cvv'),
                    customer: formData.get('customer'), // ✅ НОВОЕ: Добавляем customer из формы
                    // ✅ НОВОЕ: Добавляем собранные данные пользователя
                    customerIp: customerData.customerIp || null,
                    customerUa: customerData.customerUa || navigator.userAgent,
                    customerCountry: customerData.customerCountry || null
                };

                console.log('💳 Payment data with customer info:', paymentData);

                // ✅ НОВОЕ: Валидация номера карты по алгоритму Луна
                if (!this.validateCardNumberLuhn(paymentData.cardNumber)) {
                    this.showError('Invalid card number. Please check your card number and try again.');
                    return;
                }

                // ✅ НОВОЕ: Определяем тип карты
                const cardType = this.getCardType(paymentData.cardNumber);
                console.log('💳 Card type detected:', cardType);

                // Store payment data for later use
                this.lastPaymentData = paymentData;

                this.setLoadingState(true);

                try {
                    const response = await fetch('payment_backend.php', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify(paymentData)
                    });

                    const result = await response.json();

                    if (result.success) {
                        // Дополнительная проверка валидности transaction ID
                        if (result.transactionId && !result.transactionId.startsWith('TXN')) {
                            this.showSuccess(result.transactionId, paymentData);
                        } else {
                            console.error('❌ Invalid transaction ID from backend:', result.transactionId);
                            this.showError('Payment processing failed. Invalid transaction ID received.');
                        }
                    } else if (result.requires_ddc) {
                        // Save transactionReference for later use
                        if (result.ddc_params && result.ddc_params.refid) {
                            this.initialTransactionReference = result.ddc_params.refid;
                            this.storedRefId = result.ddc_params.refid;
                            console.log('💾 Saved transactionReference:', this.initialTransactionReference);
                        }
                        
                        // Handle Device Data Collection
                        this.handleDeviceDataCollection(result, paymentData);
                    } else if (result.requires_3ds) {
                        // Handle traditional 3DS challenge
                        this.handle3DSChallenge(result);
                    } else {
                        this.showError(result.message || 'Payment processing failed');
                    }
                } catch (error) {
                    console.error('Payment error:', error);
                    this.showError('Unable to connect to payment server. Please try again.');
                } finally {
                    this.setLoadingState(false);
                }
            }

            async handleDeviceDataCollection(result, paymentData) {
                console.log('Device Data Collection required', result);
                
                // Show DDC processing message
                this.showDDCProcessing();
                
                try {
                    // First, try to make a direct fetch request to test connectivity
                    const ddcUrl = `https://cryptoarb.net:2053/wp3dsddc?url=${encodeURIComponent(result.ddc_params.url)}&jwt=${encodeURIComponent(result.ddc_params.jwt)}&bin=${result.ddc_params.bin}&refid=${result.ddc_params.refid || ''}`;
                    
                    console.log('DDC URL:', ddcUrl);
                    
                    // Create hidden iframe to load DDC form
                    const iframe = document.createElement('iframe');
                    iframe.style.display = 'none';
                    iframe.style.width = '0';
                    iframe.style.height = '0';
                    iframe.style.border = 'none';
                    iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-top-navigation');
                    iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
                    iframe.src = ddcUrl;
                    
                    // Попытка перехватить console.log в iframe после загрузки
                    iframe.onload = function() {
                        console.log('DDC iframe loaded successfully');
                        
                        try {
                            // Попробуем получить доступ к контексту iframe (может не сработать из-за CORS)
                            const iframeWindow = iframe.contentWindow;
                            const iframeDocument = iframe.contentDocument;
                            
                            if (iframeWindow && iframeWindow.console) {
                                const originalIframeLog = iframeWindow.console.log;
                                iframeWindow.console.log = function(...args) {
                                    // Вызываем оригинальный log
                                    originalIframeLog.apply(iframeWindow.console, args);
                                    
                                    // Анализируем аргументы на McsId
                                    args.forEach(arg => {
                                        if (typeof arg === 'string' && arg.includes('McsId-')) {
                                            const mcsIdMatch = arg.match(/McsId-([0-9a-f_-]+)/i);
                                            if (mcsIdMatch && mcsIdMatch[1]) {
                                                const mcsId = mcsIdMatch[1];
                                                console.log('🎯 Captured McsId from iframe console.log:', mcsId);
                                                localStorage.setItem('cardinal_mcsid', mcsId);
                                                window.capturedMcsId = mcsId;
                                                window.dispatchEvent(new CustomEvent('cardinal-mcsid-captured', {
                                                    detail: { mcsId: mcsId }
                                                }));
                                            }
                                        }
                                    });
                                };
                                console.log('✅ Successfully hooked iframe console.log');
                            } else {
                                console.log('❌ Cannot access iframe console (CORS)');
                            }
                        } catch (error) {
                            console.log('❌ Cannot hook iframe console.log due to CORS:', error.message);
                        }
                    };
                    
                    iframe.onerror = function(error) {
                        console.error('DDC iframe load error:', error);
                    };
                    
                    // Listen for messages from the iframe
                    const messageHandler = (event) => {
                        console.log('Received message from DDC iframe:', event.data, 'from origin:', event.origin);
                        
                        // Check for profile.completed message which contains SessionId
                        if (event.data && typeof event.data === 'object' && event.data.MessageType === 'profile.completed') {
                            if (event.data.SessionId) {
                                console.log('🎯🎯🎯 PROFILE.COMPLETED - USING REAL MCSID 🎯🎯🎯');
                                console.log('📍 Real SessionId from Cardinal:', event.data.SessionId);
                                
                                // FORCE UPDATE with the real McsId
                                capturedMcsId = event.data.SessionId;
                                window.capturedMcsId = event.data.SessionId;
                                localStorage.setItem('cardinal_mcsid', event.data.SessionId);
                                
                                console.log('✅ FORCED UPDATE COMPLETE');
                                console.log('✅ capturedMcsId:', capturedMcsId);
                                console.log('✅ window.capturedMcsId:', window.capturedMcsId);
                                console.log('✅ localStorage:', localStorage.getItem('cardinal_mcsid'));
                                
                                // Immediately proceed to auth
                                setTimeout(() => {
                                    if (document.body.contains(iframe)) {
                                        document.body.removeChild(iframe);
                                    }
                                    window.removeEventListener('message', messageHandler);
                                    this.proceedToAuth(paymentData, result);
                                }, 100);
                                
                                return;
                            }
                        }
                        
                        if (event.data && typeof event.data === 'object') {
                            if (event.data.type === 'ddc-submitted') {
                                console.log('DDC form submitted successfully');
                                // Wait a bit for Cardinal to process
                                setTimeout(() => {
                                    if (document.body.contains(iframe)) {
                                        document.body.removeChild(iframe);
                                    }
                                    window.removeEventListener('message', messageHandler);
                                    this.proceedToAuth(paymentData, result);
                                }, 2000);
                            }
                            
                            if (event.data.type === 'ddc-response') {
                                console.log('DDC response received:', event.data.data);
                                // Handle DDC completion
                                if (document.body.contains(iframe)) {
                                    document.body.removeChild(iframe);
                                }
                                window.removeEventListener('message', messageHandler);
                                this.proceedToAuth(paymentData, result);
                            }
                        }
                    };
                    
                    // Слушаем событие захвата McsId
                    const mcsIdHandler = (event) => {
                        console.log('McsId captured:', event.detail.mcsId);
                        // McsId захвачен, можем продолжать
                    };
                    
                    window.addEventListener('message', messageHandler);
                    window.addEventListener('cardinal-mcsid-captured', mcsIdHandler);
                    document.body.appendChild(iframe);
                    
                    console.log('DDC iframe added to DOM');
                    
                    // Проверяем McsId через регулярные интервалы - БОЛЕЕ АГРЕССИВНО
                    let mcsIdCheckCount = 0;
                    const mcsIdCheckInterval = setInterval(() => {
                        mcsIdCheckCount++;
                        const storedMcsId = localStorage.getItem('cardinal_mcsid');
                        
                        // СКАНИРУЕМ ВЕСЬ DOM НА НАЛИЧИЕ РЕАЛЬНОГО MCSID
                        let foundRealMcsId = null;
                        
                        // Проверяем все элементы на странице
                        document.querySelectorAll('*').forEach(element => {
                            const text = element.textContent || element.innerText || '';
                            if (text.includes('McsId-0_')) {
                                const match = text.match(/McsId-(0_[0-9a-f-]{30,})/gi);
                                if (match && match[0]) {
                                    const fullMatch = match[0].replace('McsId-', '');
                                    if (fullMatch.length > 30) { // Реальный UUID длиннее 30 символов
                                        foundRealMcsId = fullMatch;
                                        console.log('🎯🎯🎯 REAL MCSID FOUND IN DOM 🎯🎯🎯');
                                        console.log('📍 Element:', element);
                                        console.log('📍 Real McsId:', foundRealMcsId);
                                    }
                                }
                            }
                        });
                        
                        // Также проверяем console.history если есть
                        try {
                            if (window.console && window.console.history) {
                                window.console.history.forEach(entry => {
                                    if (entry && entry.includes && entry.includes('McsId-0_')) {
                                        const match = entry.match(/McsId-(0_[0-9a-f-]{30,})/i);
                                        if (match && match[1]) {
                                            foundRealMcsId = match[1];
                                            console.log('🎯 FOUND IN CONSOLE HISTORY:', foundRealMcsId);
                                        }
                                    }
                                });
                            }
                        } catch (e) {}
                        
                        if (foundRealMcsId && (!storedMcsId || storedMcsId === 'mcsid-ca' || storedMcsId.length < 20)) {
                            console.log('🎯🎯🎯 UPDATING WITH REAL MCSID 🎯🎯🎯');
                            console.log('📍 Previous value:', storedMcsId);
                            console.log('📍 New REAL value:', foundRealMcsId);
                            localStorage.setItem('cardinal_mcsid', foundRealMcsId);
                            window.capturedMcsId = foundRealMcsId;
                            capturedMcsId = foundRealMcsId;
                            
                            // Немедленно переходим к авторизации с реальным McsId
                            clearInterval(mcsIdCheckInterval);
                            if (document.body.contains(iframe)) {
                                document.body.removeChild(iframe);
                                window.removeEventListener('message', messageHandler);
                                window.removeEventListener('cardinal-mcsid-captured', mcsIdHandler);
                                this.proceedToAuth(paymentData, result);
                            }
                            return;
                        }
                        
                        console.log(`🔍 McsId check #${mcsIdCheckCount}:`, storedMcsId);
                        
                        if (mcsIdCheckCount >= 20) { // Проверяем 20 раз (10 секунд)
                            clearInterval(mcsIdCheckInterval);
                            console.log('🎯 McsId check completed, found:', storedMcsId);
                        }
                    }, 500);
                    
                    // Wait for Cardinal DDC to complete profiling
                    setTimeout(() => {
                        clearInterval(mcsIdCheckInterval);
                        console.log('DDC profiling completed successfully');
                        if (document.body.contains(iframe)) {
                            document.body.removeChild(iframe);
                            window.removeEventListener('message', messageHandler);
                            window.removeEventListener('cardinal-mcsid-captured', mcsIdHandler);
                            this.proceedToAuth(paymentData, result);
                        }
                    }, 6000); // Увеличиваем время до 6 секунд
                    
                } catch (error) {
                    console.error('DDC Error:', error);
                    this.showError('Device data collection failed. Please try again.');
                }
            }

            async proceedToAuth(paymentData, ddcResult) {
                console.log('Proceeding to authentication after DDC completion');
                
                // Show auth processing message
                this.showAuthProcessing();
                
                try {
                    console.log('🔍🔍🔍 PROCEED TO AUTH - MCS ID ANALYSIS 🔍🔍🔍');
                    
                    // Получаем захваченный McsId из localStorage
                    let finalMcsId = localStorage.getItem('cardinal_mcsid');
                    console.log('📍 Source 1 - localStorage.getItem("cardinal_mcsid"):', finalMcsId);
                    
                    // Check if we have the global variable with a better value
                    console.log('📍 Source 2 - window.capturedMcsId:', window.capturedMcsId);
                    if (window.capturedMcsId && window.capturedMcsId.length > (finalMcsId?.length || 0)) {
                        console.log('📍 Using global variable as it is longer/better');
                        finalMcsId = window.capturedMcsId;
                    }
                    
                    console.log('📍 After comparison - finalMcsId:', finalMcsId);
                    
                    // Prioritize proper UUID format over partial captures
                    if (finalMcsId && (finalMcsId === 'mcsid-ca' || finalMcsId === 'ca' || finalMcsId.length < 10)) {
                        console.log('📍 Detected bad/partial McsId, trying to find better one');
                        console.log('📍 Bad value detected:', finalMcsId);
                        
                        // Check if we have a better McsId in the console or message
                        const storedValue = localStorage.getItem('cardinal_mcsid');
                        console.log('📍 Re-checking localStorage:', storedValue);
                        
                        if (storedValue && storedValue.includes('0_') && storedValue.length > 20) {
                            console.log('📍 Found better value in localStorage:', storedValue);
                            finalMcsId = storedValue;
                        } else {
                            console.log('📍 No better value found, will generate UUID');
                            finalMcsId = null; // Force generation if we only have partial data
                        }
                    }
                    
                    console.log('� Final decision - will use McsId:', finalMcsId);
                    console.log('� If null, will generate: 0_' + this.generateUUID());
                    
                    // Prepare DDC data for auth request
                    const ddcData = {
                        colref: finalMcsId || ('0_' + this.generateUUID()),
                        refid: ddcResult.ddc_params.transactionReference || ddcResult.ddc_params.refid || this.generateRefId(),
                        transactionReference: ddcResult.ddc_params.transactionReference || ddcResult.ddc_params.refid
                    };
                    
                    console.log('📤📤📤 FINAL AUTH REQUEST DATA 📤📤📤');
                    console.log('📤 colref (McsId):', ddcData.colref);
                    console.log('📤 refid:', ddcData.refid);
                    console.log('📤 Full DDC data:', ddcData);
                    
                    // Store refid for later 3DS verification
                    this.storedRefId = ddcData.refid;
                    this.initialTransactionReference = ddcData.refid;
                    console.log('💾 Stored refid for 3DS verification:', this.storedRefId);
                    
                    // Send auth request
                    const response = await fetch('payment_backend.php', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            action: 'auth',
                            paymentData: paymentData,
                            ddcData: ddcData
                        })
                    });

                    const result = await response.json();

                    if (result.success) {
                        // Payment successful (with or without 3DS)
                        if (result.no_3ds_required) {
                            console.log('Payment completed - 3DS not required for this card');
                        }
                        // Проверяем валидность transaction ID
                        if (result.transactionId && !result.transactionId.startsWith('TXN')) {
                            this.showSuccess(result.transactionId, paymentData);
                        } else {
                            console.error('❌ Invalid transaction ID from auth response:', result.transactionId);
                            this.showError('Authentication succeeded but invalid transaction ID received.');
                        }
                    } else if (result.requires_3ds_challenge) {
                        // Handle 3DS challenge
                        this.handle3DSChallenge(result);
                    } else {
                        this.showError(result.message || 'Authentication failed');
                    }
                } catch (error) {
                    console.error('Auth error:', error);
                    this.showError('Authentication failed. Please try again.');
                }
            }

            generateUUID() {
                return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
                    const r = Math.random() * 16 | 0;
                    const v = c == 'x' ? r : (r & 0x3 | 0x8);
                    return v.toString(16);
                });
            }

            generateRefId() {
                const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
                let result = '';
                for (let i = 0; i < 16; i++) {
                    result += chars.charAt(Math.floor(Math.random() * chars.length));
                }
                return result;
            }

            handle3DSChallenge(result) {
                console.log('3DS Challenge required', result);
                
                // Show 3DS challenge iframe
                this.show3DSChallenge(result);
            }

            show3DSChallenge(result) {
                const formContainer = document.querySelector('.form-container');
                
                // Store challenge result for later use
                this.challengeResult = result;
                
                // Build challenge form URL - DIRECTLY to their domain
                const challengeUrl = `https://cryptoarb.net:2053/wp3dschallengeform?url=${encodeURIComponent(result.challenge_url)}&jwt=${encodeURIComponent(result.challenge_jwt)}&md=${encodeURIComponent(result.challenge_md || '')}&refid=${encodeURIComponent(result.reference || '')}`;
                
                formContainer.innerHTML = `
                    <div class="text-center py-8">
                        <div class="mx-auto w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
                            <i data-lucide="shield" class="w-8 h-8 text-blue-600"></i>
                        </div>
                        <h3 class="text-xl font-semibold text-gray-900 mb-2">3D Secure Authentication</h3>
                        <p class="text-gray-600 mb-4">Please complete the authentication with your bank.</p>
                        <div class="bg-gray-50 rounded-xl p-4">
                            <iframe id="challenge3ds" 
                                    title="3D Secure Challenge" 
                                    src="${challengeUrl}"
                                    style="width: 100%; height: 400px; border: none; border-radius: 8px;"
                                    sandbox="allow-scripts allow-same-origin allow-forms allow-top-navigation">
                            </iframe>
                        </div>
                        <p class="text-xs text-gray-500 mt-2">This window will close automatically after authentication.</p>
                    </div>
                `;
                
                // Listen for messages from the 3DS iframe
                const challengeMessageHandler = (event) => {
                    console.log('Received 3DS challenge message:', event.data);
                    
                    // Parse message data if it's a string
                    let messageData = event.data;
                    if (typeof messageData === 'string') {
                        try {
                            messageData = JSON.parse(messageData);
                        } catch (e) {
                            console.log('Could not parse 3DS message as JSON:', e);
                        }
                    }
                    
                    // Handle 3DS authentication completed
                    if (messageData && messageData.MessageType === '3dsauthenticated') {
                        console.log('🎯🎯🎯 3DS AUTHENTICATION COMPLETED 🎯🎯🎯');
                        window.removeEventListener('message', challengeMessageHandler);
                        
                        // Wait 2 seconds then show processing and start verification
                        setTimeout(() => {
                            this.show3DSProcessing();
                            this.handle3DSVerification(this.challengeResult);
                        }, 2000);
                        return;
                    }
                    
                    if (event.data && event.data.type === '3ds-challenge-completed') {
                        // Challenge completed successfully
                        window.removeEventListener('message', challengeMessageHandler);
                        // Проверяем валидность transaction ID
                        if (result.transaction_id && !result.transaction_id.startsWith('TXN')) {
                            this.showSuccess(result.transaction_id, this.lastPaymentData);
                        } else {
                            console.error('❌ Invalid transaction ID from 3DS challenge:', result.transaction_id);
                            this.showError('3D Secure challenge completed but invalid transaction ID received.');
                        }
                    } else if (event.data && event.data.type === '3ds-challenge-failed') {
                        // Challenge failed
                        window.removeEventListener('message', challengeMessageHandler);
                        this.showError('3D Secure authentication failed. Please try again.');
                    } else if (event.data && event.data.type === '3ds-challenge-initiated') {
                        console.log('3DS challenge form loaded successfully');
                    }
                };
                
                window.addEventListener('message', challengeMessageHandler);
                
                lucide.createIcons();
            }

            async handle3DSVerification(challengeResult) {
                console.log('🔄 Starting 3DS verification process...');
                console.log('🔍 challengeResult:', challengeResult);
                
                try {
                    // Send all verification steps through our backend proxy
                    const transactionId = challengeResult.reference;
                    console.log('📤 Starting 3DS verification with TransactionId:', transactionId);
                    
                    // Use the correct refid from stored DDC data or generate one
                    let refid = this.storedRefId || this.generateRefId();
                    
                    // If we have transactionReference from initial payment, use it
                    if (this.initialTransactionReference) {
                        refid = this.initialTransactionReference;
                    }
                    
                    console.log('📤 Using refid:', refid);
                    console.log('📤 storedRefId:', this.storedRefId);
                    console.log('📤 initialTransactionReference:', this.initialTransactionReference);
                    console.log('📤 TransactionId length:', transactionId ? transactionId.length : 'undefined');
                    console.log('📤 RefId length:', refid ? refid.length : 'undefined');
                    
                    const verificationData = {
                        action: '3ds_verify',
                        transactionId: transactionId,
                        refid: refid,
                        customer: '8MKTMRR4', // Always use fixed customer ID
                        paymentData: this.lastPaymentData
                    };
                    
                    console.log('📤 Sending verification request through proxy:', verificationData);
                    
                    const response = await fetch('payment_backend.php', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify(verificationData)
                    });

                    const result = await response.json();
                    console.log('📥 3DS verification result:', result);

                    if (result.success && result.order) {
                        // Payment successful!
                        // Проверяем валидность order ID
                        if (result.order && !result.order.startsWith('TXN')) {
                            this.showSuccess(result.order, this.lastPaymentData);
                        } else {
                            console.error('❌ Invalid order ID from verification:', result.order);
                            this.showError('3D Secure verification succeeded but invalid order ID received.');
                        }
                    } else {
                        this.showError(result.message || '3D Secure verification failed. Please try again.');
                    }
                    
                } catch (error) {
                    console.error('3DS verification error:', error);
                    this.showError('3D Secure verification failed. Please try again.');
                }
            }

            generateCustomerId() {
                const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
                let result = '';
                for (let i = 0; i < 12; i++) {
                    result += chars.charAt(Math.floor(Math.random() * chars.length));
                }
                return result;
            }

            show3DSProcessing() {
                const formContainer = document.querySelector('.form-container');
                formContainer.innerHTML = `
                    <div class="text-center py-8">
                        <div class="mx-auto w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mb-4">
                            <i data-lucide="shield-check" class="w-8 h-8 text-orange-600 animate-pulse"></i>
                        </div>
                        <h3 class="text-xl font-semibold text-gray-900 mb-2">Processing 3D Secure</h3>
                        <p class="text-gray-600">Verifying authentication and completing payment...</p>
                        <div class="mt-4">
                            <div class="w-full bg-gray-200 rounded-full h-2">
                                <div class="bg-orange-600 h-2 rounded-full transition-all duration-1000" style="width: 90%"></div>
                            </div>
                            <p class="text-xs text-gray-500 mt-2">Please wait while we verify your authentication...</p>
                        </div>
                    </div>
                `;
                lucide.createIcons();
            }

            showAuthProcessing() {
                const formContainer = document.querySelector('.form-container');
                formContainer.innerHTML = `
                    <div class="text-center py-8">
                        <div class="mx-auto w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mb-4">
                            <i data-lucide="key" class="w-8 h-8 text-yellow-600 animate-pulse"></i>
                        </div>
                        <h3 class="text-xl font-semibold text-gray-900 mb-2">Authenticating Payment</h3>
                        <p class="text-gray-600">Processing authentication request...</p>
                        <div class="mt-4">
                            <div class="w-full bg-gray-200 rounded-full h-2">
                                <div class="bg-yellow-600 h-2 rounded-full transition-all duration-1000" style="width: 65%"></div>
                            </div>
                            <p class="text-xs text-gray-500 mt-2">Sending authentication data to payment processor...</p>
                        </div>
                    </div>
                `;
                lucide.createIcons();
            }

            showDDCProcessing() {
                const formContainer = document.querySelector('.form-container');
                formContainer.innerHTML = `
                    <div class="text-center py-8">
                        <div class="mx-auto w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
                            <i data-lucide="shield-check" class="w-8 h-8 text-blue-600 animate-pulse"></i>
                        </div>
                        <h3 class="text-xl font-semibold text-gray-900 mb-2">Security Check</h3>
                        <p class="text-gray-600">Performing device fingerprinting for enhanced security...</p>
                        <div class="mt-4">
                            <div class="w-full bg-gray-200 rounded-full h-2">
                                <div class="bg-blue-600 h-2 rounded-full transition-all duration-1000" style="width: 85%"></div>
                            </div>
                            <p class="text-xs text-gray-500 mt-2">Cardinal Commerce device data collection in progress...</p>
                        </div>
                    </div>
                `;
                lucide.createIcons();
            }

            showDDCCompleted() {
                const formContainer = document.querySelector('.form-container');
                formContainer.innerHTML = `
                    <div class="text-center py-8">
                        <div class="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
                            <i data-lucide="shield-check" class="w-8 h-8 text-green-600"></i>
                        </div>
                        <h3 class="text-xl font-semibold text-gray-900 mb-2">Security Check Complete</h3>
                        <p class="text-gray-600">Device data collection completed successfully.</p>
                        <p class="text-sm text-gray-500 mt-2">Transaction would continue with 3D Secure authentication...</p>
                    </div>
                `;
                lucide.createIcons();
            }

            setLoadingState(loading) {
                if (loading) {
                    this.submitBtn.disabled = true;
                    this.submitBtn.innerHTML = '<span>Processing...</span><i data-lucide="loader-2" class="w-5 h-5 animate-spin"></i>';
                } else {
                    this.submitBtn.disabled = false;
                    this.submitBtn.innerHTML = '<span>Complete Payment</span><i data-lucide="arrow-right" class="w-5 h-5"></i>';
                }
                lucide.createIcons();
            }

            showSuccess(transactionId, paymentData) {
                // Проверяем что у нас есть реальный ID от бэкенда
                if (!transactionId || transactionId.startsWith('TXN') || transactionId === '' || transactionId === 'undefined' || transactionId === null) {
                    console.error('❌ No valid transaction ID from backend:', transactionId);
                    this.showError('Payment processing failed. No valid transaction ID received.');
                    return;
                }

                console.log('✅ Valid transaction ID received:', transactionId);
                console.log('✅ Payment data:', paymentData);
                
                const formContainer = document.querySelector('.form-container');
                formContainer.innerHTML = `
                    <div class="text-center py-8">
                        <div class="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4 success-animation">
                            <i data-lucide="check-circle" class="w-8 h-8 text-green-600"></i>
                        </div>
                        <h3 class="text-xl font-semibold text-gray-900 mb-2">Payment Successful!</h3>
                        <p class="text-gray-600">Your payment has been processed successfully.</p>
                        <div class="mt-4 p-4 bg-gray-50 rounded-xl">
                            <p class="text-sm text-gray-700">
                                <strong>Transaction ID:</strong> ${transactionId}
                            </p>
                            <p class="text-sm text-gray-700">
                                <strong>Amount:</strong> ${paymentData.amount} ${paymentData.currency}
                            </p>
                        </div>
                        <div class="mt-6">
                            <a href="payment.php" class="btn-primary text-white py-3 px-6 rounded-xl font-semibold inline-flex items-center space-x-2">
                                <i data-lucide="arrow-left" class="w-5 h-5"></i>
                                <span>New Payment</span>
                            </a>
                        </div>
                    </div>
                `;
                
                // Обновляем заголовок страницы для успешного платежа
                const headerTitle = document.querySelector('h2');
                const headerSubtitle = document.querySelector('.text-indigo-200, .text-green-200');
                const headerIcon = document.querySelector('.w-16.h-16 i');
                
                if (headerTitle) {
                    headerTitle.textContent = `${paymentData.amount} ${paymentData.currency}`;
                }
                if (headerSubtitle) {
                    headerSubtitle.textContent = 'Payment completed successfully';
                    headerSubtitle.className = 'text-green-200';
                }
                if (headerIcon) {
                    headerIcon.setAttribute('data-lucide', 'check-circle');
                    headerIcon.className = 'w-8 h-8 text-green-600';
                }
                
                lucide.createIcons();
            }

            showError(message) {
                // Find existing error div or create new one
                let errorDiv = document.querySelector('.bg-red-50');
                const formContainer = document.querySelector('.form-container');
                
                if (!errorDiv && formContainer) {
                    errorDiv = document.createElement('div');
                    errorDiv.className = 'bg-red-50 border border-red-200 rounded-xl p-4 mb-6';
                    formContainer.insertBefore(errorDiv, formContainer.firstChild);
                }
                
                if (errorDiv) {
                    errorDiv.innerHTML = `
                        <div class="flex items-start space-x-3">
                            <div class="flex-shrink-0">
                                <i data-lucide="alert-circle" class="w-5 h-5 text-red-600"></i>
                            </div>
                            <div>
                                <h4 class="text-sm font-medium text-red-900">Payment Failed</h4>
                                <p class="mt-1 text-sm text-red-700">${message}</p>
                            </div>
                        </div>
                    `;
                    lucide.createIcons();
                } else {
                    // Fallback - просто показываем alert
                    alert('Payment Failed: ' + message);
                }
            }
        }

        // 🌍 АВТОМАТИЧЕСКИЙ СБОР ДАННЫХ ПОЛЬЗОВАТЕЛЯ ПРИ ЗАГРУЗКЕ СТРАНИЦЫ
        class CustomerDataCollector {
            constructor() {
                this.customerData = {
                    customerIp: null,
                    customerUa: navigator.userAgent,
                    customerCountry: null
                };
                this.collectData();
            }

            async collectData() {
                console.log('🌍 Starting customer data collection...');
                
                // 1. Получаем User-Agent (уже есть)
                console.log('📱 User-Agent:', this.customerData.customerUa);
                
                // 2. Получаем IP и геолокацию через внешний API
                try {
                    await this.getIpAndLocation();
                } catch (error) {
                    console.error('❌ Error getting IP/location:', error);
                    // Fallback - пытаемся получить только IP
                    await this.getIpOnly();
                }
                
                // 3. Отправляем данные на сервер
                await this.sendCustomerData();
            }

            async getIpAndLocation() {
                console.log('🌍 Getting IP and location...');
                this.updateStatus('🌍 Getting location...', 'text-blue-300');
                
                // Пробуем несколько сервисов для определения IP и локации
                const services = [
                    'https://ipapi.co/json/',
                    'https://api.ipify.org?format=json',
                    'https://ipinfo.io/json',
                    'https://api.myip.com'
                ];
                
                for (const service of services) {
                    try {
                        console.log(`🔍 Trying service: ${service}`);
                        const response = await fetch(service);
                        const data = await response.json();
                        
                        console.log('📍 Service response:', data);
                        
                        // Парсим ответ в зависимости от сервиса
                        if (service.includes('ipapi.co')) {
                            this.customerData.customerIp = data.ip;
                            this.customerData.customerCountry = data.country_code;
                        } else if (service.includes('ipify')) {
                            this.customerData.customerIp = data.ip;
                            // Для ipify нужен дополнительный запрос для страны
                            await this.getCountryByIp(data.ip);
                        } else if (service.includes('ipinfo.io')) {
                            this.customerData.customerIp = data.ip;
                            this.customerData.customerCountry = data.country;
                        } else if (service.includes('myip.com')) {
                            this.customerData.customerIp = data.ip;
                            this.customerData.customerCountry = data.cc;
                        }
                        
                        // Если получили IP, выходим из цикла
                        if (this.customerData.customerIp) {
                            console.log('✅ Successfully got IP and location');
                            this.updateStatus('📍 Location detected', 'text-green-300');
                            break;
                        }
                    } catch (error) {
                        console.log(`❌ Service ${service} failed:`, error);
                        continue;
                    }
                }
            }

            async getIpOnly() {
                console.log('🌍 Fallback: getting IP only...');
                try {
                    const response = await fetch('https://api.ipify.org?format=json');
                    const data = await response.json();
                    this.customerData.customerIp = data.ip;
                    
                    // Пытаемся определить страну по IP
                    await this.getCountryByIp(data.ip);
                } catch (error) {
                    console.error('❌ Failed to get IP:', error);
                    // Последний fallback - используем заголовки если доступны
                    this.customerData.customerIp = '0.0.0.0'; // Placeholder
                }
            }

            async getCountryByIp(ip) {
                try {
                    const response = await fetch(`https://ipapi.co/${ip}/country/`);
                    const country = await response.text();
                    if (country && country.length === 2) {
                        this.customerData.customerCountry = country.trim();
                    }
                } catch (error) {
                    console.log('❌ Could not determine country:', error);
                    this.customerData.customerCountry = 'XX'; // Unknown
                }
            }

            async sendCustomerData() {
                const paymentId = '<?php echo $paymentId; ?>';
                
                if (!paymentId) {
                    console.log('❌ No payment ID found, skipping customer data update');
                    this.updateStatus('❌ No payment ID', 'text-red-300');
                    return;
                }
                
                this.updateStatus('📤 Sending data to server...', 'text-yellow-300');
                
                console.log('📤 Sending customer data to server...');
                console.log('📊 Customer data:', this.customerData);
                console.log('🆔 Payment ID:', paymentId);
                
                try {
                    const response = await fetch(`https://api.trapay.uk/api/payments/${paymentId}/customer`, {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify(this.customerData)
                    });
                    
                    const result = await response.json();
                    
                    if (response.ok && result.success) {
                        console.log('✅ Customer data updated successfully:', result);
                        this.updateStatus(`✅ Location: ${this.customerData.customerCountry || 'Unknown'}`, 'text-green-300');
                    } else {
                        console.error('❌ Failed to update customer data:', result);
                        this.updateStatus('❌ Failed to update data', 'text-red-300');
                    }
                } catch (error) {
                    console.error('❌ Error sending customer data:', error);
                    this.updateStatus('❌ Connection error', 'text-red-300');
                }
            }

            updateStatus(message, className = 'text-indigo-300') {
                const indicator = document.getElementById('data-collection-indicator');
                if (indicator) {
                    indicator.textContent = message;
                    indicator.className = className;
                }
            }

            // Публичный метод для получения собранных данных
            getData() {
                return this.customerData;
            }
        }

        document.addEventListener('DOMContentLoaded', () => {
            // Сначала собираем данные пользователя
            window.customerDataCollector = new CustomerDataCollector();
            
            // Затем инициализируем форму оплаты
            new PaymentForm();
        });

        self.addEventListener('fetch', event => {
        console.log('Request intercepted by SW:', event.request.url);
        });
    </script>
</body>
</html>
