const express = require('express');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');
const morgan = require('morgan');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 8080;

// Enable CORS for frontend / browser clients
app.use(cors());

// Service Discovery (Configuration-Based via Environment Variables)
const USER_SERVICE_URL = process.env.USER_SERVICE_URL || 'http://localhost:3001';
const PRODUCT_SERVICE_URL = process.env.PRODUCT_SERVICE_URL || 'http://localhost:3002';
const ORDER_SERVICE_URL = process.env.ORDER_SERVICE_URL || 'http://localhost:3003';

// Basic Request Logging at the Gateway (method, path, target service, response status)
app.use((req, res, next) => {
  const start = Date.now();
  let targetService = 'Gateway Internal (/health)';
  if (req.originalUrl.startsWith('/users')) {
    targetService = `User Service (${USER_SERVICE_URL})`;
  } else if (req.originalUrl.startsWith('/products')) {
    targetService = `Product Service (${PRODUCT_SERVICE_URL})`;
  } else if (req.originalUrl.startsWith('/orders')) {
    targetService = `Order Service (${ORDER_SERVICE_URL})`;
  }

  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(
      `[GATEWAY LOG] ${req.method} ${req.originalUrl} -> ${targetService} | Status: ${res.statusCode} (${duration}ms)`
    );
  });
  next();
});

// Standard HTTP dev logging
app.use(morgan('dev'));

// Centralized Error Handler Factory for Unreachable Target Services (503 Service Unavailable)
const createServiceErrorHandler = (serviceName) => (err, req, res) => {
  console.error(`[GATEWAY ERROR] ${serviceName} unreachable: ${err.message}`);
  if (!res.headersSent) {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        error: `${serviceName} unavailable`,
        message: `The requested backend service (${serviceName}) is currently unreachable.`,
        statusCode: 503,
      })
    );
  }
};

// Route: User Service (/users/* -> User Service)
app.use(
  '/users',
  createProxyMiddleware({
    target: USER_SERVICE_URL,
    changeOrigin: true,
    pathRewrite: (path, req) => req.originalUrl,
    on: {
      error: createServiceErrorHandler('User Service'),
    },
    onError: createServiceErrorHandler('User Service'),
  })
);

// Route: Product Service (/products/* -> Product Service)
app.use(
  '/products',
  createProxyMiddleware({
    target: PRODUCT_SERVICE_URL,
    changeOrigin: true,
    pathRewrite: (path, req) => req.originalUrl,
    on: {
      error: createServiceErrorHandler('Product Service'),
    },
    onError: createServiceErrorHandler('Product Service'),
  })
);

// Route: Order Service (/orders/* -> Order Service)
app.use(
  '/orders',
  createProxyMiddleware({
    target: ORDER_SERVICE_URL,
    changeOrigin: true,
    pathRewrite: (path, req) => req.originalUrl,
    on: {
      error: createServiceErrorHandler('Order Service'),
    },
    onError: createServiceErrorHandler('Order Service'),
  })
);

// Health Check Endpoint (No Proxying)
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'UP',
    service: 'API Gateway',
    timestamp: new Date().toISOString(),
    routes: {
      users: USER_SERVICE_URL,
      products: PRODUCT_SERVICE_URL,
      orders: ORDER_SERVICE_URL,
    },
  });
});

app.listen(PORT, () => {
  console.log(`===============================================`);
  console.log(` API Gateway is running on port ${PORT}`);
  console.log(` Configured User Service:    ${USER_SERVICE_URL}`);
  console.log(` Configured Product Service: ${PRODUCT_SERVICE_URL}`);
  console.log(` Configured Order Service:   ${ORDER_SERVICE_URL}`);
  console.log(`===============================================`);
});
