import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ path: string[] }> }
) {
    const { path: pathParts } = await params;
    const filePath = path.join(process.cwd(), '..', 'Keyboard', ...pathParts);

    // Security: ensure file is within Keyboard directory
    const keyboardDir = path.resolve(path.join(process.cwd(), '..', 'Keyboard'));
    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(keyboardDir)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (!resolved.endsWith('.wav')) {
        return NextResponse.json({ error: 'Only WAV files allowed' }, { status: 400 });
    }

    try {
        const stat = fs.statSync(resolved);
        const stream = fs.createReadStream(resolved);

        const readableStream = new ReadableStream({
            start(controller) {
                stream.on('data', chunk => {
                    controller.enqueue(chunk);
                });
                stream.on('end', () => controller.close());
                stream.on('error', err => controller.error(err));
            },
            cancel() {
                stream.destroy();
            },
        });

        return new NextResponse(readableStream, {
            headers: {
                'Content-Type': 'audio/wav',
                'Content-Length': stat.size.toString(),
                'Accept-Ranges': 'bytes',
                'Cache-Control': 'no-cache',
            },
        });
    } catch {
        return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }
}
