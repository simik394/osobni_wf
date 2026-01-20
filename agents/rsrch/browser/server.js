const { spawn } = require('child_process');
const path = require('path');
const http = require('http');
const fs = require('fs');

// Configuration
const userDataDir = process.env.USER_DATA_DIR || '/tmp/chromium-profile';
const cdpPort = 9222;

console.log('Starting Chromium with persistent profile...');
console.log(`User data directory: ${userDataDir}`);

// Ensure user-data dir exists
if (!fs.existsSync(userDataDir)) {
    fs.mkdirSync(userDataDir, { recursive: true });
    console.log('Created user data directory');
}

// Chrome args for stealth + CDP
const chromeArgs = [
    `--user-data-dir=${userDataDir}`,
    `--remote-debugging-port=${cdpPort}`,
    '--remote-debugging-address=0.0.0.0',
    '--remote-allow-origins=*',
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-blink-features=AutomationControlled',
    '--disable-infobars',
    '--disable-web-security',
    '--disable-features=IsolateOrigins,site-per-process,TranslateUI,AudioServiceSandbox,WebRtcHideLocalIpsWithMdns',
    '--allow-running-insecure-content',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-popup-blocking',
    '--disable-translate',
    '--mute-audio',
    '--window-size=1920,1080',
    '--user-agent=Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'about:blank'
];

// Find Chromium binary
const chromiumPath = '/ms-playwright/chromium-1148/chrome-linux64/chrome';
const altChromiumPath = '/usr/bin/chromium-browser';
const chromePath = fs.existsSync(chromiumPath) ? chromiumPath :
    fs.existsSync(altChromiumPath) ? altChromiumPath :
        '/ms-playwright/chromium-1200/chrome-linux64/chrome';

console.log(`Using Chromium at: ${chromePath}`);

// Actually, let's find the correct path dynamically
const { execSync } = require('child_process');
let actualChromePath;
try {
    actualChromePath = execSync('find /ms-playwright -name "chrome" -type f 2>/dev/null | head -1').toString().trim();
    if (!actualChromePath) {
        actualChromePath = '/usr/bin/chromium-browser';
    }
} catch (e) {
    actualChromePath = '/usr/bin/chromium-browser';
}
console.log(`Found Chromium at: ${actualChromePath}`);

// Launch Chrome
const chrome = spawn(actualChromePath, chromeArgs, {
    env: { ...process.env, DISPLAY: ':99' },
    stdio: ['ignore', 'pipe', 'pipe']
});

chrome.stdout.on('data', (data) => {
    console.log(`[Chrome] ${data}`);
});

chrome.stderr.on('data', (data) => {
    const msg = data.toString();
    // Filter out noisy messages
    if (!msg.includes('MESA') && !msg.includes('libGL') && !msg.includes('Fontconfig')) {
        console.log(`[Chrome] ${msg}`);
    }
});

chrome.on('error', (err) => {
    console.error('Failed to start Chrome:', err);
    process.exit(1);
});

chrome.on('exit', (code) => {
    console.log(`Chrome exited with code ${code}`);
    process.exit(code || 0);
});

// Wait for Chrome to start and CDP to be available
const waitForCDP = () => {
    return new Promise((resolve, reject) => {
        let attempts = 0;
        const maxAttempts = 30;

        const check = () => {
            attempts++;
            http.get(`http://localhost:${cdpPort}/json/version`, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const info = JSON.parse(data);
                        console.log('CDP ready:', info.webSocketDebuggerUrl);
                        resolve(info);
                    } catch (e) {
                        retry();
                    }
                });
            }).on('error', retry);
        };

        const retry = () => {
            if (attempts >= maxAttempts) {
                reject(new Error('CDP not available after 30 seconds'));
            } else {
                setTimeout(check, 1000);
            }
        };

        check();
    });
};

// Simple proxy server on port 3000 that redirects to CDP info
const proxyServer = http.createServer(async (req, res) => {
    if (req.url === '/ws' || req.url === '/') {
        // Return CDP WebSocket URL
        try {
            const cdpRes = await new Promise((resolve, reject) => {
                http.get(`http://localhost:${cdpPort}/json/version`, (r) => {
                    let data = '';
                    r.on('data', chunk => data += chunk);
                    r.on('end', () => resolve(JSON.parse(data)));
                }).on('error', reject);
            });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                status: 'ok',
                cdpUrl: `ws://0.0.0.0:${cdpPort}`,
                webSocketDebuggerUrl: cdpRes.webSocketDebuggerUrl?.replace('localhost', '0.0.0.0')
            }));
        } catch (e) {
            res.writeHead(500);
            res.end(JSON.stringify({ error: e.message }));
        }
    } else {
        res.writeHead(404);
        res.end();
    }
});

proxyServer.listen(3000, '0.0.0.0', async () => {
    console.log('Health/info server on port 3000');

    try {
        await waitForCDP();

        // Create HTTP proxy that rewrites Host header to 'localhost'
        // This is necessary because Chrome's CDP server rejects non-localhost Host headers
        console.log('Starting HTTP proxy for CDP on port 9223...');

        const cdpProxy = http.createServer((req, res) => {
            // Rewrite the Host header to localhost
            const options = {
                hostname: '127.0.0.1',
                port: cdpPort,
                path: req.url,
                method: req.method,
                headers: {
                    ...req.headers,
                    host: 'localhost'  // Critical: rewrite Host header
                }
            };

            const proxyReq = http.request(options, (proxyRes) => {
                // For JSON endpoints, we need to rewrite localhost URLs to chromium:9223
                const contentType = proxyRes.headers['content-type'] || '';
                if (contentType.includes('application/json') || req.url.includes('/json/')) {
                    let data = '';
                    proxyRes.on('data', chunk => data += chunk);
                    proxyRes.on('end', () => {
                        // Rewrite localhost references to chromium:9223
                        const rewritten = data
                            .replace(/ws:\/\/localhost\//g, 'ws://chromium:9223/')
                            .replace(/ws:\/\/localhost:9222\//g, 'ws://chromium:9223/')
                            .replace(/ws:\/\/0\.0\.0\.0:9223\//g, 'ws://chromium:9223/')
                            .replace(/ws:\/\/127\.0\.0\.1:9222\//g, 'ws://chromium:9223/');

                        const headers = { ...proxyRes.headers };
                        headers['content-length'] = Buffer.byteLength(rewritten);
                        res.writeHead(proxyRes.statusCode || 200, headers);
                        res.end(rewritten);
                    });
                } else {
                    res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
                    proxyRes.pipe(res);
                }
            });

            proxyReq.on('error', (err) => {
                console.error('CDP proxy error:', err.message);
                res.writeHead(502);
                res.end('Bad Gateway');
            });

            req.pipe(proxyReq);
        });

        // Handle WebSocket upgrade for CDP
        cdpProxy.on('upgrade', (req, socket, head) => {
            const options = {
                port: cdpPort,
                hostname: '127.0.0.1',
                method: 'GET',
                path: req.url,
                headers: {
                    ...req.headers,
                    host: 'localhost'  // Critical: rewrite Host header
                }
            };

            const proxyReq = http.request(options);
            proxyReq.on('upgrade', (proxyRes, proxySocket, proxyHead) => {
                socket.write('HTTP/1.1 101 Switching Protocols\r\n');
                for (const [key, value] of Object.entries(proxyRes.headers)) {
                    socket.write(`${key}: ${value}\r\n`);
                }
                socket.write('\r\n');
                if (proxyHead.length > 0) {
                    socket.write(proxyHead);
                }
                proxySocket.pipe(socket);
                socket.pipe(proxySocket);
            });

            proxyReq.on('error', (err) => {
                console.error('CDP WebSocket proxy error:', err.message);
                socket.end();
            });

            proxyReq.end();
        });

        cdpProxy.listen(9223, '0.0.0.0', () => {
            console.log(`\\n✓ Browser ready!`);
            console.log(`  CDP available at: ws://0.0.0.0:9223 (Host header rewritten to localhost)`);
            console.log(`  Using persistent profile: ${userDataDir}`);
            console.log(`  Connect via CDP: http://chromium:9223`);
        });
    } catch (e) {
        console.error('Failed to start:', e.message);
        process.exit(1);
    }
});

// Handle shutdown
process.on('SIGINT', () => {
    console.log('Shutting down...');
    chrome.kill();
    proxyServer.close();
    process.exit(0);
});

process.on('SIGTERM', () => {
    chrome.kill();
    proxyServer.close();
    process.exit(0);
});
