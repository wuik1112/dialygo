'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { useRouter } from 'next/navigation';
import { useLoadScript, Autocomplete } from '@react-google-maps/api';
import PatientBottomNav from '../../../components/PatientBottomNav';

import { 
  FiSearch, FiMapPin, FiClock, FiChevronLeft, FiChevronRight, FiWifi, 
  FiTv, FiCoffee, FiUsers, FiFilter, FiCheckCircle, FiMaximize2, FiX, FiHome, 
  FiCrosshair, FiAlertCircle, FiPlus, FiTrash2, FiFileText, FiNavigation, FiActivity
} from 'react-icons/fi';
import { FaParking, FaWheelchair, FaMosque } from 'react-icons/fa';

const libraries: any = ['places'];

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
  const [userId, setUserId] = useState<number | null>(null);
  const [patientId, setPatientId] = useState<number | null>(null);
  const [patientHomeBranchId, setPatientHomeBranchId] = useState<number | null>(null);
  const [patientRecord, setPatientRecord] = useState<any>(null);
  
  // --- SEARCH & FILTER STATES ---
  const [searchTerm, setSearchTerm] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [filterRegion, setFilterRegion] = useState<string | null>(null);
  const [filterPrice, setFilterPrice] = useState<string | null>(null);
  const [filterFacilities, setFilterFacilities] = useState<string[]>([]);
  
  // --- GOOGLE MAPS STATES ---
  const [locationQuery, setLocationQuery] = useState('');
  const [hasSearchedLocation, setHasSearchedLocation] = useState(false);
  const [isCalculating, setIsCalculating] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [autocomplete, setAutocomplete] = useState<google.maps.places.Autocomplete | null>(null);

  const { isLoaded, loadError } = useLoadScript({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY as string,
    libraries: libraries,
  });

  // --- DYNAMIC BOOKING RULES STATE ---
  const [advanceNoticeDays, setAdvanceNoticeDays] = useState(14);
  const [minDateString, setMinDateString] = useState('');
  
  // --- BOOKING STATES ---
  const [selectedBranch, setSelectedBranch] = useState<any>(null);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [showZoom, setShowZoom] = useState(false);

  const [draftDate, setDraftDate] = useState('');
  const [draftShift, setDraftShift] = useState('');
  const [selectedSessions, setSelectedSessions] = useState<{date: string, shift: string}[]>([]);
  const [showReviewScreen, setShowReviewScreen] = useState(false);

  // --- ADVANCED BOOKING STATES (Locks & Conflicts) ---
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [lockedBookings, setLockedBookings] = useState<any[]>([]);
  const [homeConflicts, setHomeConflicts] = useState<string[]>([]);

  const [morningSlots, setMorningSlots] = useState(0);
  const [afternoonSlots, setAfternoonSlots] = useState(0);
  const [eveningSlots, setEveningSlots] = useState(0);
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
          setUserId(user.user_id);
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

        const { data: rulesData } = await supabase.from('rules').select('*');
        let advanceDays = 14; 
        if (rulesData) {
          const advanceRule = rulesData.find(r => r.rule_name === 'Advance Booking Window');
          if (advanceRule && advanceRule.rule_value) {
            advanceDays = parseInt(advanceRule.rule_value);
          }
        }
        
        setAdvanceNoticeDays(advanceDays);
        const dynamicMinDate = new Date();
        dynamicMinDate.setDate(dynamicMinDate.getDate() + advanceDays);
        const formattedMin = dynamicMinDate.toISOString().split('T')[0];
        
        setMinDateString(formattedMin);
        setDraftDate(formattedMin);

      } catch (err) {
        console.error("Failed to load branches");
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, []);

  // --- GOOGLE MAPS INTEGRATION ---
  const onLoad = (autoC: google.maps.places.Autocomplete) => {
    setAutocomplete(autoC);
  };

  const onPlaceChanged = () => {
    if (autocomplete !== null) {
      const place = autocomplete.getPlace();
      const address = place.formatted_address || place.name;
      if (address) {
        setLocationQuery(address);
        calculateDistances(address);
      }
    }
  };

  const calculateDistances = async (origin: string | google.maps.LatLng) => {
    setIsCalculating(true);
    try {
      const service = new google.maps.DistanceMatrixService();
      const destAddresses = branches.map(b => b.branch_address);
      
      const chunks = [];
      for (let i = 0; i < destAddresses.length; i += 25) {
        chunks.push(destAddresses.slice(i, i + 25));
      }

      let allElements: any[] = [];
      for (const chunk of chunks) {
        const response = await service.getDistanceMatrix({
          origins: [origin],
          destinations: chunk,
          travelMode: google.maps.TravelMode.DRIVING,
        });
        if (response && response.rows[0]) {
          allElements = allElements.concat(response.rows[0].elements);
        }
      }

      const mappedBranches = branches.map((b, idx) => {
        const element = allElements[idx];
        if (element && element.status === 'OK') {
          return {
            ...b,
            distanceValue: element.distance.value,
            distanceText: element.distance.text,   
            durationText: element.duration.text    
          };
        }
        return { ...b, distanceValue: Infinity, distanceText: 'N/A', durationText: 'N/A' };
      });

      mappedBranches.sort((a, b) => a.distanceValue - b.distanceValue);
      setBranches(mappedBranches);
      applyFiltersOnList(mappedBranches);
      setHasSearchedLocation(true);

    } catch (error) {
      console.error("Distance calculation failed", error);
      alert("Unable to calculate driving distances. Please check the address.");
    } finally {
      setIsCalculating(false);
    }
  };

  const handleGetLocation = () => {
    setIsLocating(true);
    if ("geolocation" in navigator && window.google) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const latLng = new google.maps.LatLng(position.coords.latitude, position.coords.longitude);
          setLocationQuery('My Current GPS Location');
          calculateDistances(latLng);
          setIsLocating(false);
          setShowFilters(false);
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

  // --- FILTERING LOGIC ---
  const toggleFacility = (facility: string) => {
    setFilterFacilities(prev => prev.includes(facility) ? prev.filter(f => f !== facility) : [...prev, facility]);
  };

  const applyFiltersOnList = (listToFilter: any[]) => {
    let result = [...listToFilter];
    
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

    setFilteredBranches(result);
  };

  const applyFilters = () => {
    applyFiltersOnList(branches);
    setShowFilters(false);
  };

  useEffect(() => {
    applyFiltersOnList(branches);
  }, [searchTerm]);

  const resetFilters = () => {
    setFilterRegion(null); setFilterPrice(null); setFilterFacilities([]);
    setSearchTerm(''); setLocationQuery(''); setHasSearchedLocation(false);
    
    const resetBranches = [...branches].map(b => ({
      ...b, distanceValue: null, distanceText: null, durationText: null
    }));
    setBranches(resetBranches);
    setFilteredBranches(resetBranches);
  };

  // --- BOOKING LOGIC ---
  useEffect(() => {
    if (!selectedBranch) {
      setCurrentPhotoIndex(0); setShowZoom(false); 
      setDraftDate(minDateString);
      setDraftShift(''); setSelectedSessions([]); setShowReviewScreen(false);
    }
  }, [selectedBranch, minDateString]);

  useEffect(() => {
    if (!selectedBranch || !draftDate) return;
    async function checkAvailability() {
      setIsCheckingSlots(true);
      try {
        const maxCapacity = selectedBranch.total_machines || 8;
        const { data: existingBookings, error } = await supabase
          .from('bookings').select('booking_session_time')
          .eq('branch_id', selectedBranch.id).eq('booking_date', draftDate).neq('booking_status', 'Cancelled');

        if (error) throw error;

        const morningCount = existingBookings.filter(b => b.booking_session_time?.includes('Morning')).length;
        const afternoonCount = existingBookings.filter(b => b.booking_session_time?.includes('Afternoon')).length;
        const eveningCount = existingBookings.filter(b => b.booking_session_time?.includes('Evening')).length;

        const remMorning = Math.max(0, maxCapacity - morningCount);
        const remAfternoon = Math.max(0, maxCapacity - afternoonCount);
        const remEvening = Math.max(0, maxCapacity - eveningCount);

        setMorningSlots(remMorning);
        setAfternoonSlots(remAfternoon);
        setEveningSlots(remEvening);

        if (draftShift.includes('Morning') && remMorning === 0) setDraftShift('');
        if (draftShift.includes('Afternoon') && remAfternoon === 0) setDraftShift('');
        if (draftShift.includes('Evening') && remEvening === 0) setDraftShift('');
      } catch (err) {
        console.error("Error checking slots:", err);
      } finally {
        setIsCheckingSlots(false);
      }
    }
    checkAvailability();
  }, [selectedBranch, draftDate, draftShift]);

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

  // =========================================================
  // STEP 1: PESSIMISTIC LOCKING & HOME CONFLICT DETECTION
  // =========================================================
  const handleProceedToReview = async () => {
    if (selectedSessions.length === 0) return;
    setIsSubmitting(true);

    try {
      const maxCapacity = selectedBranch.total_machines || 8;

      // 1. Concurrency Check before Locking
      for (const session of selectedSessions) {
        const shiftKeyword = session.shift.includes('Morning') ? 'Morning' : session.shift.includes('Afternoon') ? 'Afternoon' : 'Evening';
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
          alert(`Concurrency Alert: The ${shiftKeyword} slot for ${session.date} was just taken by another user. Please remove it from your cart and select another date.`);
          setIsSubmitting(false); 
          return; 
        }
      }

      // 2. Acquire Temporary Lock 
      const inserts = selectedSessions.map(session => ({
        patient_id: patientId,
        branch_id: selectedBranch.id,
        booking_date: session.date,
        booking_session_time: session.shift,
        booking_type: 'Travel',
        booking_status: 'Locked_Temporary'
      }));

      const { data: lockedData, error: lockError } = await supabase.from('bookings').insert(inserts).select();
      if (lockError) throw lockError;
      setLockedBookings(lockedData || []);

      // 3. Home Schedule Conflict Check
      const { data: existingHomeBookings } = await supabase
        .from('bookings')
        .select('booking_date')
        .eq('patient_id', patientId)
        .eq('booking_type', 'Home')
        .neq('booking_status', 'Cancelled');

      const explicitHomeDates = existingHomeBookings?.map(b => b.booking_date) || [];
      const pattern = patientRecord?.schedule_pattern;

      const conflicts = selectedSessions.filter(s => {
        const isExplicit = explicitHomeDates.includes(s.date);
        const d = new Date(s.date);
        const dow = d.getDay();
        const isMWF = pattern === 'MWF' && [1, 3, 5].includes(dow);
        const isTTS = pattern === 'TTS' && [2, 4, 6].includes(dow);
        return isExplicit || isMWF || isTTS;
      }).map(s => new Date(s.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }));
      
      setHomeConflicts([...new Set(conflicts)]);
      setShowReviewScreen(true);
      
    } catch (err: any) {
      alert(`Failed to secure slots: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // =========================================================
  // STEP 2: RELEASE LOCK
  // =========================================================
  const handleCancelReview = async () => {
    const lockedIds = lockedBookings.map(b => b.id);
    if (lockedIds.length > 0) {
      await supabase.from('bookings').delete().in('id', lockedIds); 
    }
    setLockedBookings([]);
    setShowReviewScreen(false);
  };

  // =========================================================
  // STEP 3: FINALIZE BOOKING
  // =========================================================
  const handleFinalSubmit = async () => {
    setIsSubmitting(true);
    try {
      const lockedIds = lockedBookings.map(b => b.id);
      
      const { error } = await supabase
        .from('bookings')
        .update({ booking_status: 'Pending Approval' })
        .in('id', lockedIds);

      if (error) throw error;

      // --- NEW: IN-APP NOTIFICATION ROUTING ---
      if (userId) {
        // 1. Notify the Patient
        await supabase.from('notifications').insert({
          user_id: userId,
          title: 'Travel Request Submitted',
          message: `Your booking request to ${selectedBranch.branch_name} has been submitted and is pending manager approval.`
        });
      }

      // 2. Fetch Target Branch Staff (Role 3 = Manager, Role 4 = Nurse)
      const { data: staff } = await supabase
        .from('users')
        .select('user_id, role_id')
        .eq('branch_id', selectedBranch.id)
        .in('role_id', [3, 4]);

      // 3. Blast Notifications to Staff
      if (staff && staff.length > 0) {
        const staffNotifs = staff.map(s => ({
          user_id: s.user_id,
          title: s.role_id === 3 ? 'Action Required: New Guest Booking' : 'Notice: Upcoming Guest Patient',
          message: s.role_id === 3
            ? `A new travel booking from ${patientRecord?.users?.user_fullname || 'a patient'} requires your approval.`
            : `A new travel patient has requested a session at your branch. Pending manager review.`
        }));
        await supabase.from('notifications').insert(staffNotifs);
      }
      // ----------------------------------------
      
      setShowSuccessDialog(true);
      setLockedBookings([]); 
    } catch (err: any) { 
      alert(`Failed to submit request: ${err.message}`); 
    } finally { 
      setIsSubmitting(false); 
    }
  };

  const closeSuccessDialog = () => { 
    setShowSuccessDialog(false); setSelectedBranch(null); 
    setDraftDate(minDateString); setDraftShift(''); setSelectedSessions([]);
    router.push('/patient'); 
  };

  if (isLoading) {
    return (
      <div className='max-w-md mx-auto w-full bg-slate-50 h-screen h-[100dvh] relative shadow-2xl font-sans overflow-hidden flex flex-col'>
        <div className='bg-white px-5 pt-12 pb-4 shadow-sm z-10 shrink-0'><h1 className='text-2xl font-black text-slate-800 tracking-tight mb-4'>Search Dialysis Centre</h1></div>
        <div className='flex-1 flex flex-col items-center justify-center text-blue-600 font-bold'>
          <FiActivity className='text-4xl mb-4 animate-spin' />
          <span className='animate-pulse'>Loading Network...</span>
        </div>
        <PatientBottomNav />
      </div>
    );
  }

  return (
    <div className='max-w-md mx-auto w-full bg-slate-50 h-screen h-[100dvh] relative shadow-2xl font-sans overflow-hidden flex flex-col'>
      
      {/* ========================================= */}
      {/* VIEW 1: SEARCH & FILTER */}
      {/* ========================================= */}
      {!selectedBranch && (
        <>
          <div className='bg-white px-5 pt-12 pb-4 shadow-sm z-10 shrink-0'>
            <h1 className='text-xl font-black text-slate-800 tracking-tight mb-4'>Search Dialysis Centre</h1>
            
            <div className='mb-3 relative'>
              {isLoaded && !loadError ? (
                <Autocomplete onLoad={onLoad} onPlaceChanged={onPlaceChanged}>
                  <div className='relative'>
                    <FiNavigation className={`absolute left-4 top-1/2 -translate-y-1/2 text-lg ${hasSearchedLocation ? 'text-blue-600' : 'text-slate-400'}`} />
                    <input 
                      type="text" 
                      placeholder="Enter hotel or temporary address..." 
                      value={locationQuery}
                      onChange={(e) => setLocationQuery(e.target.value)}
                      className={`w-full pl-12 pr-10 py-3 bg-slate-100 border-none rounded-xl outline-none font-medium text-sm transition-colors ${hasSearchedLocation ? 'ring-2 ring-blue-500 bg-blue-50/50' : 'focus:ring-2 focus:ring-blue-500 text-slate-800'}`}
                    />
                    {locationQuery && (
                      <button onClick={resetFilters} className='absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600'>
                        <FiX />
                      </button>
                    )}
                  </div>
                </Autocomplete>
              ) : (
                <div className='relative'>
                  <FiNavigation className='absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-lg' />
                  <input disabled placeholder="Loading map engine..." className='w-full pl-12 pr-4 py-3 bg-slate-100 border-none rounded-xl outline-none font-medium text-slate-400 text-sm' />
                </div>
              )}
            </div>

            <div className='flex gap-2'>
              <div className='relative flex-1'>
                <FiSearch className='absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-lg' />
                <input type="text" placeholder="Or search clinic name..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className='w-full pl-12 pr-4 py-3 bg-slate-100 border-none rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-800 text-sm' />
              </div>
              <button onClick={() => setShowFilters(!showFilters)} className={`px-4 rounded-xl flex items-center justify-center transition-colors ${showFilters || filterRegion || filterFacilities.length > 0 || filterPrice ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                <FiFilter className='text-lg' />
              </button>
            </div>

            {showFilters && (
              <div className='mt-4 pt-4 border-t border-slate-100 animate-in slide-in-from-top-2 max-h-[60vh] overflow-y-auto custom-scrollbar'>
                <div className='flex justify-between items-center mb-4'>
                  <h3 className='font-bold text-slate-800'>Filter Options</h3>
                  <button onClick={resetFilters} className='text-xs font-bold text-slate-400 hover:text-red-500'>Reset All</button>
                </div>

                <div className='mb-5'>
                  <button onClick={handleGetLocation} className={`w-full py-3 rounded-xl flex items-center justify-center gap-2 font-bold text-sm border transition-all ${locationQuery === 'My Current GPS Location' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-white border-blue-200 text-blue-600 hover:bg-blue-50'}`}>
                    <FiCrosshair className={isLocating ? 'animate-spin' : ''} />
                    {isLocating ? 'Finding your location...' : locationQuery === 'My Current GPS Location' ? 'Using GPS (Sorting by Nearest)' : 'Use My GPS Location'}
                  </button>
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

                <div className='flex gap-2 sticky bottom-0 bg-white pt-2'>
                  <button onClick={() => setShowFilters(false)} className='flex-1 py-3 rounded-xl font-bold text-sm bg-slate-100 text-slate-600'>Cancel</button>
                  <button onClick={applyFilters} className='flex-1 py-3 rounded-xl font-bold text-sm bg-blue-600 text-white'>Apply Filter</button>
                </div>
              </div>
            )}
          </div>

          <div className='flex-1 overflow-y-auto p-5 pb-24 space-y-4 custom-scrollbar'>
            <div className='flex justify-between items-end mb-2'>
              <h2 className='text-sm font-bold text-slate-500 uppercase tracking-widest'>Results</h2>
              {hasSearchedLocation && <span className='text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-full'>Sorted by Distance</span>}
            </div>
            
            {isCalculating ? (
              <div className='py-12 flex flex-col items-center justify-center text-center'>
                <FiActivity className='text-3xl text-blue-500 animate-spin mb-4' />
                <p className='font-bold text-slate-700'>Calculating routes...</p>
              </div>
            ) : filteredBranches.length === 0 ? (
              <div className='py-12 flex flex-col items-center justify-center text-center opacity-60'>
                <FiSearch className='text-4xl text-slate-400 mb-4' />
                <p className='font-bold text-slate-700'>No clinics found</p>
              </div>
            ) : (
              filteredBranches.map(branch => {
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
                        {branch.distanceText && branch.distanceText !== 'N/A' && (
                          <div className='bg-black/70 backdrop-blur-sm text-white text-[10px] font-bold px-2.5 py-1.5 rounded-lg flex items-center gap-2 shadow-sm'>
                            <span className='flex items-center gap-1'><FiNavigation className='text-blue-400'/> {branch.distanceText}</span>
                            <span className='border-l border-white/20 pl-2 flex items-center gap-1'><FiClock className='text-emerald-400'/> {branch.durationText}</span>
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
              })
            )}
            <p className='text-center text-xs font-bold text-slate-400 pt-4 pb-8'>- End of Search Result -</p>
          </div>
          <PatientBottomNav />
        </>
      )}

      {/* ========================================= */}
      {/* VIEW 2: BRANCH DETAIL & DATE SELECTION */}
      {/* ========================================= */}
      {selectedBranch && !showReviewScreen && (
        <div className='flex flex-col h-full w-full bg-slate-50 animate-in slide-in-from-right-8 duration-300 z-20 absolute inset-0'>
          
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
                </>
              ) : (
                <div className='w-full h-full flex items-center justify-center text-slate-500 font-bold'>No Photos Available</div>
              )}
            </div>

            <div className='p-5 bg-white mb-2 shadow-sm border-b border-slate-100'>
              <h2 className='text-xl font-black text-slate-800'>{selectedBranch.branch_name}</h2>
              <p className='text-sm text-slate-500 mt-2 leading-relaxed'>{selectedBranch.branch_address}</p>
              
              {/* <div className='flex justify-between items-center mt-2'>
                <button type="button" onClick={() => window.open(`http://googleusercontent.com/maps.google.com/?q=${encodeURIComponent(selectedBranch.branch_address)}`, '_blank')} className='text-blue-600 text-sm font-bold flex items-center gap-1 hover:text-blue-800 transition-colors'>
                  <FiMapPin /> View map
                </button>
              </div> */}

              <div className='mt-6 border-t border-slate-100 pt-4'>
                <h3 className='text-xs font-bold text-slate-400 uppercase tracking-widest mb-3'>Facilities & Pricing</h3>
                
                <div className='mb-4 p-3 bg-blue-50 border border-blue-100 rounded-xl'>
                  <p className='text-xs font-bold text-blue-600 uppercase tracking-widest mb-1'>Estimated Session Cost</p>
                  <p className='text-lg font-black text-slate-800'>{selectedBranch.session_price ? `RM ${selectedBranch.session_price}` : 'TBC'}</p>
                </div>
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
                <button onClick={handleProceedToReview} disabled={isSubmitting} className='w-full py-3 bg-blue-600 text-white rounded-xl font-bold shadow-md hover:bg-blue-500 transition-colors'>
                  {isSubmitting ? 'Securing Slots...' : 'Proceed to Review'}
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
                        ? `This centre operates your preferred ${patientMachine} machines.` 
                        : `You normally use ${patientMachine}, but this centre operates ${branchMachines.join(', ')}. The Head Nurse will adjust your prescription upon arrival.`}
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
                      Your Serology report expires (or expired) on <strong>{expiryDateString}</strong>, which is before your selected date.
                    </p>
                  </div>
                </div>
              )}
              
              <div className='mb-5'>
                <label className='block text-xs font-bold text-slate-500 uppercase mb-2'>Select Date</label>
                <input type="date" min={minDateString} value={draftDate} onChange={e => setDraftDate(e.target.value)} className='w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 font-bold text-slate-800' />
                <p className='text-[10px] font-bold text-blue-600 mt-2 opacity-70'>*Travel bookings require minimum {advanceNoticeDays} days advance notice.</p>
              </div>

              <div className='space-y-3 mb-5 relative'>
                <div className={`flex items-center justify-between p-4 rounded-xl border transition-all ${!isEligibleForSelectedDate || morningSlots === 0 ? 'bg-slate-50 border-slate-100 opacity-60' : draftShift.includes('Morning') ? 'border-blue-500 bg-blue-50 shadow-sm' : 'border-slate-200'}`}>
  <div>
    <p className={`font-bold ${!isEligibleForSelectedDate || morningSlots === 0 ? 'text-slate-400' : 'text-slate-800'}`}>Morning Shift</p>
    <p className={`text-xs font-bold mt-1 ${!isEligibleForSelectedDate || morningSlots === 0 ? 'text-red-500' : patientRecord?.preferred_shift?.includes('Morning') ? 'text-emerald-600' : 'text-amber-500'}`}>
      {morningSlots > 0 ? `${morningSlots} Slots Available` : 'Full (No Slots)'}
    </p>
  </div>
  <button type="button" disabled={!isEligibleForSelectedDate || morningSlots === 0} onClick={() => setDraftShift('Morning (08:00 - 12:00)')} className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors ${!isEligibleForSelectedDate || morningSlots === 0 ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : draftShift.includes('Morning') ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
    {draftShift.includes('Morning') ? 'Selected' : 'Select'}
  </button>
</div>
                
                <div className={`flex items-center justify-between p-4 rounded-xl border transition-all ${!isEligibleForSelectedDate || afternoonSlots === 0 ? 'bg-slate-50 border-slate-100 opacity-60' : draftShift.includes('Afternoon') ? 'border-blue-500 bg-blue-50 shadow-sm' : 'border-slate-200'}`}>
  <div>
    <p className={`font-bold ${!isEligibleForSelectedDate || afternoonSlots === 0 ? 'text-slate-400' : 'text-slate-800'}`}>Afternoon Shift</p>
    <p className={`text-xs font-bold mt-1 ${!isEligibleForSelectedDate || afternoonSlots === 0 ? 'text-red-500' : patientRecord?.preferred_shift?.includes('Afternoon') ? 'text-emerald-600' : 'text-amber-500'}`}>
      {afternoonSlots > 0 ? `${afternoonSlots} Slots Available` : 'Full (No Slots)'}
    </p>
  </div>
  <button type="button" disabled={!isEligibleForSelectedDate || afternoonSlots === 0} onClick={() => setDraftShift('Afternoon (12:00 - 16:00)')} className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors ${!isEligibleForSelectedDate || afternoonSlots === 0 ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : draftShift.includes('Afternoon') ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
    {draftShift.includes('Afternoon') ? 'Selected' : 'Select'}
  </button>
</div>

                <div className={`flex items-center justify-between p-4 rounded-xl border transition-all ${!isEligibleForSelectedDate || eveningSlots === 0 ? 'bg-slate-50 border-slate-100 opacity-60' : draftShift.includes('Evening') ? 'border-blue-500 bg-blue-50 shadow-sm' : 'border-slate-200'}`}>
  <div>
    <p className={`font-bold ${!isEligibleForSelectedDate || eveningSlots === 0 ? 'text-slate-400' : 'text-slate-800'}`}>Evening Shift</p>
    <p className={`text-xs font-bold mt-1 ${!isEligibleForSelectedDate || eveningSlots === 0 ? 'text-red-500' : patientRecord?.preferred_shift?.includes('Evening') ? 'text-emerald-600' : 'text-amber-500'}`}>
      {eveningSlots > 0 ? `${eveningSlots} Slots Available` : 'Full (No Slots)'}
    </p>
  </div>
  <button type="button" disabled={!isEligibleForSelectedDate || eveningSlots === 0} onClick={() => setDraftShift('Evening (17:00 - 21:00)')} className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors ${!isEligibleForSelectedDate || eveningSlots === 0 ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : draftShift.includes('Evening') ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
    {draftShift.includes('Evening') ? 'Selected' : 'Select'}
  </button>
</div>
              </div>

              {!isShiftMatch && draftShift && (
                <div className='mb-5 p-4 rounded-xl border bg-amber-50 border-amber-200 flex items-start gap-3'>
                  <FiAlertCircle className='text-amber-600 text-xl shrink-0 mt-0.5' />
                  <div>
                    <h4 className='text-sm font-black text-amber-800'>Shift Time Altered</h4>
                    <p className='text-xs font-bold mt-1 leading-relaxed text-amber-700'>
                      You usually dialyze in the <strong>{patientRecord?.preferred_shift}</strong>. Booking a different shift changes your fluid accumulation interval.
                    </p>
                  </div>
                </div>
              )}

              <button 
                type="button" 
                onClick={addSessionToCart}
                disabled={!draftShift || !draftDate || !isEligibleForSelectedDate} 
                className='w-full py-4 bg-slate-100 text-blue-600 border-2 border-blue-100 rounded-2xl font-black text-sm hover:bg-blue-50 transition-all flex justify-center items-center gap-2'
              >
                <FiPlus /> Add Session to Cart
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================= */}
      {/* VIEW 3: REVIEW & CONFIRM OVERLAY */}
      {/* ========================================= */}
      {showReviewScreen && selectedBranch && (
        <div className='flex flex-col h-full w-full bg-slate-50 animate-in slide-in-from-right-8 duration-300 z-30 absolute inset-0'>
          <div className='bg-white px-5 pt-12 pb-4 shadow-sm flex items-center justify-between shrink-0 border-b border-slate-100'>
            <button onClick={handleCancelReview} className='p-2 -ml-2 text-slate-600 hover:bg-slate-100 rounded-full flex items-center gap-1 font-bold text-sm transition-colors'>
              <FiChevronLeft className='text-2xl' /> Edit
            </button>
            <h1 className='text-lg font-black text-slate-800'>Review Request</h1>
            <div className='w-14' />
          </div>

          <div className='flex-1 overflow-y-auto p-5 pb-safe custom-scrollbar space-y-6'>
            
            {homeConflicts.length > 0 && (
              <div className='bg-amber-50 border border-amber-200 p-5 rounded-2xl animate-in slide-in-from-top-4'>
                <h4 className='text-xs font-black text-amber-800 uppercase tracking-widest flex items-center gap-1.5 mb-2'>
                  <FiAlertCircle className='text-lg' /> Home Schedule Conflict
                </h4>
                <p className='text-xs font-bold text-amber-700 leading-relaxed text-justify'>
                  Your selected travel dates (<strong>{homeConflicts.join(', ')}</strong>) overlap with your routine Home centre schedule. By submitting this request, your Home sessions on these dates will be automatically cancelled upon Manager approval to prevent double-booking.
                </p>
              </div>
            )}

            <div className='bg-white p-5 rounded-2xl shadow-sm border border-slate-100'>
              <p className='text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1'>Target Clinic</p>
              <h2 className='text-lg font-black text-slate-800'>{selectedBranch?.branch_name}</h2>
              <p className='text-xs font-bold text-slate-500 mt-1 flex items-center gap-1'><FiMapPin /> {selectedBranch?.branch_address}</p>
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
                  </div>
                ))}
              </div>
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

      {/* SUCCESS DIALOG */}
      {showSuccessDialog && (
        <div className='absolute inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-5 animate-in fade-in'>
          <div className='bg-white w-full max-w-sm rounded-3xl p-8 shadow-2xl text-center animate-in zoom-in-95'>
            <FiCheckCircle className='text-6xl text-emerald-500 mx-auto mb-4' />
            <h3 className='text-xl font-black text-slate-800 mb-2'>Booking Submitted!</h3>
            <p className='text-sm font-bold text-slate-500 mb-6'>{selectedSessions.length} sessions sent for approval.</p>
            <button onClick={closeSuccessDialog} className='w-full py-3.5 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-xl font-bold transition-colors'>Return to Dashboard</button>
          </div>
        </div>
      )}
    </div>
  );
}