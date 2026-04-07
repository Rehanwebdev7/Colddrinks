<?php
require_once __DIR__ . '/../../helpers/response.php';
require_once __DIR__ . '/../../helpers/auth.php';

// GET only
if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    sendResponse(false, null, 'Method not allowed', 405);
}

$authUser = requireAuth();

$carts = readJsonFile('carts.json');

// Find cart for this user
$userCart = [];
foreach ($carts as $cart) {
    if ($cart['userId'] === $authUser['id']) {
        $userCart = $cart['items'] ?? [];
        break;
    }
}

// Enrich cart items with current product data
$products = readJsonFile('products.json');
$productMap = [];
foreach ($products as $p) {
    $productMap[$p['id']] = $p;
}

$enrichedItems = [];
foreach ($userCart as $item) {
    $product = $productMap[$item['productId']] ?? null;
    if ($product) {
        $enrichedItems[] = [
            'productId' => $item['productId'],
            'name' => $product['name'],
            'price' => $product['price'],
            'image' => $product['image'] ?? '',
            'quantity' => $item['quantity'],
            'total' => $product['price'] * $item['quantity']
        ];
    }
}

sendResponse(true, ['items' => $enrichedItems], 'Cart fetched successfully.');
