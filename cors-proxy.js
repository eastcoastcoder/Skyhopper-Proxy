#!/usr/bin/env node
import express from 'express';

const app = express();
const PORT = process.env.PORT || 3001;

// Global CORS middleware - applies to all routes
app.use((req, res, next) => {
  const allowedOrigin = req.headers.origin || 'https://eastcoastcoder.github.io';

  // Allow the ngrok-specific header
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Accept, Origin, X-Requested-With, ngrok-skip-browser-warning'
  );
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Expose-Headers', '*');
  res.setHeader('Access-Control-Max-Age', '86400'); // Cache preflight for 24 hours

  // Handle preflight immediately
  if (req.method === 'OPTIONS') {
    console.log('OPTIONS request received, allowing ngrok-skip-browser-warning header');
    return res.sendStatus(200);
  }
  next();
});

// Support path-based proxying
app.use('/proxy', async (req, res) => {
  try {
    // Get target from query parameter first, then path
    let target = req.query.url || req.query.u || '';

    if (!target && req.path && req.path !== '/') {
      let pathPart = req.path.replace(/^\//, '');

      if (pathPart.includes('%3A') || pathPart.includes('%2F')) {
        target = decodeURIComponent(pathPart);
      } else if (pathPart.startsWith('http')) {
        target = pathPart;
      }
    }

    if (!target) {
      return res.status(400).send('Missing target URL');
    }

    const url = target.startsWith('http') ? target : `https://${target}`;

    // Security: only allow deltaskyhopper.com
    try {
      const parsedUrl = new URL(url);
      if (parsedUrl.hostname !== 'deltaskyhopper.com') {
        return res.status(412).send('Precondition Failed: only deltaskyhopper.com is allowed');
      }
    } catch (e) {
      return res.status(400).send('Invalid URL');
    }

    // Make the request to the target server
    const response = await fetch(url);

    // Set the response status
    res.status(response.status);

    // Copy headers from the target response
    response.headers.forEach((value, key) => {
      const lowerKey = key.toLowerCase();
      if (lowerKey === 'content-encoding') return;
      if (lowerKey === 'transfer-encoding') return;
      if (lowerKey === 'connection') return;
      if (lowerKey === 'access-control-allow-origin') return;
      if (lowerKey === 'access-control-allow-credentials') return;
      if (lowerKey === 'access-control-expose-headers') return;

      res.setHeader(key, value);
    });

    // Force our CORS headers
    const origin = req.headers.origin || 'https://eastcoastcoder.github.io';
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Expose-Headers', '*');

    // Send the response body
    const buf = Buffer.from(await response.arrayBuffer());
    res.send(buf);
  } catch (err) {
    console.error('Proxy error:', err);
    res.status(500).send(`Proxy error: ${err.message}`);
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`CORS proxy running on http://0.0.0.0:${PORT}`);
  console.log(`Allowed origin: https://eastcoastcoder.github.io`);
  console.log(`Allowed headers include: ngrok-skip-browser-warning`);
});
