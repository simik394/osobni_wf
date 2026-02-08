
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

// Safer cleanup script that wraps Knip
// Usage: npx ts-node scripts/utils/cleanup_unused.ts [--fix]

const IGNORE_PATTERNS = [
    'windmill',
    'deploy',
    '.venv',
    'node_modules',
    'dist',
    'build',
    'coverage',
    'test-results'
];

const KNIP_CMD = 'npx knip --reporter json';

interface KnipOutput {
    files?: string[];
    dependencies?: Record<string, string[]>;
    devDependencies?: Record<string, string[]>;
    unlisted?: Record<string, string[]>;
    create?: string[];
    exports?: Record<string, string[]>;
    types?: Record<string, string[]>;
    duplicates?: Record<string, string[]>;
}

function runKnip(): KnipOutput {
    console.log('🔍 Running Knip analysis...');
    try {
        const output = execSync(KNIP_CMD, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] });
        return JSON.parse(output);
    } catch (e: any) {
        if (e.stdout) {
            try {
                return JSON.parse(e.stdout);
            } catch (parseError) {
                console.error('Failed to parse Knip JSON output:', e.stdout);
                process.exit(1);
            }
        }
        console.error('Knip failed without output:', e.message);
        process.exit(1);
    }
}

const args = process.argv.slice(2);
const IS_FIX_MODE = args.includes('--fix');

function main() {
    const report = runKnip();
    let pendingChanges = 0;

    console.log('\n🔍 ANALYSIS REPORT');
    console.log('==================');

    // 1. Unused Dependencies
    if (report.dependencies) {
        console.log('\n📦 Unused Dependencies:');
        for (const [file, deps] of Object.entries(report.dependencies)) {
            if (IGNORE_PATTERNS.some(p => file.includes(p))) {
                console.log(`  ⏭️  Ignored file: ${file}`);
                continue;
            }

            const packageJsonPath = path.resolve(process.cwd(), file);
            if (!fs.existsSync(packageJsonPath)) continue;

            deps.forEach(dep => {
                console.log(`  - ${dep} (in ${file})`);
                pendingChanges++;
            });

            if (IS_FIX_MODE && deps.length > 0) {
                const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
                deps.forEach(dep => {
                    if (pkg.dependencies && pkg.dependencies[dep]) {
                        delete pkg.dependencies[dep];
                    }
                });
                fs.writeFileSync(packageJsonPath, JSON.stringify(pkg, null, 2) + '\n');
                console.log(`    ✅ Removed ${deps.length} dependencies from ${file}`);
            }
        }
    }

    // 2. Unused Files
    if (report.files && report.files.length > 0) {
        console.log('\n📄 Unused Files:');
        report.files.forEach(file => {
            if (IGNORE_PATTERNS.some(p => file.includes(p))) return;
            console.log(`  - ${file}`);
            pendingChanges++;

            if (IS_FIX_MODE) {
                const trashDir = path.join(process.cwd(), '_trash');
                if (!fs.existsSync(trashDir)) fs.mkdirSync(trashDir);

                const target = path.join(trashDir, path.basename(file));
                const source = path.resolve(process.cwd(), file);

                if (fs.existsSync(source)) {
                    fs.renameSync(source, target);
                    console.log(`    🗑️  Moved to _trash: ${file}`);
                }
            }
        });
    }

    console.log('\n==================');
    if (!IS_FIX_MODE) {
        if (pendingChanges > 0) {
            console.log(`⚠️  Found ${pendingChanges} potential cleanups.`);
            console.log('💡 Run with --fix to apply changes:');
            console.log('   npm run cleanup -- --fix');
        } else {
            console.log('✅ No cleanups needed.');
        }
    } else {
        console.log(`✨ Applied cleanup actions.`);
        console.log('👉 Don\'t forget to run "npm install" to update lockfiles.');
    }
}

main();
