export function intakeQuote(settings: {applicationCohort:string;onlineFee:number;physicalFee:number;offerClosingDate:string}, mode:string, now = new Date()) {
  if (!['Online','Physical (In-person)','Hybrid (Mix of online & physical)'].includes(mode)) throw new Error('Choose online, physical or hybrid learning.');
  const closesAt = new Date(settings.offerClosingDate + 'T23:59:59.999+01:00');
  const fee = settings.applicationCohort === 'C' && now <= closesAt ? (mode === 'Online' ? settings.onlineFee : settings.physicalFee) : null;
  return {fee, currency:'NGN', offerClosesAt:fee == null ? null : closesAt.toISOString()};
}
