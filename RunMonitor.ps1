Set-Location -Path $PSScriptRoot
. .\_shared.ps1
  
# Always disconnect VPN no matter what happens
try {
  # Run the Node.js script
  log "Running portfolio tracker script..."
  node .\dist\index.js
}
catch {
  log "Error: $($_.Exception.Message)"
}
finally {
  log "Exiting, code: $LASTEXITCODE"
  exit 0
}

