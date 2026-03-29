'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { useLoadScript, Autocomplete, GoogleMap, Marker } from '@react-google-maps/api';
import { FiActivity, FiMapPin, FiHome, FiZoomIn, FiTrash2, FiLoader } from 'react-icons/fi';

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
  
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    contact: '',
    machines: '',
    manager_id: ''
  });

  async function fetchData() {
    setIsLoading(true);
    const { data: branchData } = await supabase.from('branches').select('*').order('id', { ascending: true });
    if (branchData) setBranches(branchData);

    const { data: managerData } = await supabase.from('users').select('*').eq('role_id', 2);
    if (managerData) setManagers(managerData);
    
    setIsLoading(false);
  }

  useEffect(() => {
    fetchData();
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const onLoad = (autoC: google.maps.places.Autocomplete) => {
    setAutocomplete(autoC);
  };

  const onPlaceChanged = () => {
    if (autocomplete !== null) {
      const place = autocomplete.getPlace();
      const selectedAddress = place.formatted_address || place.name || '';
      setFormData(prev => ({ ...prev, address: selectedAddress }));

      if (place.geometry && place.geometry.location) {
        const newLocation = {
          lat: place.geometry.location.lat(),
          lng: place.geometry.location.lng()
        };
        setMapCenter(newLocation);
        setMarkerPosition(newLocation);
      }
    }
  };

  const openAddModal = () => {
    setViewMode('add');
    setEditingId(null);
    setSelectedBranch(null);
    setFormData({ name: '', address: '', contact: '', machines: '', manager_id: '' });
    setMapCenter(defaultCenter);
    setMarkerPosition(null);
    setError('');
    setIsModalOpen(true);
  };

  const openDetailsModal = async (branch: any) => {
    setSelectedBranch(branch);
    setEditingId(branch.id);
    setViewMode('view');
    
    setFormData({
      name: branch.branch_name || '',
      address: branch.branch_address || '',
      contact: branch.branch_contact || '',
      machines: branch.total_machines ? branch.total_machines.toString() : '',
      manager_id: branch.manager_id ? branch.manager_id.toString() : ''
    });
    
    setMapCenter(defaultCenter);
    setMarkerPosition(null);
    setError('');
    
    const { count: staffCount } = await supabase.from('users').select('*', { count: 'exact', head: true }).eq('branch_id', branch.id);
    const today = new Date().toISOString().split('T')[0];
    const { count: bookingCount } = await supabase.from('bookings').select('*', { count: 'exact', head: true }).eq('branch_id', branch.id).gte('booking_date', today).in('status', ['CONFIRMED', 'PENDING_REVIEW']);
    
    setBranchStats({
      staff: staffCount || 0,
      bookings: bookingCount || 0
    });

    if (isLoaded && window.google) {
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
    setIsSubmitting(true);
    setError('');

    if (!formData.name.trim() || !formData.address.trim() || !formData.contact.trim() || !formData.machines) {
      setError('Error: All fields are required and cannot be blank.');
      setIsSubmitting(false);
      return;
    }

    const contactRegex = /^[\d\s\-\+\(\)]{8,20}$/;
    if (!contactRegex.test(formData.contact.trim())) {
      setError('Error: Please enter a valid contact number (e.g., 03-12345678).');
      setIsSubmitting(false);
      return;
    }

    const machineCount = parseInt(formData.machines);
    if (isNaN(machineCount) || machineCount < 1) {
      setError('Error: Total machines must be a valid number greater than 0.');
      setIsSubmitting(false);
      return;
    }

    const isDuplicate = branches.some(b => 
      b.id !== editingId && 
      (b.branch_name.toLowerCase() === formData.name.trim().toLowerCase() || 
       b.branch_address.toLowerCase() === formData.address.trim().toLowerCase())
    );

    if (isDuplicate) {
      setError('Error: A branch with this name or location already exists.');
      setIsSubmitting(false);
      return;
    }

    const payload: any = {
      branch_name: formData.name.trim(),
      branch_address: formData.address.trim(),
      branch_contact: formData.contact.trim(),
      total_machines: machineCount,
      manager_id: formData.manager_id ? parseInt(formData.manager_id) : null
    };

    if (viewMode === 'edit' && editingId && selectedBranch) {
      const machineDifference = machineCount - selectedBranch.total_machines;
      const newAvailableSlots = selectedBranch.available_slots + machineDifference;
      
      payload.available_slots = newAvailableSlots < 0 ? 0 : newAvailableSlots;

      const { error: updateError } = await supabase.from('branches').update(payload).eq('id', editingId);
      
      if (updateError) {
        setError(`Update failed: ${updateError.message}`);
        setIsSubmitting(false);
        return;
      }
    } else if (viewMode === 'add') {
      payload.available_slots = machineCount;
      payload.status = 'Active';

      const { error: insertError } = await supabase.from('branches').insert([payload]);
      
      if (insertError) {
        if (insertError.message.includes('branches_pkey')) {
          setError('System Error: Database ID conflict. Please run the SQL reset script to resync the ID counter.');
        } else {
          setError(`Creation failed: ${insertError.message}`);
        }
        setIsSubmitting(false);
        return;
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
      alert(`Cannot deactivate branch. There are ${bookingCount || 0} active future bookings and ${staffCount || 0} assigned staff.`);
      return;
    }

    if (window.confirm('Deactivate this branch?')) {
      await supabase.from('branches').update({ status: 'Inactive' }).eq('id', branchId);
      await fetchData();
    }
  };

  const handleReactivate = async (branch: any) => {
    await supabase.from('branches').update({ status: 'Active' }).eq('id', branch.id);
    await fetchData();
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
            <p className='text-slate-500 mt-1 font-medium'>Control and monitor all clinical facilities</p>
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
            const assignedManager = managers.find(m => m.user_id === branch.manager_id);

            return (
              <div key={branch.id} className={`bg-white p-6 rounded-2xl border ${isActive ? 'border-slate-200' : 'border-red-100 bg-red-50/20'} shadow-sm flex flex-col hover:shadow-md transition-shadow`}>
                <div className='flex justify-between items-start mb-4'>
                  <h2 className='text-lg font-bold text-slate-800 truncate w-2/3'>{branch.branch_name}</h2>
                  <span className={`px-3 py-1 text-[10px] uppercase tracking-widest font-bold rounded-full ${isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                    {branch.status || 'Active'}
                  </span>
                </div>
                
                <div className='space-y-4 flex-1 mb-6'>
                  <div className='flex items-start gap-3'>
                    <div className='mt-1 text-slate-400'><FiMapPin /></div>
                    <p className='text-sm text-slate-600 line-clamp-2 leading-relaxed'>{branch.branch_address}</p>
                  </div>
                  
                  <div>
                    <div className='flex justify-between text-[11px] font-bold text-slate-400 uppercase tracking-tighter mb-1.5'>
                      <span>Machine Utilization</span>
                      <span>{branch.total_machines - branch.available_slots} / {branch.total_machines}</span>
                    </div>
                    <div className='w-full bg-slate-100 rounded-full h-2'>
                      <div className={`${isActive ? 'bg-blue-500' : 'bg-slate-300'} h-2 rounded-full transition-all`} style={{ width: `${((branch.total_machines - branch.available_slots) / branch.total_machines) * 100}%` }}></div>
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
                    <div>
                      <h3 className='text-[10px] font-bold text-blue-500 uppercase tracking-widest mb-1'>Contact Number</h3>
                      <p className='text-sm text-slate-800'>{selectedBranch.branch_contact}</p>
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
                          <p className='text-[10px] font-bold text-slate-400 uppercase'>Total Machines</p>
                          <p className='text-lg font-black text-slate-800'>{selectedBranch.total_machines}</p>
                        </div>
                        <div className='bg-white p-3 rounded-xl border border-slate-100 shadow-sm'>
                          <p className='text-[10px] font-bold text-slate-400 uppercase'>Available Slots</p>
                          <p className='text-lg font-black text-emerald-600'>{selectedBranch.available_slots}</p>
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
                      <input type='text' name='name' required className='w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10' value={formData.name} onChange={handleInputChange} />
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
                      <input type='text' name='contact' required className='w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500' value={formData.contact} onChange={handleInputChange} />
                    </div>

                    <div>
                      <label className='block text-xs font-bold text-slate-500 uppercase mb-2'>Total Machines</label>
                      <input type='number' name='machines' min='1' required className='w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500' value={formData.machines} onChange={handleInputChange} />
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