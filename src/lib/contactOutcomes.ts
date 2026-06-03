export const CONTACT_OUTCOMES = [
  'Answered',
  'Left Voicemail',
  'No Answer',
  'Wrong Number',
  'Appointment Set',
  'Declined Service',
] as const;

export type ContactOutcome = (typeof CONTACT_OUTCOMES)[number];
