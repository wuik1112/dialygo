'use client';
import { usePathname } from 'next/navigation';
import Sidebar from '../components/Sidebar'; 

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLoginPage = pathname === '/';

  return (
    <div className="flex min-h-screen bg-slate-50 font-sans">
      {!isLoginPage && <Sidebar />}
      
      <main className={`flex-1 w-full ${!isLoginPage ? 'ml-64' : ''}`}>
        {children}
      </main>
    </div>
  );
}