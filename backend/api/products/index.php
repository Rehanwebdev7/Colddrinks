<?php
require_once __DIR__ . '/../../helpers/response.php';
require_once __DIR__ . '/../../helpers/auth.php';

// GET only
if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    sendResponse(false, null, 'Method not allowed', 405);
}

$products = readJsonFile('products.json');

// Filter by category
if (!empty($_GET['category'])) {
    $category = $_GET['category'];
    $products = array_filter($products, function ($p) use ($category) {
        return strtolower($p['category']) === strtolower($category);
    });
}

// Filter by search term
if (!empty($_GET['search'])) {
    $search = strtolower($_GET['search']);
    $products = array_filter($products, function ($p) use ($search) {
        return strpos(strtolower($p['name']), $search) !== false
            || strpos(strtolower($p['description'] ?? ''), $search) !== false;
    });
}

// Filter by status
if (!empty($_GET['status'])) {
    $status = $_GET['status'];
    $products = array_filter($products, function ($p) use ($status) {
        return ($p['status'] ?? 'active') === $status;
    });
}

// Re-index array
$products = array_values($products);

sendResponse(true, ['products' => $products], 'Products fetched successfully.');
