<?php
require_once __DIR__ . '/../../helpers/response.php';
require_once __DIR__ . '/../../helpers/auth.php';

// GET only
if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    sendResponse(false, null, 'Method not allowed', 405);
}

$billId = $_GET['id'] ?? null;

if (!$billId) {
    sendResponse(false, null, 'Bill id is required.', 400);
}

$bills = readJsonFile('bills.json');
$bill = null;

foreach ($bills as $b) {
    if ($b['id'] === $billId) {
        $bill = $b;
        break;
    }
}

if (!$bill) {
    sendResponse(false, null, 'Bill not found.', 404);
}

// Generate simple HTML invoice
$itemsHtml = '';
foreach ($bill['items'] as $item) {
    $itemsHtml .= "<tr>
        <td>{$item['name']}</td>
        <td>{$item['quantity']}</td>
        <td>₹{$item['price']}</td>
        <td>₹{$item['total']}</td>
    </tr>";
}

$html = "<!DOCTYPE html>
<html>
<head>
    <title>Invoice - {$bill['billNumber']}</title>
    <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
        .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 10px; }
        .header h1 { color: #2563eb; margin: 0; }
        .info { display: flex; justify-content: space-between; margin: 20px 0; }
        .info div { flex: 1; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background-color: #f3f4f6; }
        .totals { text-align: right; margin-top: 20px; }
        .totals p { margin: 5px 0; }
        .total-final { font-size: 1.2em; font-weight: bold; color: #2563eb; }
        .footer { text-align: center; margin-top: 40px; color: #666; font-size: 0.9em; }
    </style>
</head>
<body>
    <div class='header'>
        <h1>Cold Drinks Shop</h1>
        <p>Invoice / Bill</p>
    </div>
    <div class='info'>
        <div>
            <h3>Bill To:</h3>
            <p><strong>{$bill['customer']['name']}</strong></p>
            <p>{$bill['customer']['email']}</p>
            <p>{$bill['customer']['phone']}</p>
            <p>{$bill['customer']['address']}</p>
        </div>
        <div style='text-align: right;'>
            <p><strong>Bill #:</strong> {$bill['billNumber']}</p>
            <p><strong>Order #:</strong> {$bill['orderNumber']}</p>
            <p><strong>Date:</strong> {$bill['generatedAt']}</p>
            <p><strong>Payment:</strong> {$bill['paymentMethod']}</p>
        </div>
    </div>
    <table>
        <thead>
            <tr><th>Item</th><th>Qty</th><th>Price</th><th>Total</th></tr>
        </thead>
        <tbody>
            {$itemsHtml}
        </tbody>
    </table>
    <div class='totals'>
        <p>Subtotal: ₹{$bill['subtotal']}</p>
        <p>Tax (18% GST): ₹{$bill['tax']}</p>
        <p class='total-final'>Total: ₹{$bill['total']}</p>
    </div>
    <div class='footer'>
        <p>Thank you for your business!</p>
        <p>Cold Drinks Shop - Refreshing your day, every day.</p>
    </div>
</body>
</html>";

// Return bill data along with HTML for rendering
sendResponse(true, [
    'bill' => $bill,
    'invoiceHtml' => $html
], 'Bill fetched successfully.');
