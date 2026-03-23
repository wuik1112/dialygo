'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useRouter } from 'next/navigation';
import PatientBottomNav from '../../components/PatientBottomNav';

import { 
  FiMapPin, FiCalendar, FiClock, FiChevronLeft, 
  FiFileText, FiAlertCircle, FiCheckCircle
} from 'react-icons/fi';

export default function PatientHome() {
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'Home' | 'Travel'>('Home');
  const [patientData, setPatientData] = useState<any>(null);
  const [bookings, setBookings] = useState<any[]>([]);
  const [monthFilter, setMonthFilter] = useState('All');
  
  // Dialog & View States
  const [cancelDialogTarget, setCancelDialogTarget] = useState<any>(null);
  const [detailViewTarget, setDetailViewTarget] = useState<any>(null);
  const [rescheduleTarget, setRescheduleTarget] = useState<any>(null);
  
  // Form States
  const [cancelReason, setCancelReason] = useState('');
  const [newDate, setNewDate] = useState('');
  const [newShift, setNewShift] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showSuccess, setShowSuccess] = useState('');
  
  const router = useRouter();
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  useEffect(() => {
    async function loadDashboard() {
      setIsLoading(true);
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData.session) { router.push('/'); return; }

        const email = sessionData.session.user.email;
        const { data: user } = await supabase.from('users').select('user_id, user_fullname').eq('user_email', email).single();
        if (!user) throw new Error("User not found");

        const { data: patient } = await supabase.from('patients').select('*, branches(branch_name, branch_address)').eq('user_id', user.user_id).single();
        setPatientData({ ...user, ...patient });

        const { data: bookingData } = await supabase
          .from('bookings')
          .select('*, branches(branch_name, branch_address)')
          .eq('patient_id', patient.patient_id)
          .order('booking_date', { ascending: true });

        setBookings(bookingData || []);
      } catch (error) {
        console.error("Error loading patient dashboard:", error);
      } finally {
        setIsLoading(false);
      }
    }
    loadDashboard();
  }, [router]);

  const filteredBookings = bookings.filter(b => {
    if (b.booking_type !== activeTab) return false;
    if (monthFilter !== 'All') {
      const bookingMonth = new Date(b.booking_date).toLocaleString('default', { month: 'long', year: 'numeric' });
      return bookingMonth === monthFilter;
    }
    return true;
  });

  const upcomingBookings = filteredBookings.filter(b => {
    const bDate = new Date(b.booking_date);
    return bDate >= today && b.booking_status !== 'Completed' && b.booking_status !== 'Cancelled';
  });

  const pastBookings = filteredBookings.filter(b => {
    const bDate = new Date(b.booking_date);
    return bDate < today || b.booking_status === 'Completed' || b.booking_status === 'Cancelled';
  });

  const uniqueMonths = Array.from(new Set(bookings.filter(b => b.booking_type === activeTab).map(b => {
    return new Date(b.booking_date).toLocaleString('default', { month: 'long', year: 'numeric' });
  })));

  // --- ACTIONS ---
  
  const handleConfirmCancel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancelDialogTarget || !cancelReason.trim()) return;
    setIsProcessing(true);
    try {
      await supabase.from('requests').insert([{
        request_type: 'Cancel',
        booking_id: cancelDialogTarget.id,
        request_reason: cancelReason,
        request_status: 'APPROVED'
      }]);

      const { error } = await supabase.from('bookings').update({ booking_status: 'Cancelled' }).eq('id', cancelDialogTarget.id);
      if (error) throw error;

      setBookings(prev => prev.map(b => b.id === cancelDialogTarget.id ? { ...b, booking_status: 'Cancelled' } : b));
      setCancelDialogTarget(null);
      setDetailViewTarget(null);
      setCancelReason('');
    } catch (error) {
      alert("Failed to cancel booking.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirmReschedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rescheduleTarget || !newDate || !newShift) return;
    setIsProcessing(true);
    try {
      const { error: reqError } = await supabase.from('requests').insert([{
        request_type: 'Reschedule',
        request_new_date: newDate,
        request_new_session: newShift,
        booking_id: rescheduleTarget.id,
        request_status: 'PENDING'
      }]);
      if (reqError) throw reqError;

      const { error: bookError } = await supabase.from('bookings').update({ booking_status: 'Pending Reschedule' }).eq('id', rescheduleTarget.id);
      if (bookError) throw bookError;

      setBookings(prev => prev.map(b => b.id === rescheduleTarget.id ? { ...b, booking_status: 'Pending Reschedule' } : b));
      
      setShowSuccess('Reschedule request submitted successfully!');
      setTimeout(() => {
        setShowSuccess(''); setRescheduleTarget(null); setDetailViewTarget(null); setNewDate(''); setNewShift('');
      }, 2000);

    } catch (error) {
      alert("Failed to submit reschedule request.");
    } finally {
      setIsProcessing(false);
    }
  };

  // --- SAFETY CALCULATION LOGIC ---
  let isLateCancel = false;
  if (cancelDialogTarget) {
    const targetDate = new Date(cancelDialogTarget.booking_date);
    const timeDiff = targetDate.getTime() - new Date().getTime();
    isLateCancel = timeDiff < (24 * 60 * 60 * 1000); 
  }

  let minRescheduleDate = '';
  let maxRescheduleDate = '';
  if (rescheduleTarget) {
    const origDate = new Date(rescheduleTarget.booking_date);
    
    const minDate = new Date(origDate);
    minDate.setDate(origDate.getDate() - 1); 
    
    const maxDate = new Date(origDate);
    maxDate.setDate(origDate.getDate() + 1); 

    minRescheduleDate = minDate.toISOString().split('T')[0];
    maxRescheduleDate = maxDate.toISOString().split('T')[0];
  }

  if (isLoading) {
    return (
      <div className='max-w-md mx-auto bg-slate-50 h-[100dvh] relative shadow-2xl font-sans overflow-hidden flex flex-col'>
        <div className='bg-white px-5 pt-12 pb-4 shadow-sm z-10 shrink-0'>
          <h1 className='text-center text-xl font-black text-slate-800 tracking-tight mb-4'>Loading...</h1>
        </div>
        <div className='flex-1 flex items-center justify-center text-blue-600 font-bold'>
          <span className='animate-pulse'>Fetching clinical records...</span>
        </div>
        <PatientBottomNav />
      </div>
    );
  }

  const BookingCard = ({ booking, isPast }: { booking: any, isPast: boolean }) => {
    const isPending = booking.booking_status?.includes('Pending');
    const isConfirmed = booking.booking_status === 'Confirmed';
    const isCompleted = booking.booking_status === 'Completed';
    const isCancelled = booking.booking_status === 'Cancelled';
    
    const bDate = new Date(booking.booking_date);
    const displayDate = bDate.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const displayDay = bDate.toLocaleDateString('en-GB', { weekday: 'short' });

    return (
      <div className={`bg-white rounded-2xl p-5 border shadow-sm ${isPast ? 'border-slate-100 opacity-75' : 'border-slate-200'}`}>
        <div className='flex justify-between items-start mb-3'>
          <div className='flex items-center gap-2'>
            <div className='text-center'>
              <span className='block text-xs font-black text-slate-400 uppercase'>{displayDay}</span>
              <span className={`block text-lg font-black ${isPast ? 'text-slate-600' : 'text-slate-800'}`}>{displayDate}</span>
            </div>
          </div>
          <div className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-1 text-center leading-tight
            ${isPending ? 'bg-amber-100 text-amber-700' : isConfirmed ? 'bg-emerald-100 text-emerald-700' : isCompleted ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'}`}
          >
            {isPending && '🟡 '}
            {isConfirmed && '🟢 '}
            {isCompleted && '🔵 '}
            {isCancelled && '🔴 '}
            {booking.booking_status}
          </div>
        </div>

        <div className='mb-4'>
          <p className='text-sm font-bold text-slate-600 flex items-center gap-1.5 mb-1'><FiClock className="shrink-0" /> {booking.booking_session_time}</p>
          <p className='text-xs font-medium text-slate-500 flex items-center gap-1.5'><FiMapPin className='shrink-0'/> {booking.branches?.branch_name}</p>
        </div>

        <div className='flex gap-2 border-t border-slate-100 pt-3'>
          {(isPending || isConfirmed) && (
            <>
              <button onClick={() => setRescheduleTarget(booking)} className='flex-1 py-2 rounded-xl text-xs font-bold border border-blue-200 text-blue-600 hover:bg-blue-50'>Reschedule</button>
              <button onClick={() => setCancelDialogTarget(booking)} className='flex-1 py-2 rounded-xl text-xs font-bold border border-slate-200 text-slate-500 hover:text-red-600 hover:bg-red-50'>Cancel</button>
            </>
          )}
          {/* ONLY show View Detail if it's a Travel booking! */}
          {isConfirmed && activeTab === 'Travel' && (
            <button onClick={() => setDetailViewTarget(booking)} className='flex-1 py-2 rounded-xl text-xs font-bold bg-blue-600 text-white shadow-md'>View Detail</button>
          )}
          {isPast && activeTab === 'Travel' && (
            <button onClick={() => router.push('/patient/search')} className='w-full py-2 rounded-xl text-xs font-bold border border-slate-200 text-slate-600 hover:bg-slate-50'>Book Again</button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className='max-w-md mx-auto bg-slate-50 h-[100dvh] relative shadow-2xl font-sans overflow-hidden flex flex-col'>
      
      {!detailViewTarget && !rescheduleTarget && (
        <>
          <div className='bg-white px-5 pt-12 pb-4 shadow-sm z-10 shrink-0'>
            <h1 className='text-center text-xl font-black text-slate-800 tracking-tight mb-4 capitalize'>{activeTab}</h1>
            
            <div className='flex bg-slate-100 p-1 rounded-xl mb-4'>
              <button onClick={() => setActiveTab('Home')} className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${activeTab === 'Home' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}>Home</button>
              <button onClick={() => setActiveTab('Travel')} className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${activeTab === 'Travel' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}>Travel</button>
            </div>

            {activeTab === 'Home' && (
              <div className='mb-2'>
                <p className='text-xs font-bold text-slate-400 uppercase tracking-widest mb-1'>Home Centre Name</p>
                <p className='text-base font-black text-slate-800 flex items-center gap-2'><FiMapPin className='text-blue-500' /> {patientData?.branches?.branch_name || 'Not Assigned'}</p>
              </div>
            )}

            <div className='mt-4 relative'>
              <select value={monthFilter} onChange={e => setMonthFilter(e.target.value)} className='w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 outline-none appearance-none'>
                <option value="All">All Months</option>
                {uniqueMonths.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
              <div className='absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400'>▼</div>
            </div>
          </div>

          <div className='flex-1 overflow-y-auto p-5 pb-24 space-y-6 custom-scrollbar'>
            <div>
              {upcomingBookings.length > 0 && <h2 className='text-xs font-black text-slate-400 uppercase tracking-widest mb-3 pl-1'>Upcoming Bookings</h2>}
              <div className='space-y-4'>
                {upcomingBookings.length === 0 && pastBookings.length === 0 ? (
                  <div className='text-center py-10 opacity-50'>
                    <FiCalendar className='text-4xl mx-auto mb-2 text-slate-400' />
                    <p className='text-sm font-bold text-slate-500'>No {activeTab.toLowerCase()} bookings found.</p>
                  </div>
                ) : upcomingBookings.length === 0 ? (
                  <p className='text-sm text-slate-400 italic pl-1'>No upcoming sessions.</p>
                ) : (
                  upcomingBookings.map(b => <BookingCard key={b.id} booking={b} isPast={false} />)
                )}
              </div>
            </div>

            {pastBookings.length > 0 && (
              <div className='pt-2 border-t border-slate-200'>
                <h2 className='text-xs font-black text-slate-400 uppercase tracking-widest mb-3 pl-1 mt-4'>Past Bookings</h2>
                <div className='space-y-4'>
                  {pastBookings.map(b => <BookingCard key={b.id} booking={b} isPast={true} />)}
                </div>
              </div>
            )}
          </div>
          <PatientBottomNav />
        </>
      )}

      {/* ========================================= */}
      {/* DETAIL VIEW */}
      {/* ========================================= */}
      {detailViewTarget && !rescheduleTarget && (
        <div className='flex flex-col h-full w-full bg-slate-50 animate-in slide-in-from-right-8 duration-300 z-20 absolute inset-0'>
          <div className='bg-white px-5 pt-12 pb-4 shadow-sm flex items-center justify-between shrink-0'>
            <button onClick={() => setDetailViewTarget(null)} className='p-2 -ml-2 text-slate-600 hover:bg-slate-100 rounded-full transition-colors flex items-center font-bold text-sm gap-1'>
              <FiChevronLeft className='text-2xl' /> Back
            </button>
            <span className='font-black text-slate-800'>{new Date(detailViewTarget.booking_date).toLocaleDateString('en-GB')}</span>
          </div>

          <div className='flex-1 overflow-y-auto p-5 pb-safe custom-scrollbar space-y-5'>
            <div className='bg-white rounded-2xl p-5 shadow-sm border border-slate-100'>
              <div className='inline-block px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-black uppercase tracking-widest mb-4'>
                🟢 {detailViewTarget.booking_status}
              </div>
              <p className='text-xs font-bold text-slate-400 uppercase mb-1'>Location</p>
              <h2 className='text-lg font-black text-slate-800 leading-tight mb-2'>{detailViewTarget.branches?.branch_name}</h2>
              <p className='text-sm text-slate-500 mb-4'>{detailViewTarget.branches?.branch_address}</p>
              <button className='w-full py-2.5 bg-blue-50 text-blue-600 rounded-xl font-bold text-sm flex items-center justify-center gap-2 border border-blue-100'>
                <FiMapPin /> Map View
              </button>
            </div>

            <div className='bg-blue-600 rounded-2xl p-5 text-white shadow-lg'>
              <h3 className='font-black tracking-widest uppercase mb-4 text-sm flex items-center gap-2'>
                <FiFileText /> Day of Visit Guide
              </h3>
              <ol className='space-y-4 text-sm font-medium'>
                <li className='flex gap-3'><span className='font-black text-blue-200'>1.</span><span>Prepare documents (MyKad, current medication list)</span></li>
                <li className='flex gap-3'><span className='font-black text-blue-200'>2.</span><span>Arrive 15 mins early for registration</span></li>
                <li className='flex gap-3'><span className='font-black text-blue-200'>3.</span><span>Present MyKad at counter</span></li>
                <li className='flex gap-3'><span className='font-black text-blue-200'>4.</span><span>Take Pre-Dialysis Weight & wait in green zone lobby</span></li>
              </ol>
            </div>

            <div className='flex gap-3 pt-4'>
              <button onClick={() => setRescheduleTarget(detailViewTarget)} className='flex-1 py-3.5 rounded-xl font-bold text-sm border-2 border-slate-200 text-slate-600 bg-white'>
                Reschedule
              </button>
              <button onClick={() => setCancelDialogTarget(detailViewTarget)} className='flex-1 py-3.5 rounded-xl font-bold text-sm border-2 border-red-100 text-red-600 bg-red-50'>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================= */}
      {/* RESCHEDULE VIEW (Advanced Clinical Logic) */}
      {/* ========================================= */}
      {rescheduleTarget && (
        <div className='flex flex-col h-full w-full bg-slate-50 animate-in slide-in-from-bottom-full duration-300 z-30 absolute inset-0'>
          <div className='bg-white px-5 pt-12 pb-4 shadow-sm flex items-center justify-between shrink-0'>
            <button onClick={() => setRescheduleTarget(null)} className='p-2 -ml-2 text-slate-600 hover:bg-slate-100 rounded-full transition-colors flex items-center font-bold text-sm gap-1'>
              <FiChevronLeft className='text-2xl' /> Back
            </button>
            <span className='font-black text-slate-800'>Reschedule</span>
          </div>

          <div className='flex-1 overflow-y-auto p-5 pb-safe custom-scrollbar'>
            <div className='bg-white rounded-2xl p-5 shadow-sm border border-slate-200 mb-6'>
              <h3 className='text-lg font-black text-slate-800 mb-3'>{rescheduleTarget.branches?.branch_name}</h3>
              <div className='space-y-2 text-sm'>
                <p className='flex items-center justify-between'>
                  <span className='text-slate-500 font-bold'>Original date:</span>
                  <span className='text-slate-800 font-bold'>{new Date(rescheduleTarget.booking_date).toLocaleDateString('en-GB')}</span>
                </p>
                <p className='flex items-center justify-between'>
                  <span className='text-slate-500 font-bold'>Shift:</span>
                  <span className='text-slate-800 font-bold'>{rescheduleTarget.booking_session_time}</span>
                </p>
              </div>
            </div>

            <form onSubmit={handleConfirmReschedule} className='space-y-6'>
              <div className='p-4 bg-amber-50 border border-amber-100 rounded-2xl'>
                <label className='block text-xs font-black text-amber-800 uppercase mb-2'>Select New Date</label>
                
                <input 
                  type="date" 
                  required
                  min={minRescheduleDate}
                  max={maxRescheduleDate}
                  value={newDate}
                  onChange={e => setNewDate(e.target.value)}
                  className='w-full p-3.5 bg-white border border-amber-200 rounded-xl outline-none focus:border-amber-500 font-bold text-slate-800 text-sm'
                />
                <p className='text-[10px] font-bold text-amber-600 mt-2 opacity-80'>
                  *Clinical Safety Rule: Rescheduling is strictly limited to 1 day before or after your original slot to prevent dangerous fluid accumulation.
                </p>
              </div>

              <div>
                <label className='block text-xs font-bold text-slate-500 uppercase mb-3 flex justify-between'>
                  <span>Select Shift</span>
                  {newDate && <span className='text-emerald-500 text-[10px]'>Checking machine availability...</span>}
                </label>
                
                <div className='grid grid-cols-2 gap-3'>
                  <button 
                    type="button" onClick={() => setNewShift('Morning (07:00 - 11:00)')}
                    className={`p-4 rounded-xl border text-left transition-all flex flex-col gap-1 ${newShift.includes('Morning') ? 'bg-slate-800 border-slate-800 text-white shadow-md' : 'bg-white border-slate-200 text-slate-600'}`}
                  >
                    <FiClock className='text-xl mb-1' />
                    <span className='text-sm font-bold'>Morning</span>
                    <span className={`text-[10px] font-medium ${newShift.includes('Morning') ? 'text-slate-300' : 'text-slate-400'}`}>07:00am - 11:00am</span>
                  </button>

                  <div className='relative group'>
                    <button 
                      type="button" disabled
                      className='w-full h-full p-4 rounded-xl border border-slate-200 bg-slate-100 text-left transition-all flex flex-col gap-1 opacity-60 cursor-not-allowed'
                    >
                      <FiClock className='text-xl mb-1 text-slate-400' />
                      <span className='text-sm font-bold text-slate-500'>Afternoon</span>
                      <span className='text-[10px] font-medium text-red-500 font-bold'>Full (Machine Unavail)</span>
                    </button>
                  </div>
                </div>
              </div>

              <button type="submit" disabled={isProcessing || !newDate || !newShift} className='w-full py-4 bg-blue-600 text-white rounded-2xl font-black text-base shadow-lg disabled:bg-blue-300 transition-all flex justify-center mt-4'>
                {isProcessing ? 'Processing...' : 'Submit reschedule request'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ========================================= */}
      {/* CANCEL CONFIRMATION DIALOG (With Rules) */}
      {/* ========================================= */}
      {cancelDialogTarget && (
        <div className='absolute inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-5 animate-in fade-in'>
          <form onSubmit={handleConfirmCancel} className='bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl animate-in zoom-in-95'>
            <div className='w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mb-4 text-red-600 text-2xl'><FiAlertCircle /></div>
            <h3 className='text-lg font-black text-slate-800 mb-2 leading-tight'>Cancel this session?</h3>
            
            {isLateCancel ? (
              <div className='bg-red-50 border border-red-200 p-4 rounded-xl mb-6'>
                <p className='text-xs font-bold text-red-700 leading-relaxed'>
                  You cannot cancel a session within 24 hours of the appointment time through the app. Please call the clinic immediately to reallocate resources.
                </p>
              </div>
            ) : (
              <>
                <div className='mb-4'>
                  <label className='block text-xs font-bold text-slate-500 uppercase mb-2'>Reason for Cancellation <span className="text-red-500">*</span></label>
                  <textarea 
                    required 
                    value={cancelReason} 
                    onChange={e => setCancelReason(e.target.value)} 
                    placeholder="E.g., Medical emergency, transportation issue..."
                    className='w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-red-400 resize-none h-20'
                  />
                </div>
              </>
            )}

            <div className='flex gap-3'>
              <button type="button" onClick={() => {setCancelDialogTarget(null); setCancelReason('');}} disabled={isProcessing} className='flex-1 py-3.5 rounded-xl font-bold text-sm text-slate-600 bg-slate-100 hover:bg-slate-200'>
                {isLateCancel ? 'Close' : 'Go Back'}
              </button>
              {!isLateCancel && (
                <button type="submit" disabled={isProcessing || !cancelReason.trim()} className='flex-1 py-3.5 rounded-xl font-bold text-sm text-white bg-red-600 hover:bg-red-700 flex justify-center items-center disabled:opacity-50'>
                  {isProcessing ? 'Canceling...' : 'Confirm Cancel'}
                </button>
              )}
            </div>
          </form>
        </div>
      )}

      {showSuccess && (
        <div className='absolute inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-5 animate-in fade-in'>
          <div className='bg-white w-full max-w-sm rounded-3xl p-8 shadow-2xl text-center animate-in zoom-in-95'>
            <FiCheckCircle className='text-6xl text-emerald-500 mx-auto mb-4' />
            <h3 className='text-xl font-black text-slate-800'>{showSuccess}</h3>
            <p className='text-sm text-slate-500 mt-2 font-medium'>Awaiting manager approval.</p>
          </div>
        </div>
      )}

    </div>
  );
}