# Полный тест всех исправлений
Write-Host "🚀 Complete Fix Test - All Issues" -ForegroundColor Cyan
Write-Host "=================================" -ForegroundColor Cyan

$apiBase = "https://api.trapay.uk"
$publicKey = "pk_8fed209892c6d4113e2be53090e1e60ea20ec61e9c60e8618ce6760439f79572"

Write-Host "`n🔧 Testing all recent fixes:" -ForegroundColor Yellow
Write-Host "1. Gateway permission logic (mastercard/rapyd in DB vs IDs)" -ForegroundColor White
Write-Host "2. Card_data validation (should be optional for MasterCard)" -ForegroundColor White
Write-Host "3. Customer parameter support (any format, not just cus_)" -ForegroundColor White
Write-Host "4. Rapyd gateway (0010) permission check" -ForegroundColor White

# Тест 1: Rapyd (0010) - проверка gateway permission fix
Write-Host "`n📋 Test 1: Rapyd (0010) Gateway Permission Fix" -ForegroundColor Green
Write-Host "=============================================" -ForegroundColor Green

$rapydData = @{
    public_key = $publicKey
    gateway = "0010"
    order_id = "test_rapyd_$(Get-Date -Format 'yyyyMMddHHmmss')"
    amount = 100
    currency = "USD"
    customer_email = "test@example.com"
    customer_name = "Test Customer"
} | ConvertTo-Json

try {
    $rapydResponse = Invoke-RestMethod -Uri "$apiBase/api/public/payments" -Method Post -Body $rapydData -ContentType "application/json"
    Write-Host "✅ RAPYD SUCCESS: Payment created!" -ForegroundColor Green
    Write-Host "Payment ID: $($rapydResponse.id)" -ForegroundColor White
    Write-Host "Payment URL: $($rapydResponse.payment_url)" -ForegroundColor White
    $rapydSuccess = $true
} catch {
    Write-Host "❌ RAPYD FAILED: $($_.Exception.Message)" -ForegroundColor Red
    $rapydSuccess = $false
}

# Тест 2: MasterCard (1111) - проверка card_data validation fix
Write-Host "`n💳 Test 2: MasterCard (1111) Validation Fix" -ForegroundColor Green
Write-Host "===========================================" -ForegroundColor Green

$mcData = @{
    public_key = $publicKey
    gateway = "1111"
    order_id = "test_mc_$(Get-Date -Format 'yyyyMMddHHmmss')"
    amount = 100
    currency = "USD"
    customer = "8MKTMRR4"
    customer_email = "test@example.com"
    customer_name = "Test Customer"
} | ConvertTo-Json

try {
    $mcResponse = Invoke-RestMethod -Uri "$apiBase/api/public/payments" -Method Post -Body $mcData -ContentType "application/json"
    Write-Host "✅ MASTERCARD SUCCESS: Payment created without card_data!" -ForegroundColor Green
    Write-Host "Payment ID: $($mcResponse.id)" -ForegroundColor White
    Write-Host "Payment URL: $($mcResponse.payment_url)" -ForegroundColor White
    $mcSuccess = $true
} catch {
    Write-Host "❌ MASTERCARD FAILED: $($_.Exception.Message)" -ForegroundColor Red
    $mcSuccess = $false
}

# Тест 3: Customer parameter format
Write-Host "`n👤 Test 3: Customer Parameter Format Support" -ForegroundColor Green
Write-Host "=============================================" -ForegroundColor Green

$customerData = @{
    public_key = $publicKey
    gateway = "0010"
    order_id = "test_customer_$(Get-Date -Format 'yyyyMMddHHmmss')"
    amount = 50
    currency = "USD"
    customer = "8MKTMRR4"  # Non-Rapyd format
    customer_email = "customer@example.com"
} | ConvertTo-Json

try {
    $customerResponse = Invoke-RestMethod -Uri "$apiBase/api/public/payments" -Method Post -Body $customerData -ContentType "application/json"
    Write-Host "✅ CUSTOMER FORMAT SUCCESS: Non-Rapyd customer accepted!" -ForegroundColor Green
    Write-Host "Payment ID: $($customerResponse.id)" -ForegroundColor White
    $customerSuccess = $true
} catch {
    Write-Host "❌ CUSTOMER FORMAT FAILED: $($_.Exception.Message)" -ForegroundColor Red
    $customerSuccess = $false
}

# Тест 4: Amer gateway (0001)
Write-Host "`n🏦 Test 4: Amer Gateway (0001)" -ForegroundColor Green
Write-Host "==============================" -ForegroundColor Green

$amerData = @{
    public_key = $publicKey
    gateway = "0001"
    order_id = "test_amer_$(Get-Date -Format 'yyyyMMddHHmmss')"
    amount = 75
    currency = "USD"
    customer_email = "amer@example.com"
} | ConvertTo-Json

try {
    $amerResponse = Invoke-RestMethod -Uri "$apiBase/api/public/payments" -Method Post -Body $amerData -ContentType "application/json"
    Write-Host "✅ AMER SUCCESS: Payment created!" -ForegroundColor Green
    Write-Host "Payment ID: $($amerResponse.id)" -ForegroundColor White
    $amerSuccess = $true
} catch {
    Write-Host "❌ AMER FAILED: $($_.Exception.Message)" -ForegroundColor Red
    $amerSuccess = $false
}

# Сводка результатов
Write-Host "`n🎯 FINAL TEST RESULTS" -ForegroundColor Cyan
Write-Host "=====================" -ForegroundColor Cyan

$results = @(
    @{ Name = "Rapyd (0010)"; Success = $rapydSuccess; Description = "Gateway permission logic fix" },
    @{ Name = "MasterCard (1111)"; Success = $mcSuccess; Description = "Card_data validation fix" },
    @{ Name = "Customer Format"; Success = $customerSuccess; Description = "Non-Rapyd customer support" },
    @{ Name = "Amer (0001)"; Success = $amerSuccess; Description = "Basic gateway functionality" }
)

$passedTests = 0
foreach ($result in $results) {
    $status = if ($result.Success) { "PASS" } else { "FAIL" }
    $color = if ($result.Success) { "Green" } else { "Red" }
    Write-Host "- $($result.Name): $status ($($result.Description))" -ForegroundColor $color
    if ($result.Success) { $passedTests++ }
}

Write-Host "`nOverall: $passedTests/$($results.Count) tests passed" -ForegroundColor $(if ($passedTests -eq $results.Count) { "Green" } else { "Yellow" })

if ($passedTests -eq $results.Count) {
    Write-Host "`n🎉 ALL ISSUES FIXED! System is working correctly." -ForegroundColor Green
    
    Write-Host "`n🔗 Payment URLs for manual testing:" -ForegroundColor Yellow
    if ($rapydSuccess) {
        Write-Host "Rapyd: https://app.trapay.uk/payment/$($rapydResponse.id)" -ForegroundColor White
    }
    if ($mcSuccess) {
        Write-Host "MasterCard: https://app.trapay.uk/payment/$($mcResponse.id)?customer=8MKTMRR4" -ForegroundColor White
    }
    if ($customerSuccess) {
        Write-Host "Customer Test: https://app.trapay.uk/payment/$($customerResponse.id)" -ForegroundColor White
    }
    if ($amerSuccess) {
        Write-Host "Amer: https://app.trapay.uk/payment/$($amerResponse.id)" -ForegroundColor White
    }
    
} elseif ($passedTests -gt 0) {
    Write-Host "`n⚠️  Some issues remain. Check failed tests above." -ForegroundColor Yellow
} else {
    Write-Host "`n❌ Major issues still exist. System needs more work." -ForegroundColor Red
}

Write-Host "`n💡 Next steps:" -ForegroundColor Yellow
Write-Host "1. Test payment forms manually using URLs above" -ForegroundColor White
Write-Host "2. Fill test card details and complete payments" -ForegroundColor White
Write-Host "3. Verify status updates in dashboard" -ForegroundColor White
Write-Host "4. Check webhook notifications" -ForegroundColor White
