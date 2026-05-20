import { checkSerologyEligibility } from '@/utils/validationHelpers';

describe('Clinical Validation: Serology Expiration Logic', () => {

  it('should return TRUE if the booking date is exactly within the 6-month window', () => {
    const lastSerology = '2025-01-01';
    const bookingDate = '2025-06-15';
    const travelStatus = 'Active';

    const result = checkSerologyEligibility(lastSerology, bookingDate, travelStatus);

    expect(result.isEligibleForSelectedDate).toBe(true);
    expect(result.expiryDateString).toBe('01 Jul 2025');
  });

  it('should return FALSE if the booking date is past the 6-month expiry limit', () => {
    const lastSerology = '2025-01-01';
    const bookingDate = '2025-08-01';
    const travelStatus = 'Active';

    const result = checkSerologyEligibility(lastSerology, bookingDate, travelStatus);

    expect(result.isEligibleForSelectedDate).toBe(false);
  });

  it('should return FALSE even if the date is valid, but the Patient Travel Status is not Active', () => {
    const lastSerology = '2025-01-01';
    const bookingDate = '2025-02-01';
    const travelStatus = 'Update Required';

    const result = checkSerologyEligibility(lastSerology, bookingDate, travelStatus);

    expect(result.isEligibleForSelectedDate).toBe(false);
  });
});