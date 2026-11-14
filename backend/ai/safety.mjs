// Text safety shared by chat.mjs (offline redirects) and advice.mjs (reject model output that prescribes).

// What a USER asks for (chat input). Broad on purpose: "dozunu söyle" is dosing, "radyasyon dozu" is not.
export const MEDICATION = /ilaç|ilac|hap\b|tablet|parasetamol|ibuprofen|aspirin|antibiyotik|re[cç]ete|\d\s?(mg|mcg|ml)\b|doz[a-zığüşöç]*\s+(söyle|yaz|ver|ne kadar|kaç)/i;

// What the MODEL wrote (advice). Only things that name or dose a medicine. The "dozu ver…" verb pattern above is
// deliberately NOT used here: "haftalarca alınacak dozu verebilir" (radiation) is a normal sentence.
const PRESCRIBING = /ilaç|ilac|hap\b|tablet|parasetamol|ibuprofen|aspirin|antibiyotik|re[cç]ete|\d\s?(mg|mcg|ml)\b/i;

export const looksUnsafe = (text) => PRESCRIBING.test(text);
