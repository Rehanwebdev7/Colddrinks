<?php
require_once __DIR__ . '/../../helpers/response.php';
require_once __DIR__ . '/../../helpers/auth.php';

// GET only
if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    sendResponse(false, null, 'Method not allowed', 405);
}

$authUser = requireAuth();

// Fetch full user data from database
$users = readJsonFile('users.json');
$userData = null;

foreach ($users as $user) {
    if ($user['id'] === $authUser['id']) {
        $userData = $user;
        break;
    }
}

if (!$userData) {
    sendResponse(false, null, 'User not found.', 404);
}

unset($userData['password']);

sendResponse(true, ['user' => $userData], 'Token is valid.');
