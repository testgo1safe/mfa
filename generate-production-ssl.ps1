# MFA Platform - Production SSL Certificate Generation Script
# Generate production SSL certificate for mfa.example.com

param(
    [Parameter(Mandatory=$false)]
    [ValidateSet("letsencrypt", "manual")]
    [string]$Method = "letsencrypt",
    
    [Parameter(Mandatory=$false)]
    [string]$Email = "admin@example.com",
    
    [Parameter(Mandatory=$false)]
    [string]$Domain = "mfa.example.com"
)

Write-Host "==================================================" -ForegroundColor Green
Write-Host "SSL Certificate Generation Tool for MFA Platform" -ForegroundColor Green
Write-Host "==================================================" -ForegroundColor Green
Write-Host "Domain: $Domain" -ForegroundColor Cyan
Write-Host "Method: $Method" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Green

# Ensure SSL directory exists
$sslDir = ".\ssl"
if (!(Test-Path $sslDir)) {
    New-Item -ItemType Directory -Path $sslDir -Force
    Write-Host "Created SSL directory: $sslDir" -ForegroundColor Yellow
}

if ($Method -eq "letsencrypt") {
    Write-Host "Generating Let's Encrypt SSL certificate..." -ForegroundColor Green
    
    # Check if win-acme exists
    $winAcmePath = ".\tools\wacs.exe"
    if (!(Test-Path $winAcmePath)) {
        Write-Host "Downloading win-acme tool..." -ForegroundColor Yellow
        
        # Create tools directory
        $toolsDir = ".\tools"
        if (!(Test-Path $toolsDir)) {
            New-Item -ItemType Directory -Path $toolsDir -Force
        }
        
        # Download win-acme
        $downloadUrl = "https://github.com/win-acme/win-acme/releases/latest/download/win-acme.v2.2.9.1701.x64.pluggable.zip"
        $zipFile = Join-Path $toolsDir "win-acme.zip"
        
        try {
            Invoke-WebRequest -Uri $downloadUrl -OutFile $zipFile -UseBasicParsing
            Expand-Archive -Path $zipFile -DestinationPath $toolsDir -Force
            Remove-Item $zipFile
            Write-Host "win-acme download completed" -ForegroundColor Green
        } catch {
            Write-Error "Download failed: $($_.Exception.Message)"
            Write-Host "Please download manually: https://github.com/win-acme/win-acme/releases" -ForegroundColor Red
            exit 1
        }
    }
    
    Write-Host "`nLet's Encrypt certificate request steps:" -ForegroundColor Yellow
    Write-Host "1. Ensure domain $Domain resolves to this server" -ForegroundColor White
    Write-Host "2. Ensure ports 80 and 443 are accessible from internet" -ForegroundColor White
    Write-Host "3. Temporarily stop current MFA service" -ForegroundColor White
    Write-Host "`nPlease confirm the above conditions are met..." -ForegroundColor Red
    
    $confirm = Read-Host "Continue with certificate request? (y/n)"
    if ($confirm -ne "y" -and $confirm -ne "Y") {
        Write-Host "Operation cancelled" -ForegroundColor Red
        exit 0
    }
    
    # Generate Let's Encrypt certificate
    $acmeArgs = @(
        "--source", "manual",
        "--host", $Domain,
        "--validation", "http-01",
        "--store", "pemfiles",
        "--pemfilespath", (Resolve-Path $sslDir).Path,
        "--accepttos",
        "--emailaddress", $Email,
        "--verbose"
    )
    
    Write-Host "`nExecuting certificate request..." -ForegroundColor Green
    Write-Host "Command: $winAcmePath $($acmeArgs -join ' ')" -ForegroundColor Gray
    
    try {
        & $winAcmePath @acmeArgs
        
        # Check if certificate files were created
        $certFile = Join-Path $sslDir "$Domain-crt.pem"
        $keyFile = Join-Path $sslDir "$Domain-key.pem"
        
        if (Test-Path $certFile -and Test-Path $keyFile) {
            # Convert to server.crt and server.key format
            Copy-Item $certFile (Join-Path $sslDir "server.crt") -Force
            Copy-Item $keyFile (Join-Path $sslDir "server.key") -Force
            
            # Create PFX file
            $pfxPath = Join-Path $sslDir "server.pfx"
            $password = -join ((65..90) + (97..122) + (48..57) | Get-Random -Count 16 | % {[char]$_})
            
            if (Get-Command openssl -ErrorAction SilentlyContinue) {
                & openssl pkcs12 -export -out $pfxPath -inkey $keyFile -in $certFile -password "pass:$password"
                $password | Out-File -FilePath (Join-Path $sslDir "cert-password.txt") -Encoding UTF8
            }
            
            Write-Host "`nLet's Encrypt certificate request successful!" -ForegroundColor Green
            Write-Host "Certificate files location: $sslDir" -ForegroundColor Cyan
            Write-Host "Certificate file: server.crt" -ForegroundColor Cyan
            Write-Host "Private key file: server.key" -ForegroundColor Cyan
            Write-Host "PFX file: server.pfx" -ForegroundColor Cyan
            Write-Host "Certificate validity: 90 days (auto-renewal)" -ForegroundColor Cyan
            
        } else {
            Write-Host "`nCertificate request failed, please check logs" -ForegroundColor Red
            Write-Host "Common issues:" -ForegroundColor Yellow
            Write-Host "   1. Domain does not resolve to this server" -ForegroundColor White
            Write-Host "   2. Firewall blocks ports 80/443" -ForegroundColor White
            Write-Host "   3. Server is running and using port 80" -ForegroundColor White
        }
        
    } catch {
        Write-Error "Error during certificate request: $($_.Exception.Message)"
    }
    
} elseif ($Method -eq "manual") {
    Write-Host "Generating Certificate Signing Request (CSR) for commercial certificate..." -ForegroundColor Green
    
    # Generate private key
    $keyPath = Join-Path $sslDir "server.key"
    $csrPath = Join-Path $sslDir "server.csr"
    $configPath = Join-Path $sslDir "openssl.conf"
    
    # Create OpenSSL config
    $opensslConfig = @"
[req]
distinguished_name = req_distinguished_name
req_extensions = v3_req
prompt = no

[req_distinguished_name]
C=CN
ST=Beijing
L=Beijing
O=Thape Company
OU=IT Department
CN=$Domain

[v3_req]
keyUsage = keyEncipherment, dataEncipherment
extendedKeyUsage = serverAuth
subjectAltName = @alt_names

[alt_names]
DNS.1 = $Domain
DNS.2 = *.$($Domain.Split('.', 2)[1])
"@
    
    $opensslConfig | Out-File -FilePath $configPath -Encoding UTF8
    
    if (Get-Command openssl -ErrorAction SilentlyContinue) {
        Write-Host "Generating private key..." -ForegroundColor Yellow
        & openssl genrsa -out $keyPath 2048
        
        Write-Host "Generating certificate signing request..." -ForegroundColor Yellow  
        & openssl req -new -key $keyPath -out $csrPath -config $configPath
        
        Write-Host "`nCSR generation completed!" -ForegroundColor Green
        Write-Host "File locations:" -ForegroundColor Cyan
        Write-Host "   Private key: $keyPath" -ForegroundColor White
        Write-Host "   CSR file: $csrPath" -ForegroundColor White
        Write-Host "   Config file: $configPath" -ForegroundColor White
        
        Write-Host "`nNext steps:" -ForegroundColor Yellow
        Write-Host "1. Submit server.csr file content to Certificate Authority (CA)" -ForegroundColor White
        Write-Host "2. CA will verify domain ownership and issue certificate" -ForegroundColor White
        Write-Host "3. Save received certificate as ssl/server.crt" -ForegroundColor White
        Write-Host "4. Restart MFA service to use new certificate" -ForegroundColor White
        
        Write-Host "`nCSR content (submit to CA):" -ForegroundColor Green
        Write-Host "===========================================" -ForegroundColor Gray
        Get-Content $csrPath | Write-Host -ForegroundColor White
        Write-Host "===========================================" -ForegroundColor Gray
        
    } else {
        Write-Host "OpenSSL tool not found" -ForegroundColor Red
        Write-Host "Please install OpenSSL: https://slproweb.com/products/Win32OpenSSL.html" -ForegroundColor Yellow
        
        # Provide PowerShell alternative
        Write-Host "`nUsing PowerShell to generate certificate request..." -ForegroundColor Yellow
        
        $certReq = @{
            Subject = "CN=$Domain,O=Thape Company,L=Beijing,S=Beijing,C=CN"
            KeyAlgorithm = "RSA"
            KeyLength = 2048
            HashAlgorithm = "SHA256"
            KeyUsage = "DigitalSignature", "KeyEncipherment"
        }
        
        # This would create a certificate request, but we need CSR format for CA submission
        Write-Host "Recommend installing OpenSSL for standard CSR format" -ForegroundColor Yellow
    }
}

Write-Host "`nServer configuration after certificate installation:" -ForegroundColor Green
Write-Host "1. Ensure ssl/server.crt and ssl/server.key files exist" -ForegroundColor White
Write-Host "2. Run: start-production.bat" -ForegroundColor White
Write-Host "3. Server will automatically use new SSL certificate" -ForegroundColor White

Write-Host "`nAuto-renewal (Let's Encrypt only):" -ForegroundColor Green
Write-Host "Let's Encrypt certificates expire after 90 days, auto-renewal task needed" -ForegroundColor White

Write-Host "`nSSL certificate generation process completed!" -ForegroundColor Green 