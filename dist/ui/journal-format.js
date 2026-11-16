export const decimal=value=>Number.isFinite(value)?value.toFixed(4):'미평가';
export const percent=value=>Number.isFinite(value)?(value*100).toFixed(2)+'%':'미평가';
export const day=value=>Date.parse(value+'T00:00:00Z')/86400000;
export const fromDay=value=>new Date(value*86400000).toISOString().slice(0,10);
