<?php
require_once __DIR__ . '/../../helpers/response.php';
require_once __DIR__ . '/../../helpers/auth.php';

// POST only
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendResponse(false, null, 'Method not allowed', 405);
}

requireAdmin();

$data = getInputData();

if (empty($data['order_id'])) {
    sendResponse(false, null, 'Order id is required.', 400);
}

// Find the order
$orders = readJsonFile('orders.json');
$order = null;
foreach ($orders as $o) {
    if ($o['id'] === $data['order_id']) {
        $order = $o;
        break;
    }
}

if (!$order) {
    sendResponse(false, null, 'Order not found.', 404);
}

// Check if bill already exists for this order
$bills = readJsonFile('bills.json');
foreach ($bills as $bill) {
    if ($bill['orderId'] === $data['order_id']) {
        sendResponse(false, null, 'Bill already generated for this order.', 409);
    }
}

// Get customer info
$users = readJsonFile('users.json');
$customer = null;
foreach ($users as $user) {
    if ($user['id'] === $order['userId']) {
        $customer = [
            'name' => $user['name'],
            'email' => $user['email'],
            'phone' => $user['phone'],
            'address' => $user['address'] ?? ''
        ];
        break;
    }
}

$billNumber = 'BILL-' . str_pad(count($bills) + 1, 4, '0', STR_PAD_LEFT);

$newBill = [
    'id' => generateId(),
    'billNumber' => $billNumber,
    'orderId' => $order['id'],
    'orderNumber' => $order['orderNumber'],
    'customer' => $customer,
    'items' => $order['items'],
    'subtotal' => $order['subtotal'],
    'tax' => $order['tax'],
    'total' => $order['total'],
    'paymentMethod' => $order['paymentMethod'],
    'paymentStatus' => $order['paymentStatus'],
    'generatedAt' => date('Y-m-d H:i:s')
];

$bills[] = $newBill;
writeJsonFile('bills.json', $bills);

sendResponse(true, ['bill' => $newBill], 'Bill generated successfully.', 201);
