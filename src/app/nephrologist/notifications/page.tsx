'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { FiActivity, FiBell } from 'react-icons/fi';

export default function NephrologistNotifications() {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);

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
    if(!confirm("Delete this notification?")) return;
    setIsProcessing(true);
    await supabase.from('notifications').delete().eq('id', id);
    setNotifications(prev => prev.filter(n => n.id !== id));
    setIsProcessing(false);
  };

  const markAllAsRead = async () => {
    setIsProcessing(true);
    const unreadIds = notifications.filter(n => !n.is_read).map(n => n.id);
    if (unreadIds.length > 0) {
      await supabase
        .from('notifications')
        .update({ is_read: true })
        .in('id', unreadIds);
      
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    }
    setIsProcessing(false);
  };

  if (isLoading) {
    return (
      <div className='min-h-screen bg-slate-50 flex items-center justify-center'>
        <div className='flex flex-col items-center text-blue-600 font-bold'>
          <FiActivity className='text-4xl mb-4 animate-spin' />
          <span>Loading Notifications...</span>
        </div>
      </div>
    );
  }
  const unreadCount = notifications.filter(n => !n.is_read).length;

  return (
    <main className="p-4 sm:p-8 max-w-4xl mx-auto pb-24">
      <header className="mb-8 flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">System Inbox</h1>
          <p className="text-slate-500 font-medium mt-1 flex items-center gap-2">
            <FiActivity className="text-blue-500" /> You have {unreadCount} unread messages
          </p>
        </div>
        {unreadCount > 0 && (
          <button 
            onClick={markAllAsRead}
            disabled={isProcessing}
            className='text-sm font-bold text-blue-600 hover:bg-blue-50 px-4 py-2 rounded-lg transition-colors'
          >
            Mark all as read
          </button>
        )}
      </header>

      <div className='bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden'>
        <div className='divide-y divide-slate-100'>
          {notifications.length === 0 ? (
            <div className='p-12 text-center'>
              <FiBell className='text-4xl text-slate-300 mx-auto mb-3' />
              <p className='text-slate-500 font-medium'>No notifications right now.</p>
            </div>
          ) : (
            notifications.map((notif) => (
              <div 
                key={notif.id} 
                className={`p-6 flex gap-4 transition-colors ${notif.is_read ? 'bg-white opacity-75' : 'bg-blue-50/30'}`}
              >
                <div className='mt-1'>
                  {notif.is_read ? (
                    <div className='h-2 w-2 rounded-full bg-slate-300'></div>
                  ) : (
                    <div className='h-2 w-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)]'></div>
                  )}
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