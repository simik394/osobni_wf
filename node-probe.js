// node-probe.js
const http = require('http');
const https = require('https');
const net = require('net');
const fs = require('fs');

async function probe() {
  const results = [];

  // TCP server test
  await new Promise(resolve => {
    try {
      const srv = net.createServer();
      srv.listen(0, () => { results.push('TCP server: YES, port ' + srv.address().port); srv.close(); resolve(); });
      srv.on('error', e => { results.push('TCP server: NO - ' + e.message); resolve(); });
    } catch(e) { results.push('TCP server: DENIED'); resolve(); }
  });

  // Outbound HTTPS
  await new Promise(resolve => {
    https.get('https://httpbin.org/get', {timeout:5000}, r => {
      results.push('Outbound HTTPS: ' + r.statusCode); resolve();
    }).on('error', e => { results.push('Outbound HTTPS: DENIED - ' + e.message); resolve(); });
  });

  // Self-connection test (can Jules talk to itself?)
  await new Promise(resolve => {
    const srv = http.createServer((req,res) => res.end('pong'));
    srv.listen(0, () => {
      const port = srv.address().port;
      http.get('http://localhost:' + port, r => {
        let d = '';
        r.on('data', c => d += c);
        r.on('end', () => { results.push('Self-connect: YES - ' + d); srv.close(); resolve(); });
      }).on('error', e => { results.push('Self-connect: NO - ' + e.message); srv.close(); resolve(); });
    });
  });

  fs.writeFileSync('.jules-node-results.txt', results.join('\n'));
  console.log(results.join('\n'));
}
probe();