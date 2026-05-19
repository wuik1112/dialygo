export function checkSerologyEligibility(lastSerologyDate: string, draftDate: string, travelStatus: string) {
  const serologyDate = new Date(lastSerologyDate);
  const expiryDate = new Date(serologyDate);
  expiryDate.setMonth(expiryDate.getMonth() + 6); 
  
  const expiryDateString = expiryDate.toLocaleDateString('en-GB', { 
    day: '2-digit', month: 'short', year: 'numeric' 
  });

  const selectedBDate = new Date(draftDate);
  const isEligibleForSelectedDate = travelStatus === 'Active' && selectedBDate <= expiryDate; 

  return { isEligibleForSelectedDate, expiryDateString };
}