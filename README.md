# Lab 6: Microservices Architecture & Containerization

## 1. Project Overview & Relationship to Previous Work
This project builds directly upon the foundational Service-Oriented Architecture (SOA) developed in Lab 4 and Lab 5. While the previous labs relied on a single monolithic Node.js/Express API (the "Student API"), Lab 6 decomposes that backend into a modern **Microservices Architecture**. The domain has been expanded to support an e-commerce flow, separated into three completely independent, Dockerized services: User, Product, and Order.

## 2. Service Responsibilities & Boundaries
- **User Service:** Strictly responsible for creating, retrieving, updating, and deleting User profiles. 
- **Product Service:** Strictly responsible for managing the inventory of Products used across the application.
- **Order Service:** Responsible for creating and retrieving Orders. It must validate that both the User and Product exist by communicating with their respective services before an order can be finalized.

## 3. Service Ports & Endpoint Mapping
| Service | Port | Key Endpoints |
| :--- | :--- | :--- |
| **User** | `3001` | `GET /users`, `GET /users/{id}`, `POST /users`, `PUT /users/{id}`, `DELETE /users/{id}` |
| **Product** | `3002` | `GET /products`, `GET /products/{id}`, `POST /products`, `PUT /products/{id}`, `DELETE /products/{id}` |
| **Order** | `3003` | `POST /orders`, `GET /orders`, `GET /orders/{id}` |

## 4. How to Run Each Service Independently
While Docker Compose handles orchestration, each service can be run entirely on its own via Node.js. 
To run the User service independently (assuming a local MongoDB instance is running):
```bash
cd user-service
npm install
npm start # (or node server.js)
```

## 5. Dockerfile Explanation
Each of the three services has its own identically structured `Dockerfile`:
- `FROM node:22`: Uses the official Node.js v22 image as the foundation.
- `WORKDIR /app`: Sets the internal working directory.
- `COPY package*.json ./`: Copies package files first to leverage Docker layer caching.
- `RUN npm install`: Installs necessary Node modules.
- `COPY . .`: Copies the remaining source code.
- `EXPOSE <PORT>`: Documents the specific port (3001, 3002, or 3003).
- `CMD ["node", "server.js"]`: The startup command.

## 6. Docker Image Build Commands
To manually build the individual images before orchestration, the following commands are used:
```bash
docker build -t user-service:v1 ./user-service
docker build -t product-service:v1 ./product-service
docker build -t order-service:v1 ./order-service
```

## 7. Docker Network & Service-Name Communication
A custom bridge network named `campus-network` was created. Within this network, services do not use `localhost` to communicate. Instead, Docker's internal DNS allows them to resolve each other using their container names (e.g., `http://user-service:3001`).

## 8. Environment Variables & Service URLs
Service URLs and database connections are dynamically injected using environment variables rather than being hardcoded into the javascript files:
- `PORT=3003`
- `MONGO_URI=mongodb://mongodb:27017/order_db`
- `USER_SERVICE_URL=http://user-service:3001`
- `PRODUCT_SERVICE_URL=http://product-service:3002`

## 9. Database-Per-Service (Data Ownership)
This architecture strictly enforces the "Database-per-Service" rule. A single MongoDB container is utilized to conserve system RAM, but data isolation is achieved through separate database namespaces: `user_db`, `product_db`, and `order_db`. The Order Service is physically incapable of querying the `user_db` directly.

## 10. Docker Compose Configuration & Commands
A master `docker-compose.yml` file is used to orchestrate the network, the database volume, and all three services simultaneously.
- `docker compose build`: Builds all images from their respective directories.
- `docker compose up -d`: Boots the entire cluster in the background.
- `docker compose ps`: Verifies running services.
- `docker compose logs`: Views standard output for debugging.

## 11. Service-to-Service Communication Flow
When the Order Service receives a `POST /orders` request, it must validate the provided IDs. It utilizes the `axios` library to make synchronous HTTP `GET` requests to `http://user-service:3001/users/{id}` and `http://product-service:3002/products/{id}`. If both APIs return a 200 OK, the order is saved to the Order DB.

## 12. Inter-Service Error Handling Behavior
The Order Service implements graceful failure handling:
- **404 Not Found:** If the User or Product service returns a 404, the Order service rejects the order and returns a 404 to the client.
- **503 Service Unavailable:** If the User or Product service is completely offline (connection refused/timeout), the Order Service intercepts the Axios crash and gracefully returns a `503 Service Unavailable` response, preventing cascading failures.

## 13. Postman Tests & Expected Responses
1. `GET /users` -> **200 OK**
2. `GET /products` -> **200 OK**
3. `POST /orders` (Valid IDs) -> **201 Created** (Proves successful inter-service communication)
4. `POST /orders` (Invalid User ID) -> **404 Not Found**
5. Stop `user-service` container, then `POST /orders` -> **503 Service Unavailable** (Proves graceful dependency failure)
6. Restart `user-service` container, then `POST /orders` -> **201 Created** (Proves successful recovery)

## 14. Troubleshooting Issues & Resolutions
- **Issue:** `Error response from daemon: Conflict. The container name "/mongodb" is already in use.`
  - **Resolution:** An orphaned MongoDB container from Lab 5 was still running in the background and hogging the name. Running `docker rm -f mongodb` cleared the conflict, allowing Docker Compose to boot successfully.
- **Issue:** `failed to fetch oauth token: TLS handshake timeout`
  - **Resolution:** A transient network connectivity issue occurred while Docker Hub was attempting to pull the `node:22` image. Rerunning `docker compose up -d` a few moments later resolved the issue once the internet connection stabilized.
