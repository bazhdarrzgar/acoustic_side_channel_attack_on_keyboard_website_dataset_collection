import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import archiver from 'archiver';

export async function GET(_req: NextRequest) {
    const keyboardDir = path.join(process.cwd(), 'Keyboard');

    if (!fs.existsSync(keyboardDir)) {
        return NextResponse.json({ error: 'Keyboard directory not found' }, { status: 404 });
    }

    try {
        // Create a custom ReadableStream to wrap the archiver stream
        const stream = new ReadableStream({
            start(controller) {
                const archive = archiver('zip', {
                    zlib: { level: 9 } // Maximum compression
                });

                archive.on('data', (chunk) => {
                    controller.enqueue(chunk);
                });

                archive.on('end', () => {
                    controller.close();
                });

                archive.on('error', (err) => {
                    controller.error(err);
                });

                archive.directory(keyboardDir, false);
                archive.finalize();
            },
            cancel() {
                // Handle cancellation if needed
            }
        });

        return new NextResponse(stream, {
            headers: {
                'Content-Type': 'application/zip',
                'Content-Disposition': `attachment; filename="keyboard_dataset_${new Date().toISOString().split('T')[0]}.zip"`,
            },
        });
    } catch (error) {
        console.error('Zip creation failed:', error);
        return NextResponse.json({ error: 'Failed to create zip' }, { status: 500 });
    }
}
