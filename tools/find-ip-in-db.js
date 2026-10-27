/*
Simple scanner to find occurrences of a target IP inside SQLite DBs.
Scans tables likely to contain URLs/IPs.
*/

const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const TARGET = process.argv[2] || '172.17.1.86';
const dbPaths = [
  path.join(__dirname, '..', 'data', 'mfa.db'),
  path.join(__dirname, '..', 'data', 'database.sqlite')
];

async function runQuery(db, sql) {
  return new Promise((resolve) => {
    db.all(sql, [], (err, rows) => {
      if (err) return resolve({ error: err.message });
      resolve({ rows });
    });
  });
}

async function scanDb(dbFile) {
  if (!fs.existsSync(dbFile)) {
    console.log(`SKIP (not found): ${dbFile}`);
    return;
  }
  console.log(`\n>>> Scanning DB: ${dbFile}`);
  const db = new sqlite3.Database(dbFile);
  try {
    // Applications table
    const qApp = `SELECT id, name, internal_url, external_path, internal_ip_ranges, direct_excluded_ips
                  FROM applications
                  WHERE internal_url LIKE '%${TARGET}%' OR external_path LIKE '%${TARGET}%'
                     OR internal_ip_ranges LIKE '%${TARGET}%' OR direct_excluded_ips LIKE '%${TARGET}%'`;
    const app = await runQuery(db, qApp);
    if (app.error) console.log('applications query error:', app.error);
    else if (app.rows && app.rows.length) {
      console.log('applications matches:', JSON.stringify(app.rows, null, 2));
    } else {
      console.log('applications: NO MATCH');
    }

    // Settings table (if exists)
    const qHasSettings = `SELECT name FROM sqlite_master WHERE type='table' AND name='settings'`;
    const hasSettings = await runQuery(db, qHasSettings);
    const settingsExists = hasSettings.rows && hasSettings.rows.length > 0;
    if (settingsExists) {
      const qSettings = `SELECT key, value FROM settings WHERE value LIKE '%${TARGET}%' OR key LIKE '%${TARGET}%'`;
      const st = await runQuery(db, qSettings);
      if (st.error) console.log('settings query error:', st.error);
      else if (st.rows && st.rows.length) {
        console.log('settings matches:', JSON.stringify(st.rows, null, 2));
      } else {
        console.log('settings: NO MATCH');
      }
    } else {
      console.log('settings table: NOT PRESENT');
    }

    // auth_methods config
    const qHasAuth = `SELECT name FROM sqlite_master WHERE type='table' AND name='auth_methods'`;
    const hasAuth = await runQuery(db, qHasAuth);
    if (hasAuth.rows && hasAuth.rows.length) {
      const qAuth = `SELECT id, name, type, config FROM auth_methods WHERE config LIKE '%${TARGET}%'`;
      const am = await runQuery(db, qAuth);
      if (am.error) console.log('auth_methods query error:', am.error);
      else if (am.rows && am.rows.length) {
        console.log('auth_methods matches:', JSON.stringify(am.rows, null, 2));
      } else {
        console.log('auth_methods: NO MATCH');
      }
    } else {
      console.log('auth_methods table: NOT PRESENT');
    }
  } finally {
    db.close();
  }
}

(async () => {
  console.log(`Target IP: ${TARGET}`);
  for (const dbFile of dbPaths) {
    await scanDb(dbFile);
  }
})();


