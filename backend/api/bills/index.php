<?php
require_once __DIR__ . '/../../helpers/response.php';
require_once __DIR__ . '/../../helpers/auth.php';

// GET only
if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    sendResponse(false, null, 'Method not allowed', 405);
}

requireAdmin();

$bills = readJsonFile('bills.json');

// Sort by newest first
usort($bills, function ($a, $b) {
    return strtotime($b['generatedAt'] ?? 0) - strtotime($a['generatedAt'] ?? 0);
});

sendResponse(true, ['bills' => $bills], 'Bills fetched successfully.');
