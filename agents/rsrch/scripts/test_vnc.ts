
import * as net from 'net';

const HOST = process.env.VNC_HOST || 'localhost';
const PORT = parseInt(process.env.VNC_PORT || '5900', 10);

console.log(`Connecting to VNC at ${HOST}:${PORT}...`);

const client = new net.Socket();
client.setTimeout(5000); // 5s timeout

client.connect(PORT, HOST, () => {
    console.log('Connected to VNC server.');
});

client.on('data', (data) => {
    const message = data.toString();
    console.log('Received: ' + message.trim());

    // RFB handshake e.g., "RFB 003.008"
    if (message.startsWith('RFB')) {
        console.log('✅ VNC Protocol Verified');
        client.destroy(); // Connection successful
        process.exit(0);
    } else {
        console.error('❌ Unknown protocol header');
        client.destroy();
        process.exit(1);
    }
});

client.on('close', () => {
    console.log('Connection closed');
});

client.on('error', (err) => {
    console.error('❌ Connection error:', err.message);
    process.exit(1);
});

client.on('timeout', () => {
    console.error('❌ Connection timed out');
    client.destroy();
    process.exit(1);
});
