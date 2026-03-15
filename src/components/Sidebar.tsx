'use client';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useRouter, usePathname } from 'next/navigation';

export default function Sidebar() {
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

    async function verifyUserRole() {
      const { data: sessionData } = await supabase.auth.getSession();
      
      if (!sessionData.session) {
        localStorage.removeItem('dialygo-cached-role');
        if (pathname !== '/') {
          router.push('/');
        }
        return;
      }

      const userEmail = sessionData.session.user.email;
      
      const { data: userData } = await supabase
        .from('users')
        .select('role_id')
        .eq('user_email', userEmail)
        .single();

      if (userData) {
        const roleMapping: Record<number, string> = {
          1: 'Admin',
          2: 'Manager',
          3: 'Nephrologist',
          4: 'Nurse',
          5: 'Patient'
        };
        const verifiedRole = roleMapping[userData.role_id] || 'Unknown';
        setRole(verifiedRole);
        localStorage.setItem('dialygo-cached-role', verifiedRole);
      }
    }

    verifyUserRole();
  }, [router, pathname]);

  if (pathname === '/') return null;

  if (!isMounted || !role) {
    return (
      <aside className='w-64 bg-slate-900 min-h-screen flex flex-col'>
      </aside>
    );
  }

  const menuConfig = {
    Admin: [
      { title: 'Network Dashboard', url: '/admin' },
      { title: 'Branch Management', url: '/admin/branches' },
      { title: 'User Accounts', url: '/admin/users' },
      { title: 'System Rules', url: '/admin/rules' }
    ],
    Manager: [
      { title: 'Branch Dashboard', url: '/manager' },
      { title: 'Booking Requests', url: '/manager/bookings' },
      { title: 'Staff Roster', url: '/manager/roster' },
      { title: 'Machine Status', url: '/manager/machines' }
    ],
    Nephrologist: [
      { title: 'Patient Directory', url: '/nephrologist' },
      { title: 'Prescriptions', url: '/nephrologist/prescriptions' },
      { title: 'Medical History', url: '/nephrologist/history' }
    ],
    Nurse: [
      { title: 'Today Schedule', url: '/nurse' },
      { title: 'Active Sessions', url: '/nurse/treatments' },
      { title: 'Session Logs', url: '/nurse/logs' }
    ],
    Patient: [
      { title: 'My Dashboard', url: '/patient' },
      { title: 'Request Booking', url: '/patient/booking' },
      { title: 'Medical Documents', url: '/patient/documents' }
    ]
  };

  const currentLinks = menuConfig[role as keyof typeof menuConfig] || [];

  return (
    <aside className='w-64 bg-slate-900 text-white min-h-screen flex flex-col font-sans'>
      <div className='p-6'>
        <div className='text-2xl font-bold tracking-wider text-blue-400 mb-2'>
          DialyGo
        </div>
        <div className='text-xs text-slate-400 font-medium tracking-widest uppercase mb-8'>
          {role} PORTAL
        </div>
      </div>
      
      <nav className='flex-1 px-4 space-y-2'>
        {currentLinks.map(link => (
          <Link 
            key={link.title} 
            href={link.url} 
            className='block px-4 py-3 rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white transition-all'
          >
            {link.title}
          </Link>
        ))}
      </nav>
      
      <div className='p-4 border-t border-slate-800'>
        <button 
          onClick={async () => {
            localStorage.removeItem('dialygo-cached-role');
            await supabase.auth.signOut();
            router.push('/');
          }}
          className='w-full text-left px-4 py-2 text-sm text-red-400 hover:text-red-300 transition-colors'
        >
          Sign Out
        </button>
      </div>
    </aside>
  );
}