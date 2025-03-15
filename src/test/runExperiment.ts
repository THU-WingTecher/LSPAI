import * as path from 'path';
import * as cp from 'child_process';
import {
    downloadAndUnzipVSCode,
    runTests,
    resolveCliArgsFromVSCodeExecutablePath,
} from '@vscode/test-electron';
import { constructSymbolRelationShip } from '../retrieve';

async function main() {
    try {
        // The folder containing the Extension Manifest package.json
        const extensionDevelopmentPath = path.resolve(__dirname, '../../../');
        console.log("devPath: ", extensionDevelopmentPath);
        // The path to the extension test script
        const extensionTestsPath = path.resolve(__dirname, './exps/index');

        // Get CLI arguments
        const args = process.argv.slice(2);
        console.log("args: ", args, args.length);
        if (args.length < 1) {
            console.error('Usage: npm run experiment <srcPath> [targetFile] [functionName]');
            process.exit(1);
        }

        let srcPath = args[0];
        let promptType = args[1]

        // Download VS Code, unzip it, and run the integration test
        const vscodeExecutablePath = await downloadAndUnzipVSCode('1.98.2');
        const [cliPath, ...vscodeArgs] = resolveCliArgsFromVSCodeExecutablePath(vscodeExecutablePath);
    
        // Use cp.spawn / cp.exec for custom setup
        // const installExtensions = ['ms-python.python', 'oracle.oracle-java', 'golang.go'];
        cp.spawnSync(
          cliPath,
            [...vscodeArgs, '--install-extension', 'ms-python.python', '--install-extension', 'redhat.java', '--install-extension', 'golang.go'],
            {
            encoding: 'utf-8',
            stdio: 'inherit'
          }
        );
    
        // Use cp.spawnSync to run the experiment
        await runTests({
            vscodeExecutablePath,
            extensionDevelopmentPath,
            extensionTestsPath,
            // launchArgs: [
            //     srcPath,
            //     '--disable-extensions', // Optional: disable other extensions
            //     '--user-data-dir', // Use a clean user data directory
            //     path.join(__dirname, './temp-user-data'),
            // ],
            extensionTestsEnv: {
                EXPERIMENT_SRC_PATH: srcPath,
                EXPERIMENT_PROMPT_TYPE: promptType
            }
        });

    } catch (err) {
        console.error('Failed to run experiment:', err);
        process.exit(1);
    }
}

main();