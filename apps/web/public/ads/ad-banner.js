/*
 * Bait for the ad blocker check.
 *
 * Deliberately named and placed so that the generic rules in every filter
 * list match it. A working blocker refuses to fetch this file, and that
 * refusal is the signal the tool reports.
 *
 * It is not an advert and does nothing. Couchlist serves no advertising.
 */
window.__couchlistAdBaitLoaded = true;
