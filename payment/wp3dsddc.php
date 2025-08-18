<?php
// Device Data Collection handler
header('Content-Type: text/html');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// Get parameters from query string
$url = $_GET['url'] ?? '';
$jwt = $_GET['jwt'] ?? '';
$bin = $_GET['bin'] ?? '';
$refid = $_GET['refid'] ?? '';

// Validate required parameters
if (empty($url) || empty($jwt) || empty($bin)) {
    http_response_code(400);
    echo 'Missing required parameters';
    exit();
}

// Log the DDC request
error_log('DDC Request: ' . json_encode([
    'url' => $url,
    'bin' => $bin,
    'refid' => $refid,
    'timestamp' => date('Y-m-d H:i:s')
]));

// Return the HTML form that will auto-submit to Cardinal Commerce
?>
<html>
<head>
    <title>Device Data Collection</title>
</head>
<body>
<form id="collectionForm" name="devicedata" method="POST" action="<?php echo htmlspecialchars($url); ?>">
    <input type="hidden" name="Bin" value="<?php echo htmlspecialchars($bin); ?>" />
    <input type="hidden" name="JWT" value="<?php echo htmlspecialchars($jwt); ?>" />
</form>

<script>
window.onload = function () {
    // Log that DDC form is being submitted
    console.log('DDC: Submitting device data collection form');
    
    // Auto-submit the form
    document.getElementById('collectionForm').submit();
    
    // Notify parent window if in iframe
    if (window.parent && window.parent !== window) {
        try {
            window.parent.postMessage({
                type: 'ddc-submitted',
                refid: '<?php echo htmlspecialchars($refid); ?>'
            }, '*');
        } catch (e) {
            console.log('Could not notify parent window:', e);
        }
    }
}

// Handle response from Cardinal Commerce (if any)
window.addEventListener('message', function(event) {
    console.log('DDC: Received message:', event.data);
    
    // Forward to parent if we're in iframe
    if (window.parent && window.parent !== window) {
        try {
            window.parent.postMessage({
                type: 'ddc-response',
                data: event.data,
                refid: '<?php echo htmlspecialchars($refid); ?>'
            }, '*');
        } catch (e) {
            console.log('Could not forward message to parent:', e);
        }
    }
});
</script>
</body>
</html>
