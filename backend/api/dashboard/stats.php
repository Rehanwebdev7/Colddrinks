<?php
require_once __DIR__ . '/../../helpers/response.php';
require_once __DIR__ . '/../../helpers/auth.php';

// GET only
if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    sendResponse(false, null, 'Method not allowed', 405);
}

requireAdmin();

$orders = readJsonFile('orders.json');
$products = readJsonFile('products.json');

// Total orders
$totalOrders = count($orders);

// Total revenue (from delivered/paid orders)
$totalRevenue = 0;
$pendingPayments = 0;

foreach ($orders as $order) {
    if ($order['status'] !== 'Cancelled') {
        $totalRevenue += $order['total'];
    }
    if (($order['paymentStatus'] ?? 'Pending') === 'Pending' && $order['status'] !== 'Cancelled') {
        $pendingPayments += $order['total'];
    }
}

// Low stock count (stock < 10)
$lowStockCount = 0;
foreach ($products as $product) {
    if (($product['stock'] ?? 0) < 10 && ($product['status'] ?? 'active') === 'active') {
        $lowStockCount++;
    }
}

// Today's orders
$today = date('Y-m-d');
$todayOrders = 0;
$todayRevenue = 0;
foreach ($orders as $order) {
    if (strpos($order['createdAt'] ?? '', $today) === 0) {
        $todayOrders++;
        if ($order['status'] !== 'Cancelled') {
            $todayRevenue += $order['total'];
        }
    }
}

sendResponse(true, [
    'stats' => [
        'totalOrders' => $totalOrders,
        'totalRevenue' => round($totalRevenue, 2),
        'pendingPayments' => round($pendingPayments, 2),
        'lowStockCount' => $lowStockCount,
        'todayOrders' => $todayOrders,
        'todayRevenue' => round($todayRevenue, 2),
        'totalProducts' => count($products)
    ]
], 'Dashboard stats fetched successfully.');
