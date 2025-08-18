<?php

$logFile = __DIR__ . '/decrypt.log';
function logMessage($message) {
    file_put_contents($GLOBALS['logFile'], "[" . date('Y-m-d H:i:s') . "] " . $message . PHP_EOL, FILE_APPEND);
}

$privateKeyPath = __DIR__ . '/private.pem';

$data = json_decode(file_get_contents('php://input'), true);
logMessage("Raw input: " . json_encode($data));

if (!isset($data['info']) || !isset($data['key'])) {
    http_response_code(400);
    logMessage("Missing 'info' or 'key'");
    echo 'Missing info or key';
    exit;
}

$encryptedInfo = $data['info'];
$encryptedKey = $data['key'];

$privateKey = file_get_contents($privateKeyPath);
if (!$privateKey) {
    http_response_code(500);
    logMessage("Private key not found at $privateKeyPath");
    echo 'Private key not found';
    exit;
}

$decryptedKeyJson = '';
if (!openssl_private_decrypt(base64_decode($encryptedKey), $decryptedKeyJson, $privateKey, OPENSSL_PKCS1_PADDING)) {
    http_response_code(500);
    logMessage("Failed to decrypt AES key");
    echo 'Failed to decrypt AES key';
    exit;
}
logMessage("Decrypted AES key JSON: " . $decryptedKeyJson);

$keyData = json_decode($decryptedKeyJson, true);
if (!$keyData || !isset($keyData['key']) || !isset($keyData['iv'])) {
    http_response_code(500);
    logMessage("Invalid key structure: " . $decryptedKeyJson);
    echo 'Invalid key structure';
    exit;
}

$aesKey = base64_decode($keyData['key']);
$aesIv = base64_decode($keyData['iv']);

$decrypted = openssl_decrypt(
    base64_decode($encryptedInfo),
    'aes-256-ctr',
    $aesKey,
    OPENSSL_RAW_DATA,
    $aesIv
);

if ($decrypted === false) {
    http_response_code(500);
    logMessage("Failed to decrypt info");
    echo 'Failed to decrypt info';
    exit;
}

logMessage("Decrypted info: " . $decrypted);

header('Content-Type: text/plain');
echo $decrypted;
