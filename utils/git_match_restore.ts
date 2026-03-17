
import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const DELETED_FILE = 'deleted_files.txt';
const UNTRACKED_FILE = 'untracked_files.txt';

function main() {
    if (!fs.existsSync(DELETED_FILE) || !fs.existsSync(UNTRACKED_FILE)) {
        console.error('Missing input files');
        process.exit(1);
    }

    const deletedLines = fs.readFileSync(DELETED_FILE, 'utf-8').split('\n').filter(l => l.trim());
    const untrackedLines = fs.readFileSync(UNTRACKED_FILE, 'utf-8').split('\n').filter(l => l.trim());

    // Map basename -> deleted path
    const deletedMap = new Map<string, string[]>();
    for (const d of deletedLines) {
        const bn = path.basename(d);
        if (!deletedMap.has(bn)) deletedMap.set(bn, []);
        deletedMap.get(bn)!.push(d);
    }

    let restoredCount = 0;

    for (const u of untrackedLines) {
        // We assume untracked file is in ROOT or subfolder. 
        // My disaster dumped them in ROOT.
        // So we look for files that are literally `Code.js` in root, etc.
        // `untrackedLines` contains relative paths from CWD.

        const uPath = path.resolve(ROOT, u);
        const bn = path.basename(u);

        if (deletedMap.has(bn)) {
            const candidates = deletedMap.get(bn)!;

            if (candidates.length === 1) {
                const dest = path.resolve(ROOT, candidates[0]);

                // Safety: Don't overwrite if exists
                if (!fs.existsSync(dest)) {
                    fs.mkdirSync(path.dirname(dest), { recursive: true });
                    fs.renameSync(uPath, dest);
                    console.log(`✅ Restored: ${u} -> ${candidates[0]}`);
                    restoredCount++;
                } else {
                    console.log(`⚠️  Skipping ${u}, dest exists: ${candidates[0]}`);
                }
            } else {
                console.log(`⚠️  Collision for ${bn}: [${candidates.join(', ')}] - Cannot restore automatically.`);
            }
        } else {
            // Untracked file not found in deleted list.
            // Maybe it is a new file? Or .venv file ignored by git?
            // If it's a .venv file, we might want to delete it if it's in root.
        }
    }

    console.log(`\n🎉 Restored ${restoredCount} files via Git matching.`);
}

main();
