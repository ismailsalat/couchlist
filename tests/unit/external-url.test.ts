import { describe, expect, it } from 'vitest';
import { isSafeExternalUrl, parseExternalUrl } from '@couchlist/shared';

/**
 * Every address in the directory was typed by a stranger, and the server will
 * later be asked to show it as a link. Two things must never get through: a
 * scheme that runs code when clicked, and an address that points back inside
 * the network the server is running in.
 *
 * The second one has more spellings than people expect, so they are written
 * out here rather than trusted to a regex nobody rereads.
 */
describe('addresses the directory will accept', () => {
  it('accepts an ordinary public website', () => {
    for (const url of [
      'http://example.com/',
      'https://example.com/library',
      'https://sub.example.co.uk/x?y=1',
      'https://example.com:8443/path',
    ]) {
      expect(isSafeExternalUrl(url)).toBe(true);
    }
  });

  it('refuses a scheme that runs when clicked', () => {
    for (const url of [
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox(1)',
      'file:///etc/passwd',
      'ftp://example.com/',
    ]) {
      expect(isSafeExternalUrl(url)).toBe(false);
    }
  });

  it('refuses the loopback address, however it is written', () => {
    for (const url of [
      'http://localhost/',
      'http://127.0.0.1/',
      'http://127.0.0.1:8080/',
      'http://127.1/',
      // Decimal, octal and hexadecimal forms of 127.0.0.1.
      'http://2130706433/',
      'http://0177.0.0.1/',
      'http://0x7f.0.0.1/',
      'http://0/',
      'http://[::1]/',
    ]) {
      expect(isSafeExternalUrl(url)).toBe(false);
    }
  });

  it('refuses private and link-local ranges', () => {
    for (const url of [
      'http://10.0.0.5/',
      'http://172.16.0.1/',
      'http://172.31.255.254/',
      'http://192.168.1.1/',
      'http://100.64.0.1/',
      // The cloud metadata endpoint, which is the prize in most SSRF attempts.
      'http://169.254.169.254/latest/meta-data/',
      'http://[fe80::1]/',
      'http://[fc00::1]/',
      'http://[::ffff:127.0.0.1]/',
    ]) {
      expect(isSafeExternalUrl(url)).toBe(false);
    }
  });

  it('refuses credentials in the address, which disguise the real host', () => {
    expect(isSafeExternalUrl('http://example.com@evil.example/')).toBe(false);
    expect(isSafeExternalUrl('http://user:pw@example.com/')).toBe(false);
  });

  it('refuses an address long enough to be a payload', () => {
    expect(isSafeExternalUrl(`https://example.com/${'a'.repeat(3000)}`)).toBe(false);
  });

  it('reports the domain separately from the address it was found in', () => {
    const parsed = parseExternalUrl('https://WWW.Example.COM/Library/');
    expect(parsed?.domain).toBe('example.com');
  });
});
