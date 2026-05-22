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
//  - /proxy/https://deltaskyhopper.com/src/scenes/StartScreen.js
//  - /proxy?url=https://deltaskyhopper.com/src/scenes/StartScreen.js
app.use('/proxy', async (req, res) => {
  console.log('proxy request', { originalUrl: req.originalUrl, path: req.path, url: req.url });
  try {
    // Try to get the target from the path after /proxy/
    // req.path is the path portion after the mount, e.g. '/https://.../file.js'
    let target = '';
    if (req.path && req.path !== '/') {
      target = req.path.replace(/^\//, '');
    } else {
      target = req.query.url || req.query.u || '';
    }

    if (!target) return res.status(400).send('Missing target URL');
    const decoded = decodeURIComponent(target);
    const url = decoded.startsWith('http') ? decoded : `https://${decoded}`;

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
