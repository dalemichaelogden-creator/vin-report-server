require("dotenv").config();

const express = require("express");
const cors = require("cors");
const Stripe = require("stripe");

const app = express();
const PORT = 3002;

console.log("THIS IS THE BACKEND 3002 FILE");
console.log("RUNNING SERVER.JS FILE CUSTOMER REPORT VERSION");
console.log("SERVER_JS_BOOTED");

function getCorrectedYear(vin, row){
  let year = row.ModelYear || "";

  const yearMap = {
    A: 2010, B: 2011, C: 2012, D: 2013, E: 2014,
    F: 2015, G: 2016, H: 2017, J: 2018, K: 2019,
    L: 2020, M: 2021, N: 2022, P: 2023, R: 2024,
    S: 2025, T: 2026, V: 2027, W: 2028, X: 2029,
    Y: 2030,
    1: 2001, 2: 2002, 3: 2003, 4: 2004, 5: 2005,
    6: 2006, 7: 2007, 8: 2008, 9: 2009
  };

  const vinYearCode = vin.charAt(9);
  const decodedYear = yearMap[vinYearCode];

  if (!year && decodedYear) return decodedYear;

  if (decodedYear && year && Math.abs(decodedYear - year) > 1){
    return decodedYear;
  }

  return year;
}

if (!process.env.STRIPE_SECRET_KEY) {
  console.error("Missing STRIPE_SECRET_KEY in environment variables");
  process.exit(1);
}

if (!process.env.STRIPE_VIN_REPORT_PRICE_ID) {
  console.error("Missing STRIPE_VIN_REPORT_PRICE_ID in environment variables");
  process.exit(1);
}

if (!process.env.BASE_URL) {
  console.error("Missing BASE_URL in environment variables");
  process.exit(1);
}

if (!process.env.API_BASE) {
  console.error("Missing API_BASE in environment variables");
  process.exit(1);
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

console.log("Stripe key loaded:", process.env.STRIPE_SECRET_KEY ? "YES" : "NO");
console.log("Stripe key prefix:", process.env.STRIPE_SECRET_KEY ? process.env.STRIPE_SECRET_KEY.slice(0, 8) : "MISSING");
console.log("Stripe price id actual:", JSON.stringify(process.env.STRIPE_VIN_REPORT_PRICE_ID));
console.log("BASE_URL loaded:", process.env.BASE_URL);
console.log("API_BASE loaded:", process.env.API_BASE);

app.use(cors());
app.use(express.json());

function sanitizeVin(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .replace(/[IOQ]/g, "")
    .slice(0, 17);
}

function safeValue(value, fallback = "") {
  return value && String(value).trim() ? String(value).trim() : fallback;
}

function upperText(value) {
  return safeValue(value).toUpperCase();
}

function intValue(value) {
  const n = parseInt(value, 10);
  return Number.isNaN(n) ? null : n;
}

function xmlTag(xml, tag) {
  const match = String(xml || "").match(new RegExp(`<${tag}>(.*?)</${tag}>`, "i"));
  return match ? match[1].trim() : "";
}

function buildVehicleTitle(vehicle) {
  return [
    safeValue(vehicle.year),
    safeValue(vehicle.make),
    safeValue(vehicle.model),
    safeValue(vehicle.trim)
  ].filter(Boolean).join(" ");
}

function buildEcoBadge(ghgScore, smartwayScore) {
  const ghg = Number(ghgScore || 0);
  const smartway = String(smartwayScore || "");

  if (smartway === "2") return "SmartWay Elite";
  if (smartway === "1") return "SmartWay";
  if (ghg >= 8) return "Low Emissions";
  if (ghg > 0 && ghg <= 4) return "Higher Emissions";

  return "Standard Profile";
}

function getBodyType(vehicle) {
  const body = upperText(vehicle.body);

  if (body.includes("COUPE")) return "coupe";
  if (body.includes("CONVERTIBLE") || body.includes("CABRIOLET") || body.includes("ROADSTER")) return "convertible";
  if (body.includes("WAGON") || body.includes("ESTATE") || body.includes("TOURING")) return "wagon";
  if (body.includes("HATCHBACK") || body.includes("LIFTBACK") || body.includes("FASTBACK")) return "hatchback";
  if (body.includes("SEDAN") || body.includes("SALOON")) return "sedan";
  if (body.includes("SPORT UTILITY") || body.includes("MULTIPURPOSE") || body.includes("CROSSOVER") || body.includes("UTILITY")) return "suv";
  if (body.includes("PICKUP")) return "truck";

  return "unknown";
}

function getDriveTypeGroup(vehicle) {
  const drive = upperText(vehicle.drive);

  if (drive.includes("AWD") || drive.includes("4WD") || drive.includes("4X4") || drive.includes("XDRIVE") || drive.includes("QUATTRO")) return "awd";
  if (drive.includes("FWD") || drive.includes("FRONT")) return "fwd";
  if (drive.includes("RWD") || drive.includes("REAR")) return "rwd";

  return "unknown";
}

function getFuelGroup(vehicle) {
  const fuel = upperText(vehicle.fuel);

  if (fuel.includes("ELECTRIC")) return "electric";
  if (fuel.includes("HYBRID") || fuel.includes("PHEV") || fuel.includes("PLUG")) return "hybrid";
  if (fuel.includes("DIESEL")) return "diesel";
  if (fuel.includes("GAS") || fuel.includes("GASOLINE") || fuel.includes("PETROL")) return "gas";

  return "unknown";
}

function isLuxuryBrand(make) {
  return [
    "BMW", "AUDI", "MERCEDES-BENZ", "MERCEDES", "PORSCHE", "LEXUS", "ACURA", "INFINITI",
    "CADILLAC", "GENESIS", "JAGUAR", "LAND ROVER", "VOLVO", "ALFA ROMEO", "TESLA",
    "LUCID", "RIVIAN", "MASERATI", "BENTLEY"
  ].includes(upperText(make));
}

function buildReportDateString() {
  const now = new Date();
  return now.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric"
  });
}

function buildStockId(vehicle) {
  const parts = [
    safeValue(vehicle.year),
    safeValue(vehicle.make),
    safeValue(vehicle.model),
    safeValue(vehicle.trim || vehicle.series || "BASE")
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return parts || "VIN_REPORT";
}

function buildRecallSeverityLabel(item) {
  const text = upperText(
    safeValue(item.Component) + " " +
    safeValue(item.Summary) + " " +
    safeValue(item.Remedy)
  );

  if (
    text.includes("AIR BAG") ||
    text.includes("BRAKE") ||
    text.includes("FIRE") ||
    text.includes("STEERING") ||
    text.includes("FUEL LEAK")
  ) {
    return "Higher Attention";
  }

  if (
    text.includes("VISIBILITY") ||
    text.includes("ELECTRICAL") ||
    text.includes("SUSPENSION") ||
    text.includes("POWER TRAIN") ||
    text.includes("POWERTRAIN")
  ) {
    return "Moderate Attention";
  }

  return "General Attention";
}

async function fetchRecalls(year, make, model) {
  try {
    if (!year || !make || !model) {
      return {
        recalls: 0,
        recallSummary: "Recall data could not be checked because key vehicle details were missing.",
        recallDetails: []
      };
    }

    const url = `https://api.nhtsa.gov/recalls/recallsByVehicle?make=${encodeURIComponent(make)}&model=${encodeURIComponent(model)}&modelYear=${encodeURIComponent(year)}`;
    const response = await fetch(url);

    if (!response.ok) {
      return {
        recalls: 0,
        recallSummary: "Recall data could not be retrieved right now.",
        recallDetails: []
      };
    }

    const data = await response.json();
    const results = Array.isArray(data.results) ? data.results : [];

    const recallDetails = results.slice(0, 12).map(item => ({
      campaignNumber: safeValue(item.NHTSACampaignNumber || item.nhtsa_campaign_number || item.CampaignNumber),
      component: safeValue(item.Component || item.component || "General safety item"),
      summary: safeValue(item.Summary || item.summary || "Recall details available."),
      reportDate: safeValue(item.ReportReceivedDate || item.report_received_date),
      remedy: safeValue(item.Remedy || item.remedy),
      manufacturer: safeValue(item.Manufacturer || item.manufacturer),
      severity: buildRecallSeverityLabel(item)
    }));

    return {
      recalls: results.length,
      recallSummary: results.length
        ? `${results.length} manufacturer safety recall records found for this exact model year, make, and model.`
        : "No manufacturer safety recalls found for this exact model year, make, and model.",
      recallDetails
    };
  } catch {
    return {
      recalls: 0,
      recallSummary: "Recall data could not be retrieved right now.",
      recallDetails: []
    };
  }
}

async function fetchComplaints(year, make, model) {
  try {
    if (!year || !make || !model) {
      return {
        complaints: 0,
        topComponent: "",
        complaintSummary: "Complaint data could not be checked because key vehicle details were missing.",
        dataAvailable: false,
        complaintComponents: [],
        complaintDetails: []
      };
    }

    const url = `https://api.nhtsa.gov/complaints/complaintsByVehicle?make=${encodeURIComponent(make)}&model=${encodeURIComponent(model)}&modelYear=${encodeURIComponent(year)}`;
    const response = await fetch(url);

    if (!response.ok) {
      return {
        complaints: 0,
        topComponent: "",
        complaintSummary: "Complaint data could not be retrieved right now.",
        dataAvailable: false,
        complaintComponents: [],
        complaintDetails: []
      };
    }

    const data = await response.json();
    const results = Array.isArray(data.results) ? data.results : [];

    const counts = {};
    for (const item of results) {
      const key = String(
        item.components ||
        item.component ||
        item.Component ||
        "Unknown Component"
      ).trim();

      counts[key] = (counts[key] || 0) + 1;
    }

    let topComponent = "";
    let topCount = 0;

    for (const key in counts) {
      if (counts[key] > topCount) {
        topCount = counts[key];
        topComponent = key;
      }
    }

    const complaintComponents = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([component, count]) => ({
        component,
        count
      }));

    const complaintDetails = results.slice(0, 10).map(item => ({
      component: safeValue(item.components || item.component || item.Component || "Unknown Component"),
      summary: safeValue(item.summary || item.Summary || item.description || "Complaint record present."),
      date: safeValue(item.dateComplaintFiled || item.DateComplaintFiled || item.ReportReceivedDate),
      mileage: safeValue(item.mileage || item.Mileage)
    }));

    return {
      complaints: results.length,
      topComponent,
      complaintSummary: results.length
        ? `${results.length} owner complaint records found for this exact model year, make, and model.`
        : "No owner complaints found for this exact model year, make, and model.",
      dataAvailable: true,
      complaintComponents,
      complaintDetails
    };
  } catch {
    return {
      complaints: 0,
      topComponent: "",
      complaintSummary: "Complaint data could not be retrieved right now.",
      dataAvailable: false,
      complaintComponents: [],
      complaintDetails: []
    };
  }
}

async function fetchEfficiency(year, make, model) {
  try {
    if (!year || !make || !model) {
      return {
        combinedMPG: "",
        annualFuelCost: "",
        ghgScore: "",
        ecoBadge: "",
        efficiencySummary: "Efficiency data could not be checked because key vehicle details were missing.",
        dataAvailable: false
      };
    }

    const optionsUrl = `https://www.fueleconomy.gov/ws/rest/vehicle/menu/options?year=${encodeURIComponent(year)}&make=${encodeURIComponent(make)}&model=${encodeURIComponent(model)}`;
    const optionsResponse = await fetch(optionsUrl);

    if (!optionsResponse.ok) {
      return {
        combinedMPG: "",
        annualFuelCost: "",
        ghgScore: "",
        ecoBadge: "",
        efficiencySummary: "Fuel economy data could not be retrieved right now.",
        dataAvailable: false
      };
    }

    const optionsXml = await optionsResponse.text();
    const vehicleId = xmlTag(optionsXml, "value");

    if (!vehicleId) {
      return {
        combinedMPG: "",
        annualFuelCost: "",
        ghgScore: "",
        ecoBadge: "",
        efficiencySummary: "No matching fuel economy record was found for this vehicle profile.",
        dataAvailable: false
      };
    }

    const detailUrl = `https://www.fueleconomy.gov/ws/rest/vehicle/${encodeURIComponent(vehicleId)}`;
    const detailResponse = await fetch(detailUrl);

    if (!detailResponse.ok) {
      return {
        combinedMPG: "",
        annualFuelCost: "",
        ghgScore: "",
        ecoBadge: "",
        efficiencySummary: "Fuel economy detail data could not be retrieved right now.",
        dataAvailable: false
      };
    }

    const detailXml = await detailResponse.text();

    const combinedMPG = xmlTag(detailXml, "comb08");
    const annualFuelCostRaw = xmlTag(detailXml, "fuelCost08");
    const ghgScore = xmlTag(detailXml, "ghgScore");
    const smartwayScore = xmlTag(detailXml, "smartwayScore");

    let annualFuelCost = "";
    if (annualFuelCostRaw && !Number.isNaN(Number(annualFuelCostRaw))) {
      annualFuelCost = `$${Number(annualFuelCostRaw).toLocaleString()}`;
    }

    return {
      combinedMPG,
      annualFuelCost,
      ghgScore,
      ecoBadge: buildEcoBadge(ghgScore, smartwayScore),
      efficiencySummary: combinedMPG
        ? "Fuel economy data matched successfully."
        : "Fuel economy data was checked but no combined MPG value was returned.",
      dataAvailable: !!combinedMPG
    };
  } catch {
    return {
      combinedMPG: "",
      annualFuelCost: "",
      ghgScore: "",
      ecoBadge: "",
      efficiencySummary: "Fuel economy data could not be retrieved right now.",
      dataAvailable: false
    };
  }
}

async function fetchInvestigations(year, make, model) {
  try {
    if (!year || !make || !model) {
      return {
        investigations: [],
        investigationSummary: ""
      };
    }

    const url = "https://static.nhtsa.gov/odi/odi_investigations.json";
    const response = await fetch(url);

    if (!response.ok) {
      return {
        investigations: [],
        investigationSummary: ""
      };
    }

    const data = await response.json();
    const rows = Array.isArray(data?.results)
      ? data.results
      : Array.isArray(data)
        ? data
        : [];

    const normalizedMake = upperText(make);
    const normalizedModel = upperText(model);
    const numericYear = intValue(year);

    const matches = rows.filter(item => {
      const text = upperText(
        safeValue(item.Manufacturer) + " " +
        safeValue(item.make) + " " +
        safeValue(item.Product) + " " +
        safeValue(item.Model) + " " +
        safeValue(item.Summary)
      );

      const yearText = safeValue(item.ModelYear || item.modelYear || item.Year);
      const hasMake = text.includes(normalizedMake);
      const hasModel = normalizedModel && text.includes(normalizedModel);
      const hasYear = numericYear ? yearText.includes(String(numericYear)) || text.includes(String(numericYear)) : true;

      return hasMake && (hasModel || normalizedModel.length < 3) && hasYear;
    }).slice(0, 8);

    const investigations = matches.map(item => ({
      actionNumber: safeValue(item.ActionNumber || item.actionNumber),
      component: safeValue(item.Component || item.component),
      summary: safeValue(item.Summary || item.summary || "Investigation record present."),
      dateOpened: safeValue(item.DateOpened || item.dateOpened || item.OpenDate),
      status: safeValue(item.Status || item.status || item.ClosingResume || "Recorded")
    }));

    return {
      investigations,
      investigationSummary: investigations.length
        ? `${investigations.length} possible safety investigation matches found for this vehicle profile.`
        : ""
    };
  } catch {
    return {
      investigations: [],
      investigationSummary: ""
    };
  }
}

function buildSpecsFromDecode(row, vehicle) {
  const length = safeValue(row.VehicleLength || row.WheelBaseLong);
  const width = safeValue(row.VehicleWidth);
  const height = safeValue(row.VehicleHeight);

  let engineFallback = "";
  let transmissionFallback = "";

  if (upperText(vehicle.make) === "BMW") {
    engineFallback = "2.0L TwinPower Turbo I4";
    transmissionFallback = "8-Speed ZF Automatic";
  } else if (upperText(vehicle.make) === "AUDI") {
    transmissionFallback = "Automatic transmission configuration";
  } else if (upperText(vehicle.make).includes("MERCEDES")) {
    transmissionFallback = "Automatic transmission configuration";
  } else {
    transmissionFallback = "Automatic transmission configuration";
  }

  return {
    horsepower: safeValue(row.EngineHP),
    transmission: safeValue(row.TransmissionStyle || row.TransmissionSpeeds, transmissionFallback),
    dimensions: [length, width, height].filter(Boolean).join(" × "),
    curbWeight: safeValue(row.CurbWeightLB),
    weightClass: safeValue(row.GVWR),
    engineDisplay: safeValue(row.EngineModel, engineFallback)
  };
}

function buildOptionProfile(vehicle) {
  const make = upperText(vehicle.make);
  const trim = upperText(vehicle.trim);
  const year = intValue(vehicle.year) || 0;
  const body = getBodyType(vehicle);
  const drive = getDriveTypeGroup(vehicle);
  const fuel = getFuelGroup(vehicle);

  let sportScore = 34;
  let comfortScore = 42;
  let techScore = 38;

  let sportLabel = "Sport Package";
  let comfortLabel = "Comfort Package";
  let techLabel = year >= 2019 ? "Driver Assistance Package" : "Technology Package";

  if (make === "BMW") {
    sportLabel = "M Sport Package";
    comfortLabel = "Premium Package";
    techLabel = year >= 2019 ? "Driver Assistance or Live Cockpit Package" : "Technology Package";
  }

  if (make === "AUDI") {
    sportLabel = "S line Package";
    comfortLabel = "Premium Package";
    techLabel = "Technology Package";
  }

  if (make.includes("MERCEDES")) {
    sportLabel = "AMG Line or Sport Package";
    comfortLabel = "Premium Package";
    techLabel = "Driver Assistance Package";
  }

  if (make === "LEXUS") {
    sportLabel = "F Sport Package";
    comfortLabel = "Premium Package";
    techLabel = "Navigation or Safety Package";
  }

  if (body === "coupe" || body === "convertible") sportScore += 18;
  if (body === "suv") comfortScore += 12;
  if (drive === "awd") comfortScore += 6;
  if (fuel === "hybrid" || fuel === "electric") techScore += 16;
  if (year >= 2019) techScore += 14;

  if (trim.includes("M SPORT") || trim.includes("SPORT") || trim.includes("S LINE") || trim.includes("AMG")) sportScore += 18;
  if (trim.includes("PREMIUM") || trim.includes("LUXURY") || trim.includes("LIMITED") || trim.includes("PLATINUM")) comfortScore += 18;
  if (trim.includes("TECH") || trim.includes("ADVANCE") || trim.includes("PRESTIGE") || trim.includes("ELITE")) techScore += 18;

  const clamp = (n) => Math.max(18, Math.min(99, Math.round(n)));

  return {
    sport: {
      label: sportLabel,
      probability: clamp(sportScore)
    },
    comfort: {
      label: comfortLabel,
      probability: clamp(comfortScore)
    },
    tech: {
      label: techLabel,
      probability: clamp(techScore)
    }
  };
}

function inferEnginePlatform(vehicle) {
  const make = upperText(vehicle.make);
  const model = upperText(vehicle.model);
  const trim = upperText(vehicle.trim);
  const year = intValue(vehicle.year);

  if (make === "BMW") {
    if (model.includes("340") || trim.includes("340") || trim.includes("M340")) {
      return {
        enginePlatform: "B58",
        engineLabel: "Likely B58 3.0L Turbo Inline 6",
        engineConfidence: "High"
      };
    }

    if (model.includes("330E")) {
      return {
        enginePlatform: "B48 Hybrid",
        engineLabel: "Likely B48 based plug in hybrid powertrain",
        engineConfidence: "High"
      };
    }

    if (model.includes("320") || model.includes("328") || model.includes("330")) {
      if (year === 2016) {
        return {
          enginePlatform: "N20 or B48",
          engineLabel: "2.0L TwinPower Turbo I4",
          engineConfidence: "Moderate"
        };
      }

      if (year && year >= 2017) {
        return {
          enginePlatform: "B48",
          engineLabel: "2.0L TwinPower Turbo I4",
          engineConfidence: "High"
        };
      }

      return {
        enginePlatform: "N20 or B48",
        engineLabel: "2.0L TwinPower Turbo I4",
        engineConfidence: "Moderate"
      };
    }

    if (model.includes("335")) {
      return {
        enginePlatform: "N55",
        engineLabel: "Likely N55 3.0L Turbo Inline 6",
        engineConfidence: "High"
      };
    }
  }

  if (make === "AUDI") {
    return {
      enginePlatform: "Turbocharged TFSI Platform",
      engineLabel: safeValue(vehicle.engine, "Turbocharged Audi engine configuration"),
      engineConfidence: "Moderate"
    };
  }

  if (make.includes("MERCEDES")) {
    return {
      enginePlatform: "Mercedes turbocharged platform",
      engineLabel: safeValue(vehicle.engine, "Turbocharged Mercedes powertrain"),
      engineConfidence: "Moderate"
    };
  }

  if (make === "LEXUS" || make === "TOYOTA") {
    return {
      enginePlatform: "Toyota family powertrain",
      engineLabel: safeValue(vehicle.engine, "Toyota or Lexus engine configuration"),
      engineConfidence: "Moderate"
    };
  }

  return {
    enginePlatform: "Manufacturer specific platform",
    engineLabel: safeValue(vehicle.engine, "Manufacturer specific engine configuration"),
    engineConfidence: "Low"
  };
}

function buildPlatformSummary(vehicle) {
  const make = safeValue(vehicle.make);
  const model = safeValue(vehicle.model);
  const body = getBodyType(vehicle);
  const fuel = getFuelGroup(vehicle);

  let summary = `${make} ${model} should be evaluated with attention to service history, drivetrain behavior, warning lights, and visible repair quality.`;

  if (body === "suv") {
    summary = `${make} ${model} combines higher vehicle weight with more suspension and tire load than a typical sedan, so buyers should look carefully at front end wear, alignment behavior, and driveline smoothness.`;
  }

  if (fuel === "electric" || fuel === "hybrid") {
    summary = `${make} ${model} uses an electrified powertrain profile, so battery system health, cooling performance, warning lights, and software behavior matter more than on a conventional gasoline vehicle.`;
  }

  if (upperText(make) === "BMW") {
    summary = `${make} ${model} sits in a higher maintenance ownership category than a typical mass market vehicle, and buyers should focus on cooling, oil leaks, driveline smoothness, electronics, and proof of regular servicing.`;
  }

  return summary;
}

function buildOwnershipIntelligence(vehicle, safety) {
  const engineInfo = inferEnginePlatform(vehicle);
  const complaints = Number(safety.complaints || 0);
  const make = upperText(vehicle.make);
  const body = getBodyType(vehicle);
  const fuel = getFuelGroup(vehicle);
  const drive = getDriveTypeGroup(vehicle);

  let maintenanceComplexity = "Moderate";
  if (isLuxuryBrand(vehicle.make)) maintenanceComplexity = "Higher";
  if (fuel === "hybrid" || fuel === "electric") maintenanceComplexity = "Moderate to Higher";

  let complaintLevel = "Low";
  if (complaints >= 50) complaintLevel = "Higher";
  else if (complaints >= 15) complaintLevel = "Moderate";

  const commonIssues = [
    "Service history gaps",
    "Suspension wear",
    "Brake wear",
    "Electrical issues"
  ];

  const inspectionChecks = [
    "Review service history",
    "Check warning lights",
    "Inspect tires and brakes",
    "Test drivetrain response",
    "Inspect for fluid leaks"
  ];

  const expensiveFailureAreas = [
    "Transmission related repairs",
    "Suspension wear items",
    "Electrical and module faults"
  ];

  const testDriveChecks = [
    "Check steering straightness",
    "Listen for brake or suspension noise",
    "Test acceleration and shifting",
    "Look for warning lights after driving"
  ];

  if (body === "suv") {
    commonIssues.push("Higher weight related suspension wear");
    expensiveFailureAreas.push("Front suspension and wheel bearing wear");
  }

  if (fuel === "hybrid" || fuel === "electric") {
    commonIssues.push("Electrified system diagnostic complexity");
    expensiveFailureAreas.push("Battery and power electronics diagnostics");
  }

  if (drive === "awd") {
    commonIssues.push("All wheel drive system servicing");
    expensiveFailureAreas.push("Transfer case or coupling related repairs");
    testDriveChecks.push("Check for binding on a tight low speed turn");
  }

  if (body === "truck") {
    expensiveFailureAreas.push("Tow related drivetrain wear");
  }

  if (make === "BMW") {
    commonIssues.push("Cooling system checks");
    commonIssues.push("Oil leak inspection");
    commonIssues.push("Electronic faults");
    commonIssues.push("Service history gaps");

    inspectionChecks.push("Inspect for coolant or oil leaks");
    inspectionChecks.push("Check for poor accident repairs");

    expensiveFailureAreas.push("Cooling system components");
    expensiveFailureAreas.push("Oil leaks and gasket repairs");

    testDriveChecks.push("Watch for drivetrain hesitation");
    testDriveChecks.push("Confirm smooth transmission behavior");
  }

  return {
    brandFocus: safeValue(vehicle.make) || "Generic",
    sectionTitle: "Model Specific Ownership Intelligence",
    platform: safeValue(vehicle.series || vehicle.model || "Vehicle platform"),
    platformSummary: buildPlatformSummary(vehicle),
    enginePlatform: engineInfo.enginePlatform,
    engineLabel: engineInfo.engineLabel,
    engineConfidence: engineInfo.engineConfidence,
    maintenanceComplexity,
    complaintLevel,
    commonIssues: Array.from(new Set(commonIssues)),
    inspectionChecks: Array.from(new Set(inspectionChecks)),
    expensiveFailureAreas: Array.from(new Set(expensiveFailureAreas)),
    testDriveChecks: Array.from(new Set(testDriveChecks)),
    ownershipAdvice: `${safeValue(vehicle.make)} ${safeValue(vehicle.model)} should be evaluated with attention to service history, warning lights, fluid leaks, drivetrain behavior, and evidence of preventive maintenance.`
  };
}

function buildMarketAnalysis(vehicle) {
  const year = intValue(vehicle.year) || 2018;
  const isLuxury = isLuxuryBrand(vehicle.make);
  const body = getBodyType(vehicle);
  const fuel = getFuelGroup(vehicle);

  let baseRetail = 9500;

  if (isLuxury) baseRetail += 1500;
  if (body === "suv") baseRetail += 1200;
  if (body === "truck") baseRetail += 1800;
  if (fuel === "hybrid") baseRetail += 900;
  if (fuel === "electric") baseRetail += 1400;

  const agePenalty = Math.max(0, (2026 - year) * 550);
  baseRetail = Math.max(3500, baseRetail - agePenalty);

  const excellent = Math.round(baseRetail);
  const good = Math.round(baseRetail * 0.87);
  const fair = Math.round(baseRetail * 0.72);

  const tradeExcellent = Math.round(excellent * 0.67);
  const tradeGood = Math.round(good * 0.64);
  const tradeFair = Math.round(fair * 0.61);

  let analystNote = `This ${year} model year sits in its normal depreciation phase. Pricing becomes more sensitive to mileage, cosmetic condition, tire quality, and service history as vehicles age.`;

  if (isLuxury) {
    analystNote = `This ${year} model year sits in a higher value but higher maintenance ownership window. Entry pricing can look attractive, but buyers should expect more sensitivity to service history, wear items, and major maintenance exposure than on a non luxury equivalent.`;
  }

  if (fuel === "electric") {
    analystNote = `This ${year} model year sits in an EV market where battery confidence, software condition, charging hardware, and warranty position have a stronger effect on resale than on a conventional gasoline vehicle.`;
  }

  return {
    valuationDate: "March 2026",
    method: "Data synthesized from current market positioning, age based depreciation curves, and vehicle class benchmarks",
    retailValues: {
      excellent,
      good,
      fair
    },
    tradeValues: {
      excellent: tradeExcellent,
      good: tradeGood,
      fair: tradeFair
    },
    analystNote
  };
}

function buildEngineAdvisory(vehicle) {
  const make = upperText(vehicle.make);
  const model = safeValue(vehicle.model);
  const year = intValue(vehicle.year);
  const engineInfo = inferEnginePlatform(vehicle);

  if (make === "BMW" && year === 2016 && upperText(model).includes("320")) {
    return {
      title: "Split Year Engine Advisory",
      summary: "2016 was a transition year for some BMW four cylinder models. Engine architecture can meaningfully change long term ownership risk, buyer confidence, and maintenance exposure.",
      advisoryItems: [
        {
          heading: "Early Production Notes",
          body: "Earlier production examples may use the N20 architecture. Buyers often watch carefully for timing chain concern history, oil leak evidence, and proof of regular oil service."
        },
        {
          heading: "Later Production Notes",
          body: "Later production examples may use the newer B48 architecture, which is generally viewed as the stronger long term design, though cooling and gasket related maintenance still matters."
        },
        {
          heading: "Practical Check",
          body: "Use service records, build timing, and a physical inspection of the engine bay to confirm the exact engine architecture when this distinction matters to value or purchase confidence."
        }
      ]
    };
  }

  return {
    title: "Engine and Platform Advisory",
    summary: `${safeValue(vehicle.make)} ${safeValue(vehicle.model)} uses a ${engineInfo.enginePlatform} profile in this report. Buyers should focus on service history, known wear areas, and how the platform behaves on a cold start and test drive.`,
    advisoryItems: [
      {
        heading: "Known Ownership Theme",
        body: "This vehicle should be evaluated based on the engine family, maintenance history, and any signs of repeated deferred servicing."
      },
      {
        heading: "Later Life Note",
        body: "As vehicles age, cooling systems, seals, electronics, and suspension wear become more important than brochure specification alone."
      }
    ]
  };
}

function buildRiskForecast(vehicle, ownership, safety) {
  const drive = getDriveTypeGroup(vehicle);
  const body = getBodyType(vehicle);
  const fuel = getFuelGroup(vehicle);

  const items = [
    {
      area: "Cooling System",
      risk: isLuxuryBrand(vehicle.make) ? "High" : "Medium",
      note: "Cooling components become more failure prone with age, especially on turbocharged and luxury platforms.",
      estimatedCost: isLuxuryBrand(vehicle.make) ? "$900 to $1,500" : "$500 to $1,000"
    },
    {
      area: "Suspension Wear",
      risk: body === "suv" || drive === "awd" ? "Medium" : "Low",
      note: "Bushings, links, and control arms take more load as mileage increases, especially on heavier vehicles and all wheel drive systems.",
      estimatedCost: "$500 to $1,400"
    },
    {
      area: "Oil Leaks and Seals",
      risk: isLuxuryBrand(vehicle.make) ? "High" : "Medium",
      note: "Aging gaskets and seals frequently become a budget item on older vehicles, especially turbocharged examples.",
      estimatedCost: "$400 to $1,200"
    }
  ];

  if (drive === "awd") {
    items.push({
      area: "All Wheel Drive System",
      risk: "Medium",
      note: "All wheel drive components add complexity and can become expensive when neglected or when tire sizes and tread depths are mismatched.",
      estimatedCost: "$800 to $3,500"
    });
  }

  if (fuel === "hybrid" || fuel === "electric") {
    items.push({
      area: "Electrified System Diagnostics",
      risk: "Medium",
      note: "Battery cooling, charging hardware, and control electronics deserve closer attention as the vehicle ages.",
      estimatedCost: "$500 to $4,000+"
    });
  }

  if (Number(safety.recalls || 0) >= 3) {
    items.push({
      area: "Recall Related Follow Up",
      risk: "Medium",
      note: "Multiple recall records increase the need to confirm completed remedies and verify service campaign history.",
      estimatedCost: "Varies by open remedy status"
    });
  }

  return {
    title: "24 Month Risk Forecast",
    summary: `${safeValue(vehicle.make)} ${safeValue(vehicle.model)} should be viewed as a vehicle where wear items, platform complexity, and past servicing all influence the next 24 months of ownership cost.`,
    items
  };
}

function buildNegotiationLeverage(vehicle, ownership, safety) {
  const items = [
    {
      title: "Maintenance History Credit",
      script: "Without strong service documentation, I have to assume I may be catching up on deferred maintenance, so I need room in the price for that risk."
    },
    {
      title: "Wear Item Credit",
      script: "Tires, brakes, suspension wear, and age related service items all affect immediate ownership cost, so I need to budget for those on day one."
    }
  ];

  if (ownership.maintenanceComplexity === "Higher") {
    items.push({
      title: "Platform Complexity Credit",
      script: "This is not a budget vehicle to own just because the purchase price is lower now. The platform carries higher maintenance exposure than a typical non luxury equivalent."
    });
  }

  if (Number(safety.recalls || 0) >= 3) {
    items.push({
      title: "Recall Follow Up Credit",
      script: "Since this vehicle profile shows multiple recall records, I need to verify remedy completion and leave room for any unresolved campaign related inconvenience."
    });
  }

  if (ownership.enginePlatform && ownership.enginePlatform !== "Manufacturer specific platform") {
    items.push({
      title: "Engine Platform Credit",
      script: `This vehicle sits on the ${ownership.enginePlatform} platform, so I have to price in the known maintenance profile and the possibility of age related engine bay repairs.`
    });
  }

  return {
    title: "Negotiation Leverage",
    summary: "Use these talking points to frame the vehicle as one that may still be worth buying, but only at a price that respects upcoming ownership cost.",
    items
  };
}

function buildOwnershipRoadmap(vehicle) {
  const fuel = getFuelGroup(vehicle);

  const intervals = [
    {
      interval: "Immediate",
      actions: [
        "Fresh oil and filter service",
        "Full fluid level check",
        "Brake and tire condition review"
      ]
    },
    {
      interval: "Next 5,000 Miles",
      actions: [
        "Inspect suspension wear items",
        "Review battery and charging system condition",
        "Inspect for fluid leaks"
      ]
    },
    {
      interval: "Next 10,000 Miles",
      actions: [
        "Spark plugs and ignition review where applicable",
        "Brake service review",
        "Alignment and tire wear check"
      ]
    },
    {
      interval: "Next 20,000 to 30,000 Miles",
      actions: [
        "Transmission service review where applicable",
        "Cooling system preventive inspection",
        "Drive belt and major rubber component inspection"
      ]
    }
  ];

  if (fuel === "electric") {
    intervals[1].actions.push("Check charging behavior and cable condition");
    intervals[2].actions.push("Inspect battery cooling system performance");
  }

  if (fuel === "hybrid") {
    intervals[1].actions.push("Inspect hybrid cooling and charging related systems");
  }

  return {
    title: "30,000 Mile Ownership Roadmap",
    summary: "This roadmap helps turn a vehicle from a short term purchase into a more predictable ownership experience.",
    intervals
  };
}

function buildPurchaseChecklist(vehicle, ownership) {
  const items = [
    "Cold start test and listen for unusual noises",
    "Check for warning lights before and after the drive",
    "Review service history and ownership paperwork",
    "Inspect tire condition and tread match",
    "Check for fluid leaks or signs of poor repairs"
  ];

  if (getDriveTypeGroup(vehicle) === "awd") {
    items.push("Perform a tight low speed turn and feel for binding or driveline shudder");
  }

  if (ownership.maintenanceComplexity === "Higher") {
    items.push("Confirm oil changes were done regularly rather than stretched too far");
  }

  return {
    title: "Final Purchase Checklist",
    items
  };
}

function buildAttentionFlags(report) {
  const flags = [];

  if (Number(report.safety.recalls || 0) >= 8) {
    flags.push("High recall activity");
  } else if (Number(report.safety.recalls || 0) >= 3) {
    flags.push("Moderate recall activity");
  }

  if (report.safety.dataAvailable && Number(report.safety.complaints || 0) >= 20) {
    flags.push("Meaningful complaint activity");
  } else if (report.safety.dataAvailable && Number(report.safety.complaints || 0) > 0) {
    flags.push("Complaint records present");
  }

  if (report.safety.topComponent) {
    flags.push(`Top complaint area: ${report.safety.topComponent}`);
  }

  if (report.investigations.items.length) {
    flags.push("Investigation history present");
  }

  if (!report.efficiency.combinedMPG) {
    flags.push("Fuel economy match unavailable");
  }

  if (report.ownership.maintenanceComplexity === "Higher") {
    flags.push("Higher maintenance platform");
  }

  if (report.ownership.enginePlatform) {
    flags.push(`Engine platform: ${report.ownership.enginePlatform}`);
  }

  return flags;
}

function buildRiskLevel(report) {
  let score = 0;

  const recalls = Number(report.safety.recalls || 0);
  const complaints = Number(report.safety.complaints || 0);
  const investigations = Array.isArray(report.investigations.items) ? report.investigations.items.length : 0;

  if (recalls >= 8) score += 3;
  else if (recalls >= 3) score += 2;
  else if (recalls > 0) score += 1;

  if (report.safety.dataAvailable) {
    if (complaints >= 20) score += 3;
    else if (complaints > 0) score += 1;
  }

  if (investigations >= 1) score += 1;
  if (report.ownership.maintenanceComplexity === "Higher") score += 1;
  if (!report.efficiency.combinedMPG) score += 1;

  if (score >= 6) return "High";
  if (score >= 3) return "Moderate";
  return "Low";
}

function buildConfidenceLevel(coverageScore) {
  if (coverageScore >= 80) return "High Confidence";
  if (coverageScore >= 60) return "Good Coverage";
  if (coverageScore >= 40) return "Partial Coverage";
  return "Limited Coverage";
}

function calculateCoverageScore(report) {
  let score = 0;

  if (report.vehicle.make && report.vehicle.model && report.vehicle.year) score += 25;
  if (typeof report.safety.recalls === "number") score += 15;
  if (report.safety.dataAvailable) score += 10;
  if (report.efficiency.dataAvailable) score += 15;
  if (report.ownership.commonIssues.length) score += 10;
  if (report.ownership.inspectionChecks.length) score += 10;
  if (report.ownership.enginePlatform) score += 5;
  if (report.investigations.items.length) score += 5;

  const dimensionsPresent = !!safeValue(report.specs.dimensions);
  const hpPresent = !!safeValue(report.specs.horsepower);

  if (dimensionsPresent) score += 3;
  if (hpPresent) score += 2;

  return Math.min(score, 100);
}

function buildFrontEndSignals(report) {
  const recalls = Number(report.safety.recalls || 0);
  const complaints = Number(report.safety.complaints || 0);

  let warningLevel = "low";
  let headline = "Vehicle profile looks typical";
  let subheadline = "No major public safety signals were detected.";
  let primaryConcern = "";
  let secondaryConcern = "";

  if (recalls >= 8) {
    warningLevel = "high";
    headline = "Potential ownership concerns detected";
    subheadline = "High recall activity was detected for this vehicle profile.";
    primaryConcern = "High recall activity";
  } else if (recalls >= 3) {
    warningLevel = "medium";
    headline = "Some ownership concerns detected";
    subheadline = "Moderate recall activity was detected for this vehicle profile.";
    primaryConcern = "Moderate recall activity";
  }

  if (report.safety.dataAvailable && complaints >= 20) {
    warningLevel = "high";
    headline = "Potential ownership concerns detected";
    subheadline = "Complaint activity was detected for this vehicle profile.";
    primaryConcern = "High complaint activity";
  }

  if (report.ownership.maintenanceComplexity === "Higher") {
    secondaryConcern = "Higher maintenance platform";
  }

  return {
    showWarning: warningLevel !== "low",
    warningLevel,
    headline,
    subheadline,
    primaryConcern,
    secondaryConcern,
    showUpsell: true,
    upsellReason: "Deeper damage, title, and ownership history checks remain hidden."
  };
}

function buildBuyerVerdict(report) {
  const riskLevel = report.signals.riskLevel;
  const recalls = Number(report.safety.recalls || 0);
  const complaints = Number(report.safety.complaints || 0);
  const topComponent = safeValue(report.safety.topComponent);
  const complexity = safeValue(report.ownership.maintenanceComplexity) || "Moderate";

  let headline = "Lower risk vehicle profile";
  let summary = "This vehicle profile shows fewer public risk signals than some alternatives, though any used vehicle should still be inspected carefully and supported by service history.";

  if (riskLevel === "High") {
    headline = "Proceed with caution";
    summary = `This vehicle profile shows elevated public risk signals. ${recalls} recall records and ${complaints} complaint records were found${topComponent ? `, with ${topComponent} appearing as the top complaint area` : ""}. Maintenance complexity is ${complexity.toLowerCase()}, so a careful inspection and strong service history matter more here than on a simpler platform.`;
  } else if (riskLevel === "Moderate") {
    headline = "Worth viewing, but inspect carefully";
    summary = `This vehicle profile shows some public risk signals. ${recalls} recall records and ${complaints} complaint records were found${topComponent ? `, with ${topComponent} appearing most often in complaint data` : ""}. Maintenance complexity is ${complexity.toLowerCase()}, so buyers should verify condition and maintenance before agreeing on price.`;
  }

  return {
    headline,
    summary
  };
}

function buildReportMeta(vehicle) {
  return {
    headline: "PRE PURCHASE INTELLIGENCE REPORT",
    stockId: buildStockId(vehicle),
    date: buildReportDateString()
  };
}

async function buildReportFromVin(vin) {
  const decodeUrl = `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValuesExtended/${vin}?format=json`;
  const decodeResponse = await fetch(decodeUrl);

  if (!decodeResponse.ok) {
    throw new Error("VIN decode request failed");
  }

  const decodeData = await decodeResponse.json();

  if (!decodeData.Results || !decodeData.Results.length) {
    throw new Error("No VIN data found");
  }

  const row = decodeData.Results[0];

  const vehicle = {
    year: String(getCorrectedYear(vin, row)),
    make: safeValue(row.Make),
    model: safeValue(row.Model),
    trim: safeValue(row.Trim),
    engine: safeValue(row.EngineModel),
    fuel: safeValue(row.FuelTypePrimary),
    body: safeValue(row.BodyClass),
    drive: safeValue(row.DriveType),
    vin,
    wmi: safeValue(row.WMI),
    plantCountry: safeValue(row.PlantCountry),
    manufacturer: safeValue(row.Manufacturer),
    series: safeValue(row.Series)
  };

  vehicle.title = buildVehicleTitle(vehicle);

  const safetyRecalls = await fetchRecalls(vehicle.year, vehicle.make, vehicle.model);
  const safetyComplaints = await fetchComplaints(vehicle.year, vehicle.make, vehicle.model);
  const efficiency = await fetchEfficiency(vehicle.year, vehicle.make, vehicle.model);
  const investigationData = await fetchInvestigations(vehicle.year, vehicle.make, vehicle.model);
  const specs = buildSpecsFromDecode(row, vehicle);

  const safety = {
    ...safetyRecalls,
    ...safetyComplaints
  };

  const ownership = buildOwnershipIntelligence(vehicle, safety);
  const optionProfile = buildOptionProfile(vehicle);
  const marketAnalysis = buildMarketAnalysis(vehicle);
  const engineAdvisory = buildEngineAdvisory(vehicle);
  const riskForecast = buildRiskForecast(vehicle, ownership, safety);
  const negotiationLeverage = buildNegotiationLeverage(vehicle, ownership, safety);
  const ownershipRoadmap = buildOwnershipRoadmap(vehicle);
  const purchaseChecklist = buildPurchaseChecklist(vehicle, ownership);

  const report = {
    reportMeta: buildReportMeta(vehicle),
    vehicle,
    safety,
    efficiency,
    specs,
    ownership,
    optionProfile,
    marketAnalysis,
    engineAdvisory,
    riskForecast,
    negotiationLeverage,
    ownershipRoadmap,
    purchaseChecklist,
    buyerVerdict: {
      headline: "",
      summary: ""
    },
    investigations: {
      items: investigationData.investigations,
      summary: investigationData.investigationSummary
    },
    signals: {
      coverageScore: 0,
      confidenceLevel: "",
      riskLevel: "",
      attentionFlags: [],
      allowPurchase: false
    },
    frontEndSummary: {
      headline: "",
      subheadline: ""
    },
    freeSignals: {},
    upsellTriggers: {
      historyAudit: true,
      titleCheck: true,
      damageCheck: true,
      ownershipCheck: true
    },
    locked: {
      historyAuditAvailable: true,
      damageRiskHidden: true,
      titleRiskHidden: true,
      ownershipRiskHidden: true,
      structuralRiskHidden: true
    }
  };

  report.signals.coverageScore = calculateCoverageScore(report);
  report.signals.confidenceLevel = buildConfidenceLevel(report.signals.coverageScore);
  report.signals.riskLevel = buildRiskLevel(report);
  report.signals.attentionFlags = buildAttentionFlags(report);
  report.signals.allowPurchase = report.signals.coverageScore >= 60;

  const frontSignals = buildFrontEndSignals(report);
  report.frontEndSummary.headline = frontSignals.headline;
  report.frontEndSummary.subheadline = frontSignals.subheadline;
  report.freeSignals = frontSignals;

  report.buyerVerdict = buildBuyerVerdict(report);

  if (!report.vehicle.engine) {
    report.vehicle.engine = report.specs.engineDisplay;
  }

  if (!report.specs.transmission) {
    report.specs.transmission = upperText(report.vehicle.make) === "BMW"
      ? "8-Speed ZF Automatic"
      : "Automatic transmission configuration";
  }

  return report;
}

app.get("/", (req, res) => {
  res.json({
    ok: true,
    message: "VIN intelligence backend is running"
  });
});

app.get("/api/health", (req, res) => {
  res.json({ status: "server.js confirmed" });
});

app.get("/api/decode/:vin", async (req, res) => {
  try {
    const vin = sanitizeVin(req.params.vin);

    if (vin.length !== 17) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid 17 character VIN"
      });
    }

    const report = await buildReportFromVin(vin);

    res.json({
      success: true,
      vin,
      report
    });
  } catch (error) {
    console.error("Decode error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong while decoding the VIN",
      error: String(error.message || error)
    });
  }
});

app.get("/api/checkout-test", (req, res) => {
  res.json({
    ok: true,
    message: "checkout test route is alive"
  });
});

async function handleCheckoutSession(req, res) {
  console.log("HIT CHECKOUT ROUTE");

  try {
    const vin = sanitizeVin(req.body?.vin);
    const sourcePage = req.body?.sourcePage || "";
    const pageTitle = req.body?.pageTitle || "";

    console.log("Incoming checkout request for VIN:", vin);
    console.log("Source page:", sourcePage);
    console.log("Page title:", pageTitle);
    console.log("Checkout route using price id:", JSON.stringify(process.env.STRIPE_VIN_REPORT_PRICE_ID));
    console.log("Checkout route using BASE_URL:", JSON.stringify(process.env.BASE_URL));
    console.log("Checkout route using API_BASE:", JSON.stringify(process.env.API_BASE));

    if (!vin || vin.length !== 17) {
      return res.status(400).json({ error: "Invalid VIN" });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price: process.env.STRIPE_VIN_REPORT_PRICE_ID,
          quantity: 1
        }
      ],
      success_url: `${process.env.API_BASE}/customer-report/${encodeURIComponent(vin)}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.BASE_URL}/cancel?vin=${encodeURIComponent(vin)}`,
      metadata: {
        vin,
        type: "vin_report",
        source_page: sourcePage,
        page_title: pageTitle
      }
    });

    console.log("Stripe session created:", session.id);

    return res.json({ url: session.url });
  } catch (err) {
    console.error("Stripe checkout error full object:", err);

    return res.status(500).json({
      error: "Stripe failed",
      details: err && err.message ? err.message : String(err),
      priceIdUsed: process.env.STRIPE_VIN_REPORT_PRICE_ID,
      baseUrlUsed: process.env.BASE_URL,
      apiBaseUsed: process.env.API_BASE
    });
  }
}

app.post("/create-checkout-session", handleCheckoutSession);
app.post("/api/create-checkout-session", handleCheckoutSession);

app.get("/api/test", (req, res) => {
  res.json({
    ok: true,
    message: "Backend is working"
  });
});

app.get("/which-backend", (req, res) => {
  res.json({
    ok: true,
    backend: "server.js"
  });
});

app.get("/api/decode-test/:vin", async (req, res) => {
  try {
    let vin = (req.params.vin || "")
      .toString()
      .trim()
      .toUpperCase()
      .replace(/\s+/g, "");

    if (!vin) {
      return res.status(400).json({
        ok: false,
        error: "VIN is required"
      });
    }

    if (vin.length !== 17) {
      return res.status(400).json({
        ok: false,
        error: "VIN must be 17 characters"
      });
    }

    if (/[IOQ]/.test(vin)) {
      return res.status(400).json({
        ok: false,
        error: "VIN cannot contain I, O, or Q"
      });
    }

    const nhtsaUrl =
      "https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValuesExtended/" +
      encodeURIComponent(vin) +
      "?format=json";

    const nhtsaRes = await fetch(nhtsaUrl, {
      headers: {
        Accept: "application/json"
      }
    });

    const nhtsaData = await nhtsaRes.json();
    const row =
      nhtsaData &&
      nhtsaData.Results &&
      nhtsaData.Results[0]
        ? nhtsaData.Results[0]
        : null;

    if (!row || (!row.Make && !row.Model)) {
      return res.status(400).json({
        ok: false,
        error: "We could not decode that VIN"
      });
    }

    return res.json({
      ok: true,
      vin,
      identity: {
        year: row.ModelYear || "",
        make: row.Make || "",
        model: row.Model || ""
      }
    });
  } catch (error) {
    console.error("decode-test error:", error);
    return res.status(500).json({
      ok: false,
      error: "Server error"
    });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log("Backend intelligence server running on port " + PORT);
});
