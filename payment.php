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

    logPayment("Proxying payment creation request to MyXSpend API", [
        'customerOrderId' => $data['customerOrderId'] ?? 'not provided',
        'amount' => $data['amount'] ?? 'not provided',
        'currency' => $data['currency'] ?? 'not provided',
        'email' => $data['email'] ?? 'not provided',
        'firstName' => $data['firstName'] ?? 'not provided',
        'lastName' => $data['lastName'] ?? 'not provided'
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

    // Get headers (for logging, but we will use traffer.uk for actual API calls)
    $authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    $apiKey = $_SERVER['HTTP_X_API_KEY'] ?? getenv('MYXSPEND_API_KEY') ?? 'EODO9BsIPsW4w3QTjkxN8uwCg9uDqb1pJ8XvxY1TjUhvQZYhCT';
    $companyId = $_SERVER['HTTP_X_COMPANY_ID'] ?? getenv('MYXSPEND_COMPANY_ID') ?? '82dcbd4a-a838-47f9-ae21-8dac9a8f1622';

    logPayment("� HEADERS RECEIVED (will proxy to traffer.uk)", [
        'auth_header_provided' => !empty($authHeader),
        'api_key' => $apiKey,
        'company_id' => $companyId,
        'note' => 'Will forward request to traffer.uk which will handle MyXSpend auth'
    ]);

    // Now proxy request to traffer.uk which will handle MyXSpend auth and payment
    $paymentUrl = 'https://traffer.uk/gateway/myxspend/payment.php';
    
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

    logPayment("🌐 PROXYING to traffer.uk for MyXSpend processing", [
        'payment_url' => $paymentUrl,
        'customerOrderId' => $data['customerOrderId'],
        'amount' => $requestData['amount'],
        'currency' => $requestData['currency'],
        'request_data' => $requestData,
        'note' => 'traffer.uk will handle MyXSpend auth internally'
    ]);

    // Initialize cURL for payment
    $ch = curl_init();
    
    $paymentHeaders = [
        'Content-Type: application/json',
        'Authorization: Bearer dummy-token', // traffer.uk will ignore this and auth directly
        'X-API-KEY: ' . $apiKey,
        'X-COMPANY-ID: ' . $companyId,
        'User-Agent: TrapayAPI/1.0'
    ];
    
    curl_setopt_array($ch, [
        CURLOPT_URL => $paymentUrl,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => json_encode($requestData),
        CURLOPT_HTTPHEADER => $paymentHeaders,
        CURLOPT_TIMEOUT => 30,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_SSL_VERIFYHOST => 2,
        CURLOPT_VERBOSE => true,
        CURLOPT_HEADER => true,
        CURLOPT_NOBODY => false
    ]);

    logPayment("📤 PAYMENT PROXY REQUEST DETAILS", [
        'url' => $paymentUrl,
        'method' => 'POST',
        'headers' => $paymentHeaders,
        'body' => json_encode($requestData),
        'body_size' => strlen(json_encode($requestData)),
        'curl_options' => 'RETURNTRANSFER, POST, SSL_VERIFY, TIMEOUT=30, CONNECTTIMEOUT=10'
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

    logPayment("📥 PAYMENT PROXY RESPONSE RECEIVED", [
        'http_code' => $httpCode,
        'curl_error' => $curlError ?: 'none',
        'response_headers' => $responseHeaders,
        'response_body' => $response,
        'response_length' => strlen($response),
        'full_response' => $fullResponse,
        'curl_info' => $curlInfo
    ]);

    if ($curlError) {
        logPayment("❌ cURL error when calling traffer.uk proxy", [
            'error' => $curlError,
            'url' => $paymentUrl,
            'customerOrderId' => $data['customerOrderId'],
            'curl_info' => $curlInfo,
            'full_response' => $fullResponse
        ]);
        
        http_response_code(500);
        echo json_encode(['error' => 'Failed to connect to payment proxy']);
        exit();
    }

    logPayment("📊 PROXY RESPONSE ANALYSIS", [
        'http_code' => $httpCode,
        'response_length' => strlen($response),
        'customerOrderId' => $data['customerOrderId'],
        'raw_response' => $response,
        'response_headers_parsed' => $responseHeaders
    ]);

    // Parse response
    $paymentResponse = json_decode($response, true);
    
    if (json_last_error() !== JSON_ERROR_NONE) {
        logPayment("❌ Invalid JSON response from payment proxy", [
            'http_code' => $httpCode,
            'raw_response' => $response,
            'json_error' => json_last_error_msg(),
            'json_error_code' => json_last_error(),
            'customerOrderId' => $data['customerOrderId'],
            'response_as_hex' => bin2hex($response),
            'response_chars' => str_split($response, 1)
        ]);
        
        http_response_code(500);
        echo json_encode(['error' => 'Invalid response from payment proxy']);
        exit();
    }

    logPayment("📋 PARSED PROXY RESPONSE", [
        'parsed_response' => $paymentResponse,
        'response_type' => gettype($paymentResponse),
        'response_keys' => is_array($paymentResponse) ? array_keys($paymentResponse) : 'not_array'
    ]);

    // Log the response details
    if ($httpCode >= 200 && $httpCode < 300) {
        logPayment("✅ Payment creation successful", [
            'customerOrderId' => $data['customerOrderId'],
            'http_code' => $httpCode,
            'has_payment_link' => isset($paymentResponse['PaymentLink']),
            'has_payment_code' => isset($paymentResponse['PaymentLinkCode']),
            'response_code' => $paymentResponse['responseCode'] ?? 'unknown',
            'full_response' => $paymentResponse,
            'payment_link' => $paymentResponse['PaymentLink'] ?? 'not_found',
            'payment_code' => $paymentResponse['PaymentLinkCode'] ?? 'not_found'
        ]);
    } else {
        logPayment("❌ Payment creation failed", [
            'customerOrderId' => $data['customerOrderId'],
            'http_code' => $httpCode,
            'response_code' => $paymentResponse['responseCode'] ?? 'unknown',
            'response_message' => $paymentResponse['responseMessage'] ?? 'unknown',
            'error_response' => $paymentResponse,
            'full_raw_response' => $response,
            'error_code' => $paymentResponse['errorCode'] ?? 'unknown',
            'description' => $paymentResponse['description'] ?? 'unknown'
        ]);
    }

    logPayment("🔚 FINAL RESPONSE TO CLIENT", [
        'http_code_to_return' => $httpCode,
        'response_to_return' => $paymentResponse,
        'json_response' => json_encode($paymentResponse)
    ]);

    // Return the response with the same HTTP code
    http_response_code($httpCode);
    echo json_encode($paymentResponse);

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
