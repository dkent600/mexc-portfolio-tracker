function Wait-ForVpnIp {
    $expectedPrefix = "89.117.195.109"  # Optional: e.g., "189.40."
    $maxAttempts = 20
    $attempt = 0

    while ($attempt -lt $maxAttempts) {
        try {
            $ip = (Invoke-RestMethod "https://api.ipify.org?format=text") -replace '\s',''
            log "Current IP: $ip"

            if ($ip -match "^$expectedPrefix") {
                log "VPN IP confirmed: $ip"
                return
            }
        } catch {
            log "Could not get IP. Retrying..."
        }

        Start-Sleep -Seconds 3
        $attempt++
    }

    throw "Failed to detect VPN IP after $($maxAttempts * 3) seconds."
}

# Define project path
$projectPath = "C:\Users\vmuser\Documents\mexc-portfolio-tracker"
$logFilePath = ".\portfolio-log.txt"

function log {
  param (
        [string]$message
    )
  # Append the message to the log file
  $message | Out-File -FilePath $logFilePath -Encoding UTF8 -Append
  Write-Host $message
}

  
# Always disconnect VPN no matter what happens
try {

  # Change to the project directory
  cd $projectPath
  
  log "Switched to project directory..."

  # Connect to NordVPN Dedicated IP in Portugal
  log "Connecting to NordVPN Dedicated IP..."
  nordvpn -c -g "Dedicated IP" -n "Portugal #126"

  # Wait for the connection to stabilize
  # Start-Sleep -Seconds 10
  Wait-ForVpnIp

  # Write the output of the following command to the console
  # nordvpn -v


  # Run the Node.js script
  log "Running portfolio tracker script..."
  node .\dist\index.js
}
finally {
  # Disconnect VPN even if there was an error
  log "Disconnecting from NordVPN..."
  nordvpn -d
}

log "Done"
