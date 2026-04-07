<?php
// JWT Authentication Helper
// Simple JWT implementation without external dependencies

define('JWT_SECRET', 'cold_drinks_shop_secret_key_2024');
define('JWT_EXPIRY', 86400 * 7); // 7 days

function base64UrlEncode($data) {
    return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}

function base64UrlDecode($data) {
    return base64_decode(strtr($data, '-_', '+/'));
}

function createJWT($payload) {
    $header = json_encode(['typ' => 'JWT', 'alg' => 'HS256']);
    $payload['iat'] = time();
    $payload['exp'] = time() + JWT_EXPIRY;
    $payloadJson = json_encode($payload);

    $base64Header = base64UrlEncode($header);
    $base64Payload = base64UrlEncode($payloadJson);

    $signature = hash_hmac('sha256', "$base64Header.$base64Payload", JWT_SECRET, true);
    $base64Signature = base64UrlEncode($signature);

    return "$base64Header.$base64Payload.$base64Signature";
}

function verifyJWT($token) {
    $parts = explode('.', $token);
    if (count($parts) !== 3) return null;

    [$base64Header, $base64Payload, $base64Signature] = $parts;

    $signature = hash_hmac('sha256', "$base64Header.$base64Payload", JWT_SECRET, true);
    $expectedSignature = base64UrlEncode($signature);

    if (!hash_equals($expectedSignature, $base64Signature)) return null;

    $payload = json_decode(base64UrlDecode($base64Payload), true);
    if (!$payload || (isset($payload['exp']) && $payload['exp'] < time())) return null;

    return $payload;
}

function getAuthUser() {
    $headers = getallheaders();
    $authHeader = $headers['Authorization'] ?? $headers['authorization'] ?? '';

    if (!preg_match('/Bearer\s+(.+)/', $authHeader, $matches)) {
        return null;
    }

    return verifyJWT($matches[1]);
}

function requireAuth() {
    $user = getAuthUser();
    if (!$user) {
        sendResponse(false, null, 'Unauthorized. Please login.', 401);
    }
    return $user;
}

function requireAdmin() {
    $user = requireAuth();
    if ($user['role'] !== 'admin') {
        sendResponse(false, null, 'Admin access required.', 403);
    }
    return $user;
}

function hashPassword($password) {
    return password_hash($password, PASSWORD_BCRYPT);
}

function verifyPassword($password, $hash) {
    return password_verify($password, $hash);
}
