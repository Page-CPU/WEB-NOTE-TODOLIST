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

    // 为 PHP 内置开发服务器提供 assets/ 静态文件服务。
    // Apache/Nginx 环境下 .htaccess 已直接处理真实文件，此分支不会触发。
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
        $mime = match($ext) {
            'js'  => 'application/javascript; charset=UTF-8',
            'css' => 'text/css; charset=UTF-8',
            default => 'application/octet-stream',
        };
        serveStaticFile($realCandidate, $mime);
    }

    if (preg_match('#^/data(?:/.*)?$#', $path)) {
        sendJson(404, ['detail' => 'Page not found']);
    }

    enforceAccessControl($path);

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

function redirect(string $location): void
{
    http_response_code(307);
    header('Location: ' . $location);
    exit;
}

function isAccessControlEnabled(): bool
{
    global $accessPassword, $accessPasswordHash;
    return ($accessPassword !== false && $accessPassword !== '')
        || ($accessPasswordHash !== false && $accessPasswordHash !== '');
}

function authCookieValue(): string
{
    global $accessPassword, $accessPasswordHash;

    $secret = $accessPasswordHash !== false && $accessPasswordHash !== ''
        ? $accessPasswordHash
        : hash('sha256', (string) $accessPassword);

    return hash_hmac('sha256', 'web-note-auth', $secret);
}

function hasValidAccessCookie(): bool
{
    global $authCookieName;

    if (!isAccessControlEnabled()) {
        return true;
    }

    $cookie = $_COOKIE[$authCookieName] ?? '';
    return is_string($cookie) && hash_equals(authCookieValue(), $cookie);
}

function issueAccessCookie(): void
{
    global $authCookieName, $authCookieLifetime;

    $secure = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';
    setcookie($authCookieName, authCookieValue(), [
        'expires' => time() + $authCookieLifetime,
        'path' => '/',
        'secure' => $secure,
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
}

function clearAccessCookie(): void
{
    global $authCookieName;

    $secure = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';
    setcookie($authCookieName, '', [
        'expires' => time() - 3600,
        'path' => '/',
        'secure' => $secure,
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
}

function validateAccessPassword(string $password): bool
{
    global $accessPassword, $accessPasswordHash;

    if ($accessPasswordHash !== false && $accessPasswordHash !== '') {
        return password_verify($password, $accessPasswordHash);
    }

    if ($accessPassword !== false && $accessPassword !== '') {
        return hash_equals((string) $accessPassword, $password);
    }

    return true;
}

function sanitizeRedirectPath(string $path): string
{
    if (!is_string($path) || $path === '' || $path[0] !== '/') {
        return '/';
    }

    if (preg_match('#^//+#', $path)) {
        return '/';
    }

    return $path;
}

function enforceAccessControl(string $path): void
{
    if (!isAccessControlEnabled() || hasValidAccessCookie()) {
        return;
    }

    if (preg_match('#^/api/#', $path)) {
        sendJson(401, ['detail' => 'Authentication required']);
    }

    renderLoginPage($path);
}

function handleLogin(): void
{
    $password = isset($_POST['password']) ? (string) $_POST['password'] : '';
    $redirectPath = sanitizeRedirectPath((string) ($_POST['redirect'] ?? '/'));

    if (!validateAccessPassword($password)) {
        renderLoginPage($redirectPath, '密码错误，请重试。', 401);
    }

    issueAccessCookie();
    redirect($redirectPath);
}

function handleLogout(): void
{
    $redirectPath = sanitizeRedirectPath((string) ($_POST['redirect'] ?? '/'));
    clearAccessCookie();
    redirect($redirectPath);
}

function renderLoginPage(string $redirectPath, ?string $error = null, int $status = 200): void
{
    $safeRedirect = htmlspecialchars(sanitizeRedirectPath($redirectPath), ENT_QUOTES, 'UTF-8');
    $errorHtml = $error !== null
        ? '<p class="login-error">' . htmlspecialchars($error, ENT_QUOTES, 'UTF-8') . '</p>'
        : '';

    http_response_code($status);
    header('Content-Type: text/html; charset=UTF-8');
    header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

    echo '<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>A Note 登录</title>
  <style>
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background: linear-gradient(135deg, #f3f6fb 0%, #e8eef8 100%);
      font-family: "Noto Sans SC", system-ui, sans-serif;
      color: #172033;
    }
    .login-card {
      width: min(92vw, 420px);
      padding: 28px;
      border-radius: 24px;
      background: rgba(255, 255, 255, 0.92);
      box-shadow: 0 20px 60px rgba(16, 26, 43, 0.12);
      border: 1px solid rgba(23, 32, 51, 0.08);
    }
    .login-kicker {
      margin: 0 0 10px;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: #167c78;
    }
    h1 {
      margin: 0;
      font-size: 30px;
      line-height: 1.1;
    }
    .login-desc {
      margin: 12px 0 20px;
      color: #66758f;
      font-size: 14px;
      line-height: 1.6;
    }
    .login-error {
      margin: 0 0 12px;
      padding: 10px 12px;
      border-radius: 12px;
      background: rgba(198, 91, 73, 0.08);
      color: #b14c3c;
      font-size: 13px;
    }
    label {
      display: block;
      margin-bottom: 8px;
      font-size: 13px;
      font-weight: 700;
      color: #4a5972;
    }
    input {
      width: 100%;
      height: 48px;
      padding: 0 14px;
      border: 1px solid rgba(23, 32, 51, 0.12);
      border-radius: 14px;
      font-size: 15px;
      outline: none;
    }
    input:focus {
      border-color: rgba(22, 124, 120, 0.42);
      box-shadow: 0 0 0 4px rgba(22, 124, 120, 0.1);
    }
    button {
      width: 100%;
      height: 48px;
      margin-top: 16px;
      border: 0;
      border-radius: 14px;
      background: linear-gradient(135deg, #167c78 0%, #2d9890 100%);
      color: #fff;
      font-size: 15px;
      font-weight: 700;
      cursor: pointer;
    }
    .login-hint {
      margin-top: 12px;
      font-size: 12px;
      color: #66758f;
      text-align: center;
    }
  </style>
</head>
<body>
  <main class="login-card">
    <p class="login-kicker">Protected Workspace</p>
    <h1>A Note</h1>
    <p class="login-desc">输入访问密码后可继续使用。浏览器会记住登录状态 30 天。</p>
    ' . $errorHtml . '
    <form method="post" action="/auth/login">
      <input type="hidden" name="redirect" value="' . $safeRedirect . '">
      <label for="password">访问密码</label>
      <input id="password" name="password" type="password" autocomplete="current-password" required autofocus>
      <button type="submit">进入工作台</button>
    </form>
    <p class="login-hint">如需退出，可清除浏览器 Cookie 或后续接入退出按钮。</p>
  </main>
</body>
</html>';
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

function pageDir(string $pageId): string
{
    global $dataRoot;
    return $dataRoot . DIRECTORY_SEPARATOR . $pageId;
}

function currentFile(string $pageId): string
{
    return pageDir($pageId) . DIRECTORY_SEPARATOR . 'current.json';
}

function historyFile(string $pageId): string
{
    return pageDir($pageId) . DIRECTORY_SEPARATOR . 'history.jsonl';
}

function revisionsDir(string $pageId): string
{
    return pageDir($pageId) . DIRECTORY_SEPARATOR . 'revisions';
}

function readJsonFile(string $path, array $fallback): array
{
    if (!is_file($path)) {
        return $fallback;
    }

    $raw = @file_get_contents($path);
    if ($raw === false) {
        throw new RuntimeException('Cannot read stored page data');
    }

    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) {
        throw new RuntimeException('Stored page data is corrupted');
    }

    return $decoded;
}

function normalizePayload(array $payload): array
{
    $note = isset($payload['note']) ? (string) $payload['note'] : '';
    $todosRaw = isset($payload['todos']) && is_array($payload['todos']) ? $payload['todos'] : [];

    $todos = [];
    foreach ($todosRaw as $item) {
        if (!is_array($item)) {
            continue;
        }

        $text = trim((string) ($item['text'] ?? ''));
        if ($text === '') {
            continue;
        }

        $updatedAt = normalizeTodoTimestamp($item['updated_at'] ?? null, gmdate(DateTimeInterface::ATOM));
        $createdAt = normalizeTodoTimestamp($item['created_at'] ?? null, $updatedAt);

        $todos[] = [
            'id' => (string) ($item['id'] ?? uniqid('', true)),
            'text' => $text,
            'done' => (bool) ($item['done'] ?? false),
            'urgency' => normalizeUrgency($item['urgency'] ?? 'normal'),
            'importance' => normalizeImportance($item['importance'] ?? 'important'),
            'created_at' => $createdAt,
            'updated_at' => $updatedAt,
        ];
    }

    return [
        'note' => $note,
        'todos' => $todos,
    ];
}

function normalizeUrgency($value): string
{
    $urgency = strtolower(trim((string) $value));
    $allowed = ['low', 'normal', 'high', 'critical'];

    return in_array($urgency, $allowed, true) ? $urgency : 'normal';
}

function normalizeImportance($value): string
{
    $importance = strtolower(trim((string) $value));
    $allowed = ['important', 'supporting'];

    return in_array($importance, $allowed, true) ? $importance : 'important';
}

function normalizeTodoTimestamp($value, ?string $fallback = null): ?string
{
    if (!is_string($value) || trim($value) === '') {
        return $fallback;
    }

    try {
        return (new DateTimeImmutable($value))
            ->setTimezone(new DateTimeZone('UTC'))
            ->format(DateTimeInterface::ATOM);
    } catch (Exception) {
        return $fallback;
    }
}

function canonicalJson(array $data): string
{
    $safeTodos = [];
    foreach ($data['todos'] ?? [] as $todo) {
        $safeTodos[] = [
            'id' => (string) ($todo['id'] ?? ''),
            'text' => (string) ($todo['text'] ?? ''),
            'done' => (bool) ($todo['done'] ?? false),
            'urgency' => normalizeUrgency($todo['urgency'] ?? 'normal'),
            'importance' => normalizeImportance($todo['importance'] ?? 'important'),
            'created_at' => normalizeTodoTimestamp($todo['created_at'] ?? null, ''),
            'updated_at' => normalizeTodoTimestamp($todo['updated_at'] ?? null, ''),
        ];
    }

    $safe = [
        'note' => (string) ($data['note'] ?? ''),
        'todos' => $safeTodos,
    ];

    return json_encode($safe, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}

function hashData(array $data): string
{
    return hash('sha256', canonicalJson($data));
}

function isEmptyPage(array $data): bool
{
    $note = trim((string) ($data['note'] ?? ''));
    $todos = is_array($data['todos'] ?? null) ? $data['todos'] : [];
    return $note === '' && count($todos) === 0;
}

function getPageData(string $pageId): void
{
    $currentPath = currentFile($pageId);
    $exists = is_file($currentPath);
    try {
        $data = readJsonFile($currentPath, ['note' => '', 'todos' => []]);
    } catch (RuntimeException $exception) {
        sendJson(500, ['detail' => $exception->getMessage()]);
    }
    $lastModified = null;

    if ($exists) {
        $timestamp = @filemtime($currentPath);
        if ($timestamp !== false) {
            $lastModified = gmdate(DateTimeInterface::ATOM, $timestamp);
        }
    }

    sendJson(200, [
        'page_id' => $pageId,
        'exists' => $exists,
        'note' => (string) ($data['note'] ?? ''),
        'todos' => is_array($data['todos'] ?? null) ? $data['todos'] : [],
        'last_modified' => $lastModified,
    ]);
}

function savePage(string $pageId): void
{
    global $maxRequestBytes;

    $contentLength = isset($_SERVER['CONTENT_LENGTH']) ? (int) $_SERVER['CONTENT_LENGTH'] : 0;
    if ($contentLength > $maxRequestBytes) {
        sendJson(413, ['detail' => 'Request body too large']);
    }

    $rawBody = file_get_contents('php://input');
    if ($rawBody === false) {
        sendJson(400, ['detail' => 'Cannot read request body']);
    }

    if (strlen($rawBody) > $maxRequestBytes) {
        sendJson(413, ['detail' => 'Request body too large']);
    }

    $payload = json_decode($rawBody === '' ? '{}' : $rawBody, true);

    if (!is_array($payload)) {
        sendJson(422, ['detail' => 'Invalid JSON body']);
    }

    $normalized = normalizePayload($payload);
    $result = savePageData($pageId, $normalized);

    sendJson(200, array_merge(['page_id' => $pageId], $result));
}

function savePageData(string $pageId, array $normalized): array
{
    global $maxHistoryEntries, $maxRevisionFiles;

    $dirPath = pageDir($pageId);
    $currentPath = currentFile($pageId);
    $historyPath = historyFile($pageId);

    $lockHandle = acquirePageLock($pageId);

    try {
        try {
            $existing = readJsonFile($currentPath, ['note' => '', 'todos' => []]);
        } catch (RuntimeException $exception) {
            sendJson(409, ['detail' => 'Stored page data is corrupted; save blocked until data is repaired']);
        }
        $newHash = hashData($normalized);
        $oldHash = hashData($existing);

        if (!is_dir($dirPath) && isEmptyPage($normalized)) {
            return ['saved' => false, 'history_recorded' => false, 'reason' => 'empty'];
        }

        if ($newHash === $oldHash) {
            return ['saved' => false, 'history_recorded' => false, 'reason' => 'unchanged'];
        }

        ensureDirectory($dirPath, 'Cannot create page directory');

        $revDir = revisionsDir($pageId);
        ensureDirectory($revDir, 'Cannot create revisions directory');

        $now = new DateTime('now', new DateTimeZone('UTC'));
        $stamp = $now->format('Ymd\THis.u\Z');
        $pretty = json_encode($normalized, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
        if ($pretty === false) {
            sendJson(500, ['detail' => 'Cannot encode current data']);
        }

        $revisionFileName = $stamp . '_' . substr($newHash, 0, 8) . '.json';
        $revisionPath = $revDir . DIRECTORY_SEPARATOR . $revisionFileName;

        $doneCount = 0;
        foreach ($normalized['todos'] as $todo) {
            if (!empty($todo['done'])) {
                $doneCount++;
            }
        }

        $historyEntry = [
            'timestamp' => $now->format(DateTimeInterface::ATOM),
            'hash' => $newHash,
            'note_length' => stringLength((string) $normalized['note']),
            'todo_total' => count($normalized['todos']),
            'todo_done' => $doneCount,
            'revision_file' => $revisionFileName,
        ];

        $tempCurrentPath = createTempFile($dirPath, 'current_');
        $tempRevisionPath = createTempFile($revDir, 'revision_');
        $tempHistoryPath = createTempFile($dirPath, 'history_');
        $currentBackupPath = null;
        $historyBackupPath = null;
        $revisionWritten = false;
        $currentReplaced = false;
        $historyReplaced = false;

        try {
            writeFileOrThrow($tempCurrentPath, $pretty, 'Cannot stage current data');
            writeFileOrThrow($tempRevisionPath, $pretty, 'Cannot stage revision data');
            writeFileOrThrow($tempHistoryPath, buildHistoryContent($historyPath, $historyEntry, $maxHistoryEntries), 'Cannot stage history data');

            moveFileOrThrow($tempRevisionPath, $revisionPath, 'Cannot publish revision data');
            $revisionWritten = true;

            $currentBackupPath = replaceFileWithBackup($tempCurrentPath, $currentPath, 'Cannot publish current data');
            $currentReplaced = true;

            $historyBackupPath = replaceFileWithBackup($tempHistoryPath, $historyPath, 'Cannot publish history data');
            $historyReplaced = true;
        } catch (RuntimeException $exception) {
            cleanupTempFile($tempCurrentPath);
            cleanupTempFile($tempRevisionPath);
            cleanupTempFile($tempHistoryPath);

            if ($historyReplaced) {
                restoreFileFromBackup($historyPath, $historyBackupPath, 'Cannot restore history data');
            } else {
                cleanupTempFile($historyBackupPath);
            }

            if ($currentReplaced) {
                restoreFileFromBackup($currentPath, $currentBackupPath, 'Cannot restore current data');
            } else {
                cleanupTempFile($currentBackupPath);
            }

            if ($revisionWritten) {
                cleanupTempFile($revisionPath);
            }

            sendJson(500, ['detail' => $exception->getMessage()]);
        }

        cleanupTempFile($currentBackupPath);
        cleanupTempFile($historyBackupPath);
        pruneRevisionFiles($revDir, $maxRevisionFiles);

        return [
            'saved' => true,
            'history_recorded' => true,
            'reason' => 'updated',
            'revision_file' => $revisionFileName,
            'last_modified' => $now->format(DateTimeInterface::ATOM),
        ];
    } finally {
        releasePageLock($lockHandle);
    }
}

function lockFile(string $pageId): string
{
    return locksDir() . DIRECTORY_SEPARATOR . $pageId . '.lock';
}

function locksDir(): string
{
    global $dataRoot;
    return rtrim($dataRoot, "/\\") . DIRECTORY_SEPARATOR . '.locks';
}

function ensureDirectory(string $path, string $errorDetail): void
{
    if (!is_dir($path) && !mkdir($path, 0775, true) && !is_dir($path)) {
        sendJson(500, ['detail' => $errorDetail]);
    }
}

function createTempFile(string $directory, string $prefix): string
{
    $path = tempnam($directory, $prefix);
    if ($path === false) {
        throw new RuntimeException('Cannot create temporary file');
    }

    return $path;
}

function writeFileOrThrow(string $path, string $contents, string $errorDetail): void
{
    if (@file_put_contents($path, $contents, LOCK_EX) === false) {
        throw new RuntimeException($errorDetail);
    }
}

function moveFileOrThrow(string $sourcePath, string $targetPath, string $errorDetail): void
{
    if (@rename($sourcePath, $targetPath)) {
        return;
    }

    if (is_file($targetPath) && !@unlink($targetPath)) {
        throw new RuntimeException($errorDetail);
    }

    if (!@rename($sourcePath, $targetPath)) {
        throw new RuntimeException($errorDetail);
    }
}

function replaceFileWithBackup(string $sourcePath, string $targetPath, string $errorDetail): ?string
{
    $backupPath = null;

    if (is_file($targetPath)) {
        $backupPath = createTempFile(dirname($targetPath), 'backup_');
        if (!@copy($targetPath, $backupPath)) {
            cleanupTempFile($backupPath);
            throw new RuntimeException($errorDetail);
        }
    }

    moveFileOrThrow($sourcePath, $targetPath, $errorDetail);

    return $backupPath;
}

function restoreFileFromBackup(string $targetPath, ?string $backupPath, string $errorDetail): void
{
    cleanupTempFile($targetPath);

    if ($backupPath === null) {
        return;
    }

    moveFileOrThrow($backupPath, $targetPath, $errorDetail);
}

function cleanupTempFile(?string $path): void
{
    if ($path !== null && is_file($path)) {
        @unlink($path);
    }
}

function buildHistoryContent(string $historyPath, array $historyEntry, int $maxEntries): string
{
    $lines = [];

    if (is_file($historyPath)) {
        $existingLines = @file($historyPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        if ($existingLines === false) {
            throw new RuntimeException('Cannot read history data');
        }

        $lines = $existingLines;
    }

    $encodedEntry = json_encode($historyEntry, JSON_UNESCAPED_UNICODE);
    if ($encodedEntry === false) {
        throw new RuntimeException('Cannot encode history data');
    }

    $lines[] = $encodedEntry;

    if (count($lines) > $maxEntries) {
        $lines = array_slice($lines, -$maxEntries);
    }

    return implode(PHP_EOL, $lines) . PHP_EOL;
}

function pruneRevisionFiles(string $revisionDirectory, int $maxFiles): void
{
    if ($maxFiles < 1 || !is_dir($revisionDirectory)) {
        return;
    }

    $paths = glob($revisionDirectory . DIRECTORY_SEPARATOR . '*.json');
    if ($paths === false || count($paths) <= $maxFiles) {
        return;
    }

    sort($paths, SORT_STRING);
    $stalePaths = array_slice($paths, 0, count($paths) - $maxFiles);

    foreach ($stalePaths as $path) {
        @unlink($path);
    }
}

function acquirePageLock(string $pageId)
{
    ensureDirectory(locksDir(), 'Cannot create lock directory');

    $handle = @fopen(lockFile($pageId), 'c+');
    if ($handle === false) {
        sendJson(500, ['detail' => 'Cannot open save lock']);
    }

    if (!flock($handle, LOCK_EX)) {
        fclose($handle);
        sendJson(500, ['detail' => 'Cannot lock page data']);
    }

    return $handle;
}

function releasePageLock($handle): void
{
    if (is_resource($handle)) {
        flock($handle, LOCK_UN);
        fclose($handle);
    }
}

function stringLength(string $value): int
{
    if (function_exists('mb_strlen')) {
        return mb_strlen($value);
    }

    return strlen($value);
}
