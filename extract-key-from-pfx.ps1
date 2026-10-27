# Extract private key from PFX file
param(
    [Parameter(Mandatory=$false)]
    [string]$PfxPath = ".\ssl\server.pfx",
    
    [Parameter(Mandatory=$false)]
    [string]$PasswordFile = ".\ssl\cert-password.txt",
    
    [Parameter(Mandatory=$false)]
    [string]$OutputKey = ".\ssl\server.key"
)

Write-Host "Extracting private key from PFX file..." -ForegroundColor Green

if (!(Test-Path $PfxPath)) {
    Write-Host "ERROR: PFX file not found: $PfxPath" -ForegroundColor Red
    exit 1
}

if (!(Test-Path $PasswordFile)) {
    Write-Host "ERROR: Password file not found: $PasswordFile" -ForegroundColor Red
    exit 1
}

try {
    # Read password from file
    $password = Get-Content $PasswordFile -Raw
    $password = $password.Trim()
    
    Write-Host "Reading PFX file with password..." -ForegroundColor Yellow
    
    # Check if OpenSSL is available
    $opensslAvailable = Get-Command openssl -ErrorAction SilentlyContinue
    
    if ($opensslAvailable) {
        Write-Host "Using OpenSSL to extract private key..." -ForegroundColor Cyan
        
        # Use OpenSSL to extract private key
        $opensslCmd = "openssl pkcs12 -in `"$PfxPath`" -nocerts -out `"$OutputKey`" -nodes -passin pass:$password"
        
        try {
            Invoke-Expression $opensslCmd
            
            if (Test-Path $OutputKey) {
                Write-Host "SUCCESS: Private key extracted to $OutputKey" -ForegroundColor Green
                
                # Verify the key file
                $keyContent = Get-Content $OutputKey -Raw
                if ($keyContent -like "*BEGIN PRIVATE KEY*" -or $keyContent -like "*BEGIN RSA PRIVATE KEY*") {
                    Write-Host "VERIFIED: Private key format is correct" -ForegroundColor Green
                } else {
                    Write-Host "WARNING: Private key format may be incorrect" -ForegroundColor Yellow
                }
                
            } else {
                Write-Host "ERROR: Failed to create private key file" -ForegroundColor Red
                exit 1
            }
            
        } catch {
            Write-Host "ERROR: OpenSSL extraction failed: $($_.Exception.Message)" -ForegroundColor Red
            exit 1
        }
        
    } else {
        Write-Host "OpenSSL not available, using PowerShell method..." -ForegroundColor Yellow
        
        try {
            # Use .NET to read PFX and export private key
            Add-Type -AssemblyName System.Security
            
            $pfxBytes = [System.IO.File]::ReadAllBytes((Resolve-Path $PfxPath).Path)
            $cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($pfxBytes, $password, [System.Security.Cryptography.X509Certificates.X509KeyStorageFlags]::Exportable)
            
            if ($cert.HasPrivateKey) {
                $privateKey = $cert.PrivateKey
                
                # Export private key in PEM format
                $keyPem = "-----BEGIN PRIVATE KEY-----`n"
                $keyBytes = $privateKey.ExportPkcs8PrivateKey()
                $keyBase64 = [System.Convert]::ToBase64String($keyBytes)
                
                # Split into 64-character lines
                for ($i = 0; $i -lt $keyBase64.Length; $i += 64) {
                    $line = $keyBase64.Substring($i, [Math]::Min(64, $keyBase64.Length - $i))
                    $keyPem += "$line`n"
                }
                $keyPem += "-----END PRIVATE KEY-----`n"
                
                # Write to file
                $keyPem | Out-File -FilePath $OutputKey -Encoding ASCII -NoNewline
                
                Write-Host "SUCCESS: Private key extracted using PowerShell method" -ForegroundColor Green
                Write-Host "Output file: $OutputKey" -ForegroundColor Cyan
                
            } else {
                Write-Host "ERROR: PFX file does not contain a private key" -ForegroundColor Red
                exit 1
            }
            
        } catch {
            Write-Host "ERROR: PowerShell extraction failed: $($_.Exception.Message)" -ForegroundColor Red
            Write-Host "Trying alternative method..." -ForegroundColor Yellow
            
            # Alternative: Export as PFX then convert
            try {
                $tempPfx = ".\ssl\temp-export.pfx"
                $cert.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Pfx, $password) | Set-Content $tempPfx -Encoding Byte
                
                Write-Host "Created temporary PFX, please use OpenSSL manually:" -ForegroundColor Yellow
                Write-Host "Command: openssl pkcs12 -in ssl\temp-export.pfx -nocerts -out ssl\server.key -nodes" -ForegroundColor White
                Write-Host "Password: $password" -ForegroundColor White
                
            } catch {
                Write-Host "ERROR: All extraction methods failed" -ForegroundColor Red
                Write-Host "Please install OpenSSL or manually extract the private key" -ForegroundColor Yellow
                exit 1
            }
        }
    }
    
    # Verify final result
    if (Test-Path $OutputKey) {
        $keySize = (Get-Item $OutputKey).Length
        Write-Host "Final verification:" -ForegroundColor Green
        Write-Host "  Private key file: $OutputKey" -ForegroundColor White
        Write-Host "  File size: $keySize bytes" -ForegroundColor White
        
        if ($keySize -gt 100) {
            Write-Host "  Status: Ready for production use" -ForegroundColor Green
        } else {
            Write-Host "  Status: File too small, may be corrupted" -ForegroundColor Yellow
        }
    }
    
} catch {
    Write-Host "ERROR: Unexpected error: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host "`nPrivate key extraction completed!" -ForegroundColor Green 