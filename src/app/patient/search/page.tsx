'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { useRouter } from 'next/navigation';
import { useLoadScript, Autocomplete } from '@react-google-maps/api';
import PatientBottomNav from '../../../components/PatientBottomNav';
import { 
  FiSearch, FiMapPin, FiNavigation, FiClock, 
  FiChevronLeft, FiPhone, FiActivity, FiArrowRight, FiXCircle
} from 'react-icons/fi';

const libraries: any = ['places'];

export default function PatientSearchBranch() {
  const [isLoading, setIsLoading] = useState(true);
  const [isCalculating, setIsCalculating] = useState(false);
  
  const [allBranches, setAllBranches] = useState<any[]>([]);
  const [displayedBranches, setDisplayedBranches] = useState<any[]>([]);
  
  const [nameSearchQuery, setNameSearchQuery] = useState('');
  const [locationQuery, setLocationQuery] = useState('');
  const [hasSearchedLocation, setHasSearchedLocation] = useState(false);
  
  const [autocomplete, setAutocomplete] = useState<google.maps.places.Autocomplete | null>(null);
  const router = useRouter();

  const { isLoaded, loadError } = useLoadScript({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY as string,
    libraries: libraries,
  });

  useEffect(() => {
    fetchBranches();
  }, []);

  const fetchBranches = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('branches')
        .select('*')
        .eq('status', 'Active')
        .order('branch_name', { ascending: true });
        
      if (error) throw error;
      
      setAllBranches(data || []);
      setDisplayedBranches(data || []);
    } catch (err: any) {
      console.error("Error fetching branches:", err.message);
    } finally {
      setIsLoading(false);
    }
  };

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

  const clearLocationSearch = () => {
    setLocationQuery('');
    setHasSearchedLocation(false);
    // Reset to alphabetical sort
    const resetBranches = [...allBranches].map(b => ({
      ...b,
      distanceValue: null,
      distanceText: null,
      durationText: null
    }));
    setDisplayedBranches(resetBranches);
  };

  const calculateDistances = async (originAddress: string) => {
    setIsCalculating(true);
    try {
      const service = new google.maps.DistanceMatrixService();
      const destAddresses = allBranches.map(b => b.branch_address);
      
      // Google API limits Distance Matrix to 25 destinations per request.
      // We chunk the requests to ensure it scales flawlessly in production.
      const chunks = [];
      for (let i = 0; i < destAddresses.length; i += 25) {
        chunks.push(destAddresses.slice(i, i + 25));
      }

      let allElements: any[] = [];
      for (const chunk of chunks) {
        const response = await service.getDistanceMatrix({
          origins: [originAddress],
          destinations: chunk,
          travelMode: google.maps.TravelMode.DRIVING,
        });
        if (response && response.rows[0]) {
          allElements = allElements.concat(response.rows[0].elements);
        }
      }

      // Map the results back to the branch objects
      const mappedBranches = allBranches.map((b, idx) => {
        const element = allElements[idx];
        if (element && element.status === 'OK') {
          return {
            ...b,
            distanceValue: element.distance.value, // in meters for strict sorting
            distanceText: element.distance.text,   // e.g., "4.2 km"
            durationText: element.duration.text    // e.g., "12 mins"
          };
        }
        return { ...b, distanceValue: Infinity, distanceText: 'N/A', durationText: 'N/A' };
      });

      // Sort nearest to furthest
      mappedBranches.sort((a, b) => a.distanceValue - b.distanceValue);
      
      setDisplayedBranches(mappedBranches);
      setHasSearchedLocation(true);

    } catch (error) {
      console.error("Distance calculation failed", error);
      alert("Unable to calculate driving distances. Please check the address.");
    } finally {
      setIsCalculating(false);
    }
  };

  const handleSelectBranch = (branchId: number) => {
    // Practical routing: passing the branch_id to the booking initialization page
    router.push(`/patient/book?branch_id=${branchId}`);
  };

  // Dual-filtering: Maintains distance sort while allowing manual name searches
  const finalList = displayedBranches.filter(b => 
    b.branch_name.toLowerCase().includes(nameSearchQuery.toLowerCase()) ||
    b.branch_address.toLowerCase().includes(nameSearchQuery.toLowerCase())
  );

  if (isLoading) {
    return (
      <div className='max-w-md mx-auto w-full bg-slate-50 h-screen h-[100dvh] relative shadow-2xl font-sans overflow-hidden flex flex-col'>
        <div className='bg-white px-5 pt-12 pb-4 shadow-sm z-10 shrink-0'>
          <h1 className='text-center text-xl font-black text-slate-800 tracking-tight mb-4'>Dialysis Network</h1>
        </div>
        <div className='flex-1 flex flex-col items-center justify-center text-blue-600 font-bold'>
          <FiActivity className='text-4xl mb-4 animate-spin' />
          <span className='animate-pulse'>Locating clinics...</span>
        </div>
        <PatientBottomNav />
      </div>
    );
  }

  return (
    <div className='max-w-md mx-auto w-full bg-slate-50 h-screen h-[100dvh] relative shadow-2xl font-sans overflow-hidden flex flex-col'>
      
      {/* HEADER & SEARCH BAR */}
      <div className='bg-white px-5 pt-12 pb-5 shadow-sm z-10 shrink-0'>
        <div className='flex items-center gap-3 mb-6'>
          <button onClick={() => router.back()} className='p-2 -ml-2 text-slate-600 hover:bg-slate-100 rounded-full transition-colors'>
            <FiChevronLeft className='text-2xl' />
          </button>
          <h1 className='text-xl font-black text-slate-800 tracking-tight'>Find a Centre</h1>
        </div>

        <div className='space-y-3'>
          {/* Smart Location Search */}
          <div className='relative'>
            <label className='block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1'>Calculate Distance From</label>
            <div className='relative flex items-center'>
              <FiNavigation className={`absolute left-3.5 top-1/2 -translate-y-1/2 text-lg ${hasSearchedLocation ? 'text-blue-600' : 'text-slate-400'}`} />
              
              {isLoaded && !loadError ? (
                <Autocomplete onLoad={onLoad} onPlaceChanged={onPlaceChanged} className='w-full'>
                  <input 
                    type="text" 
                    placeholder="E.g., Hotel name, relative's address..." 
                    value={locationQuery}
                    onChange={(e) => setLocationQuery(e.target.value)}
                    className={`w-full pl-10 pr-10 py-3.5 bg-slate-50 border rounded-xl outline-none font-bold text-sm transition-colors ${hasSearchedLocation ? 'border-blue-300 bg-blue-50/30' : 'border-slate-200 focus:border-blue-500'}`}
                  />
                </Autocomplete>
              ) : (
                <input 
                  type="text" 
                  disabled
                  placeholder="Loading maps engine..." 
                  className='w-full pl-10 pr-4 py-3.5 bg-slate-100 border border-slate-200 rounded-xl outline-none text-sm text-slate-400 cursor-not-allowed'
                />
              )}

              {locationQuery && (
                <button onClick={clearLocationSearch} className='absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1'>
                  <FiXCircle className='text-lg' />
                </button>
              )}
            </div>
          </div>

          {/* Simple Name Filter */}
          <div className='relative pt-2 border-t border-slate-100'>
            <FiSearch className='absolute left-3.5 top-1/2 -translate-y-1/2 mt-1 text-slate-400 text-lg' />
            <input 
              type="text" 
              placeholder="Or search by clinic name..." 
              value={nameSearchQuery}
              onChange={(e) => setNameSearchQuery(e.target.value)}
              className='w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl outline-none focus:border-blue-500 font-medium text-sm transition-colors'
            />
          </div>
        </div>
      </div>

      {/* RESULTS LIST */}
      <div className='flex-1 overflow-y-auto p-5 pb-24 custom-scrollbar space-y-4'>
        
        {isCalculating ? (
          <div className='py-12 flex flex-col items-center justify-center text-center'>
            <FiActivity className='text-3xl text-blue-500 animate-spin mb-4' />
            <p className='font-bold text-slate-700'>Calculating routes...</p>
            <p className='text-xs text-slate-400 mt-1'>Finding the fastest driving paths.</p>
          </div>
        ) : finalList.length === 0 ? (
          <div className='py-12 flex flex-col items-center justify-center text-center opacity-60'>
            <FiSearch className='text-4xl text-slate-400 mb-4' />
            <p className='font-bold text-slate-700'>No clinics found</p>
            <p className='text-xs text-slate-500 mt-1'>Try adjusting your search terms.</p>
          </div>
        ) : (
          <div className='space-y-4'>
            {hasSearchedLocation && (
              <p className='text-[10px] font-black text-blue-600 uppercase tracking-widest text-center mb-2'>
                Sorted by nearest driving distance
              </p>
            )}

            {finalList.map(branch => (
              <div key={branch.id} className='bg-white rounded-2xl border border-slate-200 shadow-sm p-5 hover:shadow-md transition-shadow'>
                
                {/* Distance Badge (Only shows if calculation was successful) */}
                {branch.distanceText && branch.distanceText !== 'N/A' && (
                  <div className='flex gap-2 mb-4 pb-3 border-b border-slate-100'>
                    <div className='bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5'>
                      <FiNavigation /> {branch.distanceText} Away
                    </div>
                    <div className='bg-blue-50 text-blue-700 px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5'>
                      <FiClock /> {branch.durationText} Drive
                    </div>
                  </div>
                )}

                <h3 className='text-lg font-black text-slate-800 leading-tight mb-2'>{branch.branch_name}</h3>
                
                <div className='space-y-2 mb-5'>
                  <p className='text-xs font-medium text-slate-600 flex items-start gap-2 leading-relaxed'>
                    <FiMapPin className='shrink-0 text-slate-400 mt-0.5 text-sm' />
                    <span>{branch.branch_address}</span>
                  </p>
                  <p className='text-xs font-bold text-slate-600 flex items-center gap-2'>
                    <FiPhone className='shrink-0 text-slate-400 text-sm' />
                    <span>{branch.branch_contact}</span>
                  </p>
                </div>

                <div className='flex gap-3'>
                  <button 
                    onClick={() => handleSelectBranch(branch.id)}
                    className='flex-1 bg-slate-900 text-white py-3 rounded-xl text-sm font-black flex items-center justify-center gap-2 hover:bg-slate-800 transition-colors shadow-md'
                  >
                    Select Centre <FiArrowRight />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <PatientBottomNav />
    </div>
  );
}