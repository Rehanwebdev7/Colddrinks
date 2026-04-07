<?php
/**
 * Cold Drinks Shop - API Router
 *
 * Usage: php -S localhost:8000 router.php
 *
 * This router handles clean URLs for the PHP built-in server.
 * It maps URL paths to the corresponding API endpoint files.
 */

$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$uri = rtrim($uri, '/');

// Route map: URL path => file path
$routes = [
    // Auth
    '/api/auth/register'    => __DIR__ . '/api/auth/register.php',
    '/api/auth/login'       => __DIR__ . '/api/auth/login.php',
    '/api/auth/verify'      => __DIR__ . '/api/auth/verify.php',

    // Products
    '/api/products'         => __DIR__ . '/api/products/index.php',
    '/api/products/add'     => __DIR__ . '/api/products/add.php',
    '/api/products/update'  => __DIR__ . '/api/products/update.php',
    '/api/products/delete'  => __DIR__ . '/api/products/delete.php',

    // Orders
    '/api/orders'           => __DIR__ . '/api/orders/index.php',
    '/api/orders/create'    => __DIR__ . '/api/orders/create.php',
    '/api/orders/status'    => __DIR__ . '/api/orders/status.php',

    // Cart
    '/api/cart/get'         => __DIR__ . '/api/cart/get.php',
    '/api/cart'             => __DIR__ . '/api/cart/get.php',
    '/api/cart/add'         => __DIR__ . '/api/cart/add.php',
    '/api/cart/remove'      => __DIR__ . '/api/cart/remove.php',

    // Bills
    '/api/bills/generate'   => __DIR__ . '/api/bills/generate.php',
    '/api/bills/download'   => __DIR__ . '/api/bills/download.php',
    '/api/bills'            => __DIR__ . '/api/bills/index.php',

    // Dashboard
    '/api/dashboard/stats'  => __DIR__ . '/api/dashboard/stats.php',
    '/api/dashboard/charts' => __DIR__ . '/api/dashboard/charts.php',

    // Notifications
    '/api/notifications/list'     => __DIR__ . '/api/notifications/list.php',
    '/api/notifications'          => __DIR__ . '/api/notifications/list.php',
    '/api/notifications/send'     => __DIR__ . '/api/notifications/send.php',
    '/api/notifications/markread' => __DIR__ . '/api/notifications/markread.php',

    // API root
    '/api'                  => __DIR__ . '/api/index.php',
    '/'                     => __DIR__ . '/api/index.php',
    ''                      => __DIR__ . '/api/index.php',
];

// Handle CORS preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Authorization');
    http_response_code(200);
    exit();
}

// Match route
if (isset($routes[$uri])) {
    require $routes[$uri];
    exit();
}

// Try to serve static files (for built-in server)
if (php_sapi_name() === 'cli-server') {
    $filePath = __DIR__ . $uri;
    if (is_file($filePath)) {
        return false; // Let the built-in server handle static files
    }
}

// 404 - Route not found
header('Content-Type: application/json');
http_response_code(404);
echo json_encode([
    'success' => false,
    'data' => null,
    'message' => "Endpoint not found: $uri"
]);
