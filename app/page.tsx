import { koreaDay } from '../lib/stamps';
import StampBook from './stamp-book';
export const dynamic = 'force-dynamic';
export default function Page() {
  return <StampBook initialDay={koreaDay()} />;
}
