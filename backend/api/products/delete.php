<?php
require_once __DIR__ . '/../../helpers/response.php';
require_once __DIR__ . '/../../helpers/auth.php';

// DELETE only
if ($_SERVER['REQUEST_METHOD'] !== 'DELETE') {
    sendResponse(false, null, 'Method not allowed', 405);
}

requireAdmin();

$data = getInputData();

// Also check query param
$productId = $data['id'] ?? $_GET['id'] ?? null;

if (!$productId) {
    sendResponse(false, null, 'Product id is required.', 400);
}

$products = readJsonFile('products.json');
$initialCount = count($products);

$products = array_filter($products, function ($p) use ($productId) {
    return $p['id'] !== $productId;
});

$products = array_values($products);

if (count($products) === $initialCount) {
    sendResponse(false, null, 'Product not found.', 404);
}

writeJsonFile('products.json', $products);

sendResponse(true, null, 'Product deleted successfully.');
