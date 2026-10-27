#!/usr/bin/env bash

set -euo pipefail

echo "================================================"
echo "MFA Platform - Production Environment Startup (Linux)"
echo "================================================"

# Privileged ports (80/443) capability check
NEED_AUTHBIND=false
if [[ ${EUID:-$(id -u)} -ne 0 ]]; then
  CAN_BIND=false
  if command -v getcap >/dev/null 2>&1 && command -v setcap >/dev/null 2>&1; then
    if getcap "$(command -v node)" 2>/dev/null | grep -q "cap_net_bind_service=ep"; then
      CAN_BIND=true
    fi
  fi

  if [[ "${CAN_BIND}" != true ]]; then
    if command -v authbind >/dev/null 2>&1; then
      echo "INFO: Running without root; will use authbind to access ports 80/443"
      NEED_AUTHBIND=true
      CAN_BIND=true
    fi
  fi

  if [[ "${CAN_BIND}" != true ]]; then
    echo "ERROR: Need permission to bind privileged ports 80/443."
    echo "Options:"
    echo "  1) Run with sudo: sudo ./start-production.sh"
    echo "  2) Grant Node capability: sudo setcap 'cap_net_bind_service=+ep' $(command -v node)"
    echo "  3) Install and use authbind: sudo apt-get install -y authbind && sudo touch /etc/authbind/byport/{80,443} && sudo chown $(id -u):$(id -g) /etc/authbind/byport/{80,443} && sudo chmod 755 /etc/authbind/byport/{80,443}"
    exit 1
  fi
fi

# Ensure we run at repo root
if [[ ! -f "server/index.js" ]]; then
  echo "ERROR: Please run this script from the project root directory"
  echo "Current directory: $(pwd)"
  exit 1
fi

echo "PASS: Root privileges verified"

# Production environment variables
export NODE_ENV=production
export HTTP_PORT=80
export HTTPS_PORT=443
export HTTPS=true
export DOMAIN=mfa.example.com
export JWT_SECRET=mfa-production-jwt-secret-change-this-in-production-please
export JWT_EXPIRES_IN=24h
export ADMIN_USERNAME=admin
export ADMIN_PASSWORD=ChangeMe!
export ADMIN_EMAIL=admin@example.com
export DB_PATH=./data/mfa.db
export WECHAT_CORP_ID=your_corp_id_here
export WECHAT_AGENT_ID=your_agent_id_here
export WECHAT_SECRET=your_wechat_app_secret_here
export WECHAT_REDIRECT_URI=https://mfa.example.com/api/wechat/callback
export MFA_ISSUER="MFA Management Platform"
export MFA_SERVICE_NAME=mfa.example.com
export TOTP_WINDOW=2
export TOTP_DIGITS=6
export TOTP_PERIOD=30
export SESSION_SECRET=mfa-production-session-secret-change-this
export RATE_LIMIT_WINDOW=15
export RATE_LIMIT_MAX=50
export BCRYPT_ROUNDS=14
export LOG_LEVEL=warn
export LOG_FILE_PATH=./logs/app.log
export ACCESS_LOG_PATH=./logs/access.log
export INTERNAL_IP_RANGES=192.168.0.0/16,10.0.0.0/8,172.16.0.0/12,127.0.0.1/32
export EXTERNAL_GATEWAY_IPS=${EXTERNAL_GATEWAY_IPS:-10.0.0.0/24}
export SSL_CERT_PATH=./ssl/server.crt
export SSL_KEY_PATH=./ssl/server.key
export SSL_PFX_PATH=./ssl/server.pfx
export DEBUG=false
export MOCK_WECHAT=false
export PROXY_TIMEOUT_MS=${PROXY_TIMEOUT_MS:-300000}
export AUTO_KILL_PORTS=${AUTO_KILL_PORTS:-true}
export AUTO_KILL_GRACE_MS=${AUTO_KILL_GRACE_MS:-3000}
export FORCE_HTTPS_ALL=${FORCE_HTTPS_ALL:-false}

echo "NOTE: Configure EXTERNAL_GATEWAY_IPS to your reverse proxy private IPs/CIDRs if needed."

echo "Checking directory structure..."

# Ensure required directories
mkdir -p data logs ssl

echo "Checking SSL certificates..."

# Unified SSL certificate check (PFX preferred, fallback to CRT/KEY)
if [[ -f "ssl/server.pfx" ]]; then
  if [[ -f "ssl/cert-password.txt" ]]; then
    echo "PASS: Using PFX certificate format"
    echo "Certificate: ssl/server.pfx"
    echo "Password file: ssl/cert-password.txt"
  else
    echo "ERROR: PFX certificate found but password file missing"
    echo "Please ensure ssl/cert-password.txt exists"
    exit 1
  fi
elif [[ -f "ssl/server.crt" ]]; then
  if [[ -f "ssl/server.key" ]]; then
    echo "PASS: Using separate certificate and key files"
    echo "Certificate: ssl/server.crt"
    echo "Private key: ssl/server.key"
  else
    echo "ERROR: No SSL private key file found"
    echo "Please generate SSL certificate first or extract private key from PFX"
    echo "Command: openssl pkcs12 -in ssl/server.pfx -nocerts -out ssl/server.key -nodes"
    exit 1
  fi
else
  echo "ERROR: No SSL certificate found"
  echo "Please provide one of: ssl/server.pfx (+ ssl/cert-password.txt) OR ssl/server.crt + ssl/server.key"
  exit 1
fi

echo "PASS: SSL certificate check completed"

echo "Checking dependencies..."

# Node.js check
if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: Node.js not installed, please install Node.js 16.x or higher"
  exit 1
fi

echo "PASS: Node.js version check completed"

# Backend deps
if [[ ! -d "node_modules" ]]; then
  echo "Installing backend dependencies..."
  npm install --production
fi

# Verify sqlite3 native module (common cause of 'invalid ELF header' when copied from Windows/Mac)
echo "Verifying sqlite3 native module..."

if [[ -d "node_modules/sqlite3" ]]; then
  BINDING_PATH="node_modules/sqlite3/build/Release/node_sqlite3.node"
  NEED_REBUILD=false
  REASON=""

  if [[ ! -f "${BINDING_PATH}" ]]; then
    NEED_REBUILD=true
    REASON="binding file missing"
  else
    if command -v file >/dev/null 2>&1; then
      FILE_DESC=$(file "${BINDING_PATH}" || true)
      # Expect ELF on Linux. If PE/Mach-O or anything else, rebuild.
      if [[ "${FILE_DESC}" != *"ELF"* ]]; then
        NEED_REBUILD=true
        REASON="invalid binary format (${FILE_DESC})"
      fi
    fi

    if [[ "${NEED_REBUILD}" = false ]]; then
      # Attempt to load the module; on ABI mismatch this will fail
      if ! node -e "require('sqlite3')" >/dev/null 2>&1; then
        NEED_REBUILD=true
        REASON="Node ABI mismatch (require('sqlite3') failed)"
      fi
    fi
  fi

  if [[ "${NEED_REBUILD}" = true ]]; then
    echo "Detected sqlite3 native module issue: ${REASON}"
    echo "Rebuilding sqlite3 from source..."

    # Build prerequisites check
    if ! command -v make >/dev/null 2>&1 || ! command -v g++ >/dev/null 2>&1; then
      echo "ERROR: Build tools missing. Install build-essential (make, g++)."
      echo "Ubuntu/Debian: sudo apt-get update && sudo apt-get install -y build-essential"
      exit 1
    fi
    if ! command -v python3 >/dev/null 2>&1; then
      echo "ERROR: python3 is required to build sqlite3."
      echo "Ubuntu/Debian: sudo apt-get install -y python3"
      exit 1
    fi

    # Rebuild flow
    npm rebuild sqlite3 --build-from-source || npm install sqlite3 --build-from-source

    # Verify again
    if ! node -e "require('sqlite3')" >/dev/null 2>&1; then
      echo "ERROR: sqlite3 still fails to load after rebuild."
      exit 1
    fi
    echo "PASS: sqlite3 native module rebuilt successfully"
  else
    echo "PASS: sqlite3 native module is valid"
  fi
else
  echo "WARNING: sqlite3 is not present. Installing now..."
  npm install sqlite3 --production || npm install sqlite3
fi

# Frontend build if missing
if [[ ! -f "client/build/index.html" ]]; then
  echo "Installing frontend dependencies..."
  (cd client && npm install)
  echo "Building frontend..."
  (cd client && npm run build)
fi

echo "Checking port usage..."

find_pids_for_port() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    lsof -t -iTCP:"${port}" -sTCP:LISTEN 2>/dev/null | sort -u || true
  elif command -v ss >/dev/null 2>&1; then
    ss -ltnp 2>/dev/null | grep -E ":${port}\\b" | sed -n 's/.*pid=\([0-9][0-9]*\).*/\1/p' | sort -u || true
  else
    echo ""
  fi
}

kill_port() {
  local port="$1"
  local grace_ms="$2"
  local pids
  pids=$(find_pids_for_port "${port}")
  if [[ -z "${pids}" ]]; then
    return 0
  fi

  echo "Port ${port} is in use by PIDs: ${pids}"
  echo "Attempting graceful shutdown (SIGTERM, ${grace_ms}ms)"
  for pid in ${pids}; do
    if kill -0 "${pid}" 2>/dev/null; then
      kill -TERM "${pid}" 2>/dev/null || true
    fi
  done

  # wait up to grace_ms for processes to exit
  local waited=0
  local step=100
  while [[ ${waited} -lt ${grace_ms} ]]; do
    local alive=false
    for pid in ${pids}; do
      if kill -0 "${pid}" 2>/dev/null; then
        alive=true
        break
      fi
    done
    if [[ "${alive}" != true ]]; then
      echo "Port ${port} freed"
      return 0
    fi
    sleep 0.1
    waited=$(( waited + step ))
  done

  echo "Forcing shutdown (SIGKILL) for remaining PIDs on port ${port}"
  for pid in ${pids}; do
    if kill -0 "${pid}" 2>/dev/null; then
      kill -KILL "${pid}" 2>/dev/null || true
    fi
  done

  # final check
  pids=$(find_pids_for_port "${port}")
  if [[ -n "${pids}" ]]; then
    echo "WARNING: Failed to free port ${port}. Remaining PIDs: ${pids}"
    return 1
  fi
  echo "Port ${port} freed"
}

handle_port_conflict() {
  local port="$1"
  local in_use=false
  if command -v ss >/dev/null 2>&1; then
    ss -ltnp | grep -q ":${port}\\b" && in_use=true || true
  elif command -v lsof >/dev/null 2>&1; then
    lsof -iTCP:"${port}" -sTCP:LISTEN >/dev/null 2>&1 && in_use=true || true
  fi

  if [[ "${in_use}" == true ]]; then
    if [[ "${AUTO_KILL_PORTS}" == true ]]; then
      kill_port "${port}" "${AUTO_KILL_GRACE_MS}" || true
    else
      echo "WARNING: Port ${port} is already in use"
    fi
  fi
}

handle_port_conflict 80
handle_port_conflict 443

echo "Verifying SSL certificate validity..."

# Verify certificate (if OpenSSL is installed)
if command -v openssl >/dev/null 2>&1 && [[ -f "ssl/server.crt" ]]; then
  echo "Checking certificate details..."
  openssl x509 -in ssl/server.crt -text -noout | grep -i "Not After" || true
  echo
fi

echo "================================================"
echo "Starting MFA Platform (Production Environment)..."
echo "================================================"
echo "HTTP Port: ${HTTP_PORT}"
echo "HTTPS Port: ${HTTPS_PORT}"
echo "Domain: ${DOMAIN}"
echo "Admin Account: ${ADMIN_USERNAME}"
echo "Environment: Production"
echo "Debug Mode: Disabled"
echo "EXTERNAL_GATEWAY_IPS: ${EXTERNAL_GATEWAY_IPS}"
echo "PROXY_TIMEOUT_MS: ${PROXY_TIMEOUT_MS}"
echo "================================================"

echo "Start time: $(date '+%Y-%m-%d %H:%M:%S')"

# Start server (dual HTTP/HTTPS like Windows)
if [[ "${NEED_AUTHBIND}" == true ]]; then
  exec authbind --deep node server/server-windows.js
else
  exec node server/server-windows.js
fi


