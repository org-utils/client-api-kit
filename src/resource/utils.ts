// lib/utils/validation.ts

/**
 * Check if a variable is defined (not empty, null, undefined, or whitespace-only)
 *
 * @param value - The value to check
 * @returns true if the value is defined, false otherwise
 *
 * @example
 * isDefined('hello') // true
 * isDefined('') // false
 * isDefined('   ') // false
 * isDefined(null) // false
 * isDefined(undefined) // false
 * isDefined(0) // true
 * isDefined(false) // true
 * isDefined([]) // true
 * isDefined({}) // true
 */
export function isDefined(value: unknown): boolean {
  // Check for null or undefined
  if (value === null || value === undefined) {
    return false;
  }

  // Check for empty string or whitespace-only string
  if (typeof value === 'string' && value.trim() === '') {
    return false;
  }

  // Check for empty array
  if (Array.isArray(value) && value.length === 0) {
    return false;
  }

  // Check for empty object
  if (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0) {
    return false;
  }

  // All other values are considered defined
  return true;
}

/**
 * Check if a variable is empty (opposite of isDefined)
 */
export function isEmpty(value: unknown): boolean {
  return !isDefined(value);
}

/**
 * Check if a string is defined (not empty, null, undefined, or whitespace-only)
 */
export function isStringDefined(value: unknown): boolean {
  return typeof value === 'string' && value.trim() !== '';
}

/**
 * Check if an array is defined and has elements
 */
export function isArrayDefined(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0;
}

/**
 * Check if an object is defined and has keys
 */
export function isObjectDefined(value: unknown): boolean {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && Object.keys(value).length > 0;
}

/**
 * Check if a number is defined (not null, undefined, or NaN)
 */
export function isNumberDefined(value: unknown): boolean {
  return typeof value === 'number' && !isNaN(value);
}



/**
 * Normalize a URL/path with specific rules:
 *
 * 1. If URL is valid (has protocol), leave it as is
 * 2. If it's a number, convert to string and apply path normalization
 * 3. If not valid (path-only):
 *    - Replace double slashes with single
 *    - Add single slash at the start if not present
 * 4. If URL is empty, null, undefined, or empty spaces: return ''
 *
 * @param url - The URL string or number to normalize
 * @returns Normalized URL string
 *
 * @example
 * normalizeUrl('http://example.com/me/') // 'http://example.com/me/'
 * normalizeUrl('api/auth/me') // '/api/auth/me'
 * normalizeUrl('/api//auth//me') // '/api/auth/me'
 * normalizeUrl(123) // '/123'
 * normalizeUrl('') // ''
 */
export function normalizeUrl(url: string | number | null | undefined): string {
  // Handle empty, null, undefined, or whitespace-only strings
  if (!url || (typeof url === 'string' && url?.trim() === '')) {
    return '';
  }

  // Convert number to string
  let normalized = typeof url === 'number' ? String(url) : url.trim();

  // Check if it's a valid URL with protocol (http://, https://, etc.)
  const hasProtocol = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(normalized);

  // If it's a valid URL with protocol, return it as is
  if (hasProtocol) {
    return normalized;
  }

  // Handle path-only URLs (including numbers)
  // Replace double slashes with single
  normalized = normalized?.replace(/\/{2,}/g, '/');

  // Add slash at the start if not present
  if (!normalized?.startsWith('/')) {
    normalized = '/' + normalized;
  }
  return normalized;
}

/**
 * Safe version with fallback
 */
export function safeNormalizeUrl(
  url: string | number | null | undefined,
  fallback: string = ''
): string {
  try {
    const normalized = normalizeUrl(url);
    return normalized || fallback;
  } catch {
    return fallback;
  }
}
