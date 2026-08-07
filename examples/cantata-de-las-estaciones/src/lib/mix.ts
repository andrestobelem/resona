/**
 * Resona sums every Track directly into an unattenuated master bus (there is no
 * limiter/master gain node in the engine yet), so a full six/seven-track movement
 * clips hard unless every part is scaled down first. Chosen so the loudest movement's
 * peak lands comfortably under 0 dBFS.
 */
export const MASTER_GAIN = 0.15;
