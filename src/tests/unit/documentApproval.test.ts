import { validateManagerApproval } from '@/utils/validationHelpers';

describe('Unit Test: Missing Documents Lock (T046)', () => {
  
  it('should block a Branch Manager from approving a booking if Serology is missing', () => {
    const bookingType = 'Travel';
    const serologyUrl = null; 
    const referralUrl = 'https://link-to-referral.pdf';
    const isCancelRequest = false;
    const selectedMachineId = '10';

    const result = validateManagerApproval(bookingType, serologyUrl, referralUrl, isCancelRequest, selectedMachineId);

    expect(result.isValid).toBe(false);
    expect(result.errorMessage).toBe('Missing mandatory medical documents');
  });

  it('should allow approval if both documents are present', () => {
    const result = validateManagerApproval('Travel', 'link.pdf', 'link2.pdf', false, '10');
    expect(result.isValid).toBe(true);
  });
});