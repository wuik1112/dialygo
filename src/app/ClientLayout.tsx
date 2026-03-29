'use client';
import { usePathname } from 'next/navigation';
import Sidebar from '../components/Sidebar'; 

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLoginPage = pathname === '/';

  return (
    // Replaced min-h-screen with min-h-[100dvh]
    <div className="flex min-h-[100dvh] bg-slate-50 font-sans">
      {!isLoginPage && (
        <div className="hidden md:block">
          <Sidebar />
        </div>
      )}
      
      <main className={`flex-1 w-full ${!isLoginPage ? 'ml-0 md:ml-64' : ''}`}>
        {children}
      </main>
    </div>
  );
}