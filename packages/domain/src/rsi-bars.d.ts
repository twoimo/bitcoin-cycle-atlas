import type { Market,Point } from '@atlas/contracts/market-lab';
export type RsiBar=[string,number,number,number,number,number|null];
export function validateRsiBars(input:unknown,prices:Point[]):RsiBar[];
export function yahooRsiBars(payload:unknown,market:Market,options?:{now?:Date}):{bars:RsiBar[];omitted:string[];timezone:string};
export function weeklyRsiPrices(prices:Point[]):Point[];
export function weeklyRsiBars(bars:RsiBar[]):RsiBar[];
