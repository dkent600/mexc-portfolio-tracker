Set-Location -Path $PSScriptRoot
. .\_shared.ps1


function Wait-ForVpnIp {
  $expectedPrefix = $env.VPN_IP
  $maxAttempts = 10
  $attempt = 0

  while ($attempt -lt $maxAttempts) {
    try {
      $ip = (Invoke-RestMethod "https://api.ipify.org?format=text") -replace '\s', ''
      log "Current IP: $ip"

      if ($ip -match "^$expectedPrefix") {
        log "VPN IP confirmed: $ip"
        return
      }
    }
    catch {
      log "Could not get IP. Retrying..."
    }

    Start-Sleep -Seconds 3
    $attempt++
  }

  throw "Failed to detect VPN IP after $($maxAttempts * 3) seconds."
}
  
# Always disconnect VPN no matter what happens
try {
  log "Disconnecting NordVPN..."
  nordvpn -d | Out-Null
  Start-Sleep -Seconds 2

  log "Connecting to NordVPN Dedicated IP..."
  nordvpn -c -g "Dedicated IP" -n "Portugal #126" | Out-Null

  Wait-ForVpnIp

  log "Running portfolio tracker script..."
  node .\dist\index.js
}
catch {
  log "Error: $($_.Exception.Message)"
}
finally {
  # Disconnect VPN even if there was an error
  log "Disconnecting from NordVPN..."
  nordvpn  -d | Out-Null
  log "Exiting, code: $LASTEXITCODE"
}
