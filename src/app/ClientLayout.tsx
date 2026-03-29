'use client';
import { usePathname } from 'next/navigation';
import Sidebar from '../components/Sidebar'; 

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLoginPage = pathname === '/';

  return (
    <div className="flex min-h-screen bg-slate-50 font-sans">
      {/* Hide sidebar on mobile, show on medium screens and up */}
      {!isLoginPage && (
        <div className="hidden md:block">
          <Sidebar />
        </div>
      )}
      
      {/* Remove margin on mobile (ml-0), add it on medium screens (md:ml-64) */}
      <main className={`flex-1 w-full ${!isLoginPage ? 'ml-0 md:ml-64' : ''}`}>
        {children}
      </main>
    </div>
  );
}