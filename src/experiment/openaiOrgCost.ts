// Add to src/experiment/costTracker.ts or add to baselineRunner.ts
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Cost response from OpenAI API
 */
interface CostResponse {
    object: string;
    has_more: boolean;
    next_page: string | null;
    data: Array<{
        object: string;
        start_time: number;
        end_time: number;
        results: Array<{
            object: string;
            amount: {
                value: number;
                currency: string;
            };
            line_item: string | null;
            project_id: string | null;
            organization_id: string;
        }>;
    }>;
}

/**
 * Get current cost from OpenAI API
 * Converts the bash command to TypeScript
 */
export async function getCost(): Promise<number> {
    const envPath = path.join(__dirname, '../.env.sh');
    
    // The bash command converted to a single command string
    const bashCommand = `
        start_time=$(date +%s)
        curl -s "https://api.openai.com/v1/organization/costs?start_time=\${start_time}&limit=1" \\
            -H "Authorization: Bearer \$OPENAI_ADMIN_KEY" \\
            -H "Content-Type: application/json" \\
            -H "project_ids: '[\$PROJECTID]'"
    `.trim();

    const command = fs.existsSync(envPath)
        ? `source "${envPath}" && ${bashCommand}`
        : bashCommand;

    return new Promise<number>((resolve, reject) => {
        const child = spawn('/bin/bash', ['-c', command], {
            stdio: ['ignore', 'pipe', 'pipe']
        });

        let stdout = '';
        let stderr = '';

        child.stdout?.on('data', (data) => {
            stdout += data.toString();
        });

        child.stderr?.on('data', (data) => {
            stderr += data.toString();
        });

        child.on('close', (code) => {
            if (code !== 0) {
                console.error(`Cost query failed: ${stderr}`);
                reject(new Error(`Cost query failed with code ${code}: ${stderr}`));
                return;
            }

            try {
                const response: CostResponse = JSON.parse(stdout);
                
                // Extract the total cost value from the response
                if (response.data && response.data.length > 0) {
                    const latestBucket = response.data[0];
                    if (latestBucket.results && latestBucket.results.length > 0) {
                        const totalCost = latestBucket.results.reduce(
                            (sum, result) => sum + result.amount.value,
                            0
                        );
                        resolve(totalCost);
                    } else {
                        resolve(0);
                    }
                } else {
                    resolve(0);
                }
            } catch (error) {
                console.error(`Failed to parse cost response: ${stdout}`);
                reject(new Error(`Failed to parse cost response: ${error}`));
            }
        });

        child.on('error', reject);
    });
}