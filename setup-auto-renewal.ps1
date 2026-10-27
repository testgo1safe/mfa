# MFA Platform - Setup SSL Auto-Renewal Task
# Create Windows Scheduled Task for automatic SSL certificate renewal

param(
    [Parameter(Mandatory=$false)]
    [string]$TaskName = "MFA-SSL-AutoRenewal",
    
    [Parameter(Mandatory=$false)]
    [string]$RunTime = "03:00"
)

Write-Host "==================================================" -ForegroundColor Green
Write-Host "⏰ 设置SSL证书自动续期任务" -ForegroundColor Green
Write-Host "==================================================" -ForegroundColor Green

# Check if running as administrator
if (-NOT ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
    Write-Host "❌ 此脚本需要管理员权限" -ForegroundColor Red
    Write-Host "请右键点击PowerShell，选择'以管理员身份运行'" -ForegroundColor Yellow
    exit 1
}

$currentPath = Get-Location
$renewalScript = Join-Path $currentPath "ssl-renew.ps1"

# Check if renewal script exists
if (!(Test-Path $renewalScript)) {
    Write-Host "❌ 未找到续期脚本: $renewalScript" -ForegroundColor Red
    exit 1
}

try {
    # Check if task already exists
    $existingTask = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if ($existingTask) {
        Write-Host "⚠️  任务 '$TaskName' 已存在，正在删除..." -ForegroundColor Yellow
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    }
    
    # Create scheduled task action
    $action = New-ScheduledTaskAction -Execute "PowerShell.exe" -Argument "-File `"$renewalScript`" -ExecutionPolicy Bypass"
    
    # Create scheduled task trigger (monthly on the 1st at specified time)
    $trigger = New-ScheduledTaskTrigger -Monthly -DaysOfMonth 1 -At $RunTime
    
    # Create scheduled task settings
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RunOnlyIfNetworkAvailable
    
    # Create scheduled task principal (run as SYSTEM)
    $principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
    
    # Register the scheduled task
    Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description "自动续期MFA平台SSL证书"
    
    Write-Host "✅ 自动续期任务创建成功!" -ForegroundColor Green
    Write-Host "📋 任务详情:" -ForegroundColor Cyan
    Write-Host "   任务名称: $TaskName" -ForegroundColor White
    Write-Host "   执行时间: 每月1号 $RunTime" -ForegroundColor White
    Write-Host "   执行脚本: $renewalScript" -ForegroundColor White
    Write-Host "   运行账户: SYSTEM" -ForegroundColor White
    
    # Show task status
    $task = Get-ScheduledTask -TaskName $TaskName
    Write-Host "   当前状态: $($task.State)" -ForegroundColor White
    
    Write-Host "`n📋 任务管理命令:" -ForegroundColor Yellow
    Write-Host "   查看任务: Get-ScheduledTask -TaskName `"$TaskName`"" -ForegroundColor White
    Write-Host "   手动运行: Start-ScheduledTask -TaskName `"$TaskName`"" -ForegroundColor White
    Write-Host "   删除任务: Unregister-ScheduledTask -TaskName `"$TaskName`"" -ForegroundColor White
    
    Write-Host "`n💡 测试建议:" -ForegroundColor Yellow
    Write-Host "1. 手动运行一次任务验证是否正常" -ForegroundColor White
    Write-Host "2. 检查任务历史记录确认执行状态" -ForegroundColor White
    Write-Host "3. 查看证书续期日志: ssl\renewal.log" -ForegroundColor White
    
} catch {
    Write-Error "❌ 创建任务失败: $($_.Exception.Message)"
    exit 1
}

Write-Host "`n✅ SSL自动续期配置完成!" -ForegroundColor Green 