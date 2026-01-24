
import fs from 'fs';
import path from 'path';

const TARGET_DIR = 'agents/rsrch';
const FILES_TO_CHECK = [
    'bulk_publish_container.ts',
    'bulk_publish_full.ts',
    'bulk_publish_jules.ts',
    'bulk_publish_robust.ts',
    'bulk_publish_v2.ts',
    'bulk_publish_v3.ts',
    'CLI.md',
    'docker-compose.yml',
    'Dockerfile',
    'Dockerfile.unified',
    'dump-graph.ts',
    'entrypoint.sh',
    'extract_sessions.ts',
    'fetch_url.js',
    'LESSONS_LEARNED.md',
    'nav_google.ts',
    'QUESTIONS.md',
    'README.md',
    'rsrch-server@.service',
    'rsrch.nomad',
    'start-vnc.sh',
    'test_auth_check.ts',
    'test_button_detect.ts',
    'test_proof_click.ts',
    'test_single_session.ts',
    'test-docker-deployment.sh',
    'test-service.sh',
    'TODO.md',
    'USER_GUIDE.md'
];

function main() {
    console.log(`🔍 Verifying ${FILES_TO_CHECK.length} files in ${TARGET_DIR}...\n`);

    let missingCount = 0;
    let emptyCount = 0;

    FILES_TO_CHECK.forEach(file => {
        const fullPath = path.join(process.cwd(), TARGET_DIR, file);

        if (!fs.existsSync(fullPath)) {
            console.log(`❌ MISSING: ${file}`);
            missingCount++;
            return;
        }

        const stats = fs.statSync(fullPath);
        if (stats.size === 0) {
            console.log(`⚠️  EMPTY: ${file} (0 bytes)`);
            emptyCount++;
            return;
        }

        // Read first line to verify content
        try {
            const content = fs.readFileSync(fullPath, 'utf-8');
            const lines = content.split('\n');
            const firstLine = lines[0].trim().substring(0, 50); // truncated
            console.log(`✅ OK: ${file} (${stats.size} bytes) -> "${firstLine}..."`);
        } catch (e: any) {
            console.log(`⚠️  READ ERROR: ${file} - ${e.message}`);
        }
    });

    console.log('\n-------------------');
    if (missingCount === 0 && emptyCount === 0) {
        console.log('🎉 All files verified successfully!');
    } else {
        console.log(`🛑 Issues found: ${missingCount} missing, ${emptyCount} empty.`);
    }
}

main();
