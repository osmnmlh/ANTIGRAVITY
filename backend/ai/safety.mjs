// Text safety shared by chat.mjs (offline redirects) and advice.mjs (reject model output that prescribes).

// Medication and dosing: never produced by us, never answered. "dozunu söyle" is dosing, "radyasyon dozu" is not.
export const MEDICATION = /ilaç|ilac|hap\b|tablet|parasetamol|ibuprofen|aspirin|antibiyotik|re[cç]ete|\d\s?(mg|mcg|ml)\b|doz[a-zığüşöç]*\s+(söyle|yaz|ver|ne kadar|kaç)/i;

export const looksUnsafe = (text) => MEDICATION.test(text);
