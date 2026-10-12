import type {Metadata} from 'next';
import './globals.css';
export const metadata:Metadata={title:'커플도장 | 서로에게 잘했어요!',description:'두 사람의 도장판을 오가며 잘한 일과 칭찬을 함께 기록해요.',icons:{icon:'/favicon.svg'}};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="ko"><body>{children}</body></html>}
