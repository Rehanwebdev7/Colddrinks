<?php
require_once __DIR__ . '/../../helpers/response.php';
require_once __DIR__ . '/../../helpers/auth.php';

// POST only
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendResponse(false, null, 'Method not allowed', 405);
}

$authUser = requireAuth();

$data = getInputData();

if (empty($data['productId'])) {
    sendResponse(false, null, 'Product id is required.', 400);
}

$quantity = (int) ($data['quantity'] ?? 1);
if ($quantity < 1) {
    sendResponse(false, null, 'Quantity must be at least 1.', 400);
}

// Verify product exists
$products = readJsonFile('products.json');
$productExists = false;
foreach ($products as $p) {
    if ($p['id'] === $data['productId']) {
        $productExists = true;
        break;
    }
}
if (!$productExists) {
    sendResponse(false, null, 'Product not found.', 404);
}

$carts = readJsonFile('carts.json');

// Find or create user cart
$cartIndex = -1;
foreach ($carts as $i => $cart) {
    if ($cart['userId'] === $authUser['id']) {
        $cartIndex = $i;
        break;
    }
}

if ($cartIndex === -1) {
    // Create new cart for user
    $carts[] = [
        'userId' => $authUser['id'],
        'items' => [],
        'updatedAt' => date('Y-m-d H:i:s')
    ];
    $cartIndex = count($carts) - 1;
}

// Check if product already in cart
$itemFound = false;
foreach ($carts[$cartIndex]['items'] as &$item) {
    if ($item['productId'] === $data['productId']) {
        $item['quantity'] = $quantity;
        $itemFound = true;
        break;
    }
}
unset($item);

if (!$itemFound) {
    $carts[$cartIndex]['items'][] = [
        'productId' => $data['productId'],
        'quantity' => $quantity
    ];
}

$carts[$cartIndex]['updatedAt'] = date('Y-m-d H:i:s');

writeJsonFile('carts.json', $carts);

sendResponse(true, ['cart' => $carts[$cartIndex]], 'Item added to cart.');
