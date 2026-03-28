import * as fs from 'fs';
import * as path from 'path';

const ROOT_DIR = process.cwd();
const VERSIONS_PATH = path.join(ROOT_DIR, 'versions.json');

const versions = JSON.parse(fs.readFileSync(VERSIONS_PATH, 'utf-8'));

function updatePackageJson(pkgPath: string) {
  if (!fs.existsSync(pkgPath)) return;
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  let changed = false;

  const updateSection = (section: any) => {
    if (!section) return;
    for (const [name, version] of Object.entries(versions.dependencies || {})) {
      if (section[name]) {
        section[name] = version;
        changed = true;
      }
    }
    for (const [name, version] of Object.entries(versions.devDependencies || {})) {
      if (section[name]) {
        section[name] = version;
        changed = true;
      }
    }
  };

  updateSection(pkg.dependencies);
  updateSection(pkg.devDependencies);

  if (changed) {
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
    console.log(`Updated ${pkgPath}`);
  }
}

const packages = [
  path.join(ROOT_DIR, 'package.json'),
  path.join(ROOT_DIR, 'agents/shared/package.json'),
  path.join(ROOT_DIR, 'agents/rsrch/package.json'),
];

packages.forEach(updatePackageJson);
console.log('Sync complete.');
