const fs = require('fs');
const path = require('path');

function patchHttpProxyCommon() {
  const filePath = path.join(__dirname, '..', 'node_modules', 'http-proxy', 'lib', 'http-proxy', 'common.js');
  if (!fs.existsSync(filePath)) {
    console.log('[patch-http-proxy] Target file not found, skipping:', filePath);
    return;
  }
  let content = fs.readFileSync(filePath, 'utf8');

  if (content.includes("extend   = Object.assign")) {
    console.log('[patch-http-proxy] Already patched.');
    return;
  }

  const before = content;
  // Replace require('util')._extend with Object.assign
  content = content.replace(/extend\s*=\s*require\(['\"]util['\"]\)\._extend,?/g, 'extend   = Object.assign,');

  if (before === content) {
    console.warn('[patch-http-proxy] No changes made; expected pattern not found.');
    return;
  }

  fs.writeFileSync(filePath, content, 'utf8');
  console.log('[patch-http-proxy] Patched http-proxy to use Object.assign instead of util._extend');
}

try {
  patchHttpProxyCommon();
} catch (err) {
  console.error('[patch-http-proxy] Failed:', err && err.message ? err.message : err);
  process.exitCode = 0; // do not fail install
} 