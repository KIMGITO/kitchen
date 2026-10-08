const svg = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 8 6' preserveAspectRatio='none'><filter id='b' color-interpolation-filters='sRGB'><feGaussianBlur stdDeviation='1.2'/></filter><rect width='8' height='6' fill='#E7E4D9'/><rect x='1' y='1' width='6' height='4' fill='#CFCBBB' filter='url(#b)'/></svg>";
/** Warm-gray blurred placeholder shown while a remote image loads (next/image placeholder="blur"). */
export const BLUR_DATA_URL = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
