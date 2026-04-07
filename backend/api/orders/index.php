<?php
require_once __DIR__ . '/../../helpers/response.php';
require_once __DIR__ . '/../../helpers/auth.php';

// GET only
if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    sendResponse(false, null, 'Method not allowed', 405);
}

$authUser = requireAuth();

$orders = readJsonFile('orders.json');

// If not admin, filter by user_id
if ($authUser['role'] !== 'admin') {
    $userId = $_GET['user_id'] ?? $authUser['id'];
    $orders = array_filter($orders, function ($o) use ($userId) {
        return $o['userId'] === $userId;
    });
}

// Filter by status
if (!empty($_GET['status'])) {
    $status = $_GET['status'];
    $orders = array_filter($orders, function ($o) use ($status) {
        return $o['status'] === $status;
    });
}

// Filter by payment status
if (!empty($_GET['payment_status'])) {
    $paymentStatus = $_GET['payment_status'];
    $orders = array_filter($orders, function ($o) use ($paymentStatus) {
        return ($o['paymentStatus'] ?? '') === $paymentStatus;
    });
}

// Filter by date range
if (!empty($_GET['date_from'])) {
    $dateFrom = $_GET['date_from'];
    $orders = array_filter($orders, function ($o) use ($dateFrom) {
        return ($o['createdAt'] ?? '') >= $dateFrom;
    });
}
if (!empty($_GET['date_to'])) {
    $dateTo = $_GET['date_to'] . ' 23:59:59';
    $orders = array_filter($orders, function ($o) use ($dateTo) {
        return ($o['createdAt'] ?? '') <= $dateTo;
    });
}

// Re-index and sort by newest first
$orders = array_values($orders);
usort($orders, function ($a, $b) {
    return strtotime($b['createdAt'] ?? 0) - strtotime($a['createdAt'] ?? 0);
});

sendResponse(true, ['orders' => $orders], 'Orders fetched successfully.');
