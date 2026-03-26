'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import Link from 'next/link';
import { 
  FiCheckCircle, FiXCircle, FiClock, FiFileText, 
  FiAlertTriangle, FiEye, FiUser, FiMapPin, FiX, FiSearch, FiFilter
} from 'react-icons/fi';

export default function ManagerBookings() {
  const [isLoading, setIsLoading] = useState(true);
  const [bookings, setBookings] = useState<any[]>([]);
  const [managerBranchId, setManagerBranchId] = useState<number | null>(null);
  
  const [activeTab, setActiveTab] = useState<'Pending' | 'Confirmed' | 'Cancelled/Expired'>('Pending');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('All');

  const [selectedBooking, setSelectedBooking] = useState<any>(null);
  const [requestDetails, setRequestDetails] = useState<any>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [docViewerUrl, setDocViewerUrl] = useState<string | null>(null);

  // --- NEW: Machine Assignment States ---
  const [availableMachines, setAvailableMachines] = useState<any[]>([]);
  const [selectedMachineId, setSelectedMachineId] = useState<string>('');

  useEffect(() => {
    fetchBookings();
  }, []);

  const fetchBookings = async () => {
    setIsLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) return;

      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('branch_id')
        .eq('user_email', sessionData.session.user.email)
        .single();
        
      if (userError) throw userError;
      if (!userData?.branch_id) throw new Error("No branch assigned to this manager.");
      
      setManagerBranchId(userData.branch_id);

      const { data: bookingData, error: bookingError } = await supabase
        .from('bookings')
        .select('*')
        .eq('branch_id', userData.branch_id)
        .order('booking_date', { ascending: true });

      if (bookingError) throw bookingError;
      const rawBookings = bookingData || [];

      const patientIds = [...new Set(rawBookings.map(b => b.patient_id).filter(Boolean))];
      let finalBookings = rawBookings;

      if (patientIds.length > 0) {
        const { data: patientsData, error: patientError } = await supabase
          .from('patients')
          .select('*, users(*)')
          .in('patient_id', patientIds);

        if (!patientError && patientsData) {
          finalBookings = rawBookings.map(booking => ({
            ...booking,
            patients: patientsData.find(p => p.patient_id === booking.patient_id) || null
          }));
        }
      }

      setBookings(finalBookings);
    } catch (err: any) {
      alert(`Error loading data: ${err.message}`); 
    } finally {
      setIsLoading(false);
    }
  };

  // --- UPDATED: Fetch request details AND available machines ---
  useEffect(() => {
    if (selectedBooking) {
      // 1. Fetch Request Reasons (Keep existing)
      if (selectedBooking.booking_status?.includes('Cancel') || selectedBooking.booking_status?.includes('Reschedule')) {
        supabase.from('requests').select('*').eq('booking_id', selectedBooking.id).single().then(({ data }) => setRequestDetails(data));
      }

      // 2. FETCH COMPATIBLE & FREE MACHINES
      if (managerBranchId && !selectedBooking.booking_status?.includes('Cancel')) {
        let query = supabase
          .from('machines')
          .select('*')
          .eq('branch_id', managerBranchId)
          .eq('status', 'Active')
          .is('dedicated_patient_id', null); // ONLY show machines not paired with a permanent patient

        if (selectedBooking.patients?.hepatitis_b_status === 'Positive') {
          query = query.eq('is_isolation_machine', true);
        }

        query.then(({ data }) => setAvailableMachines(data || []));
      }
      setSelectedMachineId(selectedBooking.machine_id?.toString() || ''); 
    } else {
      setRequestDetails(null);
      setAvailableMachines([]);
      setSelectedMachineId('');
    }
  }, [selectedBooking, managerBranchId]);

  const handleAction = async (bookingId: number, actionCategory: 'Approve' | 'Reject', patientUserId: string | undefined, type: string, currentStatus: string) => {
    if (!confirm(`Are you sure you want to ${actionCategory.toLowerCase()} this request?`)) return;
    setIsProcessing(true);

    try {
      let finalStatus = '';
      let newDate: string | undefined;
      let newSession: string | undefined;

      // ==============================================
      // 1. DETERMINE STRICT STATUSES
      // ==============================================
      if (actionCategory === 'Approve') {
        if (currentStatus === 'Pending Cancellation') {
          finalStatus = 'Cancelled'; 
          await supabase.from('requests').update({ request_status: 'APPROVED' }).eq('booking_id', bookingId).eq('request_type', 'Cancel').eq('request_status', 'PENDING');
        } else if (currentStatus === 'Pending Reschedule' || currentStatus?.includes('Reschedule')) {
          const { data: reqData } = await supabase.from('requests').select('id, request_new_date, request_new_session').eq('booking_id', bookingId).eq('request_type', 'Reschedule').eq('request_status', 'PENDING').single();
          if (reqData) {
            finalStatus = 'Rescheduled'; 
            newDate = reqData.request_new_date;
            newSession = reqData.request_new_session;
            await supabase.from('requests').update({ request_status: 'APPROVED' }).eq('id', reqData.id);
          } else {
            finalStatus = 'Rescheduled'; 
          }
        } else {
          finalStatus = 'Confirmed'; 
        }
      } else if (actionCategory === 'Reject') {
        if (currentStatus === 'Pending Cancellation') {
          finalStatus = 'Cancellation Rejected'; 
          await supabase.from('requests').update({ request_status: 'REJECTED' }).eq('booking_id', bookingId).eq('request_type', 'Cancel').eq('request_status', 'PENDING');
        } else if (currentStatus === 'Pending Reschedule' || currentStatus?.includes('Reschedule')) {
          finalStatus = 'Reschedule Rejected'; 
          await supabase.from('requests').update({ request_status: 'REJECTED' }).eq('booking_id', bookingId).eq('request_type', 'Reschedule').eq('request_status', 'PENDING');
        } else {
          finalStatus = 'Rejected'; 
        }
      }

      // ==============================================
      // 2. UPDATE THE BOOKINGS TABLE
      // ==============================================
      const updatePayload: any = { booking_status: finalStatus };
      if (newDate && newSession) {
        updatePayload.booking_date = newDate;
        updatePayload.booking_session_time = newSession;
      }

      // CLINICAL SAFETY RULE: Attach the selected machine to the booking if approved
      if (actionCategory === 'Approve' && !currentStatus.includes('Cancel') && selectedMachineId) {
        updatePayload.machine_id = parseInt(selectedMachineId);
      }

      const { error: bookingUpdateError } = await supabase.from('bookings').update(updatePayload).eq('id', bookingId);
      if (bookingUpdateError) throw bookingUpdateError;

      // ==============================================
      // 3. SEND PATIENT NOTIFICATION
      // ==============================================
      if (patientUserId) {
        let msg = '';
        if (actionCategory === 'Approve') {
          if (currentStatus === 'Pending Cancellation') msg = 'Your cancellation request has been approved. The session has been removed from your schedule.';
          else if (currentStatus?.includes('Reschedule')) msg = `Your reschedule request for ${newDate ? new Date(newDate).toLocaleDateString('en-GB') : 'your new date'} has been approved.`;
          else msg = `Your ${type.toLowerCase()} request has been approved by the Branch Manager!`;
        } else {
          if (currentStatus === 'Pending Cancellation') msg = 'Your cancellation request was declined by the clinic. Your session remains active.';
          else if (currentStatus?.includes('Reschedule')) msg = `Your reschedule request was declined. Your original appointment date remains active.`;
          else msg = `Your ${type.toLowerCase()} request was declined due to capacity or clinical reasons.`;
        }
        await supabase.from('notifications').insert({ user_id: patientUserId, title: `Request ${actionCategory === 'Approve' ? 'Approved' : 'Declined'}`, message: msg });
      }

      // ==============================================
      // 4. UPDATE LOCAL REACT STATE
      // ==============================================
      setBookings(prev => prev.map(b => {
        if (b.id === bookingId) {
          return {
            ...b,
            booking_status: finalStatus,
            ...(newDate ? { booking_date: newDate } : {}),
            ...(newSession ? { booking_session_time: newSession } : {}),
            ...(selectedMachineId && actionCategory === 'Approve' ? { machine_id: parseInt(selectedMachineId) } : {})
          };
        }
        return b;
      }));
      setSelectedBooking(null);

    } catch (error: any) {
      alert(`Action failed: ${error.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  if (isLoading) return <div className='p-8 text-center text-slate-500 mt-20'>Loading Booking Pipeline...</div>;

  const pendingRequests = bookings.filter(b => 
    ['Pending Approval', 'Pending Reschedule', 'Pending Cancellation'].includes(b.booking_status)
  );
  
  const confirmedBookings = bookings.filter(b => {
    const isHandled = ['Confirmed', 'Rescheduled', 'Rejected', 'Reschedule Rejected', 'Cancellation Rejected', 'Completed'].includes(b.booking_status);
    if (!isHandled) return false;
    if (b.booking_type === 'Home' && ['Confirmed', 'Completed'].includes(b.booking_status)) return false;
    return true;
  });

  const cancelledBookings = bookings.filter(b => 
    ['Cancelled', 'Expired'].includes(b.booking_status)
  );

  let displayList = activeTab === 'Pending' ? pendingRequests : activeTab === 'Confirmed' ? confirmedBookings : cancelledBookings;

  if (searchTerm) {
    const term = searchTerm.toLowerCase();
    displayList = displayList.filter(b => 
      b.patients?.users?.user_fullname?.toLowerCase().includes(term) ||
      b.patients?.users?.user_ic?.includes(term)
    );
  }

  if (filterType !== 'All') {
    displayList = displayList.filter(b => {
      const isHome = b.booking_type === 'Home';
      const isTravel = b.booking_type === 'Travel';
      const isReschedule = b.booking_status?.includes('Reschedule');
      const isCancel = b.booking_status?.includes('Cancel') || b.booking_status === 'Cancelled' || b.booking_status === 'Cancellation Rejected';
      
      if (filterType === 'Travel Booking') return isTravel && !isReschedule && !isCancel;
      if (filterType === 'Home Reschedule') return isHome && isReschedule;
      if (filterType === 'Travel Reschedule') return isTravel && isReschedule;
      if (filterType === 'Home Cancellation') return isHome && isCancel;
      if (filterType === 'Travel Cancellation') return isTravel && isCancel;
      return true;
    });
  }

  return (
    <main className='p-8 bg-slate-50 min-h-screen font-sans pb-24 flex gap-6'>
      <div className='flex-1 max-w-3xl flex flex-col h-[calc(100vh-100px)]'>
        <div className='mb-6 flex items-center text-sm font-bold text-slate-400 shrink-0'>
          <Link href='/manager' className='hover:text-blue-600 transition-colors'>Dashboard</Link>
          <span className='mx-2'>/</span>
          <span className='text-slate-700'>Bookings Pipeline</span>
        </div>

        <div className='mb-6 shrink-0 flex justify-between items-end'>
          <div>
            <h1 className='text-3xl font-bold text-slate-800 tracking-tight'>Request Pipeline</h1>
            <p className='text-slate-500 mt-1 font-medium'>Review exceptions: Travel, Reschedules, and Cancellations.</p>
          </div>
        </div>

        <div className='bg-white p-3 rounded-2xl shadow-sm border border-slate-200 mb-6 shrink-0'>
          <div className='flex justify-between items-center mb-4'>
            <div className='flex gap-2 bg-slate-100 p-1 rounded-xl w-fit'>
              {(['Pending', 'Confirmed', 'Cancelled/Expired'] as const).map(tab => (
                <button 
                  key={tab}
                  onClick={() => { setActiveTab(tab); setSelectedBooking(null); }}
                  className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === tab ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  {tab === 'Cancelled/Expired' ? 'Cancelled / Expired' : tab}
                  {tab === 'Pending' && pendingRequests.length > 0 && <span className='ml-2 bg-red-500 text-white px-2 py-0.5 rounded-full text-[10px]'>{pendingRequests.length}</span>}
                </button>
              ))}
            </div>

            <div className='flex items-center gap-2'>
              <select 
                value={filterType} 
                onChange={e => setFilterType(e.target.value)}
                className='px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 text-sm font-bold text-slate-600'
              >
                <option value="All">All Request Types</option>
                <option value="Travel Booking">✈️ Travel Booking</option>
                <option value="Home Reschedule">🏠🔄 Home Reschedule</option>
                <option value="Travel Reschedule">✈️🔄 Travel Reschedule</option>
                <option value="Home Cancellation">🏠❌ Home Cancellation</option>
                <option value="Travel Cancellation">✈️❌ Travel Cancellation</option>
              </select>
            </div>
          </div>

          <div className='relative'>
            <FiSearch className='absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg' />
            <input 
              type="text" 
              placeholder="Search patient name or IC number..." 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className='w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 text-sm font-medium transition-colors'
            />
          </div>
        </div>

        <div className='flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-4'>
          {displayList.length === 0 ? (
            <div className='bg-white border border-slate-200 rounded-2xl py-16 text-center shadow-sm'>
              <div className='text-4xl mb-4 opacity-50'>📬</div>
              <h3 className='text-lg font-bold text-slate-700'>No {activeTab.toLowerCase()} requests</h3>
              <p className='text-sm text-slate-400 mt-1'>
                {activeTab === 'Confirmed' 
                  ? 'Approve or Reject a request in the Pending tab to see it here.' 
                  : 'Try clearing your search or filters.'}
              </p>
            </div>
          ) : (
            displayList.map(booking => {
              const isSelected = selectedBooking?.id === booking.id;
              const patientData = booking.patients;
              const bDate = new Date(booking.booking_date);
              
              const isCancel = booking.booking_status?.includes('Cancel') || booking.booking_status === 'Cancelled';
              const isTravel = booking.booking_type === 'Travel';

              let statusColor = 'text-amber-600';
              if (['Confirmed', 'Rescheduled', 'Completed'].includes(booking.booking_status)) statusColor = 'text-emerald-600';
              if (booking.booking_status?.includes('Reject') || booking.booking_status === 'Cancelled' || booking.booking_status === 'Expired') statusColor = 'text-red-600';

              return (
                <div 
                  key={booking.id} 
                  onClick={() => setSelectedBooking(booking)}
                  className={`bg-white rounded-2xl p-5 border cursor-pointer transition-all ${isSelected ? 'border-blue-500 ring-2 ring-blue-100 shadow-md' : 'border-slate-200 hover:border-blue-300 hover:shadow-sm'}`}
                >
                  <div className='flex justify-between items-start mb-3'>
                    <div className='flex items-center gap-3'>
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-black flex-col ${isCancel ? 'bg-red-50 text-red-600' : isTravel ? 'bg-indigo-50 text-indigo-600' : 'bg-amber-50 text-amber-600'}`}>
                        <span className='text-[10px] leading-none uppercase'>{bDate.toLocaleDateString('en-GB', { month: 'short' })}</span>
                        <span className='text-lg leading-none mt-0.5'>{bDate.getDate()}</span>
                      </div>
                      <div>
                        <h4 className='font-black text-slate-800'>{patientData?.users?.user_fullname || 'Unknown Patient'}</h4>
                        <p className='text-xs font-bold text-slate-500 flex items-center gap-1.5 mt-0.5'>
                          <FiClock className='text-blue-500' /> {booking.booking_session_time}
                        </p>
                      </div>
                    </div>
                    
                    <div className='text-right flex flex-col items-end'>
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${isCancel ? 'bg-red-100 text-red-700' : isTravel ? 'bg-indigo-100 text-indigo-700' : 'bg-purple-100 text-purple-700'} mb-1`}>
                        {isCancel ? '❌ Cancel Req' : isTravel ? '✈️ Travel Req' : '🔄 Reschedule Req'}
                      </span>
                      <span className={`text-xs font-black uppercase tracking-wider ${statusColor}`}>
                        {booking.booking_status}
                      </span>
                    </div>

                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className='w-[450px] shrink-0 h-[calc(100vh-100px)] sticky top-8'>
        {selectedBooking ? (
          <div className='bg-white rounded-3xl shadow-xl border border-slate-200 h-full flex flex-col overflow-hidden animate-in slide-in-from-right-8'>
            <div className='p-6 bg-slate-900 text-white shrink-0'>
              <div className='flex justify-between items-start mb-4'>
                <div>
                  <span className='px-2.5 py-1 bg-white/20 rounded-full text-[10px] font-black uppercase tracking-widest mb-2 inline-block'>
                    {selectedBooking.booking_status?.includes('Cancel') || selectedBooking.booking_status === 'Cancelled' ? 'Cancellation Details' : 
                     selectedBooking.booking_type === 'Travel' ? 'Travel Details' : 'Reschedule Details'}
                  </span>
                  <h2 className='text-2xl font-black'>{new Date(selectedBooking.booking_date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</h2>
                  <p className='text-slate-300 font-bold mt-1 text-sm'>{selectedBooking.booking_session_time}</p>
                </div>
                <button onClick={() => setSelectedBooking(null)} className='p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors'><FiX /></button>
              </div>
            </div>

            <div className='flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar bg-slate-50'>
              
              <div className={`p-4 rounded-xl border flex items-center gap-3 font-bold text-sm
                ${['Confirmed', 'Rescheduled', 'Completed'].includes(selectedBooking.booking_status) ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 
                  selectedBooking.booking_status?.includes('Reject') || selectedBooking.booking_status === 'Cancelled' ? 'bg-red-50 text-red-700 border-red-200' : 
                  'bg-amber-50 text-amber-700 border-amber-200'}
              `}>
                {['Confirmed', 'Rescheduled', 'Completed'].includes(selectedBooking.booking_status) ? <FiCheckCircle className='text-xl'/> : 
                 selectedBooking.booking_status?.includes('Reject') || selectedBooking.booking_status === 'Cancelled' ? <FiXCircle className='text-xl'/> : 
                 <FiAlertTriangle className='text-xl'/>}
                Status: {selectedBooking.booking_status}
              </div>

              <div className='bg-white p-4 rounded-2xl border border-slate-100 shadow-sm'>
                <h3 className='text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3'>Patient Identity</h3>
                <p className='text-lg font-black text-slate-800'>{selectedBooking.patients?.users?.user_fullname}</p>
                <div className='text-sm font-medium text-slate-500 mt-2 space-y-1'>
                  <p>IC: {selectedBooking.patients?.users?.user_ic}</p>
                  <p>Contact: {selectedBooking.patients?.users?.user_contact_number}</p>
                </div>
              </div>

              <div className='bg-white p-4 rounded-2xl border border-slate-100 shadow-sm'>
                <h3 className='text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3'>Infection Status</h3>
                <div className='grid grid-cols-3 gap-2'>
                  <div className={`p-2 rounded-lg text-center ${selectedBooking.patients?.hepatitis_b_status === 'Positive' ? 'bg-red-50 text-red-700 font-bold border border-red-200' : 'bg-emerald-50 text-emerald-700 font-bold border border-emerald-200'}`}>
                    <p className='text-[9px] uppercase opacity-70'>Hep B</p>
                    <p className='text-sm'>{selectedBooking.patients?.hepatitis_b_status || 'Unknown'}</p>
                  </div>
                  <div className={`p-2 rounded-lg text-center ${selectedBooking.patients?.hepatitis_c_status === 'Positive' ? 'bg-red-50 text-red-700 font-bold border border-red-200' : 'bg-emerald-50 text-emerald-700 font-bold border border-emerald-200'}`}>
                    <p className='text-[9px] uppercase opacity-70'>Hep C</p>
                    <p className='text-sm'>{selectedBooking.patients?.hepatitis_c_status || 'Unknown'}</p>
                  </div>
                  <div className={`p-2 rounded-lg text-center ${selectedBooking.patients?.hiv_status === 'Positive' ? 'bg-red-50 text-red-700 font-bold border border-red-200' : 'bg-emerald-50 text-emerald-700 font-bold border border-emerald-200'}`}>
                    <p className='text-[9px] uppercase opacity-70'>HIV</p>
                    <p className='text-sm'>{selectedBooking.patients?.hiv_status || 'Unknown'}</p>
                  </div>
                </div>
              </div>

              {selectedBooking.booking_type === 'Travel' && (
                <div className='bg-white p-4 rounded-2xl border border-blue-200 shadow-sm ring-1 ring-blue-50'>
                  <h3 className='text-[10px] font-black text-blue-600 uppercase tracking-widest mb-3 flex items-center gap-1.5'><FiFileText/> Mandatory Document Review</h3>
                  <div className='space-y-3'>
                    <div className='flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-xl'>
                      <div>
                        <p className='text-sm font-bold text-slate-800'>Serology Report</p>
                        {selectedBooking.patients?.serology_report_url ? <p className='text-[10px] font-bold text-emerald-600'>Uploaded</p> : <p className='text-[10px] font-bold text-red-500'>Missing</p>}
                      </div>
                      <button disabled={!selectedBooking.patients?.serology_report_url} onClick={() => setDocViewerUrl(selectedBooking.patients?.serology_report_url)} className='p-2 bg-white border border-slate-200 rounded-lg text-slate-600 hover:text-blue-600 disabled:opacity-50 transition-colors'><FiEye /></button>
                    </div>
                    <div className='flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-xl'>
                      <div>
                        <p className='text-sm font-bold text-slate-800'>Doctor's Referral</p>
                        {selectedBooking.patients?.referral_letter_url ? <p className='text-[10px] font-bold text-emerald-600'>Uploaded</p> : <p className='text-[10px] font-bold text-red-500'>Missing</p>}
                      </div>
                      <button disabled={!selectedBooking.patients?.referral_letter_url} onClick={() => setDocViewerUrl(selectedBooking.patients?.referral_letter_url)} className='p-2 bg-white border border-slate-200 rounded-lg text-slate-600 hover:text-blue-600 disabled:opacity-50 transition-colors'><FiEye /></button>
                    </div>
                  </div>
                </div>
              )}

              {selectedBooking.booking_status?.includes('Cancel') && requestDetails?.request_reason && (
                <div className='bg-red-50 p-4 rounded-2xl border border-red-200 shadow-sm ring-1 ring-red-100 mb-6'>
                  <h3 className='text-[10px] font-black text-red-800 uppercase tracking-widest mb-2 flex items-center gap-1.5'><FiAlertTriangle/> Patient Cancellation Reason</h3>
                  <p className='text-sm font-bold text-red-900 leading-relaxed'>"{requestDetails.request_reason}"</p>
                </div>
              )}
            </div>

            {selectedBooking.booking_status?.includes('Pending') && (
              <div className='p-6 bg-white border-t border-slate-100 shrink-0'>
                
                {/* STRICT CLINICAL RULE: Require Machine Assignment for Approvals */}
                {!selectedBooking.booking_status.includes('Cancel') && (
                  <div className='mb-4 p-3 bg-blue-50 border border-blue-100 rounded-xl'>
                    <label className='block text-xs font-black text-blue-800 uppercase tracking-widest mb-2 flex items-center justify-between'>
                      Assign Machine Slot
                      {selectedBooking.patients?.hepatitis_b_status === 'Positive' && <span className='text-[9px] text-red-600 animate-pulse'>*Hep-B Isolation Required</span>}
                    </label>
                    <select 
  value={selectedMachineId} 
  onChange={e => setSelectedMachineId(e.target.value)}
  className='w-full p-2.5 bg-white border border-blue-200 rounded-lg outline-none focus:border-blue-500 text-sm font-bold text-slate-700'
>
  <option value="">-- Select a FREE compatible machine --</option>
  {availableMachines.length === 0 ? (
    <option disabled>No unpaired machines available</option>
  ) : (
    availableMachines.map(m => (
      <option key={m.id} value={m.id}>
        {m.model} (SN: {m.serial_number}) - [FREE]
      </option>
    ))
  )}
</select>
                  </div>
                )}

                

                <div className='flex gap-3'>
                  <button onClick={() => handleAction(selectedBooking.id, 'Reject', selectedBooking.patients?.users?.user_id, selectedBooking.booking_type, selectedBooking.booking_status)} disabled={isProcessing} className='flex-1 py-3.5 bg-white border-2 border-red-100 text-red-600 font-black rounded-xl hover:bg-red-50 transition-colors disabled:opacity-50'>Reject</button>
                  
                  <button 
                    onClick={() => handleAction(selectedBooking.id, 'Approve', selectedBooking.patients?.users?.user_id, selectedBooking.booking_type, selectedBooking.booking_status)} 
                    disabled={
                      isProcessing || 
                      (selectedBooking.booking_type === 'Travel' && (!selectedBooking.patients?.serology_report_url || !selectedBooking.patients?.referral_letter_url)) ||
                      (!selectedBooking.booking_status.includes('Cancel') && !selectedMachineId) // Must select a machine
                    } 
                    className='flex-1 py-3.5 bg-blue-600 text-white font-black rounded-xl shadow-lg shadow-blue-200 hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:shadow-none'
                  >
                    {isProcessing ? 'Processing...' : 'Approve'}
                  </button>
                </div>
                
                {/* Warning message for disabled approve button */}
                {selectedBooking.booking_type === 'Travel' && (!selectedBooking.patients?.serology_report_url || !selectedBooking.patients?.referral_letter_url) && (
                  <p className='text-[10px] font-bold text-red-500 mt-2 text-center'>Missing clinical documents.</p>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className='h-full border-2 border-dashed border-slate-200 rounded-3xl flex flex-col items-center justify-center text-slate-400 bg-white/50'>
            <FiFileText className='text-5xl mb-4 opacity-50' />
            <p className='font-bold'>Select a request to review</p>
          </div>
        )}
      </div>

      {docViewerUrl && (
        <div className='fixed inset-0 z-[100] bg-slate-900/95 flex flex-col animate-in fade-in'>
          <div className='flex justify-between items-center p-5 bg-black'>
            <h3 className='text-white font-black text-lg'>Document Verification Viewer</h3>
            <button onClick={() => setDocViewerUrl(null)} className='p-2 bg-white/10 rounded-full text-white hover:bg-white/20'><FiX className='text-xl' /></button>
          </div>
          <div className='flex-1 w-full flex items-center justify-center bg-slate-800 p-8'>
            <iframe src={docViewerUrl} className='w-full h-full max-w-5xl bg-white rounded-xl shadow-2xl' title="Document Viewer" />
          </div>
        </div>
      )}
    </main>
  );
}