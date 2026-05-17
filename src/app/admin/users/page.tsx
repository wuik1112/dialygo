'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { useLoadScript, Autocomplete, GoogleMap, Marker } from '@react-google-maps/api';
import { FiArrowUp, FiArrowDown, FiMinus, FiActivity, FiCheckCircle} from 'react-icons/fi';

const roleMap: Record<number, string> = {
  1: 'HQ Admin',
  2: 'Branch Manager',
  3: 'Nephrologist',
  4: 'Nurse',
  5: 'Patient'
};

const extractDOBFromIC = (icString: string) => {
    // Make sure we have at least 6 characters before trying to parse
    if (!icString || icString.length < 6) return null;
    
    const yy = parseInt(icString.substring(0, 2), 10);
    const mm = icString.substring(2, 4);
    const dd = icString.substring(4, 6);
    
    // Determine the century (Assuming any YY above the current year's last 2 digits is from the 1900s)
    const currentYearTwoDigits = new Date().getFullYear() % 100;
    const fullYear = yy > currentYearTwoDigits ? `19${icString.substring(0,2)}` : `20${icString.substring(0,2)}`;
    
    return `${fullYear}-${mm}-${dd}`; // Returns format: YYYY-MM-DD
  };

const libraries: any = ['places'];
const defaultCenter = { lat: 5.4141, lng: 100.3288 };

// Helper to safely extract Supabase relational data whether it returns as an array or object
const getRelationalData = (data: any) => Array.isArray(data) ? data[0] : data;

export default function UserManagement() {
  const [users, setUsers] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Google Maps Script
  const { isLoaded } = useLoadScript({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY as string,
    libraries: libraries,
  });

  const [autocomplete, setAutocomplete] = useState<google.maps.places.Autocomplete | null>(null);
  const [mapCenter, setMapCenter] = useState(defaultCenter);
  const [markerPosition, setMarkerPosition] = useState<{lat: number, lng: number} | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'All' | 'Active' | 'Inactive'>('All');
  const [filterRole, setFilterRole] = useState<number | 'All'>('All');
  const [filterBranch, setFilterBranch] = useState<number | 'All' | 'Network'>('All');

  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' }>({ key: 'user_fullname', direction: 'asc' });
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [formData, setFormData] = useState({
    email: '',
    password: '',
    fullname: '',
    ic: '',
    gender: '',
    contact_number: '',
    role_id: '',
    branch_id: '',
    patient_address: '',
    blood_type: '',
    license_number: '',
    max_hours: '48',
    employment_status: 'Full-Time'
  });

  async function fetchData() {
    setIsLoading(true);
    const [usersRes, branchesRes] = await Promise.all([
      supabase.from('users').select('*, patients(*), staff(*)').order('user_id', { ascending: false }),
      supabase.from('branches').select('id, branch_name')
    ]);

    if (usersRes.data) setUsers(usersRes.data);
    if (branchesRes.data) setBranches(branchesRes.data);
    setIsLoading(false);
  }

  useEffect(() => {
    fetchData();
  }, []);

  // Reset to page 1 whenever filters are changed
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterStatus, filterRole, filterBranch]);
  
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    let newValue = value;

    // RESTRICT: Numbers only for specific fields
    if (name === 'contact_number' || name === 'max_hours' || name === 'ic') {
      newValue = value.replace(/\D/g, ''); 
    }

    setFormData(prev => ({ ...prev, [name]: newValue }));
    validateField(name, newValue);
  };

  const validateField = (name: string, value: string) => {
    let err = '';

    // --- IC Validation (12 digits + Uniqueness) ---
    if (name === 'ic') {
      if (value.length > 0 && value.length !== 12) {
        err = 'IC must be exactly 12 digits.';
      } else if (users.some(u => u.user_id !== editingId && u.user_ic === value)) {
        err = 'This IC is already registered to another account.';
      }
    }

    // --- Phone Validation (10-11 digits + Uniqueness) ---
    if (name === 'contact_number') {
      if (value.length > 0 && (value.length < 10 || value.length > 11)) {
        err = 'Phone must be 10-11 digits.';
      } else if (users.some(u => u.user_id !== editingId && u.user_contact_number === value)) {
        err = 'This phone number is already in use.';
      }
    }

    // --- Email Validation (Format + Uniqueness) ---
    if (name === 'email') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (value.length > 0 && !emailRegex.test(value)) {
        err = 'Invalid email format.';
      } else if (users.some(u => u.user_id !== editingId && u.user_email.toLowerCase() === value.toLowerCase())) {
        err = 'This email is already registered.';
      }
    }

    // --- Numeric Fields (General Example: Max Hours) ---
    if (name === 'max_hours' && isNaN(Number(value))) {
      err = 'Please enter numbers only.';
    }

    setFieldErrors(prev => ({ ...prev, [name]: err }));
  };

  const onPlaceChanged = () => {
    if (autocomplete !== null) {
      const place = autocomplete.getPlace();
      const address = place.formatted_address || place.name || '';
      setFormData(prev => ({ ...prev, patient_address: address }));

      if (place.geometry && place.geometry.location) {
        const loc = { lat: place.geometry.location.lat(), lng: place.geometry.location.lng() };
        setMapCenter(loc);
        setMarkerPosition(loc);
      }
    }
  };

  const openAddModal = () => {
    setEditingId(null);
    setFieldErrors({});
    setMarkerPosition(null);
    setFormData({ 
      email: '', password: '', fullname: '', ic: '', gender: '', contact_number: '', role_id: '', branch_id: '',
      patient_address: '', blood_type: '', license_number: '', max_hours: '48', employment_status: 'Full-Time'
    });
    setError('');
    setSuccessMessage('');
    setIsModalOpen(true);
  };

  const openEditModal = (user: any) => {
    setEditingId(user.user_id);
    setFieldErrors({});
    
    // Use the helper to safely extract the data whether it's an array or object
    const pData = getRelationalData(user.patients);
    const sData = getRelationalData(user.staff);

    setFormData({
      email: user.user_email || '',
      password: '', 
      fullname: user.user_fullname || '',
      ic: user.user_ic || '',
      gender: user.user_gender || '',
      contact_number: user.user_contact_number || '',
      role_id: user.role_id?.toString() || '',
      branch_id: user.branch_id?.toString() || '',
      patient_address: pData?.patient_address || '',
      blood_type: pData?.patient_blood_type || '',
      license_number: sData?.professional_license_number || '',
      max_hours: sData?.max_weekly_hours?.toString() || '48',
      employment_status: sData?.employment_status || 'Full-Time'
    });
    
    setError('');
    setIsModalOpen(true);
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const hasErrors = Object.values(fieldErrors).some(msg => msg !== '');
    if (hasErrors) {
      setError('Please correct the highlighted errors before saving.');
      return;
    }

    setIsSubmitting(true);
    setError('');

    const isDuplicateEmail = users.some(u => u.user_id !== editingId && u.user_email.toLowerCase() === formData.email.trim().toLowerCase());
    if (isDuplicateEmail) {
      setFieldErrors(prev => ({ ...prev, email: 'Email is already taken.' }));
      setIsSubmitting(false);
      return;
    }

    const isDuplicateIC = users.some(u => u.user_id !== editingId && u.user_ic === formData.ic.trim());
    if (isDuplicateIC) {
      setFieldErrors(prev => ({ ...prev, ic: 'IC is already registered.' }));
      setIsSubmitting(false);
      return;
    }

    const patientDob = extractDOBFromIC(formData.ic.trim());

    const roleIdNum = parseInt(formData.role_id);
    const userPayload: any = {
      user_email: formData.email.trim(),
      user_fullname: formData.fullname.trim(),
      user_ic: formData.ic.trim(),
      user_gender: formData.gender || null,
      user_contact_number: formData.contact_number.trim(),
      role_id: roleIdNum,
      branch_id: formData.branch_id ? parseInt(formData.branch_id) : null,
      user_date_of_birth: patientDob
    };

    try {
      let targetUserId = editingId;

      if (editingId) {
        if (formData.password.trim()) {
          const authRes = await fetch('/api/admin/update-user', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: formData.email.trim(), password: formData.password.trim() })
          });
          if (!authRes.ok) throw new Error("Auth update failed.");
        }
        const { error: uErr } = await supabase.from('users').update(userPayload).eq('user_id', editingId);
        if (uErr) throw uErr;
      } else {
        const authRes = await fetch('/api/admin/create-user', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: formData.email.trim(), password: formData.password.trim() })
        });

        if (!authRes.ok) {
          const errBody = await authRes.json();
          throw new Error(errBody.error || "Secure auth creation failed.");
        }

        const { data: newUser, error: insertError } = await supabase
          .from('users')
          .insert([{ ...userPayload, user_password: formData.password.trim() }])
          .select();
          
        if (insertError) throw insertError;
        targetUserId = newUser[0].user_id;
      }
      
      if (roleIdNum === 5) {
        const pPayload = {
          user_id: targetUserId,
          home_branch_id: userPayload.branch_id,
          patient_address: formData.patient_address.trim(),
          patient_blood_type: formData.blood_type
        };
        await supabase.from('patients').upsert([pPayload], { onConflict: 'user_id' });
      } else {
        const sPayload = {
          user_id: targetUserId,
          professional_license_number: formData.license_number.trim(),
          max_weekly_hours: parseInt(formData.max_hours),
          employment_status: formData.employment_status
        };
        // Removed duplicated database call
        const { error } = await supabase.from('staff').upsert([sPayload], { onConflict: 'user_id' });
        if (error) console.error("Update error:", error);
      }

      setIsModalOpen(false);
      await fetchData();
      if (!editingId) {
        setSuccessMessage('User account created successfully.');
        setTimeout(() => setSuccessMessage(''), 5000); 
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleUserStatus = async (user: any) => {
    const action = user.user_is_active ? 'Deactivate' : 'Reactivate';
    
    if (window.confirm(`${action} account for ${user.user_fullname}?`)) {
      try {
        const { error: updateError } = await supabase
          .from('users')
          .update({ user_is_active: !user.user_is_active })
          .eq('user_id', user.user_id);

        if (updateError) throw updateError;

        if (!user.user_is_active) {
          const emailRes = await fetch('/api/admin/notify-reactivation', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              email: user.user_email, 
              fullname: user.user_fullname 
            })
          });

          if (!emailRes.ok) {
             console.warn("Account reactivated, but failed to send email.");
          }

          setSuccessMessage(`${user.user_fullname}'s account reactivated and notification email sent.`);
        } else {
          setSuccessMessage(`${user.user_fullname}'s account deactivated successfully.`);
        }

        setTimeout(() => setSuccessMessage(''), 5000); // Clear message after 5 seconds
        await fetchData();
        
      } catch (err: any) {
        setError(err.message || `Failed to change user status.`);
      }
    }
  };

  const handleSort = (key: string) => {
    const direction = (sortConfig.key === key && sortConfig.direction === 'asc') ? 'desc' : 'asc';
    setSortConfig({ key, direction });
  };

  // Fixed filtering logic with proper type casting and null checks
  const filteredUsers = users.filter(u => {
    const fullName = u.user_fullname || '';
    const ic = u.user_ic || '';
    
    const matchesSearch = fullName.toLowerCase().includes(searchQuery.toLowerCase()) || ic.includes(searchQuery);
    const matchesStatus = filterStatus === 'All' || (filterStatus === 'Active' ? u.user_is_active : !u.user_is_active);
    const matchesRole = filterRole === 'All' || Number(u.role_id) === Number(filterRole);
    const matchesBranch = filterBranch === 'All' || (filterBranch === 'Network' ? !u.branch_id : Number(u.branch_id) === Number(filterBranch));
    
    return matchesSearch && matchesStatus && matchesRole && matchesBranch;
  });

  const sortedUsers = [...filteredUsers].sort((a, b) => {
    const aVal = (a[sortConfig.key] || '').toString().toLowerCase();
    const bVal = (b[sortConfig.key] || '').toString().toLowerCase();
    return sortConfig.direction === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
  });

  const totalPages = Math.ceil(sortedUsers.length / itemsPerPage);
  const currentUsers = sortedUsers.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const SortIcon = ({ columnKey }: { columnKey: string }) => {
    if (sortConfig.key !== columnKey) return <FiMinus className="text-slate-300 ml-1 inline-block" />;
    return sortConfig.direction === 'asc' ? <FiArrowUp className="text-blue-600 ml-1 inline-block" /> : <FiArrowDown className="text-blue-600 ml-1 inline-block" />;
  };

  if (isLoading) {
    return (
      <div className='min-h-screen bg-slate-50 flex items-center justify-center'>
        <div className='flex flex-col items-center text-blue-600 font-bold'>
          <FiActivity className='text-4xl mb-4 animate-spin' />
          <span>Fetching DialyGo Users' Data...</span>
        </div>
      </div>
    );
  }

  return (
    <main className='p-8 bg-slate-50 min-h-screen font-sans relative'>
      <div className='max-w-7xl mx-auto'>
        <div className='flex justify-between items-center mb-8'>
          <div>
            <h1 className='text-3xl font-bold text-slate-800 tracking-tight'>User Accounts Management</h1>
          </div>
          <button onClick={openAddModal} className='bg-blue-600 text-white px-5 py-2.5 rounded-xl font-semibold hover:bg-blue-700 transition-all'>+ Add User</button>
        </div>
        
        {successMessage && (
          <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-300 shadow-sm">
            <FiCheckCircle className="text-emerald-600 text-xl" />
            <p className="text-sm font-bold text-emerald-700">{successMessage}</p>
          </div>
        )}

        {/* Filters Panel */}
        <div className='bg-white p-5 rounded-2xl shadow-sm border border-slate-200 mb-6 grid grid-cols-1 md:grid-cols-4 gap-4'>
            <input type="text" placeholder="Search Directory..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className='w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:border-blue-500' />
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as any)} className='w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none'>
              <option value="All">All Statuses</option>
              <option value="Active">Active Only</option>
              <option value="Inactive">Inactive Only</option>
            </select>
            <select value={filterRole} onChange={(e) => setFilterRole(e.target.value === 'All' ? 'All' : parseInt(e.target.value))} className='w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none'>
              <option value="All">All Roles</option>
              {Object.entries(roleMap).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
            <select value={filterBranch} onChange={(e) => setFilterBranch(e.target.value === 'All' || e.target.value === 'Network' ? e.target.value : parseInt(e.target.value))} className='w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none'>
              <option value="All">All Assignments</option>
              <option value="Network">HQ / Network</option>
              {branches.map(b => <option key={b.id} value={b.id}>{b.branch_name}</option>)}
            </select>
        </div>

        {/* Table Data */}
        <div className='bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden'>
          <table className='min-w-full divide-y divide-slate-200'>
            <thead className='bg-slate-50'>
              <tr className='text-xs font-bold text-slate-500 uppercase tracking-wider'>
                <th onClick={() => handleSort('user_fullname')} className='px-6 py-4 text-left cursor-pointer'>User Profile <SortIcon columnKey="user_fullname" /></th>
                <th onClick={() => handleSort('user_ic')} className='px-6 py-4 text-left cursor-pointer'>Identity <SortIcon columnKey="user_ic" /></th>
                <th onClick={() => handleSort('role_id')} className='px-6 py-4 text-left cursor-pointer'>Role & Branch <SortIcon columnKey="role_id" /></th>
                <th onClick={() => handleSort('user_is_active')} className='px-6 py-4 text-left cursor-pointer'>Status <SortIcon columnKey="user_is_active" /></th>
                <th className='px-6 py-4 text-right'>Actions</th>
              </tr>
            </thead>
            <tbody className='bg-white divide-y divide-slate-100'>
              {currentUsers.map((user) => (
                <tr key={user.user_id} className='hover:bg-slate-50/50 transition-colors'>
                  <td className='px-6 py-4 whitespace-nowrap'>
                    <div className='flex items-center'>
                      <div className='h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold'>{user.user_fullname?.[0] || '?'}</div>
                      <div className='ml-4'>
                        <p className='text-sm font-bold text-slate-900'>{user.user_fullname}</p>
                        <p className='text-xs text-slate-500'>{user.user_email}</p>
                      </div>
                    </div>
                  </td>
                  <td className='px-6 py-4'>
                    <p className='text-sm text-slate-900 font-medium'>{user.user_ic}</p>
                    <p className='text-xs text-slate-400'>{user.user_gender || 'Unspecified'}</p>
                  </td>
                  <td className='px-6 py-4'>
                    <span className='px-2 py-1 bg-blue-50 text-blue-700 text-[10px] font-bold rounded uppercase'>{roleMap[user.role_id]}</span>
                    
                    {/* Added the license number display to the main interface table */}
                    {getRelationalData(user.staff)?.professional_license_number && (
                      <span className='ml-2 text-[10px] text-slate-400 font-mono'>
                        Lic: {getRelationalData(user.staff).professional_license_number}
                      </span>
                    )}

                    <p className='text-xs text-slate-400 mt-1'>{branches.find(b => b.id === user.branch_id)?.branch_name || 'Network Wide'}</p>
                  </td>
                  <td className='px-6 py-4'>
                    <span className={`px-2 py-1 text-[10px] font-bold rounded-full ${user.user_is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                      {user.user_is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className='px-6 py-4 text-right text-sm font-bold'>
                    <button onClick={() => openEditModal(user)} className='text-blue-600 mr-4'>Edit</button>
                    <button onClick={() => toggleUserStatus(user)} className={user.user_is_active ? 'text-red-500' : 'text-emerald-500'}>{user.user_is_active ? 'Deactivate' : 'Reactivate'}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {totalPages > 1 && (
            <div className='px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between'>
              <span className='text-xs font-bold text-slate-500'>Page {currentPage} of {totalPages}</span>
              <div className='flex gap-2'>
                <button 
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))} 
                  disabled={currentPage === 1}
                  className='px-4 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold disabled:opacity-50'
                >
                  Previous
                </button>
                <button 
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} 
                  disabled={currentPage === totalPages}
                  className='px-4 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold disabled:opacity-50'
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {isModalOpen && (
        <div className='fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4'>
          <div className='bg-white rounded-3xl shadow-2xl w-full max-w-3xl overflow-hidden animate-in fade-in zoom-in duration-200'>
            <div className='px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50'>
              <h2 className='text-xl font-extrabold text-slate-900'>{editingId ? 'Edit User Profile' : 'Add User'}</h2>
              <button onClick={() => setIsModalOpen(false)} className='text-slate-400 text-2xl'>&times;</button>
            </div>
            
            <form onSubmit={handleSaveUser} className='p-8 overflow-y-auto max-h-[75vh]'>
              <div className='mb-6'>
                <h3 className='text-sm font-bold text-slate-800 border-b border-slate-200 pb-2 mb-4'>Core Identity</h3>
                <div className='grid grid-cols-2 gap-5'>
                  <div className='col-span-2 md:col-span-1'>
                    <label className='block text-xs font-bold text-slate-500 uppercase mb-2'>Full Name</label>
                    <input type='text' name='fullname' required className='w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none' value={formData.fullname} onChange={handleInputChange} />
                  </div>
                  <div className='col-span-2 md:col-span-1'>
                    <label className='block text-xs font-bold text-slate-500 uppercase mb-2'>Email Address</label>
                    <input type='email' name='email' required className={`w-full p-3 bg-slate-50 border rounded-xl outline-none ${fieldErrors.email ? 'border-red-500' : 'border-slate-200'}`} value={formData.email} onChange={handleInputChange} />
                    {fieldErrors.email && <p className="text-red-500 text-[10px] font-bold mt-1 animate-pulse">{fieldErrors.email}</p>}
                  </div>
                  <div>
                    <label className='block text-xs font-bold text-slate-500 uppercase mb-2'>Identity Card (IC)</label>
                    <input type='text' name='ic' required maxLength={12} className={`w-full p-3 bg-slate-50 border rounded-xl outline-none ${fieldErrors.ic ? 'border-red-500' : 'border-slate-200'}`} value={formData.ic} onChange={handleInputChange} />
                    {fieldErrors.ic && <p className="text-red-500 text-[10px] font-bold mt-1 animate-pulse">{fieldErrors.ic}</p>}</div>
                  <div>
                    <label className='block text-xs font-bold text-slate-500 uppercase mb-2'>Contact Number</label>
                    <input type='text' name='contact_number' required maxLength={11} className={`w-full p-3 bg-slate-50 border rounded-xl outline-none ${fieldErrors.contact_number ? 'border-red-500' : 'border-slate-200'}`} value={formData.contact_number} onChange={handleInputChange} />
                    {fieldErrors.contact_number && <p className="text-red-500 text-[10px] font-bold mt-1 animate-pulse">{fieldErrors.contact_number}</p>}
                  </div>
                  <div>
                    <label className='block text-xs font-bold text-slate-500 uppercase mb-2'>Gender</label>
                    <select name='gender' className='w-full p-3 bg-slate-50 border border-slate-200 rounded-xl' value={formData.gender} onChange={handleInputChange}>
                      <option value=''>Select...</option>
                      <option value='Male'>Male</option>
                      <option value='Female'>Female</option>
                    </select>
                  </div>
                  <div>
                    <label className='block text-xs font-bold text-slate-500 uppercase mb-2'>Login Password</label>
                    <input type='password' name='password' required={!editingId} className='w-full p-3 bg-slate-50 border border-slate-200 rounded-xl' value={formData.password} onChange={handleInputChange} placeholder={editingId ? '••••••••' : ''} />
                  </div>
                </div>
              </div>

              <div className='mb-6'>
                <h3 className='text-sm font-bold text-slate-800 border-b border-slate-200 pb-2 mb-4'>System Access</h3>
                <div className='grid grid-cols-2 gap-5'>
                  <select name='role_id' required className='p-3 bg-blue-50 border border-blue-100 text-blue-800 font-bold rounded-xl' value={formData.role_id} onChange={handleInputChange}>
                    <option value=''>Select Role</option>
                    {Object.entries(roleMap).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                  </select>
                  <select name='branch_id' className='p-3 bg-slate-50 border border-slate-200 rounded-xl' value={formData.branch_id} onChange={handleInputChange}>
                    <option value=''>Network Wide / HQ</option>
                    {branches.map(b => <option key={b.id} value={b.id.toString()}>{b.branch_name}</option>)}
                  </select>
                </div>
              </div>

              {['1', '2', '3', '4'].includes(formData.role_id) && (
                <div className='mb-6 animate-in fade-in slide-in-from-top-4 duration-300'>
                  <h3 className='text-sm font-bold text-blue-800 border-b border-blue-200 pb-2 mb-4'>Professional Profile</h3>
                  <div className='bg-blue-50/50 p-5 rounded-2xl border border-blue-100 grid grid-cols-3 gap-4'>
                    <div className='col-span-3 md:col-span-1'>
                      <label className='block text-[10px] font-bold text-slate-400 uppercase mb-1'>License No.</label>
                      <input type='text' name='license_number' className='w-full p-2.5 bg-white border border-blue-100 rounded-lg outline-none' value={formData.license_number} onChange={handleInputChange} placeholder="MMC-XXXXX" />
                    </div>
                    <div className='col-span-3 md:col-span-1'>
                      <label className='block text-[10px] font-bold text-slate-400 uppercase mb-1'>Max Weekly Hours</label>
                      <input type='text' name='max_hours' className='w-full p-2.5 bg-white border border-blue-100 rounded-lg outline-none' value={formData.max_hours} onChange={handleInputChange} />
                      {fieldErrors.max_hours && <p className='text-red-500 text-[9px] font-bold mt-1'>{fieldErrors.max_hours}</p>}
                    </div>
                    <div className='col-span-3 md:col-span-1'>
                      <label className='block text-[10px] font-bold text-slate-400 uppercase mb-1'>Employment</label>
                      <select name='employment_status' className='w-full p-2.5 bg-white border border-blue-100 rounded-lg outline-none' value={formData.employment_status} onChange={handleInputChange}>
                        <option value='Full-Time'>Full-Time</option>
                        <option value='Part-Time'>Part-Time</option>
                        <option value='Contract'>Contract</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {formData.role_id === '5' && (
                <div className='mb-6 animate-in fade-in slide-in-from-top-4 duration-300'>
                  <h3 className='text-sm font-bold text-emerald-700 border-b border-emerald-200 pb-2 mb-4'>Patient Logistics</h3>
                  <div className='bg-emerald-50/50 p-5 rounded-2xl border border-emerald-100 space-y-4'>
                    <div>
                      <label className='block text-[10px] font-bold text-slate-400 uppercase mb-1'>Home Address (Search Google)</label>
                      {isLoaded ? (
                        <Autocomplete onLoad={c => setAutocomplete(c)} onPlaceChanged={onPlaceChanged}>
                          <input type='text' name='patient_address' required className='w-full p-3 bg-white border border-emerald-100 rounded-xl outline-none' value={formData.patient_address} onChange={handleInputChange} placeholder='Search location...' />
                        </Autocomplete>
                      ) : (
                        <input type='text' name='patient_address' required className='w-full p-3 bg-white border border-emerald-100 rounded-xl' value={formData.patient_address} onChange={handleInputChange} />
                      )}
                    </div>
                    
                    {isLoaded && (
                      <div className='h-40 rounded-xl overflow-hidden border border-emerald-100'>
                        <GoogleMap mapContainerStyle={{ width: '100%', height: '100%' }} center={mapCenter} zoom={markerPosition ? 15 : 10} options={{ disableDefaultUI: true }}>
                          {markerPosition && <Marker position={markerPosition} />}
                        </GoogleMap>
                      </div>
                    )}

                    <div>
                      <label className='block text-[10px] font-bold text-slate-400 uppercase mb-1'>Blood Type</label>
                      <select name='blood_type' required className='w-full p-3 bg-white border border-emerald-100 rounded-xl' value={formData.blood_type} onChange={handleInputChange}>
                        <option value=''>Select...</option>
                        {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {error && <div className='p-3 bg-red-50 text-red-600 text-xs font-bold rounded-lg border border-red-100 mb-4'>{error}</div>}

              <div className='flex gap-3'>
                <button type='button' onClick={() => setIsModalOpen(false)} className='flex-1 py-3.5 border border-slate-200 rounded-xl font-bold text-slate-500 hover:bg-slate-50'>Cancel</button>
                <button type='submit' disabled={isSubmitting} className='flex-1 bg-blue-600 text-white py-3.5 rounded-xl font-bold hover:bg-blue-700 shadow-lg shadow-blue-500/20 disabled:opacity-50'>
                  {isSubmitting ? 'Syncing...' : editingId ? 'Save Changes' : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}