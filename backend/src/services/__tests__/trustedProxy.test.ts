import { parseTrustedProxyCidrs } from '../trustedProxy';

describe('trusted proxy configuration', () => {
  test('defaults to no trust', () => {
    expect(parseTrustedProxyCidrs()).toBe(false);
    expect(parseTrustedProxyCidrs(' ')).toBe(false);
  });
  test('accepts explicit IP addresses and bounded subnets', () => {
    expect(parseTrustedProxyCidrs('127.0.0.1, ::1,10.0.0.0/24')).toEqual(['127.0.0.1', '::1', '10.0.0.0/24']);
  });
  test.each(['true', '1', '*', 'loopback', '0.0.0.0/0', '::/0', '10.0.0.0/33', '::1/129', '127.0.0.1,'])('rejects broad or invalid trust %s', value => {
    expect(() => parseTrustedProxyCidrs(value)).toThrow('TRUSTED_PROXY_CIDRS');
  });
});
