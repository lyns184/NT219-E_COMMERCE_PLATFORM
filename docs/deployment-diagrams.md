# 4.1. Triển khai hệ thống

## 4.1.1. Môi trường

### Sơ đồ kiến trúc triển khai

```mermaid
graph TB
    subgraph "Production Environment"
        subgraph "Docker Network: nt219-network"
            FE[Frontend Container<br/>Nginx + React<br/>Port: 80]
            BE[Backend Container<br/>Node.js + Express<br/>Port: 5000]
            DB[(MongoDB<br/>Database<br/>Port: 27017)]
            VT[HashiCorp Vault<br/>Secret Management<br/>Port: 8200]
            PR[Prometheus<br/>Monitoring<br/>Port: 9090]
            GR[Grafana<br/>Visualization<br/>Port: 3001]
        end
        
        VOL1[Volume: mongodb_data]
        VOL2[Volume: vault_data]
        VOL3[Volume: prometheus_data]
        VOL4[Volume: grafana_data]
    end
    
    subgraph "External Access"
        USER[End Users]
        ADMIN[Administrators]
    end
    
    USER -->|HTTP :3000| FE
    ADMIN -->|HTTP :3000| FE
    FE -->|REST API :5000| BE
    BE -->|MongoDB Protocol| DB
    BE -->|Vault API :8200| VT
    BE -->|Metrics| PR
    ADMIN -->|Monitoring :3001| GR
    GR -->|Query| PR
    PR -->|Scrape Metrics| BE
    
    DB -.->|Persist| VOL1
    VT -.->|Persist| VOL2
    PR -.->|Persist| VOL3
    GR -.->|Persist| VOL4
    
    style FE fill:#61dafb
    style BE fill:#68a063
    style DB fill:#4db33d
    style VT fill:#ffd814
    style PR fill:#e6522c
    style GR fill:#f46800
```

### Chi tiết môi trường triển khai

#### Development Environment
```mermaid
graph LR
    subgraph "Development Setup"
        DEV[Developer Workstation]
        subgraph "Docker Compose Dev"
            FE_DEV[Frontend :3000]
            BE_DEV[Backend :5000<br/>Hot Reload]
            DB_DEV[MongoDB :27017]
            VT_DEV[Vault Dev Mode<br/>:8200]
        end
    end
    
    DEV -->|docker-compose up| FE_DEV
    DEV -->|docker-compose up| BE_DEV
    DEV -->|docker-compose up| DB_DEV
    DEV -->|docker-compose up| VT_DEV
    
    BE_DEV -->|Volume Mount| DEV
    FE_DEV -->|Volume Mount| DEV
    
    style DEV fill:#e1f5ff
    style FE_DEV fill:#61dafb
    style BE_DEV fill:#68a063
    style DB_DEV fill:#4db33d
    style VT_DEV fill:#ffd814
```

#### Production Environment
```mermaid
graph TB
    subgraph "Production Infrastructure"
        LB[Load Balancer<br/>Nginx/Traefik]
        
        subgraph "Application Cluster"
            FE_PROD1[Frontend Instance 1]
            FE_PROD2[Frontend Instance 2]
            BE_PROD1[Backend Instance 1]
            BE_PROD2[Backend Instance 2]
        end
        
        subgraph "Data Layer"
            DB_PROD[(MongoDB Cluster<br/>Replica Set)]
            VT_PROD[Vault Production<br/>High Availability]
            CACHE[Redis Cache<br/>Optional]
        end
        
        subgraph "Monitoring Stack"
            PROM[Prometheus]
            GRAF[Grafana]
            ALERT[Alertmanager]
        end
    end
    
    LB -->|Round Robin| FE_PROD1
    LB -->|Round Robin| FE_PROD2
    FE_PROD1 --> BE_PROD1
    FE_PROD1 --> BE_PROD2
    FE_PROD2 --> BE_PROD1
    FE_PROD2 --> BE_PROD2
    
    BE_PROD1 --> DB_PROD
    BE_PROD2 --> DB_PROD
    BE_PROD1 --> VT_PROD
    BE_PROD2 --> VT_PROD
    BE_PROD1 -.-> CACHE
    BE_PROD2 -.-> CACHE
    
    PROM -->|Scrape| BE_PROD1
    PROM -->|Scrape| BE_PROD2
    GRAF --> PROM
    PROM --> ALERT
    
    style LB fill:#0066cc
    style FE_PROD1 fill:#61dafb
    style FE_PROD2 fill:#61dafb
    style BE_PROD1 fill:#68a063
    style BE_PROD2 fill:#68a063
```

---

## 4.1.2. Công nghệ sử dụng

### Sơ đồ Stack công nghệ tổng quan

```mermaid
graph TB
    subgraph "Frontend Stack"
        REACT[React 18.3.1]
        VITE[Vite Build Tool]
        CHAKRA[Chakra UI 2.8.2]
        RQ[React Query 5.51.3]
        RHF[React Hook Form 7.53.1]
        AXIOS[Axios 1.7.4]
        RRD[React Router 6.26.2]
        STRIPE_FE[Stripe.js 4.5.0]
    end
    
    subgraph "Backend Stack"
        NODE[Node.js >= 18]
        EXPRESS[Express 4.19.2]
        TS[TypeScript 5.x]
        MONGO[MongoDB 7.0]
        MONGOOSE[Mongoose 8.6.0]
        JWT[JWT Auth]
        PASSPORT[Passport OAuth2]
        BCRYPT[Bcrypt 5.1.1]
        STRIPE_BE[Stripe SDK]
    end
    
    subgraph "Security & Infrastructure"
        VAULT[HashiCorp Vault]
        HELMET[Helmet 7.0.0]
        RATE[Express Rate Limit]
        SANITIZE[Mongo Sanitize]
        HPP[HPP Protection]
        CORS[CORS 2.8.5]
    end
    
    subgraph "DevOps & Monitoring"
        DOCKER[Docker & Compose]
        NGINX[Nginx Web Server]
        PROM[Prometheus]
        GRAF[Grafana]
        PINO[Pino Logger]
    end
    
    subgraph "Testing & Quality"
        JEST[Jest Testing]
        VITEST[Vitest]
        ESL[ESLint]
        PRETTIER[Prettier]
    end
    
    REACT --> VITE
    REACT --> CHAKRA
    REACT --> RQ
    REACT --> RHF
    REACT --> AXIOS
    REACT --> RRD
    REACT --> STRIPE_FE
    
    NODE --> EXPRESS
    NODE --> TS
    EXPRESS --> MONGOOSE
    MONGOOSE --> MONGO
    EXPRESS --> JWT
    EXPRESS --> PASSPORT
    EXPRESS --> BCRYPT
    EXPRESS --> STRIPE_BE
    
    EXPRESS --> HELMET
    EXPRESS --> RATE
    EXPRESS --> SANITIZE
    EXPRESS --> HPP
    EXPRESS --> CORS
    EXPRESS --> VAULT
    
    DOCKER --> NGINX
    DOCKER --> PROM
    DOCKER --> GRAF
    NODE --> PINO
    
    style REACT fill:#61dafb
    style NODE fill:#68a063
    style MONGO fill:#4db33d
    style DOCKER fill:#2496ed
    style VAULT fill:#ffd814
```

### Chi tiết công nghệ theo layer

```mermaid
mindmap
  root((NT219 Platform))
    Frontend Layer
      UI Framework
        React 18.3.1
        TypeScript
        Vite
      Component Library
        Chakra UI
        Emotion
        Framer Motion
        React Icons
      State Management
        React Query
        React Hook Form
        React Router
      HTTP Client
        Axios
      Payment Integration
        Stripe React
        Stripe.js
      Validation
        Zod Schema
      
    Backend Layer
      Runtime & Framework
        Node.js 18+
        Express 4.19.2
        TypeScript 5.x
      Database
        MongoDB 7.0
        Mongoose ODM
      Authentication
        JWT jsonwebtoken
        Passport.js
        Passport OAuth2
        Passport Google
        Bcrypt
        OTPAuth 2FA
      API Validation
        Joi Schema
      File Upload
        Multer
      Email Service
        Nodemailer
      Scheduling
        Node-cron
      Logging
        Pino
      
    Security Layer
      Secret Management
        HashiCorp Vault
        Dotenv Vault
      API Security
        Helmet Headers
        CORS Policy
        Express Rate Limit
        HPP Protection
      Input Sanitization
        Express Mongo Sanitize
        Mongo Sanitize
      Session Management
        Express Session
        Cookie Parser
        
    Infrastructure Layer
      Containerization
        Docker
        Docker Compose
      Web Server
        Nginx
      Monitoring
        Prometheus
        Grafana
        Custom Metrics
      Alerting
        Prometheus Alerts
        Alert Service
        
    DevOps Tools
      Build Tools
        TypeScript Compiler
        Vite Build
      Testing
        Jest
        Vitest
      Code Quality
        ESLint
        Prettier
      Package Manager
        npm/yarn
```

### Bảng công nghệ chi tiết

#### Frontend Technologies

| Công nghệ | Version | Mục đích |
|-----------|---------|----------|
| React | 18.3.1 | UI Framework chính |
| TypeScript | 5.4.5 | Type Safety |
| Vite | Latest | Build Tool & Dev Server |
| Chakra UI | 2.8.2 | Component Library |
| React Query | 5.51.3 | Server State Management |
| React Hook Form | 7.53.1 | Form Management |
| Axios | 1.7.4 | HTTP Client |
| React Router | 6.26.2 | Client-side Routing |
| Stripe React | 2.8.0 | Payment Integration |
| Zod | 3.23.8 | Schema Validation |
| Framer Motion | 12.23.24 | Animations |
| Nginx | Latest | Web Server & Reverse Proxy |

#### Backend Technologies

| Công nghệ | Version | Mục đích |
|-----------|---------|----------|
| Node.js | >= 18 | JavaScript Runtime |
| Express | 4.19.2 | Web Framework |
| TypeScript | 5.x | Type Safety |
| MongoDB | 7.0 | NoSQL Database |
| Mongoose | 8.6.0 | MongoDB ODM |
| Passport.js | 0.7.0 | Authentication Middleware |
| jsonwebtoken | 9.0.2 | JWT Authentication |
| Bcrypt | 5.1.1 | Password Hashing |
| OTPAuth | 9.4.1 | Two-Factor Authentication |
| Joi | 17.12.1 | Schema Validation |
| Multer | 1.4.5 | File Upload |
| Nodemailer | 7.0.10 | Email Service |
| Node-cron | 4.2.1 | Task Scheduling |
| Pino | 9.3.0 | Structured Logging |

#### Security & Infrastructure

| Công nghệ | Version | Mục đích |
|-----------|---------|----------|
| HashiCorp Vault | Latest | Secret Management |
| Helmet | 7.0.0 | Security Headers |
| CORS | 2.8.5 | Cross-Origin Policy |
| Express Rate Limit | 6.10.0 | Rate Limiting |
| HPP | 0.2.3 | HTTP Parameter Pollution |
| Mongo Sanitize | 2.2.0 | Input Sanitization |
| Docker | Latest | Containerization |
| Docker Compose | Latest | Multi-container Management |
| Prometheus | Latest | Metrics Collection |
| Grafana | Latest | Metrics Visualization |

### Luồng xử lý request

```mermaid
sequenceDiagram
    participant User
    participant Nginx
    participant Frontend
    participant Backend
    participant Middleware
    participant Controller
    participant Service
    participant MongoDB
    participant Vault
    
    User->>Nginx: HTTP Request
    Nginx->>Frontend: Serve Static Files
    Frontend->>User: React App
    
    User->>Frontend: User Action
    Frontend->>Backend: API Request + JWT
    
    Backend->>Middleware: Request Pipeline
    Middleware->>Middleware: 1. Rate Limiting
    Middleware->>Middleware: 2. Security Headers
    Middleware->>Middleware: 3. CORS Check
    Middleware->>Middleware: 4. JWT Validation
    Middleware->>Middleware: 5. Input Sanitization
    Middleware->>Middleware: 6. Request Validation
    
    Middleware->>Controller: Validated Request
    Controller->>Service: Business Logic
    
    Service->>Vault: Get Secrets
    Vault-->>Service: Secure Credentials
    
    Service->>MongoDB: Database Query
    MongoDB-->>Service: Data Response
    
    Service-->>Controller: Processed Data
    Controller-->>Backend: HTTP Response
    Backend-->>Frontend: JSON Response
    Frontend-->>User: Updated UI
```

### Kiến trúc bảo mật

```mermaid
graph TB
    subgraph "Security Layers"
        L1[Layer 1: Network Security]
        L2[Layer 2: Application Security]
        L3[Layer 3: Authentication & Authorization]
        L4[Layer 4: Data Security]
        L5[Layer 5: Monitoring & Audit]
    end
    
    subgraph "Layer 1: Network"
        DOCKER_NET[Docker Network Isolation]
        CORS_P[CORS Policy]
        RATE_L[Rate Limiting]
        HELMET_H[Security Headers]
    end
    
    subgraph "Layer 2: Application"
        INPUT_VAL[Input Validation - Joi]
        SANITIZE[Input Sanitization]
        HPP_P[HPP Protection]
        XSS[XSS Prevention]
    end
    
    subgraph "Layer 3: Auth"
        JWT_A[JWT Authentication]
        OAUTH[OAuth2 - Google]
        MFA[2FA - OTPAuth]
        SESSION[Session Management]
        BCRYPT_P[Password Hashing]
    end
    
    subgraph "Layer 4: Data"
        VAULT_S[Secret Management - Vault]
        ENCRYPT[Data Encryption]
        MONGO_SEC[MongoDB Security]
    end
    
    subgraph "Layer 5: Monitor"
        AUDIT_LOG[Audit Logging]
        PINO_L[Structured Logging]
        METRICS[Prometheus Metrics]
        ALERTS[Alert System]
    end
    
    L1 --> DOCKER_NET
    L1 --> CORS_P
    L1 --> RATE_L
    L1 --> HELMET_H
    
    L2 --> INPUT_VAL
    L2 --> SANITIZE
    L2 --> HPP_P
    L2 --> XSS
    
    L3 --> JWT_A
    L3 --> OAUTH
    L3 --> MFA
    L3 --> SESSION
    L3 --> BCRYPT_P
    
    L4 --> VAULT_S
    L4 --> ENCRYPT
    L4 --> MONGO_SEC
    
    L5 --> AUDIT_LOG
    L5 --> PINO_L
    L5 --> METRICS
    L5 --> ALERTS
    
    style L1 fill:#ff6b6b
    style L2 fill:#ffd93d
    style L3 fill:#6bcf7f
    style L4 fill:#4d96ff
    style L5 fill:#a78bfa
```

---

## Tổng kết

### Đặc điểm nổi bật của hệ thống

1. **Kiến trúc Microservices với Docker**
   - Containerization đầy đủ cho tất cả services
   - Cách ly môi trường dev và production
   - Dễ dàng scale và deploy

2. **Bảo mật đa lớp**
   - HashiCorp Vault cho quản lý secrets
   - JWT + OAuth2 + 2FA authentication
   - Multiple security middlewares
   - Input validation và sanitization

3. **Monitoring & Observability**
   - Prometheus metrics collection
   - Grafana dashboards
   - Structured logging với Pino
   - Health checks và alerting

4. **Modern Technology Stack**
   - React 18 với Vite (Fast builds)
   - TypeScript toàn bộ codebase
   - MongoDB 7.0 (Latest stable)
   - Node.js 18+ (LTS)

5. **Developer Experience**
   - Hot reload trong development
   - TypeScript cho type safety
   - ESLint + Prettier cho code quality
   - Comprehensive testing setup
