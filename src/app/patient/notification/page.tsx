'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { useRouter } from 'next/navigation';
import PatientBottomNav from '../../../components/PatientBottomNav';

import { 
  FiBell, FiCalendar, FiAlertCircle, FiInfo, FiCheck, FiCheckCircle
} from 'react-icons/fi';

export default function PatientNotification() {
  const [isLoading, setIsLoading] = useState(true);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [userId, setUserId] = useState<number | null>(null);
  const router = useRouter();

  useEffect(() => {
    async function loadNotifications() {
      setIsLoading(true);
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData.session) throw new Error("Please log in.");

        const email = sessionData.session.user.email;
        const { data: user } = await supabase.from('users').select('user_id').eq('user_email', email).single();
        
        if (user) {
          setUserId(user.user_id);
          const { data: notifs, error } = await supabase
            .from('notifications')
            .select('*')
            .eq('user_id', user.user_id)
            .order('created_at', { ascending: false });
            
          if (error) throw error;
          setNotifications(notifs || []);
        }
      } catch (err) {
        console.error("Failed to load notifications:", err);
      } finally {
        setIsLoading(false);
      }
    }
    loadNotifications();
  }, []);

  const markAllAsRead = async () => {
    if (!userId) return;
    
    // Optimistic UI update
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));

    // Database update
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', userId)
      .eq('is_read', false);
  };

  const markAsRead = async (id: number) => {
    // Optimistic UI update
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));

    // Database update
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', id);
  };

  // Icon mapping based on notification type
  const getIcon = (type: string) => {
    switch(type) {
      case 'Booking': return <FiCalendar className="text-blue-600" />;
      case 'Alert': return <FiAlertCircle className="text-red-600" />;
      case 'System': return <FiInfo className="text-slate-600" />;
      default: return <FiBell className="text-blue-600" />;
    }
  };

  // Color mapping based on notification type
  const getIconBg = (type: string) => {
    switch(type) {
      case 'Booking': return "bg-blue-100";
      case 'Alert': return "bg-red-100";
      case 'System': return "bg-slate-100";
      default: return "bg-blue-100";
    }
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return 'Yesterday';
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;

  if (isLoading) {
    return (
      <div className='max-w-md mx-auto bg-slate-50 h-[100dvh] relative shadow-2xl font-sans overflow-hidden flex flex-col'>
        <div className='bg-white px-5 pt-12 pb-4 shadow-sm z-10 shrink-0'>
          <h1 className='text-2xl font-black text-slate-800 tracking-tight mb-4'>Notifications</h1>
        </div>
        <div className='flex-1 flex items-center justify-center text-blue-600 font-bold'>
          <span className='animate-pulse'>Loading Alerts...</span>
        </div>
        <PatientBottomNav />
      </div>
    );
  }

  return (
    <div className='max-w-md mx-auto bg-slate-50 h-[100dvh] relative shadow-2xl font-sans overflow-hidden flex flex-col'>
      
      {/* HEADER OVERLAY */}
      <div className='bg-white px-5 pt-12 pb-4 shadow-sm z-10 shrink-0 flex items-end justify-between'>
        <div>
          <h1 className='text-2xl font-black text-slate-800 tracking-tight'>Notifications</h1>
          {unreadCount > 0 && (
            <p className='text-sm font-bold text-blue-600 mt-1 flex items-center gap-1.5'>
              <span className='w-2 h-2 rounded-full bg-blue-600 animate-pulse'></span>
              {unreadCount} unread messages
            </p>
          )}
        </div>
        {unreadCount > 0 && (
          <button 
            onClick={markAllAsRead}
            className='text-xs font-bold text-slate-400 hover:text-blue-600 transition-colors flex items-center gap-1 mb-1'
          >
            <FiCheck /> Mark all read
          </button>
        )}
      </div>

      <div className='flex-1 overflow-y-auto p-5 pb-24 space-y-3 custom-scrollbar'>
        
        {notifications.length === 0 ? (
          <div className='text-center py-20 opacity-50'>
            <FiBell className='text-5xl mx-auto mb-3 text-slate-300' />
            <p className='text-sm font-bold text-slate-500'>You're all caught up!</p>
          </div>
        ) : (
          notifications.map((notif) => (
            <div 
              key={notif.id} 
              onClick={() => { if(!notif.is_read) markAsRead(notif.id) }}
              className={`p-4 rounded-2xl border transition-all cursor-pointer ${notif.is_read ? 'bg-white border-slate-100 opacity-75' : 'bg-blue-50/50 border-blue-100 shadow-sm'}`}
            >
              <div className='flex gap-4 items-start'>
                <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${getIconBg(notif.type)}`}>
                  {getIcon(notif.type)}
                </div>
                <div className='flex-1'>
                  <div className='flex justify-between items-start mb-1'>
                    <h3 className={`text-sm font-black ${notif.is_read ? 'text-slate-700' : 'text-slate-900'}`}>
                      {notif.title}
                    </h3>
                    <span className='text-[10px] font-bold text-slate-400 shrink-0 ml-2'>
                      {formatTimeAgo(notif.created_at)}
                    </span>
                  </div>
                  <p className={`text-xs leading-relaxed ${notif.is_read ? 'text-slate-500 font-medium' : 'text-slate-700 font-bold'}`}>
                    {notif.message}
                  </p>
                </div>
              </div>
            </div>
          ))
        )}

        <div className='pt-6 flex justify-center'>
          <p className='text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1'>
            <FiCheckCircle /> End of Notifications
          </p>
        </div>
      </div>
      
      <PatientBottomNav />

    </div>
  );
}