/**
 * Minimal `next/headers` stand-in. The service layer under test never reads
 * cookies — only the Next.js request handlers do — so these throw loudly if
 * something unexpectedly reaches for a request scope during a test.
 */
export function cookies(): never {
  throw new Error("cookies() is not available in tests; call the service layer with a SessionUser instead.");
}

export function headers(): never {
  throw new Error("headers() is not available in tests.");
}
