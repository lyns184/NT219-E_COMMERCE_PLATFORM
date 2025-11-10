# 🔐 HashiCorp Vault Integration Guide

**Project:** demo-nt219 E-Commerce Platform  
**Feature:** Secret Management with HashiCorp Vault  
**Status:** ✅ Production Ready (Optional)

---

## 📋 Overview

HashiCorp Vault được tích hợp vào hệ thống để quản lý secrets một cách bảo mật hơn thay vì lưu trực tiếp trong file `.env`. Việc sử dụng Vault là **optional** - hệ thống vẫn hoạt động bình thường với `.env` file.

### ✅ Benefits of Using Vault

1. **Centralized Secret Management** - Tất cả secrets ở một nơi
2. **Access Control** - Role-based access policies
3. **Audit Logging** - Track who accessed what secrets
4. **Secret Rotation** - Dễ dàng rotate secrets
5. **Dynamic Secrets** - Generate temporary credentials
6. **Encryption at Rest** - Secrets encrypted in storage

### ⚠️ When to Use Vault

| Environment | Recommendation |
|-------------|----------------|
| **Development** | Optional - `.env` is fine |
| **Staging** | Recommended |
| **Production** | **Highly Recommended** |
| **Enterprise** | **Required** |

---

## 🚀 Quick Start

### Option 1: Use .env (Default)

Không cần làm gì thêm. Hệ thống đọc từ `.env` file như bình thường.

```env
VAULT_ENABLED=false  # or omit this line
```

### Option 2: Enable Vault

#### Step 1: Install Vault

**macOS:**
```bash
brew install vault
```

**Windows:**
```powershell
choco install vault
# or download from https://www.vaultproject.io/downloads
```

**Linux:**
```bash
wget https://releases.hashicorp.com/vault/1.15.0/vault_1.15.0_linux_amd64.zip
unzip vault_1.15.0_linux_amd64.zip
sudo mv vault /usr/local/bin/
```

#### Step 2: Start Vault Dev Server

**For Development Only:**
```bash
vault server -dev
```

Output:
```
WARNING! dev mode is enabled!
...
Root Token: hvs.xxxxxxxxxxxx
Unseal Key: xxxxxxxxxxxx
```

**Set environment variables:**
```bash
# macOS/Linux
export VAULT_ADDR='http://127.0.0.1:8200'
export VAULT_TOKEN='hvs.xxxxxxxxxxxx'

# Windows PowerShell
$env:VAULT_ADDR='http://127.0.0.1:8200'
$env:VAULT_TOKEN='hvs.xxxxxxxxxxxx'
```

#### Step 3: Run Setup Script

**Windows:**
```powershell
.\scripts\setup-vault.ps1
```

**macOS/Linux:**
```bash
chmod +x scripts/setup-vault.sh
./scripts/setup-vault.sh
```

This script will:
- ✅ Enable KV v2 secrets engine
- ✅ Create AppRole authentication
- ✅ Generate role_id and secret_id
- ✅ Migrate secrets from .env to Vault
- ✅ Create security policies

#### Step 4: Update .env

Add the output from setup script to your `.env`:

```env
# Enable Vault
VAULT_ENABLED=true
VAULT_ADDR=http://127.0.0.1:8200
VAULT_ROLE_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
VAULT_SECRET_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
VAULT_SECRET_PATH=secret/data/demo-nt219
```

#### Step 5: Start Application

```bash
npm run dev
```

You should see:
```
Initializing Vault for secret management...
Successfully read secrets from Vault
Vault health check completed
Server running on port 5000
```

---

## 🏗️ Architecture

### How It Works

```
┌─────────────┐
│   .env      │
│ VAULT_      │
│ credentials │
└──────┬──────┘
       │
       ▼
┌─────────────────┐      ┌──────────────┐      ┌──────────────┐
│  Application    │─────▶│ Vault Client │─────▶│ Vault Server │
│  (server.ts)    │      │ (vault.ts)   │      │ (localhost)  │
└─────────────────┘      └──────────────┘      └──────────────┘
       │                                               │
       │                                               │
       ▼                                               ▼
┌─────────────────┐                          ┌─────────────────┐
│  Loaded Secrets │                          │ Encrypted Store │
│  (process.env)  │                          │ secret/demo-    │
└─────────────────┘                          │ nt219           │
                                             └─────────────────┘
```

### Startup Flow

1. **Application starts** → `server.ts`
2. **Check Vault enabled** → Read `VAULT_ENABLED`
3. **Initialize Vault client** → `vault.ts`
4. **Authenticate** → AppRole (role_id + secret_id)
5. **Read secrets** → From `secret/data/demo-nt219`
6. **Update process.env** → Merge with .env values
7. **Start token renewal** → Every 30 minutes
8. **Continue normal startup** → Connect DB, start server

---

## 🔑 Authentication Methods

### 1. Token Authentication (Development)

**Pros:** Simple, quick setup  
**Cons:** Less secure, tokens expire

```env
VAULT_TOKEN=hvs.xxxxxxxxxxxx
```

### 2. AppRole Authentication (Production)

**Pros:** More secure, automated renewal  
**Cons:** Requires initial setup

```env
VAULT_ROLE_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
VAULT_SECRET_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

**How it works:**
- Role ID = Username (public, can be in config)
- Secret ID = Password (private, should be injected)

---

## 📦 Secrets Stored in Vault

The following secrets are managed by Vault:

| Secret Name | Description | Required |
|-------------|-------------|----------|
| `MONGO_URI` | MongoDB connection string | ✅ |
| `JWT_ACCESS_SECRET` | JWT access token secret | ✅ |
| `JWT_REFRESH_SECRET` | JWT refresh token secret | ✅ |
| `ENCRYPTION_KEY` | Field-level encryption key | ✅ |
| `STRIPE_SECRET_KEY` | Stripe API secret key | ✅ |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret | ✅ |
| `EMAIL_USER` | SMTP username | ⚠️ |
| `EMAIL_PASS` | SMTP password | ⚠️ |
| `GOOGLE_CLIENT_ID` | OAuth client ID | ⚠️ |
| `GOOGLE_CLIENT_SECRET` | OAuth client secret | ⚠️ |

---

## 🛠️ Manual Vault Operations

### View Secrets

```bash
vault kv get secret/demo-nt219
```

### Add/Update Secret

```bash
vault kv put secret/demo-nt219 NEW_SECRET_KEY="new-value"
```

### Delete Secret

```bash
vault kv delete secret/demo-nt219
```

### List All Secrets

```bash
vault kv list secret/
```

### Check Health

```bash
vault status
```

---

## 🔄 Token Renewal

Vault tokens expire. The application automatically renews tokens every 30 minutes.

**Manual renewal:**
```bash
vault token renew
```

**Check token TTL:**
```bash
vault token lookup
```

---

## 🏭 Production Deployment

### DO NOT Use Dev Mode in Production!

Dev mode stores secrets **unencrypted in memory**. For production:

### 1. Use Production Vault Server

```bash
# Install Vault
wget https://releases.hashicorp.com/vault/1.15.0/vault_1.15.0_linux_amd64.zip

# Create config file
cat > vault-config.hcl <<EOF
storage "file" {
  path = "/opt/vault/data"
}

listener "tcp" {
  address     = "0.0.0.0:8200"
  tls_disable = 0
  tls_cert_file = "/opt/vault/tls/cert.pem"
  tls_key_file  = "/opt/vault/tls/key.pem"
}

ui = true
EOF

# Start Vault
vault server -config=vault-config.hcl
```

### 2. Initialize Vault (First Time Only)

```bash
vault operator init
```

**SAVE THE OUTPUT!** You'll get:
- 5 unseal keys
- 1 root token

### 3. Unseal Vault (After Every Restart)

```bash
vault operator unseal <key-1>
vault operator unseal <key-2>
vault operator unseal <key-3>
# Need 3 out of 5 keys
```

### 4. Configure for Production

```env
# Production .env (ONLY Vault credentials)
VAULT_ENABLED=true
VAULT_ADDR=https://vault.yourcompany.com:8200
VAULT_ROLE_ID=<inject-from-secrets-manager>
VAULT_SECRET_ID=<inject-from-secrets-manager>
VAULT_NAMESPACE=demo-nt219  # if using Vault Enterprise
```

**Security Best Practices:**
- ✅ Use TLS/SSL (HTTPS)
- ✅ Rotate secret_id regularly
- ✅ Use different AppRoles per environment
- ✅ Enable audit logging
- ✅ Use auto-unseal with cloud KMS
- ✅ Backup Vault data regularly

---

## 🔒 Security Policies

Vault uses policies to control access. Our policy (`demo-nt219`):

```hcl
# Read secrets
path "secret/data/demo-nt219" {
  capabilities = ["read"]
}

# List secrets
path "secret/metadata/demo-nt219" {
  capabilities = ["list"]
}

# Write secrets (admin only)
path "secret/data/demo-nt219" {
  capabilities = ["create", "update"]
}

# Renew tokens
path "auth/token/renew-self" {
  capabilities = ["update"]
}
```

### Update Policy

```bash
vault policy write demo-nt219 policy.hcl
```

---

## 🧪 Testing

### Test Vault Connection

```typescript
import { vaultClient } from './config/vault';

// Check health
const isHealthy = await vaultClient.healthCheck();
console.log('Vault healthy:', isHealthy);

// Read specific secret
const mongoUri = await vaultClient.getSecret('MONGO_URI');
console.log('MongoDB URI loaded from Vault');
```

### Fallback to .env

If Vault is unavailable, application automatically falls back to `.env`:

```
⚠️  Vault initialization failed, using environment variables
Server running on port 5000
```

---

## 🐛 Troubleshooting

### Error: "VAULT_ENABLED is true but connection failed"

**Solution:**
1. Check Vault server is running: `vault status`
2. Check VAULT_ADDR is correct
3. Verify network connectivity
4. Check firewall rules

### Error: "Permission denied"

**Solution:**
1. Check VAULT_TOKEN or VAULT_ROLE_ID/SECRET_ID
2. Verify policy allows reading secrets
3. Re-run setup script

### Error: "Token expired"

**Solution:**
1. Check token TTL: `vault token lookup`
2. Renew token: `vault token renew`
3. Or generate new secret_id

### Secrets not loading

**Solution:**
1. Verify secrets exist: `vault kv get secret/demo-nt219`
2. Check VAULT_SECRET_PATH is correct
3. Enable debug logging: `LOG_LEVEL=debug npm run dev`

---

## 📊 Monitoring

### Health Check Endpoint

Add to your monitoring:

```bash
curl http://vault.yourcompany.com:8200/v1/sys/health
```

Response:
```json
{
  "initialized": true,
  "sealed": false,
  "standby": false
}
```

### Application Logs

Monitor for:
```
✅ "Successfully read secrets from Vault"
✅ "Vault health check completed"
✅ "Successfully renewed Vault token"

⚠️ "Vault initialization failed"
⚠️ "Failed to read secrets from Vault"
❌ "Vault health check failed"
```

---

## 🔄 Secret Rotation

### Rotate Encryption Key

```bash
# 1. Generate new key
NEW_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")

# 2. Update Vault
vault kv patch secret/demo-nt219 ENCRYPTION_KEY="$NEW_KEY"

# 3. Restart application (picks up new key automatically)
pm2 restart demo-nt219

# 4. Re-encrypt existing data (if needed)
npm run migrate:reencrypt
```

### Rotate Stripe Keys

```bash
# 1. Get new key from Stripe dashboard
# 2. Update Vault
vault kv patch secret/demo-nt219 \
  STRIPE_SECRET_KEY="sk_live_new..." \
  STRIPE_WEBHOOK_SECRET="whsec_new..."

# 3. Restart application
```

---

## 📚 Resources

### Official Documentation
- [Vault Getting Started](https://learn.hashicorp.com/vault)
- [Vault Best Practices](https://learn.hashicorp.com/tutorials/vault/pattern-centralize-secrets)
- [AppRole Authentication](https://www.vaultproject.io/docs/auth/approle)

### Internal Docs
- `src/config/vault.ts` - Vault client implementation
- `scripts/setup-vault.ps1` - Windows setup script
- `scripts/setup-vault.sh` - Unix setup script

---

## ✅ Checklist

### Development Setup
- [ ] Install Vault
- [ ] Start dev server
- [ ] Run setup script
- [ ] Update .env with credentials
- [ ] Test application startup
- [ ] Verify secrets loaded

### Production Setup
- [ ] Deploy production Vault server
- [ ] Enable TLS/SSL
- [ ] Initialize and unseal Vault
- [ ] Create production policies
- [ ] Set up AppRole authentication
- [ ] Configure monitoring
- [ ] Test failover scenarios
- [ ] Document unseal procedure
- [ ] Set up backup strategy

---

**Vault Integration:** ✅ Complete  
**Security Level:** 🟢 Production Ready  
**Complexity:** 🟡 Medium (Optional)

---

**For questions about Vault setup, check the troubleshooting section or contact DevOps team.**
