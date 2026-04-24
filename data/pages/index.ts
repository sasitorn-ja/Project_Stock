export const pageDataMap = [
  { page: "/po", dataFile: "data/pages/po.ts", data: ["pendingPOs", "groupedPOsByDestination"] },
  { page: "/jobs", dataFile: "data/pages/jobs.ts", data: ["jobs", "activeJob", "jobLocations", "jobPOs"] },
  { page: "/jobs/new", dataFile: "data/pages/po.ts", data: ["pendingPOs", "groupedPOsByDestination"] },
  { page: "/jobs/monitor", dataFile: "data/pages/job-monitor.ts", data: ["monitorJob", "alerts", "monitorPOStatuses"] },
  { page: "/driver", dataFile: "data/pages/driver.ts", data: ["driverJob", "driverPOs", "driverScanChecks", "currentGps"] },
  { page: "/products", dataFile: "data/pages/products.ts", data: ["products"] },
  { page: "/settings", dataFile: "data/pages/settings.ts", data: ["transportSettings"] },
  { page: "/reports", dataFile: "data/pages/reports.ts", data: ["reportCards"] },
  { page: "/flow", dataFile: "data/pages/flow.ts", data: ["systemFlow", "adminFlow", "driverFlow"] },
];
