# Connect to NordVPN Dedicated IP in Portugal
Write-Host "Connecting to NordVPN Dedicated IP..."
nordvpn -c -g "Dedicated IP" -n "Portugal #126"

# Wait for the connection to stabilize
Start-Sleep -Seconds 10

# Always disconnect VPN no matter what happens
try {
  # Define your project path
  $projectPath = "C:\Users\dkent\Documents\Projects\mexc-portfolio-tracker"

  # Change to the project directory
  Write-Host "Switching to project directory..."
  cd $projectPath

  # Run the Node.js script
  Write-Host "Running portfolio tracker script..."
  node .\dist\index.js
}
finally {
  # Disconnect VPN even if there was an error
  Write-Host "Disconnecting from NordVPN..."
  nordvpn -d
}

Write-Host "Done."

