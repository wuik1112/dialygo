'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { useRouter } from 'next/navigation';
import PatientBottomNav from '../../../components/PatientBottomNav';

// Professional React Icons
import { 
  FiSearch, FiMapPin, FiClock, FiChevronLeft, FiWifi, 
  FiTv, FiCoffee, FiUsers, FiFilter, FiCheckCircle
} from 'react-icons/fi';
import { FaParking, FaWheelchair } from 'react-icons/fa';

export default function PatientSearchBooking() {
  const [isLoading, setIsLoading] = useState(true);
  const [branches, setBranches] = useState<any[]>([]);
  const [filteredBranches, setFilteredBranches] = useState<any[]>([]);
  const [patientId, setPatientId] = useState<number | null>(null);
  
  // Search & Filter States (Wireframe Page 3)
  const [searchTerm, setSearchTerm] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [filterRegion, setFilterRegion] = useState<string | null>(null);
  const [filterShift, setFilterShift] = useState<string | null>(null);
  
  // Navigation States
  const [selectedBranch, setSelectedBranch] = useState<any>(null);
  
  // Booking States
  const [bookingDate, setBookingDate] = useState('');
  const [bookingShift, setBookingShift] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);

  const minAllowedDate = new Date();
  minAllowedDate.setDate(minAllowedDate.getDate() + 14);
  const minDateString = minAllowedDate.toISOString().split('T')[0];

  const regions = ['Penang', 'Kuala Lumpur', 'Johor', 'Melaka'];
  const shifts = ['8am - 12pm', '12pm - 4pm', '5pm - 9pm'];

  const router = useRouter();

  useEffect(() => {
    async function loadData() {
      setIsLoading(true);
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData.session) throw new Error("Please log in.");

        const email = sessionData.session.user.email;
        const { data: user } = await supabase.from('users').select('user_id').eq('user_email', email).single();
        if (user) setPatientId(user.user_id);

        const { data: branchData, error } = await supabase
          .from('branches')
          .select('*')
          .order('branch_name', { ascending: true });

        if (error) throw error;
        setBranches(branchData || []);
        setFilteredBranches(branchData || []);
      } catch (err) {
        console.error("Failed to load branches");
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, []);

  // Apply Filters Logic
  const applyFilters = () => {
    let result = branches;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(b => b.branch_name.toLowerCase().includes(term) || (b.branch_address && b.branch_address.toLowerCase().includes(term)));
    }
    if (filterRegion) {
      result = result.filter(b => b.branch_address && b.branch_address.toLowerCase().includes(filterRegion.toLowerCase()));
    }
    // Shift filtering would typically require checking roster/machine availability. 
    // For UI purposes based on the wireframe, we filter the dataset visually.
    setFilteredBranches(result);
    setShowFilters(false);
  };

  const resetFilters = () => {
    setFilterRegion(null);
    setFilterShift(null);
    setSearchTerm('');
    setFilteredBranches(branches);
  };

  const handleBookingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bookingDate || !bookingShift) return;

    setIsSubmitting(true);
    try {
      const payload = {
        patient_id: patientId,
        branch_id: selectedBranch.id,
        booking_date: bookingDate,
        booking_session_time: bookingShift,
        booking_type: 'Travel',
        booking_status: 'Pending Approval'
      };

      const { error } = await supabase.from('bookings').insert([payload]);
      if (error) throw error;

      setShowSuccessDialog(true);
    } catch (err) {
      alert("Failed to submit request.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const closeSuccessDialog = () => {
    setShowSuccessDialog(false);
    setSelectedBranch(null);
    setBookingDate('');
    setBookingShift('');
    router.push('/patient'); // Send back to home to see the pending booking
  };

  if (isLoading) {
    return (
      <div className='max-w-md mx-auto bg-slate-50 h-[100dvh] relative shadow-2xl font-sans overflow-hidden flex flex-col'>
        <div className='bg-white px-5 pt-12 pb-4 shadow-sm z-10 shrink-0'>
          <h1 className='text-2xl font-black text-slate-800 tracking-tight mb-4'>Search Dialysis Centre</h1>
        </div>
        <div className='flex-1 flex items-center justify-center text-blue-600 font-bold'>
          <span className='animate-pulse'>Loading Centres...</span>
        </div>
        <PatientBottomNav />
      </div>
    );
  }

  return (
    <div className='max-w-md mx-auto bg-slate-50 h-[100dvh] relative shadow-2xl font-sans overflow-hidden flex flex-col'>
      
      {/* ========================================= */}
      {/* VIEW 1: SEARCH & FILTER (Wireframe Page 3) */}
      {/* ========================================= */}
      {!selectedBranch && (
        <>
          {/* Header & Search */}
          <div className='bg-white px-5 pt-12 pb-4 shadow-sm z-10 shrink-0'>
            <h1 className='text-xl font-black text-slate-800 tracking-tight mb-4'>Search Dialysis Centre</h1>

            <div className='flex gap-2'>
              <div className='relative flex-1'>
                <FiSearch className='absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-lg' />
                <input 
                  type="text" 
                  placeholder="Search centre here" 
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className='w-full pl-12 pr-4 py-3 bg-slate-100 border-none rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-800 text-sm'
                />
              </div>
              <button 
                onClick={() => setShowFilters(!showFilters)}
                className={`px-4 rounded-xl flex items-center justify-center transition-colors ${showFilters || filterRegion || filterShift ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}
              >
                <FiFilter className='text-lg' />
              </button>
            </div>

            {/* Expandable Filter Panel (From Wireframe) */}
            {showFilters && (
              <div className='mt-4 pt-4 border-t border-slate-100 animate-in slide-in-from-top-2'>
                <div className='flex justify-between items-center mb-3'>
                  <h3 className='font-bold text-slate-800'>Filter Result</h3>
                  <button onClick={resetFilters} className='text-xs font-bold text-slate-400 hover:text-red-500'>Reset</button>
                </div>
                
                <div className='mb-4'>
                  <p className='text-xs font-bold text-slate-500 mb-2'>Region:</p>
                  <div className='flex flex-wrap gap-2'>
                    {regions.map(r => (
                      <button 
                        key={r} onClick={() => setFilterRegion(r)}
                        className={`px-3 py-1.5 rounded-full text-xs font-bold border ${filterRegion === r ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200'}`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>

                <div className='mb-6'>
                  <p className='text-xs font-bold text-slate-500 mb-2'>Shift:</p>
                  <div className='flex flex-wrap gap-2'>
                    {shifts.map(s => (
                      <button 
                        key={s} onClick={() => setFilterShift(s)}
                        className={`px-3 py-1.5 rounded-full text-xs font-bold border ${filterShift === s ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200'}`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>

                <div className='flex gap-2'>
                  <button onClick={() => setShowFilters(false)} className='flex-1 py-3 rounded-xl font-bold text-sm bg-slate-100 text-slate-600'>Cancel</button>
                  <button onClick={applyFilters} className='flex-1 py-3 rounded-xl font-bold text-sm bg-blue-600 text-white'>Apply Filter</button>
                </div>
              </div>
            )}
          </div>

          {/* Results List */}
          <div className='flex-1 overflow-y-auto p-5 pb-24 space-y-4 custom-scrollbar'>
            <h2 className='text-sm font-bold text-slate-500 uppercase tracking-widest mb-2'>Results</h2>
            
            {filteredBranches.map(branch => (
              <div key={branch.id} className='bg-white rounded-2xl overflow-hidden shadow-sm border border-slate-100 flex flex-col'>
                <div className='h-32 bg-slate-200 relative'>
                  {branch.branch_cover_photo ? (
                    <img src={branch.branch_cover_photo} alt={branch.branch_name} className='w-full h-full object-cover' />
                  ) : (
                    <div className='w-full h-full flex items-center justify-center text-slate-400'>Photo</div>
                  )}
                </div>
                
                <div className='p-4'>
                  <h3 className='text-lg font-black text-slate-800'>{branch.branch_name}</h3>
                  <p className='text-xs font-medium text-slate-500 mt-1 flex items-center gap-1'><FiMapPin /> {branch.branch_address || 'Address pending'}</p>
                  
                  <div className='mt-4 flex items-center justify-between'>
                    <p className='text-sm font-bold text-blue-700'>RM 200 - 300 <span className='text-[10px] text-slate-400 font-normal'>per session</span></p>
                    <button 
                      onClick={() => setSelectedBranch(branch)}
                      className='bg-blue-600 text-white px-5 py-2 rounded-xl text-xs font-bold shadow-md active:scale-95 transition-transform'
                    >
                      Book now
                    </button>
                  </div>
                </div>
              </div>
            ))}
            <p className='text-center text-xs font-bold text-slate-400 pt-4 pb-8'>- End of Search Result -</p>
          </div>
          
          <PatientBottomNav />
        </>
      )}

      {/* ========================================= */}
      {/* VIEW 2: BRANCH DETAIL & BOOKING (Wireframe P.3) */}
      {/* ========================================= */}
      {selectedBranch && (
        <div className='flex flex-col h-full w-full bg-slate-50 animate-in slide-in-from-right-8 duration-300 z-20 absolute inset-0'>
          
          {/* Detail Header */}
          <div className='bg-white px-5 pt-12 pb-4 shadow-sm flex items-center gap-3 shrink-0'>
            <button onClick={() => setSelectedBranch(null)} className='p-2 -ml-2 text-slate-600 hover:bg-slate-100 rounded-full transition-colors'>
              <FiChevronLeft className='text-2xl' />
            </button>
            <h1 className='text-lg font-black text-slate-800 truncate'>{selectedBranch.branch_name}</h1>
          </div>

          <div className='flex-1 overflow-y-auto pb-safe custom-scrollbar'>
            {/* Branch Photo */}
            <div className='h-48 bg-slate-200 w-full'>
              {selectedBranch.branch_cover_photo && <img src={selectedBranch.branch_cover_photo} className='w-full h-full object-cover' />}
            </div>

            <div className='p-5 bg-white mb-2 shadow-sm'>
              <h2 className='text-xl font-black text-slate-800'>{selectedBranch.branch_name}</h2>
              <p className='text-sm text-slate-500 mt-2 leading-relaxed'>{selectedBranch.branch_address}</p>
              <button className='text-blue-600 text-sm font-bold mt-2 flex items-center gap-1'>
                <FiMapPin /> View map
              </button>

              {/* Facilities & Staff (Wireframe match) */}
              <div className='mt-6 border-t border-slate-100 pt-4'>
                <h3 className='text-xs font-bold text-slate-400 uppercase tracking-widest mb-3'>Facilities</h3>
                <div className='flex gap-4 text-slate-600 text-2xl mb-4'>
                  <FaWheelchair title="Ramp" />
                  <FaParking title="Parking" />
                  <FiCoffee title="Food" />
                  <FiWifi title="Wifi" />
                </div>
                <p className='text-sm font-bold text-slate-700 flex items-center gap-2'>
                  <FiUsers className='text-blue-500' /> Staff capacity: {selectedBranch.total_machines || 8}
                </p>
              </div>
            </div>

            {/* Slot Availability Form */}
            <form onSubmit={handleBookingSubmit} className='p-5 bg-white shadow-sm mb-8'>
              <h3 className='text-lg font-black text-slate-800 mb-4'>Slot Availability</h3>
              
              <div className='mb-5'>
                <label className='block text-xs font-bold text-slate-500 uppercase mb-2'>Select Date</label>
                <input 
                  type="date" required min={minDateString}
                  value={bookingDate} onChange={e => setBookingDate(e.target.value)}
                  className='w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 font-bold text-slate-800'
                />
              </div>

              <div className='space-y-3 mb-8'>
                <label className='block text-xs font-bold text-slate-500 uppercase mb-2'>Select Shift</label>
                
                {/* Morning Shift Card */}
                <div className={`flex items-center justify-between p-4 rounded-xl border transition-all ${bookingShift.includes('8:00am') ? 'border-blue-500 bg-blue-50' : 'border-slate-200'}`}>
                  <div>
                    <p className='font-bold text-slate-800'>Morning Shift</p>
                    <p className='text-xs text-slate-500 flex items-center gap-1'><FiClock /> 8:00am - 12:00pm</p>
                    <p className='text-xs font-bold text-emerald-600 mt-1'>03 Slots Available</p>
                  </div>
                  <button 
                    type="button" onClick={() => setBookingShift('Morning (8:00am - 12:00pm)')}
                    className={`px-4 py-2 rounded-lg text-xs font-bold ${bookingShift.includes('8:00am') ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}
                  >
                    {bookingShift.includes('8:00am') ? 'Selected' : 'Select'}
                  </button>
                </div>

                {/* Afternoon Shift Card (Mocked as Full per wireframe) */}
                <div className='flex items-center justify-between p-4 rounded-xl border border-slate-200 bg-slate-50 opacity-60'>
                  <div>
                    <p className='font-bold text-slate-800'>Afternoon Shift</p>
                    <p className='text-xs text-slate-500 flex items-center gap-1'><FiClock /> 12:00pm - 4:00pm</p>
                    <p className='text-xs font-bold text-red-500 mt-1'>Full</p>
                  </div>
                  <button type="button" disabled className='px-4 py-2 rounded-lg text-xs font-bold bg-slate-200 text-slate-400'>
                    Full
                  </button>
                </div>
              </div>

              <button 
                type="submit" disabled={isSubmitting || !bookingShift || !bookingDate}
                className='w-full py-4 bg-blue-600 text-white rounded-2xl font-black text-lg shadow-lg disabled:bg-blue-300 transition-all flex justify-center'
              >
                {isSubmitting ? 'Processing...' : 'Submit Request'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ========================================= */}
      {/* VIEW 3: SUCCESS DIALOG (Wireframe Page 3) */}
      {/* ========================================= */}
      {showSuccessDialog && (
        <div className='absolute inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-5 animate-in fade-in'>
          <div className='bg-white w-full max-w-sm rounded-3xl p-8 shadow-2xl text-center animate-in zoom-in-95'>
            <FiCheckCircle className='text-6xl text-emerald-500 mx-auto mb-4' />
            <h3 className='text-xl font-black text-slate-800 mb-2'>Booking Request sent successfully</h3>
            <div className='inline-block bg-amber-100 text-amber-700 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest mb-6'>
              Pending Approval
            </div>
            <button 
              onClick={closeSuccessDialog}
              className='w-full py-3.5 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-xl font-bold transition-colors'
            >
              View Request Detail
            </button>
          </div>
        </div>
      )}

    </div>
  );
}