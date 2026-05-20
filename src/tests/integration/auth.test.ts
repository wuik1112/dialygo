// src/tests/integration/auth.test.ts
import { createClient } from '@supabase/supabase-js';
import fetch from 'cross-fetch';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
  global: { fetch: fetch }
});

describe('Integration Test: Identity Management (T002)', () => {
  
  it('should reject invalid login credentials via Supabase Auth API', async () => {
    
    // 1. ARRANGE: Use your real email but a fake password
    const email = 'khooiuwan@gmail.com';
    const fakePassword = 'WrongPassword123!';

    // 2. ACT: Attempt to integrate with Supabase Auth
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email,
      password: fakePassword,
    });

    // 3. ASSERT: The external database API must reject it
    expect(error).not.toBeNull();
    expect(error?.message).toContain('Invalid login credentials');
  });
});