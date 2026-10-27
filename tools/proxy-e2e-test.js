#!/usr/bin/env node
/**
 * Proxy E2E Smoke Test
 * 用于验证：
 * 1) 重定向Location重写（避免跳回内网）
 * 2) HTML/JS内容重写（form action、根路径、百分号编码）
 * 3) POST表单透传（application/x-www-form-urlencoded）
 * 4) Set-Cookie重写（Domain/Path）
 *
 * 运行示例：
 *   node tools/proxy-e2e-test.js --base https://mfa.example.com --path /proxy/email \
 *     --token <JWT或留空> --cookie "auth_token=<token>"
 */

const https = require('https');
const http = require('http');
const zlib = require('zlib');

const argv = require('node:process').argv.slice(2);
const args = Object.fromEntries(argv.flatMap((a,i) => a.startsWith('--') ? [[a.replace(/^--/,'').toLowerCase(), argv[i+1]]] : []));

const BASE = args.base || 'https://mfa.example.com';
const PROXY_PATH = args.path || '/proxy/email';
const AUTH_TOKEN = args.token || '';
const EXTRA_COOKIE = args.cookie || '';

const jar = {};
function setCookiesFrom(res) {
  const sc = res.headers['set-cookie'];
  if (!sc) return;
  (Array.isArray(sc) ? sc : [sc]).forEach(line => {
    const [kv] = line.split(';');
    if (!kv) return;
    const [k,v] = kv.split('=');
    if (k && typeof v !== 'undefined') jar[k.trim()] = v.trim();
  });
}
function cookieHeader() {
  const pairs = Object.entries(jar).map(([k,v]) => `${k}=${v}`);
  if (EXTRA_COOKIE) pairs.push(EXTRA_COOKIE);
  if (AUTH_TOKEN && !jar['auth_token']) pairs.push(`auth_token=${AUTH_TOKEN}`);
  return pairs.join('; ');
}

function req(method, path, opts = {}) {
  const url = new URL(path, BASE);
  const isHttps = url.protocol === 'https:';
  const mod = isHttps ? https : http;
  const payload = opts.body || null;
  const headers = Object.assign({
    'Accept': opts.accept || 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
    'User-Agent': 'proxy-e2e-test/1.0',
    'Cookie': cookieHeader(),
  }, opts.headers || {});
  if (payload && !headers['Content-Length']) headers['Content-Length'] = Buffer.byteLength(payload);

  return new Promise((resolve,reject) => {
    const req = mod.request({
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + (url.search || ''),
      method,
      headers,
      rejectUnauthorized: false,
    }, res => {
      setCookiesFrom(res);
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        let body = Buffer.concat(chunks);
        const enc = (res.headers['content-encoding']||'').toLowerCase();
        try {
          if (enc.includes('gzip')) body = zlib.gunzipSync(body);
          else if (enc.includes('deflate')) body = zlib.inflateSync(body);
          else if (enc.includes('br')) body = zlib.brotliDecompressSync(body);
        } catch (e) {}
        resolve({ url: url.toString(), status: res.statusCode, headers: res.headers, body: body.toString('utf8') });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function print(title, obj) {
  console.log(`\n==== ${title} ====`);
  console.log(obj);
}

(async () => {
  try {
    // 1) 测试重定向Location是否重写到 /proxy
    const r1 = await req('GET', PROXY_PATH, { headers: { 'Accept': 'text/html' } });
    print('STEP1 GET ' + PROXY_PATH, { status: r1.status, location: r1.headers.location });
    if (r1.status >= 300 && r1.status < 400) {
      const loc = r1.headers.location || '';
      const ok = !/https?:\/\/(?:\d{1,3}\.){3}\d{1,3}/.test(loc);
      console.log('ASSERT redirect not to internal ip:', ok ? 'PASS' : 'FAIL');
    }

    // 2) 测试HTML是否重写form action到 /proxy/<path>
    // 访问一个推测的登录页路径
    const loginPath = PROXY_PATH.replace(/\/$/,'') + '/owa/';
    const r2 = await req('GET', loginPath);
    print('STEP2 GET login page', { status: r2.status });
    const hasProxyAction = /action=\"\/?proxy\//i.test(r2.body) || /action='\/?proxy\//i.test(r2.body);
    console.log('ASSERT login form action starts with /proxy:', hasProxyAction ? 'PASS' : 'WARN');

    // 3) 测试POST透传：构造一个最小表单（注意：仅验证透传，不代表业务成功）
    const postPath = PROXY_PATH.replace(/\/$/,'') + '/owa/auth.owa';
    const form = new URLSearchParams({ username: 'test', password: 'invalid', flags: '0', destination: BASE + PROXY_PATH + '/owa/' }).toString();
    const r3 = await req('POST', postPath, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
    });
    print('STEP3 POST login form', { status: r3.status, setCookie: r3.headers['set-cookie'] });
    console.log('NOTE: 200/302/401 都可能取决于上游校验，重点是不能是 400/502/504');

    // 4) 验证Set-Cookie是否已被改写到代理域及路径
    const cookies = r3.headers['set-cookie'] || [];
    if (cookies.length) {
      const domainOk = cookies.every(c => new RegExp(`Domain=${new URL(BASE).host}`, 'i').test(c) || !/Domain=/i.test(c));
      const pathOk = cookies.every(c => /;\s*Path=\/?proxy\//i.test(c) || !/;\s*Path=/i.test(c));
      console.log('ASSERT Set-Cookie Domain rewritten:', domainOk ? 'PASS' : 'WARN');
      console.log('ASSERT Set-Cookie Path under /proxy:', pathOk ? 'PASS' : 'WARN');
    } else {
      console.log('INFO: no Set-Cookie returned from upstream on POST');
    }

    console.log('\n完成。请结合浏览器实际行为对比。如果某一步失败，请把对应STEP输出贴给我。');
  } catch (e) {
    console.error('E2E test error:', e);
    process.exit(1);
  }
})(); 