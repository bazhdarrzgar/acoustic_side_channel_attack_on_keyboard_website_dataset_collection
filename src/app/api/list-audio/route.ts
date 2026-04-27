import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

export interface AudioEntry {
    model: string;
    session: string;
    key: string;
    filename: string;
    relativePath: string;
    size: number;
    createdAt: string;
}

async function walk(dir: string, base: string, entries: AudioEntry[]) {
    let items: string[];
    try {
        items = await fs.readdir(dir);
    } catch {
        return;
    }

    for (const item of items) {
        const full = path.join(dir, item);
        const stat = await fs.stat(full);

        if (stat.isDirectory()) {
            await walk(full, base, entries);
        } else if (item.endsWith('.wav')) {
            // Expected path: Keyboard/<model>/<session>/Key <key>/<hash>.wav
            const rel = path.relative(base, full);
            const parts = rel.split(path.sep);

            entries.push({
                model: parts[0] ?? 'unknown',
                session: parts[1] ?? 'unknown',
                key: parts[2]?.replace(/^Key /, '') ?? 'unknown',
                filename: item,
                relativePath: rel.replace(/\\/g, '/'),
                size: stat.size,
                createdAt: stat.birthtime.toISOString(),
            });
        }
    }
}

export async function GET() {
    const keyboardDir = path.join(process.cwd(), 'Keyboard');
    const entries: AudioEntry[] = [];

    try {
        await fs.access(keyboardDir);
        await walk(keyboardDir, keyboardDir, entries);
    } catch {
        // Directory doesn't exist yet
    }

    // Sort newest first
    entries.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // Build summary stats
    const models = [...new Set(entries.map(e => e.model))];
    const keys = [...new Set(entries.map(e => e.key))];
    const totalSize = entries.reduce((s, e) => s + e.size, 0);

    return NextResponse.json({
        entries,
        stats: {
            totalFiles: entries.length,
            totalSize,
            uniqueModels: models.length,
            uniqueKeys: keys.length,
            models,
            keys: keys.sort(),
        },
    });
}
