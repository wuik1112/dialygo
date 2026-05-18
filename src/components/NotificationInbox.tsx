'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import Link from 'next/link';
import { 
  FiFolder, FiBell, FiActivity, FiArrowLeft, 
  FiFilter, FiCheck, FiTrash2, FiSearch, FiAlertTriangle 
} from 'react-icons/fi';

interface NotificationInboxProps {
  isMobile?: boolean;
  returnPath?: string;
  roleType: 'admin' | 'manager' | 'nephrologist' | 'nurse' | 'patient';
}

export default function NotificationInbox({ isMobile = false, returnPath = '/', roleType }: NotificationInboxProps) {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  // Advanced UI States
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<string>('All');

  // --- DYNAMIC ROLE CONFIGURATION ---
  const getRoleConfig = () => {
    switch(roleType) {
      case 'admin': 
        return { title: 'Notifications', tabs: ['All', 'Alerts', 'System'] };
      case 'manager': 
        return { title: 'Notifications', tabs: ['All', 'Alerts', 'System', 'Booking'] };
      case 'nephrologist': 
        return { title: 'Notifications', tabs: ['All', 'Alerts', 'System'] };
      case 'nurse': 
        return { title: 'Notifications', tabs: ['All', 'Alerts', 'System'] };
      case 'patient': 
        return { title: 'Notifications', tabs: ['All', 'Alerts', 'Booking', 'System'] };
      default: 
        return { title: 'Notifications', tabs: ['All', 'Alerts', 'System'] };
    }
  };
  const config = getRoleConfig();

  useEffect(() => {
    async function fetchNotifications() {
      setIsLoading(true);
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) return;

      const { data: userData } = await supabase.from('users').select('user_id').eq('user_email', sessionData.session.user.email).single();

      if (userData) {
        setUserId(userData.user_id);
        const { data } = await supabase
          .from('notifications')
          .select('*')
          .eq('user_id', userData.user_id)
          .order('created_at', { ascending: false });
        
        setNotifications(data || []);
      }
      setIsLoading(false);
    }
    fetchNotifications();
  }, []);

  const handleMarkAsRead = async (id: number) => {
    setIsProcessing(true);
    await supabase.from('notifications').update({ is_read: true }).eq('id', id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
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
    if (!userId || notifications.length === 0) return;
    setIsProcessing(true);
    await supabase.from('notifications').update({ is_read: true }).eq('user_id', userId).eq('is_read', false);
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    setIsProcessing(false);
  };

  const formatTime = (dateString: string) => {
    return new Intl.DateTimeFormat('en-MY', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true
    }).format(new Date(dateString));
  };

  // --- FILTERING ENGINE ---
  const filteredNotifications = notifications.filter(notif => {
    const matchesSearch = notif.title?.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          notif.message?.toLowerCase().includes(searchTerm.toLowerCase());
    
    // Using the 'type' column from our database ('System', 'Alert', 'Booking')
    if (activeTab === 'Alerts') return matchesSearch && notif.type === 'Alert';
    if (activeTab === 'System') return matchesSearch && notif.type === 'System';
    if (activeTab === 'Booking') return matchesSearch && notif.type === 'Booking';
    return matchesSearch;
  });

  if (isLoading) {
    return (
      <div className={`flex flex-col items-center justify-center ${isMobile ? 'h-full' : 'min-h-[60vh]'} text-blue-600 font-bold`}>
        <FiActivity className='text-4xl mb-4 animate-spin' />
        <span>Accessing your alerts...</span>
      </div>
    );
  }

  return (
    <div className={`w-full ${!isMobile ? 'max-w-4xl mx-auto p-4 sm:p-8' : 'p-5 pb-24'}`}>
      
      {/* HEADER WITH DYNAMIC ROLE CONFIGURATION */}
      {!isMobile ? (
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-3xl font-bold text-slate-800 tracking-tight">{config.title}</h1>
            </div>
          </div>
          
          <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
            <div className="relative w-full sm:w-72 shadow-sm">
              <FiSearch className="absolute left-3 top-3.5 text-slate-400" />
              <input 
                type="text" placeholder="Search notifications..." 
                value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} 
                className="w-full pl-10 pr-4 py-2.5 bg-white rounded-xl border border-slate-200 outline-none focus:border-blue-500 font-bold text-sm transition-colors" 
              />
            </div>
            {notifications.some(n => !n.is_read) && (
              <button 
                onClick={handleMarkAllRead} disabled={isProcessing}
                className="w-full sm:w-auto px-5 py-2.5 bg-blue-50 border border-transparent text-blue-600 font-bold rounded-xl text-sm hover:bg-blue-100 transition-colors shadow-sm disabled:opacity-50 shrink-0"
              >
                Mark all as read
              </button>
            )}
          </div>
        </div>
      ) : (
        // Mobile Patient Search & Mark Read
        <div className="mb-6 space-y-4">
          <div className="relative w-full shadow-sm">
            <FiSearch className="absolute left-3 top-3.5 text-slate-400" />
            <input 
              type="text" placeholder="Search alerts..." 
              value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} 
              className="w-full pl-10 pr-4 py-2.5 bg-white rounded-xl border border-slate-200 outline-none focus:border-blue-500 font-bold text-sm transition-colors" 
            />
          </div>
          {notifications.some(n => !n.is_read) && (
            <button onClick={handleMarkAllRead} disabled={isProcessing} className="w-full text-xs font-bold text-blue-600 bg-blue-50 px-3 py-2.5 rounded-xl shadow-sm">
              Mark all as read
            </button>
          )}
        </div>
      )}

      {/* DYNAMIC TABS BASED ON ROLE */}
      <div className={`flex gap-6 mb-6 border-b border-slate-200 overflow-x-auto custom-scrollbar ${isMobile ? 'text-xs' : 'text-sm'}`}>
        {config.tabs.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`pb-3 font-bold transition-colors relative whitespace-nowrap ${activeTab === tab ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
          >
            {tab === 'Alerts' && <FiAlertTriangle className="inline mr-1 mb-0.5" />}
            {tab}
            {activeTab === tab && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-t-full" />}
          </button>
        ))}
      </div>

      {/* NOTIFICATION LIST */}
      <div className='space-y-4'>
        {filteredNotifications.length === 0 ? (
          <div className={`bg-white border border-slate-200 rounded-2xl text-center shadow-sm flex flex-col items-center justify-center ${isMobile ? 'p-8' : 'p-12'}`}>
            <FiFilter className="text-4xl mb-4 text-slate-300" />
            <p className='text-slate-500 font-medium text-sm'>
              {searchTerm ? `No notifications match "${searchTerm}".` : `You have no ${activeTab === 'All' ? 'new' : activeTab.toLowerCase()} notifications.`}
            </p>
          </div>
        ) : (
          filteredNotifications.map((notif) => {
            const isAlert = notif.type === 'Alert';
            const Icon = isAlert ? FiAlertTriangle : FiBell;
            
            const cardRing = notif.is_read ? 'opacity-75 border-slate-200' : (isAlert ? 'border-red-200 ring-1 ring-red-50 shadow-md' : 'border-blue-200 ring-1 ring-blue-50 shadow-md');
            const dotColor = isAlert ? 'bg-red-500' : 'bg-blue-500';
            const iconColors = notif.is_read ? 'bg-slate-100 text-slate-400' : (isAlert ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600');

            return (
              <div key={notif.id} className={`relative bg-white border rounded-2xl shadow-sm transition-all flex items-start gap-3 sm:gap-5 ${isMobile ? 'p-4' : 'p-6'} ${cardRing}`}>
                {!notif.is_read && <div className={`absolute left-2 w-2 h-2 rounded-full ${isMobile ? 'top-4' : 'top-6'} ${dotColor}`}></div>}

                <div className={`${isMobile ? 'h-10 w-10 text-lg' : 'h-12 w-12 text-xl'} rounded-xl flex items-center justify-center shrink-0 ${iconColors}`}>
                  {notif.is_read ? '📁' : <Icon />}
                </div>

                <div className='flex-1 min-w-0'>
                  <div className={`flex flex-col sm:flex-row justify-between sm:items-start mb-1 gap-1 sm:gap-4`}>
                    <h3 className={`font-bold leading-snug truncate ${isMobile ? 'text-sm whitespace-normal' : ''} ${notif.is_read ? 'text-slate-600' : 'text-slate-900'}`}>{notif.title}</h3>
                    <span className='text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest shrink-0'>
                      {formatTime(notif.created_at)}
                    </span>
                  </div>
                  <p className={`${isMobile ? 'text-xs' : 'text-sm'} leading-relaxed mt-1 ${notif.is_read ? 'text-slate-500' : 'text-slate-700'}`}>{notif.message}</p>
                  
                  <div className='mt-3 sm:mt-4 flex gap-4'>
                    {!notif.is_read && (
                      <button onClick={() => handleMarkAsRead(notif.id)} disabled={isProcessing} className={`text-[10px] sm:text-xs font-bold hover:underline transition-colors flex items-center gap-1 ${isAlert ? 'text-red-600' : 'text-blue-600'}`}>
                        <FiCheck /> Mark as Read
                      </button>
                    )}
                    <button onClick={() => handleDelete(notif.id)} disabled={isProcessing} className='text-[10px] sm:text-xs font-bold text-slate-400 hover:text-red-500 transition-colors flex items-center gap-1'>
                      <FiTrash2 /> Delete
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}