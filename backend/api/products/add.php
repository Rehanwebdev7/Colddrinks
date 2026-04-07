<?php
require_once __DIR__ . '/../../helpers/response.php';
require_once __DIR__ . '/../../helpers/auth.php';

// POST only
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendResponse(false, null, 'Method not allowed', 405);
}

requireAdmin();

$data = getInputData();

// Validate required fields
$required = ['name', 'price', 'category'];
foreach ($required as $field) {
    if (empty($data[$field])) {
        sendResponse(false, null, "Field '$field' is required.", 400);
    }
}

$products = readJsonFile('products.json');

$newProduct = [
    'id' => generateId(),
    'name' => $data['name'],
    'description' => $data['description'] ?? '',
    'price' => (float) $data['price'],
    'originalPrice' => (float) ($data['originalPrice'] ?? $data['price']),
    'category' => $data['category'],
    'image' => $data['image'] ?? '/images/default-drink.png',
    'stock' => (int) ($data['stock'] ?? 0),
    'unit' => $data['unit'] ?? 'piece',
    'status' => $data['status'] ?? 'active',
    'badge' => $data['badge'] ?? null,
    'rating' => (float) ($data['rating'] ?? 0),
    'reviewCount' => 0,
    'createdAt' => date('Y-m-d H:i:s'),
    'updatedAt' => date('Y-m-d H:i:s')
];

$products[] = $newProduct;
writeJsonFile('products.json', $products);

sendResponse(true, ['product' => $newProduct], 'Product added successfully.', 201);
