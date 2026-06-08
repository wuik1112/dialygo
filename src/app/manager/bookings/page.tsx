'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import Link from 'next/link';
import { 
  FiCheckCircle, FiXCircle, FiClock, FiFileText, 
  FiAlertTriangle, FiEye, FiMapPin, FiX, FiSearch, 
  FiMessageSquare, FiFilter, FiHome, FiDroplet, 
  FiInbox, FiArrowUp, FiArrowDown, FiRefreshCw, FiActivity
} from 'react-icons/fi';
import { validateManagerApproval } from '@/utils/validationHelpers';

export default function ManagerBookings() {
  const [isLoading, setIsLoading] = useState(true);
  const [bookings, setBookings] = useState<any[]>([]);
  const [managerBranchId, setManagerBranchId] = useState<number | null>(null);
  
  // --- FILTERS & SORTING STATES ---
  const [activeTab, setActiveTab] = useState<'Pending' | 'Confirmed' | 'Cancelled/Expired'>('Pending');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('All');
  const [timeFilter, setTimeFilter] = useState('All'); 
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // --- REVIEW DOSSIER STATES ---
  const [selectedBooking, setSelectedBooking] = useState<any>(null);
  const [requestDetails, setRequestDetails] = useState<any>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [docViewerUrl, setDocViewerUrl] = useState<string | null>(null);

  // --- MACHINE ASSIGNMENT & REJECTION STATES ---
  const [availableMachines, setAvailableMachines] = useState<any[]>([]);
  const [selectedMachineId, setSelectedMachineId] = useState<string>('');
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const approvalValidation = selectedBooking 
  ? validateManagerApproval(
      selectedBooking.booking_type, 
      selectedBooking.patients?.serology_report_url, 
      selectedBooking.patients?.referral_letter_url, 
      selectedBooking.booking_status.includes('Cancel'), 
      selectedMachineId
    ) 
  : { isValid: false };
  
  useEffect(() => {
    fetchBookings();
  }, []);

  const fetchBookings = async () => {
    setIsLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) return;

      const { data: userData, error: userError } = await supabase.from('users').select('branch_id').eq('user_email', sessionData.session.user.email).single();
      if (userError) throw userError;
      setManagerBranchId(userData.branch_id);

      const { data: bookingData, error: bookingError } = await supabase.from('bookings').select('*, branches(branch_name)').eq('branch_id', userData.branch_id);
      if (bookingError) throw bookingError;
      
      const rawBookings = bookingData || [];
      const patientIds = [...new Set(rawBookings.map(b => b.patient_id).filter(Boolean))];
      
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      let finalBookings = rawBookings;

      if (patientIds.length > 0) {
        const { data: patientsData } = await supabase.from('patients').select('*, users(*), branches(branch_name)').in('patient_id', patientIds);
        
        if (patientsData) {
          finalBookings = rawBookings.map(booking => {
            let currentStatus = booking.booking_status;
            const bDate = new Date(booking.booking_date);
            bDate.setHours(0, 0, 0, 0);

            if (bDate < today && currentStatus.includes('Pending')) {
              currentStatus = 'Expired';
            }

            return {
              ...booking,
              booking_status: currentStatus, 
              patients: patientsData.find(p => p.patient_id === booking.patient_id) || null
            };
          });
        }
      } else {
        finalBookings = rawBookings.map(booking => {
            let currentStatus = booking.booking_status;
            const bDate = new Date(booking.booking_date);
            bDate.setHours(0, 0, 0, 0);
            if (bDate < today && currentStatus.includes('Pending')) currentStatus = 'Expired';
            return { ...booking, booking_status: currentStatus };
        });
      }
      
      setBookings(finalBookings);
    } catch (err: any) {
      alert(`Error loading data: ${err.message}`); 
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    async function loadDetails() {
      if (!selectedBooking) {
        setRequestDetails(null);
        setAvailableMachines([]);
        setSelectedMachineId('');
        return;
      }

      let reqData = null;
      if (selectedBooking.booking_status?.includes('Cancel') || selectedBooking.booking_status?.includes('Reschedule')) {
        const { data, error } = await supabase
          .from('requests')
          .select('*')
          .eq('booking_id', selectedBooking.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(); 
          
        if (error) console.error("Error fetching request details:", error);
        
        reqData = data;
        setRequestDetails(data);
      } else {
        setRequestDetails(null);
      }

      if (managerBranchId && !selectedBooking.booking_status?.includes('Cancel')) {
        const targetDate = reqData?.request_new_date || selectedBooking.booking_date;
        const targetSession = reqData?.request_new_session || selectedBooking.booking_session_time;
        
        const { data: bookedSlots } = await supabase
          .from('bookings')
          .select('machine_id')
          .eq('branch_id', managerBranchId)
          .eq('booking_date', targetDate)
          .eq('booking_session_time', targetSession)
          .in('booking_status', ['Confirmed', 'Rescheduled', 'Completed', 'In Progress']);
        
        const bookedMachineIds = bookedSlots?.map(b => b.machine_id).filter(Boolean) || [];

        const { data: machines } = await supabase
          .from('machines')
          .select('*')
          .eq('branch_id', managerBranchId)
          .eq('status', 'Active')
          .is('dedicated_patient_id', null);

        const freeMachines = machines?.filter(m => !bookedMachineIds.includes(m.id)) || [];
        setAvailableMachines(freeMachines);
      }
      setSelectedMachineId(selectedBooking.machine_id?.toString() || ''); 
    }
    loadDetails();
  }, [selectedBooking, managerBranchId]);

  const handleAction = async (actionCategory: 'Approve' | 'Reject') => {
    if (actionCategory === 'Reject' && !rejectReason.trim()) {
      alert("Please provide a reason for rejection.");
      return;
    }
    if (actionCategory === 'Approve' && !confirm(`Are you sure you want to approve this request?`)) return;

    setIsProcessing(true);
    const bookingId = selectedBooking.id;
    const patientUserId = selectedBooking.patients?.users?.user_id;
    const currentStatus = selectedBooking.booking_status;

    try {
      let finalStatus = '';
      let newDate: string | undefined;
      let newSession: string | undefined;

      const { data: reqData } = await supabase.from('requests')
        .select('*')
        .eq('booking_id', bookingId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (actionCategory === 'Approve') {
        if (currentStatus === 'Pending Cancellation') {
          finalStatus = 'Cancelled'; 
        } else if (currentStatus === 'Pending Reschedule' || currentStatus?.includes('Reschedule')) {
          finalStatus = 'Rescheduled'; 
          if (reqData) {
            newDate = reqData.request_new_date;
            newSession = reqData.request_new_session;
          }
        } else {
          finalStatus = 'Confirmed'; 
        }

        if (reqData) {
          await supabase.from('requests')
            .update({ request_status: 'APPROVED', manager_id: managerBranchId })
            .eq('request_id', reqData.request_id);
        }

      } else if (actionCategory === 'Reject') {
        if (currentStatus === 'Pending Cancellation') {
          finalStatus = 'Cancellation Rejected'; 
        } else if (currentStatus === 'Pending Reschedule' || currentStatus?.includes('Reschedule')) {
          finalStatus = 'Reschedule Rejected'; 
        } else {
          finalStatus = 'Rejected'; 
        }

        if (reqData) {
          const { error: reqError } = await supabase.from('requests')
            .update({ 
              request_status: 'REJECTED', 
              manager_id: managerBranchId, 
              manager_comment: rejectReason 
            })
            .eq('request_id', reqData.request_id);
            
          if (reqError) throw reqError;
        }
      }

      const updatePayload: any = { booking_status: finalStatus };
      if (newDate && newSession) {
        updatePayload.booking_date = newDate;
        updatePayload.booking_session_time = newSession;
      }
      if (actionCategory === 'Approve' && !currentStatus.includes('Cancel') && selectedMachineId) {
        updatePayload.machine_id = parseInt(selectedMachineId);
      }
      
      const { error: bookingUpdateError } = await supabase.from('bookings').update(updatePayload).eq('id', bookingId);
      if (bookingUpdateError) throw bookingUpdateError;

      // --- ROBUST NOTIFICATION SYSTEM ---
      if (patientUserId) {
        let msg = '';
        if (actionCategory === 'Approve') {
          if (currentStatus === 'Pending Cancellation') {
            msg = 'Your cancellation request has been approved. The session has been successfully removed from your active schedule.';
          } else if (currentStatus?.includes('Reschedule')) {
            const bDate = newDate ? new Date(newDate) : new Date(selectedBooking.booking_date);
            const shiftTime = newSession || selectedBooking.booking_session_time;
            msg = `Your reschedule request has been approved. Your session is now confirmed for ${bDate.toLocaleDateString('en-GB')} at ${shiftTime}.`;
          } else {
            const bDate = newDate ? new Date(newDate) : new Date(selectedBooking.booking_date);
            const shiftTime = newSession || selectedBooking.booking_session_time;
            const branchName = selectedBooking.branches?.branch_name || 'the clinic';
            msg = `[CONFIRMED] Your ${selectedBooking.booking_type} request for ${bDate.toLocaleDateString('en-GB')} is now confirmed.\nLocation: ${branchName}\nShift: ${shiftTime}`;
          }
        } else {
          if (currentStatus === 'Pending Cancellation') {
            msg = `Your cancellation request was declined. Reason: ${rejectReason}. Your session remains active in your schedule.`;
          } else if (currentStatus?.includes('Reschedule')) {
            msg = `Your reschedule request was declined. Reason: ${rejectReason}. Your original appointment date remains active.`;
          } else {
            msg = `Your booking request was declined. Reason: ${rejectReason}. Please contact the branch directly for further assistance.`;
          }
        }
        
        // Push Notification to the Database explicitly setting 'System' type
        await supabase.from('notifications').insert([{ 
          user_id: patientUserId, 
          title: `Request ${actionCategory === 'Approve' ? 'Approved' : 'Declined'}`, 
          message: msg,
          type: 'System',
          is_read: false
        }]);
      }
      // ----------------------------------

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
      setShowRejectModal(false);
      setRejectReason('');
      setSelectedBooking(null);

    } catch (error: any) {
      alert(`Action failed: ${error.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  if (isLoading) {
    return (
      <div className='min-h-screen bg-slate-50 flex items-center justify-center'>
        <div className='flex flex-col items-center text-blue-600 font-bold'>
          <FiActivity className='text-4xl mb-4 animate-spin' />
          <span>Loading Booking Pipeline...</span>
        </div>
      </div>
    );
  }

  // --- FILTERING & SORTING EXECUTION ---
  const pendingRequests = bookings.filter(b => ['Pending Approval', 'Pending Reschedule', 'Pending Cancellation'].includes(b.booking_status));
  const confirmedBookings = bookings.filter(b => {
    if (!['Confirmed', 'Rescheduled', 'Rejected', 'Reschedule Rejected', 'Cancellation Rejected', 'Completed', 'In Progress'].includes(b.booking_status)) return false;
    if (b.booking_type === 'Home' && ['Confirmed', 'Completed', 'In Progress'].includes(b.booking_status)) return false; 
    return true;
  });
  const cancelledBookings = bookings.filter(b => ['Cancelled', 'Expired'].includes(b.booking_status));

  let displayList = activeTab === 'Pending' ? pendingRequests : activeTab === 'Confirmed' ? confirmedBookings : cancelledBookings;

  if (searchTerm) {
    const term = searchTerm.toLowerCase();
    displayList = displayList.filter(b => b.patients?.users?.user_fullname?.toLowerCase().includes(term) || b.patients?.users?.user_ic?.includes(term));
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

  if (timeFilter !== 'All') {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const nextWeek = new Date(today);
    nextWeek.setDate(today.getDate() + 7);

    displayList = displayList.filter(b => {
      const bDate = new Date(b.booking_date);
      if (timeFilter === 'Morning') return b.booking_session_time?.includes('Morning');
      if (timeFilter === 'Afternoon') return b.booking_session_time?.includes('Afternoon');
      if (timeFilter === 'Evening') return b.booking_session_time?.includes('Evening');
      if (timeFilter === 'Next7Days') return bDate >= today && bDate <= nextWeek;
      if (timeFilter === 'Past') return bDate < today;
      return true;
    });
  }

  displayList.sort((a, b) => {
    const dateA = new Date(a.booking_date).getTime();
    const dateB = new Date(b.booking_date).getTime();
    return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
  });

  return (
    <main className='p-8 bg-slate-50 min-h-screen font-sans pb-24 flex gap-6 relative'>
      <div className='flex-1 max-w-3xl flex flex-col h-[calc(100vh-100px)]'>


        <div className='mb-6 shrink-0 flex justify-between items-end'>
          <div>
            <h1 className='text-3xl font-bold text-slate-800 tracking-tight'>Request Management</h1>
          </div>
        </div>

        <div className='flex flex-col gap-3 mb-6 shrink-0'>
          <div className='bg-white p-2 rounded-2xl shadow-sm border border-slate-200 flex justify-between items-center'>
            <div className='flex gap-1 bg-slate-100 p-1 rounded-xl'>
              {(['Pending', 'Confirmed', 'Cancelled/Expired'] as const).map(tab => (
                <button key={tab} onClick={() => { setActiveTab(tab); setSelectedBooking(null); }} className={`px-5 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === tab ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                  {tab === 'Cancelled/Expired' ? 'Cancelled / Expired' : tab}
                  {tab === 'Pending' && pendingRequests.length > 0 && <span className='ml-2 bg-red-500 text-white px-2 py-0.5 rounded-full text-[10px]'>{pendingRequests.length}</span>}
                </button>
              ))}
            </div>
            
            <div className='pr-2'>
              <select value={filterType} onChange={e => setFilterType(e.target.value)} className='px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 text-sm font-bold text-slate-600'>
                <option value="All">All Request Types</option>
                <option value="Travel Booking">Travel Booking</option>
                <option value="Home Reschedule">Home Reschedule</option>
                <option value="Travel Reschedule">Travel Reschedule</option>
                <option value="Home Cancellation">Home Cancellation</option>
                <option value="Travel Cancellation">Travel Cancellation</option>
              </select>
            </div>
          </div>

          <div className='flex gap-3 h-12'>
            <div className='relative flex-1 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden'>
              <FiSearch className='absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg' />
              <input type="text" placeholder="Search patient name or IC number..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className='w-full h-full pl-10 pr-4 bg-transparent outline-none text-sm font-medium transition-colors' />
            </div>
            
            <select value={timeFilter} onChange={e => setTimeFilter(e.target.value)} className='px-4 h-full bg-white border border-slate-200 rounded-xl shadow-sm outline-none focus:border-blue-500 text-sm font-bold text-slate-600'>
              <option value="All">All Times & Shifts</option>
              <option value="Morning">Morning Shifts</option>
              <option value="Afternoon">Afternoon Shifts</option>
              <option value="Evening">Evening Shifts</option>
              <option value="Next7Days">Next 7 Days</option>
              <option value="Past">Past Sessions</option>
            </select>

            <button 
              onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')} 
              className='px-5 h-full bg-white border border-slate-200 rounded-xl shadow-sm text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors flex items-center gap-2'
            >
              <FiFilter /> Sort: {sortOrder === 'asc' ? <span className='flex items-center gap-1'>Earliest <FiArrowUp/></span> : <span className='flex items-center gap-1'>Latest <FiArrowDown/></span>}
            </button>
          </div>
        </div>

        <div className='flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-4'>
          {displayList.length === 0 ? (
            <div className='bg-white border border-slate-200 rounded-2xl py-16 flex flex-col items-center justify-center text-center shadow-sm'>
              <FiInbox className='text-4xl mb-4 opacity-50 text-slate-400' />
              <h3 className='text-lg font-bold text-slate-700'>No requests found</h3>
              <p className='text-sm text-slate-400 mt-1'>Try adjusting your search, sorting, or filters.</p>
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
              if (booking.booking_status === 'In Progress') statusColor = 'text-blue-600';
              if (booking.booking_status?.includes('Reject') || booking.booking_status === 'Cancelled' || booking.booking_status === 'Expired') statusColor = 'text-red-600';

              return (
                <div key={booking.id} onClick={() => setSelectedBooking(booking)} className={`bg-white rounded-2xl p-5 border cursor-pointer transition-all ${isSelected ? 'border-blue-500 ring-2 ring-blue-100 shadow-md' : 'border-slate-200 hover:border-blue-300 hover:shadow-sm'}`}>
                  <div className='flex justify-between items-start mb-3'>
                    <div className='flex items-center gap-3'>
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-black flex-col ${isCancel ? 'bg-red-50 text-red-600' : isTravel ? 'bg-indigo-50 text-indigo-600' : 'bg-amber-50 text-amber-600'}`}>
                        <span className='text-[10px] leading-none uppercase'>{bDate.toLocaleDateString('en-GB', { month: 'short' })}</span>
                        <span className='text-lg leading-none mt-0.5'>{bDate.getDate()}</span>
                      </div>
                      <div>
                        <h4 className='font-black text-slate-800'>{patientData?.users?.user_fullname || 'Unknown Patient'}</h4>
                        <p className='text-xs font-bold text-slate-500 flex items-center gap-1.5 mt-0.5'><FiClock className='text-blue-500' /> {booking.booking_session_time}</p>
                      </div>
                    </div>
                    <div className='text-right flex flex-col items-end'>
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${isCancel ? 'bg-red-100 text-red-700' : isTravel ? 'bg-indigo-100 text-indigo-700' : 'bg-purple-100 text-purple-700'} mb-1`}>
                        {isCancel ? <><FiXCircle /> Cancel Req</> : isTravel ? <><FiMapPin /> Travel Req</> : <><FiRefreshCw /> Reschedule Req</>}
                      </span>
                      <span className={`text-xs font-black uppercase tracking-wider flex items-center gap-1 ${statusColor}`}>
                        {booking.booking_status === 'In Progress' && <FiActivity className="animate-pulse" />} {booking.booking_status}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* RIGHT DOSSIER */}
      <div className='w-[450px] shrink-0 h-[calc(100vh-100px)] sticky top-8'>
        {selectedBooking ? (
          <div className='bg-white rounded-3xl shadow-xl border border-slate-200 h-full flex flex-col overflow-hidden animate-in slide-in-from-right-8'>
            <div className='p-6 bg-slate-900 text-white shrink-0'>
              <div className='flex justify-between items-start mb-4'>
                <div>
                  <span className='px-2.5 py-1 bg-white/20 rounded-full text-[10px] font-black uppercase tracking-widest mb-2 inline-block'>
                    {selectedBooking.booking_status?.includes('Cancel') || selectedBooking.booking_status === 'Cancelled' ? 'Cancellation Details' : selectedBooking.booking_type === 'Travel' ? 'Travel Details' : 'Reschedule Details'}
                  </span>
                  <h2 className='text-2xl font-black'>{new Date(selectedBooking.booking_date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</h2>
                  <p className='text-slate-300 font-bold mt-1 text-sm'>{selectedBooking.booking_session_time}</p>
                </div>
                <button onClick={() => setSelectedBooking(null)} className='p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors'><FiX /></button>
              </div>
            </div>

            <div className='flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar bg-slate-50'>
              {requestDetails?.request_type === 'Reschedule' && (
                <div className='bg-purple-50 p-4 rounded-2xl border border-purple-200 shadow-sm'>
                  <h3 className='text-[10px] font-black text-purple-600 uppercase tracking-widest mb-2'>Requested Reschedule</h3>
                  <p className='text-lg font-black text-slate-800'>{new Date(requestDetails.request_new_date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</p>
                  <p className='text-sm font-bold text-slate-600 mt-1'><FiClock className="inline text-purple-500 mr-1"/> {requestDetails.request_new_session}</p>
                </div>
              )}

              <div className='bg-white p-4 rounded-2xl border border-slate-100 shadow-sm'>
                <h3 className='text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3'>Patient Profile</h3>
                <p className='text-lg font-black text-slate-800'>{selectedBooking.patients?.users?.user_fullname}</p>
                <div className='text-sm font-medium text-slate-500 mt-3 space-y-2'>
                  <p className='flex items-center gap-2'><span className='w-5 text-slate-400 font-bold'>IC:</span> <span className='font-bold text-slate-700'>{selectedBooking.patients?.users?.user_ic}</span></p>
                  <p className='flex items-center gap-2'><span className='w-5'><FiHome className='text-slate-400 text-lg' /></span> <span className='font-bold text-slate-700'>{selectedBooking.patients?.branches?.branch_name || 'Unknown Home Branch'}</span></p>
                  <p className='flex items-center gap-2'><span className='w-5'><FiDroplet className='text-red-400 text-lg' /></span> <span className='font-bold text-slate-700'>Type {selectedBooking.patients?.patient_blood_type || 'Unknown'}</span></p>
                </div>
              </div>

              {requestDetails?.request_reason && (
                <div className='bg-slate-100 p-4 rounded-2xl border border-slate-200 shadow-inner'>
                  <h3 className='text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1.5'>
                    <FiMessageSquare /> Patient's Provided Reason
                  </h3>
                  <p className='text-sm font-bold text-slate-700 italic border-l-2 border-slate-400 pl-3 py-1'>
                    "{requestDetails.request_reason}"
                  </p>
                </div>
              )}

              {selectedBooking.booking_status?.includes('Reject') && requestDetails?.manager_comment && (
                <div className='bg-red-50 p-4 rounded-2xl border border-red-200 shadow-sm'>
                  <h3 className='text-[10px] font-black text-red-600 uppercase tracking-widest mb-2 flex items-center gap-1.5'>
                    <FiXCircle /> Manager's Rejection Reason
                  </h3>
                  <p className='text-sm font-bold text-red-800 leading-snug'>
                    {requestDetails.manager_comment}
                  </p>
                </div>
              )}

              <div className='bg-white p-4 rounded-2xl border border-slate-100 shadow-sm'>
                <h3 className='text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3'>Infection Status</h3>
                <div className='grid grid-cols-3 gap-2'>
                  <div className={`p-2 rounded-lg text-center ${selectedBooking.patients?.hepatitis_b_status === 'Positive' ? 'bg-red-50 text-red-700 font-bold border border-red-200 ring-2 ring-red-500' : 'bg-emerald-50 text-emerald-700 font-bold border border-emerald-200'}`}>
                    <p className='text-[9px] uppercase opacity-70'>Hep B</p>
                    <p className='text-sm'>{selectedBooking.patients?.hepatitis_b_status || 'Unknown'}</p>
                  </div>
                  <div className={`p-2 rounded-lg text-center ${selectedBooking.patients?.hepatitis_c_status === 'Positive' ? 'bg-red-50 text-red-700 font-bold border border-red-200 ring-2 ring-red-500' : 'bg-emerald-50 text-emerald-700 font-bold border border-emerald-200'}`}>
                    <p className='text-[9px] uppercase opacity-70'>Hep C</p>
                    <p className='text-sm'>{selectedBooking.patients?.hepatitis_c_status || 'Unknown'}</p>
                  </div>
                  <div className={`p-2 rounded-lg text-center ${selectedBooking.patients?.hiv_status === 'Positive' ? 'bg-red-50 text-red-700 font-bold border border-red-200 ring-2 ring-red-500' : 'bg-emerald-50 text-emerald-700 font-bold border border-emerald-200'}`}>
                    <p className='text-[9px] uppercase opacity-70'>HIV</p>
                    <p className='text-sm'>{selectedBooking.patients?.hiv_status || 'Unknown'}</p>
                  </div>
                </div>
              </div>

              {selectedBooking.booking_type === 'Travel' && (
                <div className='bg-white p-4 rounded-2xl border border-blue-200 shadow-sm ring-1 ring-blue-50'>
                  <h3 className='text-[10px] font-black text-blue-600 uppercase tracking-widest mb-3 flex items-center gap-1.5'><FiFileText/> Mandatory Documents</h3>
                  <div className='space-y-3'>
                    <div className='flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-xl'>
                      <div><p className='text-sm font-bold text-slate-800'>Serology Report</p>{selectedBooking.patients?.serology_report_url ? <p className='text-[10px] font-bold text-emerald-600'>Uploaded</p> : <p className='text-[10px] font-bold text-red-500'>Missing</p>}</div>
                      <button disabled={!selectedBooking.patients?.serology_report_url} onClick={() => setDocViewerUrl(selectedBooking.patients?.serology_report_url)} className='p-2 bg-white border border-slate-200 rounded-lg text-slate-600 hover:text-blue-600 disabled:opacity-50'><FiEye /></button>
                    </div>
                    <div className='flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-xl'>
                      <div><p className='text-sm font-bold text-slate-800'>Doctor's Referral</p>{selectedBooking.patients?.referral_letter_url ? <p className='text-[10px] font-bold text-emerald-600'>Uploaded</p> : <p className='text-[10px] font-bold text-red-500'>Missing</p>}</div>
                      <button disabled={!selectedBooking.patients?.referral_letter_url} onClick={() => setDocViewerUrl(selectedBooking.patients?.referral_letter_url)} className='p-2 bg-white border border-slate-200 rounded-lg text-slate-600 hover:text-blue-600 disabled:opacity-50'><FiEye /></button>
                    </div>
                  </div>
                </div>
              )}

              {selectedBooking.booking_type === 'Travel' && ['Confirmed', 'Completed', 'In Progress'].includes(selectedBooking.booking_status) && (
                <div className='bg-amber-50 p-4 rounded-2xl border border-amber-200 shadow-sm'>
                  <h3 className='text-[10px] font-black text-amber-800 uppercase tracking-widest mb-2 flex items-center gap-1.5'>
                    <FiAlertTriangle/> Machine Settings
                  </h3>
                  <p className='text-xs font-bold text-amber-900 leading-relaxed'>
                    Patient's home machine is <strong>{selectedBooking.patients?.preferred_machine_model || 'Unknown'}</strong>. Ensure Head Nurse reviews the Referral Letter for parameters.
                  </p>
                </div>
              )}
            </div>

            {selectedBooking.booking_status?.includes('Pending') && (
              <div className='p-6 bg-white border-t border-slate-100 shrink-0'>
                {!selectedBooking.booking_status.includes('Cancel') && (
                  <div className='mb-4 p-3 bg-blue-50 border border-blue-100 rounded-xl'>
                    <label className='block text-xs font-black text-blue-800 uppercase tracking-widest mb-2 flex items-center justify-between'>
                      Assign Machine Slot
                      {selectedBooking.patients?.hepatitis_b_status === 'Positive' && <span className='text-[9px] text-red-600 font-bold'>*ISOLATION REQ</span>}
                    </label>
                    <select value={selectedMachineId} onChange={e => setSelectedMachineId(e.target.value)} className='w-full p-2.5 bg-white border border-blue-200 rounded-lg outline-none focus:border-blue-500 text-sm font-bold text-slate-700'>
                      <option value="">-- Select a FREE compatible machine --</option>
                      {availableMachines.length === 0 ? (
                        <option disabled>No free machines available on this date/shift</option>
                      ) : (
                        availableMachines.map(m => <option key={m.id} value={m.id}>{m.model} (SN: {m.serial_number})</option>)
                      )}
                    </select>
                  </div>
                )}
                <div className='flex gap-3'>
                  <button onClick={() => setShowRejectModal(true)} disabled={isProcessing} className='flex-1 py-3.5 bg-white border-2 border-red-100 text-red-600 font-black rounded-xl hover:bg-red-50 transition-colors disabled:opacity-50'>Reject</button>
                  <button onClick={() => handleAction('Approve')} disabled={isProcessing || !approvalValidation.isValid} className='flex-1 py-3.5 bg-blue-600 text-white font-black rounded-xl hover:bg-blue-500 transition-colors disabled:bg-slate-700 disabled:text-slate-400'>
                    {isProcessing ? 'Processing...' : 'Approve'}
                  </button>
                </div>
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

      {/* REJECT MODAL */}
      {showRejectModal && (
        <div className='fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in'>
          <div className='bg-white rounded-3xl shadow-2xl max-w-md w-full p-6 animate-in zoom-in-95'>
            <div className='flex items-center gap-3 mb-4 text-red-600'>
              <div className='w-12 h-12 rounded-full bg-red-100 flex items-center justify-center text-xl'><FiXCircle /></div>
              <h3 className='text-lg font-black text-slate-800'>Reject Request</h3>
            </div>
            <p className='text-sm text-slate-500 mb-4 font-medium'>Please provide a specific reason for rejection. This will be sent directly to the patient.</p>
            <textarea
              autoFocus
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              placeholder="E.g., No compatible machines available, invalid serology report..."
              className='w-full p-4 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-red-400 text-sm font-bold text-slate-700 resize-none h-32 mb-6'
            />
            <div className='flex gap-3'>
              <button onClick={() => { setShowRejectModal(false); setRejectReason(''); }} className='flex-1 py-3 border border-slate-200 rounded-xl font-bold text-slate-500 hover:bg-slate-50'>Cancel</button>
              <button onClick={() => handleAction('Reject')} disabled={isProcessing || !rejectReason.trim()} className='flex-1 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 disabled:opacity-50 flex justify-center items-center gap-2'>
                <FiMessageSquare /> Send Rejection
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PDF VIEWER */}
      {docViewerUrl && (
        <div className='fixed inset-0 z-[100] bg-slate-900/95 flex flex-col animate-in fade-in'>
          <div className='flex justify-between items-center p-5 bg-black'>
            <h3 className='text-white font-black text-lg'>Document Viewer</h3>
            <button onClick={() => setDocViewerUrl(null)} className='p-2 bg-white/10 rounded-full text-white hover:bg-white/20'><FiX className='text-xl' /></button>
          </div>
          <div className='flex-1 w-full flex items-center justify-center bg-slate-800 p-8'>
            <iframe src={docViewerUrl} className='w-full h-full max-w-5xl bg-white rounded-xl shadow-2xl' />
          </div>
        </div>
      )}
    </main>
  );
}