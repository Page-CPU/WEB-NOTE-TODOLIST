<?php

declare(strict_types=1);

function feedbackRoot(): string
{
    global $feedbackRoot;
    return rtrim($feedbackRoot, "/\\");
}

function feedbackRecordsDir(): string
{
    return feedbackRoot() . DIRECTORY_SEPARATOR . 'records';
}

function feedbackHistoryPath(): string
{
    return feedbackRoot() . DIRECTORY_SEPARATOR . 'history.jsonl';
}

function feedbackRateLimitDir(): string
{
    return feedbackRoot() . DIRECTORY_SEPARATOR . '.rate-limit';
}

function handleFeedback(): void
{
    global $maxRequestBytes;

    assertSameOriginRequest();

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

    if (trim((string) ($payload['company'] ?? '')) !== '') {
        sendJson(200, ['accepted' => true]);
    }

    $feedback = normalizeFeedbackPayload($payload);
    [$allowed, $retryAfter] = reserveFeedbackSlot(clientIpAddress(), $feedback['page_id']);
    if (!$allowed) {
        sendJson(429, [
            'detail' => '反馈提交过于频繁，请稍后再试',
            'retry_after' => $retryAfter,
        ]);
    }

    $record = buildFeedbackRecord($feedback);
    $recordPath = persistFeedbackRecord($record);
    $emailResult = sendFeedbackEmail($record);

    $record['mail_provider'] = $emailResult['provider'];
    $record['mail_status'] = $emailResult['status'];
    $record['mail_message_id'] = $emailResult['message_id'];
    $record['send_error'] = $emailResult['error'];

    if ($record['mail_status'] === 'failed') {
        error_log(sprintf(
            '[web-note feedback] mail send failed id=%s page=%s error=%s',
            $record['feedback_id'],
            $record['page_id'] !== '' ? $record['page_id'] : '/',
            (string) ($record['send_error'] ?? 'unknown')
        ));
    }

    persistFeedbackRecord($record, $recordPath);
    appendFeedbackHistory($record);

    sendJson(200, [
        'accepted' => true,
        'feedback_id' => $record['feedback_id'],
        'mail_status' => $record['mail_status'],
    ]);
}

function normalizeFeedbackPayload(array $payload): array
{
    $type = normalizeFeedbackType($payload['type'] ?? 'bug');
    $message = trim((string) ($payload['message'] ?? ''));
    if ($message === '') {
        sendJson(422, ['detail' => '反馈内容不能为空']);
    }
    if (stringLength($message) > 2000) {
        sendJson(422, ['detail' => '反馈内容不能超过 2000 字']);
    }

    $contact = limitString(trim((string) ($payload['contact'] ?? '')), 200);

    return [
        'type' => $type,
        'message' => $message,
        'contact' => $contact,
        'include_debug' => !empty($payload['include_debug']),
        'include_content' => !empty($payload['include_content']),
        'page_id' => normalizeFeedbackPageId($payload['page_id'] ?? ''),
        'url' => limitString(trim((string) ($payload['url'] ?? '')), 500),
        'client_time' => limitString(trim((string) ($payload['client_time'] ?? '')), 80),
        'context' => normalizeFeedbackContext($payload['context'] ?? null),
        'snapshot' => !empty($payload['include_content'])
            ? normalizeFeedbackSnapshot($payload['snapshot'] ?? null)
            : null,
    ];
}

function normalizeFeedbackType($value): string
{
    $type = strtolower(trim((string) $value));
    $allowed = ['bug', 'feature', 'other'];
    return in_array($type, $allowed, true) ? $type : 'bug';
}

function normalizeFeedbackPageId($value): string
{
    $pageId = trim((string) $value);
    if ($pageId === '') {
        return '';
    }

    return preg_match('/^[A-Za-z0-9]{1,32}$/', $pageId) ? $pageId : '';
}

function normalizeFeedbackContext($value): array
{
    $context = is_array($value) ? $value : [];
    $viewport = is_array($context['viewport'] ?? null) ? $context['viewport'] : [];

    return [
        'user_agent' => limitString(trim((string) ($context['user_agent'] ?? '')), 500),
        'language' => limitString(trim((string) ($context['language'] ?? '')), 32),
        'platform' => limitString(trim((string) ($context['platform'] ?? '')), 120),
        'viewport' => [
            'width' => max(0, min(10000, (int) ($viewport['width'] ?? 0))),
            'height' => max(0, min(10000, (int) ($viewport['height'] ?? 0))),
        ],
        'todo_total' => max(0, (int) ($context['todo_total'] ?? 0)),
        'todo_done' => max(0, (int) ($context['todo_done'] ?? 0)),
        'note_length' => max(0, (int) ($context['note_length'] ?? 0)),
        'save_status' => limitString(trim((string) ($context['save_status'] ?? '')), 80),
    ];
}

function normalizeFeedbackSnapshot($value): ?array
{
    if (!is_array($value)) {
        return null;
    }

    $snapshot = normalizePayload([
        'note' => limitString((string) ($value['note'] ?? ''), 50000),
        'todos' => is_array($value['todos'] ?? null) ? $value['todos'] : [],
    ]);

    return [
        'note' => $snapshot['note'],
        'todos' => $snapshot['todos'],
    ];
}

function buildFeedbackRecord(array $feedback): array
{
    $feedbackId = 'fb_' . gmdate('Ymd\THis') . '_' . bin2hex(random_bytes(4));

    return [
        'feedback_id' => $feedbackId,
        'created_at' => gmdate(DateTimeInterface::ATOM),
        'type' => $feedback['type'],
        'message' => $feedback['message'],
        'contact' => $feedback['contact'],
        'page_id' => $feedback['page_id'],
        'url' => $feedback['url'],
        'client_time' => $feedback['client_time'],
        'client_ip' => clientIpAddress(),
        'include_debug' => $feedback['include_debug'],
        'include_content' => $feedback['include_content'],
        'context' => $feedback['context'],
        'snapshot' => $feedback['snapshot'],
        'mail_provider' => 'smtp',
        'mail_status' => 'pending',
        'mail_message_id' => null,
        'send_error' => null,
    ];
}

function persistFeedbackRecord(array $record, ?string $path = null): string
{
    $targetPath = $path;
    if ($targetPath === null) {
        $dir = feedbackRecordsDir() . DIRECTORY_SEPARATOR . gmdate('Y-m');
        ensureDirectory($dir, 'Cannot create feedback record directory');
        $targetPath = $dir . DIRECTORY_SEPARATOR . $record['feedback_id'] . '.json';
    } else {
        ensureDirectory(dirname($targetPath), 'Cannot create feedback record directory');
    }

    writeJsonAtomically($targetPath, $record, 'Cannot persist feedback record');
    return $targetPath;
}

function appendFeedbackHistory(array $record): void
{
    global $feedbackHistoryMaxEntries;

    ensureDirectory(feedbackRoot(), 'Cannot create feedback directory');

    $historyEntry = [
        'feedback_id' => $record['feedback_id'],
        'created_at' => $record['created_at'],
        'type' => $record['type'],
        'page_id' => $record['page_id'],
        'mail_status' => $record['mail_status'],
        'has_contact' => $record['contact'] !== '',
        'include_content' => (bool) $record['include_content'],
    ];

    $historyPath = feedbackHistoryPath();
    $historyContent = buildHistoryContent($historyPath, $historyEntry, $feedbackHistoryMaxEntries);
    writeStringAtomically($historyPath, $historyContent, 'Cannot persist feedback history');
}

function reserveFeedbackSlot(string $clientIp, string $pageId): array
{
    global $feedbackRateLimitMax, $feedbackRateLimitWindowSeconds;

    if ($feedbackRateLimitMax < 1 || $feedbackRateLimitWindowSeconds < 1) {
        return [true, 0];
    }

    ensureDirectory(feedbackRateLimitDir(), 'Cannot create feedback rate-limit directory');
    pruneStaleFeedbackRateLimitBuckets();

    $bucketKey = hash('sha256', $clientIp . '|' . $pageId);
    $bucketPath = feedbackRateLimitDir() . DIRECTORY_SEPARATOR . $bucketKey . '.json';
    $handle = @fopen($bucketPath, 'c+');
    if ($handle === false) {
        sendJson(500, ['detail' => 'Cannot open feedback rate-limit bucket']);
    }

    if (!flock($handle, LOCK_EX)) {
        fclose($handle);
        sendJson(500, ['detail' => 'Cannot lock feedback rate-limit bucket']);
    }

    $allowed = true;
    $retryAfter = 0;
    $now = time();

    try {
        $raw = stream_get_contents($handle);
        $timestamps = [];
        if (is_string($raw) && trim($raw) !== '') {
            $decoded = json_decode($raw, true);
            if (is_array($decoded)) {
                $timestamps = array_values(array_filter(array_map('intval', $decoded), static function ($timestamp) use ($now, $feedbackRateLimitWindowSeconds) {
                    return $timestamp > ($now - $feedbackRateLimitWindowSeconds);
                }));
            }
        }

        if (count($timestamps) >= $feedbackRateLimitMax) {
            $allowed = false;
            $retryAfter = max(1, ($timestamps[0] + $feedbackRateLimitWindowSeconds) - $now);
        } else {
            $timestamps[] = $now;
            rewind($handle);
            ftruncate($handle, 0);
            fwrite($handle, json_encode($timestamps, JSON_UNESCAPED_UNICODE));
            fflush($handle);
        }
    } finally {
        flock($handle, LOCK_UN);
        fclose($handle);
    }

    return [$allowed, $retryAfter];
}

function pruneStaleFeedbackRateLimitBuckets(): void
{
    global $feedbackRateLimitWindowSeconds;

    if ($feedbackRateLimitWindowSeconds < 1) {
        return;
    }

    // 低频触发清理，避免每次请求都扫描目录。
    if (mt_rand(1, 50) !== 1) {
        return;
    }

    $threshold = time() - max($feedbackRateLimitWindowSeconds * 2, 600);
    $pattern = feedbackRateLimitDir() . DIRECTORY_SEPARATOR . '*.json';
    $bucketPaths = glob($pattern);
    if (!is_array($bucketPaths)) {
        return;
    }

    foreach ($bucketPaths as $bucketPath) {
        $modifiedAt = @filemtime($bucketPath);
        if ($modifiedAt === false || $modifiedAt >= $threshold) {
            continue;
        }
        @unlink($bucketPath);
    }
}

function sendFeedbackEmail(array $record): array
{
    global $smtpHost, $smtpPort, $smtpSecurity, $smtpUsername, $smtpPassword, $feedbackTo, $feedbackFrom;

    if (
        $smtpHost === false || $smtpHost === ''
        || $feedbackTo === false || $feedbackTo === ''
        || $feedbackFrom === false || $feedbackFrom === ''
    ) {
        return [
            'provider' => 'smtp',
            'status' => 'skipped',
            'message_id' => null,
            'error' => 'SMTP delivery is not configured',
        ];
    }

    $fromMailbox = parseMailbox((string) $feedbackFrom);
    $toMailbox = parseMailbox((string) $feedbackTo);
    if ($fromMailbox === null || $toMailbox === null) {
        return [
            'provider' => 'smtp',
            'status' => 'failed',
            'message_id' => null,
            'error' => 'SMTP mailbox format is invalid',
        ];
    }

    $messageId = buildFeedbackMessageId($record['feedback_id'], $fromMailbox['address']);
    $rawMessage = buildFeedbackMimeMessage($record, $fromMailbox, $toMailbox, $messageId);

    try {
        sendSmtpMessage([
            'host' => (string) $smtpHost,
            'port' => (int) $smtpPort,
            'security' => normalizeSmtpSecurity($smtpSecurity, (int) $smtpPort),
            'username' => $smtpUsername !== false ? (string) $smtpUsername : '',
            'password' => $smtpPassword !== false ? (string) $smtpPassword : '',
        ], $fromMailbox['address'], [$toMailbox['address']], $rawMessage);

        return [
            'provider' => 'smtp',
            'status' => 'sent',
            'message_id' => $messageId,
            'error' => null,
        ];
    } catch (RuntimeException $exception) {
        $errorMessage = limitString($exception->getMessage(), 240);
        return [
            'provider' => 'smtp',
            'status' => 'failed',
            'message_id' => null,
            'error' => $errorMessage !== '' ? $errorMessage : 'SMTP send failed',
        ];
    }
}

function feedbackEmailSubject(array $record): string
{
    $typeLabel = feedbackTypeLabel($record['type']);
    $pagePart = $record['page_id'] !== '' ? '/' . $record['page_id'] : '/';
    $summary = preg_replace('/\s+/', ' ', trim($record['message']));
    $summary = limitString($summary, 36);

    return sprintf('[A Note][%s][%s] %s', $typeLabel, $pagePart, $summary);
}

function feedbackEmailText(array $record): string
{
    $lines = [
        'A Note 新反馈',
        '',
        '反馈 ID: ' . $record['feedback_id'],
        '类型: ' . feedbackTypeLabel($record['type']),
        '页面: ' . ($record['page_id'] !== '' ? '/' . $record['page_id'] : '/'),
        '提交时间: ' . $record['created_at'],
        '客户端时间: ' . ($record['client_time'] !== '' ? $record['client_time'] : '--'),
        '联系: ' . ($record['contact'] !== '' ? $record['contact'] : '--'),
        'URL: ' . ($record['url'] !== '' ? $record['url'] : '--'),
        'IP: ' . ($record['client_ip'] !== '' ? $record['client_ip'] : '--'),
        '',
        '反馈内容',
        $record['message'],
    ];

    if (!empty($record['include_debug'])) {
        $lines = array_merge($lines, [
            '',
            '诊断信息',
            '浏览器: ' . (($record['context']['user_agent'] ?? '') !== '' ? $record['context']['user_agent'] : '--'),
            '语言: ' . (($record['context']['language'] ?? '') !== '' ? $record['context']['language'] : '--'),
            '平台: ' . (($record['context']['platform'] ?? '') !== '' ? $record['context']['platform'] : '--'),
            sprintf(
                '视口: %s x %s',
                (string) ($record['context']['viewport']['width'] ?? 0),
                (string) ($record['context']['viewport']['height'] ?? 0)
            ),
            sprintf(
                '任务: %d 总计 / %d 已完成',
                (int) ($record['context']['todo_total'] ?? 0),
                (int) ($record['context']['todo_done'] ?? 0)
            ),
            '笔记长度: ' . (string) ($record['context']['note_length'] ?? 0),
            '保存状态: ' . (($record['context']['save_status'] ?? '') !== '' ? $record['context']['save_status'] : '--'),
        ]);
    }

    if (!empty($record['include_content']) && is_array($record['snapshot'])) {
        $lines = array_merge($lines, [
            '',
            '页面内容快照',
            '笔记',
            limitString((string) ($record['snapshot']['note'] ?? ''), 4000),
            '',
            '待办',
        ]);

        $todos = is_array($record['snapshot']['todos'] ?? null) ? $record['snapshot']['todos'] : [];
        if ($todos === []) {
            $lines[] = '--';
        } else {
            foreach (array_slice($todos, 0, 30) as $todo) {
                $lines[] = sprintf(
                    '- [%s] %s',
                    !empty($todo['done']) ? 'x' : ' ',
                    trim((string) ($todo['text'] ?? ''))
                );
            }
            if (count($todos) > 30) {
                $lines[] = sprintf('... 其余 %d 条已省略', count($todos) - 30);
            }
        }
    }

    return implode(PHP_EOL, $lines);
}

function feedbackEmailHtml(array $record): string
{
    $html = '<h2>A Note 新反馈</h2>';
    $html .= '<p><strong>反馈 ID：</strong>' . feedbackHtml($record['feedback_id']) . '</p>';
    $html .= '<p><strong>类型：</strong>' . feedbackHtml(feedbackTypeLabel($record['type'])) . '<br>';
    $html .= '<strong>页面：</strong>' . feedbackHtml($record['page_id'] !== '' ? '/' . $record['page_id'] : '/') . '<br>';
    $html .= '<strong>提交时间：</strong>' . feedbackHtml($record['created_at']) . '<br>';
    $html .= '<strong>客户端时间：</strong>' . feedbackHtml($record['client_time'] !== '' ? $record['client_time'] : '--') . '<br>';
    $html .= '<strong>联系：</strong>' . feedbackHtml($record['contact'] !== '' ? $record['contact'] : '--') . '<br>';
    $html .= '<strong>URL：</strong>' . feedbackHtml($record['url'] !== '' ? $record['url'] : '--') . '<br>';
    $html .= '<strong>IP：</strong>' . feedbackHtml($record['client_ip'] !== '' ? $record['client_ip'] : '--') . '</p>';
    $html .= '<h3>反馈内容</h3><pre style="white-space:pre-wrap;font-family:inherit;background:#f5f7fb;padding:12px;border-radius:10px;">' . feedbackHtml($record['message']) . '</pre>';

    if (!empty($record['include_debug'])) {
        $html .= '<h3>诊断信息</h3><ul>';
        $html .= '<li><strong>浏览器：</strong>' . feedbackHtml(($record['context']['user_agent'] ?? '') !== '' ? $record['context']['user_agent'] : '--') . '</li>';
        $html .= '<li><strong>语言：</strong>' . feedbackHtml(($record['context']['language'] ?? '') !== '' ? $record['context']['language'] : '--') . '</li>';
        $html .= '<li><strong>平台：</strong>' . feedbackHtml(($record['context']['platform'] ?? '') !== '' ? $record['context']['platform'] : '--') . '</li>';
        $html .= '<li><strong>视口：</strong>' . feedbackHtml(sprintf('%s x %s', (string) ($record['context']['viewport']['width'] ?? 0), (string) ($record['context']['viewport']['height'] ?? 0))) . '</li>';
        $html .= '<li><strong>任务：</strong>' . feedbackHtml(sprintf('%d 总计 / %d 已完成', (int) ($record['context']['todo_total'] ?? 0), (int) ($record['context']['todo_done'] ?? 0))) . '</li>';
        $html .= '<li><strong>笔记长度：</strong>' . feedbackHtml((string) ($record['context']['note_length'] ?? 0)) . '</li>';
        $html .= '<li><strong>保存状态：</strong>' . feedbackHtml(($record['context']['save_status'] ?? '') !== '' ? $record['context']['save_status'] : '--') . '</li>';
        $html .= '</ul>';
    }

    if (!empty($record['include_content']) && is_array($record['snapshot'])) {
        $html .= '<h3>页面内容快照</h3>';
        $html .= '<p><strong>笔记</strong></p><pre style="white-space:pre-wrap;font-family:inherit;background:#f5f7fb;padding:12px;border-radius:10px;">' . feedbackHtml(limitString((string) ($record['snapshot']['note'] ?? ''), 4000)) . '</pre>';
        $html .= '<p><strong>待办</strong></p><ul>';
        $todos = is_array($record['snapshot']['todos'] ?? null) ? $record['snapshot']['todos'] : [];
        if ($todos === []) {
            $html .= '<li>--</li>';
        } else {
            foreach (array_slice($todos, 0, 30) as $todo) {
                $html .= '<li>' . feedbackHtml(sprintf('[%s] %s', !empty($todo['done']) ? 'x' : ' ', trim((string) ($todo['text'] ?? '')))) . '</li>';
            }
            if (count($todos) > 30) {
                $html .= '<li>' . feedbackHtml(sprintf('其余 %d 条已省略', count($todos) - 30)) . '</li>';
            }
        }
        $html .= '</ul>';
    }

    return $html;
}

function feedbackTypeLabel(string $type): string
{
    return match ($type) {
        'feature' => '功能建议',
        'other' => '其他',
        default => '问题反馈',
    };
}

function feedbackHtml(string $value): string
{
    return htmlspecialchars($value, ENT_QUOTES, 'UTF-8');
}

function writeJsonAtomically(string $targetPath, array $payload, string $errorDetail): void
{
    $tempPath = createTempFile(dirname($targetPath), 'feedback_');
    $encoded = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
    if ($encoded === false) {
        cleanupTempFile($tempPath);
        sendJson(500, ['detail' => 'Cannot encode feedback record']);
    }

    try {
        writeFileOrThrow($tempPath, $encoded, $errorDetail);
        moveFileOrThrow($tempPath, $targetPath, $errorDetail);
    } catch (RuntimeException $exception) {
        cleanupTempFile($tempPath);
        sendJson(500, ['detail' => $exception->getMessage()]);
    }
}

function writeStringAtomically(string $targetPath, string $contents, string $errorDetail): void
{
    $tempPath = createTempFile(dirname($targetPath), 'feedback_history_');

    try {
        writeFileOrThrow($tempPath, $contents, $errorDetail);
        moveFileOrThrow($tempPath, $targetPath, $errorDetail);
    } catch (RuntimeException $exception) {
        cleanupTempFile($tempPath);
        sendJson(500, ['detail' => $exception->getMessage()]);
    }
}

function parseMailbox(string $value): ?array
{
    $trimmed = trim($value);
    if ($trimmed === '') {
        return null;
    }

    if (preg_match('/^(.*)<([^>]+)>$/', $trimmed, $match)) {
        $name = trim(trim($match[1]), "\"' ");
        $address = trim($match[2]);
    } else {
        $name = '';
        $address = $trimmed;
    }

    if (!filter_var($address, FILTER_VALIDATE_EMAIL)) {
        return null;
    }

    return [
        'name' => $name,
        'address' => strtolower($address),
    ];
}

function formatMailbox(array $mailbox): string
{
    $address = $mailbox['address'];
    $name = trim((string) ($mailbox['name'] ?? ''));
    if ($name === '') {
        return $address;
    }

    return encodeMimeHeader($name) . ' <' . $address . '>';
}

function buildFeedbackMessageId(string $feedbackId, string $fromAddress): string
{
    $domain = substr(strrchr($fromAddress, '@') ?: '', 1);
    if ($domain === '') {
        $domain = $_SERVER['HTTP_HOST'] ?? 'localhost';
    }

    return '<' . $feedbackId . '@' . preg_replace('/[^A-Za-z0-9.\-]/', '', strtolower((string) $domain)) . '>';
}

function buildFeedbackMimeMessage(array $record, array $fromMailbox, array $toMailbox, string $messageId): string
{
    $boundary = 'feedback-alt-' . bin2hex(random_bytes(12));
    $subject = feedbackEmailSubject($record);
    $textBody = chunk_split(base64_encode(feedbackEmailText($record)), 76, "\r\n");
    $htmlBody = chunk_split(base64_encode(feedbackEmailHtml($record)), 76, "\r\n");

    $headers = [
        'Date: ' . gmdate('D, d M Y H:i:s') . ' +0000',
        'Message-ID: ' . $messageId,
        'From: ' . formatMailbox($fromMailbox),
        'To: ' . formatMailbox($toMailbox),
        'Subject: ' . encodeMimeHeader($subject),
        'MIME-Version: 1.0',
        'X-Mailer: A Note SMTP',
        'Content-Type: multipart/alternative; boundary="' . $boundary . '"',
    ];

    $parts = [
        'This is a multi-part message in MIME format.',
        '--' . $boundary,
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: base64',
        '',
        $textBody,
        '--' . $boundary,
        'Content-Type: text/html; charset=UTF-8',
        'Content-Transfer-Encoding: base64',
        '',
        $htmlBody,
        '--' . $boundary . '--',
        '',
    ];

    return implode("\r\n", $headers) . "\r\n\r\n" . implode("\r\n", $parts);
}

function encodeMimeHeader(string $value): string
{
    if ($value === '') {
        return '';
    }

    return '=?UTF-8?B?' . base64_encode($value) . '?=';
}

function normalizeSmtpSecurity($value, int $port): string
{
    $security = strtolower(trim((string) ($value !== false ? $value : '')));
    if (in_array($security, ['ssl', 'tls', 'none'], true)) {
        return $security;
    }

    return $port === 465 ? 'ssl' : 'tls';
}

function sendSmtpMessage(array $config, string $fromAddress, array $recipientAddresses, string $rawMessage): void
{
    $security = $config['security'];
    $host = trim((string) $config['host']);
    $port = max(1, (int) $config['port']);
    $timeout = 15;
    $remote = ($security === 'ssl' ? 'ssl://' : 'tcp://') . $host . ':' . $port;

    $errno = 0;
    $errstr = '';
    $socket = @stream_socket_client($remote, $errno, $errstr, $timeout, STREAM_CLIENT_CONNECT);
    if (!is_resource($socket)) {
        throw new RuntimeException('Cannot connect to SMTP server: ' . $errstr);
    }

    stream_set_timeout($socket, $timeout);

    try {
        smtpReadResponse($socket, [220]);
        $ehloLines = smtpCommand($socket, 'EHLO localhost', [250]);

        if ($security === 'tls') {
            $supportsStartTls = false;
            foreach ($ehloLines as $line) {
                if (stripos($line, 'STARTTLS') !== false) {
                    $supportsStartTls = true;
                    break;
                }
            }

            if (!$supportsStartTls) {
                throw new RuntimeException('SMTP server does not advertise STARTTLS');
            }

            smtpCommand($socket, 'STARTTLS', [220]);
            $cryptoEnabled = @stream_socket_enable_crypto($socket, true, STREAM_CRYPTO_METHOD_TLS_CLIENT);
            if ($cryptoEnabled !== true) {
                throw new RuntimeException('Failed to enable SMTP TLS encryption');
            }
            smtpCommand($socket, 'EHLO localhost', [250]);
        }

        $username = (string) ($config['username'] ?? '');
        $password = (string) ($config['password'] ?? '');
        if ($username !== '' || $password !== '') {
            smtpCommand($socket, 'AUTH LOGIN', [334]);
            smtpCommand($socket, base64_encode($username), [334]);
            smtpCommand($socket, base64_encode($password), [235]);
        }

        smtpCommand($socket, 'MAIL FROM:<' . $fromAddress . '>', [250]);
        foreach ($recipientAddresses as $recipient) {
            smtpCommand($socket, 'RCPT TO:<' . $recipient . '>', [250, 251]);
        }

        smtpCommand($socket, 'DATA', [354]);
        $payload = smtpDotStuff($rawMessage);
        fwrite($socket, $payload . "\r\n.\r\n");
        smtpReadResponse($socket, [250]);
        smtpCommand($socket, 'QUIT', [221]);
    } finally {
        fclose($socket);
    }
}

function smtpCommand($socket, string $command, array $expectedCodes): array
{
    fwrite($socket, $command . "\r\n");
    return smtpReadResponse($socket, $expectedCodes);
}

function smtpReadResponse($socket, array $expectedCodes): array
{
    $lines = [];
    $code = 0;

    while (($line = fgets($socket, 515)) !== false) {
        $line = rtrim($line, "\r\n");
        $lines[] = $line;

        if (preg_match('/^(\d{3})([ -])(.*)$/', $line, $match)) {
            $code = (int) $match[1];
            if ($match[2] === ' ') {
                break;
            }
        } else {
            break;
        }
    }

    if ($lines === []) {
        throw new RuntimeException('SMTP server closed the connection unexpectedly');
    }

    if (!in_array($code, $expectedCodes, true)) {
        throw new RuntimeException('SMTP error: ' . implode(' | ', $lines));
    }

    return $lines;
}

function smtpDotStuff(string $message): string
{
    $normalized = str_replace(["\r\n", "\r"], "\n", $message);
    $lines = explode("\n", $normalized);

    foreach ($lines as &$line) {
        if (str_starts_with($line, '.')) {
            $line = '.' . $line;
        }
    }
    unset($line);

    return implode("\r\n", $lines);
}

function limitString(string $value, int $maxLength): string
{
    if ($maxLength < 1) {
        return '';
    }

    if (stringLength($value) <= $maxLength) {
        return $value;
    }

    if (function_exists('mb_substr')) {
        return rtrim(mb_substr($value, 0, $maxLength - 1)) . '…';
    }

    return rtrim(substr($value, 0, $maxLength - 1)) . '…';
}

function clientIpAddress(): string
{
    $candidates = [
        $_SERVER['HTTP_CF_CONNECTING_IP'] ?? null,
        $_SERVER['HTTP_X_FORWARDED_FOR'] ?? null,
        $_SERVER['REMOTE_ADDR'] ?? null,
    ];

    foreach ($candidates as $candidate) {
        if (!is_string($candidate) || trim($candidate) === '') {
            continue;
        }

        $parts = explode(',', $candidate);
        $ip = trim($parts[0]);
        if (filter_var($ip, FILTER_VALIDATE_IP)) {
            return $ip;
        }
    }

    return '';
}

function assertSameOriginRequest(): void
{
    $hostHeader = (string) ($_SERVER['HTTP_HOST'] ?? '');
    $host = parse_url('//' . $hostHeader, PHP_URL_HOST);
    if (!is_string($host) || $host === '') {
        return;
    }

    foreach (['HTTP_ORIGIN', 'HTTP_REFERER'] as $headerName) {
        $headerValue = $_SERVER[$headerName] ?? '';
        if (!is_string($headerValue) || trim($headerValue) === '') {
            continue;
        }

        $requestHost = parse_url($headerValue, PHP_URL_HOST);
        if (is_string($requestHost) && $requestHost !== '' && !hash_equals(strtolower($host), strtolower($requestHost))) {
            sendJson(403, ['detail' => 'Cross-origin feedback requests are not allowed']);
        }
    }
}
