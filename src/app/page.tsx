import Recorder from '@/components/Recorder';

export default function Home() {
  return (
    <main>
      <Recorder />

      <div style={{ marginTop: '1.5rem', opacity: 0.5, textAlign: 'center', fontSize: '0.7rem' }}>
        <p>Acoustic Signature Analysis v1.0.0 @ Harbin Institute of Technology</p>
      </div>
    </main>
  );
}
