<?php

declare(strict_types=1);

date_default_timezone_set('UTC');

$baseDir = __DIR__;
$indexFile = $baseDir . DIRECTORY_SEPARATOR . 'index.html';
$styleFile = $baseDir . DIRECTORY_SEPARATOR . 'style.css';
$assetsDir = $baseDir . DIRECTORY_SEPARATOR . 'assets';
$configuredDataRoot = envValue('WEB_NOTE_DATA_ROOT');
$defaultDataRoot = dirname($baseDir) . DIRECTORY_SEPARATOR . 'web-notebook-data' . DIRECTORY_SEPARATOR . 'pages';
$dataRoot = $configuredDataRoot !== false && $configuredDataRoot !== ''
    ? rtrim($configuredDataRoot, "/\\")
    : $defaultDataRoot;
$accessPassword = envValue('WEB_NOTE_ACCESS_PASSWORD');
$accessPasswordHash = envValue('WEB_NOTE_ACCESS_PASSWORD_HASH');
$authCookieName = 'web_note_auth';
$authCookieLifetime = 60 * 60 * 24 * 30;

$reservedPageIds = ['api'];
$maxRequestBytes = 1024 * 1024;
$maxHistoryEntries = 1000;
$maxRevisionFiles = 500;

require_once __DIR__ . '/lib/http.php';
require_once __DIR__ . '/lib/auth.php';
require_once __DIR__ . '/lib/data.php';

$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');

route($path, $method);

function envValue(string $name): string|false
{
    $value = getenv($name);
    if ($value !== false && $value !== '') {
        return $value;
    }

    if (isset($_SERVER[$name]) && is_string($_SERVER[$name]) && $_SERVER[$name] !== '') {
        return $_SERVER[$name];
    }

    if (isset($_ENV[$name]) && is_string($_ENV[$name]) && $_ENV[$name] !== '') {
        return $_ENV[$name];
    }

    return false;
}

function route(string $path, string $method): void
{
    global $indexFile, $styleFile, $assetsDir;

    if ($path === '/auth/login') {
        if ($method !== 'POST') {
            sendJson(405, ['detail' => 'Method not allowed']);
        }
        handleLogin();
    }

    if ($path === '/auth/logout') {
        if ($method !== 'POST') {
            sendJson(405, ['detail' => 'Method not allowed']);
        }
        handleLogout();
    }

    if ($path === '/') {
        if (isAccessControlEnabled() && !hasValidAccessCookie()) {
            renderLoginPage('/');
        }
        redirect('/' . randomPageId(8));
    }

    if ($path === '/style.css') {
        serveStaticFile($styleFile, 'text/css; charset=UTF-8');
    }

    if (str_starts_with($path, '/assets/')) {
        $realAssetsDir = realpath($assetsDir);
        if ($realAssetsDir === false) {
            sendJson(404, ['detail' => 'Asset not found']);
        }
        $candidate = $realAssetsDir . '/' . ltrim(substr($path, strlen('/assets')), '/');
        $realCandidate = realpath($candidate);
        if (
            $realCandidate === false
            || !is_file($realCandidate)
            || !str_starts_with($realCandidate, $realAssetsDir . DIRECTORY_SEPARATOR)
        ) {
            sendJson(404, ['detail' => 'Asset not found']);
        }
        $ext = strtolower(pathinfo($realCandidate, PATHINFO_EXTENSION));
        $mime = match ($ext) {
            'js' => 'application/javascript; charset=UTF-8',
            'css' => 'text/css; charset=UTF-8',
            default => 'application/octet-stream',
        };
        serveStaticFile($realCandidate, $mime);
    }

    if (preg_match('#^/data(?:/.*)?$#', $path)) {
        sendJson(404, ['detail' => 'Page not found']);
    }

    enforceAccessControl($path);

    if ($path === '/api/pages') {
        if ($method !== 'GET') {
            sendJson(405, ['detail' => 'Method not allowed']);
        }
        listPages();
    }

    if (preg_match('#^/api/pages/([A-Za-z0-9]{1,32})$#', $path, $match)) {
        $pageId = $match[1];
        assertValidPageId($pageId);
        if ($method !== 'GET') {
            sendJson(405, ['detail' => 'Method not allowed']);
        }
        getPageData($pageId);
    }

    if (preg_match('#^/api/pages/([A-Za-z0-9]{1,32})/save$#', $path, $match)) {
        $pageId = $match[1];
        assertValidPageId($pageId);
        if ($method !== 'POST') {
            sendJson(405, ['detail' => 'Method not allowed']);
        }
        savePage($pageId);
    }

    if (preg_match('#^/api/pages/([A-Za-z0-9]{1,32})/delete$#', $path, $match)) {
        $pageId = $match[1];
        assertValidPageId($pageId);
        if ($method !== 'POST') {
            sendJson(405, ['detail' => 'Method not allowed']);
        }
        deletePage($pageId);
    }

    if (preg_match('#^/([A-Za-z0-9]{1,32})$#', $path, $match)) {
        $pageId = $match[1];
        assertValidPageId($pageId);
        serveStaticFile($indexFile, 'text/html; charset=UTF-8');
    }

    sendJson(404, ['detail' => 'Page not found']);
}

function assertValidPageId(string $pageId): void
{
    global $reservedPageIds;
    if (!preg_match('/^[A-Za-z0-9]{1,32}$/', $pageId)) {
        sendJson(404, ['detail' => 'Page not found']);
    }

    if (in_array(strtolower($pageId), $reservedPageIds, true)) {
        sendJson(404, ['detail' => 'Page not found']);
    }
}

function randomPageId(int $length): string
{
    $alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
    $result = '';
    for ($i = 0; $i < $length; $i++) {
        $result .= $alphabet[random_int(0, strlen($alphabet) - 1)];
    }
    return $result;
}
