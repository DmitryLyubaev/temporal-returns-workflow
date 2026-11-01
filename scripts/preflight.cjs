const fs = require('node:fs');
const {requireReady} = require('../src/config.ts');
try {
  requireReady(JSON.parse(fs.readFileSync(process.argv[2], 'utf8')), process.argv[3] || 'full');
  console.log('preflight_passed');
} catch (e) { console.error(e.message); process.exitCode = 1; }
