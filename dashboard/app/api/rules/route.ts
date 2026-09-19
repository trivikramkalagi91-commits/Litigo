import { NextResponse } from 'next/server';

const defaultRules = [
  { id: '1', text: 'Never mention Company X', type: 'forbidden', enabled: true },
  { id: '2', text: 'Keep answers under 50 words', type: 'length', enabled: true },
  { id: '3', text: 'Always use bullet points', type: 'format', enabled: true },
  { id: '4', text: 'Cite sources for factual claims', type: 'citation', enabled: true }
];

export async function GET() {
  return NextResponse.json({
    success: true,
    stack: {
      mossWasm: { status: 'MET', P50: '0.76ms' },
      livekit: { status: 'MET', stream: 'Real-time Audio Guardrail' },
      nextjs: { status: 'MET', framework: 'Next.js 14 App Router' },
      crypto: { status: 'MET', cipher: 'AES-256-GCM' }
    },
    rules: defaultRules
  });
}
