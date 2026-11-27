export type WorkDeviceInfo = {
  userAgent: string;
  maxTouchPoints: number;
  screenWidth: number;
};

const phoneUserAgent =
  /iPhone|iPod|Android.*Mobile|IEMobile|Windows Phone|BlackBerry|Opera Mini/i;
const tabletUserAgent = /iPad|Tablet|PlayBook|Silk/i;

export function isSupportedWorkDevice({
  userAgent,
  maxTouchPoints,
  screenWidth,
}: WorkDeviceInfo): boolean {
  const isAndroidTablet =
    /Android/i.test(userAgent) &&
    !/Mobile/i.test(userAgent) &&
    screenWidth >= 600;
  const isIPadOS =
    /Macintosh/i.test(userAgent) &&
    maxTouchPoints > 1 &&
    screenWidth >= 600;

  if (tabletUserAgent.test(userAgent) || isAndroidTablet || isIPadOS) {
    return true;
  }
  if (phoneUserAgent.test(userAgent)) {
    return false;
  }

  return !(maxTouchPoints > 0 && screenWidth < 600);
}
