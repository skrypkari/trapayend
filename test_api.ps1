# PowerShell тест для TrapayEnd API
# Запуск: .\test_api.ps1

Write-Host "🧪 TrapayEnd API Test (PowerShell)" -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan

$apiBase = "https://api.trapay.uk"
$publicKey = "pk_8fed209892c6d4113e2be53090e1e60ea20ec61e9c60e8618ce6760439f79572"  # Замените на реальный ключ

# Тест 1: Создание платежа через MasterCard
Write-Host "`n1. Creating MasterCard payment..." -ForegroundColor Yellow

$paymentData = @{
    public_key = $publicKey
    gateway = "1111"
    order_id = "test_$(Get-Date -Format 'yyyyMMddHHmmss')"
    amount = 100
    currency = "USD"
    customer = "8MKTMRR4"
    customer_email = "test@example.com"
    customer_name = "Test Customer"
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$apiBase/api/public/payments" -Method Post -Body $paymentData -ContentType "application/json"
    Write-Host "✅ Payment created successfully!" -ForegroundColor Green
    Write-Host "Payment ID: $($response.id)" -ForegroundColor White
    Write-Host "Payment URL: $($response.payment_url)" -ForegroundColor White
    Write-Host "Gateway Payment ID: $($response.gateway_payment_id)" -ForegroundColor White
    $paymentId = $response.id
} catch {
    Write-Host "❌ Payment creation failed: $($_.Exception.Message)" -ForegroundColor Red
    $paymentId = $null
}

# Тест 2: Проверка статуса платежа
if ($paymentId) {
    Write-Host "`n2. Checking payment status..." -ForegroundColor Yellow
    
    try {
        $statusResponse = Invoke-RestMethod -Uri "$apiBase/api/public/payments/$paymentId" -Method Get
        Write-Host "✅ Status check successful!" -ForegroundColor Green
        Write-Host "Status: $($statusResponse.status)" -ForegroundColor White
        Write-Host "Gateway: $($statusResponse.gateway)" -ForegroundColor White
        Write-Host "Amount: $($statusResponse.amount) $($statusResponse.currency)" -ForegroundColor White
    } catch {
        Write-Host "❌ Status check failed: $($_.Exception.Message)" -ForegroundColor Red
    }
}

# Тест 3: Создание платежа через Amer
Write-Host "`n3. Creating Amer payment..." -ForegroundColor Yellow

$amerData = @{
    public_key = $publicKey
    gateway = "0001"
    amount = 50
    currency = "USD"
    customer_email = "amer@example.com"
} | ConvertTo-Json

try {
    $amerResponse = Invoke-RestMethod -Uri "$apiBase/api/public/payments" -Method Post -Body $amerData -ContentType "application/json"
    Write-Host "✅ Amer payment created successfully!" -ForegroundColor Green
    Write-Host "Payment ID: $($amerResponse.id)" -ForegroundColor White
    Write-Host "Payment URL: $($amerResponse.payment_url)" -ForegroundColor White
    $amerPaymentId = $amerResponse.id
} catch {
    Write-Host "❌ Amer payment creation failed: $($_.Exception.Message)" -ForegroundColor Red
    $amerPaymentId = $null
}

# Тест 4: Rapyd с реальным ключом (тот же запрос что показал ошибку)
Write-Host "`n4. Testing Rapyd payment with real key..." -ForegroundColor Yellow

$rapydData = @{
    public_key = $publicKey
    gateway = "0010"
    order_id = "test_20250814123000"
    amount = 100
    currency = "USD"
    customer_email = "test@example.com"
    customer_name = "Test Customer"
} | ConvertTo-Json

try {
    $rapydResponse = Invoke-RestMethod -Uri "$apiBase/api/public/payments" -Method Post -Body $rapydData -ContentType "application/json"
    Write-Host "✅ Rapyd payment created successfully!" -ForegroundColor Green
    Write-Host "Payment ID: $($rapydResponse.id)" -ForegroundColor White
    Write-Host "Payment URL: $($rapydResponse.payment_url)" -ForegroundColor White
    $rapydPaymentId = $rapydResponse.id
} catch {
    Write-Host "❌ Rapyd payment failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Full error:" -ForegroundColor Red
    Write-Host $_.Exception.Response -ForegroundColor Red
    $rapydPaymentId = $null
}

# Тест 5: Тест gateway permission error
Write-Host "`n5. Testing gateway permission error..." -ForegroundColor Yellow

$invalidData = @{
    public_key = "pk_test_invalid_shop"
    gateway = "0010"
    amount = 100
    currency = "USD"
} | ConvertTo-Json

try {
    $errorResponse = Invoke-RestMethod -Uri "$apiBase/api/public/payments" -Method Post -Body $invalidData -ContentType "application/json"
    Write-Host "⚠️  Unexpected success - should have failed" -ForegroundColor Yellow
} catch {
    $errorMessage = $_.Exception.Message
    if ($errorMessage -like "*0010*") {
        Write-Host "✅ Security test passed: Gateway ID shown instead of name" -ForegroundColor Green
    } else {
        Write-Host "⚠️  Security concern: $errorMessage" -ForegroundColor Yellow
    }
}

# Тест 6: Создание payment link (потребует авторизации)
Write-Host "`n6. Testing invalid gateway ID..." -ForegroundColor Yellow

$invalidGatewayData = @{
    public_key = $publicKey
    gateway = "9999"
    amount = 25
    currency = "USD"
} | ConvertTo-Json

try {
    $invalidResponse = Invoke-RestMethod -Uri "$apiBase/api/public/payments" -Method Post -Body $invalidGatewayData -ContentType "application/json"
    Write-Host "⚠️  Unexpected success with invalid gateway" -ForegroundColor Yellow
} catch {
    Write-Host "✅ Invalid gateway properly rejected" -ForegroundColor Green
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor White
}

# Резюме
Write-Host "`n🎯 Test Summary:" -ForegroundColor Cyan
Write-Host "================" -ForegroundColor Cyan

if ($paymentId) {
    Write-Host "✅ MasterCard payment: SUCCESS ($paymentId)" -ForegroundColor Green
    Write-Host "🔗 Test URL: https://app.trapay.uk/payment/$paymentId?customer=8MKTMRR4" -ForegroundColor White
} else {
    Write-Host "❌ MasterCard payment: FAILED" -ForegroundColor Red
}

if ($amerPaymentId) {
    Write-Host "✅ Amer payment: SUCCESS ($amerPaymentId)" -ForegroundColor Green
    Write-Host "🔗 Test URL: https://app.trapay.uk/payment/$amerPaymentId" -ForegroundColor White
} else {
    Write-Host "❌ Amer payment: FAILED" -ForegroundColor Red
}

Write-Host "`n💡 Manual testing steps:" -ForegroundColor Yellow
Write-Host "1. Open the payment URLs above in browser" -ForegroundColor White
Write-Host "2. Fill in test card details" -ForegroundColor White
Write-Host "3. Complete 3DS authentication" -ForegroundColor White
Write-Host "4. Check status updates in dashboard" -ForegroundColor White
Write-Host "5. Verify webhook notifications" -ForegroundColor White

Write-Host "`n🔧 Configuration needed:" -ForegroundColor Yellow
Write-Host "- Replace 'pk_test_demo' with real public key" -ForegroundColor White
Write-Host "- Configure webhook endpoints" -ForegroundColor White
Write-Host "- Test with real gateway credentials" -ForegroundColor White
