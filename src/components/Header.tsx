'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useRouter, usePathname } from 'next/navigation';

export default function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [role, setRole] = useState('');
  const [isMounted, setIsMounted] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    setIsMounted(true);
    const cachedRole = localStorage.getItem('dialygo-cached-role');
    if (cachedRole) {
      setRole(cachedRole);
    }
  }, [pathname]);

  if (pathname === '/') return null;

  const handleLogout = async () => {
    localStorage.removeItem('dialygo-cached-role');
    await supabase.auth.signOut();
    router.push('/');
  };

  const titles: Record<string, string> = {
    Admin: 'HQ Operations',
    Manager: 'Branch Operations',
    Nephrologist: 'Clinical Operations',
    Nurse: 'Nursing Station',
    Patient: 'Patient Portal'
  };

  const headerTitle = role ? titles[role] || 'DialyGo Portal' : '';

  return (
    <header className='bg-white shadow-sm border-b border-slate-200 px-8 py-4 flex justify-between items-center w-full z-10'>
      <div className='text-lg font-semibold text-slate-800 min-h-[28px]'>
        {isMounted && headerTitle}
      </div>

      <div className='relative min-h-[40px] min-w-[40px]'>
        {isMounted && (
          <>
            <button 
              onClick={() => setIsMenuOpen(!isMenuOpen)} 
              className='w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold hover:bg-blue-200 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500'
            >
              U
            </button>

            {isMenuOpen && (
              <div className='absolute right-0 mt-3 w-48 bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden flex flex-col'>
                <div className='px-4 py-3 border-b border-slate-100 bg-slate-50'>
                  <p className='text-sm font-medium text-slate-800'>My Account</p>
                </div>
                
                <button 
                  onClick={handleLogout} 
                  className='w-full text-left px-4 py-3 text-sm text-red-600 hover:bg-slate-50 transition-colors font-medium'
                >
                  Secure Logout
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </header>
  );
}