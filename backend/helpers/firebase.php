<?php
// Firebase Cloud Messaging Helper
// Replace SERVER_KEY with your actual Firebase server key

define('FCM_SERVER_KEY', 'YOUR_FCM_SERVER_KEY_HERE');
define('FCM_URL', 'https://fcm.googleapis.com/fcm/send');

function sendFCMNotification($token, $title, $body, $data = []) {
    if (FCM_SERVER_KEY === 'YOUR_FCM_SERVER_KEY_HERE') {
        // FCM not configured, log and skip
        saveNotification($title, $body, $data['targetUserId'] ?? null, $data['type'] ?? 'general');
        return true;
    }

    $payload = [
        'to' => $token,
        'notification' => [
            'title' => $title,
            'body' => $body,
            'icon' => '/logo.png',
            'click_action' => $data['url'] ?? '/'
        ],
        'data' => $data
    ];

    $headers = [
        'Authorization: key=' . FCM_SERVER_KEY,
        'Content-Type: application/json'
    ];

    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, FCM_URL);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);

    $result = curl_exec($ch);
    curl_close($ch);

    saveNotification($title, $body, $data['targetUserId'] ?? null, $data['type'] ?? 'general');

    return json_decode($result, true);
}

function sendFCMToAll($title, $body, $data = []) {
    $users = readJsonFile('users.json');
    foreach ($users as $user) {
        if (!empty($user['fcmToken'])) {
            sendFCMNotification($user['fcmToken'], $title, $body, $data);
        }
    }
    saveNotification($title, $body, null, $data['type'] ?? 'broadcast');
}

function saveNotification($title, $body, $targetUserId = null, $type = 'general') {
    $notifications = readJsonFile('notifications.json');
    $notifications[] = [
        'id' => generateId(),
        'type' => $type,
        'title' => $title,
        'message' => $body,
        'targetUserId' => $targetUserId,
        'isRead' => false,
        'createdAt' => date('Y-m-d H:i:s')
    ];
    writeJsonFile('notifications.json', $notifications);
}
