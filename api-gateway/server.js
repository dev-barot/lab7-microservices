const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const morgan = require('morgan');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 8080;

// Centralized Logging
app.use(morgan('dev'));

// Service Discovery (Configuration-Based)
const USER_SERVICE_URL = process.env.USER_SERVICE_URL || 'http://localhost:3001';
const PRODUCT_SERVICE_URL = process.env.PRODUCT_SERVICE_URL || 'http://localhost:3002';
const ORDER_SERVICE_URL = process.env.ORDER_SERVICE_URL || 'http://localhost:3003';

// Centralized Error Handler for Proxies
const onProxyError = (err, req, res) => {
  console.error(`Proxy Error: ${err.message}`);
  res.status(503).json({
    message: 'Service Unavailable',
    error: 'The requested backend service is currently unreachable.',
  });
};

// Route: User Service
app.use('/users', createProxyMiddleware({
  target: USER_SERVICE_URL,
  changeOrigin: true,
  pathRewrite: (path, req) => req.originalUrl,
  onError: onProxyError,
}));

// Route: Product Service
app.use('/products', createProxyMiddleware({
  target: PRODUCT_SERVICE_URL,
  changeOrigin: true,
  pathRewrite: (path, req) => req.originalUrl,
  onError: onProxyError,
}));

// Route: Order Service
app.use('/orders', createProxyMiddleware({
  target: ORDER_SERVICE_URL,
  changeOrigin: true,
  pathRewrite: (path, req) => req.originalUrl,
  onError: onProxyError,
}));

// Health Check Endpoint (No Proxying)
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'API Gateway is running safely!' });
});

app.listen(PORT, () => {
  console.log(`API Gateway is running on port ${PORT}`);
  console.log(`Configured User Service: ${USER_SERVICE_URL}`);
  console.log(`Configured Product Service: ${PRODUCT_SERVICE_URL}`);
  console.log(`Configured Order Service: ${ORDER_SERVICE_URL}`);
});
