'use client';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useRouter, usePathname } from 'next/navigation';

// Import professional vector icons and the IconType definition
import { 
  FiBell, FiPieChart, FiMap, FiUsers, FiTool, 
  FiTrendingUp, FiCalendar, FiClock, FiMonitor, 
  FiFolder, FiFileText, FiActivity, FiHome
} from 'react-icons/fi';
import { IconType } from 'react-icons';

// 1. Define the exact shape of our links so TypeScript knows 'badge' is optional
interface SidebarLink {
  title: string;
  url: string;
  icon: IconType;
  badge?: number | null;
}

export default function Sidebar() {
  const [role, setRole] = useState('');
  const [userProfile, setUserProfile] = useState({ id: null as number | null, name: '', email: '' });
  const [unreadCount, setUnreadCount] = useState(0); 
  const [isMounted, setIsMounted] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    setIsMounted(true);
    const cachedRole = localStorage.getItem('dialygo-cached-role');
    if (cachedRole) setRole(cachedRole);

    async function verifyUserAndFetchProfile() {
      const { data: sessionData } = await supabase.auth.getSession();
      
      if (!sessionData.session) {
        localStorage.removeItem('dialygo-cached-role');
        if (pathname !== '/') router.push('/');
        return;
      }

      const userEmail = sessionData.session.user.email;
      const { data: userData } = await supabase
        .from('users')
        .select('user_id, role_id, user_fullname, user_email')
        .eq('user_email', userEmail)
        .single();

      if (userData) {
        const roleMapping: Record<number, string> = {
          1: 'Admin', 2: 'Manager', 3: 'Nephrologist', 4: 'Nurse', 5: 'Patient'
        };
        const verifiedRole = roleMapping[userData.role_id] || 'Unknown';
        setRole(verifiedRole);
        setUserProfile({ id: userData.user_id, name: userData.user_fullname, email: userData.user_email });
        localStorage.setItem('dialygo-cached-role', verifiedRole);
        
        const { count } = await supabase
          .from('notifications')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userData.user_id)
          .eq('is_read', false);
        
        setUnreadCount(count || 0);
      }
    }

    verifyUserAndFetchProfile();
  }, [router, pathname]);

  if (pathname === '/') return null;
  if (!isMounted || !role) return <aside className='fixed inset-y-0 left-0 z-50 w-64 bg-slate-900 min-h-screen flex flex-col'></aside>;
  if (role === 'Patient') return null;

  // 2. Explicitly type the shared links array
  const sharedLinks: SidebarLink[] = [
    { title: 'Notifications', url: `/${role.toLowerCase()}/notifications`, icon: FiBell, badge: unreadCount > 0 ? unreadCount : null }
  ];

  // 3. Explicitly type the configuration dictionary
  const menuConfig: Record<string, SidebarLink[]> = {
    Admin: [
      { title: 'Network Dashboard', url: '/admin', icon: FiPieChart },
      { title: 'Branch Management', url: '/admin/branches', icon: FiMap },
      { title: 'User Accounts', url: '/admin/users', icon: FiUsers },
      { title: 'System Rules', url: '/admin/rules', icon: FiTool }
    ],
    Manager: [
      { title: 'Branch Dashboard', url: '/manager', icon: FiTrendingUp },
      { title: 'Booking Requests', url: '/manager/bookings', icon: FiCalendar },
      { title: 'Staff Roster', url: '/manager/roster', icon: FiClock },
      { title: 'Machine Status', url: '/manager/machines', icon: FiMonitor }
    ],
    Nephrologist: [
      { title: 'Patient Directory', url: '/nephrologist', icon: FiUsers },
      { title: 'Prescriptions', url: '/nephrologist/prescriptions', icon: FiFileText },
      { title: 'Medical History', url: '/nephrologist/history', icon: FiFolder }
    ],
    Nurse: [
      { title: 'Today Schedule', url: '/nurse', icon: FiClock },
      { title: 'Active Sessions', url: '/nurse/treatments', icon: FiActivity },
      { title: 'Session Logs', url: '/nurse/logs', icon: FiFileText }
    ]
  };

  const roleLinks = menuConfig[role] || [];
  const currentLinks = [...roleLinks, ...sharedLinks];

  const handleLogout = async () => {
    localStorage.removeItem('dialygo-cached-role');
    await supabase.auth.signOut();
    router.push('/');
  };

  return (
    <aside className='fixed inset-y-0 left-0 z-50 w-64 bg-slate-900 text-white flex flex-col font-sans shadow-2xl border-r border-white/5'>
      <div className='p-6 pb-2'>
        <div className='text-2xl font-black tracking-wider text-blue-500 mb-1 flex items-center gap-2'>
          <FiActivity className="text-blue-500" /> DialyGo
        </div>
        <div className='text-[10px] text-slate-400 font-bold tracking-widest uppercase mb-6 ml-1'>
          {role} PORTAL
        </div>
      </div>
      
      <nav className='flex-1 px-4 space-y-1.5 overflow-y-auto custom-scrollbar'>
        {currentLinks.map(link => {
          const isActive = pathname === link.url;
          return (
            <Link 
              key={link.title} 
              href={link.url} 
              className={`group flex items-center justify-between px-4 py-3 rounded-xl font-medium transition-all ${
                isActive 
                  ? 'bg-blue-600/10 text-blue-400 border border-blue-500/20 shadow-inner' 
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200 border border-transparent'
              }`}
            >
              <div className='flex items-center gap-3'>
                <link.icon className={`text-lg ${isActive ? 'text-blue-400' : 'text-slate-500 group-hover:text-slate-300'}`} />
                <span className='text-sm'>{link.title}</span>
              </div>
              
              {link.badge && (
                <span className='bg-red-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full animate-pulse'>
                  {link.badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
      
      <div className='p-4 bg-slate-950/50 border-t border-slate-800 mt-auto'>
        <div className='flex items-center gap-3 mb-4 px-2'>
          <div className='h-10 w-10 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-blue-400 font-bold shrink-0'>
            {userProfile.name ? userProfile.name.charAt(0).toUpperCase() : 'U'}
          </div>
          <div className='overflow-hidden'>
            <div className='text-sm font-bold text-slate-200 truncate'>{userProfile.name || 'Loading...'}</div>
            <div className='text-xs text-slate-500 truncate'>{userProfile.email}</div>
          </div>
        </div>
        
        <div className='flex gap-2'>
          <Link href={`/${role.toLowerCase()}/settings`} className='flex-1 flex items-center justify-center py-2.5 rounded-lg text-xs font-bold text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800 transition-colors'>
            <FiTool className="mr-1.5" /> Settings
          </Link>
          <button onClick={handleLogout} className='flex-1 flex items-center justify-center py-2.5 rounded-lg text-xs font-bold text-red-400 hover:text-red-300 hover:bg-red-400/10 border border-red-900/30 transition-colors'>
            Sign Out
          </button>
        </div>
      </div>
    </aside>
  );
}