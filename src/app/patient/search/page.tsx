'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { useRouter } from 'next/navigation';
import PatientBottomNav from '../../../components/PatientBottomNav';

import { 
  FiSearch, FiMapPin, FiClock, FiChevronLeft, FiChevronRight, FiWifi, 
  FiTv, FiCoffee, FiUsers, FiFilter, FiCheckCircle, FiMaximize2, FiX, FiHome, FiCrosshair, FiAlertCircle, FiPlus, FiTrash2, FiFileText
} from 'react-icons/fi';
import { FaParking, FaWheelchair, FaMosque } from 'react-icons/fa';

// --- HELPERS ---
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; 
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

const renderFacilityIcon = (facilityName: string, className = "text-blue-500") => {
  const name = facilityName.toLowerCase();
  if (name.includes('wheelchair')) return <FaWheelchair className={className} />;
  if (name.includes('parking')) return <FaParking className={className} />;
  if (name.includes('tv')) return <FiTv className={className} />;
  if (name.includes('wifi')) return <FiWifi className={className} />;
  if (name.includes('surau') || name.includes('prayer')) return <FaMosque className={className} />;
  if (name.includes('coffee') || name.includes('snack')) return <FiCoffee className={className} />;
  return <FiCheckCircle className={className} />; 
};

export default function PatientSearchBooking() {
  const [isLoading, setIsLoading] = useState(true);
  const [branches, setBranches] = useState<any[]>([]);
  const [filteredBranches, setFilteredBranches] = useState<any[]>([]);
  
  const [patientId, setPatientId] = useState<number | null>(null);
  const [patientHomeBranchId, setPatientHomeBranchId] = useState<number | null>(null);
  const [patientRecord, setPatientRecord] = useState<any>(null);
  
  // Search & Filter States
  const [searchTerm, setSearchTerm] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [filterRegion, setFilterRegion] = useState<string | null>(null);
  const [filterPrice, setFilterPrice] = useState<string | null>(null);
  const [filterFacilities, setFilterFacilities] = useState<string[]>([]);
  const [userLocation, setUserLocation] = useState<{lat: number, lng: number} | null>(null);
  const [isLocating, setIsLocating] = useState(false);

  // Selection States
  const [selectedBranch, setSelectedBranch] = useState<any>(null);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [showZoom, setShowZoom] = useState(false);
  
  // Booking Cart States
  const minAllowedDate = new Date();
  minAllowedDate.setDate(minAllowedDate.getDate() + 14);
  const minDateString = minAllowedDate.toISOString().split('T')[0];

  const [draftDate, setDraftDate] = useState(minDateString);
  const [draftShift, setDraftShift] = useState('');
  const [selectedSessions, setSelectedSessions] = useState<{date: string, shift: string}[]>([]);
  const [showReviewScreen, setShowReviewScreen] = useState(false);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [morningSlots, setMorningSlots] = useState(0);
  const [afternoonSlots, setAfternoonSlots] = useState(0);
  const [isCheckingSlots, setIsCheckingSlots] = useState(false);

  const regions = ['Penang', 'Kuala Lumpur', 'Johor', 'Melaka'];
  const priceRanges = ['Under RM 200', 'RM 200 - RM 300', 'Above RM 300'];
  const facilitiesList = ['Wheelchair', 'Parking', 'TV', 'Wifi', 'Surau', 'Coffee'];
  
  const router = useRouter();

  useEffect(() => {
    async function loadData() {
      setIsLoading(true);
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData.session) throw new Error("Please log in.");
        const email = sessionData.session.user.email;
        const { data: user } = await supabase.from('users').select('user_id').eq('user_email', email).single();
        if (user) {
          const { data: patient } = await supabase.from('patients').select('*').eq('user_id', user.user_id).single();
          if (patient) {
            setPatientId(patient.patient_id);
            setPatientHomeBranchId(patient.home_branch_id);
            setPatientRecord(patient);
          }
        }
        const { data: branchData } = await supabase.from('branches').select('*').order('branch_name', { ascending: true });
        setBranches(branchData || []);
        setFilteredBranches(branchData || []);
      } catch (err) { console.error(err); } finally { setIsLoading(false); }
    }
    loadData();
  }, []);

  // --- SLOT CHECKING ---
  useEffect(() => {
    if (!selectedBranch || !draftDate) return;
    async function checkAvailability() {
      setIsCheckingSlots(true);
      try {
        const maxCapacity = selectedBranch.available_slots > 0 ? selectedBranch.available_slots : selectedBranch.total_machines || 8;
        const { data: existingBookings } = await supabase.from('bookings').select('booking_session_time').eq('branch_id', selectedBranch.id).eq('booking_date', draftDate).neq('booking_status', 'Cancelled');
        const morningCount = (existingBookings || []).filter(b => b.booking_session_time?.includes('Morning')).length;
        const afternoonCount = (existingBookings || []).filter(b => b.booking_session_time?.includes('Afternoon')).length;
        setMorningSlots(Math.max(0, maxCapacity - morningCount));
        setAfternoonSlots(Math.max(0, maxCapacity - afternoonCount));
      } finally { setIsCheckingSlots(false); }
    }
    checkAvailability();
  }, [selectedBranch, draftDate]);

  // --- FILTER LOGIC ---
  const handleGetLocation = () => {
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition((pos) => {
      setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      setIsLocating(false);
    }, () => setIsLocating(false));
  };

  const applyFilters = () => {
    let result = [...branches];
    if (searchTerm) result = result.filter(b => b.branch_name.toLowerCase().includes(searchTerm.toLowerCase()));
    if (filterRegion) result = result.filter(b => b.branch_address?.includes(filterRegion));
    if (filterFacilities.length > 0) result = result.filter(b => b.amenities && filterFacilities.every(f => b.amenities.includes(f)));
    if (filterPrice) {
      result = result.filter(b => {
        const p = b.session_price;
        if (filterPrice === 'Under RM 200') return p < 200;
        if (filterPrice === 'RM 200 - RM 300') return p >= 200 && p <= 300;
        return p > 300;
      });
    }
    if (userLocation) result = result.map(b => ({ ...b, distance: calculateDistance(userLocation.lat, userLocation.lng, b.latitude, b.longitude) })).sort((a,b) => (a.distance || 0) - (b.distance || 0));
    setFilteredBranches(result); setShowFilters(false);
  };

  // --- CLINICAL CHECKS ---
  const expiryDate = patientRecord?.last_serology_date ? new Date(new Date(patientRecord.last_serology_date).setMonth(new Date(patientRecord.last_serology_date).getMonth() + 6)) : null;
  const isEligibleForSelectedDate = expiryDate && new Date(draftDate) <= expiryDate && patientRecord.travel_status === 'Active';
  const isMachineMatch = patientRecord?.preferred_machine_model && selectedBranch ? (selectedBranch.machine_models || []).includes(patientRecord.preferred_machine_model) : true;
  const isShiftMatch = draftShift && patientRecord?.preferred_shift ? draftShift.includes(patientRecord.preferred_shift) : true;

  const handleFinalSubmit = async () => {
    setIsSubmitting(true);
    const inserts = selectedSessions.map(s => ({ patient_id: patientId, branch_id: selectedBranch.id, booking_date: s.date, booking_session_time: s.shift, booking_type: 'Travel', booking_status: 'Pending Approval' }));
    const { error } = await supabase.from('bookings').insert(inserts);
    if (!error) setShowSuccessDialog(true);
    setIsSubmitting(false);
  };

  if (isLoading) return <div className='h-screen flex items-center justify-center text-blue-600 font-bold animate-pulse'>Loading DialyGo Search...</div>;

  return (
    <div className='max-w-md mx-auto bg-slate-50 h-[100dvh] relative shadow-2xl font-sans overflow-hidden flex flex-col'>
      
      {/* SEARCH VIEW */}
      {!selectedBranch && (
        <>
          <div className='bg-white px-5 pt-12 pb-4 shadow-sm z-10 shrink-0'>
            <h1 className='text-xl font-black text-slate-800 tracking-tight mb-4'>Find a Centre</h1>
            <div className='flex gap-2'>
              <div className='relative flex-1'>
                <FiSearch className='absolute left-4 top-1/2 -translate-y-1/2 text-slate-400' />
                <input type="text" placeholder="Search centre..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className='w-full pl-11 pr-4 py-3 bg-slate-100 rounded-xl outline-none text-sm font-medium' />
              </div>
              <button onClick={() => setShowFilters(!showFilters)} className={`px-4 rounded-xl ${showFilters || filterRegion ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}><FiFilter /></button>
            </div>

            {showFilters && (
              <div className='mt-4 pt-4 border-t border-slate-100 space-y-4'>
                <button onClick={handleGetLocation} className='w-full py-3 bg-blue-50 text-blue-600 rounded-xl font-bold text-xs flex items-center justify-center gap-2'><FiCrosshair /> {isLocating ? 'Locating...' : 'Sort by Nearest'}</button>
                <div className='flex flex-wrap gap-2'>
                  {regions.map(r => <button key={r} onClick={() => setFilterRegion(r === filterRegion ? null : r)} className={`px-3 py-1.5 rounded-full text-[10px] font-bold border ${filterRegion === r ? 'bg-blue-600 text-white' : 'bg-white'}`}>{r}</button>)}
                </div>
                <button onClick={applyFilters} className='w-full py-3 bg-slate-900 text-white rounded-xl font-bold text-sm'>Apply Filters</button>
              </div>
            )}
          </div>

          <div className='flex-1 overflow-y-auto p-5 pb-24 space-y-4 custom-scrollbar'>
            {filteredBranches.map(branch => (
              <div key={branch.id} className='bg-white rounded-2xl overflow-hidden shadow-sm border border-slate-100'>
                <div className='h-32 bg-slate-200'><img src={branch.branch_cover_photo} className='w-full h-full object-cover' /></div>
                <div className='p-4'>
                  <div className='flex justify-between items-start'>
                    <h3 className='font-black text-slate-800'>{branch.branch_name}</h3>
                    {branch.distance && <span className='text-[10px] font-bold text-blue-600'>{branch.distance.toFixed(1)} km</span>}
                  </div>
                  <p className='text-[11px] text-slate-500 mt-1 mb-3 line-clamp-1'><FiMapPin className='inline mr-1'/>{branch.branch_address}</p>
                  <div className='flex justify-between items-center'>
                    <p className='text-sm font-black text-blue-700'>RM {branch.session_price || '---'}</p>
                    <button onClick={() => setSelectedBranch(branch)} className='bg-blue-600 text-white px-5 py-2 rounded-xl text-xs font-bold'>Book Session</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <PatientBottomNav />
        </>
      )}

      {/* DETAIL & CART VIEW */}
      {selectedBranch && !showReviewScreen && (
        <div className='flex flex-col h-full bg-white z-20 absolute inset-0 animate-in slide-in-from-right-8'>
          <div className='absolute top-12 left-5 z-30 flex gap-2'>
            <button onClick={() => setSelectedBranch(null)} className='p-2 bg-white/90 backdrop-blur rounded-full shadow-lg text-slate-800'><FiChevronLeft className='text-xl'/></button>
          </div>

          <div className='flex-1 overflow-y-auto pb-safe custom-scrollbar'>
            {/* Gallery */}
            <div className='h-64 bg-slate-900 relative group'>
              <img src={uniquePhotos[currentPhotoIndex]} className='w-full h-full object-cover' />
              {uniquePhotos.length > 1 && (
                <div className='absolute inset-0 flex items-center justify-between px-4 opacity-0 group-hover:opacity-100 transition-opacity'>
                  <button onClick={() => setCurrentPhotoIndex(prev => (prev - 1 + uniquePhotos.length) % uniquePhotos.length)} className='p-2 bg-black/40 text-white rounded-full'><FiChevronLeft/></button>
                  <button onClick={() => setCurrentPhotoIndex(prev => (prev + 1) % uniquePhotos.length)} className='p-2 bg-black/40 text-white rounded-full'><FiChevronRight/></button>
                </div>
              )}
            </div>

            <div className='p-5 -mt-6 bg-white rounded-t-3xl relative z-10'>
              <div className='flex justify-between items-start'>
                <h2 className='text-xl font-black text-slate-800'>{selectedBranch.branch_name}</h2>
                <span className='bg-blue-50 text-blue-600 px-3 py-1 rounded-full text-xs font-black'>RM {selectedBranch.session_price}</span>
              </div>
              <p className='text-xs text-slate-500 mt-2 mb-4 leading-relaxed'>{selectedBranch.branch_address}</p>
              
              <div className='flex flex-wrap gap-2 mb-6'>
                {selectedBranch.amenities?.map((a:string) => <span key={a} className='flex items-center gap-1 bg-slate-50 border border-slate-100 px-3 py-1.5 rounded-lg text-[10px] font-bold text-slate-600'>{renderFacilityIcon(a)}{a}</span>)}
              </div>

              {/* CART SECTION */}
              <div className='bg-slate-900 text-white rounded-2xl p-5 mb-8'>
                <h3 className='text-xs font-black uppercase tracking-widest text-slate-400 mb-4'>Add Sessions</h3>
                
                {!isEligibleForSelectedDate && <div className='mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-[10px] text-red-400 font-bold flex gap-2'><FiAlertCircle/>Serology expires {expiryDate?.toLocaleDateString('en-GB')}</div>}
                
                <div className='space-y-4'>
                  <input type="date" min={minDateString} value={draftDate} onChange={e => setDraftDate(e.target.value)} className='w-full bg-white/10 border border-white/10 rounded-xl p-3 text-sm font-bold outline-none' />
                  <div className='grid grid-cols-2 gap-2'>
                    <button onClick={() => setDraftShift('Morning (08:00 - 12:00)')} className={`py-3 rounded-xl text-[10px] font-black uppercase border transition-all ${draftShift.includes('Morning') ? 'bg-blue-600 border-blue-600' : 'bg-white/5 border-white/10 text-slate-400'}`}>Morning ({morningSlots})</button>
                    <button onClick={() => setDraftShift('Afternoon (12:00 - 16:00)')} className={`py-3 rounded-xl text-[10px] font-black uppercase border transition-all ${draftShift.includes('Afternoon') ? 'bg-blue-600 border-blue-600' : 'bg-white/5 border-white/10 text-slate-400'}`}>Afternoon ({afternoonSlots})</button>
                  </div>

                  {!isShiftMatch && draftShift && <p className='text-[9px] text-amber-400 font-bold'>⚠️ This differs from your usual {patientRecord.preferred_shift} shift.</p>}
                  {!isMachineMatch && <p className='text-[9px] text-amber-400 font-bold'>⚠️ Prescription adjustment needed (No {patientRecord.preferred_machine_model}).</p>}

                  <button onClick={() => { if(draftShift && !selectedSessions.find(s=>s.date===draftDate)) { setSelectedSessions([...selectedSessions, {date: draftDate, shift: draftShift}]); setDraftShift(''); } }} disabled={!draftShift || !isEligibleForSelectedDate} className='w-full py-4 bg-white text-slate-900 rounded-xl font-black text-xs uppercase shadow-xl disabled:opacity-30'>Add Session to Cart</button>
                </div>
              </div>

              {/* CART PREVIEW */}
              {selectedSessions.length > 0 && (
                <div className='animate-in fade-in slide-in-from-bottom-4'>
                  <h3 className='text-xs font-black text-slate-400 uppercase tracking-widest mb-3'>Your Trip Plan ({selectedSessions.length})</h3>
                  <div className='space-y-2 mb-6'>
                    {selectedSessions.map((s, i) => (
                      <div key={i} className='flex justify-between items-center bg-slate-50 p-3 rounded-xl border border-slate-100'>
                        <div><p className='text-sm font-black text-slate-800'>{new Date(s.date).toLocaleDateString('en-GB')}</p><p className='text-[9px] font-bold text-slate-400 uppercase'>{s.shift.split(' (')[0]}</p></div>
                        <button onClick={() => setSelectedSessions(selectedSessions.filter(item => item.date !== s.date))} className='text-red-400 p-2'><FiTrash2/></button>
                      </div>
                    ))}
                  </div>
                  <button onClick={() => setShowReviewScreen(true)} className='w-full py-4 bg-blue-600 text-white rounded-2xl font-black shadow-lg shadow-blue-200'>Review & Request Approval</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* REVIEW SCREEN */}
      {showReviewScreen && (
        <div className='flex flex-col h-full bg-slate-50 z-30 absolute inset-0 animate-in slide-in-from-bottom-8'>
          <div className='bg-white px-5 pt-12 pb-4 shadow-sm flex items-center justify-between'>
            <button onClick={() => setShowReviewScreen(false)} className='text-slate-600 font-bold text-sm flex items-center gap-1'><FiChevronLeft/> Edit</button>
            <h1 className='text-lg font-black'>Review Booking</h1>
            <div className='w-10'/>
          </div>
          <div className='flex-1 p-5 space-y-6 overflow-y-auto'>
            <div className='bg-white p-5 rounded-2xl border border-slate-100'>
              <p className='text-[10px] font-black text-slate-400 uppercase mb-2'>Target Clinic</p>
              <h3 className='font-black text-slate-800'>{selectedBranch.branch_name}</h3>
            </div>
            <div className='bg-white p-5 rounded-2xl border border-slate-100 space-y-4'>
              <p className='text-[10px] font-black text-slate-400 uppercase'>Schedule Breakdown</p>
              {selectedSessions.map((s, i) => <div key={i} className='flex justify-between font-bold text-sm'><span>{new Date(s.date).toLocaleDateString('en-GB')} ({s.shift.split(' ')[0]})</span><span>RM {selectedBranch.session_price}</span></div>)}
              <div className='pt-4 border-t border-slate-100 flex justify-between items-center'>
                <span className='text-lg font-black text-slate-800'>Total Estimate</span>
                <span className='text-xl font-black text-blue-600'>RM {selectedSessions.length * (selectedBranch.session_price || 0)}</span>
              </div>
            </div>
            <div className='bg-amber-50 p-4 rounded-xl border border-amber-200 flex gap-3'>
              <FiFileText className='text-amber-600 shrink-0 mt-1'/>
              <p className='text-[10px] font-bold text-amber-700 leading-relaxed'>Ensure your Referral Letter and Serology Report are uploaded in your Profile before the travel date.</p>
            </div>
            <button onClick={handleFinalSubmit} disabled={isSubmitting} className='w-full py-4 bg-slate-900 text-white rounded-2xl font-black shadow-xl'>{isSubmitting ? 'Submitting...' : 'Confirm Request'}</button>
          </div>
        </div>
      )}

      {/* SUCCESS */}
      {showSuccessDialog && (
        <div className='absolute inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur p-5 animate-in fade-in'>
          <div className='bg-white w-full max-w-sm rounded-3xl p-8 text-center shadow-2xl'>
            <FiCheckCircle className='text-6xl text-emerald-500 mx-auto mb-4'/>
            <h3 className='text-xl font-black text-slate-800'>Request Sent!</h3>
            <p className='text-sm text-slate-500 mt-2 mb-6'>The branch manager will review your documents and confirm the slots shortly.</p>
            <button onClick={() => {setSelectedBranch(null); setShowSuccessDialog(false); router.push('/patient');}} className='w-full py-4 bg-slate-100 text-slate-800 rounded-2xl font-black'>Back to Dashboard</button>
          </div>
        </div>
      )}
    </div>
  );
}