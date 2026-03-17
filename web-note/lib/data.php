<?php

declare(strict_types=1);

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

function listPages(): void
{
    global $dataRoot;

    if (!is_dir($dataRoot)) {
        sendJson(200, ['pages' => []]);
    }

    $entries = @scandir($dataRoot);
    if ($entries === false) {
        sendJson(200, ['pages' => []]);
    }

    $pages = [];
    foreach ($entries as $entry) {
        if ($entry === '.' || $entry === '..' || $entry === '.locks') {
            continue;
        }

        if (!preg_match('/^[A-Za-z0-9]{1,32}$/', $entry)) {
            continue;
        }

        $currentPath = $dataRoot . DIRECTORY_SEPARATOR . $entry . DIRECTORY_SEPARATOR . 'current.json';
        if (!is_file($currentPath)) {
            continue;
        }

        $lastModified = null;
        $timestamp = @filemtime($currentPath);
        if ($timestamp !== false) {
            $lastModified = gmdate(DateTimeInterface::ATOM, $timestamp);
        }

        $preview = '';
        $todoTotal = 0;
        $todoDone = 0;

        try {
            $data = readJsonFile($currentPath, ['note' => '', 'todos' => []]);
            $note = (string) ($data['note'] ?? '');
            $firstLine = strtok($note, "\n");
            $preview = $firstLine !== false ? mb_substr($firstLine, 0, 80) : '';
            $todos = is_array($data['todos'] ?? null) ? $data['todos'] : [];
            $todoTotal = count($todos);
            foreach ($todos as $todo) {
                if (!empty($todo['done'])) {
                    $todoDone++;
                }
            }
        } catch (RuntimeException $e) {
            continue;
        }

        $pages[] = [
            'page_id' => $entry,
            'last_modified' => $lastModified,
            'preview' => $preview,
            'todo_total' => $todoTotal,
            'todo_done' => $todoDone,
        ];
    }

    usort($pages, function ($a, $b) {
        return strcmp($b['last_modified'] ?? '', $a['last_modified'] ?? '');
    });

    sendJson(200, ['pages' => $pages]);
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

    $normalizedData = [
        'note' => (string) ($data['note'] ?? ''),
        'todos' => is_array($data['todos'] ?? null) ? $data['todos'] : [],
    ];

    sendJson(200, [
        'page_id' => $pageId,
        'exists' => $exists,
        'note' => $normalizedData['note'],
        'todos' => $normalizedData['todos'],
        'hash' => $exists ? hashData($normalizedData) : null,
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
    $expectedHash = isset($payload['expected_hash']) && is_string($payload['expected_hash'])
        ? trim($payload['expected_hash'])
        : '';
    $result = savePageData($pageId, $normalized, $expectedHash);

    sendJson(200, array_merge(['page_id' => $pageId], $result));
}

function savePageData(string $pageId, array $normalized, string $expectedHash = ''): array
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

        if ($expectedHash !== '' && $expectedHash !== $oldHash) {
            $existingNormalized = normalizePayload($existing);
            flock($lockHandle, LOCK_UN);
            fclose($lockHandle);
            $lockHandle = null;
            sendJson(409, [
                'detail' => 'Conflict: data has been modified by another client',
                'server_hash' => $oldHash,
                'server_note' => (string) ($existingNormalized['note'] ?? ''),
                'server_todos' => $existingNormalized['todos'] ?? [],
            ]);
        }

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
            'hash' => $newHash,
            'last_modified' => $now->format(DateTimeInterface::ATOM),
        ];
    } finally {
        if ($lockHandle !== null) {
            releasePageLock($lockHandle);
        }
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

function deletePage(string $pageId): void
{
    global $dataRoot;

    $dirPath = pageDir($pageId);
    if (!is_dir($dirPath)) {
        sendJson(404, ['detail' => 'Page not found']);
    }

    $trashDir = rtrim($dataRoot, "/\\") . DIRECTORY_SEPARATOR . '.trash';
    ensureDirectory($trashDir, 'Cannot create trash directory');

    $trashTarget = $trashDir . DIRECTORY_SEPARATOR . $pageId . '_' . gmdate('Ymd\THis');

    if (!@rename($dirPath, $trashTarget)) {
        sendJson(500, ['detail' => 'Cannot move page to trash']);
    }

    $lockPath = lockFile($pageId);
    if (is_file($lockPath)) {
        @unlink($lockPath);
    }

    sendJson(200, ['page_id' => $pageId, 'deleted' => true]);
}
