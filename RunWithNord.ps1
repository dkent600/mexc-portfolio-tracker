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

  # Run the Node.js script
  log "Running portfolio tracker script..."
  node .\dist\index.js
}
finally {
}

log "Done"
