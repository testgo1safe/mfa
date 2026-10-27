# MFA Platform - SSL Certificate Generation Script
# Generate self-signed SSL certificate for Windows environment

Write-Host "Generating SSL self-signed certificate..." -ForegroundColor Green

# Ensure SSL directory exists
$sslDir = ".\ssl"
if (!(Test-Path $sslDir)) {
    New-Item -ItemType Directory -Path $sslDir -Force
    Write-Host "Created SSL directory: $sslDir" -ForegroundColor Yellow
}

# Generate self-signed certificate
$certParams = @{
    DnsName = @("localhost", "mfa.example.com", "127.0.0.1")
    CertStoreLocation = "Cert:\LocalMachine\My"
    KeyUsage = "DigitalSignature", "KeyEncipherment"
    KeyAlgorithm = "RSA"
    KeyLength = 2048
    HashAlgorithm = "SHA256"
    Provider = "Microsoft RSA SChannel Cryptographic Provider"
    Subject = "CN=mfa.example.com"
    FriendlyName = "MFA Platform Self-Signed Certificate"
    NotAfter = (Get-Date).AddYears(1)
}

try {
    # Generate certificate
    $cert = New-SelfSignedCertificate @certParams
    Write-Host "Certificate generated successfully, Thumbprint: $($cert.Thumbprint)" -ForegroundColor Green
    
    # Export certificate files
    $certPath = Join-Path $sslDir "server.crt"
    $keyPath = Join-Path $sslDir "server.key" 
    $pfxPath = Join-Path $sslDir "server.pfx"
    
    # Generate random password
    $password = -join ((65..90) + (97..122) + (48..57) | Get-Random -Count 12 | % {[char]$_})
    $securePassword = ConvertTo-SecureString -String $password -Force -AsPlainText
    
    # Export PFX file
    Export-PfxCertificate -Cert $cert -FilePath $pfxPath -Password $securePassword | Out-Null
    Write-Host "PFX certificate exported: $pfxPath" -ForegroundColor Green
    
    # Export CRT and KEY files using OpenSSL if available
    if (Get-Command openssl -ErrorAction SilentlyContinue) {
        # Convert to PEM format if OpenSSL is available
        & openssl pkcs12 -in $pfxPath -out $certPath -clcerts -nokeys -passin "pass:$password" 2>$null
        & openssl pkcs12 -in $pfxPath -out $keyPath -nocerts -nodes -passin "pass:$password" 2>$null
        Write-Host "Certificate file exported: $certPath" -ForegroundColor Green
        Write-Host "Private key file exported: $keyPath" -ForegroundColor Green
    } else {
        Write-Host "OpenSSL not found, will use PFX format certificate" -ForegroundColor Yellow
    }
    
    # Save certificate password to file
    $password | Out-File -FilePath (Join-Path $sslDir "cert-password.txt") -Encoding UTF8
    Write-Host "Certificate password saved to: ssl\cert-password.txt" -ForegroundColor Yellow
    
    # Trust certificate (optional)
    $store = New-Object System.Security.Cryptography.X509Certificates.X509Store([System.Security.Cryptography.X509Certificates.StoreName]::Root, [System.Security.Cryptography.X509Certificates.StoreLocation]::LocalMachine)
    $store.Open([System.Security.Cryptography.X509Certificates.OpenFlags]::ReadWrite)
    $store.Add($cert)
    $store.Close()
    Write-Host "Certificate added to Trusted Root Certificate Authorities" -ForegroundColor Green
    
    Write-Host "`nCertificate generation completed!" -ForegroundColor Green
    Write-Host "Certificate validity: 1 year" -ForegroundColor Cyan
    Write-Host "Supported domains: localhost, mfa.example.com, 127.0.0.1" -ForegroundColor Cyan
    Write-Host "Certificate location: $sslDir" -ForegroundColor Cyan
    
} catch {
    Write-Error "Certificate generation failed: $($_.Exception.Message)"
    Write-Host "Please run this script as Administrator" -ForegroundColor Red
    exit 1
}

Write-Host "`nPress any key to continue..." -ForegroundColor Yellow
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown") 