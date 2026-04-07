<?php
require_once __DIR__ . '/../../helpers/response.php';
require_once __DIR__ . '/../../helpers/auth.php';

// PUT only
if ($_SERVER['REQUEST_METHOD'] !== 'PUT') {
    sendResponse(false, null, 'Method not allowed', 405);
}

requireAdmin();

$data = getInputData();

if (empty($data['id'])) {
    sendResponse(false, null, 'Product id is required.', 400);
}

$products = readJsonFile('products.json');
$found = false;

foreach ($products as &$product) {
    if ($product['id'] === $data['id']) {
        // Update only provided fields
        $updatable = ['name', 'description', 'price', 'originalPrice', 'category', 'image', 'stock', 'unit', 'status', 'badge', 'rating'];
        foreach ($updatable as $field) {
            if (isset($data[$field])) {
                $product[$field] = $data[$field];
            }
        }
        // Cast numeric fields
        if (isset($data['price'])) $product['price'] = (float) $product['price'];
        if (isset($data['originalPrice'])) $product['originalPrice'] = (float) $product['originalPrice'];
        if (isset($data['stock'])) $product['stock'] = (int) $product['stock'];
        if (isset($data['rating'])) $product['rating'] = (float) $product['rating'];

        $product['updatedAt'] = date('Y-m-d H:i:s');
        $found = true;
        $updatedProduct = $product;
        break;
    }
}
unset($product);

if (!$found) {
    sendResponse(false, null, 'Product not found.', 404);
}

writeJsonFile('products.json', $products);

sendResponse(true, ['product' => $updatedProduct], 'Product updated successfully.');
