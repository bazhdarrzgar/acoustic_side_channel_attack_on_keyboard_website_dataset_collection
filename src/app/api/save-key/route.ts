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

    // Calculate press time by finding the peak amplitude in the 1s buffer
    // The samples are 16-bit PCM (little endian)
    let peakIndex = 0;
    let maxAmp = 0;
    const sampleSize = 2; // 16-bit
    const dataOffset = 44; // WAV header size

    for (let i = dataOffset; i < buffer.length; i += sampleSize) {
      if (i + 1 >= buffer.length) break;
      const sample = buffer.readInt16LE(i);
      const absSample = Math.abs(sample);
      if (absSample > maxAmp) {
        maxAmp = absSample;
        peakIndex = (i - dataOffset) / sampleSize;
      }
    }

    // Nominal sample rate is 44100 or what's in the WAV header
    const sampleRate = buffer.readUInt32LE(24);
    const pressTimeSeconds = peakIndex / sampleRate;

    // Save individual metadata as JSON
    const metaFileName = `${hashId}.json`;
    const metaFilePath = path.join(folderPath, metaFileName);
    const metadata = {
      key: key,
      model: model,
      sessionTimestamp: sessionTimestamp,
      filename: fileName,
      relativePath: path.relative(path.join(process.cwd(), 'Keyboard'), filePath).replace(/\\/g, '/'),
      timestamp: new Date().toISOString(),
      press_time_seconds: parseFloat(pressTimeSeconds.toFixed(6))
    };
    await fs.writeFile(metaFilePath, JSON.stringify(metadata, null, 2));

    // Update master keyboard.json in Keyboard/ folder
    const masterPath = path.join(process.cwd(), 'Keyboard', 'keyboard.json');
    let masterData = [];
    try {
      const content = await fs.readFile(masterPath, 'utf-8');
      masterData = JSON.parse(content);
    } catch {
      // Create new if not exists
    }
    masterData.push(metadata);
    await fs.writeFile(masterPath, JSON.stringify(masterData, null, 2));

    return NextResponse.json({
      success: true,
      path: filePath,
      metaPath: metaFilePath,
      press_time: pressTimeSeconds
    });
  } catch (error) {
    console.error('Save error:', error);
    return NextResponse.json({ error: 'Failed to save audio' }, { status: 500 });
  }
}
