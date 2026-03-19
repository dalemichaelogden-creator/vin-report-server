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
    if (body === "wagon") return { name: "E91", summary: "Practical wagon platform with common aging BMW ownership issues." }
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

function buildBMWSpecialist(vehicle, safety) {
  const generation = inferBMWGeneration(vehicle)
  const engine = inferBMWEngineFamily(vehicle)
  const complaintCount = Number(safety.complaints || 0)

  let complaintLevel = "Low"
  if (complaintCount >= 50) complaintLevel = "Higher"
  else if (complaintCount >= 15) complaintLevel = "Moderate"

  const commonIssues = []
  const inspectionChecks = []

  commonIssues.push("Cooling system checks")
  commonIssues.push("Oil leak inspection")
  commonIssues.push("Electronic faults")
  commonIssues.push("Suspension wear")
  commonIssues.push("Service history gaps")

  inspectionChecks.push("Check for warning lights")
  inspectionChecks.push("Inspect for coolant or oil leaks")
  inspectionChecks.push("Test transmission response")
  inspectionChecks.push("Check suspension noises")
  inspectionChecks.push("Review full service history")
  inspectionChecks.push("Inspect for poor accident repairs")

  if (engine.family === "B48") {
    commonIssues.push("Turbo four cylinder maintenance sensitivity")
  }

  if (engine.family === "B58") {
    commonIssues.push("Cooling and intake related maintenance checks")
  }

  if (engine.family === "N55") {
    commonIssues.push("Turbo six cylinder leak and cooling checks")
  }

  return {
    brandFocus: "BMW",
    generation: generation.name,
    generationSummary: generation.summary,
    likelyEngineFamily: engine.family,
    likelyEngineLabel: engine.label,
    engineConfidence: engine.confidence,
    maintenanceComplexity: "Higher",
    complaintLevel,
    commonIssues: Array.from(new Set(commonIssues)),
    inspectionChecks: Array.from(new Set(inspectionChecks)),
    ownershipAdvice: engine.label
      ? `This ${vehicle.make} ${vehicle.model} likely uses ${engine.label}. Buyers should verify maintenance history and inspect for cooling, leak, and electronics related ownership issues.`
      : `This ${vehicle.make} ${vehicle.model} sits in a higher maintenance ownership category than a typical mass market vehicle.`
  }
}

function buildGenericSpecialist(vehicle, safety) {
  const body = getBodyType(vehicle)
  const fuel = getFuelGroup(vehicle)
  const drive = getDriveTypeGroup(vehicle)

  const commonIssues = []
  const inspectionChecks = []

  commonIssues.push("Service history gaps")
  commonIssues.push("Suspension wear")
  commonIssues.push("Brake wear")
  commonIssues.push("Electrical issues")

  inspectionChecks.push("Review service history")
  inspectionChecks.push("Check warning lights")
  inspectionChecks.push("Inspect tires and brakes")
  inspectionChecks.push("Test drivetrain response")
  inspectionChecks.push("Inspect for fluid leaks")

  if (body === "suv") {
    commonIssues.push("Higher weight related suspension wear")
  }

  if (fuel === "hybrid" || fuel === "electric") {
    commonIssues.push("Electrified system diagnostic complexity")
  }

  if (drive === "awd") {
    commonIssues.push("All wheel drive system servicing")
  }

  return {
    brandFocus: vehicle.make || "Generic",
    generation: "",
    generationSummary: "",
    likelyEngineFamily: "",
    likelyEngineLabel: "",
    engineConfidence: "Low",
    maintenanceComplexity: "Moderate",
    complaintLevel: Number(safety.complaints || 0) > 20 ? "Moderate" : "Low",
    commonIssues: Array.from(new Set(commonIssues)),
    inspectionChecks: Array.from(new Set(inspectionChecks)),
    ownershipAdvice: `This ${vehicle.make} ${vehicle.model} should be evaluated with attention to service history, drivetrain behavior, warning lights, and any visible repair quality issues.`
  }
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

  if (body === "coupe" || body === "convertible") sportScore += 18
  if (body === "suv") comfortScore += 12
  if (drive === "awd") comfortScore += 6
  if (fuel === "hybrid" || fuel === "electric") techScore += 16
  if (year >= 2019) techScore += 14

  if (trim.includes("M SPORT") || trim.includes("SPORT")) sportScore += 18
  if (trim.includes("PREMIUM") || trim.includes("LUXURY")) comfortScore += 18
  if (trim.includes("TECH") || trim.includes("ADVANCE") || trim.includes("PRESTIGE")) techScore += 18

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

async function fetchRecalls(year, make, model) {
  try {
    if (!year || !make || !model) {
      return {
        recalls: 0,
        recallSummary: "Recall data could not be checked because key vehicle details were missing."
      }
    }

    const url = `https://api.nhtsa.gov/recalls/recallsByVehicle?make=${encodeURIComponent(make)}&model=${encodeURIComponent(model)}&modelYear=${encodeURIComponent(year)}`
    const response = await fetch(url)

    if (!response.ok) {
      return {
        recalls: 0,
        recallSummary: "Recall data could not be retrieved right now."
      }
    }

    const data = await response.json()
    const results = Array.isArray(data.results) ? data.results : []

    return {
      recalls: results.length,
      recallSummary: results.length
        ? `${results.length} manufacturer safety recall records found for this exact model year, make, and model.`
        : "No manufacturer safety recalls found for this exact model year, make, and model."
    }
  } catch {
    return {
      recalls: 0,
      recallSummary: "Recall data could not be retrieved right now."
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
        dataAvailable: false
      }
    }

    const url = `https://api.nhtsa.gov/complaints/complaintsByVehicle?make=${encodeURIComponent(make)}&model=${encodeURIComponent(model)}&modelYear=${encodeURIComponent(year)}`
    const response = await fetch(url)

    if (!response.ok) {
      return {
        complaints: 0,
        topComponent: "",
        complaintSummary: "Complaint data could not be retrieved right now.",
        dataAvailable: false
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

    return {
      complaints: results.length,
      topComponent,
      complaintSummary: results.length
        ? `${results.length} owner complaint records found for this exact model year, make, and model.`
        : "No owner complaints found for this exact model year, make, and model.",
      dataAvailable: true
    }
  } catch {
    return {
      complaints: 0,
      topComponent: "",
      complaintSummary: "Complaint data could not be retrieved right now.",
      dataAvailable: false
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

  if (!report.efficiency.combinedMPG) {
    flags.push("Fuel economy match unavailable")
  }

  if (report.specialist.maintenanceComplexity === "Higher") {
    flags.push("Higher maintenance platform")
  }

  if (report.specialist.likelyEngineFamily) {
    flags.push(`Likely engine family: ${report.specialist.likelyEngineFamily}`)
  }

  return flags
}

function buildRiskLevel(report) {
  let score = 0

  const recalls = Number(report.safety.recalls || 0)
  const complaints = Number(report.safety.complaints || 0)

  if (recalls >= 8) score += 3
  else if (recalls >= 3) score += 2
  else if (recalls > 0) score += 1

  if (report.safety.dataAvailable) {
    if (complaints >= 20) score += 3
    else if (complaints > 0) score += 1
  }

  if (report.specialist.maintenanceComplexity === "Higher") score += 1
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
  if (report.specialist.commonIssues.length) score += 10
  if (report.specialist.inspectionChecks.length) score += 10
  if (report.specialist.likelyEngineFamily) score += 5

  const dimensionsPresent = !!safeValue(report.specs.dimensions)
  const hpPresent = !!safeValue(report.specs.horsepower)

  if (dimensionsPresent) score += 5
  if (hpPresent) score += 5

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

  if (report.specialist.maintenanceComplexity === "Higher") {
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
    inferredEngineUsed: !!safeValue(report.specialist.likelyEngineFamily)
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
    vin
  }

  vehicle.title = buildVehicleTitle(vehicle)

  const safetyRecalls = await fetchRecalls(vehicle.year, vehicle.make, vehicle.model)
  const safetyComplaints = await fetchComplaints(vehicle.year, vehicle.make, vehicle.model)
  const efficiency = await fetchEfficiency(vehicle.year, vehicle.make, vehicle.model)
  const specs = buildSpecsFromDecode(row)

  const safety = {
    ...safetyRecalls,
    ...safetyComplaints
  }

  const specialist = upperText(vehicle.make) === "BMW"
    ? buildBMWSpecialist(vehicle, safety)
    : buildGenericSpecialist(vehicle, safety)

  const optionProfile = buildOptionProfile(vehicle)

  const report = {
    vehicle,
    safety,
    efficiency,
    specs,
    specialist,
    optionProfile,

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