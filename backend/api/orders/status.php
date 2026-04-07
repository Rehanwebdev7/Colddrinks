<?php
require_once __DIR__ . '/../../helpers/response.php';
require_once __DIR__ . '/../../helpers/auth.php';
require_once __DIR__ . '/../../helpers/firebase.php';

// PUT only
if ($_SERVER['REQUEST_METHOD'] !== 'PUT') {
    sendResponse(false, null, 'Method not allowed', 405);
}

requireAdmin();

$data = getInputData();

if (empty($data['id'])) {
    sendResponse(false, null, 'Order id is required.', 400);
}
if (empty($data['status'])) {
    sendResponse(false, null, 'New status is required.', 400);
}

$validStatuses = ['Placed', 'Confirmed', 'Preparing', 'Out for Delivery', 'Delivered', 'Cancelled'];
if (!in_array($data['status'], $validStatuses)) {
    sendResponse(false, null, 'Invalid status. Valid: ' . implode(', ', $validStatuses), 400);
}

$orders = readJsonFile('orders.json');
$found = false;
$updatedOrder = null;

foreach ($orders as &$order) {
    if ($order['id'] === $data['id']) {
        $order['status'] = $data['status'];
        $order['updatedAt'] = date('Y-m-d H:i:s');

        // Update payment status if delivered
        if ($data['status'] === 'Delivered') {
            $order['paymentStatus'] = 'Paid';
        }

        // Add to status history
        $order['statusHistory'][] = [
            'status' => $data['status'],
            'timestamp' => date('Y-m-d H:i:s'),
            'note' => $data['note'] ?? "Status updated to {$data['status']}"
        ];

        $found = true;
        $updatedOrder = $order;
        break;
    }
}
unset($order);

if (!$found) {
    sendResponse(false, null, 'Order not found.', 404);
}

writeJsonFile('orders.json', $orders);

// Send notification to customer
saveNotification(
    'Order Status Updated',
    "Your order {$updatedOrder['orderNumber']} is now: {$data['status']}",
    $updatedOrder['userId'],
    'order_status'
);

sendResponse(true, ['order' => $updatedOrder], 'Order status updated successfully.');
