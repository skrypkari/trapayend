<?php
error_reporting(E_ALL);
ini_set('display_errors', 1);

// --- Настройки ключей ---
$publicKey = file_get_contents(__DIR__ . '/psp_public.pem');
$privateKey = file_get_contents(__DIR__ . '/private.pem');

// --- Данные платежа ---
$data = [
    "amount" => 100,
    "currency" => "EUR",
    "order_id" => uniqid("order_"),
    "result_url" => "https://apitest.trapay.uk/api/webhooks/gateway/mastercard",
    "return_url" => "https://apptest.trapay.uk/payment/success",
    "card" => [
        "number" => "5557708012124891",
        "expire_month" => "03",
        "expire_year" => "30",
        "cvv" => "263"
    ],
    "card_holder" => [
        "first_name" => "Viacheslav",
        "last_name" => "Ponomarov",
        "country" => "616",
        "post_code" => "02-203",
        "city" => "Warsaw",
        "address_line_1" => "Kurhan 14A",
        "email" => "info@trapay.uk"
    ],
    "browser" => [
        "accept_header" => "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "color_depth" => 24,
        "language" => "ru-RU",
        "screen_height" => 1080,
        "screen_width" => 1920,
        "time_different" => 180,
        "user_agent" => "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
        "java_enabled" => 0,
        "window_height" => 953,
        "window_width" => 1036,
        "ip" => "83.218.201.87"
    ]
];

// --- AES-256-CTR шифрование ---
function encryptAES($plaintext, $key, $iv) {
    return openssl_encrypt($plaintext, 'aes-256-ctr', $key, OPENSSL_RAW_DATA, $iv);
}
function decryptAES($ciphertext, $key, $iv) {
    return openssl_decrypt($ciphertext, 'aes-256-ctr', $key, OPENSSL_RAW_DATA, $iv);
}

// --- Генерация ключа и IV ---
$aesKey = openssl_random_pseudo_bytes(32); // 256 бит
$aesIv = openssl_random_pseudo_bytes(16);  // 128 бит

// --- Шифруем данные ---
$dataJson = json_encode($data, JSON_UNESCAPED_UNICODE);
$encryptedData = base64_encode(encryptAES($dataJson, $aesKey, $aesIv));

// --- Шифруем ключ и IV через RSA ---
$keyData = json_encode([
    "key" => base64_encode($aesKey),
    "iv" => base64_encode($aesIv)
], JSON_UNESCAPED_UNICODE);

openssl_public_encrypt($keyData, $encryptedKey, $publicKey, OPENSSL_PKCS1_PADDING);
$encryptedKey = base64_encode($encryptedKey);

// --- Подпись данных ---
openssl_sign($dataJson, $signature, $privateKey, OPENSSL_ALGO_SHA256);
$signature = base64_encode($signature);

// --- Собираем payload ---
$payload = [
    "merchant_point_id" => 1660,
    "method" => "charge",
    "info" => $encryptedData,
    "key" => $encryptedKey,
    "sign" => $signature,
    "lang" => "en"
];

// --- Логирование запроса ---
file_put_contents(__DIR__ . '/payment_request.log', date('Y-m-d H:i:s') . " REQUEST:\n" . json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . "\n\n", FILE_APPEND);

// --- Отправка запроса ---
$ch = curl_init("https://api.paydmeth.com/api");
curl_setopt($ch, CURLOPT_POST, 1);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    "Content-Type: application/json",
    "Accept: application/json",
    "User-Agent: TesSoft Payment System/1.0"
]);
$response = curl_exec($ch);
curl_close($ch);

// --- Логирование ответа ---
file_put_contents(__DIR__ . '/payment_response.log', date('Y-m-d H:i:s') . " RESPONSE:\n" . $response . "\n\n", FILE_APPEND);

$result = json_decode($response, true);

// --- Расшифровка ответа ---
$decryptedResp = null;
if (!empty($result['info']) && !empty($result['key'])) {
    $decryptedKeyData = '';
    openssl_private_decrypt(base64_decode($result['key']), $decryptedKeyData, $privateKey, OPENSSL_PKCS1_PADDING);
    $keyArr = json_decode($decryptedKeyData, true);

    if (!empty($keyArr['key']) && !empty($keyArr['iv'])) {
        $respAesKey = base64_decode($keyArr['key']);
        $respAesIv = base64_decode($keyArr['iv']);
        $respEncrypted = base64_decode($result['info']);
        $decryptedResp = decryptAES($respEncrypted, $respAesKey, $respAesIv);

        // Логируем расшифрованный ответ
        file_put_contents(__DIR__ . '/payment_decrypted.log', date('Y-m-d H:i:s') . " DECRYPTED:\n" . $decryptedResp . "\n\n", FILE_APPEND);

        echo "<pre>Расшифрованный ответ:\n";
        print_r($decryptedResp);
        echo "</pre>";

        // Проверяем 3DS URL в расшифрованных данных
        $decryptedArr = json_decode($decryptedResp, true);
        if (!empty($decryptedArr['3ds_url'])) {
            header("Location: " . $decryptedArr['3ds_url']);
            exit;
        }
    } else {
        echo "Ошибка расшифровки ключа/IV.";
    }
}

// --- Проверка наличия 3DS URL и редирект в исходном ответе ---
if (!empty($result['3ds_url'])) {
    header("Location: " . $result['3ds_url']);
    exit;
} else {
    echo "3DS URL not found. Response: ";
    print_r($result);
}
?>