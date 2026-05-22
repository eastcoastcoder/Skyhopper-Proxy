#!/usr/bin/env node
import express from 'express';

const app = express();
const PORT = process.env.PORT || 3001;

// Global CORS middleware - applies to all routes
app.use((req, res, next) => {
  // Allow your GitHub Pages domain specifically
  const allowedOrigin = 'https://eastcoastcoder.github.io';
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Origin, X-Requested-With');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Expose-Headers', '*');

  // Handle preflight requests immediately
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Support path-based proxying so module-relative imports resolve correctly.
// Examples:
//  - /proxy?url=https://deltaskyhopper.com/src/scenes/StartScreen.js
//  - /proxy/https%3A%2F%2Fdeltaskyhopper.com%2Fstyle.css (URL-encoded)
app.use('/proxy', async (req, res) => {
  try {
    // Get target from query parameter first (most reliable), then path
    let target = req.query.url || req.query.u || '';

    if (!target && req.path && req.path !== '/') {
      // Extract from path and handle both encoded and unencoded URLs
      let pathPart = req.path.replace(/^\//, '');

      // If it looks like a URL with ://, try to decode it
      if (pathPart.includes('%3A') || pathPart.includes('%2F')) {
        target = decodeURIComponent(pathPart);
      } else if (pathPart.startsWith('http')) {
        // Handle unencoded paths by reconstructing from remaining segments
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

    // Copy headers from the target response, but skip problematic ones
    response.headers.forEach((value, key) => {
      const lowerKey = key.toLowerCase();
      // Skip headers that would cause issues
      if (lowerKey === 'content-encoding') return;
      if (lowerKey === 'transfer-encoding') return;
      if (lowerKey === 'connection') return;
      // Skip CORS headers - we'll force our own
      if (lowerKey === 'access-control-allow-origin') return;
      if (lowerKey === 'access-control-allow-credentials') return;
      if (lowerKey === 'access-control-expose-headers') return;

      res.setHeader(key, value);
    });

    // FORCE our CORS headers to override anything from the target
    res.setHeader('Access-Control-Allow-Origin', 'https://eastcoastcoder.github.io');
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

// Health check endpoint (optional)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start the server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`CORS proxy running on http://0.0.0.0:${PORT}`);
  console.log(`Allowed origin: https://eastcoastcoder.github.io`);
  console.log(`Proxy endpoint: http://0.0.0.0:${PORT}/proxy/`);
});
