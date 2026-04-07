<?php
require_once __DIR__ . '/../../helpers/response.php';
require_once __DIR__ . '/../../helpers/auth.php';
require_once __DIR__ . '/../../helpers/firebase.php';

// POST only
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendResponse(false, null, 'Method not allowed', 405);
}

requireAdmin();

$data = getInputData();

if (empty($data['title']) || empty($data['message'])) {
    sendResponse(false, null, 'Title and message are required.', 400);
}

$targetUserId = $data['targetUserId'] ?? null;
$type = $targetUserId ? 'direct' : 'broadcast';

// If targeting a specific user, verify they exist
if ($targetUserId) {
    $users = readJsonFile('users.json');
    $userExists = false;
    foreach ($users as $user) {
        if ($user['id'] === $targetUserId) {
            $userExists = true;
            break;
        }
    }
    if (!$userExists) {
        sendResponse(false, null, 'Target user not found.', 404);
    }
}

saveNotification($data['title'], $data['message'], $targetUserId, $type);

sendResponse(true, null, 'Notification sent successfully.', 201);
