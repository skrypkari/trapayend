<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, User-Agent');

// Handle preflight requests
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// Logging function
function logMyXSpend($message, $data = null) {
    $logFile = __DIR__ . '/logs/myxspend_unified.log';
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
    logMyXSpend("🚀 MyXSpend unified payment request received", [
        'method' => $_SERVER['REQUEST_METHOD'],
        'content_type' => $_SERVER['CONTENT_TYPE'] ?? 'unknown'
    ]);

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        logMyXSpend("❌ Invalid request method", ['method' => $_SERVER['REQUEST_METHOD']]);
        http_response_code(405);
        echo json_encode(['error' => 'Method not allowed']);
        exit();
    }

    // Get request data
    $post_data = json_decode(file_get_contents('php://input'), true);

    if (json_last_error() !== JSON_ERROR_NONE) {
        $rawInput = file_get_contents('php://input');
        logMyXSpend("❌ Invalid JSON in request", [
            'raw_input' => $rawInput,
            'json_error' => json_last_error_msg()
        ]);
        http_response_code(400);
        echo json_encode(['error' => 'Invalid JSON']);
        exit();
    }

    logMyXSpend("📥 Request data received", [
        'firstName' => $post_data['firstName'] ?? 'not provided',
        'lastName' => $post_data['lastName'] ?? 'not provided',
        'email' => $post_data['email'] ?? 'not provided',
        'amount' => $post_data['amount'] ?? 'not provided',
        'currency' => $post_data['currency'] ?? 'not provided',
        'customerOrderId' => $post_data['customerOrderId'] ?? 'not provided',
        'success_url' => $post_data['success_url'] ?? 'not provided',
        'failure_url' => $post_data['failure_url'] ?? 'not provided',
        'full_request' => $post_data
    ]);

    // MyXSpend credentials
    define("API_KEY", "EODO9BsIPsW4w3QTjkxN8uwCg9uDqb1pJ8XvxY1TjUhvQZYhCT");
    define("EMAIL", "vsichkar2002@gmail.com");
    define("PASSWORD", "Sich2002!");

    // Extract request data
    $firstName = $post_data['firstName'];
    $lastName = $post_data['lastName'];
    $email = $post_data['email'];
    $amount = $post_data['amount'];
    $currency = $post_data['currency'];
    $customerOrderId = $post_data['customerOrderId'] ?? time();
    $successUrl = $post_data['success_url'] ?? '';
    $failureUrl = $post_data['failure_url'] ?? '';

    // Validate required fields
    $requiredFields = ['firstName', 'lastName', 'email', 'amount', 'currency'];
    $missingFields = [];
    
    foreach ($requiredFields as $field) {
        if (empty($post_data[$field])) {
            $missingFields[] = $field;
        }
    }

    if (!empty($missingFields)) {
        logMyXSpend("❌ Missing required fields", ['missing_fields' => $missingFields]);
        http_response_code(400);
        echo json_encode(['error' => 'Missing required fields: ' . implode(', ', $missingFields)]);
        exit();
    }

    // Step 1: Login to MyXSpend
    logMyXSpend("🔐 STEP 1: Authenticating with MyXSpend API");
    $loginResponse = login();
    
    if (!$loginResponse) {
        logMyXSpend("❌ Login failed");
        http_response_code(401);
        echo json_encode(['error' => 'Authentication failed']);
        exit();
    }

    logMyXSpend("✅ Login successful", [
        'has_token' => !empty($loginResponse['token']),
        'token_length' => strlen($loginResponse['token'] ?? ''),
        'token_preview' => substr($loginResponse['token'] ?? '', 0, 20) . '...',
        'company_id' => $loginResponse['companyId'] ?? 'not_found',
        'api_key' => $loginResponse['apiKey'] ?? 'not_found'
    ]);

    // Step 2: Process payment
    logMyXSpend("💳 STEP 2: Processing payment with MyXSpend API");
    $paymentResult = processPayment($firstName, $lastName, $email, $amount, $currency, $customerOrderId, $successUrl, $failureUrl, $loginResponse);

    if (!$paymentResult) {
        logMyXSpend("❌ Payment processing failed");
        http_response_code(400);
        echo json_encode(['error' => 'Payment processing failed']);
        exit();
    }

    logMyXSpend("✅ Payment processing successful", [
        'payment_result' => $paymentResult,
        'has_payment_link' => !empty($paymentResult['PaymentLink']),
        'has_payment_code' => !empty($paymentResult['PaymentLinkCode'])
    ]);

    // Return the response in the format expected by our system
    $response = [
        'gateway_payment_id' => $paymentResult['PaymentLinkCode'] ?? $customerOrderId,
        'payment_url' => $paymentResult['PaymentLink'] ?? '',
        'paymentLinkCode' => $paymentResult['PaymentLinkCode'] ?? '',
        'PaymentLink' => $paymentResult['PaymentLink'] ?? '',
        'PaymentLinkCode' => $paymentResult['PaymentLinkCode'] ?? '',
        'responseCode' => $paymentResult['responseCode'] ?? '200',
        'responseMessage' => $paymentResult['responseMessage'] ?? 'Success'
    ];

    logMyXSpend("🔚 FINAL RESPONSE TO CLIENT", [
        'response' => $response,
        'json_response' => json_encode($response)
    ]);

    http_response_code(200);
    echo json_encode($response);

} catch (Exception $e) {
    logMyXSpend("💥 EXCEPTION OCCURRED", [
        'error' => $e->getMessage(),
        'file' => $e->getFile(),
        'line' => $e->getLine(),
        'trace' => $e->getTraceAsString()
    ]);

    http_response_code(500);
    echo json_encode(['error' => 'Internal server error: ' . $e->getMessage()]);
}

// Login function
function login() {
    $url = "https://api.myxspend.com/v1/auth/login";

    $data = array(
        "email" => EMAIL,
        "password" => PASSWORD,
    );
    
    logMyXSpend("🌐 Sending login request to MyXSpend", [
        'url' => $url,
        'email' => EMAIL,
        'password' => '***MASKED***',
        'request_body' => json_encode($data)
    ]);
    
    $curl = curl_init($url);
    $headers = [
        "Accept: */*",
        "Content-Type: application/json",
        "User-Agent: TrapayAPI/1.0"
    ];

    $returnHeaders = [];

    curl_setopt($curl, CURLOPT_POST, true);
    curl_setopt($curl, CURLOPT_HTTPHEADER, $headers);
    curl_setopt($curl, CURLOPT_POSTFIELDS, json_encode($data));
    curl_setopt($curl, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($curl, CURLOPT_TIMEOUT, 30);
    curl_setopt($curl, CURLOPT_CONNECTTIMEOUT, 10);
    curl_setopt($curl, CURLOPT_SSL_VERIFYPEER, true);
    curl_setopt($curl, CURLOPT_SSL_VERIFYHOST, 2);
    curl_setopt($curl, CURLOPT_HEADERFUNCTION,
        function($curl, $header) use (&$returnHeaders){
            $len = strlen($header);
            $header = explode(':', $header, 2);
            if (count($header) < 2)
                return $len;

            $returnHeaders[strtolower(trim($header[0]))][] = trim($header[1]);
            
            return $len;
        }
    );
    
    logMyXSpend("📤 LOGIN REQUEST DETAILS", [
        'url' => $url,
        'method' => 'POST',
        'headers' => $headers,
        'body' => json_encode($data)
    ]);
    
    $response = curl_exec($curl);
    $httpCode = curl_getinfo($curl, CURLINFO_HTTP_CODE);
    $curlError = curl_error($curl);
    $curlInfo = curl_getinfo($curl);
    
    curl_close($curl);

    logMyXSpend("📥 LOGIN RESPONSE RECEIVED", [
        'http_code' => $httpCode,
        'curl_error' => $curlError ?: 'none',
        'response' => $response,
        'response_length' => strlen($response),
        'return_headers' => $returnHeaders,
        'curl_info' => $curlInfo
    ]);
    
    if ($curlError) {
        logMyXSpend("❌ cURL Error in login", ['error' => $curlError]);
        return false;
    }

    if ($httpCode !== 200) {
        logMyXSpend("❌ Login failed with HTTP code", [
            'http_code' => $httpCode,
            'response' => $response
        ]);
        return false;
    }
    
    $decodedResponse = json_decode($response, true);
    
    if (!$decodedResponse || !isset($decodedResponse['token'])) {
        logMyXSpend("❌ Invalid login response", [
            'response' => $response,
            'decoded' => $decodedResponse,
            'json_error' => json_last_error_msg()
        ]);
        return false;
    }

    $result = [
        "token" => $decodedResponse['token'],
        "companyId" => $returnHeaders['x-company-id'][0] ?? API_KEY,
        "apiKey" => $returnHeaders['x-api-key'][0] ?? API_KEY
    ];

    logMyXSpend("✅ Login successful", [
        'token_length' => strlen($result['token']),
        'token_preview' => substr($result['token'], 0, 20) . '...',
        'full_token' => $result['token'],
        'company_id' => $result['companyId'],
        'api_key' => $result['apiKey'],
        'headers_received' => $returnHeaders
    ]);

    return $result;
}

// Process payment function
function processPayment($firstName, $lastName, $email, $amount, $currency, $customerOrderId, $successUrl, $failureUrl, $tokenResponse) {
    $url = "https://api.myxspend.com/v1/payment/process";

    $token = $tokenResponse['token'];
    $companyId = $tokenResponse['companyId'];
    $apiKey = $tokenResponse['apiKey'];
    
    $data = array(
        "firstName" => $firstName,
        "lastName" => $lastName,
        "customerOrderId" => $customerOrderId,
        "email" => $email,
        "amount" => floatval($amount),
        "currency" => strtoupper($currency),
        "success_url" => $successUrl,
        "failure_url" => $failureUrl
    );
    
    logMyXSpend("🌐 Sending payment request to MyXSpend", [
        'url' => $url,
        'customer_order_id' => $customerOrderId,
        'amount' => $amount,
        'currency' => $currency,
        'request_body' => json_encode($data),
        'token_to_use' => $token,
        'company_id_to_use' => $companyId,
        'api_key_to_use' => $apiKey
    ]);
    
    $headers = [
        "Authorization: Bearer $token",
        "X-API-KEY: $apiKey",
        "X-COMPANY-ID: $companyId",
        "Accept: */*",
        "Content-Type: application/json",
        "User-Agent: TrapayAPI/1.0"
    ];
    
    $curl = curl_init($url);
    
    curl_setopt($curl, CURLOPT_HTTPHEADER, $headers);
    curl_setopt($curl, CURLOPT_POST, true);
    curl_setopt($curl, CURLOPT_POSTFIELDS, json_encode($data));
    curl_setopt($curl, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($curl, CURLOPT_TIMEOUT, 30);
    curl_setopt($curl, CURLOPT_CONNECTTIMEOUT, 10);
    curl_setopt($curl, CURLOPT_SSL_VERIFYPEER, true);
    curl_setopt($curl, CURLOPT_SSL_VERIFYHOST, 2);
    
    logMyXSpend("📤 PAYMENT REQUEST DETAILS", [
        'url' => $url,
        'method' => 'POST',
        'headers' => $headers,
        'body' => json_encode($data)
    ]);
    
    $response = curl_exec($curl);
    $httpCode = curl_getinfo($curl, CURLINFO_HTTP_CODE);
    $curlError = curl_error($curl);
    $curlInfo = curl_getinfo($curl);
    
    curl_close($curl);

    logMyXSpend("📥 PAYMENT RESPONSE RECEIVED", [
        'http_code' => $httpCode,
        'curl_error' => $curlError ?: 'none',
        'response' => $response,
        'response_length' => strlen($response),
        'curl_info' => $curlInfo
    ]);
    
    if ($curlError) {
        logMyXSpend("❌ cURL Error in payment", ['error' => $curlError]);
        return false;
    }

    if ($httpCode < 200 || $httpCode >= 300) {
        logMyXSpend("❌ Payment failed with HTTP code", [
            'http_code' => $httpCode,
            'response' => $response
        ]);
        return false;
    }
    
    $decodedResponse = json_decode($response, true);
    
    if (!$decodedResponse) {
        logMyXSpend("❌ Invalid payment response", [
            'response' => $response,
            'json_error' => json_last_error_msg()
        ]);
        return false;
    }

    logMyXSpend("✅ Payment response parsed", [
        'decoded_response' => $decodedResponse,
        'has_payment_link' => isset($decodedResponse['PaymentLink']),
        'payment_link' => $decodedResponse['PaymentLink'] ?? 'not_found',
        'payment_code' => $decodedResponse['PaymentLinkCode'] ?? 'not_found'
    ]);

    return $decodedResponse;
}
?>
