'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { useRouter } from 'next/navigation';
import PatientBottomNav from '../../../components/PatientBottomNav';

import { 
  FiSearch, FiMapPin, FiClock, FiChevronLeft, FiChevronRight, FiWifi, 
  FiTv, FiCoffee, FiUsers, FiFilter, FiCheckCircle, FiMaximize2, FiX, FiHome, 
  FiCrosshair, FiAlertCircle, FiPlus, FiTrash2, FiFileText, FiMap
} from 'react-icons/fi';
import { FaParking, FaWheelchair, FaMosque } from 'react-icons/fa';

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; 
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
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
  
  const [searchTerm, setSearchTerm] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [filterRegion, setFilterRegion] = useState<string | null>(null);
  const [filterShift, setFilterShift] = useState<string | null>(null);
  const [filterPrice, setFilterPrice] = useState<string | null>(null);
  const [filterFacilities, setFilterFacilities] = useState<string[]>([]);
  
  const [userLocation, setUserLocation] = useState<{lat: number, lng: number} | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  
  // --- NEW: Custom Address Geocoding States ---
  const [customAddress, setCustomAddress] = useState('');
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [locationLabel, setLocationLabel] = useState<string | null>(null);

  const [selectedBranch, setSelectedBranch] = useState<any>(null);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [showZoom, setShowZoom] = useState(false);
  
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
  const shifts = ['8am - 12pm', '12pm - 4pm', '5pm - 9pm'];
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
          const { data: patient } = await supabase
            .from('patients')
            .select('*')
            .eq('user_id', user.user_id)
            .single();
            
          if (patient) {
            setPatientId(patient.patient_id);
            setPatientHomeBranchId(patient.home_branch_id);
            setPatientRecord(patient);
          }
        }

        const { data: branchData } = await supabase.from('branches').select('*').order('branch_name', { ascending: true });
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

  useEffect(() => {
    if (!selectedBranch) {
      setCurrentPhotoIndex(0);
      setShowZoom(false);
      setDraftDate(minDateString);
      setDraftShift('');
      setSelectedSessions([]);
      setShowReviewScreen(false);
    }
  }, [selectedBranch, minDateString]);

  useEffect(() => {
    if (!selectedBranch || !draftDate) return;
    async function checkAvailability() {
      setIsCheckingSlots(true);
      try {
        const maxCapacity = selectedBranch.available_slots > 0 ? selectedBranch.available_slots : selectedBranch.total_machines || 8;
        const { data: existingBookings, error } = await supabase
          .from('bookings').select('booking_session_time')
          .eq('branch_id', selectedBranch.id).eq('booking_date', draftDate).neq('booking_status', 'Cancelled');

        if (error) throw error;

        const morningCount = existingBookings.filter(b => b.booking_session_time?.includes('Morning')).length;
        const afternoonCount = existingBookings.filter(b => b.booking_session_time?.includes('Afternoon')).length;

        const remMorning = Math.max(0, maxCapacity - morningCount);
        const remAfternoon = Math.max(0, maxCapacity - afternoonCount);

        setMorningSlots(remMorning);
        setAfternoonSlots(remAfternoon);

        if (draftShift.includes('Morning') && remMorning === 0) setDraftShift('');
        if (draftShift.includes('Afternoon') && remAfternoon === 0) setDraftShift('');
      } catch (err) {
        console.error("Error checking slots:", err);
      } finally {
        setIsCheckingSlots(false);
      }
    }
    checkAvailability();
  }, [selectedBranch, draftDate, draftShift]);

  // --- NEW: Geocoding Function for Custom Address ---
  const handleAddressSearch = async () => {
    if (!customAddress.trim()) return;
    
    setIsGeocoding(true);
    try {
      // Using free OpenStreetMap Nominatim API for geocoding
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(customAddress)}&limit=1`);
      const data = await response.json();
      
      if (data && data.length > 0) {
        setUserLocation({ lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) });
        setLocationLabel(customAddress);
        // We do NOT call applyFilters here. We let the user click "Apply Filter" to see results.
      } else {
        alert("Could not find this address. Please try adding a city or postal code.");
        setUserLocation(null);
        setLocationLabel(null);
      }
    } catch (error) {
      alert("Error finding location. Please try again.");
    } finally {
      setIsGeocoding(false);
    }
  };

  const handleGetLocation = () => {
    setIsLocating(true);
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({ lat: position.coords.latitude, lng: position.coords.longitude });
          setLocationLabel("Current GPS Location");
          setCustomAddress('');
          setIsLocating(false);
        },
        (error) => {
          alert("Location permission denied or unavailable.");
          setIsLocating(false);
        }
      );
    } else {
      alert("Geolocation is not supported by your browser.");
      setIsLocating(false);
    }
  };

  const toggleFacility = (facility: string) => {
    setFilterFacilities(prev => prev.includes(facility) ? prev.filter(f => f !== facility) : [...prev, facility]);
  };

  const applyFilters = () => {
    let result = [...branches];
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(b => b.branch_name.toLowerCase().includes(term) || (b.branch_address && b.branch_address.toLowerCase().includes(term)));
    }
    if (filterRegion) result = result.filter(b => b.branch_address && b.branch_address.toLowerCase().includes(filterRegion.toLowerCase()));
    
    if (filterFacilities.length > 0) {
      result = result.filter(b => {
        if (!b.amenities) return false;
        return filterFacilities.every(facility => b.amenities.some((a: string) => a.toLowerCase().includes(facility.toLowerCase())));
      });
    }

    if (filterPrice) {
      result = result.filter(b => {
        const price = b.session_price;
        if (!price) return false; 
        
        if (filterPrice === 'Under RM 200') return price < 200;
        if (filterPrice === 'RM 200 - RM 300') return price >= 200 && price <= 300;
        if (filterPrice === 'Above RM 300') return price > 300;
        return true;
      });
    }

    // --- SORTING LOGIC ---
    if (userLocation) {
      result = result.map(branch => {
        if (branch.latitude && branch.longitude) {
          branch.distance = calculateDistance(userLocation.lat, userLocation.lng, branch.latitude, branch.longitude);
        } else {
          branch.distance = 9999; 
        }
        return branch;
      }).sort((a, b) => a.distance - b.distance);
    } else {
      // If no location set, remove distance property so it doesn't show old distances
      result = result.map(branch => {
        const { distance, ...rest } = branch;
        return rest;
      });
    }

    setFilteredBranches(result);
    setShowFilters(false);
  };

  const resetFilters = () => {
    setFilterRegion(null); setFilterShift(null); setFilterPrice(null); setFilterFacilities([]);
    setSearchTerm(''); setUserLocation(null); setLocationLabel(null); setCustomAddress('');
    
    // Remove distances from original array before resetting
    const resetBranches = branches.map(branch => {
        const { distance, ...rest } = branch;
        return rest;
    });
    setFilteredBranches(resetBranches);
  };

  const uniquePhotos = selectedBranch ? [...new Set([selectedBranch.branch_cover_photo, ...(selectedBranch.gallery_photos || [])].filter(Boolean))] : [];
  const nextPhoto = (e?: React.MouseEvent) => { e?.stopPropagation(); if (uniquePhotos.length > 1) setCurrentPhotoIndex(prev => (prev + 1) % uniquePhotos.length); };
  const prevPhoto = (e?: React.MouseEvent) => { e?.stopPropagation(); if (uniquePhotos.length > 1) setCurrentPhotoIndex(prev => (prev - 1 + uniquePhotos.length) % uniquePhotos.length); };

  let isEligibleForSelectedDate = false;
  let expiryDateString = '';

  if (patientRecord?.last_serology_date && draftDate) {
    const serologyDate = new Date(patientRecord.last_serology_date);
    const expiryDate = new Date(serologyDate);
    expiryDate.setMonth(expiryDate.getMonth() + 6);
    expiryDateString = expiryDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

    const selectedBDate = new Date(draftDate);
    isEligibleForSelectedDate = patientRecord.travel_status === 'Active' && selectedBDate <= expiryDate;
  }

  let isMachineMatch = true;
  let patientMachine = patientRecord?.preferred_machine_model;
  let branchMachines = selectedBranch?.machine_models || [];

  if (patientMachine && selectedBranch) {
    isMachineMatch = branchMachines.includes(patientMachine);
  }

  let isShiftMatch = true;
  if (draftShift && patientRecord?.preferred_shift) {
    isShiftMatch = draftShift.includes(patientRecord.preferred_shift);
  }

  const addSessionToCart = () => {
    if (!draftDate || !draftShift) return;
    if (selectedSessions.some(s => s.date === draftDate)) {
      alert("You have already added a session for this date.");
      return;
    }
    setSelectedSessions([...selectedSessions, { date: draftDate, shift: draftShift }]);
    setDraftShift(''); 
  };

  const removeSessionFromCart = (dateToRemove: string) => {
    setSelectedSessions(selectedSessions.filter(s => s.date !== dateToRemove));
  };

  const handleFinalSubmit = async () => {
    if (selectedSessions.length === 0) return; 
    setIsSubmitting(true);
    
    try {
      const maxCapacity = selectedBranch.available_slots > 0 ? selectedBranch.available_slots : selectedBranch.total_machines || 8;

      for (const session of selectedSessions) {
        const shiftKeyword = session.shift.includes('Morning') ? 'Morning' : 'Afternoon';

        const { data: existingBookings, error: checkError } = await supabase
          .from('bookings')
          .select('id')
          .eq('branch_id', selectedBranch.id)
          .eq('booking_date', session.date)
          .like('booking_session_time', `%${shiftKeyword}%`)
          .neq('booking_status', 'Cancelled');

        if (checkError) throw checkError;

        const currentBookingsCount = existingBookings ? existingBookings.length : 0;

        if (currentBookingsCount >= maxCapacity) {
          alert(`Sorry, the ${shiftKeyword} slot for ${session.date} was just taken by another user. Please remove it from your cart and select another date.`);
          setIsSubmitting(false); 
          return; 
        }
      }

      const inserts = selectedSessions.map(session => ({
        patient_id: patientId,
        branch_id: selectedBranch.id,
        booking_date: session.date,
        booking_session_time: session.shift,
        booking_type: 'Travel',
        booking_status: 'Pending Approval'
      }));

      const { error } = await supabase.from('bookings').insert(inserts);
      if (error) throw error;
      
      setShowSuccessDialog(true);
    } catch (err: any) { 
      alert(`Failed to submit request: ${err.message || "Unknown error"}`); 
    } finally { 
      setIsSubmitting(false); 
    }
  };

  const closeSuccessDialog = () => { 
    setShowSuccessDialog(false); 
    setSelectedBranch(null); 
    setDraftDate(minDateString); 
    setDraftShift(''); 
    setSelectedSessions([]);
    router.push('/patient'); 
  };

  if (isLoading) {
    return (
      <div className='max-w-md mx-auto bg-slate-50 h-[100dvh] relative shadow-2xl font-sans overflow-hidden flex flex-col'>
        <div className='bg-white px-5 pt-12 pb-4 shadow-sm z-10 shrink-0'><h1 className='text-2xl font-black text-slate-800 tracking-tight mb-4'>Search Dialysis Centre</h1></div>
        <div className='flex-1 flex items-center justify-center text-blue-600 font-bold'><span className='animate-pulse'>Loading Centres...</span></div>
        <PatientBottomNav />
      </div>
    );
  }

  return (
    <div className='max-w-md mx-auto bg-slate-50 h-[100dvh] relative shadow-2xl font-sans overflow-hidden flex flex-col'>
      
      {!selectedBranch && (
        <>
          <div className='bg-white px-5 pt-12 pb-4 shadow-sm z-10 shrink-0'>
            <h1 className='text-xl font-black text-slate-800 tracking-tight mb-4'>Search Dialysis Centre</h1>
            <div className='flex gap-2'>
              <div className='relative flex-1'>
                <FiSearch className='absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-lg' />
                <input type="text" placeholder="Search clinic name" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className='w-full pl-12 pr-4 py-3 bg-slate-100 border-none rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-800 text-sm' />
              </div>
              <button onClick={() => setShowFilters(!showFilters)} className={`px-4 rounded-xl flex items-center justify-center transition-colors ${showFilters || filterRegion || filterShift || filterFacilities.length > 0 || filterPrice || userLocation ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                <FiFilter className='text-lg' />
              </button>
            </div>

            {showFilters && (
              <div className='mt-4 pt-4 border-t border-slate-100 animate-in slide-in-from-top-2 max-h-[60vh] overflow-y-auto custom-scrollbar'>
                <div className='flex justify-between items-center mb-4'>
                  <h3 className='font-bold text-slate-800'>Filter Options</h3>
                  <button onClick={resetFilters} className='text-xs font-bold text-slate-400 hover:text-red-500'>Reset All</button>
                </div>

                {/* --- NEW: DISTANCE SORTING SECTION --- */}
                <div className='mb-6 bg-slate-50 p-3 rounded-xl border border-slate-200'>
                  <p className='text-xs font-bold text-slate-800 flex items-center gap-1.5 mb-3'>
                    <FiMap className="text-blue-500"/> Sort by Distance
                  </p>
                  
                  {userLocation && locationLabel ? (
                    <div className='flex items-center justify-between bg-emerald-50 border border-emerald-200 p-2.5 rounded-lg mb-3'>
                      <div className='flex items-center gap-2 overflow-hidden'>
                        <FiCheckCircle className='text-emerald-500 shrink-0' />
                        <span className='text-xs font-bold text-emerald-700 truncate'>Using: {locationLabel}</span>
                      </div>
                      <button onClick={() => {setUserLocation(null); setLocationLabel(null);}} className='text-emerald-600 hover:text-emerald-800 ml-2'>
                        <FiX />
                      </button>
                    </div>
                  ) : (
                    <div className='space-y-3 mb-2'>
                      {/* Option 1: Temporary Address Input */}
                      <div className='flex gap-2'>
                        <input 
                          type="text" 
                          placeholder="Enter hotel or address..." 
                          value={customAddress}
                          onChange={(e) => setCustomAddress(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleAddressSearch()}
                          className='flex-1 px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-medium outline-none focus:border-blue-500'
                        />
                        <button 
                          onClick={handleAddressSearch}
                          disabled={!customAddress.trim() || isGeocoding}
                          className='bg-blue-600 text-white px-3 py-2 rounded-lg text-xs font-bold disabled:opacity-50'
                        >
                          {isGeocoding ? 'Finding...' : 'Set'}
                        </button>
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="h-px bg-slate-200 flex-1"></div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase">OR</span>
                        <div className="h-px bg-slate-200 flex-1"></div>
                      </div>

                      {/* Option 2: GPS Location */}
                      <button onClick={handleGetLocation} className='w-full py-2.5 rounded-lg flex items-center justify-center gap-2 font-bold text-xs bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 transition-all'>
                        <FiCrosshair className={isLocating ? 'animate-spin' : ''} />
                        {isLocating ? 'Finding GPS location...' : 'Use My Current GPS Location'}
                      </button>
                    </div>
                  )}
                </div>

                <div className='mb-5'>
                  <p className='text-xs font-bold text-slate-500 mb-2'>Region:</p>
                  <div className='flex flex-wrap gap-2'>
                    {regions.map(r => (
                      <button key={r} onClick={() => setFilterRegion(r)} className={`px-3 py-1.5 rounded-full text-xs font-bold border ${filterRegion === r ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200'}`}>{r}</button>
                    ))}
                  </div>
                </div>
                
                <div className='mb-5'>
                  <p className='text-xs font-bold text-slate-500 mb-2'>Facilities Needed:</p>
                  <div className='flex flex-wrap gap-2'>
                    {facilitiesList.map(f => (
                      <button key={f} onClick={() => toggleFacility(f)} className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors flex items-center gap-1.5 ${filterFacilities.includes(f) ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200'}`}>
                        {renderFacilityIcon(f, filterFacilities.includes(f) ? "text-white" : "text-blue-500")} {f}
                      </button>
                    ))}
                  </div>
                </div>

                <div className='mb-5'>
                  <p className='text-xs font-bold text-slate-500 mb-2'>Estimated Price Range:</p>
                  <div className='flex flex-wrap gap-2'>
                    {priceRanges.map(p => (
                      <button key={p} onClick={() => setFilterPrice(p)} className={`px-3 py-1.5 rounded-full text-xs font-bold border ${filterPrice === p ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200'}`}>{p}</button>
                    ))}
                  </div>
                </div>

                <div className='flex gap-2 sticky bottom-0 bg-white pt-2 pb-2'>
                  <button onClick={() => setShowFilters(false)} className='flex-1 py-3 rounded-xl font-bold text-sm bg-slate-100 text-slate-600'>Cancel</button>
                  <button onClick={applyFilters} className='flex-1 py-3 rounded-xl font-bold text-sm bg-blue-600 text-white shadow-md'>Show Results</button>
                </div>
              </div>
            )}
          </div>

          <div className='flex-1 overflow-y-auto p-5 pb-24 space-y-4 custom-scrollbar'>
            <div className='flex justify-between items-end mb-2'>
              <h2 className='text-sm font-bold text-slate-500 uppercase tracking-widest'>Results</h2>
              {userLocation && <span className='text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-1 rounded-full'>Sorted by distance</span>}
            </div>
            
            {filteredBranches.map(branch => {
              const isHomeBranch = branch.id === patientHomeBranchId;

              return (
                <div key={branch.id} className={`bg-white rounded-2xl overflow-hidden shadow-sm border ${isHomeBranch ? 'border-amber-200 bg-amber-50/30' : 'border-slate-100'} flex flex-col`}>
                  <div className='h-32 bg-slate-200 relative'>
                    {branch.branch_cover_photo ? (
                      <img src={branch.branch_cover_photo} alt={branch.branch_name} className={`w-full h-full object-cover ${isHomeBranch ? 'opacity-80' : ''}`} />
                    ) : (
                      <div className='w-full h-full flex items-center justify-center text-slate-400'>Photo</div>
                    )}
                    
                    <div className='absolute top-3 left-3 flex flex-col gap-1'>
                      {branch.distance !== undefined && branch.distance < 9999 && (
                        <div className='bg-black/70 backdrop-blur-md text-white text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-1.5 shadow-md border border-white/20'>
                          <FiMapPin className="text-emerald-400" /> {branch.distance.toFixed(1)} km away
                        </div>
                      )}
                    </div>

                    {isHomeBranch && (
                      <div className='absolute top-3 right-3 bg-amber-100 text-amber-800 text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full shadow-sm flex items-center gap-1.5'>
                        <FiHome /> Home Centre
                      </div>
                    )}
                  </div>
                  <div className='p-4'>
                    <h3 className='text-lg font-black text-slate-800'>{branch.branch_name}</h3>
                    <p className='text-xs font-medium text-slate-500 mt-1 flex items-center gap-1 line-clamp-1'><FiMapPin className="shrink-0" /> {branch.branch_address}</p>
                    
                    {branch.amenities && branch.amenities.length > 0 && (
                      <div className='flex gap-1.5 mt-3 overflow-hidden'>
                         {branch.amenities.slice(0, 3).map((amn: string, idx: number) => (
                           <span key={idx} className='bg-slate-100 text-slate-500 text-[9px] font-bold px-2 py-1 rounded-md flex items-center gap-1 whitespace-nowrap'>
                             {renderFacilityIcon(amn, "text-blue-500")}
                             {amn}
                           </span>
                         ))}
                         {branch.amenities.length > 3 && <span className='bg-slate-100 text-slate-500 text-[9px] font-bold px-2 py-1 rounded-md'>+{branch.amenities.length - 3}</span>}
                      </div>
                    )}

                    <div className='mt-4 flex items-center justify-between'>
                      <p className='text-sm font-bold text-blue-700'>{branch.session_price ? `RM ${branch.session_price}` : 'Price TBC'} <span className='text-[10px] text-slate-400 font-normal'> / session</span></p>
                      {isHomeBranch ? (
                        <button disabled className='bg-slate-100 text-slate-400 border border-slate-200 px-5 py-2 rounded-xl text-xs font-bold cursor-not-allowed'>Your Centre</button>
                      ) : (
                        <button onClick={() => setSelectedBranch(branch)} className='bg-blue-600 text-white px-5 py-2 rounded-xl text-xs font-bold shadow-md active:scale-95 transition-transform'>Book now</button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            <p className='text-center text-xs font-bold text-slate-400 pt-4 pb-8'>- End of Search Result -</p>
          </div>
          <PatientBottomNav />
        </>
      )}

      {/* Rest of the component (View 2 & 3) remains exactly the same as your code */}
      {selectedBranch && !showReviewScreen && (
         <div className='flex flex-col h-full w-full bg-slate-50 animate-in slide-in-from-right-8 duration-300 z-20 absolute inset-0'>
         {/* ... (Kept identical to prevent you having to copy-paste too much) ... */}
         <div className='bg-white px-5 pt-12 pb-4 shadow-sm flex items-center gap-3 shrink-0'>
            <button onClick={() => setSelectedBranch(null)} className='p-2 -ml-2 text-slate-600 hover:bg-slate-100 rounded-full transition-colors'>
              <FiChevronLeft className='text-2xl' />
            </button>
            <h1 className='text-lg font-black text-slate-800 truncate'>{selectedBranch.branch_name}</h1>
          </div>
          <div className='flex-1 overflow-y-auto pb-safe custom-scrollbar'>
            
            <div className='h-56 bg-slate-900 w-full relative overflow-hidden group'>
              {uniquePhotos.length > 0 ? (
                <>
                  <div className='flex w-full h-full transition-transform duration-500 ease-in-out' style={{ transform: `translateX(-${currentPhotoIndex * 100}%)` }}>
                    {uniquePhotos.map((photo, i) => <img key={i} src={photo} className='min-w-full h-full object-cover flex-shrink-0' />)}
                  </div>
                  
                  <div className='absolute inset-0 flex'>
                    <button onClick={prevPhoto} className='w-1/4 h-full flex items-center justify-start pl-2 text-white/0 hover:text-white/80 transition-colors z-10'>{uniquePhotos.length > 1 && <FiChevronLeft className='text-3xl drop-shadow-lg' />}</button>
                    <button onClick={() => setShowZoom(true)} className='flex-1 h-full flex flex-col items-center justify-center opacity-0 hover:opacity-100 transition-opacity z-10'><div className='bg-black/40 p-3 rounded-full text-white backdrop-blur-sm shadow-xl'><FiMaximize2 className='text-2xl' /></div></button>
                    <button onClick={nextPhoto} className='w-1/4 h-full flex items-center justify-end pr-2 text-white/0 hover:text-white/80 transition-colors z-10'>{uniquePhotos.length > 1 && <FiChevronRight className='text-3xl drop-shadow-lg' />}</button>
                  </div>

                  {uniquePhotos.length > 1 && (
                    <div className='absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5 shadow-sm z-10'>
                      {uniquePhotos.map((_, i) => <div key={i} className={`h-1.5 rounded-full transition-all duration-300 ${i === currentPhotoIndex ? 'w-4 bg-white' : 'w-1.5 bg-white/50'}`} />)}
                    </div>
                  )}
                </>
              ) : (
                <div className='w-full h-full flex items-center justify-center text-slate-500 font-bold'>No Photos Available</div>
              )}
            </div>

            <div className='p-5 bg-white mb-2 shadow-sm border-b border-slate-100'>
              <h2 className='text-xl font-black text-slate-800'>{selectedBranch.branch_name}</h2>
              <p className='text-sm text-slate-500 mt-2 leading-relaxed'>{selectedBranch.branch_address}</p>
              
              <div className='flex justify-between items-center mt-2'>
                <button type="button" onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=$$${encodeURIComponent(selectedBranch.branch_name + ' ' + selectedBranch.branch_address)}`, '_blank')} className='text-blue-600 text-sm font-bold flex items-center gap-1 hover:text-blue-800 transition-colors'>
                  <FiMapPin /> View map
                </button>
                {selectedBranch.distance && <span className='text-xs font-bold text-slate-400'>{selectedBranch.distance.toFixed(1)} km away</span>}
              </div>

              <div className='mt-6 border-t border-slate-100 pt-4'>
                <h3 className='text-xs font-bold text-slate-400 uppercase tracking-widest mb-3'>Facilities & Pricing</h3>
                
                <div className='mb-4 p-3 bg-blue-50 border border-blue-100 rounded-xl'>
                  <p className='text-xs font-bold text-blue-600 uppercase tracking-widest mb-1'>Estimated Session Cost</p>
                  <p className='text-lg font-black text-slate-800'>{selectedBranch.session_price ? `RM ${selectedBranch.session_price}` : 'TBC'}</p>
                </div>

                <div className='flex flex-wrap gap-2 mb-4'>
                  {selectedBranch.amenities && selectedBranch.amenities.length > 0 ? (
                    selectedBranch.amenities.map((amn: string, idx: number) => (
                      <span key={idx} className='bg-slate-50 text-slate-600 border border-slate-200 text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5'>
                        {renderFacilityIcon(amn, "text-blue-500")}
                        {amn}
                      </span>
                    ))
                  ) : (
                    <span className='text-sm text-slate-400'>Standard clinical facilities</span>
                  )}
                </div>
                <p className='text-sm font-bold text-slate-700 flex items-center gap-2'><FiUsers className='text-blue-500' /> Staff capacity: {selectedBranch.total_machines || 8}</p>
              </div>
            </div>

            {selectedSessions.length > 0 && (
              <div className='px-5 py-4 bg-slate-800 text-white mx-5 mt-4 mb-2 rounded-2xl shadow-lg'>
                <div className='flex justify-between items-center mb-3'>
                  <h3 className='text-sm font-black'>Sessions in Cart</h3>
                  <span className='bg-blue-600 text-white px-2 py-0.5 rounded-full text-xs font-bold'>{selectedSessions.length}</span>
                </div>
                <div className='space-y-2 mb-4 max-h-32 overflow-y-auto custom-scrollbar pr-2'>
                  {selectedSessions.map((s, idx) => (
                    <div key={idx} className='flex justify-between items-center bg-slate-700/50 p-2.5 rounded-xl border border-slate-600'>
                      <div>
                        <p className='text-sm font-black'>{new Date(s.date).toLocaleDateString('en-GB')}</p>
                        <p className='text-[10px] font-bold text-slate-300 uppercase'>{s.shift.split('(')[0]}</p>
                      </div>
                      <button onClick={() => removeSessionFromCart(s.date)} className='p-2 text-red-400 hover:text-red-300 transition-colors'><FiTrash2 /></button>
                    </div>
                  ))}
                </div>
                <button onClick={() => setShowReviewScreen(true)} className='w-full py-3 bg-blue-600 text-white rounded-xl font-bold shadow-md hover:bg-blue-500 transition-colors'>
                  Proceed to Review
                </button>
              </div>
            )}

            <div className='p-5 bg-white shadow-sm mb-8 mt-2'>
              <div className='flex justify-between items-center mb-4'>
                <h3 className='text-lg font-black text-slate-800'>Add Session</h3>
                {isCheckingSlots && <span className='text-[10px] font-bold text-blue-500 animate-pulse bg-blue-50 px-2 py-1 rounded-full'>Updating...</span>}
              </div>

              {patientMachine && (
                <div className={`mb-5 p-4 rounded-xl border flex items-start gap-3 ${isMachineMatch ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
                  {isMachineMatch ? <FiCheckCircle className='text-emerald-600 text-xl shrink-0 mt-0.5' /> : <FiAlertCircle className='text-amber-600 text-xl shrink-0 mt-0.5' />}
                  <div>
                    <h4 className={`text-sm font-black ${isMachineMatch ? 'text-emerald-800' : 'text-amber-800'}`}>
                      {isMachineMatch ? 'Machine Match: Compatible' : 'Prescription Adjustment Required'}
                    </h4>
                    <p className={`text-xs font-bold mt-1 leading-relaxed ${isMachineMatch ? 'text-emerald-700' : 'text-amber-700'}`}>
                      {isMachineMatch 
                        ? `This centre operates your preferred ${patientMachine} machines. Your prescription can be transferred seamlessly.` 
                        : `You normally use ${patientMachine}, but this centre operates ${branchMachines.join(', ')}. The Head Nurse will need to review and adjust your prescription upon arrival.`}
                    </p>
                  </div>
                </div>
              )}

              {!isEligibleForSelectedDate && (
                <div className='mb-5 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3'>
                  <FiAlertCircle className='text-red-600 text-xl shrink-0 mt-0.5' />
                  <div>
                    <h4 className='text-sm font-black text-red-800'>Date Invalid</h4>
                    <p className='text-xs font-bold text-red-600 mt-1 leading-relaxed'>
                      Your Serology report expires (or expired) on <strong>{expiryDateString}</strong>, which is before your selected date. Please choose an earlier date or update your records.
                    </p>
                  </div>
                </div>
              )}
              
              <div className='mb-5'>
                <label className='block text-xs font-bold text-slate-500 uppercase mb-2'>Select Date</label>
                <input type="date" min={minDateString} value={draftDate} onChange={e => setDraftDate(e.target.value)} className='w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 font-bold text-slate-800' />
                <p className='text-[10px] font-bold text-blue-600 mt-2 opacity-70'>*Travel bookings require minimum 14 days advance notice.</p>
              </div>

              <div className='space-y-3 mb-5 relative'>
                <div className={`flex items-center justify-between p-4 rounded-xl border transition-all ${!isEligibleForSelectedDate || morningSlots === 0 ? 'bg-slate-50 border-slate-100 opacity-60' : draftShift.includes('Morning') ? 'border-blue-500 bg-blue-50 shadow-sm' : 'border-slate-200'}`}>
                  <div>
                    <p className={`font-bold ${!isEligibleForSelectedDate || morningSlots === 0 ? 'text-slate-400' : 'text-slate-800'}`}>Morning Shift</p>
                    <p className='text-xs text-slate-500 flex items-center gap-1'><FiClock /> 8:00am - 12:00pm</p>
                    <p className={`text-xs font-bold mt-1 ${morningSlots > 0 && isEligibleForSelectedDate ? 'text-emerald-600' : 'text-red-500'}`}>{morningSlots > 0 ? `${morningSlots < 10 ? '0'+morningSlots : morningSlots} Slots Available` : 'Full (No Slots)'}</p>
                  </div>
                  <button type="button" disabled={!isEligibleForSelectedDate || morningSlots === 0} onClick={() => setDraftShift('Morning (08:00 - 12:00)')} className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors ${!isEligibleForSelectedDate || morningSlots === 0 ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : draftShift.includes('Morning') ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                    {draftShift.includes('Morning') ? 'Selected' : 'Select'}
                  </button>
                </div>

                <div className={`flex items-center justify-between p-4 rounded-xl border transition-all ${!isEligibleForSelectedDate || afternoonSlots === 0 ? 'bg-slate-50 border-slate-100 opacity-60' : draftShift.includes('Afternoon') ? 'border-blue-500 bg-blue-50 shadow-sm' : 'border-slate-200'}`}>
                  <div>
                    <p className={`font-bold ${!isEligibleForSelectedDate || afternoonSlots === 0 ? 'text-slate-400' : 'text-slate-800'}`}>Afternoon Shift</p>
                    <p className='text-xs text-slate-500 flex items-center gap-1'><FiClock /> 12:00pm - 4:00pm</p>
                    <p className={`text-xs font-bold mt-1 ${afternoonSlots > 0 && isEligibleForSelectedDate ? 'text-amber-600' : 'text-red-500'}`}>{afternoonSlots > 0 ? `${afternoonSlots < 10 ? '0'+afternoonSlots : afternoonSlots} Slots Available` : 'Full (No Slots)'}</p>
                  </div>
                  <button type="button" disabled={!isEligibleForSelectedDate || afternoonSlots === 0} onClick={() => setDraftShift('Afternoon (12:00 - 16:00)')} className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors ${!isEligibleForSelectedDate || afternoonSlots === 0 ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : draftShift.includes('Afternoon') ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                    {draftShift.includes('Afternoon') ? 'Selected' : 'Select'}
                  </button>
                </div>
              </div>

              {!isShiftMatch && draftShift && (
                <div className='mb-5 p-4 rounded-xl border bg-amber-50 border-amber-200 flex items-start gap-3'>
                  <FiAlertCircle className='text-amber-600 text-xl shrink-0 mt-0.5' />
                  <div>
                    <h4 className='text-sm font-black text-amber-800'>Shift Time Altered</h4>
                    <p className='text-xs font-bold mt-1 leading-relaxed text-amber-700'>
                      You usually dialyze in the <strong>{patientRecord?.preferred_shift}</strong>. Booking a different shift changes your fluid accumulation interval. Please monitor your fluid intake strictly.
                    </p>
                  </div>
                </div>
              )}

              <button 
                type="button" 
                onClick={addSessionToCart}
                disabled={!draftShift || !draftDate || !isEligibleForSelectedDate} 
                className='w-full py-4 bg-slate-100 text-blue-600 border-2 border-blue-100 rounded-2xl font-black text-sm hover:bg-blue-50 hover:border-blue-200 disabled:bg-slate-100 disabled:text-slate-400 disabled:border-slate-200 transition-all flex justify-center items-center gap-2'
              >
                <FiPlus /> Add Session to Cart
              </button>
            </div>
          </div>
         </div>
      )}

      {showReviewScreen && (
        <div className='flex flex-col h-full w-full bg-slate-50 animate-in slide-in-from-right-8 duration-300 z-30 absolute inset-0'>
          <div className='bg-white px-5 pt-12 pb-4 shadow-sm flex items-center justify-between shrink-0 border-b border-slate-100'>
            <button onClick={() => setShowReviewScreen(false)} className='p-2 -ml-2 text-slate-600 hover:bg-slate-100 rounded-full flex items-center gap-1 font-bold text-sm transition-colors'>
              <FiChevronLeft className='text-2xl' /> Edit
            </button>
            <h1 className='text-lg font-black text-slate-800'>Review Request</h1>
            <div className='w-14' />
          </div>

          <div className='flex-1 overflow-y-auto p-5 pb-safe custom-scrollbar space-y-6'>
            
            <div className='bg-white p-5 rounded-2xl shadow-sm border border-slate-100'>
              <p className='text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1'>Target Clinic</p>
              <h2 className='text-lg font-black text-slate-800'>{selectedBranch.branch_name}</h2>
              <p className='text-xs font-bold text-slate-500 mt-1 flex items-center gap-1'><FiMapPin /> {selectedBranch.branch_address}</p>
            </div>

            <div className='bg-white p-5 rounded-2xl shadow-sm border border-slate-100'>
              <p className='text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 border-b border-slate-100 pb-3'>Schedule Breakdown ({selectedSessions.length} Sessions)</p>
              <div className='space-y-4'>
                {selectedSessions.map((s, i) => (
                  <div key={i} className='flex justify-between items-center'>
                    <div className='flex items-center gap-3'>
                      <div className='w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center font-black text-xs'>{i+1}</div>
                      <div>
                        <p className='text-sm font-black text-slate-800'>{new Date(s.date).toLocaleDateString('en-GB', {weekday: 'short', day: 'numeric', month: 'short'})}</p>
                        <p className='text-[10px] font-bold text-slate-500 uppercase'>{s.shift.split('(')[0]}</p>
                      </div>
                    </div>
                    {selectedBranch.session_price && <p className='text-sm font-bold text-slate-600'>RM {selectedBranch.session_price}</p>}
                  </div>
                ))}
              </div>
            </div>

            <div className='bg-blue-600 text-white p-6 rounded-2xl shadow-md'>
              <div className='flex justify-between items-center border-b border-blue-500 pb-4 mb-4'>
                <p className='text-sm font-bold text-blue-100'>Total Estimated Cost</p>
                <p className='text-2xl font-black'>{selectedBranch.session_price ? `RM ${selectedBranch.session_price * selectedSessions.length}` : 'TBC'}</p>
              </div>
              <p className='text-[10px] font-medium text-blue-200 leading-relaxed text-justify'>
                *This is an estimate. Final billing will be handled directly by the clinic. Payment can be made via Cash, Panel, or Guarantee Letter (GL) upon arrival at the center.
              </p>
            </div>

            <div className='bg-amber-50 border border-amber-200 p-5 rounded-2xl'>
              <h4 className='text-xs font-black text-amber-800 uppercase tracking-widest flex items-center gap-1.5 mb-2'>
                <FiFileText className='text-lg' /> Document Requirement
              </h4>
              <p className='text-xs font-bold text-amber-700 leading-relaxed text-justify'>
                By submitting this request, you agree to ensure your <strong>Serology Report</strong> and <strong>Doctor's Referral Letter</strong> are uploaded to your Profile page before your travel dates. The Branch Manager will review these documents before approving your slots.
              </p>
            </div>

            <button 
              onClick={handleFinalSubmit} 
              disabled={isSubmitting} 
              className='w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-base shadow-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all'
            >
              {isSubmitting ? 'Submitting to Manager...' : 'Confirm & Submit Request'}
            </button>
          </div>
        </div>
      )}

      {showZoom && uniquePhotos.length > 0 && (
        <div className='fixed inset-0 z-[100] bg-black/95 flex flex-col items-center justify-center animate-in fade-in'>
          <button onClick={() => setShowZoom(false)} className='absolute top-safe right-4 p-3 bg-white/10 hover:bg-white/20 rounded-full text-white backdrop-blur-md transition-colors z-50'><FiX className='text-2xl' /></button>
          <div className='w-full h-[70vh] relative overflow-hidden'>
            <div className='flex w-full h-full transition-transform duration-500 ease-in-out' style={{ transform: `translateX(-${currentPhotoIndex * 100}%)` }}>
              {uniquePhotos.map((photo, i) => <img key={i} src={photo} className='min-w-full h-full object-contain flex-shrink-0' />)}
            </div>
          </div>
          {uniquePhotos.length > 1 && (
            <div className='absolute bottom-10 left-1/2 -translate-x-1/2 flex items-center justify-between w-[280px] z-50'>
              <button onClick={prevPhoto} className='w-14 h-14 flex items-center justify-center bg-white/10 hover:bg-white/30 border border-white/20 text-white rounded-full backdrop-blur-md transition-colors shadow-lg'><FiChevronLeft className='text-4xl -ml-1' /></button>
              <div className='text-white font-bold tracking-widest text-sm bg-black/50 px-5 py-2.5 rounded-full backdrop-blur-md border border-white/10'>{currentPhotoIndex + 1} / {uniquePhotos.length}</div>
              <button onClick={nextPhoto} className='w-14 h-14 flex items-center justify-center bg-white/10 hover:bg-white/30 border border-white/20 text-white rounded-full backdrop-blur-md transition-colors shadow-lg'><FiChevronRight className='text-4xl ml-1' /></button>
            </div>
          )}
        </div>
      )}

      {showSuccessDialog && (
        <div className='absolute inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-5 animate-in fade-in'>
          <div className='bg-white w-full max-w-sm rounded-3xl p-8 shadow-2xl text-center animate-in zoom-in-95'>
            <FiCheckCircle className='text-6xl text-emerald-500 mx-auto mb-4' />
            <h3 className='text-xl font-black text-slate-800 mb-2'>Booking Submitted!</h3>
            <p className='text-sm font-bold text-slate-500 mb-6'>{selectedSessions.length} sessions sent for approval.</p>
            <div className='inline-block bg-amber-100 text-amber-700 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest mb-6'>Pending Manager Approval</div>
            <button onClick={closeSuccessDialog} className='w-full py-3.5 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-xl font-bold transition-colors'>Return to Dashboard</button>
          </div>
        </div>
      )}
    </div>
  );
}