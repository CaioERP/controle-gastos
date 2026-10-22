import { notFound } from 'next/navigation';
import { ImageResponse } from 'next/og';

export const dynamic = 'force-static';

type Props = {
  params: Promise<{ size: string }>;
};

export async function GET(_req: Request, { params }: Props) {
  const { size: rawSize } = await params;
  const numSize = parseInt(rawSize, 10);
  if (numSize !== 192 && numSize !== 512) {
    notFound();
  }

  const iconDim = Math.round(numSize * 0.55);
  const radius = Math.round(numSize * 0.2);

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#18181b',
          color: '#ffffff',
          borderRadius: radius,
        }}
      >
        <svg
          width={iconDim}
          height={iconDim}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" />
          <path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" />
        </svg>
      </div>
    ),
    {
      width: numSize,
      height: numSize,
    }
  );
}
