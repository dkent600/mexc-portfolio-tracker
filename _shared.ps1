# Load .env file
function loadenv {
  # script must be running in same folder as the .env
  Get-Content ".env" | ForEach-Object {
      if ($_ -match '^\s*([^#][^=]*)=(.*)$') {
          $key = $matches[1].Trim()
          $value = $matches[2].Trim().Trim('"')  # Remove quotes if any
          Set-Item -Path "env:$key" -Value $value
      }
  }
}

loadenv

# Define project path
$env:LOGFILEPATH = "$PSScriptRoot\$env:LOGFILENAME"

function log {
  param (
        [string]$message
    )
  # Append the message to the log file
  $message | Out-File -FilePath $env:LOGFILEPATH -Encoding UTF8 -Append
  # Add-Content -Path $env:LOGFILEPATH -Value $message

  # write to console 
  Write-Host $message
}

function initlog {
  log "--- $((Get-Date).ToString("yyyy-MM-dd HH:mm")) ---";
}

initlog