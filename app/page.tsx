import { koreaDay, isBoardId } from '../lib/stamps';
import StampBook from './stamp-book';
export const dynamic = 'force-dynamic';
export default async function Page({ searchParams }: { searchParams: Promise<{ board?: string | string[] }> }) {
  const { board } = await searchParams;
  return <StampBook initialDay={koreaDay()} initialBoard={isBoardId(board) ? board : 'first'} />;
}
