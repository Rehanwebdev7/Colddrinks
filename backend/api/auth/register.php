<?php
require_once __DIR__ . '/../../helpers/response.php';
require_once __DIR__ . '/../../helpers/auth.php';

// POST only
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendResponse(false, null, 'Method not allowed', 405);
}

$data = getInputData();

// Validate required fields
$required = ['name', 'email', 'phone', 'password'];
foreach ($required as $field) {
    if (empty($data[$field])) {
        sendResponse(false, null, "Field '$field' is required.", 400);
    }
}

// Validate email format
if (!filter_var($data['email'], FILTER_VALIDATE_EMAIL)) {
    sendResponse(false, null, 'Invalid email format.', 400);
}

// Validate password length
if (strlen($data['password']) < 6) {
    sendResponse(false, null, 'Password must be at least 6 characters.', 400);
}

// Read existing users
$users = readJsonFile('users.json');

// Check duplicate email
foreach ($users as $user) {
    if ($user['email'] === $data['email']) {
        sendResponse(false, null, 'Email already registered.', 409);
    }
    if ($user['phone'] === $data['phone']) {
        sendResponse(false, null, 'Phone number already registered.', 409);
    }
}

// Create new user
$newUser = [
    'id' => generateId(),
    'name' => $data['name'],
    'email' => $data['email'],
    'phone' => $data['phone'],
    'password' => hashPassword($data['password']),
    'address' => $data['address'] ?? '',
    'role' => 'customer',
    'fcmToken' => $data['fcmToken'] ?? null,
    'createdAt' => date('Y-m-d H:i:s'),
    'updatedAt' => date('Y-m-d H:i:s')
];

$users[] = $newUser;
writeJsonFile('users.json', $users);

// Generate JWT
$token = createJWT([
    'id' => $newUser['id'],
    'email' => $newUser['email'],
    'role' => $newUser['role']
]);

// Return user data without password
$userData = $newUser;
unset($userData['password']);

sendResponse(true, [
    'token' => $token,
    'user' => $userData
], 'Registration successful.', 201);
