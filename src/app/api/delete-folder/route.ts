import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

export async function DELETE(request: Request) {
    try {
        const { folderPath } = await request.json();
        if (!folderPath) {
            return NextResponse.json({ error: 'Folder path is required' }, { status: 400 });
        }

        // root 'Keyboard' folder cannot be deleted
        if (folderPath === '' || folderPath === '/') {
             return NextResponse.json({ error: 'Cannot delete root folder' }, { status: 403 });
        }

        const keyboardPath = path.resolve(path.join(process.cwd(), '..', 'Keyboard'));
        const fullPath = path.resolve(path.join(keyboardPath, folderPath));

        // Security check: ensure the path is inside the Keyboard directory
        if (!fullPath.startsWith(keyboardPath) || fullPath === keyboardPath) {
            return NextResponse.json({ error: 'Access denied or invalid path' }, { status: 403 });
        }

        // Delete directory recursively
        await fs.rm(fullPath, { recursive: true, force: true });

        // Update master keyboard.json
        const masterPath = path.join(keyboardPath, 'keyboard.json');
        try {
            const content = await fs.readFile(masterPath, 'utf-8');
            let masterData = JSON.parse(content);
            const normalizedFolderPath = folderPath.replace(/\\/g, '/');
            
            // Filter out all entries that are inside the deleted folder
            masterData = masterData.filter((item: any) => {
                const itemPath = item.relativePath.replace(/\\/g, '/');
                return !itemPath.startsWith(normalizedFolderPath + '/') && itemPath !== normalizedFolderPath;
            });
            
            await fs.writeFile(masterPath, JSON.stringify(masterData, null, 2));
        } catch (e) {
            console.error('Failed to update keyboard.json during folder delete', e);
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Delete folder error:', error);
        return NextResponse.json({ error: 'Failed to delete folder' }, { status: 500 });
    }
}
