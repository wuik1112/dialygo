'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useRouter } from 'next/navigation';
import PatientBottomNav from '../../components/PatientBottomNav';

import { 
  FiMapPin, FiCalendar, FiClock, FiChevronLeft, FiChevronRight,
  FiAlertCircle, FiCheckCircle, FiMoreVertical, FiX
} from 'react-icons/fi';

export default function PatientHome() {
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'Home' | 'Travel'>('Home');
  const [patientData, setPatientData] = useState<any>(null);
  const [bookings, setBookings] = useState<any[]>([]);
  
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  
  const [cancelDialogTarget, setCancelDialogTarget] = useState<any>(null);
  const [detailViewTarget, setDetailViewTarget] = useState<any>(null);
  const [rescheduleTarget, setRescheduleTarget] = useState<any>(null);
  
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
          .eq('patient_id', patient.patient_id);

        setBookings(bookingData || []);
      } catch (error) {
        console.error("Error loading patient dashboard:", error);
      } finally {
        setIsLoading(false);
      }
    }
    loadDashboard();
  }, [router]);

  // --- FILTERING & ELDERLY-FRIENDLY SORTING LOGIC ---
  const activeBookings = bookings.filter(b => b.booking_type === activeTab);
  
  const monthBookings = activeBookings.filter(b => {
    const bDate = new Date(b.booking_date);
    return bDate.getMonth() === currentMonth.getMonth() && bDate.getFullYear() === currentMonth.getFullYear();
  });

  let displayBookings = selectedDate 
    ? monthBookings.filter(b => new Date(b.booking_date).toDateString() === selectedDate.toDateString())
    : monthBookings;

  const nowTime = today.getTime();
  displayBookings = [...displayBookings].sort((a, b) => {
    const timeA = new Date(a.booking_date).getTime();
    const timeB = new Date(b.booking_date).getTime();
    const aIsUpcoming = timeA >= nowTime;
    const bIsUpcoming = timeB >= nowTime;

    if (aIsUpcoming && !bIsUpcoming) return -1; 
    if (!aIsUpcoming && bIsUpcoming) return 1;  
    if (aIsUpcoming && bIsUpcoming) return timeA - timeB; 
    return timeB - timeA; 
  });

  let nextSessionFound = false;

  const daysInMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate();
  const firstDayOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).getDay();
  
  const prevMonth = () => { setSelectedDate(null); setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1)); };
  const nextMonth = () => { setSelectedDate(null); setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1)); };

  const getStatusStyle = (status: string) => {
    if (status === 'Cancelled') return { bg: 'bg-slate-200', text: 'text-slate-500', border: 'border-slate-300' };
    if (status?.includes('Reschedule')) return { bg: 'bg-purple-100', text: 'text-purple-700', border: 'border-purple-400' };
    if (status === 'Completed') return { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-400' };
    if (status === 'Confirmed') return { bg: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-400' };
    return { bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-400' }; 
  };

  const handleConfirmCancel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancelDialogTarget || !cancelReason.trim()) return;
    setIsProcessing(true);
    try {
      await supabase.from('requests').insert([{ request_type: 'Cancel', booking_id: cancelDialogTarget.id, request_reason: cancelReason, request_status: 'APPROVED' }]);
      const { error } = await supabase.from('bookings').update({ booking_status: 'Cancelled' }).eq('id', cancelDialogTarget.id);
      if (error) throw error;
      setBookings(prev => prev.map(b => b.id === cancelDialogTarget.id ? { ...b, booking_status: 'Cancelled' } : b));
      setCancelDialogTarget(null); setDetailViewTarget(null); setCancelReason('');
    } catch (error) { alert("Failed to cancel booking."); } finally { setIsProcessing(false); }
  };

  const handleConfirmReschedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rescheduleTarget || !newDate || !newShift) return;
    setIsProcessing(true);
    try {
      const { error: reqError } = await supabase.from('requests').insert([{ request_type: 'Reschedule', request_new_date: newDate, request_new_session: newShift, booking_id: rescheduleTarget.id, request_status: 'PENDING' }]);
      if (reqError) throw reqError;
      const { error: bookError } = await supabase.from('bookings').update({ booking_status: 'Pending Reschedule' }).eq('id', rescheduleTarget.id);
      if (bookError) throw bookError;
      setBookings(prev => prev.map(b => b.id === rescheduleTarget.id ? { ...b, booking_status: 'Pending Reschedule' } : b));
      setShowSuccess('Reschedule request submitted successfully!');
      setTimeout(() => { setShowSuccess(''); setRescheduleTarget(null); setDetailViewTarget(null); setNewDate(''); setNewShift(''); }, 2000);
    } catch (error) { alert("Failed to submit reschedule request."); } finally { setIsProcessing(false); }
  };

  let isLateCancel = false;
  if (cancelDialogTarget) {
    const targetDate = new Date(cancelDialogTarget.booking_date);
    isLateCancel = (targetDate.getTime() - new Date().getTime()) < (24 * 60 * 60 * 1000); 
  }

  let minRescheduleDate = '', maxRescheduleDate = '';
  if (rescheduleTarget) {
    const origDate = new Date(rescheduleTarget.booking_date);
    const minD = new Date(origDate); minD.setDate(origDate.getDate() - 1); 
    const maxD = new Date(origDate); maxD.setDate(origDate.getDate() + 1); 
    minRescheduleDate = minD.toISOString().split('T')[0];
    maxRescheduleDate = maxD.toISOString().split('T')[0];
  }

  if (isLoading) {
    return (
      <div className='max-w-md mx-auto bg-slate-50 h-[100dvh] relative shadow-2xl font-sans overflow-hidden flex flex-col'>
        <div className='bg-white px-5 pt-12 pb-4 shadow-sm z-10 shrink-0'><h1 className='text-center text-xl font-black text-slate-800 tracking-tight mb-4'>Loading...</h1></div>
        <div className='flex-1 flex items-center justify-center text-blue-600 font-bold'><span className='animate-pulse'>Fetching clinical records...</span></div>
        <PatientBottomNav />
      </div>
    );
  }

  // --- DYNAMIC TIMELINE GENERATOR ---
  const generateTimelineSteps = (status: string) => {
    if (status === 'Cancelled') {
      return [
        { title: 'Request Submitted', desc: 'Booking received by system', state: 'completed' },
        { title: 'Booking Cancelled', desc: 'This session has been voided', state: 'error' }
      ];
    }
    if (status?.includes('Reschedule')) {
      return [
        { title: 'Reschedule Requested', desc: 'New date submitted to system', state: 'completed' },
        { title: 'Manager Review', desc: 'Checking machine availability', state: 'active' },
        { title: 'Confirmed', desc: 'New schedule locked in', state: 'pending' }
      ];
    }
    if (status === 'Pending Approval' || status === 'Pending') {
      return [
        { title: 'Request Submitted', desc: 'Booking received by system', state: 'completed' },
        { title: 'Manager Review', desc: 'Verifying clinical documents and slots', state: 'active' },
        { title: 'Confirmed', desc: 'Schedule locked in', state: 'pending' }
      ];
    }
    // Confirmed or Completed
    return [
      { title: 'Request Submitted', desc: 'Booking received by system', state: 'completed' },
      { title: 'Manager Review', desc: 'Documents and slots verified', state: 'completed' },
      { title: 'Confirmed', desc: 'Ready for treatment', state: 'completed' }
    ];
  };

  const BookingCard = ({ booking }: { booking: any }) => {
    const bDate = new Date(booking.booking_date);
    const isPast = bDate < today;
    const isCancelled = booking.booking_status === 'Cancelled';
    const isReschedule = booking.booking_status?.includes('Reschedule');
    const isPending = booking.booking_status?.includes('Pending');
    const style = getStatusStyle(booking.booking_status);
    const displayDay = bDate.toLocaleDateString('en-GB', { weekday: 'short' });

    let isNextSession = false;
    if (!isPast && !isCancelled && !nextSessionFound) {
      isNextSession = true;
      nextSessionFound = true; 
    }

    // NEW LOGIC: Only show detail button for Travel, Cancelled, Rescheduled, or Pending requests
    const isTravel = activeTab === 'Travel';
    const showDetailButton = isTravel || isCancelled || isReschedule || isPending;

    return (
      <div className={`bg-white rounded-2xl p-5 border shadow-sm relative overflow-hidden transition-all ${isNextSession ? 'border-blue-400 shadow-md ring-2 ring-blue-100' : isPast || isCancelled ? 'border-slate-100 opacity-75' : 'border-slate-200'}`}>
        {isNextSession && (
          <div className='bg-blue-600 text-white text-[10px] font-black uppercase tracking-widest px-4 py-1.5 absolute top-0 left-0 w-full text-center shadow-sm'>
            Next Session
          </div>
        )}
        <div className={`flex justify-between items-start mb-3 ${isNextSession ? 'mt-4' : ''}`}>
          <div className='flex items-center gap-2'>
            <div className='text-center'>
              <span className='block text-xs font-black text-slate-400 uppercase'>{displayDay}</span>
              <span className={`block text-2xl font-black ${isPast || isCancelled ? 'text-slate-500' : 'text-slate-800'}`}>{bDate.getDate()}</span>
            </div>
            {!isNextSession && (
              <span className='text-xs font-bold text-slate-500 ml-2'>{bDate.toLocaleDateString('en-GB', { month: 'short', year: 'numeric'})}</span>
            )}
          </div>
          <div className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-1 ${style.bg} ${style.text}`}>
            {booking.booking_status}
          </div>
        </div>

        <div className='mb-4'>
          <p className={`text-base font-black flex items-center gap-1.5 mb-1 ${isNextSession ? 'text-blue-700' : 'text-slate-600'}`}>
            <FiClock className="shrink-0" /> {booking.booking_session_time}
          </p>
          <p className='text-sm font-bold text-slate-500 flex items-center gap-1.5'>
            <FiMapPin className='shrink-0'/> {booking.branches?.branch_name}
          </p>
        </div>

        <div className='flex gap-2 border-t border-slate-100 pt-3'>
          {!isPast && !isCancelled && !isReschedule && !isPending && (
            <>
              <button onClick={() => setRescheduleTarget(booking)} className='flex-1 py-3 rounded-xl text-xs font-bold border border-blue-200 text-blue-600 hover:bg-blue-50'>Reschedule</button>
              <button onClick={() => setCancelDialogTarget(booking)} className='flex-1 py-3 rounded-xl text-xs font-bold border border-slate-200 text-slate-500 hover:text-red-600 hover:bg-red-50'>Cancel</button>
            </>
          )}
          
          {showDetailButton && (
            <button onClick={() => setDetailViewTarget(booking)} className={`flex-1 py-3 rounded-xl text-xs font-bold shadow-md ${isPast || isCancelled ? 'bg-slate-100 text-slate-600 shadow-none' : 'bg-blue-600 text-white'}`}>
              {isTravel ? 'Track Status' : 'View Detail'}
            </button>
          )}
        </div>
      </div>
    );
  };

  // Determine if the timeline should be shown for the selected detail target
  const showTimeline = detailViewTarget?.booking_type === 'Travel' || 
                       detailViewTarget?.booking_status === 'Cancelled' || 
                       detailViewTarget?.booking_status?.includes('Reschedule') ||
                       detailViewTarget?.booking_status?.includes('Pending');

  return (
    <div className='max-w-md mx-auto bg-slate-50 h-[100dvh] relative shadow-2xl font-sans overflow-hidden flex flex-col'>
      
      {!detailViewTarget && !rescheduleTarget && (
        <>
          <div className='bg-white px-5 pt-12 pb-4 shadow-sm z-10 shrink-0'>
            <h1 className='text-center text-xl font-black text-slate-800 tracking-tight mb-4 capitalize'>My Schedule</h1>
            
            <div className='flex bg-slate-100 p-1 rounded-xl mb-4'>
              <button onClick={() => {setActiveTab('Home'); setSelectedDate(null);}} className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${activeTab === 'Home' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}>Home Centre</button>
              <button onClick={() => {setActiveTab('Travel'); setSelectedDate(null);}} className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${activeTab === 'Travel' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}>Travel</button>
            </div>

            {/* --- CALENDAR COMPONENT --- */}
            <div className='bg-white border border-slate-100 rounded-2xl p-4 shadow-sm mb-2'>
              <div className='flex justify-between items-center mb-4'>
                <button onClick={prevMonth} className='p-2 hover:bg-slate-100 rounded-full text-slate-600'><FiChevronLeft className='text-xl' /></button>
                <h2 className='text-sm font-black text-slate-800 uppercase tracking-widest'>
                  {currentMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}
                </h2>
                <button onClick={nextMonth} className='p-2 hover:bg-slate-100 rounded-full text-slate-600'><FiChevronRight className='text-xl' /></button>
              </div>

              <div className='grid grid-cols-7 gap-1 mb-2'>
                {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
                  <div key={d} className='text-center text-[10px] font-black text-slate-400'>{d}</div>
                ))}
              </div>

              <div className='grid grid-cols-7 gap-y-2 gap-x-1'>
                {Array.from({ length: firstDayOfMonth }).map((_, i) => <div key={`empty-${i}`} />)}
                
                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const day = i + 1;
                  const dateObj = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
                  const isToday = dateObj.toDateString() === today.toDateString();
                  const isSelected = selectedDate?.toDateString() === dateObj.toDateString();
                  
                  const dayBookings = monthBookings.filter(b => new Date(b.booking_date).toDateString() === dateObj.toDateString());
                  
                  let dayStyle = 'text-slate-700 hover:bg-slate-50'; 
                  let borderStyle = isToday ? 'border-2 border-blue-500' : 'border border-transparent';
                  
                  if (dayBookings.length > 0) {
                    const primaryBooking = dayBookings[0];
                    const statusColors = getStatusStyle(primaryBooking.booking_status);
                    dayStyle = `${statusColors.bg} ${statusColors.text} font-black`;
                    borderStyle = isSelected ? `border-2 border-slate-800 shadow-md scale-110` : `border border-transparent`;
                  } else if (isSelected) {
                    dayStyle = 'bg-slate-800 text-white font-black';
                    borderStyle = 'shadow-md scale-110';
                  }

                  return (
                    <button 
                      key={day}
                      onClick={() => setSelectedDate(isSelected ? null : dateObj)}
                      className={`h-9 w-9 mx-auto rounded-full flex items-center justify-center text-xs transition-all duration-200 ${dayStyle} ${borderStyle}`}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className='flex flex-wrap justify-center gap-x-4 gap-y-2 mt-3 px-2'>
              <div className='flex items-center gap-1.5'><div className='w-2.5 h-2.5 rounded-full bg-emerald-400'></div><span className='text-[9px] font-bold text-slate-500 uppercase'>Confirmed</span></div>
              <div className='flex items-center gap-1.5'><div className='w-2.5 h-2.5 rounded-full bg-purple-400'></div><span className='text-[9px] font-bold text-slate-500 uppercase'>Rescheduled</span></div>
              <div className='flex items-center gap-1.5'><div className='w-2.5 h-2.5 rounded-full bg-slate-300'></div><span className='text-[9px] font-bold text-slate-500 uppercase'>Cancelled</span></div>
              <div className='flex items-center gap-1.5'><div className='w-2.5 h-2.5 rounded-full bg-amber-400'></div><span className='text-[9px] font-bold text-slate-500 uppercase'>Pending</span></div>
            </div>
          </div>

          <div className='flex-1 overflow-y-auto p-5 pb-24 space-y-4 custom-scrollbar bg-slate-50'>
            <div className='flex justify-between items-end mb-2'>
              <h2 className='text-xs font-black text-slate-400 uppercase tracking-widest pl-1'>
                {selectedDate ? `Sessions on ${selectedDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short'})}` : `Upcoming & Past Sessions`}
              </h2>
              {selectedDate && <button onClick={() => setSelectedDate(null)} className='text-[10px] font-bold text-blue-600 hover:underline'>Show All</button>}
            </div>

            <div className='space-y-4'>
              {displayBookings.length === 0 ? (
                <div className='text-center py-10 opacity-50 bg-white rounded-2xl border border-slate-100'>
                  <FiCalendar className='text-4xl mx-auto mb-2 text-slate-400' />
                  <p className='text-sm font-bold text-slate-500'>No {activeTab.toLowerCase()} sessions {selectedDate ? 'on this date' : 'this month'}.</p>
                </div>
              ) : (
                displayBookings.map(b => <BookingCard key={b.id} booking={b} />)
              )}
            </div>
          </div>
          <PatientBottomNav />
        </>
      )}

      {/* ========================================= */}
      {/* DETAIL & STATUS TRACKING VIEW */}
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
              <div className={`inline-block px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest mb-4 ${getStatusStyle(detailViewTarget.booking_status).bg} ${getStatusStyle(detailViewTarget.booking_status).text}`}>
                 {detailViewTarget.booking_status}
              </div>
              <p className='text-xs font-bold text-slate-400 uppercase mb-1'>Location Details</p>
              <h2 className='text-lg font-black text-slate-800 leading-tight mb-2'>{detailViewTarget.branches?.branch_name}</h2>
              <p className='text-sm text-slate-500 mb-4'>{detailViewTarget.branches?.branch_address}</p>
              <p className='text-sm font-black text-slate-700 flex items-center gap-2'><FiClock className="text-blue-500"/> {detailViewTarget.booking_session_time}</p>
            </div>

            {/* --- SMART CONDITIONAL STATUS TRACKER TIMELINE --- */}
            {showTimeline && (
              <div className='bg-white rounded-2xl p-5 shadow-sm border border-slate-100'>
                <h3 className='text-xs font-black text-slate-400 uppercase tracking-widest mb-5'>Request Status</h3>
                
                <div className='relative ml-2'>
                  <div className='absolute left-[11px] top-2 bottom-6 w-0.5 bg-slate-100'></div>

                  <div className='space-y-6'>
                    {generateTimelineSteps(detailViewTarget.booking_status).map((step, idx) => (
                      <div key={idx} className='relative flex gap-4 items-start'>
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 relative z-10 border-2 ${
                          step.state === 'completed' ? 'bg-emerald-500 border-emerald-500 text-white' : 
                          step.state === 'active' ? 'bg-amber-100 border-amber-500 text-amber-600' :
                          step.state === 'error' ? 'bg-red-500 border-red-500 text-white' :
                          'bg-white border-slate-200 text-slate-300'
                        }`}>
                          {step.state === 'completed' && <FiCheckCircle className='text-xs' />}
                          {step.state === 'active' && <FiMoreVertical className='text-xs animate-pulse' />}
                          {step.state === 'error' && <FiX className='text-xs' />}
                        </div>
                        <div className='pb-1'>
                          <h4 className={`text-sm font-black ${step.state === 'active' ? 'text-amber-700' : step.state === 'error' ? 'text-red-700' : 'text-slate-800'}`}>
                            {step.title}
                          </h4>
                          <p className='text-xs font-bold text-slate-500 mt-0.5 leading-snug'>{step.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ACTION BUTTONS (Only if active/pending) */}
            {new Date(detailViewTarget.booking_date) >= today && detailViewTarget.booking_status !== 'Cancelled' && (
              <div className='flex gap-3 pt-2'>
                <button onClick={() => setRescheduleTarget(detailViewTarget)} className='flex-1 py-3.5 rounded-xl font-bold text-sm border-2 border-slate-200 text-slate-600 bg-white hover:bg-slate-50'>Reschedule</button>
                <button onClick={() => setCancelDialogTarget(detailViewTarget)} className='flex-1 py-3.5 rounded-xl font-bold text-sm border-2 border-red-100 text-red-600 bg-red-50 hover:bg-red-100'>Cancel</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================= */}
      {/* RESCHEDULE VIEW */}
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
                <p className='flex items-center justify-between'><span className='text-slate-500 font-bold'>Original date:</span><span className='text-slate-800 font-black'>{new Date(rescheduleTarget.booking_date).toLocaleDateString('en-GB')}</span></p>
                <p className='flex items-center justify-between'><span className='text-slate-500 font-bold'>Original shift:</span><span className='text-slate-800 font-black'>{rescheduleTarget.booking_session_time.split(' (')[0]}</span></p>
              </div>
            </div>

            <form onSubmit={handleConfirmReschedule} className='space-y-6'>
              <div className='p-4 bg-amber-50 border border-amber-100 rounded-2xl'>
                <label className='block text-xs font-black text-amber-800 uppercase tracking-widest mb-2'>Select New Date</label>
                <input type="date" required min={minRescheduleDate} max={maxRescheduleDate} value={newDate} onChange={e => setNewDate(e.target.value)} className='w-full p-3.5 bg-white border border-amber-200 rounded-xl outline-none focus:border-amber-500 font-bold text-slate-800 text-sm' />
                <p className='text-[10px] font-bold text-amber-600 mt-2 opacity-80'>*Clinical Safety Rule: Rescheduling is strictly limited to 1 day before or after your original slot to prevent dangerous fluid accumulation.</p>
              </div>

              <div>
                <label className='block text-xs font-black text-slate-500 uppercase tracking-widest mb-3 flex justify-between'>
                  <span>Select Shift</span>{newDate && <span className='text-blue-500 text-[10px] animate-pulse'>Checking availability...</span>}
                </label>
                <div className='grid grid-cols-2 gap-3'>
                  <button type="button" onClick={() => setNewShift('Morning (08:00 - 12:00)')} className={`p-4 rounded-xl border text-left transition-all flex flex-col gap-1 ${newShift.includes('Morning') ? 'bg-slate-800 border-slate-800 text-white shadow-md' : 'bg-white border-slate-200 text-slate-600'}`}>
                    <FiClock className='text-xl mb-1' />
                    <span className='text-sm font-black'>Morning</span>
                    <span className={`text-[10px] font-bold ${newShift.includes('Morning') ? 'text-slate-300' : 'text-slate-400'}`}>08:00am - 12:00pm</span>
                  </button>
                  <button type="button" onClick={() => setNewShift('Afternoon (12:00 - 16:00)')} className={`p-4 rounded-xl border text-left transition-all flex flex-col gap-1 ${newShift.includes('Afternoon') ? 'bg-slate-800 border-slate-800 text-white shadow-md' : 'bg-white border-slate-200 text-slate-600'}`}>
                    <FiClock className='text-xl mb-1' />
                    <span className='text-sm font-black'>Afternoon</span>
                    <span className={`text-[10px] font-bold ${newShift.includes('Afternoon') ? 'text-slate-300' : 'text-slate-400'}`}>12:00pm - 04:00pm</span>
                  </button>
                </div>
              </div>
              <button type="submit" disabled={isProcessing || !newDate || !newShift} className='w-full py-4 bg-blue-600 text-white rounded-2xl font-black text-base shadow-lg disabled:opacity-50 transition-all flex justify-center mt-4'>
                {isProcessing ? 'Processing...' : 'Submit reschedule request'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ========================================= */}
      {/* CANCEL CONFIRMATION DIALOG */}
      {/* ========================================= */}
      {cancelDialogTarget && (
        <div className='absolute inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-5 animate-in fade-in'>
          <form onSubmit={handleConfirmCancel} className='bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl animate-in zoom-in-95'>
            <div className='w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mb-4 text-red-600 text-2xl'><FiAlertCircle /></div>
            <h3 className='text-lg font-black text-slate-800 mb-2 leading-tight'>Cancel this session?</h3>
            
            {isLateCancel ? (
              <div className='bg-red-50 border border-red-200 p-4 rounded-xl mb-6'>
                <p className='text-xs font-bold text-red-700 leading-relaxed'>You cannot cancel a session within 24 hours of the appointment time through the app. Please call the clinic immediately to reallocate resources.</p>
              </div>
            ) : (
              <div className='mb-4'>
                <label className='block text-xs font-black text-slate-500 uppercase tracking-widest mb-2'>Reason for Cancellation <span className="text-red-500">*</span></label>
                <textarea required value={cancelReason} onChange={e => setCancelReason(e.target.value)} placeholder="E.g., Medical emergency, transportation issue..." className='w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-red-400 resize-none h-20' />
              </div>
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
            <p className='text-sm text-slate-500 mt-2 font-medium'>System updated successfully.</p>
          </div>
        </div>
      )}

    </div>
  );
}