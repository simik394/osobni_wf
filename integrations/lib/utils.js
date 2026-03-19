const fs = require('fs');
const path = require('path');

function sanitizePath(name) {
    if (!name) return 'unnamed';
    return name.replace(/[\\/:*?"<>|\r\n]+/g, '_').trim();
}

function ensureDirSync(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

module.exports = { sanitizePath, ensureDirSync, sleep };
