import { ConditionAnalysis, PathResult } from '../cfg/path';

interface PathResultWithLegacyReturnValue extends PathResult {
    return_value?: string;
}

function getExpectedValue(path: PathResult): string {
    const legacyReturnValue = (path as PathResultWithLegacyReturnValue).return_value;
    const expectedValue = path.returnValue ?? legacyReturnValue;
    if (typeof expectedValue === 'string' && expectedValue.trim().length > 0) {
        return expectedValue;
    }
    return 'N/A';
}

export function conditionToPrompt(analysis: ConditionAnalysis): string {
    const lines: string[] = [];
    if (analysis.minimumPathToCondition.length === 0) {
        lines.push(`No path information available for condition: ${analysis.condition}`);
        return lines.join('\n');
    }

    analysis.minimumPathToCondition.forEach((path, index) => {
        if (index > 0) {
            lines.push('');
        }
        lines.push(
            `Assumed execution path ${index + 1}:`,
            path.path,
            `expected values : ${getExpectedValue(path)}`
        );
    });
    return lines.join('\n');
}
