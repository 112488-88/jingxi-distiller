<?php
/**
 * deploy/php-proxy.php —— 宝塔 / 虚拟主机上的极简代理（没有 nginx 反代权限时用这个）
 *
 * 用法：
 *   1. 放到网站根目录，改名 api.php
 *   2. 把下面的 KEY 换成你自己的（或用环境变量 DEEPSEEK_KEY）
 *   3. 访问 https://你的域名/api.php，前端 config.js 里写
 *        apiUrl: '/api.php', keyOptional: true
 *
 * 只接受 POST + JSON，输出原样透传 DeepSeek 的响应。
 */

declare(strict_types=1);

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Access-Token');
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => ['message' => '只支持 POST']], JSON_UNESCAPED_UNICODE);
    exit;
}

// ── Key：优先用环境变量，其次写死 ──
$key = getenv('DEEPSEEK_KEY') ?: 'sk-换成你自己的Key';

// ── 可选口令（不设就跳过）──
$ACCESS_TOKEN = '';   // 例如 'my-secret-2026'
if ($ACCESS_TOKEN !== '') {
    $sent = $_SERVER['HTTP_X_ACCESS_TOKEN'] ?? '';
    if (!hash_equals($ACCESS_TOKEN, $sent)) {
        http_response_code(401);
        echo json_encode(['error' => ['message' => 'ACCESS_TOKEN 不对']], JSON_UNESCAPED_UNICODE);
        exit;
    }
}

// ── 极简限流：同一 IP 每 60 秒最多 20 次 ──
$ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
$bucket = sys_get_temp_dir() . '/distiller_' . md5($ip) . '.json';
$now = time();
$rec = ['start' => $now, 'n' => 0];
if (is_file($bucket)) {
    $old = json_decode((string) file_get_contents($bucket), true);
    if (is_array($old) && $now - (int) $old['start'] < 60) {
        $rec = $old;
    }
}
$rec['n'] = (int) $rec['n'] + 1;
@file_put_contents($bucket, json_encode($rec));
if ($rec['n'] > 20) {
    http_response_code(429);
    echo json_encode(['error' => ['message' => '请求太频繁，等一分钟']], JSON_UNESCAPED_UNICODE);
    exit;
}

// ── 转发 ──
$body = file_get_contents('php://input');
if ($body === false || $body === '') {
    http_response_code(400);
    echo json_encode(['error' => ['message' => '请求体是空的']], JSON_UNESCAPED_UNICODE);
    exit;
}

$ch = curl_init('https://api.deepseek.com/chat/completions');
curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => $body,
    CURLOPT_HTTPHEADER => [
        'Content-Type: application/json',
        'Authorization: Bearer ' . $key,
    ],
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 180,
    CURLOPT_SSL_VERIFYPEER => true,
]);

$resp = curl_exec($ch);
$code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
$err = curl_error($ch);
curl_close($ch);

if ($resp === false) {
    http_response_code(502);
    echo json_encode(['error' => ['message' => '上游连不上：' . $err]], JSON_UNESCAPED_UNICODE);
    exit;
}

http_response_code($code > 0 ? $code : 502);
echo $resp;
