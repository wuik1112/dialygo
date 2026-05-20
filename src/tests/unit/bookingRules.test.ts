// src/tests/unit/bookingRules.test.ts
import { validateBookingRule } from '@/utils/validationHelpers'; 

describe('Unit Test: Booking Rule Validation (T038)', () => {
  
  it('should reject negative numbers and zero for Cancellation Cut-off Hours', () => {
    const invalidInput = -10;
    const result = validateBookingRule('cancellation_cutoff', invalidInput);
    
    expect(result.isValid).toBe(false);
    expect(result.errorMessage).toBe('Error: Value must be a positive integer greater than zero.');
  });

  it('should reject numbers greater than 168 hours', () => {
    const invalidInput = 200;
    const result = validateBookingRule('cancellation_cutoff', invalidInput);
    
    expect(result.isValid).toBe(false);
    expect(result.errorMessage).toBe('Error: Cancellation cut-off cannot exceed 168 hours (7 days).');
  });

  it('should accept valid positive integers', () => {
    const validInput = 24;
    const result = validateBookingRule('cancellation_cutoff', validInput);
    
    expect(result.isValid).toBe(true);
  });
});