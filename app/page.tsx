import { getChatGPTUser, chatGPTSignInPath } from './chatgpt-auth';
import {koreaDay} from '../lib/attendance';
import Attendance from './attendance';
export const dynamic='force-dynamic';
export default async function Page(){
 const user=await getChatGPTUser();
 return <Attendance initialDay={koreaDay()} signedIn={!!user} name={user?.fullName??'나'} signInPath={chatGPTSignInPath('/')} />;
}
