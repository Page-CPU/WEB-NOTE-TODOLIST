<?php

declare(strict_types=1);

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
