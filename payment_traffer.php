<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-API-KEY, X-COMPANY-ID, User-Agent');

// Handle preflight requests
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// Logging function
function logPayment($message, $data = null) {
    $logFile = __DIR__ . '/logs/myxspend_payment.log';
    $logDir = dirname($logFile);
    
    if (!is_dir($logDir)) {
        mkdir($logDir, 0755, true);
    }
    
    $timestamp = date('Y-m-d H:i:s');
    $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    $userAgent = $_SERVER['HTTP_USER_AGENT'] ?? 'unknown';
    
    $logEntry = "[{$timestamp}] [{$ip}] [{$userAgent}] {$message}";
    
    if ($data !== null) {
        $logEntry .= " | Data: " . json_encode($data);
    }
    
    $logEntry .= PHP_EOL;
    
    file_put_contents($logFile, $logEntry, FILE_APPEND | LOCK_EX);
}

try {
    logPayment("Payment creation proxy request received", [
        'method' => $_SERVER['REQUEST_METHOD'],
        'content_type' => $_SERVER['CONTENT_TYPE'] ?? 'unknown',
        'has_auth' => isset($_SERVER['HTTP_AUTHORIZATION']),
        'has_api_key' => isset($_SERVER['HTTP_X_API_KEY']),
        'has_company_id' => isset($_SERVER['HTTP_X_COMPANY_ID'])
    ]);

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        logPayment("Invalid request method", ['method' => $_SERVER['REQUEST_METHOD']]);
        http_response_code(405);
        echo json_encode(['error' => 'Method not allowed']);
        exit();
    }

    // Get request body
    $input = file_get_contents('php://input');
    $data = json_decode($input, true);

    if (json_last_error() !== JSON_ERROR_NONE) {
        logPayment("Invalid JSON in request", ['raw_input' => $input]);
        http_response_code(400);
        echo json_encode(['error' => 'Invalid JSON']);
        exit();
    }

    logPayment("🔐 Proxying payment creation request to MyXSpend API", [
        'customerOrderId' => $data['customerOrderId'] ?? 'not provided',
        'amount' => $data['amount'] ?? 'not provided',
        'currency' => $data['currency'] ?? 'not provided',
        'email' => $data['email'] ?? 'not provided',
        'firstName' => $data['firstName'] ?? 'not provided',
        'lastName' => $data['lastName'] ?? 'not provided',
        'full_request_data' => $data
    ]);

    // Validate required fields
    $requiredFields = ['firstName', 'lastName', 'customerOrderId', 'email', 'amount', 'currency', 'success_url', 'failure_url'];
    $missingFields = [];
    
    foreach ($requiredFields as $field) {
        if (empty($data[$field])) {
            $missingFields[] = $field;
        }
    }

    if (!empty($missingFields)) {
        logPayment("Missing required fields", ['missing_fields' => $missingFields]);
        http_response_code(400);
        echo json_encode(['error' => 'Missing required fields: ' . implode(', ', $missingFields)]);
        exit();
    }

    // Get headers - но НЕ используем переданный токен, а получаем новый из MyXSpend
    $authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    $apiKey = $_SERVER['HTTP_X_API_KEY'] ?? '';
    $companyId = $_SERVER['HTTP_X_COMPANY_ID'] ?? '';

    logPayment("🔑 AUTHENTICATION HEADERS RECEIVED (will be ignored for direct MyXSpend auth)", [
        'received_auth_header' => $authHeader,
        'received_api_key' => $apiKey,
        'received_company_id' => $companyId,
        'note' => 'We will authenticate directly with MyXSpend instead of using passed token'
    ]);

    // STEP 1: Authenticate directly with MyXSpend API
    $myxspendAuthUrl = 'https://api.myxspend.com/v1/auth/login';
    $authData = [
        'email' => 'vsichkar2002@gmail.com',
        'password' => 'Sich2002!'
    ];

    logPayment("🔐 STEP 1: Authenticating directly with MyXSpend API", [
        'auth_url' => $myxspendAuthUrl,
        'email' => $authData['email'],
        'password' => '***MASKED***'
    ]);

    // Get auth token from MyXSpend
    $authCh = curl_init();
    $authHeaders = [
        'Content-Type: application/json',
        'User-Agent: TrapayAPI/1.0'
    ];
    
    curl_setopt_array($authCh, [
        CURLOPT_URL => $myxspendAuthUrl,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => json_encode($authData),
        CURLOPT_HTTPHEADER => $authHeaders,
        CURLOPT_TIMEOUT => 30,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_VERBOSE => true,
        CURLOPT_HEADER => true,
        CURLOPT_NOBODY => false
    ]);

    $authFullResponse = curl_exec($authCh);
    $authHttpCode = curl_getinfo($authCh, CURLINFO_HTTP_CODE);
    $authError = curl_error($authCh);
    $authInfo = curl_getinfo($authCh);
    
    // Extract headers and body from full response
    $authHeaderSize = curl_getinfo($authCh, CURLINFO_HEADER_SIZE);
    $authResponseHeaders = substr($authFullResponse, 0, $authHeaderSize);
    $authResponse = substr($authFullResponse, $authHeaderSize);
    
    curl_close($authCh);

    logPayment("📥 MyXSpend AUTH RESPONSE", [
        'http_code' => $authHttpCode,
        'curl_error' => $authError ?: 'none',
        'response_headers' => $authResponseHeaders,
        'response_body' => $authResponse,
        'response_length' => strlen($authResponse),
        'full_response' => $authFullResponse
    ]);

    if ($authError || $authHttpCode !== 200) {
        logPayment("❌ MyXSpend authentication failed", [
            'http_code' => $authHttpCode,
            'error' => $authError,
            'response' => $authResponse
        ]);
        http_response_code(401);
        echo json_encode(['error' => 'MyXSpend authentication failed']);
        exit();
    }

    $authResult = json_decode($authResponse, true);
    if (!$authResult || !isset($authResult['token'])) {
        logPayment("❌ Invalid MyXSpend auth response", [
            'response' => $authResponse,
            'json_error' => json_last_error_msg(),
            'parsed_result' => $authResult
        ]);
        http_response_code(401);
        echo json_encode(['error' => 'Invalid MyXSpend authentication response']);
        exit();
    }

    $myxspendToken = $authResult['token'];
    logPayment("✅ MyXSpend authentication successful", [
        'has_token' => !empty($myxspendToken),
        'token_length' => strlen($myxspendToken),
        'token_preview' => substr($myxspendToken, 0, 20) . '...',
        'full_token' => $myxspendToken,
        'auth_result' => $authResult
    ]);

    // STEP 2: Create payment with MyXSpend token
    $myxspendUrl = 'https://api.myxspend.com/v1/payment/process';
    
    $requestData = [
        'firstName' => $data['firstName'],
        'lastName' => $data['lastName'],
        'customerOrderId' => $data['customerOrderId'],
        'email' => $data['email'],
        'phone' => $data['phone'] ?? '',
        'amount' => floatval($data['amount']),
        'currency' => strtoupper($data['currency']),
        'success_url' => $data['success_url'],
        'failure_url' => $data['failure_url']
    ];

    logPayment("🔐 STEP 2: Creating payment with MyXSpend token", [
        'url' => $myxspendUrl,
        'customerOrderId' => $data['customerOrderId'],
        'amount' => $requestData['amount'],
        'currency' => $requestData['currency'],
        'request_body' => json_encode($requestData),
        'request_size' => strlen(json_encode($requestData)),
        'myxspend_token_to_use' => $myxspendToken,
        'api_key_to_use' => $apiKey,
        'company_id_to_use' => $companyId
    ]);

    // Initialize cURL
    $ch = curl_init();
    
    $headers = [
        'Content-Type: application/json',
        'Authorization: Bearer ' . $myxspendToken, // Use MyXSpend token, not our token
        'X-API-KEY: ' . $apiKey,
        'X-COMPANY-ID: ' . $companyId,
        'User-Agent: TrapayAPI/1.0'
    ];
    
    curl_setopt_array($ch, [
        CURLOPT_URL => $myxspendUrl,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => json_encode($requestData),
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_TIMEOUT => 30,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_SSL_VERIFYHOST => 2,
        CURLOPT_VERBOSE => true,
        CURLOPT_HEADER => true,
        CURLOPT_NOBODY => false
    ]);

    logPayment("📤 PAYMENT CURL REQUEST DETAILS", [
        'url' => $myxspendUrl,
        'method' => 'POST',
        'headers' => $headers,
        'body' => json_encode($requestData),
        'curl_options' => 'SSL_VERIFY, TIMEOUT=30, CONNECTTIMEOUT=10, VERBOSE, HEADER',
        'note' => 'Using real MyXSpend token now'
    ]);

    $fullResponse = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlError = curl_error($ch);
    $curlInfo = curl_getinfo($ch);
    
    // Extract headers and body from full response
    $headerSize = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
    $responseHeaders = substr($fullResponse, 0, $headerSize);
    $response = substr($fullResponse, $headerSize);
    
    curl_close($ch);

    logPayment("📥 RAW RESPONSE RECEIVED", [
        'http_code' => $httpCode,
        'curl_error' => $curlError ?: 'none',
        'response_headers' => $responseHeaders,
        'response_body' => $response,
        'response_length' => strlen($response),
        'full_response' => $fullResponse,
        'curl_info' => $curlInfo,
        'customerOrderId' => $data['customerOrderId']
    ]);

    if ($curlError) {
        logPayment("❌ cURL error when calling MyXSpend API", [
            'error' => $curlError,
            'url' => $myxspendUrl,
            'customerOrderId' => $data['customerOrderId'],
            'curl_info' => $curlInfo,
            'full_response' => $fullResponse
        ]);
        
        http_response_code(500);
        echo json_encode(['error' => 'Failed to connect to MyXSpend API']);
        exit();
    }

    logPayment("📊 RESPONSE ANALYSIS", [
        'http_code' => $httpCode,
        'response_length' => strlen($response),
        'customerOrderId' => $data['customerOrderId'],
        'raw_response' => $response,
        'response_headers_parsed' => $responseHeaders
    ]);

    // Parse MyXSpend response
    $myxspendResponse = json_decode($response, true);
    
    if (json_last_error() !== JSON_ERROR_NONE) {
        logPayment("❌ Invalid JSON response from MyXSpend API", [
            'http_code' => $httpCode,
            'raw_response' => $response,
            'json_error' => json_last_error_msg(),
            'json_error_code' => json_last_error(),
            'customerOrderId' => $data['customerOrderId'],
            'response_as_hex' => bin2hex($response),
            'response_chars' => str_split($response, 1)
        ]);
        
        http_response_code(500);
        echo json_encode(['error' => 'Invalid response from MyXSpend API']);
        exit();
    }

    logPayment("📋 PARSED RESPONSE", [
        'parsed_response' => $myxspendResponse,
        'response_type' => gettype($myxspendResponse),
        'response_keys' => is_array($myxspendResponse) ? array_keys($myxspendResponse) : 'not_array'
    ]);

    // Log the response details
    if ($httpCode >= 200 && $httpCode < 300) {
        logPayment("✅ MyXSpend payment creation successful", [
            'customerOrderId' => $data['customerOrderId'],
            'http_code' => $httpCode,
            'has_payment_link' => isset($myxspendResponse['PaymentLink']),
            'has_payment_code' => isset($myxspendResponse['PaymentLinkCode']),
            'response_code' => $myxspendResponse['responseCode'] ?? 'unknown',
            'full_response' => $myxspendResponse,
            'payment_link' => $myxspendResponse['PaymentLink'] ?? 'not_found',
            'payment_code' => $myxspendResponse['PaymentLinkCode'] ?? 'not_found'
        ]);
    } else {
        logPayment("❌ MyXSpend payment creation failed", [
            'customerOrderId' => $data['customerOrderId'],
            'http_code' => $httpCode,
            'response_code' => $myxspendResponse['responseCode'] ?? 'unknown',
            'response_message' => $myxspendResponse['responseMessage'] ?? 'unknown',
            'error_response' => $myxspendResponse,
            'full_raw_response' => $response,
            'error_code' => $myxspendResponse['errorCode'] ?? 'unknown',
            'description' => $myxspendResponse['description'] ?? 'unknown'
        ]);
    }

    logPayment("🔚 FINAL RESPONSE TO CLIENT", [
        'http_code_to_return' => $httpCode,
        'response_to_return' => $myxspendResponse,
        'json_response' => json_encode($myxspendResponse)
    ]);

    // Return the response with the same HTTP code
    http_response_code($httpCode);
    echo json_encode($myxspendResponse);

} catch (Exception $e) {
    logPayment("Payment creation proxy error", [
        'error' => $e->getMessage(),
        'file' => $e->getFile(),
        'line' => $e->getLine(),
        'customerOrderId' => $data['customerOrderId'] ?? 'unknown'
    ]);

    http_response_code(500);
    echo json_encode(['error' => 'Internal server error']);
}
?>
