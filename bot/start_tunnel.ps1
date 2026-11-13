# Starts a free Serveo HTTPS tunnel to the local Mini App (port 8080),
# writes the new URL into .env and restarts bot.py.
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$log = Join-Path $env:TEMP "ba_serveo.log"
$err = Join-Path $env:TEMP "ba_serveo.err.log"

# Stop previous Serveo tunnels.
Get-Process ssh -ErrorAction SilentlyContinue | ForEach-Object {
    $cmd = (Get-CimInstance Win32_Process -Filter "ProcessId=$($_.Id)").CommandLine
    if ($cmd -like "*serveo.net*") {
        Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
    }
}

Remove-Item $log, $err -Force -ErrorAction SilentlyContinue

$sshArgs = @(
    "-p", "443",
    "-o", "StrictHostKeyChecking=no",
    "-o", "UserKnownHostsFile=NUL",
    "-o", "ServerAliveInterval=30",
    "-R", "80:127.0.0.1:8080",
    "serveo.net"
)

$tunnel = Start-Process -FilePath "ssh" -ArgumentList $sshArgs -WindowStyle Hidden `
    -RedirectStandardOutput $log -RedirectStandardError $err -PassThru

$url = $null
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 1
    if (Test-Path $log) {
        $match = Select-String -Path $log -Pattern "https://[a-zA-Z0-9.-]+\.serveousercontent\.com" |
            Select-Object -First 1
        if ($match) {
            $url = $match.Matches[0].Value
            break
        }
    }
    if ($tunnel.HasExited) {
        throw "Tunnel failed to start. See $err"
    }
}

if (-not $url) {
    throw "Could not read the tunnel URL. See $log"
}

Write-Host "Tunnel URL: $url"

# Update WEBAPP_URL in .env without changing the file encoding.
$envPath = Join-Path $root ".env"
$text = [IO.File]::ReadAllText($envPath, [Text.Encoding]::UTF8)
$text = [Text.RegularExpressions.Regex]::Replace($text, "(?m)^WEBAPP_URL=.*$", "WEBAPP_URL=$url")
[IO.File]::WriteAllText($envPath, $text, (New-Object Text.UTF8Encoding($false)))
Write-Host "WEBAPP_URL updated in .env"

# Restart the bot so it builds a WebApp button with the new URL.
Get-CimInstance Win32_Process -Filter "Name='python.exe'" |
    Where-Object { $_.CommandLine -like "*bot.py*" } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

Start-Sleep -Seconds 2

$python = (Get-Command python).Source
Start-Process -FilePath $python -ArgumentList "bot.py" -WorkingDirectory $root -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $root "bot.out.log") `
    -RedirectStandardError (Join-Path $root "bot.err.log")

Write-Host "Bot restarted. Open Telegram and press the Mini App button."
Write-Host "Keep this computer and the tunnel process running."
