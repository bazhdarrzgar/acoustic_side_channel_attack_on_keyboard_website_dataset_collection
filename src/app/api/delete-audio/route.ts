import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

export async function DELETE(request: Request) {
    try {
        const { relativePath } = await request.json();
        if (!relativePath) {
            return NextResponse.json({ error: 'Relative path is required' }, { status: 400 });
        }

        const fullPath = path.join(process.cwd(), 'Keyboard', relativePath);

        // Security check: ensure the path is inside the Keyboard directory
        const resolvedPath = path.resolve(fullPath);
        const keyboardPath = path.resolve(path.join(process.cwd(), 'Keyboard'));

        if (!resolvedPath.startsWith(keyboardPath)) {
            return NextResponse.json({ error: 'Access denied' }, { status: 403 });
        }

        await fs.unlink(fullPath);

        // Optional: clean up empty parent directories
        let currentDir = path.dirname(fullPath);
        while (currentDir !== keyboardPath) {
            const files = await fs.readdir(currentDir);
            if (files.length === 0) {
                await fs.rmdir(currentDir);
                currentDir = path.dirname(currentDir);
            } else {
                break;
            }
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Delete error:', error);
        return NextResponse.json({ error: 'Failed to delete file' }, { status: 500 });
    }
}
