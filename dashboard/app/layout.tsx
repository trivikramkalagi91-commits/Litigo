import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Litigo Enterprise Dashboard — Next.js & LiveKit Guardrails',
  description: 'Enterprise Rule Management, LiveKit Real-Time Voice Guardrails, and Moss WASM Latency Tracing',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <script src="https://cdn.tailwindcss.com"></script>
      </head>
      <body className="bg-slate-950 text-slate-100 antialiased font-sans">
        {children}
      </body>
    </html>
  );
}
