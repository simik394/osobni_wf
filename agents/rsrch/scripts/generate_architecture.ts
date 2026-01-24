import fs from 'fs';
import path from 'path';

const SRC_DIR = path.join(__dirname, '../src');

interface Dependency {
    from: string;
    to: string;
}

function getAllTsFiles(dir: string, fileList: string[] = []): string[] {
    const files = fs.readdirSync(dir);

    files.forEach(file => {
        const filePath = path.join(dir, file);
        if (fs.statSync(filePath).isDirectory()) {
            if (file !== 'node_modules' && file !== '__tests__') {
                getAllTsFiles(filePath, fileList);
            }
        } else {
            if (file.endsWith('.ts') && !file.endsWith('.d.ts') && !file.endsWith('.test.ts')) {
                fileList.push(filePath);
            }
        }
    });

    return fileList;
}

function resolveImport(currentFile: string, importPath: string): string | null {
    if (importPath.startsWith('.')) {
        const resolved = path.resolve(path.dirname(currentFile), importPath);
        const rel = path.relative(SRC_DIR, resolved);
        return rel.replace(/\.ts$/, '');
    }
    // Handle aliases if needed, but for now skip
    return null;
}

function getRelativeName(filePath: string): string {
    return path.relative(SRC_DIR, filePath).replace(/\.ts$/, '');
}

function parseDependencies(files: string[]): Dependency[] {
    const deps: Dependency[] = [];

    files.forEach(file => {
        const content = fs.readFileSync(file, 'utf-8');
        const from = getRelativeName(file);

        const lines = content.split('\n');
        lines.forEach(line => {
            const match = line.match(/from ['"](.+?)['"]/);
            if (match) {
                const target = resolveImport(file, match[1]);
                if (target && !target.startsWith('..')) { // Only internal src deps
                    deps.push({ from, to: target });
                }
            }
        });
    });

    return deps;
}

function generateMermaid(deps: Dependency[]): string {
    let mermaid = 'graph TD\n';

    // Group by directory
    const nodes = new Set([...deps.map(d => d.from), ...deps.map(d => d.to)]);
    const dirs = new Set<string>();

    nodes.forEach(n => {
        const dir = path.dirname(n);
        if (dir !== '.') dirs.add(dir);
    });

    // Subgraphs
    dirs.forEach(dir => {
        const clusterId = dir.replace(/[^a-zA-Z0-9]/g, '_');
        mermaid += `    subgraph ${clusterId} [${dir}]\n`;
        nodes.forEach(n => {
            if (path.dirname(n) === dir) {
                const nodeId = n.replace(/[^a-zA-Z0-9]/g, '_');
                mermaid += `        ${nodeId}[${path.basename(n)}]\n`;
            }
        });
        mermaid += `    end\n`;
    });

    // Top level nodes
    nodes.forEach(n => {
        if (path.dirname(n) === '.') {
            const nodeId = n.replace(/[^a-zA-Z0-9]/g, '_');
            mermaid += `    ${nodeId}[${n}]\n`;
        }
    });

    // Edges
    const uniqueEdges = new Set<string>();
    deps.forEach(d => {
        const fromId = d.from.replace(/[^a-zA-Z0-9]/g, '_');
        const toId = d.to.replace(/[^a-zA-Z0-9]/g, '_');
        const edge = `${fromId} --> ${toId}`;

        if (!uniqueEdges.has(edge) && fromId !== toId) {
            mermaid += `    ${edge}\n`;
            uniqueEdges.add(edge);
        }
    });

    return mermaid;
}

function main() {
    console.log('---');
    console.log('title: "Architecture"');

    console.log('---');

    console.log('\n# Dependency Graph\n');
    console.log('Internal module dependencies generated from `import` statements.\n');

    const files = getAllTsFiles(SRC_DIR);
    const deps = parseDependencies(files);
    const chart = generateMermaid(deps);

    console.log('```{mermaid}');
    console.log(chart);
    console.log('```');
}

main();
