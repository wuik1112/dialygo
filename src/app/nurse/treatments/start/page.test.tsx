import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import StartTreatmentWorkstation from './page';

// 1. Mock Next.js Router
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => new URLSearchParams({ patient_id: '1', booking_id: '1' }),
}));

// 2. Mock Supabase 
jest.mock('../../../../lib/supabase', () => ({
  supabase: {
    auth: { getSession: jest.fn().mockResolvedValue({ data: { session: { user: { email: 'nurse@test.com' } } } }) },
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({ data: null }),
    single: jest.fn().mockResolvedValue({ 
      data: { 
        users: { user_fullname: 'Test Patient', user_ic: '123' },
        prescriptions: [{ status: 'Active', target_dry_weight: 60 }] 
      } 
    }),
  }
}));

describe('Nurse UI: Clinical Safety Locks', () => {

  it('should disable the Commence Treatment button and show a warning if BP exceeds 180', async () => {
    
    await act(async () => {
      render(<StartTreatmentWorkstation />);
    });

    const sysInput = await screen.findByPlaceholderText('120'); 
    const commenceButton = screen.getByRole('button', { name: /Commence Treatment/i });

    fireEvent.change(sysInput, { target: { value: '190' } });

    expect(commenceButton).toBeDisabled();
    expect(screen.getByText('Vitals exceed safe limits.')).toBeInTheDocument();
  });

});