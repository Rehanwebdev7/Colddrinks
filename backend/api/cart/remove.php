<?php
require_once __DIR__ . '/../../helpers/response.php';
require_once __DIR__ . '/../../helpers/auth.php';

// DELETE only
if ($_SERVER['REQUEST_METHOD'] !== 'DELETE') {
    sendResponse(false, null, 'Method not allowed', 405);
}

$authUser = requireAuth();

$data = getInputData();
$productId = $data['productId'] ?? $_GET['product_id'] ?? null;

if (!$productId) {
    sendResponse(false, null, 'Product id is required.', 400);
}

$carts = readJsonFile('carts.json');

$cartFound = false;
foreach ($carts as &$cart) {
    if ($cart['userId'] === $authUser['id']) {
        $initialCount = count($cart['items']);
        $cart['items'] = array_values(array_filter($cart['items'], function ($item) use ($productId) {
            return $item['productId'] !== $productId;
        }));

        if (count($cart['items']) === $initialCount) {
            sendResponse(false, null, 'Item not found in cart.', 404);
        }

        $cart['updatedAt'] = date('Y-m-d H:i:s');
        $cartFound = true;
        break;
    }
}
unset($cart);

if (!$cartFound) {
    sendResponse(false, null, 'Cart not found.', 404);
}

writeJsonFile('carts.json', $carts);

sendResponse(true, null, 'Item removed from cart.');
