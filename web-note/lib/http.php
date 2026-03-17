<?php

declare(strict_types=1);

function redirect(string $location): void
{
    http_response_code(307);
    header('Location: ' . $location);
    exit;
}

function serveStaticFile(string $filePath, string $contentType): void
{
    if (!is_file($filePath)) {
        sendJson(404, ['detail' => 'Resource not found']);
    }

    header('Content-Type: ' . $contentType);
    readfile($filePath);
    exit;
}

function sendJson(int $status, array $payload): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=UTF-8');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}
