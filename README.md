# 🛒 NT219 - Secure E-commerce Platform

> Một nền tảng thương mại điện tử bảo mật cao, được xây dựng với các nguyên tắc an ninh hàng đầu cho môn học NT219.

## 🚀 Quick Start với Docker

### Yêu Cầu
- [Docker Desktop](https://www.docker.com/products/docker-desktop)
- [Git](https://git-scm.com/)

### Bước 1: Clone Repository

```bash
git clone https://github.com/AloneBiNgu/demo-nt219.git
cd demo-nt219
```

### Bước 2: Tạo file .env

```bash
cp .env.example .env
# Chỉnh sửa file .env với thông tin của bạn
```

### Bước 3: Chạy với Docker

```bash
# Development
docker-compose up -d

# Production
docker-compose -f docker-compose.prod.yml up -d
```

### Bước 4: Truy cập

- **Frontend:** http://localhost:3000
- **Backend API:** http://localhost:5000/api/v1
- **Vault UI:** http://localhost:8200
- **Health Check:** http://localhost:5000/api/v1/health

---

## 📁 Cấu Trúc Project

```
demo-nt219/
├── src/                    # Backend source code
│   ├── config/             # Cấu hình (DB, Passport, Vault)
│   ├── controllers/        # HTTP request handlers
│   ├── middleware/         # Auth, validation, error handling
│   ├── models/             # MongoDB schemas
│   ├── routes/             # API routes
│   ├── services/           # Business logic
│   ├── utils/              # Helper functions
│   └── validators/         # Joi validation schemas
│
├── frontend/               # React frontend
│   ├── src/
│   ├── Dockerfile
│   └── nginx.conf
│
├── vault/                  # Vault configuration
│   └── config/
│       └── vault.hcl
│
├── docker-compose.yml      # Development Docker
├── docker-compose.prod.yml # Production Docker
├── Dockerfile              # Backend image
├── package.json
└── README.md
```

---

## 🔐 HashiCorp Vault

### Development Mode
Vault chạy ở dev mode với root token: `dev-only-token`

```bash
# Truy cập Vault UI
http://localhost:8200
```

### Kích hoạt Vault trong ứng dụng
Trong file `.env`:
```env
VAULT_ENABLED=true
VAULT_ADDR=http://localhost:8200
VAULT_TOKEN=dev-only-token
VAULT_SECRET_PATH=secret/data/demo-nt219
```

---

## 🔧 Development (Không dùng Docker)

### Yêu Cầu
- Node.js >= 18
- MongoDB (local hoặc Atlas)
- HashiCorp Vault (optional)

### Cài đặt

```bash
# Backend
npm install
npm run dev

# Frontend (terminal khác)
cd frontend
npm install
npm run dev
```

---

## 🔐 Tính Năng Bảo Mật

- ✅ JWT Authentication với Token Rotation
- ✅ HashiCorp Vault Secret Management
- ✅ OAuth2 (Google, GitHub, Discord)
- ✅ Two-Factor Authentication (2FA)
- ✅ Rate Limiting
- ✅ CORS Protection
- ✅ Helmet Security Headers
- ✅ MongoDB Injection Prevention
- ✅ Password Hashing (bcrypt)
- ✅ Email Verification
- ✅ Account Lockout

---

## 📝 Environment Variables

Xem file `.env.example` để biết các biến môi trường cần thiết.

---

## 📄 License

MIT License
