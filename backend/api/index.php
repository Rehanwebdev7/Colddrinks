<?php
require_once __DIR__ . '/../helpers/response.php';

sendResponse(true, [
    'name' => 'Cold Drinks Shop API',
    'version' => '1.0.0',
    'endpoints' => [
        'POST /api/auth/register' => 'Register new user',
        'POST /api/auth/login' => 'Login user',
        'GET  /api/auth/verify' => 'Verify JWT token',
        'GET  /api/products' => 'List products (filter: category, search, status)',
        'POST /api/products/add' => 'Add product [Admin]',
        'PUT  /api/products/update' => 'Update product [Admin]',
        'DELETE /api/products/delete' => 'Delete product [Admin]',
        'GET  /api/orders' => 'List orders',
        'POST /api/orders/create' => 'Create order',
        'PUT  /api/orders/status' => 'Update order status [Admin]',
        'GET  /api/cart/get' => 'Get cart items',
        'POST /api/cart/add' => 'Add to cart',
        'DELETE /api/cart/remove' => 'Remove from cart',
        'POST /api/bills/generate' => 'Generate bill [Admin]',
        'GET  /api/bills/download' => 'Download bill',
        'GET  /api/bills' => 'List bills [Admin]',
        'GET  /api/dashboard/stats' => 'Dashboard stats [Admin]',
        'GET  /api/dashboard/charts' => 'Chart data [Admin]',
        'GET  /api/notifications/list' => 'List notifications',
        'POST /api/notifications/send' => 'Send notification [Admin]',
        'POST /api/notifications/markread' => 'Mark notification read'
    ]
], 'Cold Drinks Shop API is running.');
