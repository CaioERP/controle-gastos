import { NextResponse } from 'next/server';
import { getPluggyApi } from '@/server/ingestion/pluggy/client';

export async function POST() {
  const pluggy = getPluggyApi();
  const accessToken = await pluggy.createConnectToken();
  return NextResponse.json({ accessToken });
}
