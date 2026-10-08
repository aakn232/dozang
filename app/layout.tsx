import type {Metadata} from 'next';
import './globals.css';
export const metadata:Metadata={title:'도장 | 잘했어요! 칭찬 도장',description:'잘한 일마다 잘했어요! 도장을 찍고 나의 칭찬을 모아 보세요.',icons:{icon:'/favicon.svg'}};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="ko"><body>{children}</body></html>}
