const express = require("express")

const app = express()

console.log("THIS IS THE BACKEND 3002 FILE")

app.use(express.json())

function sanitizeVin(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .replace(/[IOQ]/g, "")
    .slice(0, 17)
}

function safeValue(value) {
  return value && String(value).trim() ? String(value).trim() : ""
}

function upperText(value) {
  return safeValue(value).toUpperCase()
}

function normalizeText(value) {
  return upperText(value).replace(/[-_/]/g, " ").replace(/\s+/g, " ").trim()
}

function intValue(value) {
  const n = parseInt(value, 10)
  return Number.isNaN(n) ? null : n
}

function buildVehicleTitle(vehicle) {
  return [
    safeValue(vehicle.year),
    safeValue(vehicle.make),
    safeValue(vehicle.model),
    safeValue(vehicle.trim)
  ].filter(Boolean).join(" ")
}

function xmlTag(xml, tag) {
  const match = String(xml || "").match(new RegExp(`<${tag}>(.*?)</${tag}>`, "i"))
  return match ? match[1].trim() : ""
}

function buildEcoBadge(ghgScore, smartwayScore) {
  const ghg = Number(ghgScore || 0)
  const smartway = String(smartwayScore || "")

  if (smartway === "2") return "SmartWay Elite"
  if (smartway === "1") return "SmartWay"
  if (ghg >= 8) return "Low Emissions"
  if (ghg > 0 && ghg <= 4) return "Higher Emissions"

  return "Standard Profile"
}

function getBodyType(vehicle) {
  const body = upperText(vehicle.body)

  if (body.includes("COUPE")) return "coupe"
  if (body.includes("CONVERTIBLE") || body.includes("CABRIOLET") || body.includes("ROADSTER")) return "convertible"
  if (body.includes("WAGON") || body.includes("ESTATE") || body.includes("TOURING")) return "wagon"
  if (body.includes("HATCHBACK") || body.includes("LIFTBACK") || body.includes("FASTBACK")) return "hatchback"
  if (body.includes("SEDAN") || body.includes("SALOON")) return "sedan"
  if (body.includes("SPORT UTILITY") || body.includes("MULTIPURPOSE") || body.includes("CROSSOVER") || body.includes("UTILITY")) return "suv"
  if (body.includes("PICKUP")) return "truck"

  return "unknown"
}

function getDriveTypeGroup(vehicle) {
  const drive = upperText(vehicle.drive)

  if (drive.includes("AWD") || drive.includes("4WD") || drive.includes("4X4") || drive.includes("XDRIVE") || drive.includes("QUATTRO")) return "awd"
  if (drive.includes("FWD") || drive.includes("FRONT")) return "fwd"
  if (drive.includes("RWD") || drive.includes("REAR")) return "rwd"

  return "unknown"
}

function getFuelGroup(vehicle) {
  const fuel = upperText(vehicle.fuel)

  if (fuel.includes("ELECTRIC")) return "electric"
  if (fuel.includes("HYBRID") || fuel.includes("PHEV") || fuel.includes("PLUG")) return "hybrid"
  if (fuel.includes("DIESEL")) return "diesel"
  if (fuel.includes("GAS") || fuel.includes("GASOLINE") || fuel.includes("PETROL")) return "gas"

  return "unknown"
}

function inferBMWEngineFamily(vehicle) {
  const year = intValue(vehicle.year)
  const model = upperText(vehicle.model)
  const trim = upperText(vehicle.trim)

  if (model.includes("M3")) {
    if (year && year >= 2021) {
      return {
        family: "S58",
        label: "Likely S58 3.0L Twin Turbo Inline 6",
        confidence: "High"
      }
    }

    return {
      family: "S55 or earlier M engine",
      label: "Likely M specific performance engine",
      confidence: "Medium"
    }
  }

  if (model.includes("340") || trim.includes("340") || trim.includes("M340")) {
    return {
      family: "B58",
      label: "Likely B58 3.0L Turbo Inline 6",
      confidence: "High"
    }
  }

  if (model.includes("330E")) {
    return {
      family: "B48 Hybrid",
      label: "Likely B48 based plug in hybrid powertrain",
      confidence: "High"
    }
  }

  if (model.includes("330") || model.includes("320") || model.includes("328")) {
    if (year && year >= 2019) {
      return {
        family: "B48",
        label: "Likely B48 2.0L Turbo Inline 4",
        confidence: "High"
      }
    }

    if (year && year >= 2012) {
      return {
        family: "B48 or N20",
        label: "Likely modern BMW turbocharged four cylinder",
        confidence: "Medium"
      }
    }
  }

  if (model.includes("335")) {
    return {
      family: "N55",
      label: "Likely N55 3.0L Turbo Inline 6",
      confidence: "High"
    }
  }

  return {
    family: "",
    label: "",
    confidence: "Low"
  }
}

function inferBMWGeneration(vehicle) {
  const year = intValue(vehicle.year)
  const body = getBodyType(vehicle)

  if (year === null) {
    return {
      name: "Unknown Generation",
      summary: "Generation context could not be determined."
    }
  }

  if (year >= 2006 && year <= 2011) {
    if (body === "coupe") return { name: "E92", summary: "Known for strong driving feel with aging cooling and suspension concerns." }
    if (body === "convertible") return { name: "E93", summary: "Adds folding roof complexity on top of core E9x maintenance items." }
    if (body === "wagon") return { name: "E91", summary: "Practical wagon platform with common aging ownership issues." }
    return { name: "E90", summary: "Popular platform with cooling, leak, and suspension related ownership checks." }
  }

  if (year >= 2012 && year <= 2018) {
    if (body === "wagon") return { name: "F31", summary: "Modern wagon platform with turbocharged engine and electronics considerations." }
    if (body === "hatchback") return { name: "F34", summary: "Gran Turismo variant with added comfort and more electronic complexity." }
    return { name: "F30", summary: "Turbocharged era 3 Series with timing chain, cooling, and electronics attention points." }
  }

  if (year >= 2019) {
    return { name: "G20", summary: "Latest 3 Series era with improved tech, safety, and software dependent ownership checks." }
  }

  return {
    name: `${year} Platform`,
    summary: "Limited generation context available."
  }
}

function dedupe(values) {
  return Array.from(new Set(values.filter(Boolean)))
}

function buildComplaintLevel(safety) {
  const complaintCount = Number(safety.complaints || 0)

  if (complaintCount >= 50) return "Higher"
  if (complaintCount >= 15) return "Moderate"
  return "Low"
}

function buildOwnershipBase(vehicle, safety, config) {
  return {
    brandFocus: config.brandFocus || safeValue(vehicle.make) || "Generic",
    sectionTitle: config.sectionTitle || `${safeValue(vehicle.make) || "Vehicle"} Ownership Intelligence`,
    generation: safeValue(config.generation),
    generationSummary: safeValue(config.generationSummary),
    enginePlatform: safeValue(config.enginePlatform),
    engineLabel: safeValue(config.engineLabel),
    engineConfidence: safeValue(config.engineConfidence) || "Low",
    maintenanceComplexity: safeValue(config.maintenanceComplexity) || "Moderate",
    complaintLevel: safeValue(config.complaintLevel) || buildComplaintLevel(safety),
    commonIssues: dedupe(config.commonIssues || []),
    inspectionChecks: dedupe(config.inspectionChecks || []),
    expensiveFailureAreas: dedupe(config.expensiveFailureAreas || []),
    testDriveChecks: dedupe(config.testDriveChecks || []),
    ownershipAdvice: safeValue(config.ownershipAdvice) || `${safeValue(vehicle.make) || "This vehicle"} should be evaluated with attention to service history, warning lights, drivetrain behavior, and visible repair quality.`
  }
}

function buildBMWOwnership(vehicle, safety) {
  const generation = inferBMWGeneration(vehicle)
  const engine = inferBMWEngineFamily(vehicle)

  const commonIssues = [
    "Cooling system checks",
    "Oil leak inspection",
    "Electronic faults",
    "Suspension wear",
    "Service history gaps"
  ]

  if (engine.family === "B48") commonIssues.push("Turbo four cylinder maintenance sensitivity")
  if (engine.family === "B58") commonIssues.push("Cooling and intake related maintenance checks")
  if (engine.family === "N55") commonIssues.push("Turbo six cylinder leak and cooling checks")

  return buildOwnershipBase(vehicle, safety, {
    brandFocus: "BMW",
    generation: generation.name,
    generationSummary: generation.summary,
    enginePlatform: engine.family,
    engineLabel: engine.label,
    engineConfidence: engine.confidence,
    maintenanceComplexity: "Higher",
    commonIssues,
    inspectionChecks: [
      "Check for warning lights",
      "Inspect for coolant or oil leaks",
      "Test transmission response",
      "Check suspension noises",
      "Review full service history",
      "Inspect for poor accident repairs"
    ],
    expensiveFailureAreas: [
      "Cooling system components",
      "Oil leaks and gasket repairs",
      "Electronic modules and sensors",
      "Suspension bushings and arms"
    ],
    testDriveChecks: [
      "Listen for suspension knocks",
      "Watch for drivetrain hesitation",
      "Check for warning lights after restart",
      "Confirm smooth transmission behavior"
    ],
    ownershipAdvice: engine.label
      ? `This ${vehicle.make} ${vehicle.model} likely uses ${engine.label}. Buyers should verify maintenance history and inspect for cooling, leak, and electronics related issues.`
      : `This ${vehicle.make} ${vehicle.model} sits in a higher maintenance ownership category than a typical mass market vehicle.`
  })
}

function buildAudiOwnership(vehicle, safety) {
  return buildOwnershipBase(vehicle, safety, {
    brandFocus: "Audi",
    maintenanceComplexity: "Higher",
    enginePlatform: "Audi turbocharged platform",
    engineLabel: "Likely turbocharged Audi petrol, diesel, or hybrid powertrain",
    engineConfidence: "Medium",
    commonIssues: [
      "Cooling system faults",
      "Oil leaks",
      "Electronic issues",
      "Suspension wear",
      "Carbon buildup on some direct injection engines"
    ],
    inspectionChecks: [
      "Check coolant level and leaks",
      "Scan for warning lights",
      "Test transmission response",
      "Listen for suspension noise",
      "Check quattro behavior under load",
      "Inspect service history carefully"
    ],
    expensiveFailureAreas: [
      "Cooling system repairs",
      "Timing related repairs on older engines",
      "Transmission faults",
      "Electronic module issues"
    ],
    testDriveChecks: [
      "Watch for hesitation under load",
      "Check steering and braking feel",
      "Listen for driveline vibration",
      "Confirm smooth gear changes"
    ],
    ownershipAdvice: `Audi ownership can be rewarding, but buyers should pay close attention to cooling system health, oil leaks, transmission behavior, and electrical faults before purchase.`
  })
}

function buildMercedesOwnership(vehicle, safety) {
  return buildOwnershipBase(vehicle, safety, {
    brandFocus: "Mercedes",
    maintenanceComplexity: "Higher",
    enginePlatform: "Mercedes platform",
    engineLabel: "Likely Mercedes petrol, diesel, hybrid, or AMG oriented powertrain",
    engineConfidence: "Medium",
    commonIssues: [
      "Air suspension or suspension wear on some models",
      "Electronic and module faults",
      "Oil leaks",
      "Cooling system wear",
      "Service history gaps"
    ],
    inspectionChecks: [
      "Check for suspension sag or warning lights",
      "Inspect infotainment and screen functions",
      "Test transmission smoothness",
      "Inspect for oil or coolant leaks",
      "Review service history thoroughly"
    ],
    expensiveFailureAreas: [
      "Air suspension repairs",
      "Electronic modules and control units",
      "Turbo and cooling system repairs",
      "Transmission related repairs"
    ],
    testDriveChecks: [
      "Check ride quality over bumps",
      "Watch for drivetrain hesitation",
      "Confirm all interior electronics work",
      "Check for warning lights after restart"
    ],
    ownershipAdvice: `Mercedes vehicles often feel refined, but buyers should inspect electronic systems, suspension condition, and service history carefully before committing.`
  })
}

function buildPorscheOwnership(vehicle, safety) {
  return buildOwnershipBase(vehicle, safety, {
    brandFocus: "Porsche",
    maintenanceComplexity: "Higher",
    enginePlatform: "Porsche performance platform",
    engineLabel: "Likely Porsche performance oriented petrol, hybrid, or EV powertrain",
    engineConfidence: "Medium",
    commonIssues: [
      "Cooling system wear",
      "Brake and tire wear",
      "Oil leaks on some older platforms",
      "Suspension component wear",
      "Electronic faults"
    ],
    inspectionChecks: [
      "Inspect service history closely",
      "Check for coolant leaks",
      "Inspect brakes and tires carefully",
      "Test transmission response",
      "Look for evidence of poor repairs or track abuse"
    ],
    expensiveFailureAreas: [
      "Braking system refresh",
      "Suspension component replacement",
      "Cooling system repairs",
      "Transmission or driveline repairs"
    ],
    testDriveChecks: [
      "Check for vibration under braking",
      "Confirm smooth shifting",
      "Listen for suspension knocks",
      "Watch for overheating or warning lights"
    ],
    ownershipAdvice: `Porsche vehicles can hide expensive wear if they have been driven hard. Buyers should prioritize documentation, cooling system health, and careful brake and suspension inspection.`
  })
}

function buildToyotaOwnership(vehicle, safety) {
  const fuel = getFuelGroup(vehicle)

  const commonIssues = [
    "Water pump wear on some engines",
    "Oil seepage on higher mileage examples",
    "Suspension wear",
    "Infotainment or sensor faults"
  ]

  const expensiveFailureAreas = [
    "Transmission repairs",
    "Hybrid battery replacement on older hybrids",
    "Suspension refresh work"
  ]

  if (fuel === "hybrid") {
    commonIssues.push("Hybrid battery aging on older examples")
  }

  return buildOwnershipBase(vehicle, safety, {
    brandFocus: safeValue(vehicle.make) || "Toyota",
    maintenanceComplexity: fuel === "hybrid" ? "Moderate" : "Lower to Moderate",
    enginePlatform: fuel === "hybrid" ? "Toyota or Lexus hybrid platform" : "Toyota or Lexus petrol platform",
    engineLabel: fuel === "hybrid" ? "Likely Toyota or Lexus hybrid powertrain" : "Likely Toyota or Lexus naturally aspirated or turbo petrol engine",
    engineConfidence: "Medium",
    commonIssues,
    inspectionChecks: [
      "Check cold start smoothness",
      "Inspect for fluid leaks",
      "Test transmission shift quality",
      "Listen for suspension knocks",
      "Check hybrid warnings where applicable",
      "Review service history"
    ],
    expensiveFailureAreas,
    testDriveChecks: [
      "Confirm smooth steering and braking",
      "Watch for drivetrain hesitation",
      "Check for warning lights",
      "Listen for wheel bearing or suspension noise"
    ],
    ownershipAdvice: `${vehicle.make || "Toyota or Lexus"} vehicles are often dependable, but buyers should still inspect service history, suspension condition, fluid leaks, and hybrid health where applicable.`
  })
}

function buildHondaOwnership(vehicle, safety) {
  return buildOwnershipBase(vehicle, safety, {
    brandFocus: safeValue(vehicle.make) || "Honda",
    maintenanceComplexity: "Moderate",
    enginePlatform: "Honda or Acura platform",
    engineLabel: "Likely Honda or Acura petrol, hybrid, or VTEC based powertrain",
    engineConfidence: "Medium",
    commonIssues: [
      "Oil seepage on higher mileage examples",
      "Transmission wear on some models",
      "Suspension wear",
      "Aging air conditioning components",
      "Electronic sensor issues"
    ],
    inspectionChecks: [
      "Check transmission behavior when cold and warm",
      "Inspect for leaks",
      "Test air conditioning performance",
      "Listen for suspension knocks",
      "Review maintenance history"
    ],
    expensiveFailureAreas: [
      "Transmission related repairs",
      "Air conditioning compressor repairs",
      "Suspension rebuild work"
    ],
    testDriveChecks: [
      "Check shift quality carefully",
      "Confirm straight line braking",
      "Listen for front suspension noise",
      "Check for warning lights after driving"
    ],
    ownershipAdvice: `${vehicle.make || "Honda or Acura"} vehicles are often durable, but transmission condition, suspension wear, and maintenance history still matter a great deal on used examples.`
  })
}

function buildFordOwnership(vehicle, safety) {
  return buildOwnershipBase(vehicle, safety, {
    brandFocus: safeValue(vehicle.make) || "Ford",
    maintenanceComplexity: "Moderate",
    enginePlatform: "Ford or Lincoln platform",
    engineLabel: "Likely Ford petrol, EcoBoost, hybrid, or truck oriented powertrain",
    engineConfidence: "Medium",
    commonIssues: [
      "Turbo or cooling concerns on some EcoBoost engines",
      "Transmission behavior on some models",
      "Suspension wear",
      "Electrical faults",
      "Service history gaps"
    ],
    inspectionChecks: [
      "Check for coolant leaks",
      "Test transmission smoothness",
      "Inspect for turbo noises where applicable",
      "Check steering and suspension feel",
      "Review service history"
    ],
    expensiveFailureAreas: [
      "Turbocharger and cooling repairs",
      "Transmission repairs",
      "Front suspension work",
      "Electronic module issues"
    ],
    testDriveChecks: [
      "Watch for hesitation under acceleration",
      "Check for harsh shifts",
      "Listen for driveline noises",
      "Confirm warning light free restart"
    ],
    ownershipAdvice: `${vehicle.make || "Ford or Lincoln"} vehicles should be checked for transmission behavior, cooling system condition, and suspension wear before purchase, especially on higher mileage examples.`
  })
}

function buildGMOwnership(vehicle, safety) {
  return buildOwnershipBase(vehicle, safety, {
    brandFocus: safeValue(vehicle.make) || "GM",
    maintenanceComplexity: "Moderate",
    enginePlatform: "GM platform",
    engineLabel: "Likely GM petrol, diesel, truck, or performance oriented powertrain",
    engineConfidence: "Medium",
    commonIssues: [
      "Transmission wear on some models",
      "Electrical and sensor faults",
      "Suspension wear",
      "Oil leaks on higher mileage examples",
      "Active fuel management concerns on some engines"
    ],
    inspectionChecks: [
      "Test transmission response carefully",
      "Inspect for oil leaks",
      "Check for warning lights",
      "Listen for lifter or valvetrain noise where relevant",
      "Review service history"
    ],
    expensiveFailureAreas: [
      "Transmission rebuilds",
      "Engine top end repairs on some V8 platforms",
      "Suspension work",
      "Electronic module replacement"
    ],
    testDriveChecks: [
      "Check for harsh shifts or flares",
      "Listen for engine noise at idle and load",
      "Check steering straightness",
      "Confirm all electronics work"
    ],
    ownershipAdvice: `${vehicle.make || "GM"} vehicles can be solid used buys, but buyers should pay special attention to transmission behavior, engine noises, and maintenance documentation.`
  })
}

function buildHyundaiKiaOwnership(vehicle, safety) {
  return buildOwnershipBase(vehicle, safety, {
    brandFocus: safeValue(vehicle.make) || "Hyundai, Kia, or Genesis",
    maintenanceComplexity: "Moderate",
    enginePlatform: "Hyundai, Kia, or Genesis platform",
    engineLabel: "Likely Korean petrol, hybrid, or EV platform",
    engineConfidence: "Medium",
    commonIssues: [
      "Engine wear on some older petrol platforms",
      "Electrical and sensor issues",
      "Suspension wear",
      "Infotainment faults",
      "Service history gaps"
    ],
    inspectionChecks: [
      "Check for engine noise and smoke",
      "Inspect for warning lights",
      "Test transmission response",
      "Verify recall completion",
      "Review service history closely"
    ],
    expensiveFailureAreas: [
      "Engine replacement on affected platforms",
      "Transmission repairs",
      "Electronic module repairs",
      "Suspension work"
    ],
    testDriveChecks: [
      "Listen for knocking or ticking",
      "Watch for hesitation or poor shifting",
      "Check steering feel",
      "Verify all screens and driver assists work"
    ],
    ownershipAdvice: `${vehicle.make || "These vehicles"} should be checked carefully for engine health, recall history, warning lights, and maintenance documentation before purchase.`
  })
}

function buildTeslaOwnership(vehicle, safety) {
  return buildOwnershipBase(vehicle, safety, {
    brandFocus: "Tesla",
    maintenanceComplexity: "Moderate to Higher",
    enginePlatform: "Tesla EV platform",
    engineLabel: "Tesla electric drive unit and battery platform",
    engineConfidence: "High",
    commonIssues: [
      "Suspension wear",
      "Alignment and tire wear",
      "Screen or module faults",
      "Charging system diagnostics",
      "Fit and finish issues"
    ],
    inspectionChecks: [
      "Check range consistency",
      "Verify charging performance",
      "Inspect for warning messages",
      "Listen for suspension noises",
      "Inspect panel alignment and water ingress"
    ],
    expensiveFailureAreas: [
      "Battery pack diagnostics",
      "Drive unit repairs",
      "Screen and module replacement",
      "Suspension work"
    ],
    testDriveChecks: [
      "Watch for warning messages",
      "Check regen and braking smoothness",
      "Listen for suspension noise",
      "Test charging where possible"
    ],
    ownershipAdvice: `Tesla ownership is very different from a combustion vehicle. Buyers should prioritize battery health, charging behavior, suspension condition, and software or warning message checks.`
  })
}

function buildGenericOwnership(vehicle, safety) {
  const body = getBodyType(vehicle)
  const fuel = getFuelGroup(vehicle)
  const drive = getDriveTypeGroup(vehicle)
  const make = safeValue(vehicle.make) || "This vehicle"

  const commonIssues = [
    "Service history gaps",
    "Suspension wear",
    "Brake wear",
    "Electrical issues"
  ]

  const inspectionChecks = [
    "Review service history",
    "Check warning lights",
    "Inspect tires and brakes",
    "Test drivetrain response",
    "Inspect for fluid leaks"
  ]

  const expensiveFailureAreas = [
    "Transmission related repairs",
    "Suspension wear items",
    "Electrical and module faults"
  ]

  const testDriveChecks = [
    "Check steering straightness",
    "Listen for brake or suspension noise",
    "Test acceleration and shifting",
    "Look for warning lights after driving"
  ]

  if (body === "suv") {
    commonIssues.push("Higher weight related suspension wear")
    expensiveFailureAreas.push("Front suspension and wheel bearing wear")
  }

  if (fuel === "hybrid" || fuel === "electric") {
    commonIssues.push("Electrified system diagnostic complexity")
    expensiveFailureAreas.push("Battery and power electronics diagnostics")
  }

  if (drive === "awd") {
    commonIssues.push("All wheel drive system servicing")
    expensiveFailureAreas.push("Transfer case or coupling related repairs")
  }

  if (body === "truck") {
    expensiveFailureAreas.push("Tow related drivetrain wear")
  }

  return buildOwnershipBase(vehicle, safety, {
    brandFocus: make,
    sectionTitle: `${make} Ownership Intelligence`,
    maintenanceComplexity: fuel === "hybrid" || fuel === "electric" ? "Moderate to Higher" : "Moderate",
    enginePlatform: "Manufacturer specific",
    engineLabel: "Varies by trim and engine configuration",
    engineConfidence: "Low",
    commonIssues,
    inspectionChecks,
    expensiveFailureAreas,
    testDriveChecks,
    ownershipAdvice: `${make} should be evaluated with attention to service history, drivetrain behavior, warning lights, and visible repair quality.`
  })
}

function buildOwnershipIntelligence(vehicle, safety) {
  const make = upperText(vehicle.make)

  if (make === "BMW") return buildBMWOwnership(vehicle, safety)
  if (make === "AUDI") return buildAudiOwnership(vehicle, safety)
  if (make === "MERCEDES-BENZ" || make === "MERCEDES BENZ" || make === "MERCEDES") return buildMercedesOwnership(vehicle, safety)
  if (make === "PORSCHE") return buildPorscheOwnership(vehicle, safety)
  if (make === "TOYOTA" || make === "LEXUS") return buildToyotaOwnership(vehicle, safety)
  if (make === "HONDA" || make === "ACURA") return buildHondaOwnership(vehicle, safety)
  if (make === "FORD" || make === "LINCOLN") return buildFordOwnership(vehicle, safety)
  if (make === "CHEVROLET" || make === "GMC" || make === "CADILLAC" || make === "BUICK") return buildGMOwnership(vehicle, safety)
  if (make === "HYUNDAI" || make === "KIA" || make === "GENESIS") return buildHyundaiKiaOwnership(vehicle, safety)
  if (make === "TESLA") return buildTeslaOwnership(vehicle, safety)

  return buildGenericOwnership(vehicle, safety)
}

function buildOptionProfile(vehicle) {
  const make = upperText(vehicle.make)
  const trim = upperText(vehicle.trim)
  const year = intValue(vehicle.year) || 0
  const body = getBodyType(vehicle)
  const drive = getDriveTypeGroup(vehicle)
  const fuel = getFuelGroup(vehicle)

  let sportScore = 34
  let comfortScore = 42
  let techScore = 38

  let sportLabel = "Sport Package"
  let comfortLabel = "Comfort Package"
  let techLabel = year >= 2019 ? "Driver Assistance Package" : "Technology Package"

  if (make === "BMW") {
    sportLabel = "M Sport Package"
    comfortLabel = "Premium Package"
    techLabel = year >= 2019 ? "Driver Assistance or Live Cockpit Package" : "Technology Package"
  } else if (make === "AUDI") {
    sportLabel = "Sport or S line Package"
    comfortLabel = "Premium Package"
    techLabel = "Technology or Driver Assistance Package"
  } else if (make === "MERCEDES-BENZ" || make === "MERCEDES BENZ" || make === "MERCEDES") {
    sportLabel = "Sport or AMG Line Package"
    comfortLabel = "Premium Package"
    techLabel = "Driver Assistance or Multimedia Package"
  } else if (make === "PORSCHE") {
    sportLabel = "Sport Chrono or Sport Package"
    comfortLabel = "Premium Package"
    techLabel = "Driver Assistance or Infotainment Package"
  } else if (make === "TOYOTA" || make === "LEXUS") {
    sportLabel = "Sport Appearance Package"
    comfortLabel = "Comfort or Luxury Package"
    techLabel = "Safety or Navigation Package"
  } else if (make === "HONDA" || make === "ACURA") {
    sportLabel = "Sport Package"
    comfortLabel = "Comfort Package"
    techLabel = "Technology Package"
  } else if (make === "TESLA") {
    sportLabel = "Performance Trim"
    comfortLabel = "Premium Interior Package"
    techLabel = "Autopilot or Full Self Driving Package"
  }

  if (body === "coupe" || body === "convertible") sportScore += 18
  if (body === "suv") comfortScore += 12
  if (drive === "awd") comfortScore += 6
  if (fuel === "hybrid" || fuel === "electric") techScore += 16
  if (year >= 2019) techScore += 14

  if (trim.includes("M SPORT") || trim.includes("SPORT") || trim.includes("S LINE") || trim.includes("AMG")) sportScore += 18
  if (trim.includes("PREMIUM") || trim.includes("LUXURY") || trim.includes("LIMITED") || trim.includes("PLATINUM")) comfortScore += 18
  if (trim.includes("TECH") || trim.includes("ADVANCE") || trim.includes("PRESTIGE") || trim.includes("ELITE")) techScore += 18

  const clamp = (n) => Math.max(18, Math.min(99, Math.round(n)))

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
  }
}

function buildSpecsFromDecode(row) {
  const length = safeValue(row.VehicleLength || row.WheelBaseLong)
  const width = safeValue(row.VehicleWidth)
  const height = safeValue(row.VehicleHeight)
  const weightClass = safeValue(row.GVWR)

  return {
    horsepower: safeValue(row.EngineHP),
    transmission: safeValue(row.TransmissionStyle || row.TransmissionSpeeds),
    dimensions: [length, width, height].filter(Boolean).join(" × "),
    curbWeight: safeValue(row.CurbWeightLB),
    weightClass
  }
}

function buildRecallSeverityLabel(item) {
  const text = upperText(
    safeValue(item.Component) + " " +
    safeValue(item.Summary) + " " +
    safeValue(item.Remedy)
  )

  if (
    text.includes("AIR BAG") ||
    text.includes("BRAKE") ||
    text.includes("FIRE") ||
    text.includes("STEERING") ||
    text.includes("FUEL LEAK")
  ) {
    return "Higher Attention"
  }

  if (
    text.includes("VISIBILITY") ||
    text.includes("ELECTRICAL") ||
    text.includes("SUSPENSION") ||
    text.includes("POWER TRAIN") ||
    text.includes("POWERTRAIN")
  ) {
    return "Moderate Attention"
  }

  return "General Attention"
}

async function fetchRecalls(year, make, model) {
  try {
    if (!year || !make || !model) {
      return {
        recalls: 0,
        recallSummary: "Recall data could not be checked because key vehicle details were missing.",
        recallDetails: []
      }
    }

    const url = `https://api.nhtsa.gov/recalls/recallsByVehicle?make=${encodeURIComponent(make)}&model=${encodeURIComponent(model)}&modelYear=${encodeURIComponent(year)}`
    const response = await fetch(url)

    if (!response.ok) {
      return {
        recalls: 0,
        recallSummary: "Recall data could not be retrieved right now.",
        recallDetails: []
      }
    }

    const data = await response.json()
    const results = Array.isArray(data.results) ? data.results : []

    const recallDetails = results.slice(0, 12).map(item => ({
      campaignNumber: safeValue(item.NHTSACampaignNumber || item.nhtsa_campaign_number || item.CampaignNumber),
      component: safeValue(item.Component || item.component || "General safety item"),
      summary: safeValue(item.Summary || item.summary || "Recall details available."),
      reportDate: safeValue(item.ReportReceivedDate || item.report_received_date),
      remedy: safeValue(item.Remedy || item.remedy),
      manufacturer: safeValue(item.Manufacturer || item.manufacturer),
      severity: buildRecallSeverityLabel(item)
    }))

    return {
      recalls: results.length,
      recallSummary: results.length
        ? `${results.length} manufacturer safety recall records found for this exact model year, make, and model.`
        : "No manufacturer safety recalls found for this exact model year, make, and model.",
      recallDetails
    }
  } catch {
    return {
      recalls: 0,
      recallSummary: "Recall data could not be retrieved right now.",
      recallDetails: []
    }
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
      }
    }

    const url = `https://api.nhtsa.gov/complaints/complaintsByVehicle?make=${encodeURIComponent(make)}&model=${encodeURIComponent(model)}&modelYear=${encodeURIComponent(year)}`
    const response = await fetch(url)

    if (!response.ok) {
      return {
        complaints: 0,
        topComponent: "",
        complaintSummary: "Complaint data could not be retrieved right now.",
        dataAvailable: false,
        complaintComponents: [],
        complaintDetails: []
      }
    }

    const data = await response.json()
    const results = Array.isArray(data.results) ? data.results : []

    const counts = {}
    for (const item of results) {
      const key = String(
        item.components ||
        item.component ||
        item.Component ||
        "Unknown Component"
      ).trim()

      counts[key] = (counts[key] || 0) + 1
    }

    let topComponent = ""
    let topCount = 0

    for (const key in counts) {
      if (counts[key] > topCount) {
        topCount = counts[key]
        topComponent = key
      }
    }

    const complaintComponents = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([component, count]) => ({
        component,
        count
      }))

    const complaintDetails = results.slice(0, 10).map(item => ({
      component: safeValue(item.components || item.component || item.Component || "Unknown Component"),
      summary: safeValue(item.summary || item.Summary || item.description || "Complaint record present."),
      date: safeValue(item.dateComplaintFiled || item.DateComplaintFiled || item.ReportReceivedDate),
      mileage: safeValue(item.mileage || item.Mileage)
    }))

    return {
      complaints: results.length,
      topComponent,
      complaintSummary: results.length
        ? `${results.length} owner complaint records found for this exact model year, make, and model.`
        : "No owner complaints found for this exact model year, make, and model.",
      dataAvailable: true,
      complaintComponents,
      complaintDetails
    }
  } catch {
    return {
      complaints: 0,
      topComponent: "",
      complaintSummary: "Complaint data could not be retrieved right now.",
      dataAvailable: false,
      complaintComponents: [],
      complaintDetails: []
    }
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
      }
    }

    const optionsUrl = `https://www.fueleconomy.gov/ws/rest/vehicle/menu/options?year=${encodeURIComponent(year)}&make=${encodeURIComponent(make)}&model=${encodeURIComponent(model)}`
    const optionsResponse = await fetch(optionsUrl)

    if (!optionsResponse.ok) {
      return {
        combinedMPG: "",
        annualFuelCost: "",
        ghgScore: "",
        ecoBadge: "",
        efficiencySummary: "Fuel economy data could not be retrieved right now.",
        dataAvailable: false
      }
    }

    const optionsXml = await optionsResponse.text()
    const vehicleId = xmlTag(optionsXml, "value")

    if (!vehicleId) {
      return {
        combinedMPG: "",
        annualFuelCost: "",
        ghgScore: "",
        ecoBadge: "",
        efficiencySummary: "No matching fuel economy record was found for this vehicle profile.",
        dataAvailable: false
      }
    }

    const detailUrl = `https://www.fueleconomy.gov/ws/rest/vehicle/${encodeURIComponent(vehicleId)}`
    const detailResponse = await fetch(detailUrl)

    if (!detailResponse.ok) {
      return {
        combinedMPG: "",
        annualFuelCost: "",
        ghgScore: "",
        ecoBadge: "",
        efficiencySummary: "Fuel economy detail data could not be retrieved right now.",
        dataAvailable: false
      }
    }

    const detailXml = await detailResponse.text()

    const combinedMPG = xmlTag(detailXml, "comb08")
    const annualFuelCostRaw = xmlTag(detailXml, "fuelCost08")
    const ghgScore = xmlTag(detailXml, "ghgScore")
    const smartwayScore = xmlTag(detailXml, "smartwayScore")

    let annualFuelCost = ""
    if (annualFuelCostRaw && !Number.isNaN(Number(annualFuelCostRaw))) {
      annualFuelCost = `$${Number(annualFuelCostRaw).toLocaleString()}`
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
    }
  } catch {
    return {
      combinedMPG: "",
      annualFuelCost: "",
      ghgScore: "",
      ecoBadge: "",
      efficiencySummary: "Fuel economy data could not be retrieved right now.",
      dataAvailable: false
    }
  }
}

async function fetchInvestigations(year, make, model) {
  try {
    if (!year || !make || !model) {
      return {
        investigations: [],
        investigationSummary: "Investigation data could not be checked because key vehicle details were missing."
      }
    }

    const url = "https://static.nhtsa.gov/odi/odi_investigations.json"
    const response = await fetch(url)

    if (!response.ok) {
      return {
        investigations: [],
        investigationSummary: "Investigation data could not be retrieved right now."
      }
    }

    const data = await response.json()
    const rows = Array.isArray(data?.results)
      ? data.results
      : Array.isArray(data)
        ? data
        : []

    const normalizedMake = upperText(make)
    const normalizedModel = upperText(model)
    const numericYear = intValue(year)

    const matches = rows.filter(item => {
      const text = upperText(
        safeValue(item.Manufacturer) + " " +
        safeValue(item.make) + " " +
        safeValue(item.Product) + " " +
        safeValue(item.Model) + " " +
        safeValue(item.Summary)
      )

      const yearText = safeValue(item.ModelYear || item.modelYear || item.Year)
      const hasMake = text.includes(normalizedMake)
      const hasModel = normalizedModel && text.includes(normalizedModel)
      const hasYear = numericYear ? yearText.includes(String(numericYear)) || text.includes(String(numericYear)) : true

      return hasMake && (hasModel || normalizedModel.length < 3) && hasYear
    }).slice(0, 8)

    const investigations = matches.map(item => ({
      actionNumber: safeValue(item.ActionNumber || item.actionNumber),
      component: safeValue(item.Component || item.component),
      summary: safeValue(item.Summary || item.summary || "Investigation record present."),
      dateOpened: safeValue(item.DateOpened || item.dateOpened || item.OpenDate),
      status: safeValue(item.Status || item.status || item.ClosingResume || "Recorded")
    }))

    return {
      investigations,
      investigationSummary: investigations.length
        ? `${investigations.length} possible safety investigation matches found for this vehicle profile.`
        : "No obvious safety investigation matches found for this vehicle profile."
    }
  } catch {
    return {
      investigations: [],
      investigationSummary: "Investigation data could not be retrieved right now."
    }
  }
}

async function fetchManufacturerCommunications(year, make, model) {
  try {
    if (!year || !make || !model) {
      return {
        items: [],
        summary: "Manufacturer communication data could not be checked because key vehicle details were missing."
      }
    }

    const url = "https://static.nhtsa.gov/odi/tsbs/tsbs.json"
    const response = await fetch(url)

    if (!response.ok) {
      return {
        items: [],
        summary: "Manufacturer communication data could not be retrieved right now."
      }
    }

    const data = await response.json()
    const rows = Array.isArray(data?.results)
      ? data.results
      : Array.isArray(data)
        ? data
        : []

    const normalizedMake = upperText(make)
    const normalizedModel = upperText(model)
    const numericYear = intValue(year)

    const matches = rows.filter(item => {
      const text = upperText(
        safeValue(item.make) + " " +
        safeValue(item.Make) + " " +
        safeValue(item.model) + " " +
        safeValue(item.Model) + " " +
        safeValue(item.summary) + " " +
        safeValue(item.Summary)
      )

      const yearText = safeValue(item.modelYear || item.ModelYear || item.year || item.Year)
      const hasMake = text.includes(normalizedMake)
      const hasModel = normalizedModel && text.includes(normalizedModel)
      const hasYear = numericYear ? yearText.includes(String(numericYear)) || text.includes(String(numericYear)) : true

      return hasMake && (hasModel || normalizedModel.length < 3) && hasYear
    }).slice(0, 12)

    const items = matches.map(item => ({
      bulletinNumber: safeValue(item.bulletinNumber || item.BulletinNumber || item.NHTSANumber),
      component: safeValue(item.component || item.Component),
      summary: safeValue(item.summary || item.Summary || "Manufacturer communication record present."),
      date: safeValue(item.date || item.Date),
      type: safeValue(item.type || item.Type || "Manufacturer Communication")
    }))

    return {
      items,
      summary: items.length
        ? `${items.length} manufacturer communication matches found for this vehicle profile.`
        : "No obvious manufacturer communication matches found for this vehicle profile."
    }
  } catch {
    return {
      items: [],
      summary: "Manufacturer communication data could not be retrieved right now."
    }
  }
}

function buildAttentionFlags(report) {
  const flags = []

  if (Number(report.safety.recalls || 0) >= 8) {
    flags.push("High recall activity")
  } else if (Number(report.safety.recalls || 0) >= 3) {
    flags.push("Moderate recall activity")
  }

  if (report.safety.dataAvailable && Number(report.safety.complaints || 0) >= 20) {
    flags.push("Meaningful complaint activity")
  } else if (report.safety.dataAvailable && Number(report.safety.complaints || 0) > 0) {
    flags.push("Complaint records present")
  }

  if (report.safety.topComponent) {
    flags.push(`Top complaint area: ${report.safety.topComponent}`)
  }

  if (report.investigations.items.length) {
    flags.push("Investigation history present")
  }

  if (report.communications.items.length) {
    flags.push("Manufacturer bulletins present")
  }

  if (!report.efficiency.combinedMPG) {
    flags.push("Fuel economy match unavailable")
  }

  if (report.ownership.maintenanceComplexity === "Higher" || report.ownership.maintenanceComplexity === "Moderate to Higher") {
    flags.push("Higher maintenance platform")
  }

  if (report.ownership.enginePlatform) {
    flags.push(`Engine platform: ${report.ownership.enginePlatform}`)
  }

  return flags
}

function buildRiskLevel(report) {
  let score = 0

  const recalls = Number(report.safety.recalls || 0)
  const complaints = Number(report.safety.complaints || 0)
  const investigations = Array.isArray(report.investigations.items) ? report.investigations.items.length : 0

  if (recalls >= 8) score += 3
  else if (recalls >= 3) score += 2
  else if (recalls > 0) score += 1

  if (report.safety.dataAvailable) {
    if (complaints >= 20) score += 3
    else if (complaints > 0) score += 1
  }

  if (investigations >= 1) score += 1
  if (report.ownership.maintenanceComplexity === "Higher" || report.ownership.maintenanceComplexity === "Moderate to Higher") score += 1
  if (!report.efficiency.combinedMPG) score += 1

  if (score >= 6) return "High"
  if (score >= 3) return "Moderate"
  return "Low"
}

function buildConfidenceLevel(coverageScore) {
  if (coverageScore >= 80) return "High Confidence"
  if (coverageScore >= 60) return "Good Coverage"
  if (coverageScore >= 40) return "Partial Coverage"
  return "Limited Coverage"
}

function calculateCoverageScore(report) {
  let score = 0

  if (report.vehicle.make && report.vehicle.model && report.vehicle.year) score += 25
  if (typeof report.safety.recalls === "number") score += 15
  if (report.safety.dataAvailable) score += 10
  if (report.efficiency.dataAvailable) score += 15
  if (report.ownership.commonIssues.length) score += 10
  if (report.ownership.inspectionChecks.length) score += 10
  if (report.ownership.enginePlatform) score += 5
  if (report.investigations.items.length) score += 5
  if (report.communications.items.length) score += 5

  const dimensionsPresent = !!safeValue(report.specs.dimensions)
  const hpPresent = !!safeValue(report.specs.horsepower)

  if (dimensionsPresent) score += 3
  if (hpPresent) score += 2

  return Math.min(score, 100)
}

function buildFrontEndSignals(report) {
  const recalls = Number(report.safety.recalls || 0)
  const complaints = Number(report.safety.complaints || 0)

  let warningLevel = "low"
  let headline = "Vehicle profile looks typical"
  let subheadline = "No major public safety signals were detected."
  let primaryConcern = ""
  let secondaryConcern = ""

  if (recalls >= 8) {
    warningLevel = "high"
    headline = "Potential ownership concerns detected"
    subheadline = "High recall activity was detected for this vehicle profile."
    primaryConcern = "High recall activity"
  } else if (recalls >= 3) {
    warningLevel = "medium"
    headline = "Some ownership concerns detected"
    subheadline = "Moderate recall activity was detected for this vehicle profile."
    primaryConcern = "Moderate recall activity"
  }

  if (report.safety.dataAvailable && complaints >= 20) {
    warningLevel = "high"
    headline = "Potential ownership concerns detected"
    subheadline = "Complaint activity was detected for this vehicle profile."
    primaryConcern = "High complaint activity"
  }

  if (report.ownership.maintenanceComplexity === "Higher" || report.ownership.maintenanceComplexity === "Moderate to Higher") {
    secondaryConcern = "Higher maintenance platform"
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
  }
}

function buildMissingDataFlags(report) {
  return {
    complaintDataMissing: !report.safety.dataAvailable,
    efficiencyDataMissing: !report.efficiency.dataAvailable,
    dimensionsMissing: !safeValue(report.specs.dimensions),
    decodedEngineMissing: !safeValue(report.vehicle.engine),
    inferredEngineUsed: !!safeValue(report.ownership.enginePlatform),
    investigationDataMissing: !Array.isArray(report.investigations.items),
    communicationDataMissing: !Array.isArray(report.communications.items)
  }
}

function buildBuyerVerdict(report) {
  const riskLevel = report.signals.riskLevel
  const recalls = Number(report.safety.recalls || 0)
  const complaints = Number(report.safety.complaints || 0)
  const topComponent = safeValue(report.safety.topComponent)
  const complexity = safeValue(report.ownership.maintenanceComplexity) || "Moderate"

  let headline = "Low public risk profile"
  let summary = "Public safety and ownership signals look relatively typical for this vehicle profile."

  if (riskLevel === "High") {
    headline = "Proceed with caution"
    summary = `This vehicle profile shows elevated public risk signals. ${recalls} recall records and ${complaints} complaint records were found${topComponent ? `, with ${topComponent} as the top complaint area` : ""}. Maintenance complexity is ${complexity.toLowerCase()}.`
  } else if (riskLevel === "Moderate") {
    headline = "Worth viewing, but inspect carefully"
    summary = `This vehicle profile shows some public risk signals. ${recalls} recall records and ${complaints} complaint records were found${topComponent ? `, with ${topComponent} as the leading complaint area` : ""}. Maintenance complexity is ${complexity.toLowerCase()}.`
  }

  return {
    headline,
    summary
  }
}

async function buildReportFromVin(vin) {
  const decodeUrl = `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValuesExtended/${vin}?format=json`
  const decodeResponse = await fetch(decodeUrl)

  if (!decodeResponse.ok) {
    throw new Error("VIN decode request failed")
  }

  const decodeData = await decodeResponse.json()

  if (!decodeData.Results || !decodeData.Results.length) {
    throw new Error("No VIN data found")
  }

  const row = decodeData.Results[0]

  const vehicle = {
    year: safeValue(row.ModelYear),
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
  }

  vehicle.title = buildVehicleTitle(vehicle)

  const safetyRecalls = await fetchRecalls(vehicle.year, vehicle.make, vehicle.model)
  const safetyComplaints = await fetchComplaints(vehicle.year, vehicle.make, vehicle.model)
  const efficiency = await fetchEfficiency(vehicle.year, vehicle.make, vehicle.model)
  const investigationData = await fetchInvestigations(vehicle.year, vehicle.make, vehicle.model)
  const communicationData = await fetchManufacturerCommunications(vehicle.year, vehicle.make, vehicle.model)
  const specs = buildSpecsFromDecode(row)

  const safety = {
    ...safetyRecalls,
    ...safetyComplaints
  }

  const ownership = buildOwnershipIntelligence(vehicle, safety)
  const optionProfile = buildOptionProfile(vehicle)

  const report = {
    vehicle,
    safety,
    efficiency,
    specs,
    ownership,
    optionProfile,

    buyerVerdict: {
      headline: "",
      summary: ""
    },

    investigations: {
      items: investigationData.investigations,
      summary: investigationData.investigationSummary
    },

    communications: {
      items: communicationData.items,
      summary: communicationData.summary
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

    missingDataFlags: {},

    locked: {
      historyAuditAvailable: true,
      damageRiskHidden: true,
      titleRiskHidden: true,
      ownershipRiskHidden: true,
      structuralRiskHidden: true
    }
  }

  report.signals.coverageScore = calculateCoverageScore(report)
  report.signals.confidenceLevel = buildConfidenceLevel(report.signals.coverageScore)
  report.signals.riskLevel = buildRiskLevel(report)
  report.signals.attentionFlags = buildAttentionFlags(report)
  report.signals.allowPurchase = report.signals.coverageScore >= 60

  const frontSignals = buildFrontEndSignals(report)
  report.frontEndSummary.headline = frontSignals.headline
  report.frontEndSummary.subheadline = frontSignals.subheadline
  report.freeSignals = frontSignals

  report.buyerVerdict = buildBuyerVerdict(report)
  report.missingDataFlags = buildMissingDataFlags(report)

  return report
}

app.get("/api/health", (req, res) => {
  res.json({ status: "server running" })
})

app.get("/api/decode/:vin", async (req, res) => {
  try {
    const vin = sanitizeVin(req.params.vin)

    if (vin.length !== 17) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid 17 character VIN"
      })
    }

    const report = await buildReportFromVin(vin)

    res.json({
      success: true,
      vin,
      report
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Something went wrong while decoding the VIN",
      error: String(error.message || error)
    })
  }
})

app.listen(3002, () => {
  console.log("Backend intelligence server running on port 3002")
})