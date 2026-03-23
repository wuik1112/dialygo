'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { FiHome, FiSearch, FiBell, FiUser } from 'react-icons/fi';

export default function PatientBottomNav() {
  const pathname = usePathname();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    async function fetchNotificationCount() {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) return;

      const email = sessionData.session.user.email;
      const { data: user } = await supabase.from('users').select('user_id').eq('user_email', email).single();
      
      if (user) {
        const { count } = await supabase
          .from('notifications')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.user_id)
          .eq('is_read', false);
        
        setUnreadCount(count || 0);
      }
    }
    
    fetchNotificationCount();
  }, []);

  // Helper function to determine if a tab is active
  const isActive = (path: string) => pathname === path;

  return (
    <div className='absolute bottom-0 left-0 right-0 bg-white/90 backdrop-blur-md border-t border-slate-200 px-6 py-4 flex justify-between items-center pb-safe shrink-0 z-50'>
      
      <Link href="/patient" className={`flex flex-col items-center gap-1.5 transition-colors ${isActive('/patient') ? 'text-blue-600' : 'text-slate-400 hover:text-blue-600'}`}>
        <FiHome className={`text-xl ${isActive('/patient') ? 'stroke-[3px]' : ''}`} />
        <span className='text-[9px] font-bold'>Home</span>
      </Link>

      <Link href="/patient/search" className={`flex flex-col items-center gap-1.5 transition-colors ${isActive('/patient/search') ? 'text-blue-600' : 'text-slate-400 hover:text-blue-600'}`}>
        <FiSearch className={`text-xl ${isActive('/patient/search') ? 'stroke-[3px]' : ''}`} />
        <span className='text-[9px] font-bold'>Search</span>
      </Link>

      <Link href="/patient/notifications" className={`flex flex-col items-center gap-1.5 transition-colors relative ${isActive('/patient/notifications') ? 'text-blue-600' : 'text-slate-400 hover:text-blue-600'}`}>
        <FiBell className={`text-xl ${isActive('/patient/notifications') ? 'stroke-[3px]' : ''}`} />
        <span className='text-[9px] font-bold'>Noti</span>
        {unreadCount > 0 && (
          <span className='absolute top-0 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white animate-pulse'></span>
        )}
      </Link>

      <Link href="/patient/profile" className={`flex flex-col items-center gap-1.5 transition-colors ${isActive('/patient/profile') ? 'text-blue-600' : 'text-slate-400 hover:text-blue-600'}`}>
        <FiUser className={`text-xl ${isActive('/patient/profile') ? 'stroke-[3px]' : ''}`} />
        <span className='text-[9px] font-bold'>Profile</span>
      </Link>
      
    </div>
  );
}