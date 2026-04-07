<?php
require_once __DIR__ . '/../../helpers/response.php';
require_once __DIR__ . '/../../helpers/auth.php';

// GET only
if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    sendResponse(false, null, 'Method not allowed', 405);
}

$authUser = requireAuth();

$notifications = readJsonFile('notifications.json');

// Admin sees all; users see their own + broadcasts
if ($authUser['role'] !== 'admin') {
    $userId = $authUser['id'];
    $notifications = array_filter($notifications, function ($n) use ($userId) {
        return $n['targetUserId'] === $userId || $n['targetUserId'] === null;
    });
}

// Sort by newest first
usort($notifications, function ($a, $b) {
    return strtotime($b['createdAt'] ?? 0) - strtotime($a['createdAt'] ?? 0);
});

$notifications = array_values($notifications);

// Count unread
$unreadCount = 0;
foreach ($notifications as $n) {
    if (!$n['isRead']) $unreadCount++;
}

sendResponse(true, [
    'notifications' => $notifications,
    'unreadCount' => $unreadCount
], 'Notifications fetched successfully.');
