<?php
require_once __DIR__ . '/../../helpers/response.php';
require_once __DIR__ . '/../../helpers/auth.php';

// GET only
if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    sendResponse(false, null, 'Method not allowed', 405);
}

requireAdmin();

$orders = readJsonFile('orders.json');

// Weekly orders data (last 7 days)
$weeklyOrders = [];
$weeklyRevenue = [];
for ($i = 6; $i >= 0; $i--) {
    $date = date('Y-m-d', strtotime("-$i days"));
    $dayLabel = date('D', strtotime("-$i days"));
    $dayOrders = 0;
    $dayRevenue = 0;

    foreach ($orders as $order) {
        if (strpos($order['createdAt'] ?? '', $date) === 0 && $order['status'] !== 'Cancelled') {
            $dayOrders++;
            $dayRevenue += $order['total'];
        }
    }

    $weeklyOrders[] = [
        'date' => $date,
        'day' => $dayLabel,
        'orders' => $dayOrders
    ];
    $weeklyRevenue[] = [
        'date' => $date,
        'day' => $dayLabel,
        'revenue' => round($dayRevenue, 2)
    ];
}

// Revenue by category
$categoryRevenue = [];
foreach ($orders as $order) {
    if ($order['status'] === 'Cancelled') continue;

    foreach ($order['items'] as $item) {
        // Get product category
        $products = readJsonFile('products.json');
        foreach ($products as $p) {
            if ($p['id'] === $item['productId']) {
                $cat = $p['category'] ?? 'Uncategorized';
                if (!isset($categoryRevenue[$cat])) {
                    $categoryRevenue[$cat] = 0;
                }
                $categoryRevenue[$cat] += $item['total'];
                break;
            }
        }
    }
}

$categoryChartData = [];
foreach ($categoryRevenue as $category => $revenue) {
    $categoryChartData[] = [
        'category' => $category,
        'revenue' => round($revenue, 2)
    ];
}

// Order status distribution
$statusDistribution = [];
foreach ($orders as $order) {
    $status = $order['status'] ?? 'Unknown';
    if (!isset($statusDistribution[$status])) {
        $statusDistribution[$status] = 0;
    }
    $statusDistribution[$status]++;
}

$statusChartData = [];
foreach ($statusDistribution as $status => $count) {
    $statusChartData[] = [
        'status' => $status,
        'count' => $count
    ];
}

sendResponse(true, [
    'weeklyOrders' => $weeklyOrders,
    'weeklyRevenue' => $weeklyRevenue,
    'categoryRevenue' => $categoryChartData,
    'orderStatusDistribution' => $statusChartData
], 'Chart data fetched successfully.');
