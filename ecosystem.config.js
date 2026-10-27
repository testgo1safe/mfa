module.exports = {
  apps: [
    {
      name: 'mfa-server',
      script: 'server/index.js',
      instances: process.env.WEB_CONCURRENCY || 'max',
      exec_mode: 'cluster',
      watch: false,
      max_memory_restart: process.env.MAX_MEMORY_RESTART || '512M',
      node_args: '--trace-warnings',
      env: {
        NODE_ENV: 'production',
        PORT: process.env.PORT || 3001,
        HTTPS: process.env.HTTPS || 'false',
        DB_PATH: process.env.DB_PATH || './data/mfa.db',
        RATE_LIMIT_WINDOW_MS: process.env.RATE_LIMIT_WINDOW_MS || 900000,
        RATE_LIMIT_MAX: process.env.RATE_LIMIT_MAX || 1000,
        JSON_LIMIT: process.env.JSON_LIMIT || '1mb',
        URLENCODED_LIMIT: process.env.URLENCODED_LIMIT || '1mb',
        PROXY_TIMEOUT_MS: process.env.PROXY_TIMEOUT_MS || 120000,
        MAX_REWRITE_BODY_BYTES: process.env.MAX_REWRITE_BODY_BYTES || 2097152,
        STEP_UP_TTL_MINUTES: process.env.STEP_UP_TTL_MINUTES || 15
      },
      listen_timeout: 10000,
      kill_timeout: 10000,
      wait_ready: false,
      shutdown_with_message: false,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    }
  ]
}; 