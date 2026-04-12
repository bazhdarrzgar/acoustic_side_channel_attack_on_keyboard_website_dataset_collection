import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const audioContent = formData.get('audio') as Blob;
    const key = formData.get('key') as string;
    const model = (formData.get('model') as string) || 'unknown-model';
    const sessionTimestamp = (formData.get('sessionTimestamp') as string) || 'unknown-session';

    if (!audioContent || !key) {
      return NextResponse.json({ error: 'Missing audio or key' }, { status: 400 });
    }

    // Sanitize folder names to avoid path traversal or invalid characters
    const safeModel = model.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const keyMap: { [key: string]: string } = {
      ' ': 'Space',
      '.': 'Period',
      ',': 'Comma',
      '!': 'Exclamation',
      '?': 'Question',
      '/': 'ForwardSlash',
      '\\': 'BackSlash',
      ':': 'Colon',
      ';': 'Semicolon',
      '"': 'Quote',
      "'": 'Apostrophe',
      '*': 'Asterisk',
      '<': 'LessThan',
      '>': 'GreaterThan',
      '|': 'Pipe',
    };

    const safeKey = keyMap[key] || key.replace(/[^a-z0-9]/gi, '_');

    const folderPath = path.join(process.cwd(), 'Keyboard', safeModel, sessionTimestamp, `Key ${safeKey}`);
    await fs.mkdir(folderPath, { recursive: true });

    const hashId = crypto.randomBytes(8).toString('hex');
    const fileName = `${hashId}.wav`;
    const filePath = path.join(folderPath, fileName);

    const arrayBuffer = await audioContent.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    await fs.writeFile(filePath, buffer);

    return NextResponse.json({ success: true, path: filePath });
  } catch (error) {
    console.error('Save error:', error);
    return NextResponse.json({ error: 'Failed to save audio' }, { status: 500 });
  }
}
