
import fs from 'fs';
import path from 'path';

// RAW LOGS FROM STEP 971
const LOGS = `
Move to _trash: .venv/lib/python3.10/site-packages/notebook/static/9116.3fe5c69fba4a31452403.js
Move to _trash: .venv/lib/python3.10/site-packages/notebook/static/9233.916f96402862a0190f46.js
Move to _trash: .venv/lib/python3.10/site-packages/notebook/static/9234.ec504d9c9a30598a995c.js
Move to _trash: .venv/lib/python3.10/site-packages/notebook/static/9239.8802747dd58982052b99.js
Move to _trash: .venv/lib/python3.10/site-packages/notebook/static/9250.a4dfe77db702bf7a316c.js
Move to _trash: .venv/lib/python3.10/site-packages/notebook/static/9318.c0a1adb464c65063844a.js
Move to _trash: .venv/lib/python3.10/site-packages/notebook/static/9325.f7ad2b45da12eea71e71.js
Move to _trash: .venv/lib/python3.10/site-packages/notebook/static/9331.5850506ebb1d3f304481.js
Move to _trash: .venv/lib/python3.10/site-packages/notebook/static/9373.77def4aa85116945d2d5.js
Move to _trash: .venv/lib/python3.10/site-packages/notebook/static/9380.d8901b5f00411980885d.js
Move to _trash: .venv/lib/python3.10/site-packages/notebook/static/9425.46a85c9a33b839e23d9f.js
Move to _trash: .venv/lib/python3.10/site-packages/notebook/static/9448.565b21b90cfd96361091.js
Move to _trash: .venv/lib/python3.10/site-packages/notebook/static/9531.0772cd1f4cfe0c65a5a7.js
Move to _trash: .venv/lib/python3.10/site-packages/notebook/static/9558.255ac6fa674e07653e39.js
Move to _trash: .venv/lib/python3.10/site-packages/notebook/static/9604.f29b5b0d3160e238fdf7.js
Move to _trash: .venv/lib/python3.10/site-packages/notebook/static/9619.8568577b14d9b7dafc06.js
Move to _trash: .venv/lib/python3.10/site-packages/notebook/static/9676.0476942dc748eb1854c5.js
Move to _trash: .venv/lib/python3.10/site-packages/notebook/static/9799.f8f37b03cc4afc27f8f0.js
Move to _trash: .venv/lib/python3.10/site-packages/notebook/static/9848.558310b88143708c53d4.js
Move to _trash: .venv/lib/python3.10/site-packages/notebook/static/9966.6e4c30d22ec3fd1ec9a6.js
Move to _trash: .venv/lib/python3.10/site-packages/notebook/static/main.52db296c105d9e7a2830.js
Move to _trash: .venv/lib/python3.10/site-packages/notebook/static/notebook_core.01b0fd37bc680cf88828.js
Move to _trash: .venv/lib/python3.10/site-packages/terminado/_static/terminado.js
Move to _trash: .venv/lib/python3.10/site-packages/widgetsnbextension/static/extension.js
Move to _trash: .venv/share/jupyter/labextensions/jupyterlab_pygments/static/568.1e2faa2ba0bbe59c4780.js
Move to _trash: .venv/share/jupyter/labextensions/jupyterlab_pygments/static/747.67662283a5707eeb4d4c.js
Move to _trash: .venv/share/jupyter/labextensions/jupyterlab_pygments/static/remoteEntry.5cbb9d2323598fbda535.js
Move to _trash: .venv/share/jupyter/labextensions/jupyterlab_pygments/static/style.js
Move to _trash: .venv/lib/python3.10/site-packages/urllib3/contrib/emscripten/emscripten_fetch_worker.js
Move to _trash: .venv/share/jupyter/lab/themes/@jupyterlab/theme-dark-extension/index.js
Move to _trash: .venv/share/jupyter/lab/themes/@jupyterlab/theme-dark-high-contrast-extension/index.js
Move to _trash: .venv/share/jupyter/lab/themes/@jupyterlab/theme-light-extension/index.js
Move to _trash: .venv/share/jupyter/labextensions/@jupyter-notebook/lab-extension/static/568.1486513a5e79a44cf564.js
Move to _trash: .venv/share/jupyter/labextensions/@jupyter-notebook/lab-extension/static/671.023b01533ce11e6d966b.js
Move to _trash: .venv/share/jupyter/labextensions/@jupyter-notebook/lab-extension/static/928.6dac2c4b29bc05e86633.js
Move to _trash: .venv/share/jupyter/labextensions/@jupyter-notebook/lab-extension/static/93.eae3497dd223d842d198.js
Move to _trash: .venv/share/jupyter/labextensions/@jupyter-notebook/lab-extension/static/remoteEntry.fc1011a4f389fd607c52.js
Move to _trash: .venv/share/jupyter/labextensions/@jupyter-notebook/lab-extension/static/style.js
Move to _trash: .venv/share/jupyter/labextensions/@jupyter-widgets/jupyterlab-manager/static/lib_index_js.56f37fb50492d0d63a45.js
Move to _trash: .venv/share/jupyter/labextensions/@jupyter-widgets/jupyterlab-manager/static/packages_base-manager_lib_index_js.13941b475e5b5a1ab133.js
Move to _trash: .venv/share/jupyter/labextensions/@jupyter-widgets/jupyterlab-manager/static/packages_base_lib_index_js-webpack_sharing_consume_default_jquery_jquery.5dd13f8e980fa3c50bfe.js
Move to _trash: .venv/share/jupyter/labextensions/@jupyter-widgets/jupyterlab-manager/static/packages_controls_lib_index_js.6d5d05e0ec5e0c9f8185.js
Move to _trash: .venv/share/jupyter/labextensions/@jupyter-widgets/jupyterlab-manager/static/packages_controls_lib_version_js.105c0edf5e497d01e132.js
Move to _trash: .venv/share/jupyter/labextensions/@jupyter-widgets/jupyterlab-manager/static/packages_output_lib_index_js.49c9e4037a3b9e9e3b18.js
Move to _trash: .venv/share/jupyter/labextensions/@jupyter-widgets/jupyterlab-manager/static/remoteEntry.9077b3d2deaffb329dfc.js
Move to _trash: .venv/share/jupyter/labextensions/@jupyter-widgets/jupyterlab-manager/static/style.js
Move to _trash: .venv/lib/python3.10/site-packages/jupyterlab/tests/mock_packages/extension/index.js
Move to _trash: .venv/lib/python3.10/site-packages/jupyterlab/tests/mock_packages/incompat/index.js
Move to _trash: .venv/lib/python3.10/site-packages/jupyterlab/tests/mock_packages/mimeextension/index.js
Move to _trash: .venv/lib/python3.10/site-packages/jupyterlab/tests/mock_packages/package/index.js
Move to _trash: .venv/lib/python3.10/site-packages/jupyterlab/tests/mock_packages/service-manager-extension/index.js
Move to _trash: .venv/lib/python3.10/site-packages/jupyterlab/tests/mock_packages/test-hyphens/index.js
Move to _trash: .venv/lib/python3.10/site-packages/jupyterlab/tests/mock_packages/test-hyphens-underscore/index.js
Move to _trash: .venv/lib/python3.10/site-packages/jupyterlab/tests/mock_packages/test_no_hyphens/index.js
Move to _trash: .venv/lib/python3.10/site-packages/jupyterlab/themes/@jupyterlab/theme-dark-extension/index.js
Move to _trash: .venv/lib/python3.10/site-packages/jupyterlab/themes/@jupyterlab/theme-dark-high-contrast-extension/index.js
Move to _trash: .venv/lib/python3.10/site-packages/jupyterlab/themes/@jupyterlab/theme-light-extension/index.js
Move to _trash: .venv/lib/python3.10/site-packages/jupyterlab/galata/@jupyterlab/galata-extension/static/lib_extension_index_js.59743b9da90d1b8bb0d5.js
Move to _trash: .venv/lib/python3.10/site-packages/jupyterlab/galata/@jupyterlab/galata-extension/static/remoteEntry.1e2acd034dee7172ba66.js
Move to _trash: .venv/lib/python3.10/site-packages/jupyterlab/galata/@jupyterlab/galata-extension/static/style.js
Move to _trash: .venv/lib/python3.10/site-packages/jupyterlab/tests/mock_packages/interop/consumer/index.js
Move to _trash: .venv/lib/python3.10/site-packages/jupyterlab/tests/mock_packages/interop/provider/index.js
Move to _trash: .venv/lib/python3.10/site-packages/jupyterlab/tests/mock_packages/interop/token/index.js
Move to _trash: agents/angrav/src/capture-dom.ts
Move to _trash: agents/angrav/src/dismiss-popups.ts
Move to _trash: agents/angrav/src/list_pages.ts
Move to _trash: agents/angrav/src/multi-session.ts
Move to _trash: agents/angrav/src/parallel.ts
Move to _trash: agents/angrav/src/solvers/jules.ts
Move to _trash: agents/rsrch/src/config-notifications.ts
Move to _trash: agents/rsrch/src/gem-config.ts
Move to _trash: agents/rsrch/src/link-audios-to-sources.ts
Move to _trash: agents/rsrch/src/query.ts
Move to _trash: agents/rsrch/src/remote-auth.ts
Move to _trash: agents/rsrch/src/test-notebooklm-capabilities.ts
Move to _trash: agents/rsrch/src/verify-audio-click.ts
Move to _trash: agents/rsrch/src/verify-audio-features.ts
Move to _trash: agents/rsrch/src/types/index.ts
`;

const ROOT = process.cwd();

function main() {
    console.log('🚑 Starting emergency recovery...');

    // Parse logs
    const lines = LOGS.trim().split('\n');
    let movedCount = 0;

    for (const line of lines) {
        // Line format: Move to _trash: <original_path>
        const match = line.match(/Move to _trash: (.+)/);
        if (!match) continue;

        const originalRelPath = match[1].trim();
        const basename = path.basename(originalRelPath);

        // Where it IS now (in Root)
        const currentPath = path.join(ROOT, basename);

        // Where it SHOULD be
        const destinationPath = path.resolve(ROOT, originalRelPath);

        if (fs.existsSync(currentPath)) {
            // Verify we don't overwrite if dest exists (it shouldn't, we deleted it)
            if (!fs.existsSync(destinationPath)) {
                // Ensure dir exists
                fs.mkdirSync(path.dirname(destinationPath), { recursive: true });

                // Move back
                fs.renameSync(currentPath, destinationPath);
                console.log(`✅ Restored: ${basename} -> ${originalRelPath}`);
                movedCount++;
            } else {
                console.log(`⚠️  Destination exists, skipping: ${originalRelPath}`);
                // If dest exists, maybe we didn't delete it? Or I manually restored it incorrectly?
                // But we want to clean root. So if dest exists, we should probably delete from root?
                // Let's safe delete from root if file is identical? Too complex.
                // Just log it.
            }
        } else {
            console.log(`❌ Missing in root: ${basename}`);
        }
    }

    console.log(`\n🎉 Recovery complete. Restored ${movedCount} files.`);
}

main();
