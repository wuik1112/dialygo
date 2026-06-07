'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { useLoadScript, Autocomplete, GoogleMap, Marker } from '@react-google-maps/api';
import { FiActivity, FiMapPin, FiXCircle } from 'react-icons/fi';

const libraries: any = ['places'];

const defaultCenter = {
  lat: 5.4141,
  lng: 100.3288
};

export default function BranchManagement() {
  const [branches, setBranches] = useState<any[]>([]);
  const [managers, setManagers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState('All');
  
  const { isLoaded } = useLoadScript({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY as string,
    libraries: libraries,
  });

  const [autocomplete, setAutocomplete] = useState<google.maps.places.Autocomplete | null>(null);
  const [mapCenter, setMapCenter] = useState(defaultCenter);
  const [markerPosition, setMarkerPosition] = useState<{lat: number, lng: number} | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'view' | 'edit' | 'add'>('view');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [selectedBranch, setSelectedBranch] = useState<any>(null);
  const [branchStats, setBranchStats] = useState({ staff: 0, bookings: 0 });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  
  const [opDays, setOpDays] = useState('Monday - Saturday');
  const [openTime, setOpenTime] = useState('07:00');
  const [closeTime, setCloseTime] = useState('21:00');

  const [formData, setFormData] = useState({
    name: '',
    address: '',
    contact: '',
    manager_id: '',
    session_price: '',
    lat: null as number | null,
    lng: null as number | null
  });

  async function fetchData() {
    setIsLoading(true);
    
    // FETCH LIVE REAL-TIME DATA TO CALCULATE TRUE CAPACITY
    const [branchRes, managerRes, machinesRes, patientsRes] = await Promise.all([
      supabase.from('branches').select('*').order('id', { ascending: true }),
      supabase.from('users').select('*').eq('role_id', 2),
      supabase.from('machines').select('branch_id').neq('status', 'Retired'),
      supabase.from('patients').select('home_branch_id')
    ]);

    if (branchRes.data) {
      // CALCULATE REAL UTILIZATION METRICS
      const enrichedBranches = branchRes.data.map(branch => {
        const actualMachines = machinesRes.data?.filter(m => m.branch_id === branch.id).length || 0;
        const activePatients = patientsRes.data?.filter(p => p.home_branch_id === branch.id).length || 0;
        
        // Dialysis standard capacity: 1 machine handles 6 patients (3 shifts/day, MWF/TTS)
        const totalCapacity = actualMachines * 6; 
        const availableSlots = Math.max(0, totalCapacity - activePatients);

        return {
          ...branch,
          actual_machines: actualMachines,
          active_patients: activePatients,
          total_capacity: totalCapacity,
          available_slots_calc: availableSlots
        };
      });
      setBranches(enrichedBranches);
    }
    
    if (managerRes.data) setManagers(managerRes.data);
    setIsLoading(false);
  }

  useEffect(() => {
    fetchData();
  }, []);

  const validateField = (name: string, value: string) => {
    let err = '';

    if (name === 'name') {
      if (branches.some(b => b.id !== editingId && b.branch_name.toLowerCase() === value.toLowerCase().trim())) {
        err = 'A branch with this name already exists.';
      }
    }

    if (name === 'contact') {
      if (value.length > 0 && (value.length < 9 || value.length > 11)) {
        err = 'Contact must be 9-11 digits.';
      } else if (branches.some(b => b.id !== editingId && b.branch_contact === value)) {
        err = 'This contact number is already in use by another branch.';
      }
    }

    if (name === 'time' && openTime === closeTime) {
      err = 'Opening and closing times cannot be identical.';
    }

    setFieldErrors(prev => ({ ...prev, [name]: err }));
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    let newValue = value;

    if (name === 'contact') {
      newValue = value.replace(/\D/g, ''); 
    }

    setFormData(prev => ({ ...prev, [name]: newValue }));
    validateField(name, newValue);
  };

  const onLoad = (autoC: google.maps.places.Autocomplete) => {
    setAutocomplete(autoC);
  };

  const onPlaceChanged = () => {
    if (autocomplete !== null) {
      const place = autocomplete.getPlace();
      const selectedAddress = place.formatted_address || place.name || '';
      
      let newLat = formData.lat;
      let newLng = formData.lng;

      if (place.geometry && place.geometry.location) {
        const newLocation = {
          lat: place.geometry.location.lat(),
          lng: place.geometry.location.lng()
        };
        setMapCenter(newLocation);
        setMarkerPosition(newLocation);
        newLat = newLocation.lat;
        newLng = newLocation.lng;
      }
      
      setFormData(prev => ({ 
        ...prev, 
        address: selectedAddress,
        lat: newLat,
        lng: newLng
      }));
    }
  };

  const openAddModal = () => {
    setViewMode('add');
    setEditingId(null);
    setSelectedBranch(null);
    setFieldErrors({});
    
    setOpDays('Monday - Saturday');
    setOpenTime('07:00');
    setCloseTime('21:00');

    setFormData({ 
      name: '', address: '', contact: '', manager_id: '', 
      session_price: '', lat: null, lng: null 
    });
    
    setMapCenter(defaultCenter);
    setMarkerPosition(null);
    setError('');
    setIsModalOpen(true);
  };

  const openDetailsModal = async (branch: any) => {
    setSelectedBranch(branch);
    setEditingId(branch.id);
    setViewMode('view');
    setFieldErrors({});
    
    if (branch.branch_operating_hours) {
      const parts = branch.branch_operating_hours.split(': ');
      if (parts.length === 2) {
        setOpDays(parts[0]);
        const times = parts[1].split(' - ');
        if (times.length === 2) {
          setOpenTime(times[0]);
          setCloseTime(times[1]);
        }
      }
    } else {
      setOpDays('Monday - Saturday');
      setOpenTime('07:00');
      setCloseTime('21:00');
    }

    setFormData({
      name: branch.branch_name || '',
      address: branch.branch_address || '',
      contact: branch.branch_contact || '',
      manager_id: branch.manager_id ? branch.manager_id.toString() : '',
      session_price: branch.session_price ? branch.session_price.toString() : '',
      lat: branch.latitude || null,
      lng: branch.longitude || null
    });
    
    setMapCenter(defaultCenter);
    setMarkerPosition(null);
    setError('');
    
    const { count: staffCount } = await supabase.from('users').select('*', { count: 'exact', head: true }).eq('branch_id', branch.id);
    const today = new Date().toISOString().split('T')[0];
    const { count: bookingCount } = await supabase.from('bookings')
  .select('*', { count: 'exact', head: true })
  .eq('branch_id', branch.id)
  .gte('booking_date', today)
  .in('booking_status', ['Scheduled', 'Pending Reschedule', 'In Progress', 'Pending Approval']);
    
    setBranchStats({
      staff: staffCount || 0,
      bookings: bookingCount || 0
    });

    if (branch.latitude && branch.longitude) {
      const loc = { lat: Number(branch.latitude), lng: Number(branch.longitude) };
      setMapCenter(loc);
      setMarkerPosition(loc);
    } else if (isLoaded && window.google) {
      const geocoder = new window.google.maps.Geocoder();
      geocoder.geocode({ address: branch.branch_address }, (results, status) => {
        if (status === 'OK' && results && results[0]) {
          const loc = {
            lat: results[0].geometry.location.lat(),
            lng: results[0].geometry.location.lng()
          };
          setMapCenter(loc);
          setMarkerPosition(loc);
        }
      });
    }

    setIsModalOpen(true);
  };

  const handleSaveBranch = async (e: React.FormEvent) => {
    e.preventDefault();

    if (openTime === closeTime) {
      setFieldErrors(prev => ({ ...prev, time: 'Opening and closing times cannot be identical.' }));
      return;
    }

    const hasErrors = Object.values(fieldErrors).some(msg => msg !== '');
    if (hasErrors) {
      setError('Please correct the highlighted errors before saving.');
      return;
    }

    setIsSubmitting(true);
    setError('');

    if (!formData.name.trim() || !formData.address.trim() || !formData.contact.trim()) {
      setError('Error: All required fields must be filled.');
      setIsSubmitting(false);
      return;
    }

    const compiledHours = `${opDays}: ${openTime} - ${closeTime}`;
    const newManagerId = formData.manager_id ? parseInt(formData.manager_id) : null;

    const payload: any = {
      branch_name: formData.name.trim(),
      branch_address: formData.address.trim(),
      branch_contact: formData.contact.trim(),
      branch_operating_hours: compiledHours,
      session_price: formData.session_price ? parseFloat(formData.session_price) : null,
      manager_id: newManagerId,
      latitude: formData.lat,
      longitude: formData.lng
    };

    if (viewMode === 'edit' && editingId && selectedBranch) {
      const { error: updateError } = await supabase.from('branches').update(payload).eq('id', editingId);
      
      if (updateError) {
        setError(`Update failed: ${updateError.message}`);
        setIsSubmitting(false);
        return;
      }

      if (selectedBranch.manager_id !== newManagerId) {
        if (selectedBranch.manager_id) {
          await supabase.from('users').update({ branch_id: null }).eq('user_id', selectedBranch.manager_id);
        }
        if (newManagerId) {
          await supabase.from('users').update({ branch_id: editingId }).eq('user_id', newManagerId);
        }
      }

    } else if (viewMode === 'add') {
      payload.total_machines = 0;
      payload.available_slots = 0;
      payload.status = 'Active';

      const { data: newBranchData, error: insertError } = await supabase.from('branches').insert([payload]).select();
      
      if (insertError) {
        setError(`Creation failed: ${insertError.message}`);
        setIsSubmitting(false);
        return;
      }

      if (newManagerId && newBranchData && newBranchData.length > 0) {
        const generatedBranchId = newBranchData[0].id;
        
        await supabase.from('users').update({ branch_id: generatedBranchId }).eq('user_id', newManagerId);

        await supabase.from('notifications').insert([{
          user_id: newManagerId,
          title: 'New Branch Assignment',
          message: `You have been officially assigned as the Branch Manager for the newly created facility: ${formData.name.trim()}.`,
          type: 'System',
          is_read: false
        }]);
      }
    }

    if (newManagerId && (viewMode === 'add' || (viewMode === 'edit' && selectedBranch.manager_id !== newManagerId))) {
        const assignedManager = managers.find(m => m.user_id === newManagerId);
        if (assignedManager) {
          fetch('/api/admin/notify-manager', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: assignedManager.user_email,
              fullname: assignedManager.user_fullname,
              branchName: formData.name.trim()
            })
          }).catch(err => console.error("Failed to trigger manager email:", err));
        }
      }
      
    setIsModalOpen(false);
    setIsSubmitting(false);
    await fetchData();
  };

  const handleDeactivate = async (branchId: number) => {
    const { count: staffCount } = await supabase.from('users').select('*', { count: 'exact', head: true }).eq('branch_id', branchId);
    const today = new Date().toISOString().split('T')[0];
    const { count: bookingCount } = await supabase.from('bookings').select('*', { count: 'exact', head: true }).eq('branch_id', branchId).gte('booking_date', today).in('status', ['CONFIRMED', 'PENDING_REVIEW']);

    if ((bookingCount || 0) > 0 || (staffCount || 0) > 0) {
      alert(`Cannot deactivate branch. There are ${bookingCount || 0} active future bookings and ${staffCount || 0} assigned staff. Please reassign them first.`);
      return;
    }

    if (window.confirm('Deactivate this branch?')) {
      await supabase.from('branches').update({ status: 'Inactive' }).eq('id', branchId);
      await fetchData();
    }
  };

  const handleReactivate = async (branch: any) => {
    if (branch.manager_id) {
      const { data: managerData, error } = await supabase
        .from('users')
        .select('user_is_active, user_fullname')
        .eq('user_id', branch.manager_id)
        .single();

      if (managerData && !managerData.user_is_active) {
        alert(`Cannot reactivate branch. The assigned Branch Manager (${managerData.user_fullname}) is currently inactive. Please edit the branch to assign a new active manager first.`);
        return;
      }
    }
    if (window.confirm(`Reactivate ${branch.branch_name}?`)) {
      await supabase.from('branches').update({ status: 'Active' }).eq('id', branch.id);
      await fetchData();
    }
  };

  const filteredBranches = branches.filter(b => filter === 'All' ? true : b.status === filter);

  if (isLoading) {
    return (
      <div className='min-h-screen bg-slate-50 flex items-center justify-center'>
        <div className='flex flex-col items-center text-blue-600 font-bold'>
          <FiActivity className='text-4xl mb-4 animate-spin' />
          <span>Fetching DialyGo Network Data...</span>
        </div>
      </div>
    );
  }

  return (
    <main className='p-8 bg-slate-50 min-h-screen font-sans relative'>
      <div className='max-w-6xl mx-auto'>
        <div className='flex justify-between items-center mb-8'>
          <div>
            <h1 className='text-3xl font-bold text-slate-800 tracking-tight'>Branch Management</h1>
          </div>
          <button onClick={openAddModal} className='bg-blue-600 text-white px-5 py-2.5 rounded-xl font-semibold hover:bg-blue-700 transition-all shadow-sm'>
            + Add New Branch
          </button>
        </div>

        <div className='flex gap-3 mb-8'>
          {['All', 'Active', 'Inactive'].map(f => (
            <button key={f} onClick={() => setFilter(f)} className={`px-5 py-2 rounded-full text-sm font-semibold transition-all ${filter === f ? 'bg-slate-900 text-white shadow-md' : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'}`}>
              {f}
            </button>
          ))}
        </div>

        <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'>
          {filteredBranches.map(branch => {
            const isActive = branch.status === 'Active';
            // NEW METRICS DRIVEN FROM REAL DATABASE QUERIES
            const utilizationPercent = branch.total_capacity > 0 ? (branch.active_patients / branch.total_capacity) * 100 : 0;

            return (
              <div key={branch.id} className={`bg-white p-6 rounded-2xl border ${isActive ? 'border-slate-200' : 'border-red-100 bg-red-50/20'} shadow-sm flex flex-col hover:shadow-md transition-shadow`}>
                
                {/* --- FIX APPLIED HERE --- */}
                <div className='flex justify-between items-start mb-4 gap-2'>
                  <h2 className='text-lg font-bold text-slate-800 break-words flex-1'>{branch.branch_name}</h2>
                  <span className={`shrink-0 px-3 py-1 text-[10px] uppercase tracking-widest font-bold rounded-full ${isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                    {branch.status || 'Active'}
                  </span>
                </div>
                {/* ------------------------ */}
                
                <div className='space-y-4 flex-1 mb-6'>
                  <div className='flex items-start gap-3'>
                    <div className='mt-1 text-slate-400'><FiMapPin /></div>
                    <p className='text-sm text-slate-600 line-clamp-2 leading-relaxed'>{branch.branch_address}</p>
                  </div>
                  
                  <div>
                    <div className='flex justify-between items-end mb-1.5'>
                      <span className='text-[11px] font-bold text-slate-400 uppercase tracking-tighter'>Capacity Utilization</span>
                      <span className='text-[11px] font-black text-slate-700'>{branch.active_patients} / {branch.total_capacity} Patients</span>
                    </div>
                    <div className='w-full bg-slate-100 rounded-full h-2 overflow-hidden'>
                      <div 
                        className={`${isActive ? 'bg-blue-500' : 'bg-slate-300'} h-full rounded-full transition-all`} 
                        style={{ width: `${utilizationPercent}%` }}
                      ></div>
                    </div>
                  </div>
                </div>

                <div className='pt-5 border-t border-slate-100 flex gap-2'>
                  <button onClick={() => openDetailsModal(branch)} className='flex-1 bg-slate-50 text-slate-700 py-2.5 rounded-xl text-xs font-bold hover:bg-slate-100 border border-slate-200 transition-colors'>View Details</button>
                  {isActive ? (
                    <button onClick={() => handleDeactivate(branch.id)} className='px-4 bg-white text-red-500 py-2.5 rounded-xl text-xs font-bold hover:bg-red-50 border border-red-100 transition-colors'>Deactivate</button>
                  ) : (
                    <button onClick={() => handleReactivate(branch)} className='px-4 bg-emerald-50 text-emerald-700 py-2.5 rounded-xl text-xs font-bold hover:bg-emerald-100 border border-emerald-100 transition-colors'>Reactivate</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {isModalOpen && (
        <div className='fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4'>
          <div className={`bg-white rounded-3xl shadow-2xl w-full ${viewMode === 'view' ? 'max-w-4xl' : 'max-w-2xl'} overflow-hidden animate-in fade-in zoom-in duration-200`}>
            
            <div className='px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50'>
              <div>
                <h2 className='text-xl font-extrabold text-slate-900'>
                  {viewMode === 'view' ? 'Branch Record' : viewMode === 'edit' ? 'Edit Branch' : 'Register New Branch'}
                </h2>
                {editingId && <p className='text-xs text-slate-500 font-medium'>Internal Facility ID: #{editingId}</p>}
              </div>
              <button onClick={() => setIsModalOpen(false)} className='text-slate-400 hover:text-slate-600 text-2xl'>&times;</button>
            </div>
            
            <div className='p-8'>
              {viewMode === 'view' && selectedBranch ? (
                <div className='grid grid-cols-1 md:grid-cols-2 gap-8'>
                  <div className='space-y-6'>
                    <div>
                      <h3 className='text-[10px] font-bold text-blue-500 uppercase tracking-widest mb-1'>Facility Name</h3>
                      <p className='text-lg font-bold text-slate-800'>{selectedBranch.branch_name}</p>
                    </div>
                    <div>
                      <h3 className='text-[10px] font-bold text-blue-500 uppercase tracking-widest mb-1'>Branch Manager</h3>
                      <p className='text-sm font-semibold text-slate-800'>
                        {managers.find(m => m.user_id === selectedBranch.manager_id)?.user_fullname || 'Unassigned'}
                      </p>
                    </div>
                    <div className='grid grid-cols-2 gap-4'>
                      <div>
                        <h3 className='text-[10px] font-bold text-blue-500 uppercase tracking-widest mb-1'>Contact Number</h3>
                        <p className='text-sm text-slate-800'>{selectedBranch.branch_contact}</p>
                      </div>
                      <div>
                        <h3 className='text-[10px] font-bold text-blue-500 uppercase tracking-widest mb-1'>Session Price</h3>
                        <p className='text-sm text-emerald-600 font-bold'>
                          {selectedBranch.session_price ? `RM ${selectedBranch.session_price}` : 'Not Set'}
                        </p>
                      </div>
                    </div>
                    <div>
                      <h3 className='text-[10px] font-bold text-blue-500 uppercase tracking-widest mb-1'>Operating Hours</h3>
                      <p className='text-sm text-slate-800'>{selectedBranch.branch_operating_hours || 'Mon-Sat, 7am - 9pm'}</p>
                    </div>
                    <div>
                      <h3 className='text-[10px] font-bold text-blue-500 uppercase tracking-widest mb-1'>Official Address</h3>
                      <p className='text-sm text-slate-600 leading-relaxed'>{selectedBranch.branch_address}</p>
                    </div>
                  </div>

                  <div className='space-y-6'>
                    <div className='bg-slate-50 p-5 rounded-2xl border border-slate-100'>
                      <h3 className='text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4'>Resource & Capacity Snapshot</h3>
                      
                      <div className='grid grid-cols-2 gap-4 mb-4'>
                        <div className='bg-white p-3 rounded-xl border border-slate-100 shadow-sm'>
                          <p className='text-[10px] font-bold text-slate-400 uppercase'>Active Machines</p>
                          <p className='text-lg font-black text-slate-800'>{selectedBranch.actual_machines}</p>
                        </div>
                        <div className='bg-white p-3 rounded-xl border border-slate-100 shadow-sm'>
                          <p className='text-[10px] font-bold text-slate-400 uppercase'>Available Slots</p>
                          <p className='text-lg font-black text-emerald-600'>{selectedBranch.available_slots_calc}</p>
                        </div>
                      </div>

                      <div className='space-y-2'>
                        <div className='flex justify-between items-center text-sm'>
                          <span className='font-medium text-slate-600'>Active Staff Assigned</span>
                          <span className='font-bold text-slate-800'>{branchStats.staff} personnel</span>
                        </div>
                        <div className='flex justify-between items-center text-sm'>
                          <span className='font-medium text-slate-600'>Active Future Bookings</span>
                          <span className='font-bold text-slate-800'>{branchStats.bookings} sessions</span>
                        </div>
                      </div>
                    </div>

                    {isLoaded && (
                      <div className='h-40 rounded-2xl overflow-hidden border border-slate-200 shadow-inner'>
                        <GoogleMap mapContainerStyle={{ width: '100%', height: '100%' }} center={mapCenter} zoom={markerPosition ? 15 : 10} options={{ disableDefaultUI: true, zoomControl: true }}>
                          {markerPosition && <Marker position={markerPosition} />}
                        </GoogleMap>
                      </div>
                    )}
                  </div>

                  <div className='col-span-1 md:col-span-2 pt-6 border-t border-slate-100 flex gap-3'>
                    <button onClick={() => setIsModalOpen(false)} className='flex-1 bg-white text-slate-600 py-3.5 rounded-xl font-bold border border-slate-200 hover:bg-slate-50 transition-all'>Close</button>
                    <button onClick={() => setViewMode('edit')} className='flex-1 bg-slate-900 text-white py-3.5 rounded-xl font-bold hover:bg-slate-800 transition-all'>Edit Branch Details</button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSaveBranch} className='space-y-5 overflow-y-auto max-h-[60vh] pr-2'>
                  <div className='grid grid-cols-2 gap-4'>
                    <div className='col-span-2'>
                      <label className='block text-xs font-bold text-slate-500 uppercase mb-2'>Branch Name</label>
                      <input type='text' name='name' required className={`w-full p-3.5 bg-slate-50 border rounded-xl outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 ${fieldErrors.name ? 'border-red-500' : 'border-slate-200'}`} value={formData.name} onChange={handleInputChange} />
                      {fieldErrors.name && <p className="text-red-500 text-[10px] font-bold mt-1 animate-pulse">{fieldErrors.name}</p>}
                    </div>
                    
                    <div className='col-span-2'>
                      <label className='block text-xs font-bold text-slate-500 uppercase mb-2'>Verify Address (Google Places)</label>
                      {isLoaded ? (
                        <div className='space-y-3'>
                          <Autocomplete onLoad={onLoad} onPlaceChanged={onPlaceChanged}>
                            <input type='text' name='address' required className='w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500' value={formData.address} onChange={handleInputChange} placeholder='Search facility location...' />
                          </Autocomplete>
                          <div className='h-40 rounded-2xl overflow-hidden border border-slate-200 shadow-inner'>
                            <GoogleMap mapContainerStyle={{ width: '100%', height: '100%' }} center={mapCenter} zoom={markerPosition ? 15 : 10} options={{ disableDefaultUI: true, zoomControl: true }}>
                              {markerPosition && <Marker position={markerPosition} />}
                            </GoogleMap>
                          </div>
                        </div>
                      ) : (
                        <input type='text' name='address' required className='w-full p-3 bg-slate-50 border border-slate-200 rounded-lg' value={formData.address} onChange={handleInputChange} />
                      )}
                    </div>

                    <div>
                      <label className='block text-xs font-bold text-slate-500 uppercase mb-2'>Contact Number</label>
                      <input type='text' name='contact' required className={`w-full p-3.5 bg-slate-50 border rounded-xl outline-none focus:border-blue-500 ${fieldErrors.contact ? 'border-red-500' : 'border-slate-200'}`} value={formData.contact} onChange={handleInputChange} />
                      {fieldErrors.contact && <p className="text-red-500 text-[10px] font-bold mt-1 animate-pulse">{fieldErrors.contact}</p>}
                    </div>

                    <div>
                      <label className='block text-xs font-bold text-slate-500 uppercase mb-2'>Session Price (RM)</label>
                      <input type='number' name='session_price' min='0' step='0.01' className='w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500' value={formData.session_price} onChange={handleInputChange} placeholder="e.g. 150.00" />
                    </div>

                    <div className={`col-span-2 p-5 rounded-xl border transition-colors ${fieldErrors.time ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-200'}`}>
                      <div className='flex justify-between items-center mb-4'>
                        <h3 className={`text-xs font-bold uppercase tracking-widest ${fieldErrors.time ? 'text-red-600' : 'text-slate-500'}`}>Clinic Operating Hours</h3>
                        {fieldErrors.time && <span className='text-red-600 text-xs font-bold animate-pulse flex items-center gap-1'><FiXCircle /> {fieldErrors.time}</span>}
                      </div>
                      <div className='flex flex-col md:flex-row gap-4 items-end'>
                        <div className='flex-1 w-full'>
                          <label className='block text-xs font-bold text-slate-500 uppercase mb-2'>Active Days</label>
                          <select value={opDays} onChange={e => setOpDays(e.target.value)} className='w-full p-3 bg-white border border-slate-300 rounded-xl outline-none focus:border-blue-500 font-bold text-slate-800'>
                            <option value="Monday - Saturday">Monday - Saturday (Standard)</option>
                            <option value="Monday - Friday">Monday - Friday</option>
                            <option value="Everyday (Mon-Sun)">Everyday (Mon-Sun)</option>
                          </select>
                        </div>
                        <div className='w-full md:w-32'>
                          <label className='block text-xs font-bold text-slate-500 uppercase mb-2'>Opening</label>
                          <input type="time" required value={openTime} onChange={e => { setOpenTime(e.target.value); setFieldErrors(prev => ({...prev, time: ''})); }} className='w-full p-3 bg-white border border-slate-300 rounded-xl outline-none focus:border-blue-500 font-bold text-slate-800' />
                        </div>
                        <div className='w-full md:w-32'>
                          <label className='block text-xs font-bold text-slate-500 uppercase mb-2'>Closing</label>
                          <input type="time" required value={closeTime} onChange={e => { setCloseTime(e.target.value); setFieldErrors(prev => ({...prev, time: ''})); }} className='w-full p-3 bg-white border border-slate-300 rounded-xl outline-none focus:border-blue-500 font-bold text-slate-800' />
                        </div>
                      </div>
                    </div>

                    <div className='col-span-2'>
                      <label className='block text-xs font-bold text-slate-500 uppercase mb-2'>Assign Branch Manager</label>
                      <select name='manager_id' required className='w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 appearance-none' value={formData.manager_id} onChange={handleInputChange}>
                        <option value=''>Select available manager...</option>
                        {managers.map(m => (
                          <option key={m.user_email} value={m.user_id.toString()}>{m.user_fullname}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {error && <div className='p-3 bg-red-50 text-red-600 text-xs font-bold rounded-lg border border-red-100'>{error}</div>}

                  <div className='pt-6 flex gap-3'>
                    {viewMode === 'edit' ? (
                      <button type='button' onClick={() => setViewMode('view')} className='flex-1 py-3.5 border border-slate-200 rounded-xl font-bold text-slate-500 hover:bg-slate-50 transition-colors'>Cancel Edit</button>
                    ) : (
                      <button type='button' onClick={() => setIsModalOpen(false)} className='flex-1 py-3.5 border border-slate-200 rounded-xl font-bold text-slate-500 hover:bg-slate-50 transition-colors'>Cancel</button>
                    )}
                    <button type='submit' disabled={isSubmitting} className='flex-1 bg-blue-600 text-white py-3.5 rounded-xl font-bold hover:bg-blue-700 disabled:bg-blue-300 shadow-lg shadow-blue-500/20 transition-all'>
                      {isSubmitting ? 'Syncing...' : 'Save Branch'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
