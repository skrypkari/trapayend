# PowerShell тест для проверки исправления
Write-Host "🔧 Testing Gateway Permission Fix" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan

$apiBase = "https://api.trapay.uk"
$publicKey = "pk_8fed209892c6d4113e2be53090e1e60ea20ec61e9c60e8618ce6760439f79572"

# Точно такой же запрос, который показал ошибку
Write-Host "`nTesting the exact same request that failed..." -ForegroundColor Yellow

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
    $response = Invoke-RestMethod -Uri "$apiBase/api/public/payments" -Method Post -Body $rapydData -ContentType "application/json"
    Write-Host "✅ SUCCESS: Payment created successfully!" -ForegroundColor Green
    Write-Host "Payment ID: $($response.id)" -ForegroundColor White
    Write-Host "Payment URL: $($response.payment_url)" -ForegroundColor White
    $success = $true
} catch {
    Write-Host "❌ STILL FAILING: Gateway permission issue persists" -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    $success = $false
}

# Дополнительный тест с MasterCard
Write-Host "`nTesting MasterCard gateway (1111)..." -ForegroundColor Yellow

$mcData = @{
    public_key = $publicKey
    gateway = "1111"
    amount = 50
    currency = "USD"
    customer = "8MKTMRR4"
} | ConvertTo-Json

try {
    $mcResponse = Invoke-RestMethod -Uri "$apiBase/api/public/payments" -Method Post -Body $mcData -ContentType "application/json"
    Write-Host "✅ MasterCard: SUCCESS" -ForegroundColor Green
    Write-Host "MasterCard Payment ID: $($mcResponse.id)" -ForegroundColor White
    $mcSuccess = $true
} catch {
    Write-Host "❌ MasterCard: FAILED" -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    $mcSuccess = $false
}

Write-Host "`n🎯 Test Summary:" -ForegroundColor Cyan
Write-Host "================" -ForegroundColor Cyan
Write-Host "- Rapyd (0010): $(if ($success) { "SUCCESS" } else { "FAILED" })" -ForegroundColor $(if ($success) { "Green" } else { "Red" })
Write-Host "- MasterCard (1111): $(if ($mcSuccess) { "SUCCESS" } else { "FAILED" })" -ForegroundColor $(if ($mcSuccess) { "Green" } else { "Red" })

if ($success -and $mcSuccess) {
    Write-Host "`n🎉 Gateway permission bug is FIXED!" -ForegroundColor Green
} else {
    Write-Host "`n⚠️  Gateway permission bug still exists" -ForegroundColor Yellow
}
