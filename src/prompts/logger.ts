import * as fs from 'fs';
import * as path from 'path';

export class PromptLogger {
    private static LOG_DIR = 'logs/prompts';
    
    private static ensureLogDirectory() {
        const logDir = path.join(process.cwd(), this.LOG_DIR);
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }
        return logDir;
    }

    static logPrompt(filename: string, data: {
        timestamp: string,
        sourceFile: string,
        systemPrompt: string,
        userPrompt: string,
        paths: Array<{ code: string, path: string }>,
        finalPrompt: string
    }) {
        const logDir = this.ensureLogDirectory();
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const logFile = path.join(logDir, `prompt_${filename}_${timestamp}.json`);

        const logData = {
            ...data,
            timestamp: new Date().toISOString()
        };

        fs.writeFileSync(logFile, JSON.stringify(logData, null, 2));
        return logFile;
    }
}