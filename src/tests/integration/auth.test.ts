import { createClient } from '@supabase/supabase-js';
import fetch from 'cross-fetch';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!, 
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, 
  { global: { fetch: fetch } }
);

describe('Integration Test: Identity Management (T002)', () => {
  
  it('should reject invalid login credentials via Supabase Auth API', async () => {
    
    const targetEmail = 'khooiuwan@gmail.com'; 
    const fakePassword = 'WrongPassword123!';

    const { data, error } = await supabase.auth.signInWithPassword({
      email: targetEmail,
      password: fakePassword,
    });

    expect(error).not.toBeNull();
    expect(error?.message).toBe('Invalid login credentials');
    expect(data.user).toBeNull();
  });
});