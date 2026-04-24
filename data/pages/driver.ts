import { activeJob, jobPOs } from "./jobs";

export const driverJob = activeJob;
export const driverPOs = jobPOs;

export const driverScanChecks = [
  "อยู่ใน PO ของ Job นี้",
  "เป็นของ Location ปัจจุบัน",
  "ยังไม่เคยสแกนซ้ำ",
  "จำนวนไม่เกินแผน",
  "อยู่ใน GPS radius",
];

export const currentGps = "13.6987,100.5380 / accuracy 18 m";
