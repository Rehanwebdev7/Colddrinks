<?php
// Standardized JSON response helper
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

function sendResponse($success, $data = null, $message = '', $code = 200) {
    http_response_code($code);
    echo json_encode([
        'success' => $success,
        'data' => $data,
        'message' => $message
    ]);
    exit();
}

function getInputData() {
    $json = file_get_contents('php://input');
    $data = json_decode($json, true);
    if (!$data) {
        $data = $_POST;
    }
    return $data;
}

function getDbPath($file) {
    return __DIR__ . '/../database/' . $file;
}

function readJsonFile($file) {
    $path = getDbPath($file);
    if (!file_exists($path)) {
        file_put_contents($path, json_encode([]));
        return [];
    }
    $content = file_get_contents($path);
    return json_decode($content, true) ?: [];
}

function writeJsonFile($file, $data) {
    $path = getDbPath($file);
    file_put_contents($path, json_encode($data, JSON_PRETTY_PRINT));
}

function generateId() {
    return uniqid() . bin2hex(random_bytes(4));
}
