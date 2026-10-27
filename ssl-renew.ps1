# MFA Platform - SSL Certificate Auto-Renewal Script
# Auto-renew Let's Encrypt certificates

param(
    [Parameter(Mandatory=$false)]
    [string]$Domain = "mfa.example.com",
    
    [Parameter(Mandatory=$false)]
    [string]$Email = "admin@example.com",
    
    [Parameter(Mandatory=$false)]
    [switch]$Force = $false
)

Write-Host "==================================================" -ForegroundColor Green
Write-Host "🔄 SSL证书自动续期脚本" -ForegroundColor Green
Write-Host "==================================================" -ForegroundColor Green

$sslDir = ".\ssl"
$certFile = Join-Path $sslDir "server.crt"
$winAcmePath = ".\tools\wacs.exe"

# Check if certificate exists
if (!(Test-Path $certFile)) {
    Write-Host "❌ 未找到现有证书文件" -ForegroundColor Red
    Write-Host "请先运行: .\generate-production-ssl.ps1" -ForegroundColor Yellow
    exit 1
}

# Check certificate expiry
if (Get-Command openssl -ErrorAction SilentlyContinue) {
    $expiryInfo = & openssl x509 -in $certFile -text -noout | Select-String "Not After"
    if ($expiryInfo) {
        $expiryText = $expiryInfo.ToString().Split(':',2)[1].Trim()
        try {
            $expiryDate = [DateTime]::ParseExact($expiryText, "MMM dd HH:mm:ss yyyy GMT", $null)
            $daysLeft = ($expiryDate - (Get-Date)).Days
            
            Write-Host "📅 证书到期时间: $expiryDate" -ForegroundColor Cyan
            Write-Host "⏰ 剩余天数: $daysLeft 天" -ForegroundColor Cyan
            
            if ($daysLeft -gt 30 -and !$Force) {
                Write-Host "✅ 证书还有 $daysLeft 天到期，无需续期" -ForegroundColor Green
                Write-Host "💡 如需强制续期，请使用 -Force 参数" -ForegroundColor Yellow
                exit 0
            }
        } catch {
            Write-Host "⚠️  无法解析证书到期时间，将继续续期" -ForegroundColor Yellow
        }
    }
} else {
    Write-Host "⚠️  未安装OpenSSL，无法检查证书到期时间" -ForegroundColor Yellow
}

# Check if win-acme exists
if (!(Test-Path $winAcmePath)) {
    Write-Host "❌ 未找到 win-acme 工具" -ForegroundColor Red
    Write-Host "请先运行: .\generate-production-ssl.ps1" -ForegroundColor Yellow
    exit 1
}

Write-Host "🔄 开始续期证书..." -ForegroundColor Green

# Stop MFA service (optional, uncomment if needed)
# Write-Host "⏸️  停止MFA服务..." -ForegroundColor Yellow
# Stop-Process -Name "node" -Force -ErrorAction SilentlyContinue

try {
    # Renew certificate
    $renewArgs = @(
        "--renew",
        "--verbose"
    )
    
    Write-Host "执行续期命令..." -ForegroundColor Yellow
    & $winAcmePath @renewArgs
    
    # Check if new certificate was generated
    $newCertFile = Join-Path $sslDir "$Domain-crt.pem"
    $newKeyFile = Join-Path $sslDir "$Domain-key.pem"
    
    if (Test-Path $newCertFile -and Test-Path $newKeyFile) {
        # Update server certificate files
        Copy-Item $newCertFile (Join-Path $sslDir "server.crt") -Force
        Copy-Item $newKeyFile (Join-Path $sslDir "server.key") -Force
        
        # Update PFX file
        $pfxPath = Join-Path $sslDir "server.pfx"
        $password = -join ((65..90) + (97..122) + (48..57) | Get-Random -Count 16 | % {[char]$_})
        
        if (Get-Command openssl -ErrorAction SilentlyContinue) {
            & openssl pkcs12 -export -out $pfxPath -inkey $newKeyFile -in $newCertFile -password "pass:$password"
            $password | Out-File -FilePath (Join-Path $sslDir "cert-password.txt") -Encoding UTF8
        }
        
        Write-Host "✅ 证书续期成功!" -ForegroundColor Green
        Write-Host "📁 新证书文件已更新" -ForegroundColor Cyan
        
        # Record renewal
        $renewalLog = Join-Path $sslDir "renewal.log"
        "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss'): 证书续期成功" | Add-Content $renewalLog
        
        Write-Host "`n🔄 请重启MFA服务以使用新证书:" -ForegroundColor Yellow
        Write-Host "   stop-windows.bat" -ForegroundColor White
        Write-Host "   start-windows.bat" -ForegroundColor White
        
    } else {
        Write-Host "❌ 证书续期可能失败，请检查日志" -ForegroundColor Red
        exit 1
    }
    
} catch {
    Write-Error "❌ 证书续期失败: $($_.Exception.Message)"
    exit 1
} finally {
    # Restart MFA service (optional, uncomment if needed)
    # Write-Host "🚀 启动MFA服务..." -ForegroundColor Green
    # Start-Process -FilePath "start-windows.bat" -NoNewWindow
}

Write-Host "`n📋 自动续期任务设置建议:" -ForegroundColor Green
Write-Host "1. 设置Windows计划任务，每月运行一次此脚本" -ForegroundColor White
Write-Host "2. 任务命令: PowerShell.exe -File `"$($MyInvocation.MyCommand.Path)`"" -ForegroundColor White
Write-Host "3. 设置在低使用率时间运行（如凌晨3点）" -ForegroundColor White

Write-Host "`n✅ 证书续期流程完成!" -ForegroundColor Green 