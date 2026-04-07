<?php
require_once __DIR__ . '/../../helpers/response.php';
require_once __DIR__ . '/../../helpers/auth.php';
require_once __DIR__ . '/../../helpers/firebase.php';

// POST only
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendResponse(false, null, 'Method not allowed', 405);
}

$authUser = requireAuth();

$data = getInputData();

// Validate required fields
if (empty($data['items']) || !is_array($data['items'])) {
    sendResponse(false, null, 'Order items are required.', 400);
}
if (empty($data['deliveryAddress'])) {
    sendResponse(false, null, 'Delivery address is required.', 400);
}

// Load products for price validation
$products = readJsonFile('products.json');
$productMap = [];
foreach ($products as $p) {
    $productMap[$p['id']] = $p;
}

// Calculate totals
$subtotal = 0;
$orderItems = [];

foreach ($data['items'] as $item) {
    if (empty($item['productId']) || empty($item['quantity'])) {
        sendResponse(false, null, 'Each item must have productId and quantity.', 400);
    }

    $product = $productMap[$item['productId']] ?? null;
    if (!$product) {
        sendResponse(false, null, "Product '{$item['productId']}' not found.", 404);
    }

    $quantity = (int) $item['quantity'];
    $itemTotal = $product['price'] * $quantity;
    $subtotal += $itemTotal;

    $orderItems[] = [
        'productId' => $product['id'],
        'name' => $product['name'],
        'price' => $product['price'],
        'quantity' => $quantity,
        'total' => $itemTotal,
        'image' => $product['image'] ?? ''
    ];
}

$tax = round($subtotal * 0.18, 2);
$total = round($subtotal + $tax, 2);

// Generate order number
$orders = readJsonFile('orders.json');
$orderNumber = 'ORD-' . str_pad(count($orders) + 1, 4, '0', STR_PAD_LEFT);

$newOrder = [
    'id' => generateId(),
    'orderNumber' => $orderNumber,
    'userId' => $authUser['id'],
    'customerName' => $authUser['email'],
    'items' => $orderItems,
    'subtotal' => $subtotal,
    'tax' => $tax,
    'total' => $total,
    'deliveryAddress' => $data['deliveryAddress'],
    'paymentMethod' => $data['paymentMethod'] ?? 'COD',
    'paymentStatus' => 'Pending',
    'status' => 'Placed',
    'statusHistory' => [
        [
            'status' => 'Placed',
            'timestamp' => date('Y-m-d H:i:s'),
            'note' => 'Order placed by customer'
        ]
    ],
    'notes' => $data['notes'] ?? '',
    'createdAt' => date('Y-m-d H:i:s'),
    'updatedAt' => date('Y-m-d H:i:s')
];

// Fetch customer name from users
$users = readJsonFile('users.json');
foreach ($users as $user) {
    if ($user['id'] === $authUser['id']) {
        $newOrder['customerName'] = $user['name'];
        break;
    }
}

$orders[] = $newOrder;
writeJsonFile('orders.json', $orders);

// Update product stock
foreach ($orderItems as $item) {
    foreach ($products as &$p) {
        if ($p['id'] === $item['productId']) {
            $p['stock'] = max(0, ($p['stock'] ?? 0) - $item['quantity']);
            break;
        }
    }
}
unset($p);
writeJsonFile('products.json', $products);

// Notify admin
saveNotification(
    'New Order Received',
    "Order $orderNumber placed by {$newOrder['customerName']} - Total: ₹$total",
    null,
    'new_order'
);

sendResponse(true, ['order' => $newOrder], 'Order placed successfully.', 201);
