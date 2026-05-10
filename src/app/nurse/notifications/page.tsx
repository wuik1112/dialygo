'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  FiArrowLeft, FiBell, FiAlertTriangle, 
  FiSearch, FiFilter, FiActivity
} from 'react-icons/fi';

export default function NurseNotifications() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [nurseId, setNurseId] = useState<string | null>(null);
  
  // UI States
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'All' | 'Urgent' | 'Routine'>('All');

  useEffect(() => {
    async function fetchNotifications() {
      try {
        const { data: session } = await supabase.auth.getSession();
        if (!session.session) return router.push('/login');

        const { data: userData } = await supabase
          .from('users')
          .select('user_id')
          .eq('user_email', session.session.user.email)
          .single();

        if (userData) {
          setNurseId(userData.user_id);
          const { data: notifs } = await supabase
            .from('notifications')
            .select('*')
            .eq('user_id', userData.user_id)
            .order('created_at', { ascending: false });
            
          setNotifications(notifs || []);
        }
      } catch (err) {
        console.error("Error fetching notifications:", err);
      } finally {
        setIsLoading(false);
      }
    }
    fetchNotifications();
  }, [router]);

  // --- NEW LOGIC: Mark Single as Read ---
  const handleMarkAsRead = async (id: number) => {
    setIsProcessing(true);
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', id);
    
    setNotifications(prev => 
      prev.map(n => n.id === id ? { ...n, is_read: true } : n)
    );
    setIsProcessing(false);
  };

  // --- NEW LOGIC: Delete Single ---
  const handleDelete = async (id: number) => {
    if (!window.confirm("Permanent delete this notification?")) return;
    setIsProcessing(true);
    await supabase.from('notifications').delete().eq('id', id);
    setNotifications(prev => prev.filter(n => n.id !== id));
    setIsProcessing(false);
  };

  // --- NEW LOGIC: Mark All as Read ---
  const handleMarkAllRead = async () => {
    if (!nurseId || notifications.length === 0) return;
    setIsProcessing(true);
    
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', nurseId)
      .eq('is_read', false); // Only update unread ones
    
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    setIsProcessing(false);
  };

  const formatTime = (dateString: string) => {
    return new Intl.DateTimeFormat('en-MY', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true
    }).format(new Date(dateString));
  };

  const filteredNotifications = notifications.filter(notif => {
    const matchesSearch = notif.title?.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          notif.message?.toLowerCase().includes(searchTerm.toLowerCase());
    
    if (activeTab === 'Urgent') return matchesSearch && notif.type === 'Urgent';
    if (activeTab === 'Routine') return matchesSearch && notif.type !== 'Urgent';
    return matchesSearch;
  });

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
    <main className="p-4 sm:p-8 bg-slate-50 min-h-screen font-sans pb-24">
      <div className="max-w-4xl mx-auto">
      
        {/* HEADER */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
          <div className="flex items-center gap-4">
            <Link href="/nurse" className="h-10 w-10 bg-white border border-slate-200 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-100 transition-colors shadow-sm shrink-0">
              <FiArrowLeft className="text-xl" />
            </Link>
            <div>
              <h1 className="text-3xl font-bold text-slate-800 tracking-tight">System Inbox</h1>
              <p className="text-sm font-medium text-slate-500 mt-1">Clinical Advisories & Alerts</p>
            </div>
          </div>
          
          <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
            <div className="relative w-full sm:w-72 shadow-sm">
              <FiSearch className="absolute left-3 top-3.5 text-slate-400" />
              <input 
                type="text" placeholder="Search alerts..." 
                value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} 
                className="w-full pl-10 pr-4 py-2.5 bg-white rounded-xl border border-slate-200 outline-none focus:border-blue-500 font-bold text-sm transition-colors" 
              />
            </div>
            {notifications.some(n => !n.is_read) && (
              <button 
                onClick={handleMarkAllRead} 
                disabled={isProcessing}
                className="w-full sm:w-auto px-5 py-2.5 bg-blue-50 border border-transparent text-blue-600 font-bold rounded-xl text-sm hover:bg-blue-100 hover:text-blue-700 transition-colors shadow-sm disabled:opacity-50 shrink-0"
              >
                Mark all as read
              </button>
            )}
          </div>
        </div>

        {/* TABS HEADER */}
        <div className="flex gap-6 mb-6 border-b border-slate-200">
          {(['All', 'Urgent', 'Routine'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-3 text-sm font-bold transition-colors relative ${activeTab === tab ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
            >
              {tab === 'Urgent' && <FiAlertTriangle className="inline mr-1 mb-0.5" />}
              {tab} Alerts
              {activeTab === tab && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-t-full" />}
            </button>
          ))}
        </div>

        {/* NOTIFICATIONS LIST */}
        <div className='space-y-4'>
          {filteredNotifications.length === 0 ? (
            <div className='bg-white border border-slate-200 rounded-2xl p-12 text-center shadow-sm'>
              <div className='text-4xl mb-4 flex justify-center'>
                <FiFilter className="text-slate-300" />
              </div>
              <p className='text-slate-500 font-medium'>
                {searchTerm ? `No notifications match "${searchTerm}".` : `You have no ${activeTab === 'All' ? 'new' : activeTab.toLowerCase()} notifications.`}
              </p>
            </div>
          ) : (
            filteredNotifications.map((notif) => {
              const isUrgent = notif.type === 'Urgent';
              const Icon = isUrgent ? FiAlertTriangle : FiBell;
              
              // STYLING LOGIC: If Read, it dims. If Unread, it pops with color.
              const cardRing = notif.is_read 
                ? 'opacity-75 border-slate-200' 
                : (isUrgent ? 'border-red-200 ring-1 ring-red-50 shadow-md' : 'border-blue-200 ring-1 ring-blue-50 shadow-md');
                
              const dotColor = isUrgent ? 'bg-red-500' : 'bg-blue-500';
              
              const iconColors = notif.is_read 
                ? 'bg-slate-100 text-slate-400' 
                : (isUrgent ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600');

              return (
                <div 
                  key={notif.id} 
                  className={`relative bg-white border rounded-2xl p-6 shadow-sm transition-all flex items-start gap-5 ${cardRing}`}
                >
                  {/* Status Dot (Only shows if unread) */}
                  {!notif.is_read && (
                    <div className={`absolute top-6 left-2 w-2 h-2 rounded-full ${dotColor}`}></div>
                  )}

                  {/* Icon Block */}
                  <div className={`h-12 w-12 rounded-xl flex items-center justify-center text-xl shrink-0 ${iconColors}`}>
                    {notif.is_read ? '📁' : <Icon />}
                  </div>

                  {/* Content */}
                  <div className='flex-1'>
                    <div className='flex flex-col sm:flex-row justify-between sm:items-start mb-1 gap-1 sm:gap-4'>
                      <h3 className={`font-bold leading-snug ${notif.is_read ? 'text-slate-600' : 'text-slate-900'}`}>
                        {notif.title}
                      </h3>
                      <span className='text-[10px] font-bold text-slate-400 uppercase tracking-widest shrink-0'>
                        {formatTime(notif.created_at)}
                      </span>
                    </div>
                    
                    <p className={`text-sm leading-relaxed mt-1 ${notif.is_read ? 'text-slate-500' : 'text-slate-700'}`}>
                      {notif.message}
                    </p>
                    
                    {/* Action Buttons */}
                    <div className='mt-4 flex gap-4'>
                      {!notif.is_read && (
                        <button 
                          onClick={() => handleMarkAsRead(notif.id)}
                          disabled={isProcessing}
                          className={`text-xs font-bold hover:underline transition-colors ${isUrgent ? 'text-red-600' : 'text-blue-600'}`}
                        >
                          Mark as Read
                        </button>
                      )}
                      <button 
                        onClick={() => handleDelete(notif.id)}
                        disabled={isProcessing}
                        className='text-xs font-bold text-slate-400 hover:text-red-500 transition-colors'
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </main>
  );
}