import fetch from 'cross-fetch';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

describe('Integration Test: External Service API (T051)', () => {
  
  it('should securely fetch and parse driving distance/duration from Google Maps API', async () => {
    
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY; 
    
    if (!apiKey) {
      console.warn('Skipping Google Maps test: API Key not found in .env.local');
      return;
    }

    const origin = 'Universiti Sains Malaysia, Penang, Malaysia';
    const destination = 'Hospital Pulau Pinang, Malaysia';

    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(origin)}&destinations=${encodeURIComponent(destination)}&key=${apiKey}`;

    const response = await fetch(url);
    const data = await response.json();

    expect(response.status).toBe(200);
    
    expect(data.status).toBe('OK');
    expect(data.rows[0].elements[0].status).toBe('OK');

    const distanceText = data.rows[0].elements[0].distance.text; 
    const durationText = data.rows[0].elements[0].duration.text; 

    expect(distanceText).toBeDefined();
    expect(distanceText).toContain('km');
    expect(durationText).toBeDefined();
    expect(durationText).toContain('min');
  });
});
