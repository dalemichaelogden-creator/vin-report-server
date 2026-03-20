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

function numberValue(value) {
  const n = parseFloat(value)
  return Number.isNaN(n) ? null : n
}

function currencyRange(low, high) {
  if (low && high) return `$${low.toLocaleString()} to $${high.toLocaleString()}`
  if (low) return `$${low.toLocaleString()}`
  if (high) return `$${high.toLocaleString()}`
  return ""
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

function isLuxuryBrand(make) {
  const m = upperText(make)
  return [
    "BMW",
    "AUDI",
    "MERCEDES BENZ",
    "MERCEDES-BENZ",
    "MERCEDES",
    "PORSCHE",
    "LEXUS",
    "ACURA",
    "INFINITI",
    "CADILLAC",
    "GENESIS",
    "JAGUAR",
    "LAND ROVER",
    "VOLVO",
    "TESLA",
    "LUCID"
  ].includes(m)
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
        label: "Likely BMW turbocharged four cylinder",
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

function inferAudiVwEngineFamily(vehicle) {
  const year = intValue(vehicle.year)
  const fuel = getFuelGroup(vehicle)
  const model = upperText(vehicle.model)

  if (fuel === "electric") {
    return {
      family: "EV Platform",
      label: "Electric drive platform",
      confidence: "High"
    }
  }

  if (model.includes("S") || model.includes("RS")) {
    return {
      family: "Performance Turbo Platform",
      label: "Likely higher output Audi Group turbocharged engine",
      confidence: "Medium"
    }
  }

  if (year && year >= 2009) {
    return {
      family: "EA888",
      label: "Likely EA888 turbocharged four cylinder",
      confidence: "Medium"
    }
  }

  return {
    family: "Audi Group gasoline platform",
    label: "Likely Volkswagen Audi Group gasoline engine",
    confidence: "Low"
  }
}

function inferMercedesEngineFamily(vehicle) {
  const year = intValue(vehicle.year)
  const model = upperText(vehicle.model)
  const fuel = getFuelGroup(vehicle)

  if (fuel === "electric") {
    return {
      family: "EQ Platform",
      label: "Mercedes electric drive platform",
      confidence: "High"
    }
  }

  if (model.includes("AMG")) {
    return {
      family: "AMG Performance Platform",
      label: "Mercedes AMG specific performance drivetrain",
      confidence: "Medium"
    }
  }

  if (year && year >= 2015) {
    return {
      family: "Modern Mercedes Turbo Platform",
      label: "Likely modern Mercedes turbocharged drivetrain",
      confidence: "Medium"
    }
  }

  return {
    family: "",
    label: "",
    confidence: "Low"
  }
}

function inferToyotaLexusEngineFamily(vehicle) {
  const fuel = getFuelGroup(vehicle)

  if (fuel === "hybrid") {
    return {
      family: "Toyota Hybrid System",
      label: "Toyota or Lexus hybrid powertrain",
      confidence: "High"
    }
  }

  return {
    family: "Toyota naturally aspirated or turbo gasoline platform",
    label: "Toyota or Lexus gasoline drivetrain",
    confidence: "Medium"
  }
}

function inferHondaAcuraEngineFamily(vehicle) {
  const fuel = getFuelGroup(vehicle)
  const year = intValue(vehicle.year)

  if (fuel === "hybrid") {
    return {
      family: "Honda Hybrid Platform",
      label: "Honda or Acura hybrid powertrain",
      confidence: "High"
    }
  }

  if (year && year >= 2016) {
    return {
      family: "Modern Honda Turbo or DI Platform",
      label: "Likely modern Honda or Acura direct injection or turbo drivetrain",
      confidence: "Medium"
    }
  }

  return {
    family: "Honda gasoline platform",
    label: "Honda or Acura gasoline drivetrain",
    confidence: "Low"
  }
}

function inferFordEngineFamily(vehicle) {
  const model = upperText(vehicle.model)
  const fuel = getFuelGroup(vehicle)

  if (fuel === "electric") {
    return {
      family: "Ford EV Platform",
      label: "Ford electric platform",
      confidence: "High"
    }
  }

  if (model.includes("F-150") || model.includes("F150") || model.includes("EXPLORER") || model.includes("ESCAPE") || model.includes("EDGE")) {
    return {
      family: "EcoBoost or Modular Truck Platform",
      label: "Likely Ford turbocharged truck or crossover drivetrain",
      confidence: "Medium"
    }
  }

  return {
    family: "Ford gasoline platform",
    label: "Ford gasoline drivetrain",
    confidence: "Low"
  }
}

function inferGmEngineFamily(vehicle) {
  const make = upperText(vehicle.make)
  const model = upperText(vehicle.model)
  const fuel = getFuelGroup(vehicle)

  if (fuel === "electric") {
    return {
      family: "GM EV Platform",
      label: "General Motors electric platform",
      confidence: "High"
    }
  }

  if (make === "CHEVROLET" || make === "GMC" || make === "CADILLAC") {
    if (model.includes("SILVERADO") || model.includes("SIERRA") || model.includes("TAHOE") || model.includes("SUBURBAN") || model.includes("ESCALADE")) {
      return {
        family: "GM Truck V8 Platform",
        label: "Likely GM truck based V8 or turbo truck platform",
        confidence: "Medium"
      }
    }
  }

  return {
    family: "GM gasoline platform",
    label: "General Motors gasoline drivetrain",
    confidence: "Low"
  }
}

function inferHyundaiKiaEngineFamily(vehicle) {
  const fuel = getFuelGroup(vehicle)
  const year = intValue(vehicle.year)

  if (fuel === "electric") {
    return {
      family: "E GMP or EV Platform",
      label: "Hyundai or Kia electric platform",
      confidence: "High"
    }
  }

  if (year && year >= 2011) {
    return {
      family: "Theta or Smartstream Platform",
      label: "Likely Hyundai or Kia modern four cylinder platform",
      confidence: "Medium"
    }
  }

  return {
    family: "",
    label: "",
    confidence: "Low"
  }
}

function inferNissanInfinitiEngineFamily(vehicle) {
  const model = upperText(vehicle.model)
  const fuel = getFuelGroup(vehicle)

  if (fuel === "electric") {
    return {
      family: "Nissan EV Platform",
      label: "Nissan electric platform",
      confidence: "High"
    }
  }

  if (model.includes("ALTIMA") || model.includes("ROGUE") || model.includes("SENTRA") || model.includes("PATHFINDER")) {
    return {
      family: "CVT Based Mainstream Platform",
      label: "Nissan mainstream CVT oriented platform",
      confidence: "Medium"
    }
  }

  return {
    family: "Nissan gasoline platform",
    label: "Nissan or Infiniti gasoline drivetrain",
    confidence: "Low"
  }
}

function inferSubaruEngineFamily(vehicle) {
  return {
    family: "Boxer AWD Platform",
    label: "Subaru boxer engine with AWD architecture",
    confidence: "Medium"
  }
}

function inferMazdaEngineFamily(vehicle) {
  return {
    family: "Skyactiv Platform",
    label: "Mazda Skyactiv powertrain architecture",
    confidence: "Medium"
  }
}

function inferPorscheEngineFamily(vehicle) {
  const fuel = getFuelGroup(vehicle)
  if (fuel === "electric") {
    return {
      family: "Porsche EV Platform",
      label: "Porsche electric platform",
      confidence: "High"
    }
  }

  return {
    family: "Porsche Performance Platform",
    label: "Porsche gasoline or performance drivetrain",
    confidence: "Medium"
  }
}

function inferTeslaEngineFamily(vehicle) {
  return {
    family: "Tesla EV Platform",
    label: "Tesla battery electric platform",
    confidence: "High"
  }
}

function inferGenericEngineFamily(vehicle) {
  const make = upperText(vehicle.make)

  if (make === "BMW") return inferBMWEngineFamily(vehicle)
  if (make === "AUDI" || make === "VOLKSWAGEN" || make === "VW") return inferAudiVwEngineFamily(vehicle)
  if (make === "MERCEDES-BENZ" || make === "MERCEDES BENZ" || make === "MERCEDES") return inferMercedesEngineFamily(vehicle)
  if (make === "TOYOTA" || make === "LEXUS") return inferToyotaLexusEngineFamily(vehicle)
  if (make === "HONDA" || make === "ACURA") return inferHondaAcuraEngineFamily(vehicle)
  if (make === "FORD") return inferFordEngineFamily(vehicle)
  if (make === "CHEVROLET" || make === "GMC" || make === "CADILLAC") return inferGmEngineFamily(vehicle)
  if (make === "HYUNDAI" || make === "KIA" || make === "GENESIS") return inferHyundaiKiaEngineFamily(vehicle)
  if (make === "NISSAN" || make === "INFINITI") return inferNissanInfinitiEngineFamily(vehicle)
  if (make === "SUBARU") return inferSubaruEngineFamily(vehicle)
  if (make === "MAZDA") return inferMazdaEngineFamily(vehicle)
  if (make === "PORSCHE") return inferPorscheEngineFamily(vehicle)
  if (make === "TESLA") return inferTeslaEngineFamily(vehicle)

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

function inferGenericPlatform(vehicle) {
  const make = upperText(vehicle.make)
  const model = upperText(vehicle.model)
  const year = intValue(vehicle.year)
  const fuel = getFuelGroup(vehicle)

  if (make === "BMW" && model.includes("3")) return inferBMWGeneration(vehicle)

  if (make === "AUDI") {
    if (year && year >= 2017) return { name: "Modern Audi MQB or MLB Platform", summary: "Modern Audi platform with strong tech content and turbocharged drivetrain complexity." }
    return { name: "Audi Legacy Turbo Platform", summary: "Earlier Audi platform with known turbo, cooling, and electrical ownership items." }
  }

  if (make === "VOLKSWAGEN") {
    if (year && year >= 2015) return { name: "Modern VW MQB Platform", summary: "Volkswagen MQB platform with broad parts support and common turbo system checks." }
    return { name: "VW Legacy Platform", summary: "Earlier Volkswagen platform with turbo and transmission related inspection priorities." }
  }

  if (make === "MERCEDES-BENZ" || make === "MERCEDES BENZ" || make === "MERCEDES") {
    if (year && year >= 2015) return { name: "Modern Mercedes Turbo Platform", summary: "Modern Mercedes platform with elevated electronic and maintenance complexity." }
    return { name: "Mercedes Legacy Platform", summary: "Older Mercedes platform with age related suspension, electronics, and leak checks." }
  }

  if (make === "TOYOTA" || make === "LEXUS") {
    if (fuel === "hybrid") return { name: "Toyota Hybrid Platform", summary: "Hybrid architecture with strong durability reputation but age related battery considerations." }
    return { name: "Toyota Mainstream Platform", summary: "Generally durable platform with lower maintenance burden than many luxury rivals." }
  }

  if (make === "HONDA" || make === "ACURA") {
    return { name: "Honda Mainstream Platform", summary: "Generally strong daily use platform with transmission and DI related inspection priorities depending on engine." }
  }

  if (make === "FORD") {
    if (model.includes("F-150") || model.includes("F150")) return { name: "Ford Truck Platform", summary: "Truck platform with drivetrain, towing, and front end wear considerations." }
    return { name: "Ford Mainstream Platform", summary: "Mainstream Ford platform with turbo and transmission condition as major value drivers." }
  }

  if (make === "CHEVROLET" || make === "GMC" || make === "CADILLAC") {
    return { name: "GM Platform", summary: "GM platform where transmission behavior, engine servicing, and suspension wear matter heavily at used age." }
  }

  if (make === "HYUNDAI" || make === "KIA" || make === "GENESIS") {
    return { name: "Hyundai Kia Platform", summary: "Modern Korean platform with good feature value but engine family specific history that should be checked carefully." }
  }

  if (make === "NISSAN" || make === "INFINITI") {
    return { name: "Nissan Platform", summary: "Nissan platform where transmission behavior is often the key used car risk driver." }
  }

  if (make === "SUBARU") {
    return { name: "Subaru AWD Platform", summary: "AWD boxer platform where fluid service history and tire matching matter more than average." }
  }

  if (make === "MAZDA") {
    return { name: "Mazda Skyactiv Platform", summary: "Mazda platform with relatively strong reliability reputation and lower luxury style operating exposure." }
  }

  if (make === "PORSCHE") {
    return { name: "Porsche Performance Platform", summary: "High performance ownership profile where maintenance quality and prior use matter heavily." }
  }

  if (make === "TESLA") {
    return { name: "Tesla EV Platform", summary: "Software heavy EV platform where suspension wear, tire wear, and charging history matter more than engine items." }
  }

  return {
    name: year ? `${year} ${safeValue(vehicle.make)} Platform` : "Vehicle Platform",
    summary: "Platform specific advisory is available at a general level for this vehicle."
  }
}

function buildBMWOwnership(vehicle, safety) {
  const generation = inferBMWGeneration(vehicle)
  const engine = inferBMWEngineFamily(vehicle)
  const complaintCount = Number(safety.complaints || 0)

  let complaintLevel = "Low"
  if (complaintCount >= 50) complaintLevel = "Higher"
  else if (complaintCount >= 15) complaintLevel = "Moderate"

  const commonIssues = [
    "Cooling system checks",
    "Oil leak inspection",
    "Electronic faults",
    "Suspension wear",
    "Service history gaps"
  ]

  const inspectionChecks = [
    "Check for warning lights",
    "Inspect for coolant or oil leaks",
    "Test transmission response",
    "Check suspension noises",
    "Review full service history",
    "Inspect for poor accident repairs"
  ]

  const expensiveFailureAreas = [
    "Cooling system components",
    "Oil leaks and gasket repairs",
    "Electronic modules and sensors",
    "Suspension bushings and arms"
  ]

  const testDriveChecks = [
    "Cold start from fully cold engine",
    "Check for warning lights after restart",
    "Test low speed steering feel",
    "Watch for drivetrain hesitation",
    "Confirm smooth transmission behavior"
  ]

  if (engine.family === "B48") {
    commonIssues.push("Coolant hose brittleness")
    commonIssues.push("Oil filter housing leak checks")
  }

  if (engine.family === "B58") {
    commonIssues.push("Cooling and intake system checks")
    expensiveFailureAreas.push("Turbocharger support component repairs")
  }

  if (engine.family === "N55" || engine.family === "B48 or N20") {
    commonIssues.push("Turbocharged four or six cylinder service sensitivity")
  }

  if (getDriveTypeGroup(vehicle) === "awd") {
    commonIssues.push("Transfer case fluid neglect")
    expensiveFailureAreas.push("Transfer case or AWD system repairs")
    testDriveChecks.push("Do a full lock slow U turn to check for binding")
  }

  return {
    brandFocus: "BMW",
    sectionTitle: "Model Specific Ownership Intelligence",
    platform: generation.name,
    platformSummary: generation.summary,
    enginePlatform: engine.family,
    engineLabel: engine.label,
    engineConfidence: engine.confidence,
    maintenanceComplexity: "Higher",
    complaintLevel,
    commonIssues: Array.from(new Set(commonIssues)),
    inspectionChecks: Array.from(new Set(inspectionChecks)),
    expensiveFailureAreas: Array.from(new Set(expensiveFailureAreas)),
    testDriveChecks: Array.from(new Set(testDriveChecks)),
    ownershipAdvice: engine.label
      ? `This ${vehicle.make} ${vehicle.model} likely uses ${engine.label}. Buyers should verify service quality, cooling system health, and fluid maintenance before purchase.`
      : `This ${vehicle.make} ${vehicle.model} sits in a higher maintenance ownership category than a typical mass market vehicle.`
  }
}

function buildAudiVwOwnership(vehicle, safety) {
  const platform = inferGenericPlatform(vehicle)
  const engine = inferAudiVwEngineFamily(vehicle)
  const fuel = getFuelGroup(vehicle)

  const commonIssues = [
    "Water pump and thermostat checks",
    "PCV and intake related faults",
    "Oil consumption monitoring",
    "Electronic warning light history",
    "Service history gaps"
  ]

  const inspectionChecks = [
    "Check cold idle quality",
    "Inspect for coolant seepage",
    "Test turbo response",
    "Watch for transmission hesitation",
    "Review service records closely"
  ]

  const expensiveFailureAreas = [
    "Cooling system assemblies",
    "Turbocharger support repairs",
    "DSG or transmission service issues",
    "AWD system service neglect"
  ]

  const testDriveChecks = [
    "Check for boost hesitation under acceleration",
    "Verify smooth downshifts",
    "Listen for suspension knocks",
    "Check for warning lights after drive"
  ]

  if (upperText(vehicle.make) === "AUDI" || getDriveTypeGroup(vehicle) === "awd") {
    testDriveChecks.push("Check low speed AWD behavior on tight turns")
  }

  if (fuel === "electric") {
    commonIssues.length = 0
    commonIssues.push("Battery and charging system checks", "Suspension wear from curb weight", "Tire wear monitoring", "Software or module faults")
    expensiveFailureAreas.length = 0
    expensiveFailureAreas.push("Battery system diagnostics", "Suspension wear items", "Electronic module repairs")
  }

  return {
    brandFocus: safeValue(vehicle.make),
    sectionTitle: "Model Specific Ownership Intelligence",
    platform: platform.name,
    platformSummary: platform.summary,
    enginePlatform: engine.family,
    engineLabel: engine.label,
    engineConfidence: engine.confidence,
    maintenanceComplexity: isLuxuryBrand(vehicle.make) ? "Higher" : "Moderate",
    complaintLevel: Number(safety.complaints || 0) >= 20 ? "Moderate" : "Low",
    commonIssues: Array.from(new Set(commonIssues)),
    inspectionChecks: Array.from(new Set(inspectionChecks)),
    expensiveFailureAreas: Array.from(new Set(expensiveFailureAreas)),
    testDriveChecks: Array.from(new Set(testDriveChecks)),
    ownershipAdvice: `${vehicle.make} platforms are strongly influenced by cooling system health, transmission service quality, and warning light history.`
  }
}

function buildMercedesOwnership(vehicle, safety) {
  const platform = inferGenericPlatform(vehicle)
  const engine = inferMercedesEngineFamily(vehicle)
  const fuel = getFuelGroup(vehicle)

  const commonIssues = [
    "Oil leak inspection",
    "Electronic feature faults",
    "Suspension wear",
    "Cooling system checks",
    "Service history gaps"
  ]

  const inspectionChecks = [
    "Check all electronic features",
    "Inspect for leaks",
    "Test transmission smoothness",
    "Check ride quality",
    "Review service history carefully"
  ]

  const expensiveFailureAreas = [
    "Electronic modules",
    "Cooling system repairs",
    "Suspension components",
    "Transmission related repairs"
  ]

  const testDriveChecks = [
    "Check for harsh low speed shifts",
    "Check for steering pull or brake shudder",
    "Test every major electrical function",
    "Recheck for warning lights after drive"
  ]

  if (fuel === "electric") {
    commonIssues.push("Battery and charging system checks")
    expensiveFailureAreas.push("Battery system diagnostics")
  }

  return {
    brandFocus: safeValue(vehicle.make),
    sectionTitle: "Model Specific Ownership Intelligence",
    platform: platform.name,
    platformSummary: platform.summary,
    enginePlatform: engine.family,
    engineLabel: engine.label,
    engineConfidence: engine.confidence,
    maintenanceComplexity: "Higher",
    complaintLevel: Number(safety.complaints || 0) >= 20 ? "Moderate" : "Low",
    commonIssues: Array.from(new Set(commonIssues)),
    inspectionChecks: Array.from(new Set(inspectionChecks)),
    expensiveFailureAreas: Array.from(new Set(expensiveFailureAreas)),
    testDriveChecks: Array.from(new Set(testDriveChecks)),
    ownershipAdvice: `${vehicle.make} ownership is usually defined by maintenance quality and electronic system condition more than headline mileage alone.`
  }
}

function buildToyotaLexusOwnership(vehicle, safety) {
  const platform = inferGenericPlatform(vehicle)
  const engine = inferToyotaLexusEngineFamily(vehicle)
  const fuel = getFuelGroup(vehicle)

  const commonIssues = [
    "Routine fluid service neglect",
    "Brake wear",
    "Suspension wear",
    "Cooling system age checks"
  ]

  const inspectionChecks = [
    "Check service intervals",
    "Inspect for accident repairs",
    "Test cold start and idle quality",
    "Check suspension noises",
    "Confirm warning light free operation"
  ]

  const expensiveFailureAreas = [
    "Hybrid battery aging" ,
    "Suspension wear items",
    "Cooling system repairs"
  ]

  const testDriveChecks = [
    "Check for smooth idle and acceleration",
    "Listen for suspension noise",
    "Verify straight braking",
    "Check that all dash lights clear properly"
  ]

  if (fuel !== "hybrid") {
    const index = expensiveFailureAreas.indexOf("Hybrid battery aging")
    if (index !== -1) expensiveFailureAreas.splice(index, 1)
  }

  return {
    brandFocus: safeValue(vehicle.make),
    sectionTitle: "Model Specific Ownership Intelligence",
    platform: platform.name,
    platformSummary: platform.summary,
    enginePlatform: engine.family,
    engineLabel: engine.label,
    engineConfidence: engine.confidence,
    maintenanceComplexity: isLuxuryBrand(vehicle.make) ? "Moderate" : "Lower",
    complaintLevel: Number(safety.complaints || 0) >= 20 ? "Moderate" : "Low",
    commonIssues: Array.from(new Set(commonIssues)),
    inspectionChecks: Array.from(new Set(inspectionChecks)),
    expensiveFailureAreas: Array.from(new Set(expensiveFailureAreas)),
    testDriveChecks: Array.from(new Set(testDriveChecks)),
    ownershipAdvice: `${vehicle.make} generally carries a lower risk ownership profile than many rivals, but hybrid age, service quality, and crash repair quality still matter.`
  }
}

function buildHondaAcuraOwnership(vehicle, safety) {
  const platform = inferGenericPlatform(vehicle)
  const engine = inferHondaAcuraEngineFamily(vehicle)

  const commonIssues = [
    "Transmission service neglect",
    "Direct injection carbon related drivability issues",
    "Suspension wear",
    "Service history gaps"
  ]

  const inspectionChecks = [
    "Check idle quality",
    "Test transmission response",
    "Check for warning lights",
    "Inspect for fluid leaks",
    "Review service history"
  ]

  const expensiveFailureAreas = [
    "Transmission related repairs",
    "Turbocharger support repairs",
    "Suspension repairs"
  ]

  const testDriveChecks = [
    "Check low speed shift quality",
    "Test acceleration from a stop",
    "Listen for suspension knocks",
    "Recheck dashboard after drive"
  ]

  return {
    brandFocus: safeValue(vehicle.make),
    sectionTitle: "Model Specific Ownership Intelligence",
    platform: platform.name,
    platformSummary: platform.summary,
    enginePlatform: engine.family,
    engineLabel: engine.label,
    engineConfidence: engine.confidence,
    maintenanceComplexity: isLuxuryBrand(vehicle.make) ? "Moderate" : "Moderate",
    complaintLevel: Number(safety.complaints || 0) >= 20 ? "Moderate" : "Low",
    commonIssues: Array.from(new Set(commonIssues)),
    inspectionChecks: Array.from(new Set(inspectionChecks)),
    expensiveFailureAreas: Array.from(new Set(expensiveFailureAreas)),
    testDriveChecks: Array.from(new Set(testDriveChecks)),
    ownershipAdvice: `${vehicle.make} reliability is usually strongest when transmission service, fluid intervals, and warning light history are all clean.`
  }
}

function buildFordOwnership(vehicle, safety) {
  const platform = inferGenericPlatform(vehicle)
  const engine = inferFordEngineFamily(vehicle)
  const body = getBodyType(vehicle)

  const commonIssues = [
    "Turbo system checks",
    "Transmission behavior",
    "Cooling system checks",
    "Service history gaps",
    "Suspension wear"
  ]

  const inspectionChecks = [
    "Check acceleration under load",
    "Verify smooth shifts",
    "Inspect for coolant leaks",
    "Review service history",
    "Inspect underbody condition"
  ]

  const expensiveFailureAreas = [
    "Transmission related repairs",
    "Turbocharger support repairs",
    "Cooling system work",
    "AWD or transfer case repairs"
  ]

  const testDriveChecks = [
    "Check for harsh shifts",
    "Test highway acceleration",
    "Listen for front end noises",
    "Check steering alignment"
  ]

  if (body === "truck") {
    commonIssues.push("Tow related wear", "Front suspension wear")
    inspectionChecks.push("Check 4WD operation if equipped")
    testDriveChecks.push("Check for driveline vibration")
  }

  return {
    brandFocus: safeValue(vehicle.make),
    sectionTitle: "Model Specific Ownership Intelligence",
    platform: platform.name,
    platformSummary: platform.summary,
    enginePlatform: engine.family,
    engineLabel: engine.label,
    engineConfidence: engine.confidence,
    maintenanceComplexity: body === "truck" ? "Moderate to Higher" : "Moderate",
    complaintLevel: Number(safety.complaints || 0) >= 20 ? "Moderate" : "Low",
    commonIssues: Array.from(new Set(commonIssues)),
    inspectionChecks: Array.from(new Set(inspectionChecks)),
    expensiveFailureAreas: Array.from(new Set(expensiveFailureAreas)),
    testDriveChecks: Array.from(new Set(testDriveChecks)),
    ownershipAdvice: `${vehicle.make} values are often driven by drivetrain condition, transmission behavior, and evidence of proper fluid servicing.`
  }
}

function buildGmOwnership(vehicle, safety) {
  const platform = inferGenericPlatform(vehicle)
  const engine = inferGmEngineFamily(vehicle)
  const body = getBodyType(vehicle)

  const commonIssues = [
    "Transmission behavior",
    "Suspension wear",
    "Cooling system age checks",
    "Electrical module issues",
    "Service history gaps"
  ]

  const inspectionChecks = [
    "Check shift quality at low speed and highway speed",
    "Inspect for coolant leaks",
    "Listen for suspension noise",
    "Check warning lights",
    "Review service history"
  ]

  const expensiveFailureAreas = [
    "Transmission repairs",
    "Suspension rebuild work",
    "Electronic module repairs",
    "Engine oil management system issues"
  ]

  const testDriveChecks = [
    "Check for shudder or harsh shifts",
    "Test braking smoothness",
    "Check steering feel",
    "Recheck dash lights after drive"
  ]

  if (body === "truck" || body === "suv") {
    commonIssues.push("Front end wear", "4WD or AWD service neglect")
    expensiveFailureAreas.push("Transfer case or differential service issues")
  }

  return {
    brandFocus: safeValue(vehicle.make),
    sectionTitle: "Model Specific Ownership Intelligence",
    platform: platform.name,
    platformSummary: platform.summary,
    enginePlatform: engine.family,
    engineLabel: engine.label,
    engineConfidence: engine.confidence,
    maintenanceComplexity: isLuxuryBrand(vehicle.make) ? "Higher" : "Moderate",
    complaintLevel: Number(safety.complaints || 0) >= 20 ? "Moderate" : "Low",
    commonIssues: Array.from(new Set(commonIssues)),
    inspectionChecks: Array.from(new Set(inspectionChecks)),
    expensiveFailureAreas: Array.from(new Set(expensiveFailureAreas)),
    testDriveChecks: Array.from(new Set(testDriveChecks)),
    ownershipAdvice: `${vehicle.make} used values depend heavily on transmission behavior, front end condition, and whether major fluid services have been ignored.`
  }
}

function buildHyundaiKiaOwnership(vehicle, safety) {
  const platform = inferGenericPlatform(vehicle)
  const engine = inferHyundaiKiaEngineFamily(vehicle)
  const fuel = getFuelGroup(vehicle)

  const commonIssues = [
    "Engine family specific history checks",
    "Oil consumption monitoring",
    "Warning light history",
    "Cooling system checks",
    "Service history gaps"
  ]

  const inspectionChecks = [
    "Check cold start behavior",
    "Listen for engine noise",
    "Check for smoke or rough idle",
    "Review recall completion history",
    "Inspect for warning lights"
  ]

  const expensiveFailureAreas = [
    "Engine replacement exposure",
    "Transmission related repairs",
    "Turbocharger support repairs",
    "Battery or electrified system diagnostics"
  ]

  const testDriveChecks = [
    "Check for engine knock or hesitation",
    "Test transmission smoothness",
    "Watch dashboard for warning lights",
    "Check braking and alignment"
  ]

  if (fuel !== "electric" && fuel !== "hybrid") {
    const idx = expensiveFailureAreas.indexOf("Battery or electrified system diagnostics")
    if (idx !== -1) expensiveFailureAreas.splice(idx, 1)
  }

  return {
    brandFocus: safeValue(vehicle.make),
    sectionTitle: "Model Specific Ownership Intelligence",
    platform: platform.name,
    platformSummary: platform.summary,
    enginePlatform: engine.family,
    engineLabel: engine.label,
    engineConfidence: engine.confidence,
    maintenanceComplexity: upperText(vehicle.make) === "GENESIS" ? "Moderate to Higher" : "Moderate",
    complaintLevel: Number(safety.complaints || 0) >= 20 ? "Moderate" : "Low",
    commonIssues: Array.from(new Set(commonIssues)),
    inspectionChecks: Array.from(new Set(inspectionChecks)),
    expensiveFailureAreas: Array.from(new Set(expensiveFailureAreas)),
    testDriveChecks: Array.from(new Set(testDriveChecks)),
    ownershipAdvice: `${vehicle.make} can offer strong value, but engine family history and recall completion status should be treated as major purchase drivers.`
  }
}

function buildNissanOwnership(vehicle, safety) {
  const platform = inferGenericPlatform(vehicle)
  const engine = inferNissanInfinitiEngineFamily(vehicle)

  const commonIssues = [
    "Transmission condition",
    "Service history gaps",
    "Steering and suspension wear",
    "Cooling system checks"
  ]

  const inspectionChecks = [
    "Test transmission response from a stop",
    "Check for rpm flare or hesitation",
    "Inspect for leaks",
    "Check for warning lights",
    "Review service history"
  ]

  const expensiveFailureAreas = [
    "Transmission replacement exposure",
    "Suspension repair work",
    "Cooling system repairs"
  ]

  const testDriveChecks = [
    "Check for transmission flare",
    "Check acceleration smoothness",
    "Listen for front end noise",
    "Recheck dash after drive"
  ]

  return {
    brandFocus: safeValue(vehicle.make),
    sectionTitle: "Model Specific Ownership Intelligence",
    platform: platform.name,
    platformSummary: platform.summary,
    enginePlatform: engine.family,
    engineLabel: engine.label,
    engineConfidence: engine.confidence,
    maintenanceComplexity: isLuxuryBrand(vehicle.make) ? "Moderate to Higher" : "Moderate",
    complaintLevel: Number(safety.complaints || 0) >= 20 ? "Moderate" : "Low",
    commonIssues: Array.from(new Set(commonIssues)),
    inspectionChecks: Array.from(new Set(inspectionChecks)),
    expensiveFailureAreas: Array.from(new Set(expensiveFailureAreas)),
    testDriveChecks: Array.from(new Set(testDriveChecks)),
    ownershipAdvice: `${vehicle.make} purchase risk is often dominated by transmission behavior and proof of consistent servicing.`
  }
}

function buildSubaruOwnership(vehicle, safety) {
  const platform = inferGenericPlatform(vehicle)
  const engine = inferSubaruEngineFamily(vehicle)

  const commonIssues = [
    "Tire mismatch related AWD stress",
    "CVT or transmission servicing",
    "Wheel bearing or suspension wear",
    "Oil seepage or fluid checks"
  ]

  const inspectionChecks = [
    "Confirm matching tires on all four corners",
    "Test low speed turning behavior",
    "Check transmission response",
    "Inspect for leaks",
    "Review service records"
  ]

  const expensiveFailureAreas = [
    "CVT replacement exposure",
    "AWD system wear from tire mismatch",
    "Wheel bearing and suspension work"
  ]

  const testDriveChecks = [
    "Check for binding on tight turns",
    "Check acceleration smoothness",
    "Listen for bearing hum",
    "Check for warning lights after drive"
  ]

  return {
    brandFocus: safeValue(vehicle.make),
    sectionTitle: "Model Specific Ownership Intelligence",
    platform: platform.name,
    platformSummary: platform.summary,
    enginePlatform: engine.family,
    engineLabel: engine.label,
    engineConfidence: engine.confidence,
    maintenanceComplexity: "Moderate",
    complaintLevel: Number(safety.complaints || 0) >= 20 ? "Moderate" : "Low",
    commonIssues: Array.from(new Set(commonIssues)),
    inspectionChecks: Array.from(new Set(inspectionChecks)),
    expensiveFailureAreas: Array.from(new Set(expensiveFailureAreas)),
    testDriveChecks: Array.from(new Set(testDriveChecks)),
    ownershipAdvice: `${vehicle.make} ownership is heavily influenced by proper tire matching, fluid servicing, and CVT or AWD condition.`
  }
}

function buildMazdaOwnership(vehicle, safety) {
  const platform = inferGenericPlatform(vehicle)
  const engine = inferMazdaEngineFamily(vehicle)

  return {
    brandFocus: safeValue(vehicle.make),
    sectionTitle: "Model Specific Ownership Intelligence",
    platform: platform.name,
    platformSummary: platform.summary,
    enginePlatform: engine.family,
    engineLabel: engine.label,
    engineConfidence: engine.confidence,
    maintenanceComplexity: "Lower to Moderate",
    complaintLevel: Number(safety.complaints || 0) >= 20 ? "Moderate" : "Low",
    commonIssues: [
      "Routine suspension wear",
      "Brake wear",
      "Cooling system age checks",
      "Service history gaps"
    ],
    inspectionChecks: [
      "Check for warning lights",
      "Listen for suspension knocks",
      "Test transmission smoothness",
      "Inspect for leaks",
      "Review service history"
    ],
    expensiveFailureAreas: [
      "Suspension work",
      "Cooling system repairs",
      "Electronic module repairs"
    ],
    testDriveChecks: [
      "Check steering feel",
      "Check braking smoothness",
      "Listen for front end noises",
      "Recheck dashboard after drive"
    ],
    ownershipAdvice: `${vehicle.make} typically offers a lower ownership stress profile than many rivals, but maintenance history and crash repair quality still matter greatly.`
  }
}

function buildPorscheOwnership(vehicle, safety) {
  const platform = inferGenericPlatform(vehicle)
  const engine = inferPorscheEngineFamily(vehicle)
  const fuel = getFuelGroup(vehicle)

  const commonIssues = [
    "Cooling system checks",
    "Suspension and brake wear",
    "Electronic feature faults",
    "Service history gaps"
  ]

  const inspectionChecks = [
    "Check cold start behavior",
    "Test braking and steering feel",
    "Inspect for warning lights",
    "Review specialist service history",
    "Check body and underbody carefully"
  ]

  const expensiveFailureAreas = [
    "Suspension components",
    "Cooling system repairs",
    "Brake system wear",
    "Electronic module faults"
  ]

  const testDriveChecks = [
    "Check steering precision",
    "Check brake feel and vibration",
    "Test acceleration cleanly",
    "Check all warning lights after drive"
  ]

  if (fuel === "electric") {
    commonIssues.push("Battery and charging system checks")
    expensiveFailureAreas.push("Battery system diagnostics")
  }

  return {
    brandFocus: safeValue(vehicle.make),
    sectionTitle: "Model Specific Ownership Intelligence",
    platform: platform.name,
    platformSummary: platform.summary,
    enginePlatform: engine.family,
    engineLabel: engine.label,
    engineConfidence: engine.confidence,
    maintenanceComplexity: "Higher",
    complaintLevel: Number(safety.complaints || 0) >= 20 ? "Moderate" : "Low",
    commonIssues: Array.from(new Set(commonIssues)),
    inspectionChecks: Array.from(new Set(inspectionChecks)),
    expensiveFailureAreas: Array.from(new Set(expensiveFailureAreas)),
    testDriveChecks: Array.from(new Set(testDriveChecks)),
    ownershipAdvice: `${vehicle.make} ownership depends heavily on specialist service history, prior use, and evidence of careful maintenance rather than mileage alone.`
  }
}

function buildTeslaOwnership(vehicle, safety) {
  const platform = inferGenericPlatform(vehicle)
  const engine = inferTeslaEngineFamily(vehicle)

  return {
    brandFocus: safeValue(vehicle.make),
    sectionTitle: "Model Specific Ownership Intelligence",
    platform: platform.name,
    platformSummary: platform.summary,
    enginePlatform: engine.family,
    engineLabel: engine.label,
    engineConfidence: engine.confidence,
    maintenanceComplexity: "Moderate",
    complaintLevel: Number(safety.complaints || 0) >= 20 ? "Moderate" : "Low",
    commonIssues: [
      "Suspension wear from curb weight",
      "Tire wear",
      "Electronic or sensor faults",
      "Charging system checks",
      "Panel or trim quality issues"
    ],
    inspectionChecks: [
      "Check charging behavior",
      "Inspect tires closely",
      "Check suspension noises",
      "Test cameras and sensors",
      "Inspect panel fit and glass condition"
    ],
    expensiveFailureAreas: [
      "Suspension repairs",
      "Battery system diagnostics",
      "Screen or module replacement",
      "Tire replacement cost"
    ],
    testDriveChecks: [
      "Check for clunks over bumps",
      "Test regen and braking feel",
      "Check steering and alignment",
      "Verify warning light free operation"
    ],
    ownershipAdvice: `${vehicle.make} ownership risk is centered more on suspension, tires, charging, and module faults than traditional engine maintenance.`
  }
}

function buildGenericOwnership(vehicle, safety) {
  const platform = inferGenericPlatform(vehicle)
  const engine = inferGenericEngineFamily(vehicle)
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
    inspectionChecks.push("Check 4WD operation if equipped")
  }

  const complaintLevel = Number(safety.complaints || 0) >= 20
    ? "Moderate"
    : Number(safety.complaints || 0) > 0
      ? "Low"
      : "Low"

  return {
    brandFocus: safeValue(vehicle.make) || "Generic",
    sectionTitle: "Model Specific Ownership Intelligence",
    platform: platform.name,
    platformSummary: platform.summary,
    enginePlatform: engine.family,
    engineLabel: engine.label,
    engineConfidence: engine.confidence,
    maintenanceComplexity: fuel === "hybrid" || fuel === "electric" ? "Moderate to Higher" : "Moderate",
    complaintLevel,
    commonIssues: Array.from(new Set(commonIssues)),
    inspectionChecks: Array.from(new Set(inspectionChecks)),
    expensiveFailureAreas: Array.from(new Set(expensiveFailureAreas)),
    testDriveChecks: Array.from(new Set(testDriveChecks)),
    ownershipAdvice: `${make} should be evaluated with attention to service history, drivetrain behavior, warning lights, and visible repair quality.`
  }
}

function buildOwnershipIntelligence(vehicle, safety) {
  const make = upperText(vehicle.make)

  if (make === "BMW") return buildBMWOwnership(vehicle, safety)
  if (make === "AUDI" || make === "VOLKSWAGEN" || make === "VW") return buildAudiVwOwnership(vehicle, safety)
  if (make === "MERCEDES-BENZ" || make === "MERCEDES BENZ" || make === "MERCEDES") return buildMercedesOwnership(vehicle, safety)
  if (make === "TOYOTA" || make === "LEXUS") return buildToyotaLexusOwnership(vehicle, safety)
  if (make === "HONDA" || make === "ACURA") return buildHondaAcuraOwnership(vehicle, safety)
  if (make === "FORD") return buildFordOwnership(vehicle, safety)
  if (make === "CHEVROLET" || make === "GMC" || make === "CADILLAC") return buildGmOwnership(vehicle, safety)
  if (make === "HYUNDAI" || make === "KIA" || make === "GENESIS") return buildHyundaiKiaOwnership(vehicle, safety)
  if (make === "NISSAN" || make === "INFINITI") return buildNissanOwnership(vehicle, safety)
  if (make === "SUBARU") return buildSubaruOwnership(vehicle, safety)
  if (make === "MAZDA") return buildMazdaOwnership(vehicle, safety)
  if (make === "PORSCHE") return buildPorscheOwnership(vehicle, safety)
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
  }

  if (make === "AUDI") {
    sportLabel = "S line Package"
    comfortLabel = "Premium Package"
    techLabel = "Tech or Driver Assistance Package"
  }

  if (make === "MERCEDES-BENZ" || make === "MERCEDES BENZ" || make === "MERCEDES") {
    sportLabel = "AMG Line or Sport Package"
    comfortLabel = "Premium Package"
    techLabel = "Driver Assistance Package"
  }

  if (make === "LEXUS") {
    sportLabel = "F Sport Package"
    comfortLabel = "Premium Package"
    techLabel = "Navigation or Safety Package"
  }

  if (make === "ACURA") {
    sportLabel = "A Spec Package"
    comfortLabel = "Technology Package"
    techLabel = "Advance or Driver Assistance Package"
  }

  if (body === "coupe" || body === "convertible") sportScore += 18
  if (body === "suv") comfortScore += 12
  if (drive === "awd") comfortScore += 6
  if (fuel === "hybrid" || fuel === "electric") techScore += 16
  if (year >= 2019) techScore += 14

  if (trim.includes("SPORT") || trim.includes("S LINE") || trim.includes("M SPORT") || trim.includes("AMG") || trim.includes("F SPORT")) sportScore += 18
  if (trim.includes("PREMIUM") || trim.includes("LUXURY") || trim.includes("LIMITED") || trim.includes("PLATINUM")) comfortScore += 18
  if (trim.includes("TECH") || trim.includes("ADVANCE") || trim.includes("ADVANCED") || trim.includes("PRESTIGE")) techScore += 18

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
      component: safeValue(item.Component || item.component || item.ReportReceivedDate || "General safety item"),
      summary: safeValue(item.Summary || item.summary || item.MfrCampaignNumber || "Recall details available."),
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
  const expensiveAreas = Array.isArray(report.ownership.expensiveFailureAreas) ? report.ownership.expensiveFailureAreas.length : 0

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
  if (expensiveAreas >= 4) score += 1

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

  if (report.vehicle.make && report.vehicle.model && report.vehicle.year) score += 20
  if (typeof report.safety.recalls === "number") score += 15
  if (report.safety.dataAvailable) score += 12
  if (report.efficiency.dataAvailable) score += 10
  if (report.ownership.commonIssues.length) score += 8
  if (report.ownership.inspectionChecks.length) score += 8
  if (report.ownership.expensiveFailureAreas.length) score += 8
  if (report.ownership.testDriveChecks.length) score += 8
  if (report.ownership.enginePlatform) score += 5
  if (report.investigations.items.length) score += 4
  if (report.marketAnalysis.retailValues.good) score += 2

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
    investigationDataMissing: !Array.isArray(report.investigations.items)
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

function buildMarketAnalysis(vehicle, report) {
  const year = intValue(vehicle.year)
  const make = upperText(vehicle.make)
  const luxury = isLuxuryBrand(vehicle.make)
  const body = getBodyType(vehicle)
  const fuel = getFuelGroup(vehicle)
  const risk = report ? report.signals.riskLevel : "Moderate"

  let baseRetailGood = 9000

  if (!year) baseRetailGood = 8000
  else {
    const age = Math.max(1, 2026 - year)

    if (luxury) baseRetailGood = 17000 - age * 800
    else if (body === "truck") baseRetailGood = 21000 - age * 700
    else if (body === "suv") baseRetailGood = 16000 - age * 700
    else baseRetailGood = 12000 - age * 650

    if (fuel === "electric") baseRetailGood -= 1500
    if (fuel === "hybrid") baseRetailGood += 500
    if (risk === "High") baseRetailGood -= 1200
    if (risk === "Moderate") baseRetailGood -= 600
  }

  if (make === "BMW" || make === "AUDI" || make === "MERCEDES-BENZ" || make === "MERCEDES BENZ" || make === "MERCEDES") {
    baseRetailGood -= 500
  }

  baseRetailGood = Math.max(3500, Math.round(baseRetailGood / 100) * 100)

  const goodRetail = baseRetailGood
  const excellentRetail = Math.round(goodRetail * 1.15 / 100) * 100
  const fairRetail = Math.round(goodRetail * 0.83 / 100) * 100

  const excellentTrade = Math.round(excellentRetail * 0.67 / 100) * 100
  const goodTrade = Math.round(goodRetail * 0.64 / 100) * 100
  const fairTrade = Math.round(fairRetail * 0.61 / 100) * 100

  let analystNote = "This is a modeled market positioning estimate, not a live appraisal. Final value depends heavily on mileage, title status, options, condition, and local buyer demand."

  if (luxury) {
    analystNote = "This vehicle sits in a lower entry price but higher running cost ownership band. Clean service history and condition have a large influence on buyer confidence and liquidity."
  }

  if (body === "truck") {
    analystNote = "Truck values are especially sensitive to mileage, drivetrain condition, tow history, tire condition, and underbody wear."
  }

  if (fuel === "electric") {
    analystNote = "EV values are especially sensitive to battery confidence, software condition, warranty status, and charging history."
  }

  return {
    valuationDate: "March 19, 2026",
    method: "Modeled secondary market positioning estimate",
    retailValues: {
      excellent: excellentRetail,
      good: goodRetail,
      fair: fairRetail
    },
    tradeValues: {
      excellent: excellentTrade,
      good: goodTrade,
      fair: fairTrade
    },
    analystNote
  }
}

function buildEngineAdvisory(vehicle, ownership) {
  const year = intValue(vehicle.year)
  const make = upperText(vehicle.make)
  const model = upperText(vehicle.model)
  const fuel = getFuelGroup(vehicle)
  const drive = getDriveTypeGroup(vehicle)

  const title = "Platform and Engine Advisory"
  let summary = ownership.engineLabel
    ? `This vehicle likely uses ${ownership.engineLabel}.`
    : `This vehicle sits on ${ownership.platform}.`

  const advisoryItems = []

  if (make === "BMW" && model.includes("320") && year === 2016) {
    return {
      title: "The Split Year Engine Advisory",
      summary: "2016 was a transition year for some BMW 320i production. The long term ownership profile can change depending on which engine architecture is under the hood.",
      advisoryItems: [
        {
          heading: "Earlier Production Logic",
          body: "Some vehicles from this period may map to the outgoing turbo four cylinder architecture, which carries stronger buyer sensitivity around timing chain related reputation and long term maintenance anxiety."
        },
        {
          heading: "Later Production Logic",
          body: "Later production examples are more likely to align with BMW's newer closed deck turbo four cylinder family, which is generally viewed as the preferred long term architecture."
        },
        {
          heading: "Action",
          body: "Confirm the physical engine layout before purchase and cross check servicing history for oil changes, cooling system work, and gasket repairs."
        }
      ]
    }
  }

  if (make === "BMW") {
    advisoryItems.push({
      heading: "BMW Ownership Context",
      body: "BMW values are heavily influenced by engine family, fluid service quality, cooling system condition, and whether warning lights or leaks are present."
    })
  }

  if (make === "AUDI" || make === "VOLKSWAGEN" || make === "VW") {
    advisoryItems.push({
      heading: "Turbocharged Platform Advisory",
      body: "Audi and Volkswagen ownership value is strongly tied to cooling system history, transmission service quality, oil consumption monitoring, and warning light free operation."
    })
  }

  if (make === "MERCEDES-BENZ" || make === "MERCEDES BENZ" || make === "MERCEDES") {
    advisoryItems.push({
      heading: "Electronic Complexity Advisory",
      body: "Mercedes ownership risk often sits in electronics, leaks, suspension wear, and evidence of high quality servicing rather than mileage alone."
    })
  }

  if (make === "TOYOTA" || make === "LEXUS") {
    advisoryItems.push({
      heading: "Durability Advisory",
      body: "These platforms often carry a lower public risk profile than rivals, but hybrid battery age, crash repair quality, and neglected fluid service still materially affect ownership quality."
    })
  }

  if (make === "FORD") {
    advisoryItems.push({
      heading: "Drivetrain Advisory",
      body: "Ford used values are often shaped by transmission behavior, turbo system health, towing related wear, and underbody condition."
    })
  }

  if (make === "CHEVROLET" || make === "GMC" || make === "CADILLAC") {
    advisoryItems.push({
      heading: "Transmission and Engine Advisory",
      body: "GM ownership risk often centers on transmission behavior, oil management system history, and front end wear on larger vehicles."
    })
  }

  if (make === "HYUNDAI" || make === "KIA" || make === "GENESIS") {
    advisoryItems.push({
      heading: "Engine Family Advisory",
      body: "Engine family history and recall completion status matter significantly on used Hyundai and Kia platform vehicles."
    })
  }

  if (make === "NISSAN" || make === "INFINITI") {
    advisoryItems.push({
      heading: "Transmission Advisory",
      body: "Nissan purchase risk is often dominated by transmission behavior and proof of proper service history."
    })
  }

  if (make === "SUBARU") {
    advisoryItems.push({
      heading: "AWD Advisory",
      body: "Subaru ownership is unusually sensitive to tire matching, fluid servicing, and transmission or AWD condition."
    })
  }

  if (make === "TESLA") {
    advisoryItems.push({
      heading: "EV Advisory",
      body: "Tesla ownership risk centers on suspension wear, tire wear, battery confidence, charging behavior, and sensor or module function."
    })
  }

  if (fuel === "electric") {
    advisoryItems.push({
      heading: "Electrified System Note",
      body: "This vehicle uses an electrified powertrain, so battery condition, charging behavior, and software or module health matter more than engine wear."
    })
  }

  if (drive === "awd") {
    advisoryItems.push({
      heading: "AWD System Note",
      body: "All wheel drive vehicles should be checked carefully for tire matching, transfer case or coupling behavior, and low speed binding during tight turns."
    })
  }

  return {
    title,
    summary,
    advisoryItems
  }
}

function buildRiskForecast(vehicle, ownership, safety) {
  const make = upperText(vehicle.make)
  const body = getBodyType(vehicle)
  const drive = getDriveTypeGroup(vehicle)
  const fuel = getFuelGroup(vehicle)

  const items = []

  items.push({
    risk: "High",
    area: "Cooling System",
    note: "Cooling system age is one of the most common used vehicle ownership cost triggers on modern cars, especially turbocharged or luxury platforms.",
    estimatedCost: body === "truck" ? currencyRange(900, 1800) : currencyRange(700, 1400)
  })

  items.push({
    risk: "Medium",
    area: "Suspension Wear",
    note: "Bushings, arms, links, and dampers often become cost items at this age, especially on heavier AWD, SUV, truck, and luxury platforms.",
    estimatedCost: currencyRange(500, 1600)
  })

  if (fuel !== "electric") {
    items.push({
      risk: "Medium",
      area: "Oil Leaks and Gaskets",
      note: "Age related gasket seepage and oil leak repairs are common on many turbocharged and luxury vehicles.",
      estimatedCost: currencyRange(400, 1400)
    })
  }

  if (drive === "awd") {
    items.push({
      risk: "Medium",
      area: "AWD System Service Exposure",
      note: "AWD systems are more sensitive to tire mismatch, missed fluid service, and transfer case wear than two wheel drive layouts.",
      estimatedCost: currencyRange(500, 3500)
    })
  }

  if (fuel === "hybrid") {
    items.push({
      risk: "Medium",
      area: "Hybrid System Aging",
      note: "As hybrid vehicles age, battery support systems, cooling, and related diagnostics become more relevant ownership variables.",
      estimatedCost: currencyRange(600, 3000)
    })
  }

  if (fuel === "electric") {
    items.push({
      risk: "Medium",
      area: "Battery and Charging Diagnostics",
      note: "EV ownership risk shifts toward battery confidence, charging behavior, thermal management, and module issues.",
      estimatedCost: currencyRange(700, 4000)
    })
  }

  if (make === "BMW") {
    items.push({
      risk: "High",
      area: "BMW Cooling and Leak Exposure",
      note: "BMW ownership cost is often driven by coolant system parts, oil filter housing leaks, valve cover leaks, and service neglect.",
      estimatedCost: currencyRange(800, 1800)
    })
  }

  if (make === "AUDI" || make === "VOLKSWAGEN" || make === "VW") {
    items.push({
      risk: "Medium",
      area: "Turbo Cooling and Intake Systems",
      note: "VW Group turbo platforms often require attention around water pumps, PCV systems, intake related faults, and transmission service.",
      estimatedCost: currencyRange(700, 2000)
    })
  }

  if (make === "NISSAN" || make === "INFINITI") {
    items.push({
      risk: "High",
      area: "Transmission Exposure",
      note: "Transmission behavior should be treated as a major purchase driver on many Nissan platforms.",
      estimatedCost: currencyRange(2500, 5000)
    })
  }

  return {
    title: "24 Month Risk Forecast",
    summary: "This section models common ownership cost areas based on platform type, age, drivetrain, and public safety context. These are not guarantees, but they are meaningful buyer focus points.",
    items: items.slice(0, 6)
  }
}

function buildNegotiationLeverage(vehicle, ownership, marketAnalysis) {
  const drive = getDriveTypeGroup(vehicle)
  const fuel = getFuelGroup(vehicle)
  const make = safeValue(vehicle.make) || "This vehicle"

  const scripts = [
    {
      title: "The Maintenance Reserve Credit",
      script: `This ${make} sits in a maintenance sensitive age band. Without recent major service receipts, I need to budget immediately for deferred items.`
    },
    {
      title: "The Tire and Brake Adjustment",
      script: "Tires and brakes are immediate ownership costs. If tread depth or brake life is low, that becomes a direct negotiation point rather than a future surprise."
    },
    {
      title: "The Service History Gap",
      script: "If key fluids or age related maintenance are undocumented, I have to price in risk rather than assume the best case scenario."
    }
  ]

  if (drive === "awd") {
    scripts.push({
      title: "The AWD Risk Credit",
      script: "All wheel drive systems add cost exposure if tires are mismatched or fluid service has been skipped. I need to budget for that risk today."
    })
  }

  if (fuel === "hybrid" || fuel === "electric") {
    scripts.push({
      title: "The Electrified System Reserve",
      script: "On an electrified vehicle, battery confidence, charging behavior, and electronic diagnostics materially affect value, so I need pricing that reflects that uncertainty."
    })
  }

  if (upperText(vehicle.make) === "BMW") {
    scripts.push({
      title: "The Cooling and Leak Credit",
      script: "BMW ownership costs are often shaped by cooling parts and oil leaks at this age. Without proof those items were handled, I need to budget for them right away."
    })
  }

  if (upperText(vehicle.make) === "NISSAN") {
    scripts.push({
      title: "The Transmission Risk Adjustment",
      script: "Transmission condition is one of the biggest value variables on this platform, so without strong service evidence I need a price that reflects that risk."
    })
  }

  return {
    title: "Negotiation Leverage",
    summary: `Use these talking points to justify a lower offer if service history, tire condition, fluid service, or inspection quality are weak. Modeled market position for a good example is approximately $${marketAnalysis.retailValues.good.toLocaleString()}.`,
    items: scripts.slice(0, 5)
  }
}

function buildOwnershipRoadmap(vehicle, ownership) {
  const fuel = getFuelGroup(vehicle)
  const drive = getDriveTypeGroup(vehicle)
  const make = upperText(vehicle.make)

  const immediate = [
    "Oil service if interval is unclear",
    "Full inspection for leaks, tires, brakes, and warning lights",
    "Baseline fluid and service record review"
  ]

  const next5k = [
    "Check tires, brakes, and alignment",
    "Inspect suspension wear items",
    "Recheck fluid levels and leaks"
  ]

  const next10k = [
    "Spark plugs if the platform is turbocharged and service is unknown",
    "Brake fluid review",
    "Cooling system inspection"
  ]

  const next20k = [
    "Serpentine belt inspection or replacement where age appropriate",
    "Transmission or drivetrain service review",
    "Battery and charging system review for electrified vehicles"
  ]

  const next30k = [
    "Comprehensive fluid service review",
    "Suspension and steering condition reinspection",
    "Update preventive maintenance baseline"
  ]

  if (drive === "awd") {
    next5k.push("Transfer case or AWD fluid service review")
  }

  if (fuel === "hybrid") {
    next20k.push("Hybrid cooling and battery support system inspection")
  }

  if (fuel === "electric") {
    immediate.push("Charging and battery health review")
    next10k.push("Brake system and tire wear review due to EV curb weight")
  }

  if (make === "BMW") {
    immediate.push("Ignore long factory oil intervals if service history is weak")
    next20k.push("Transmission service consideration if age and mileage justify it")
  }

  if (make === "AUDI" || make === "VOLKSWAGEN" || make === "VW") {
    next10k.push("Cooling system and water pump checks")
  }

  if (make === "NISSAN") {
    immediate.push("Transmission behavior review should be treated as a priority")
  }

  return {
    title: "30,000 Mile Ownership Roadmap",
    summary: "This is a preventive ownership roadmap designed to reduce the chance that the vehicle becomes a high surprise cost purchase.",
    intervals: [
      { interval: "Immediate", actions: Array.from(new Set(immediate)) },
      { interval: "Next 5k Miles", actions: Array.from(new Set(next5k)) },
      { interval: "Next 10k Miles", actions: Array.from(new Set(next10k)) },
      { interval: "Next 20k Miles", actions: Array.from(new Set(next20k)) },
      { interval: "Next 30k Miles", actions: Array.from(new Set(next30k)) }
    ]
  }
}

function buildPurchaseChecklist(vehicle, ownership) {
  const checks = [
    "Cold start the vehicle from fully cold if possible",
    "Scan for warning lights before and after the drive",
    "Review service history for regular oil changes and annual servicing",
    "Inspect tire age, tread, and brand matching",
    "Check for obvious fluid leaks or repair shortcuts",
    "Confirm all major electronics work correctly"
  ]

  if (getDriveTypeGroup(vehicle) === "awd") {
    checks.push("Do a tight low speed turn to check for binding or jerking")
  }

  if (getFuelGroup(vehicle) === "electric") {
    checks.push("Verify charging behavior and battery related warnings")
  }

  if (getFuelGroup(vehicle) === "hybrid") {
    checks.push("Check for smooth transition between electric and gasoline operation")
  }

  for (const test of ownership.testDriveChecks || []) {
    if (!checks.includes(test)) checks.push(test)
  }

  return {
    title: "Final Purchase Checklist",
    items: checks.slice(0, 10)
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
    series: safeValue(row.Series),
    series2: safeValue(row.Series2),
    displacementL: safeValue(row.DisplacementL),
    cylinders: safeValue(row.EngineCylinders || row.Cylinders),
    transmissionSpeeds: safeValue(row.TransmissionSpeeds),
    assemblyPlant: safeValue(row.PlantCompanyName)
  }

  vehicle.title = buildVehicleTitle(vehicle)

  const safetyRecalls = await fetchRecalls(vehicle.year, vehicle.make, vehicle.model)
  const safetyComplaints = await fetchComplaints(vehicle.year, vehicle.make, vehicle.model)
  const efficiency = await fetchEfficiency(vehicle.year, vehicle.make, vehicle.model)
  const investigationData = await fetchInvestigations(vehicle.year, vehicle.make, vehicle.model)
  const specs = buildSpecsFromDecode(row)

  const safety = {
    ...safetyRecalls,
    ...safetyComplaints
  }

  const ownership = buildOwnershipIntelligence(vehicle, safety)
  const optionProfile = buildOptionProfile(vehicle)

  const report = {
    reportMeta: {
      headline: "PRE PURCHASE INTELLIGENCE REPORT",
      stockId: [
        safeValue(vehicle.year),
        safeValue(vehicle.make),
        safeValue(vehicle.model),
        safeValue(ownership.platform || ownership.enginePlatform || vehicle.trim)
      ].filter(Boolean).join("-").replace(/\s+/g, "-"),
      date: "March 19, 2026"
    },

    vehicle,
    safety,
    efficiency,
    specs,
    ownership,
    optionProfile,

    marketAnalysis: {
      valuationDate: "",
      method: "",
      retailValues: {},
      tradeValues: {},
      analystNote: ""
    },

    engineAdvisory: {
      title: "",
      summary: "",
      advisoryItems: []
    },

    riskForecast: {
      title: "",
      summary: "",
      items: []
    },

    negotiationLeverage: {
      title: "",
      summary: "",
      items: []
    },

    ownershipRoadmap: {
      title: "",
      summary: "",
      intervals: []
    },

    purchaseChecklist: {
      title: "",
      items: []
    },

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

  report.marketAnalysis = buildMarketAnalysis(vehicle, report)
  report.engineAdvisory = buildEngineAdvisory(vehicle, ownership)
  report.riskForecast = buildRiskForecast(vehicle, ownership, safety)
  report.negotiationLeverage = buildNegotiationLeverage(vehicle, ownership, report.marketAnalysis)
  report.ownershipRoadmap = buildOwnershipRoadmap(vehicle, ownership)
  report.purchaseChecklist = buildPurchaseChecklist(vehicle, ownership)

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