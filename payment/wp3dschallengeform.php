<?php
header('Content-Type: text/html; charset=UTF-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, apikey');
header('Access-Control-Allow-Credentials: true');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// Get parameters from URL
$url = $_GET['url'] ?? '';
$jwt = $_GET['jwt'] ?? '';
$md = $_GET['md'] ?? '';
$refid = $_GET['refid'] ?? '';

// Validate required parameters
if (empty($url) || empty($jwt)) {
    http_response_code(400);
    echo '<html><body><h1>Error: Missing required parameters</h1></body></html>';
    exit();
}

// Log the challenge form request
error_log('3DS Challenge Form Request: ' . json_encode([
    'url' => $url,
    'jwt' => substr($jwt, 0, 50) . '...',
    'md' => $md,
    'refid' => $refid,
    'timestamp' => date('Y-m-d H:i:s')
]));
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>3D Secure Authentication</title>
    <style>
        body {
            margin: 0;
            padding: 20px;
            font-family: Arial, sans-serif;
            background: #f5f5f5;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
        }
        .container {
            text-align: center;
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            max-width: 400px;
            width: 100%;
        }
        .loading {
            color: #666;
        }
        .spinner {
            animation: spin 1s linear infinite;
            display: inline-block;
            width: 20px;
            height: 20px;
            border: 2px solid #f3f3f3;
            border-top: 2px solid #3498db;
            border-radius: 50%;
            margin-right: 10px;
        }
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="loading">
            <div class="spinner"></div>
            Redirecting to 3D Secure authentication...
        </div>
        <p>Please wait while we redirect you to your bank's authentication page.</p>
    </div>

    <!-- Hidden form for 3DS challenge -->
    <form id="challengeForm" method="POST" action="<?php echo htmlspecialchars($url); ?>" style="display: none;">
        <input type="hidden" name="JWT" value="<?php echo htmlspecialchars($jwt); ?>" />
        <input type="hidden" name="MD" value="<?php echo htmlspecialchars($md); ?>" />
    </form>

    <script>
        // Post message to parent window about challenge initiation
        if (window.parent !== window) {
            window.parent.postMessage({
                type: '3ds-challenge-initiated',
                data: {
                    url: <?php echo json_encode($url); ?>,
                    jwt: <?php echo json_encode(substr($jwt, 0, 50) . '...'); ?>,
                    refid: <?php echo json_encode($refid); ?>
                }
            }, '*');
        }

        // Auto-submit the form after a short delay
        window.onload = function() {
            setTimeout(function() {
                console.log('Submitting 3DS challenge form to:', <?php echo json_encode($url); ?>);
                document.getElementById('challengeForm').submit();
            }, 1000);
        };

        // Listen for messages from Cardinal Commerce
        window.addEventListener('message', function(event) {
            console.log('Received message in challenge form:', event.data, 'from:', event.origin);
            
            // Forward messages to parent window
            if (window.parent !== window) {
                window.parent.postMessage({
                    type: '3ds-challenge-message',
                    originalData: event.data,
                    origin: event.origin
                }, '*');
            }
        });

        // Handle page unload to notify parent
        window.addEventListener('beforeunload', function() {
            if (window.parent !== window) {
                window.parent.postMessage({
                    type: '3ds-challenge-unload'
                }, '*');
            }
        });
    </script>
</body>
</html>
