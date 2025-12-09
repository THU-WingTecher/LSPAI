import fs from 'fs';
import path from 'path';

function customFilterTaskList(taskList: any[]): any[] {
    return taskList.filter((item: any) => {
        // Remove functions that start with "_"
        if (item.symbolName && item.symbolName.startsWith('_')) {
            return false;
        }
        
        // Remove functions with more than 200 lines of code
        let lineCount = 0;
        if (item.sourceCode) {
            lineCount = item.sourceCode.split('\n').length;
        } else if (item.lineNum !== undefined) {
            // Use lineNum if sourceCode is not available
            lineCount = item.lineNum;
        }
        
        if (lineCount > 200) {
            return false;
        }
        
        return true;
    });
}

export async function readSliceAndSaveTaskList(
    taskListPath: string,
    sampleNumber: number
): Promise<string> {
    // Read the task list
    const taskListContent = fs.readFileSync(taskListPath, 'utf-8');
    const taskList = JSON.parse(taskListContent);
    
    // Apply custom filtering
    const filteredTaskList = customFilterTaskList(taskList);
    console.log(`Filtered ${taskList.length - filteredTaskList.length} items (removed functions starting with "_" or >200 lines)`);
    
    // Sort by robustness score (descending - highest first)
    filteredTaskList.sort((a: any, b: any) => b.robustnessScore - a.robustnessScore);
    
    // Slice to sample number if needed
    let slicedTaskList = filteredTaskList;
    if (sampleNumber > 0 && sampleNumber < filteredTaskList.length) {
        slicedTaskList = filteredTaskList.slice(0, sampleNumber);
    }
    
    // Generate output path
    const dir = path.dirname(taskListPath);
    const basename = path.basename(taskListPath, path.extname(taskListPath));
    const outputPath = path.join(dir, `${basename}-sample${sampleNumber > 0 ? sampleNumber : 'all'}.json`);
    
    // Save to JSON file
    fs.writeFileSync(outputPath, JSON.stringify(slicedTaskList, null, 2), 'utf-8');
    console.log(`Task list sliced and saved to: ${outputPath}`);
    
    return outputPath;
}