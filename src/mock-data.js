(function () {
  const jurisdictions = [
    "New South Wales",
    "Victoria",
    "Queensland",
    "Western Australia",
    "South Australia",
  ];

  const remotenessAreas = [
    "Major Cities",
    "Inner Regional",
    "Outer Regional",
    "Remote",
    "Very Remote",
  ];

  const ageGroups = ["17-24", "25-39", "40-59", "60+"];
  const detectionMethods = ["Camera", "Police"];

  const driverLicences = {
    "New South Wales": 5500000,
    Victoria: 4800000,
    Queensland: 4200000,
    "Western Australia": 2100000,
    "South Australia": 1500000,
  };

  const lockdownAnnotations = [
    { label: "VIC Lockdown 1", start: "2020-03-01", end: "2020-10-30" },
    { label: "VIC Lockdown 2", start: "2021-07-01", end: "2021-10-15" },
  ];

  const start = new Date("2018-01-01");
  const end = new Date("2024-12-01");

  const records = [];
  let monthIndex = 0;

  const seeded = (seed) => {
    // Deterministic pseudo random in [0,1)
    return (Math.abs(Math.sin(seed * 9999.91)) * 1000) % 1;
  };

  for (let current = new Date(start); current <= end; current.setMonth(current.getMonth() + 1)) {
    jurisdictions.forEach((jurisdiction, jIndex) => {
      remotenessAreas.forEach((remoteness, rIndex) => {
        ageGroups.forEach((ageGroup, aIndex) => {
          detectionMethods.forEach((method, mIndex) => {
            const seed =
              monthIndex * 0.21 + jIndex * 1.7 + rIndex * 0.83 + aIndex * 0.57 + (mIndex === 0 ? 0.5 : 0.1);
            const seasonalFactor = 0.75 + 0.5 * Math.sin((monthIndex / 6) * Math.PI);
            const covidDip = current.getFullYear() === 2020 || current.getFullYear() === 2021 ? 0.85 : 1;
            const methodWeight = method === "Camera" ? 1.2 : 0.95;
            const remotenessWeight = 1 + rIndex * 0.08;
            const ageWeight = 1 + aIndex * 0.05;
            const jurisdictionWeight = 1 + jIndex * 0.04;
            const base = 30 + seeded(seed) * 90;
            const fines = Math.round(base * seasonalFactor * covidDip * methodWeight * remotenessWeight * ageWeight * jurisdictionWeight);
            records.push({
              jurisdiction,
              remoteness,
              ageGroup,
              detectionMethod: method,
              date: current.toISOString().split("T")[0],
              fines,
            });
          });
        });
      });
    });
    monthIndex += 1;
  }

  const remotenessGeo = {
    type: "FeatureCollection",
    features: remotenessAreas.map((area, index) => {
      const offset = index * 2.6;
      return {
        type: "Feature",
        properties: { remoteness: area },
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [112 + offset, -44 + offset * 0.1],
              [120 + offset, -44 + offset * 0.05],
              [121 + offset, -11 - offset * 0.2],
              [113 + offset, -12 - offset * 0.3],
              [112 + offset, -44 + offset * 0.1],
            ],
          ],
        },
      };
    }),
  };

  window.mockData = {
    records,
    domains: { jurisdictions, remotenessAreas, ageGroups, detectionMethods },
    driverLicences,
    lockdownAnnotations,
    remotenessGeo,
  };
})();
