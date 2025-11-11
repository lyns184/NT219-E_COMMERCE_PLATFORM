# NT219 - Secure E-commerce Platform# Secure E-commerce Backend



Production-grade full-stack e-commerce application with security-first principles, built for NT219 course project.Production-grade backend for a Stripe-powered e-commerce platform. Built with security-first principles, modular architecture, and comprehensive tooling for testing and observability.



## 🏗️ Tech Stack## Architecture Overview



### Backend- **Runtime:** Node.js (TypeScript)

- **Runtime:** Node.js 22 (TypeScript)- **Framework:** Express.js

- **Framework:** Express.js- **Database:** MongoDB with Mongoose ODM

- **Database:** MongoDB 7.0 + Mongoose- **Payments:** Stripe Payment Intents + Webhooks

- **Auth:** JWT (access/refresh tokens) + HTTP-only cookies- **Auth:** JWT access/refresh tokens stored as HTTP-only cookies

- **Payments:** Stripe Payment Intents + Webhooks- **Security Layers:** Helmet, CORS, rate limiting, request validation (Joi), mongo-sanitize, bcrypt, RBAC

- **Secret Management:** HashiCorp Vault- **Structure:**

- **Security:** Helmet, CORS, Rate Limiting, Input Validation (Joi), AES-256-GCM Encryption

```

### Frontendsrc/

- **Framework:** React 18 + TypeScript├── app.ts                # Express configuration & middleware

- **UI Library:** Chakra UI├── server.ts             # Bootstrap + graceful shutdown

- **Build Tool:** Vite├── config/               # Environment parsing, DB connection

- **Routing:** React Router v6├── controllers/          # HTTP handlers

- **State:** React Query├── middleware/           # Auth, validation, error handling, rate limiting

├── models/               # Mongoose schemas (User, Product, Order)

### Infrastructure├── routes/               # Versioned API routes (/api/v1)

- **Containerization:** Docker + Docker Compose├── services/             # Business logic (Auth, Stripe, Products, Orders)

- **Reverse Proxy:** Nginx├── utils/                # Logger, JWT, password, time helpers

- **SSL:** Let's Encrypt (Certbot)├── validators/           # Joi schemas for inputs

- **Deployment:** VPS Ubuntu└── types/                # Shared TS types & Request augmentation

```

## 🚀 Quick Start

## Security Checklist

### Development (Local)

- Passwords hashed with bcrypt (12 salt rounds) and never returned in responses.

1. **Clone repository**- Refresh tokens rotated on every login/refresh and stored as bcrypt hashes in the database.

```bash- Rate limiting: general (configurable) + stricter auth limiter (5 req/min) + strict payment limiter (3 req/15min).

git clone https://github.com/AloneBiNgu/demo-nt219.git- Input validation via Joi for all body/params. Mongo sanitize + XSS protection to prevent injection attacks.

cd demo-nt219- Stripe webhook signatures verified with `stripe.webhooks.constructEvent`.

```- Centralized error handler logs full details (Pino) while returning safe responses.

- RBAC via middleware: only admins can mutate products or list all orders.

2. **Setup environment**- **Field-level encryption**: PII data (IP addresses, user agents) encrypted with AES-256-GCM.

```bash- **Secret management**: Optional HashiCorp Vault integration for centralized secret management.

cp .env.example .env- **Compliance**: OWASP Top 10, GDPR Article 32, PCI-DSS compliant.

# Edit .env with your credentials

```## Stripe Payment Flow



3. **Start with Docker Compose**1. **Client** calls `POST /api/v1/payments/create-intent` with `{ items: [{ productId, quantity }] }`.

```bash2. **Server** loads products from MongoDB, calculates total, creates order + Stripe PaymentIntent, returns `clientSecret`.

docker-compose up -d3. **Client** confirms payment with Stripe.js using the `clientSecret`.

```4. **Stripe** calls webhook `/api/v1/payments/webhook` → signature verified → order status set to `paid` or `cancelled`.



4. **Or run manually**## Environment Variables

```bash

# BackendCopy `.env.example` → `.env` and adjust values:

npm install

npm run dev```

cp .env.example .env

# Frontend```

cd frontend

npm installKey variables:

npm run dev- `MONGO_URI` – MongoDB connection string.

```- `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` – 32+ char secrets.

- `ENCRYPTION_KEY` – 32+ char encryption key for PII data (generate with crypto.randomBytes).

**Access:**- `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` – Stripe credentials.

- Frontend: http://localhost:5173- `CLIENT_ORIGIN` – Allowed frontend origin for CORS.

- Backend API: http://localhost:5000- `ADMIN_EMAIL` / `ADMIN_PASSWORD` – Optional bootstrap admin.

- MongoDB: localhost:27017- `EMAIL_USER` / `EMAIL_PASS` – SMTP credentials for email service.

- Vault: http://localhost:8200- `VAULT_ENABLED` – Set to `true` to use HashiCorp Vault for secret management (optional).



### Production (VPS Deployment)### Using HashiCorp Vault (Optional)



**Prerequisites:**For enhanced secret management in production:

- VPS Ubuntu with Docker installed

- Domain name pointed to VPS IP```powershell

- Docker Hub account# Install Vault

choco install vault  # Windows

**Deployment Steps:**brew install vault   # macOS



1. **Build images locally (fast)**# Start Vault dev server (development only)

```bashvault server -dev

# Build backend

docker build -t YOUR_DOCKERHUB_USERNAME/nt219-backend:latest .# Run setup script

.\scripts\setup-vault.ps1  # Windows

# Build frontend./scripts/setup-vault.sh   # Unix

docker build -t YOUR_DOCKERHUB_USERNAME/nt219-frontend:latest ./frontend \

  --build-arg VITE_API_BASE_URL=https://api.yourdomain.com/api/v1# Enable Vault in .env

VAULT_ENABLED=true

# Push to Docker HubVAULT_ADDR=http://127.0.0.1:8200

docker push YOUR_DOCKERHUB_USERNAME/nt219-backend:latestVAULT_ROLE_ID=<from-setup-script>

docker push YOUR_DOCKERHUB_USERNAME/nt219-frontend:latestVAULT_SECRET_ID=<from-setup-script>

``````



2. **Update docker-compose.production.yml**See [VAULT_GUIDE.md](./VAULT_GUIDE.md) for complete setup instructions.

```yaml

# Change image names to your Docker Hub username## Setup & Run

backend:

  image: YOUR_DOCKERHUB_USERNAME/nt219-backend:latest```powershell

npm install

frontend:npm run dev       # ts-node-dev, hot reload

  image: YOUR_DOCKERHUB_USERNAME/nt219-frontend:latestnpm run build     # tsc → dist/

```npm start         # node dist/server.js

```

3. **On VPS**

```bashServer listens on `PORT` (default 5000). API base path: `/api/v1`.

# Clone repository

git clone https://github.com/AloneBiNgu/demo-nt219.git## Testing

cd demo-nt219

```powershell

# Create environment filenpm test          # Jest (ts-jest) with mongodb-memory-server

cat > .env << 'EOF'npm run test:watch

NODE_ENV=productionnpm run test:coverage

PORT=5000```

MONGO_URI=mongodb://mongodb:27017/security-nt219

- Unit sample: `tests/unit/password.test.ts`.

# JWT Secrets (generate with: openssl rand -hex 32)- Integration sample: `tests/integration/auth.test.ts` (register/login/me).

JWT_ACCESS_SECRET=your_access_secret_here- Tests use in-memory MongoDB, seeded env vars via `tests/setup.ts`.

JWT_REFRESH_SECRET=your_refresh_secret_here

## Logging & Monitoring

# CORS

CORS_ORIGIN=https://yourdomain.com,https://www.yourdomain.com- Pino logger (`src/utils/logger.ts`) auto-switches to pretty logs in development.

FRONTEND_URL=https://yourdomain.com- Errors routed through `errorHandler` middleware; logs full stack traces while returning `{ status: 'error', message }` to clients.



# Stripe## Docker Deployment

STRIPE_SECRET_KEY=sk_test_your_key

STRIPE_WEBHOOK_SECRET=whsec_your_secret### Quick Start (Development)

```bash

# Google OAuth# Windows

GOOGLE_CLIENT_ID=your_client_id.\docker-start.bat

GOOGLE_CLIENT_SECRET=your_client_secret

GOOGLE_CALLBACK_URL=https://api.yourdomain.com/api/v1/oauth/google/callback# Linux/Mac

chmod +x docker-start.sh

# Email (Brevo SMTP)./docker-start.sh

EMAIL_HOST=smtp-relay.brevo.com```

EMAIL_PORT=587

EMAIL_USER=your_smtp_userSee **[QUICKSTART.md](./QUICKSTART.md)** for 5-minute setup guide.

EMAIL_PASS=your_smtp_pass

EMAIL_FROM=noreply@yourdomain.com### Production Deployment (VPS)



# EncryptionFor production deployment to VPS with SSL, see:

ENCRYPTION_KEY=your_32_char_encryption_key- **[VPS_DEPLOYMENT_GUIDE.md](./VPS_DEPLOYMENT_GUIDE.md)** - Complete VPS setup guide

- **[DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md)** - Quick deployment checklist

# Vault- **[QUICK_DEPLOY.md](./QUICK_DEPLOY.md)** - Quick reference commands

VAULT_ENABLED=true

VAULT_ADDR=http://vault:8200Complete documentation:

VAULT_TOKEN=myroot- **[DOCKER_GUIDE.md](./DOCKER_GUIDE.md)** - Docker setup & troubleshooting

VAULT_SECRET_PATH=secret/demo-nt219

VAULT_FALLBACK_TO_ENV=true## Documentation Structure

EOF

```

# Pull imagesREADME.md                   → Main documentation (you are here)

docker compose -f docker-compose.production.yml pull├── DOCKER_GUIDE.md        → Complete Docker setup & troubleshooting

├── QUICKSTART.md          → 5-minute quick start guide

# Start services└── Production Deployment:

docker compose -f docker-compose.production.yml up -d    ├── VPS_DEPLOYMENT_GUIDE.md    → Full VPS deployment guide

    ├── DEPLOYMENT_CHECKLIST.md    → Quick checklist

# Setup Vault secrets    └── QUICK_DEPLOY.md            → Command reference

docker exec -it nt219-vault-prod sh```

export VAULT_ADDR='http://127.0.0.1:8200'

vault login myroot## Future Enhancements

vault kv put secret/demo-nt219 \

  MONGO_URI="mongodb://mongodb:27017/security-nt219" \- Add background job queue for email confirmations

  JWT_ACCESS_SECRET="your_secret" \- Extend Stripe event handling (refunds, disputes)

  JWT_REFRESH_SECRET="your_secret" \- Implement product caching (Redis) and cache invalidation hooks

  ENCRYPTION_KEY="your_encryption_key"- Add OpenAPI / Swagger docs for API consumers

exit- ~~HashiCorp Vault for secret management~~ ✅ Implemented (optional)

# Fix upload permissions
mkdir -p uploads/prototypes
chmod -R 777 uploads
```

4. **Setup Nginx + SSL**
```bash
# Install Nginx
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx

# Create Nginx config
sudo nano /etc/nginx/sites-available/demo-nt219
# Copy config from nginx-vps.conf in repository

# Enable site
sudo ln -s /etc/nginx/sites-available/demo-nt219 /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# Get SSL certificate
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com -d api.yourdomain.com
```

## 📁 Project Structure

```
demo-nt219/
├── src/                      # Backend source
│   ├── config/               # Environment, database, vault config
│   ├── controllers/          # HTTP request handlers
│   ├── middleware/           # Auth, validation, error handling
│   ├── models/               # Mongoose schemas
│   ├── routes/               # API routes (/api/v1)
│   ├── services/             # Business logic
│   ├── utils/                # Helpers (JWT, encryption, logger)
│   └── validators/           # Joi validation schemas
├── frontend/                 # React frontend
│   ├── src/
│   │   ├── components/       # Reusable UI components
│   │   ├── pages/            # Page components
│   │   ├── features/         # Feature modules
│   │   └── api/              # API client
│   └── Dockerfile
├── scripts/                  # Setup & migration scripts
├── tests/                    # Unit & integration tests
├── docker-compose.yml        # Development compose
├── docker-compose.production.yml  # Production compose
├── Dockerfile                # Backend image
└── nginx-vps.conf           # Nginx configuration
```

## 🔒 Security Features

- ✅ Bcrypt password hashing (12 rounds)
- ✅ JWT access/refresh tokens with HTTP-only cookies
- ✅ Rate limiting (general, auth, payment endpoints)
- ✅ Input validation (Joi) + sanitization
- ✅ AES-256-GCM field-level encryption for PII
- ✅ HashiCorp Vault for secret management
- ✅ Stripe webhook signature verification
- ✅ RBAC (Role-Based Access Control)
- ✅ Audit logging for compliance
- ✅ CORS, Helmet, XSS protection
- ✅ MongoDB injection prevention
- ✅ OWASP Top 10 + GDPR + PCI-DSS compliant

## 🔑 API Endpoints

### Authentication
- `POST /api/v1/auth/register` - Register new user
- `POST /api/v1/auth/login` - Login
- `POST /api/v1/auth/logout` - Logout
- `POST /api/v1/auth/refresh` - Refresh access token
- `POST /api/v1/auth/forgot-password` - Request password reset
- `POST /api/v1/auth/reset-password` - Reset password

### Products
- `GET /api/v1/products` - List products
- `GET /api/v1/products/:id` - Get product details
- `POST /api/v1/products` - Create product (admin)
- `PUT /api/v1/products/:id` - Update product (admin)
- `DELETE /api/v1/products/:id` - Delete product (admin)

### Cart
- `GET /api/v1/cart` - Get user cart
- `POST /api/v1/cart/items` - Add item to cart
- `PUT /api/v1/cart/items/:itemId` - Update cart item
- `DELETE /api/v1/cart/items/:itemId` - Remove from cart
- `DELETE /api/v1/cart` - Clear cart

### Orders
- `GET /api/v1/orders` - List user orders
- `GET /api/v1/orders/:id` - Get order details
- `POST /api/v1/orders` - Create order from cart

### Payments
- `POST /api/v1/payments/create-intent` - Create Stripe payment intent
- `POST /api/v1/payments/webhook` - Stripe webhook handler

### OAuth
- `GET /api/v1/oauth/google` - Google OAuth login
- `GET /api/v1/oauth/google/callback` - Google OAuth callback

## 📊 Environment Variables

Required variables (see `.env.example`):

```bash
# Core
NODE_ENV=development|production
PORT=5000
MONGO_URI=mongodb://localhost:27017/demo-nt219

# JWT (generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
JWT_ACCESS_SECRET=<64-char-hex>
JWT_REFRESH_SECRET=<64-char-hex>

# CORS
CORS_ORIGIN=http://localhost:5173
FRONTEND_URL=http://localhost:5173

# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Optional: Google OAuth
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_CALLBACK_URL=http://localhost:5000/api/v1/oauth/google/callback

# Optional: Email
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=...
EMAIL_PASS=...

# Encryption (generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
ENCRYPTION_KEY=<64-char-hex>

# Vault (optional)
VAULT_ENABLED=false
```

## 🧪 Testing

```bash
# Run all tests
npm test

# Unit tests
npm run test:unit

# Integration tests
npm run test:integration

# Coverage
npm run test:coverage
```

## 📦 Docker Commands

```bash
# Development
docker-compose up -d
docker-compose down
docker-compose logs -f backend

# Production
docker-compose -f docker-compose.production.yml up -d
docker-compose -f docker-compose.production.yml pull
docker-compose -f docker-compose.production.yml restart backend

# Rebuild images locally
docker build -t YOUR_USERNAME/nt219-backend:latest .
docker build -t YOUR_USERNAME/nt219-frontend:latest ./frontend
docker push YOUR_USERNAME/nt219-backend:latest
docker push YOUR_USERNAME/nt219-frontend:latest
```

## 🛠️ Maintenance

### Update Production

```bash
# On local machine
docker build -t YOUR_USERNAME/nt219-backend:latest .
docker build -t YOUR_USERNAME/nt219-frontend:latest ./frontend \
  --build-arg VITE_API_BASE_URL=https://api.yourdomain.com/api/v1
docker push YOUR_USERNAME/nt219-backend:latest
docker push YOUR_USERNAME/nt219-frontend:latest
git add .
git commit -m "Update"
git push origin main

# On VPS
cd /var/www/demo-nt219
git pull origin main
docker compose -f docker-compose.production.yml pull
docker compose -f docker-compose.production.yml up -d
```

### Logs

```bash
# Backend logs
docker logs nt219-backend-prod -f

# Frontend logs
docker logs nt219-frontend-prod -f

# MongoDB logs
docker logs nt219-mongodb-prod -f

# Nginx logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

### Backup Database

```bash
# Create backup
docker exec nt219-mongodb-prod mongodump --out /backups/$(date +%Y%m%d)

# Restore backup
docker exec nt219-mongodb-prod mongorestore /backups/20250111
```

## 📝 License

This project is for educational purposes (NT219 course).

## 👥 Authors

- Student: Huynh Pham Thanh Nhu
- MSSV: 22520986
- Course: NT219 - Information Security
- University: UIT - University of Information Technology

---

**Live Demo:** https://security-test.site  
**API Health:** https://api.security-test.site/api/v1/health
