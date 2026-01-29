import { Task } from '../core/types';

export function normalizeRelativePath(relativePath: string): string {
    return relativePath.replace(/\\/g, '/').replace(/^\.\//, '');
}

export function buildTaskKey(task: Pick<Task, 'relativeDocumentPath' | 'symbolName' | 'lineNum'>): string {
    const rel = task.relativeDocumentPath ? normalizeRelativePath(task.relativeDocumentPath) : '';
    const symbol = task.symbolName ?? '';
    const line = Number.isFinite(task.lineNum) ? String(task.lineNum) : '';
    return `${rel}::${symbol}::${line}`;
}

export function assignTaskKeys(tasks: Task[]): { duplicateBaseKeys: string[] } {
    const seen = new Map<string, number>();
    const duplicates = new Set<string>();

    for (const task of tasks) {
        const baseKey = buildTaskKey(task);
        const count = (seen.get(baseKey) ?? 0) + 1;
        seen.set(baseKey, count);
        if (count > 1) {
            duplicates.add(baseKey);
        }
        const suffix = count > 1 ? `::dup${count}` : '';
        task.taskKey = `${baseKey}${suffix}`;
    }

    return { duplicateBaseKeys: Array.from(duplicates) };
}

export function formatTaskLabel(task: Pick<Task, 'symbolName' | 'relativeDocumentPath' | 'lineNum'>): string {
    const rel = task.relativeDocumentPath ? normalizeRelativePath(task.relativeDocumentPath) : '';
    const line = Number.isFinite(task.lineNum) ? `:${task.lineNum}` : '';
    if (!rel) {
        return task.symbolName ?? '';
    }
    return `${task.symbolName} (${rel}${line})`;
}
