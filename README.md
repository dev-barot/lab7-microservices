# Lab 7: API Gateway, Service Discovery & Cloud Deployment

## 1. Objective & Project Overview
This lab evolves the microservices architecture established in Lab 6 (where User, Product, and Order services ran as independent containers communicating directly) by introducing an actual **API Gateway** as the single entry point for clients, externalizing service locations into a configuration-based **Service Discovery** mechanism, and deploying the containerized system to the cloud (**Railway**) connected to **MongoDB Atlas**.

### System Architecture Flow:
```
Client / Postman  ──>  API Gateway (Public, Cloud-Hosted)  ──>  Service Registry / Config  ──>  User / Product / Order Services (Containers)  ──>  MongoDB Atlas
```

---

## 2. Architecture & Layering

### Architecture Diagram
![Architecture Diagram](SCREENSHOT/architecture%20diagram.png)

```mermaid
graph TD
    Client([Postman Client / Browser]) -->|HTTP /users, /products, /orders, /health| Gateway[API Gateway :8080]
    
    subgraph Cloud Platform / Docker Network
        Gateway -->|Proxy /users| User[User Service :3001]
        Gateway -->|Proxy /products| Product[Product Service :3002]
        Gateway -->|Proxy /orders| Order[Order Service :3003]
        
        Order -.->|Sync HTTP GET /users/:id| User
        Order -.->|Sync HTTP GET /products/:id| Product
    end

    subgraph MongoDB Atlas
        User -.-> DB1[(user_db)]
        Product -.-> DB2[(product_db)]
        Order -.-> DB3[(order_db)]
    end
```

### Architectural Layer Responsibilities
| Layer | Responsibility | Reachable From |
|---|---|---|
| **Client / Postman** | Sends requests to one public address | Internet |
| **API Gateway** | Routes `/users`, `/products`, `/orders`; centralized logging; error handling | Internet (Public) |
| **User / Product / Order Services** | Domain business logic and inter-service validation | Docker network only / Private network |
| **MongoDB Atlas** | Persistent storage per service (Database-per-service pattern) | Services (via connection string) |

### Local vs Cloud Architecture
| Layer | Local (Docker Compose) | Cloud (Railway Platform) |
|---|---|---|
| **Client Entry** | `http://localhost:8080` | `https://lab7-microservices-production.up.railway.app` |
| **Gateway** | `api-gateway` container on port `8080` | Cloud Container with Public Domain |
| **Network** | `campus-network` Docker bridge network | Private platform network / service URLs |
| **Microservices** | `http://user-service:3001`, `product-service:3002`, `order-service:3003` | Platform service URLs / private hostnames |
| **Database** | MongoDB Atlas / Local MongoDB | MongoDB Atlas Cloud Cluster |

---

## 3. Part A — API Gateway Implementation

The API Gateway (`api-gateway`) is built with **Node.js + Express** using `http-proxy-middleware` and `morgan`:
- **Single Entry Point**: All client requests go through port `8080` locally or the public Railway URL in the cloud.
- **Routing Table**:
  - `GET`, `POST`, `PUT`, `DELETE /users/*` $\rightarrow$ User Service
  - `GET`, `POST`, `PUT`, `DELETE /products/*` $\rightarrow$ Product Service
  - `GET`, `POST /orders/*` $\rightarrow$ Order Service
- **Health Check Endpoint**: `GET /health` returns status without proxying.
- **Centralized Request Logging**: Custom middleware logs HTTP method, request path, target backend service URL, response status code, and latency in ms.
- **Centralized Error Handling (502/503)**: If a target microservice is unreachable, the gateway intercepts the error via `on: { error }` and returns a clean `503 Service Unavailable` JSON response instead of crashing or hanging.
- **CORS Support**: `cors()` middleware is configured at the gateway level for browser and React client access.

### Discussion: Why Introduce an API Gateway Instead of Direct Client Calls?
Allowing clients to call each microservice directly introduces several architectural drawbacks:
1. **Coupling to Internal Topology:** Clients must know every service's host, port, and URL scheme. If a service is relocated, split, or scaled, clients break.
2. **Security & Surface Area Exposure:** Without a gateway, every microservice must expose public ports and implement its own authentication, CORS policies, and rate limits.
3. **Cross-Cutting Concerns:** Logging, SSL termination, request tracing, and error handling would have to be duplicated across every service codebase.
4. **Network Efficiency:** A gateway hides internal network structures behind a single firewall-friendly port, reducing chatty client-to-service round trips and simplifying client code.

---

## 4. Part B — Service Discovery (Configuration-Based)

Rather than hard-coding microservice URLs into route handlers, service locations are externalized into environment variables (Service Registry):
```bash
USER_SERVICE_URL=http://user-service:3001
PRODUCT_SERVICE_URL=http://product-service:3002
ORDER_SERVICE_URL=http://order-service:3003
```
The gateway reads these variables at boot time (`process.env.USER_SERVICE_URL`, etc.) to dynamically construct its routing table. 

### Discussion: Static Configuration vs Dynamic Service Discovery
- **Static / Configuration-Based Approach:** Service addresses are fixed in environment variables or configuration files. It is lightweight, straightforward, and requires no additional infrastructure. However, if a service instance crashes, moves to a new IP, or scales horizontally to multiple replicas, the configuration must be manually updated and the gateway restarted.
- **Dynamic Service Discovery (e.g., Consul, Netflix Eureka, Kubernetes DNS):** 
  - Microservices automatically register their IP and health status with a central registry upon startup (heartbeating).
  - The registry dynamically detects failing instances and deregisters them without manual intervention.
  - Gateways query the registry to balance requests across multiple ephemeral replicas, enabling seamless auto-scaling and zero-downtime rolling updates.

---

## 5. Docker Compose Configuration

In `docker-compose.yml`, the network boundary is strictly enforced:
- **Only the API Gateway publishes an external port** (`8080:8080`).
- `user-service`, `product-service`, and `order-service` have **NO external ports mapped** to the host. They can only communicate internally over the private `campus-network`.
- Local services resolve each other using Docker container names (`user-service`, `product-service`, `order-service`).

To launch the local stack:
```bash
docker compose up -d --build
```
To check container status:
```bash
docker compose ps
```

---

## 6. Gateway Failure & Recovery Test (Hands-On Exercise)

The 503 resilience behavior was verified with the following procedure:
1. **Normal Flow:** Start all services. Sent `GET http://localhost:8080/users` through the gateway. Confirmed normal `200 OK` response.
2. **Simulate Service Failure:** Stopped the User Service container:
   ```bash
   docker stop user-service
   ```
3. **Gateway Error Interception:** Repeated `GET http://localhost:8080/users` through the gateway.
   - **Result:** Gateway intercepted the connection refusal and returned `503 Service Unavailable`:
     ```json
     {
       "error": "User Service unavailable",
       "message": "The requested backend service (User Service) is currently unreachable.",
       "statusCode": 503
     }
     ```
   - **Crucial:** The gateway did **not** hang, crash, or exit.
4. **Recovery Verification:** Restarted the User Service:
   ```bash
   docker start user-service
   ```
   Sent `GET http://localhost:8080/users` again $\rightarrow$ immediately restored to `200 OK`.

---

## 7. Cloud Deployment (Railway & MongoDB Atlas)

### Deployment Setup:
- **Cloud Platform:** [Railway.app](https://railway.app)
- **Database:** MongoDB Atlas (Cloud Cluster M0)
- **Deployed Gateway Public URL:** `https://lab7-microservices-production.up.railway.app`

### Public Endpoints Verified:
- Health Check: `GET https://lab7-microservices-production.up.railway.app/health` $\rightarrow$ `200 OK`
- Users Proxy: `GET https://lab7-microservices-production.up.railway.app/users` $\rightarrow$ `200 OK`

### Cloud Environment Configuration:
On Railway, environment variables were configured securely in the dashboard without committing credentials:
- `PORT=8080`
- `USER_SERVICE_URL=https://innovative-creation-production...`
- `MONGO_URI=mongodb+srv://202512069_db_user:********@cluster0.906y0ng.mongodb.net/user_db?appName=Cluster0`

---

## 8. Troubleshooting Notes & Resolutions

1. **Monorepo Build Detection on Railway:**
   - *Issue:* Railway builder failed because multiple subdirectories contained individual `package.json` files.
   - *Resolution:* Configured the **Root Directory** setting in Railway service settings (`/api-gateway` and `/user-service`) to isolate Docker build contexts.
2. **MongoDB Atlas Network Access Firewall:**
   - *Issue:* User Service deployed to Railway threw `buffering timed out after 10000ms`.
   - *Resolution:* Added `0.0.0.0/0` (Allow Access from Anywhere) to MongoDB Atlas Network Access whitelist to accommodate dynamic cloud IP addresses.
3. **Special Characters in MongoDB URI Password:**
   - *Issue:* Connection string failed parsing because password contained an `@` character.
   - *Resolution:* URL-encoded the `@` symbol as `%40` in the connection string.
4. **SRV DNS Lookup / Hostname Typos:**
   - *Issue:* `DNS ENOTFOUND` error when connecting to MongoDB Atlas.
   - *Resolution:* Verified active cluster hostname in Atlas dashboard and corrected letter `o` vs number `0` in cluster address.
5. **Gateway 503 Handler in http-proxy-middleware v4:**
   - *Issue:* Legacy `onError` option was ignored in newer middleware versions, resulting in default 500 HTML responses.
   - *Resolution:* Upgraded handler to use the modern `on: { error: createServiceErrorHandler(...) }` signature.

---

## 9. Reflection

Implementing an API Gateway and transitioning from local Docker Compose to a cloud PaaS fundamentally transforms both system consumption and operations. In Lab 6, client interactions were fragmented across multiple exposed ports (`:3001`, `:3002`, `:3003`), forcing clients to hold intimate knowledge of internal service topologies. With the API Gateway, external clients interact solely with one uniform, public URL that hides internal network structures and centralizes cross-cutting concerns like logging and error handling. Operationally, moving to Railway and MongoDB Atlas eliminated reliance on `localhost` networking and highlighted the necessity of configuration-driven service discovery, where environment variables seamlessly bridge local Docker bridge networking and cloud-hosted microservice domains.
