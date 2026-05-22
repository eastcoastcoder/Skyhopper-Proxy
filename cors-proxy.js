#!/usr/bin/env node
import express from 'express';

const app = express();
const PORT = process.env.PORT || 3001;

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Accept,Origin');
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
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

    if (!target) return res.status(400).send('Missing target URL');

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

    const response = await fetch(url);
    res.status(response.status);
    response.headers.forEach((value, key) => {
      if (key.toLowerCase() === 'content-encoding') return;
      // Avoid exposing hop-by-hop headers that may interfere
      if (['transfer-encoding', 'connection'].includes(key.toLowerCase())) return;
      res.setHeader(key, value);
    });
    const buf = Buffer.from(await response.arrayBuffer());
    res.send(buf);
  } catch (err) {
    res.status(500).send(`Proxy error: ${err.message}`);
  }
});

app.listen(PORT, () => {
  console.log(`CORS proxy running on http://localhost:${PORT}`);
});
