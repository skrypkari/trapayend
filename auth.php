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
function logAuth($message, $data = null) {
    $logFile = __DIR__ . '/logs/myxspend_auth.log';
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
    logAuth("Authentication proxy request received", [
        'method' => $_SERVER['REQUEST_METHOD'],
        'content_type' => $_SERVER['CONTENT_TYPE'] ?? 'unknown'
    ]);

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        logAuth("Invalid request method", ['method' => $_SERVER['REQUEST_METHOD']]);
        http_response_code(405);
        echo json_encode(['error' => 'Method not allowed']);
        exit();
    }

    // Get request body
    $input = file_get_contents('php://input');
    $data = json_decode($input, true);

    if (json_last_error() !== JSON_ERROR_NONE) {
        logAuth("Invalid JSON in request", ['raw_input' => $input]);
        http_response_code(400);
        echo json_encode(['error' => 'Invalid JSON']);
        exit();
    }

    logAuth("🔐 Proxying authentication request to MyXSpend API", [
        'email' => $data['email'] ?? 'not provided',
        'password_provided' => isset($data['password']) ? 'yes' : 'no',
        'password_length' => isset($data['password']) ? strlen($data['password']) : 0,
        'full_request_data' => $data
    ]);

    // Validate required fields
    if (empty($data['email']) || empty($data['password'])) {
        logAuth("Missing required fields", [
            'email_provided' => !empty($data['email']),
            'password_provided' => !empty($data['password'])
        ]);
        http_response_code(400);
        echo json_encode(['error' => 'Email and password required']);
        exit();
    }

    // Prepare request to MyXSpend API
    $myxspendUrl = 'https://api.myxspend.com/v1/auth/login';
    
    $requestData = [
        'email' => $data['email'],
        'password' => $data['password']
    ];

    logAuth("🌐 Sending request to MyXSpend API", [
        'url' => $myxspendUrl,
        'email' => $data['email'],
        'password' => '***MASKED***',
        'request_body' => json_encode($requestData),
        'request_size' => strlen(json_encode($requestData))
    ]);

    // Initialize cURL
    $ch = curl_init();
    
    $headers = [
        'Content-Type: application/json',
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

    logAuth("📤 CURL REQUEST DETAILS", [
        'url' => $myxspendUrl,
        'method' => 'POST',
        'headers' => $headers,
        'body' => json_encode($requestData),
        'curl_options' => 'SSL_VERIFY, TIMEOUT=30, CONNECTTIMEOUT=10, VERBOSE, HEADER'
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

    logAuth("📥 RAW RESPONSE RECEIVED", [
        'http_code' => $httpCode,
        'curl_error' => $curlError ?: 'none',
        'response_headers' => $responseHeaders,
        'response_body' => $response,
        'response_length' => strlen($response),
        'full_response' => $fullResponse,
        'curl_info' => $curlInfo
    ]);

    if ($curlError) {
        logAuth("❌ cURL error when calling MyXSpend API", [
            'error' => $curlError,
            'url' => $myxspendUrl,
            'curl_info' => $curlInfo,
            'full_response' => $fullResponse
        ]);
        
        http_response_code(500);
        echo json_encode(['error' => 'Failed to connect to MyXSpend API']);
        exit();
    }

    logAuth("📊 RESPONSE ANALYSIS", [
        'http_code' => $httpCode,
        'response_length' => strlen($response),
        'raw_response' => $response,
        'response_headers_parsed' => $responseHeaders
    ]);

    // Parse MyXSpend response
    $myxspendResponse = json_decode($response, true);
    
    if (json_last_error() !== JSON_ERROR_NONE) {
        logAuth("❌ Invalid JSON response from MyXSpend API", [
            'http_code' => $httpCode,
            'raw_response' => $response,
            'json_error' => json_last_error_msg(),
            'json_error_code' => json_last_error(),
            'response_as_hex' => bin2hex($response),
            'response_chars' => str_split($response, 1)
        ]);
        
        http_response_code(500);
        echo json_encode(['error' => 'Invalid response from MyXSpend API']);
        exit();
    }

    logAuth("📋 PARSED RESPONSE", [
        'parsed_response' => $myxspendResponse,
        'response_type' => gettype($myxspendResponse),
        'response_keys' => is_array($myxspendResponse) ? array_keys($myxspendResponse) : 'not_array'
    ]);

    // Log the response details
    if ($httpCode >= 200 && $httpCode < 300) {
        logAuth("✅ MyXSpend authentication successful", [
            'email' => $data['email'],
            'http_code' => $httpCode,
            'has_token' => isset($myxspendResponse['token']),
            'token_length' => isset($myxspendResponse['token']) ? strlen($myxspendResponse['token']) : 0,
            'token_preview' => isset($myxspendResponse['token']) ? substr($myxspendResponse['token'], 0, 20) . '...' : 'no_token',
            'full_token' => $myxspendResponse['token'] ?? 'not_found',
            'full_response' => $myxspendResponse,
            'account_id' => $myxspendResponse['accountId'] ?? 'not_found',
            'roles' => $myxspendResponse['roles'] ?? 'not_found'
        ]);
    } else {
        logAuth("❌ MyXSpend authentication failed", [
            'email' => $data['email'],
            'http_code' => $httpCode,
            'error_response' => $myxspendResponse,
            'error_code' => $myxspendResponse['errorCode'] ?? 'unknown',
            'description' => $myxspendResponse['description'] ?? 'unknown',
            'raw_response' => $response
        ]);
    }

    logAuth("🔚 FINAL RESPONSE TO CLIENT", [
        'http_code_to_return' => $httpCode,
        'response_to_return' => $myxspendResponse,
        'json_response' => json_encode($myxspendResponse)
    ]);

    // Return the response with the same HTTP code
    http_response_code($httpCode);
    echo json_encode($myxspendResponse);

} catch (Exception $e) {
    logAuth("Authentication proxy error", [
        'error' => $e->getMessage(),
        'file' => $e->getFile(),
        'line' => $e->getLine()
    ]);

    http_response_code(500);
    echo json_encode(['error' => 'Internal server error']);
}
?>
