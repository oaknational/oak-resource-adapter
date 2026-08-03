---
"@oaknational/resource-adapter": minor
"@oaknational/resource-adapter-contracts": minor
---

Add `ResourceAdapterErrorBoundary` so a Resource Adapter render failure cannot
take down the host lesson page. The dialog and button isolate themselves with
it, showing an accessible Oak-styled unavailable state with reset support; the
boundary is also exported for hosts. Caught errors are reported to the new
authenticated `clientErrors.report` procedure (strict, size-limited schema)
and to an optional host `onError` callback, with failures in either path
swallowed.

The unavailable state keeps keyboard users oriented: a crash that unmounts the
dialog's focus trap hands focus back once the error clears, and its actions
carry an explicit `type="button"` so recovering inside a host form cannot
submit it.
