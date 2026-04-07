<?php
require_once __DIR__ . '/../../helpers/response.php';
require_once __DIR__ . '/../../helpers/auth.php';

// POST only
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendResponse(false, null, 'Method not allowed', 405);
}

$authUser = requireAuth();

$data = getInputData();

$notificationId = $data['id'] ?? null;

if (!$notificationId) {
    sendResponse(false, null, 'Notification id is required.', 400);
}

$notifications = readJsonFile('notifications.json');
$found = false;

foreach ($notifications as &$notification) {
    if ($notification['id'] === $notificationId) {
        // Verify ownership (admin can mark any, user can mark their own or broadcasts)
        if ($authUser['role'] !== 'admin'
            && $notification['targetUserId'] !== null
            && $notification['targetUserId'] !== $authUser['id']) {
            sendResponse(false, null, 'Access denied.', 403);
        }

        $notification['isRead'] = true;
        $found = true;
        break;
    }
}
unset($notification);

if (!$found) {
    sendResponse(false, null, 'Notification not found.', 404);
}

writeJsonFile('notifications.json', $notifications);

sendResponse(true, null, 'Notification marked as read.');
