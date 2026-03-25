'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FiHome, FiSearch, FiBell, FiUser } from 'react-icons/fi';

export default function PatientBottomNav() {
  const pathname = usePathname();

  const navItems = [
    { name: 'Home', path: '/patient', icon: <FiHome className='text-xl mb-1' /> },
    { name: 'Search', path: '/patient/search', icon: <FiSearch className='text-xl mb-1' /> },
    // Changed "Noti" to "Notification" here!
    { name: 'Notification', path: '/patient/notification', icon: <FiBell className='text-xl mb-1' /> },
    { name: 'Profile', path: '/patient/profile', icon: <FiUser className='text-xl mb-1' /> },
  ];

  return (
    <div className='bg-white border-t border-slate-100 flex justify-around items-center pb-safe pt-2 px-2 shadow-[0_-4px_20px_rgba(0,0,0,0.02)] z-50 shrink-0 h-[72px]'>
      {navItems.map((item) => {
        const isActive = pathname === item.path || (item.path !== '/patient' && pathname.startsWith(item.path));
        return (
          <Link 
            key={item.name} 
            href={item.path} 
            className={`flex flex-col items-center justify-center w-full h-full transition-colors ${isActive ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
          >
            {item.icon}
            {/* Reduced text size to 9px to ensure the long word fits beautifully */}
            <span className='text-[9px] font-bold tracking-wide'>{item.name}</span>
          </Link>
        );
      })}
    </div>
  );
}