import * as React from "react"

const MOBILE_BREAKPOINT = 768

// A device is treated as "mobile" when EITHER:
//   - the viewport is narrow (portrait phones / narrow desktop windows), OR
//   - it's a touch device in a short viewport (landscape phones).
// The second clause fixes landscape phones: their long edge exceeds the width
// breakpoint, so a width-only check misclassified them as desktop and hid the
// touch D-pad — precisely when RotateDeviceOverlay nudges users into landscape.
const MOBILE_QUERY =
  `(max-width: ${MOBILE_BREAKPOINT - 1}px), (pointer: coarse) and (max-height: 600px)`

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const mql = window.matchMedia(MOBILE_QUERY)
    const onChange = () => setIsMobile(mql.matches)
    mql.addEventListener("change", onChange)
    setIsMobile(mql.matches)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return !!isMobile
}
