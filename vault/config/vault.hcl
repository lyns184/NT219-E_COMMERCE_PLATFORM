# Vault Server Configuration (Production)
# =========================================

# Storage backend - File-based for single node
storage "file" {
  path = "/vault/data"
}

# Listener configuration
listener "tcp" {
  address     = "0.0.0.0:8200"
  tls_disable = true  # Enable TLS in production with proper certificates
}

# API address for clients
api_addr = "http://0.0.0.0:8200"
cluster_addr = "http://0.0.0.0:8201"

# UI Configuration
ui = true

# Logging
log_level = "info"

# Disable memory lock (required for Docker without IPC_LOCK)
disable_mlock = false

# Telemetry (optional - for monitoring)
# telemetry {
#   prometheus_retention_time = "30s"
#   disable_hostname = true
# }
