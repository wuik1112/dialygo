'use client';

import { useState } from 'react';
import { calculateDistanceKm } from '../../utils/distance';

// Types representing your database structure
type Branch = {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  distanceKm?: number; // Optional property we will calculate on the fly
};

// MOCK DATA: In reality, you fetch this from your database on page load
const MOCK_BRANCHES: Branch[] = [
  { id: '1', name: 'Downtown Center', address: '100 Main St', lat: 5.4141, lng: 100.3288 },
  { id: '2', name: 'Northside Clinic', address: '450 North Blvd', lat: 5.4500, lng: 100.3000 },
  { id: '3', name: 'West End Facility', address: '88 West Ave', lat: 5.3900, lng: 100.2800 },
];

export default function PatientSearchPage() {
  const [addressInput, setAddressInput] = useState('');
  const [sortedBranches, setSortedBranches] = useState<Branch[]>(MOCK_BRANCHES);
  const [isSearching, setIsSearching] = useState(false);

  const handleSearch = async () => {
    if (!addressInput.trim()) return;
    setIsSearching(true);

    try {
      // ⚠️ PRODUCTION REALITY CHECK ⚠️
      // You MUST replace this mock function with a real API call to Google Maps Geocoding or Mapbox.
      // Example: const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${addressInput}&key=YOUR_API_KEY`);
      
      // Simulating an API returning coordinates for the patient's typed hotel/address
      const patientCoords = await mockGeocodeAPI(addressInput); 

      // 1. Calculate distance for every branch
      const branchesWithDistance = MOCK_BRANCHES.map(branch => {
        const dist = calculateDistanceKm(
          patientCoords.lat, 
          patientCoords.lng, 
          branch.lat, 
          branch.lng
        );
        return { ...branch, distanceKm: dist };
      });

      // 2. Sort branches by distance (closest first)
      const sorted = branchesWithDistance.sort((a, b) => (a.distanceKm || 0) - (b.distanceKm || 0));

      setSortedBranches(sorted);
    } catch (error) {
      console.error("Failed to find location", error);
      alert("Could not find that address. Please try again.");
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="p-6 max-w-2xl mx-auto font-sans">
      <h1 className="text-2xl font-bold mb-6 text-slate-800">Find a Nearest Branch</h1>
      
      {/* Search Input Area */}
      <div className="flex gap-2 mb-8">
        <input 
          type="text" 
          value={addressInput}
          onChange={(e) => setAddressInput(e.target.value)}
          placeholder="Enter your hotel, relative's house, or current address..." 
          className="flex-1 border border-slate-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button 
          onClick={handleSearch}
          disabled={isSearching}
          className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {isSearching ? 'Searching...' : 'Search'}
        </button>
      </div>

      {/* Results List */}
      <div className="space-y-4">
        {sortedBranches.map(branch => (
          <div key={branch.id} className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex justify-between items-center">
            <div>
              <h2 className="font-semibold text-lg text-slate-800">{branch.name}</h2>
              <p className="text-slate-500 text-sm">{branch.address}</p>
            </div>
            
            {/* Display the calculated distance if it exists */}
            {branch.distanceKm !== undefined && (
              <div className="text-right">
                <span className="block text-2xl font-bold text-blue-600">
                  {branch.distanceKm.toFixed(1)} <span className="text-sm font-normal text-slate-500">km</span>
                </span>
                <span className="text-xs text-slate-400">away</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// --- MOCK API FOR DEMONSTRATION ---
// Remove this in production and use a real Geocoding service
async function mockGeocodeAPI(address: string): Promise<{lat: number, lng: number}> {
  return new Promise((resolve) => {
    setTimeout(() => {
      // Just returning a dummy coordinate near the mock branches
      resolve({ lat: 5.4200, lng: 100.3100 }); 
    }, 800);
  });
}