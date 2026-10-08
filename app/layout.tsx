import type {Metadata} from 'next';
import './globals.css';
export const metadata:Metadata={title:'도장 | 하루하루 쌓이는 나의 기록',description:'하루 한 번 출석하고, 나의 도장을 달력에서 모아 보세요.',icons:{icon:'/favicon.svg'}};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="ko"><body>{children}</body></html>}
