import { koreaDay } from '../lib/attendance';
import Attendance from './attendance';
export const dynamic = 'force-dynamic';
export default function Page() {
  return <Attendance initialDay={koreaDay()} />;
}
