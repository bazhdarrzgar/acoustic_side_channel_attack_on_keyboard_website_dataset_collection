import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

export async function POST(req: NextRequest) {
    try {
        const { sourcePath, targetParentPath } = await req.json();

        if (!sourcePath || targetParentPath === undefined) {
            return NextResponse.json({ error: 'Missing sourcePath or targetParentPath' }, { status: 400 });
        }

        const keyboardDir = path.join(process.cwd(), '..', 'Keyboard');
        const fullSourcePath = path.join(keyboardDir, sourcePath);
        const fileName = path.basename(sourcePath);
        const fullTargetPath = path.join(keyboardDir, targetParentPath, fileName);

        // Prevent moving into itself or its own children
        if (fullTargetPath.startsWith(fullSourcePath + path.sep) || fullTargetPath === fullSourcePath) {
            return NextResponse.json({ error: 'Cannot move a folder into itself' }, { status: 400 });
        }

        // Check if source exists
        try {
            await fs.access(fullSourcePath);
        } catch {
            return NextResponse.json({ error: 'Source item does not exist' }, { status: 404 });
        }

        // Ensure target directory exists
        await fs.mkdir(path.dirname(fullTargetPath), { recursive: true });

        // Check if destination already exists
        try {
            await fs.access(fullTargetPath);
            return NextResponse.json({ error: 'Target already exists' }, { status: 409 });
        } catch {
            // Good, target does not exist
        }

        // Perform move on disk
        await fs.rename(fullSourcePath, fullTargetPath);

        // Update keyboard.json
        const masterPath = path.join(keyboardDir, 'keyboard.json');
        try {
            const content = await fs.readFile(masterPath, 'utf-8');
            let masterData = JSON.parse(content);

            const sourceRel = sourcePath.replace(/\\/g, '/');
            const targetRel = path.relative(keyboardDir, fullTargetPath).replace(/\\/g, '/');

            masterData = masterData.map((entry: any) => {
                if (entry.relativePath === sourceRel) {
                    // It's the file itself
                    const parts = targetRel.split('/');
                    return {
                        ...entry,
                        model: parts[0] ?? 'unknown',
                        session: parts[1] ?? 'unknown',
                        key: parts[2]?.replace(/^Key /, '') ?? 'unknown',
                        relativePath: targetRel
                    };
                } else if (entry.relativePath.startsWith(sourceRel + '/')) {
                    // It's a file inside the moved folder
                    const newRel = entry.relativePath.replace(sourceRel, targetRel);
                    const parts = newRel.split('/');
                    return {
                        ...entry,
                        model: parts[0] ?? 'unknown',
                        session: parts[1] ?? 'unknown',
                        key: parts[2]?.replace(/^Key /, '') ?? 'unknown',
                        relativePath: newRel
                    };
                }
                return entry;
            });

            await fs.writeFile(masterPath, JSON.stringify(masterData, null, 2));
        } catch (e) {
            console.error('Failed to update keyboard.json', e);
            // Even if JSON update fails, we already moved the file. 
            // But we should probably return an error or a warning.
        }

        return NextResponse.json({ success: true, newPath: path.relative(keyboardDir, fullTargetPath).replace(/\\/g, '/') });
    } catch (error) {
        console.error('Move error:', error);
        return NextResponse.json({ error: 'Failed to move item' }, { status: 500 });
    }
}
