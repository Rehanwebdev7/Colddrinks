<?php
require_once __DIR__ . '/../../helpers/response.php';
require_once __DIR__ . '/../../helpers/auth.php';

// POST only
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendResponse(false, null, 'Method not allowed', 405);
}

$data = getInputData();

// Accept email or phone
$identifier = $data['email'] ?? $data['phone'] ?? null;
$password = $data['password'] ?? null;

if (!$identifier || !$password) {
    sendResponse(false, null, 'Email/phone and password are required.', 400);
}

// Find user
$users = readJsonFile('users.json');
$foundUser = null;

foreach ($users as $user) {
    if ($user['email'] === $identifier || $user['phone'] === $identifier) {
        $foundUser = $user;
        break;
    }
}

if (!$foundUser) {
    sendResponse(false, null, 'Invalid credentials.', 401);
}

// Verify password
if (!verifyPassword($password, $foundUser['password'])) {
    sendResponse(false, null, 'Invalid credentials.', 401);
}

// Generate JWT
$token = createJWT([
    'id' => $foundUser['id'],
    'email' => $foundUser['email'],
    'role' => $foundUser['role']
]);

// Return user data without password
$userData = $foundUser;
unset($userData['password']);

sendResponse(true, [
    'token' => $token,
    'user' => $userData
], 'Login successful.');
