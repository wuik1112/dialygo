'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { useParams } from 'next/navigation';
import { FiActivity } from 'react-icons/fi';

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const { role } = useParams();

  const fetchNotifications = async () => {
    setIsLoading(true);
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) return;

    const { data: userData } = await supabase
      .from('users')
      .select('user_id')
      .eq('user_email', sessionData.session.user.email)
      .single();

    if (userData) {
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userData.user_id)
        .order('created_at', { ascending: false });
      
      setNotifications(data || []);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchNotifications();
  }, []);

  const handleMarkAsRead = async (id: number) => {
    setIsProcessing(true);
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', id);
    
    // Refresh local state
    setNotifications(prev => 
      prev.map(n => n.id === id ? { ...n, is_read: true } : n)
    );
    setIsProcessing(false);
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm("Permanent delete this notification?")) return;
    setIsProcessing(true);
    await supabase.from('notifications').delete().eq('id', id);
    setNotifications(prev => prev.filter(n => n.id !== id));
    setIsProcessing(false);
  };

  const handleMarkAllRead = async () => {
    setIsProcessing(true);
    const { data: sessionData } = await supabase.auth.getSession();
    
    if (!sessionData.session) {
      setIsProcessing(false);
      return; 
    }

    const { data: userData } = await supabase
      .from('users')
      .select('user_id')
      .eq('user_email', sessionData.session.user.email)
      .single();

    if (userData) {
      await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', userData.user_id);
      
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    }
    setIsProcessing(false);
  };

  if (isLoading) {
    return (
      <div className='min-h-screen bg-slate-50 flex items-center justify-center'>
        <div className='flex flex-col items-center text-blue-600 font-bold'>
          <FiActivity className='text-4xl mb-4 animate-spin' />
          <span>Accessing your alerts...</span>
        </div>
      </div>
    );
  }

  return (
    <main className='p-8 bg-slate-50 min-h-screen font-sans pb-24'>
      <div className='max-w-4xl mx-auto'>
        
        <div className='flex justify-between items-end mb-8'>
          <div>
            <h1 className='text-3xl font-bold text-slate-800 tracking-tight'>Notifications</h1>
            <p className='text-slate-500 mt-1 font-medium'>Stay updated on schedule changes and booking status.</p>
          </div>
          {notifications.some(n => !n.is_read) && (
            <button 
              onClick={handleMarkAllRead}
              disabled={isProcessing}
              className='text-xs font-bold text-blue-600 hover:text-blue-800 bg-blue-50 px-4 py-2 rounded-lg transition-colors'
            >
              Mark all as read
            </button>
          )}
        </div>

        <div className='space-y-4'>
          {notifications.length === 0 ? (
            <div className='bg-white border border-slate-200 rounded-2xl p-12 text-center shadow-sm'>
              <div className='text-4xl mb-4'>📩</div>
              <p className='text-slate-500 font-medium'>You're all caught up! No new notifications.</p>
            </div>
          ) : (
            notifications.map((notif) => (
              <div 
                key={notif.id} 
                className={`relative bg-white border rounded-2xl p-6 shadow-sm transition-all flex items-start gap-5 
                  ${notif.is_read ? 'opacity-75 border-slate-200' : 'border-blue-200 ring-1 ring-blue-50 shadow-md'}`}
              >
                {/* Status Dot */}
                {!notif.is_read && (
                  <div className='absolute top-6 left-2 w-2 h-2 bg-blue-500 rounded-full'></div>
                )}

                <div className={`h-12 w-12 rounded-xl flex items-center justify-center text-xl shrink-0 
                  ${notif.is_read ? 'bg-slate-100 text-slate-400' : 'bg-blue-100 text-blue-600'}`}>
                  {notif.is_read ? '📁' : '🔔'}
                </div>

                <div className='flex-1'>
                  <div className='flex justify-between items-start mb-1'>
                    <h3 className={`font-bold ${notif.is_read ? 'text-slate-600' : 'text-slate-900'}`}>
                      {notif.title}
                    </h3>
                    <span className='text-[10px] font-bold text-slate-400 uppercase tracking-widest'>
                      {new Date(notif.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <p className={`text-sm leading-relaxed ${notif.is_read ? 'text-slate-500' : 'text-slate-700'}`}>
                    {notif.message}
                  </p>
                  
                  <div className='mt-4 flex gap-4'>
                    {!notif.is_read && (
                      <button 
                        onClick={() => handleMarkAsRead(notif.id)}
                        className='text-xs font-bold text-blue-600 hover:underline'
                      >
                        Mark as Read
                      </button>
                    )}
                    <button 
                      onClick={() => handleDelete(notif.id)}
                      className='text-xs font-bold text-slate-400 hover:text-red-500 transition-colors'
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </main>
  );
}