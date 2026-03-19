const express = require("express")

const app = express()

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

function buildVehicleTitle(vehicle) {
  return [
    safeValue(vehicle.year),
    safeValue(vehicle.make),
    safeValue(vehicle.model),
    safeValue(vehicle.trim)
  ].filter(Boolean).join(" ")
}

function xmlToObject(xmlString) {
  const value = String(xmlString || "")

  function getTag(tag) {
    const match = value.match(new RegExp(`<${tag}>(.*?)</${tag}>`, "i"))
    return match ? match[1].trim() : ""
  }

  return {
    id: getTag("id"),
    value: getTag("value"),
    text: getTag("text"),
    comb08: getTag("comb08"),
    fuelCost08: getTag("fuelCost08"),
    ghgScore: getTag("ghgScore"),
    smartwayScore: getTag("smartwayScore")
  }
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

async function fetchRecalls(year, make, model) {
  try {
    if (!year || !make || !model) {
      return {
        recalls: 0,
        recallSummary: "Recall data could not be checked because key vehicle details were missing."
      }
    }

    const url =
      `https://api.nhtsa.gov/recalls/recallsByVehicle?make=${encodeURIComponent(make)}&model=${encodeURIComponent(model)}&modelYear=${encodeURIComponent(year)}`

    const response = await fetch(url)

    if (!response.ok) {
      return {
        recalls: 0,
        recallSummary: "Recall data could not be retrieved right now."
      }
    }

    const data = await response.json()
    const results = Array.isArray(data.results) ? data.results : []
    const recallCount = results.length

    return {
      recalls: recallCount,
      recallSummary: recallCount > 0
        ? `${recallCount} manufacturer safety recall record${recallCount === 1 ? "" : "s"} found for this exact model year, make, and model.`
        : "No manufacturer safety recalls found for this exact model year, make, and model."
    }
  } catch (error) {
    console.error("Recall fetch error:", error)

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
        complaintSummary: "Complaint data could not be checked because key vehicle details were missing."
      }
    }

    const url =
      `https://api.nhtsa.gov/complaints/complaintsByVehicle?make=${encodeURIComponent(make)}&model=${encodeURIComponent(model)}&modelYear=${encodeURIComponent(year)}`

    const response = await fetch(url)

    if (!response.ok) {
      return {
        complaints: 0,
        topComponent: "",
        complaintSummary: "Complaint data could not be retrieved right now."
      }
    }

    const data = await response.json()
    const results = Array.isArray(data.results) ? data.results : []

    const complaintCount = results.length
    const componentCounts = {}

    for (const item of results) {
      const component = String(
        item.components ||
        item.component ||
        item.Component ||
        "Unknown Component"
      ).trim()

      componentCounts[component] = (componentCounts[component] || 0) + 1
    }

    let topComponent = ""
    let topCount = 0

    for (const component in componentCounts) {
      if (componentCounts[component] > topCount) {
        topComponent = component
        topCount = componentCounts[component]
      }
    }

    return {
      complaints: complaintCount,
      topComponent,
      complaintSummary: complaintCount > 0
        ? `${complaintCount} owner complaint record${complaintCount === 1 ? "" : "s"} found for this exact model year, make, and model.`
        : "No owner complaints found for this exact model year, make, and model."
    }
  } catch (error) {
    console.error("Complaint fetch error:", error)

    return {
      complaints: 0,
      topComponent: "",
      complaintSummary: "Complaint data could not be retrieved right now."
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
        efficiencySummary: "Efficiency data could not be checked because key vehicle details were missing."
      }
    }

    const optionsUrl =
      `https://www.fueleconomy.gov/ws/rest/vehicle/menu/options?year=${encodeURIComponent(year)}&make=${encodeURIComponent(make)}&model=${encodeURIComponent(model)}`

    const optionsResponse = await fetch(optionsUrl)

    if (!optionsResponse.ok) {
      return {
        combinedMPG: "",
        annualFuelCost: "",
        ghgScore: "",
        ecoBadge: "",
        efficiencySummary: "Fuel economy data could not be retrieved right now."
      }
    }

    const optionsXml = await optionsResponse.text()
    const optionMatch = optionsXml.match(/<value>(.*?)<\/value>/i)
    const vehicleId = optionMatch ? optionMatch[1].trim() : ""

    if (!vehicleId) {
      return {
        combinedMPG: "",
        annualFuelCost: "",
        ghgScore: "",
        ecoBadge: "",
        efficiencySummary: "No matching fuel economy record was found for this vehicle profile."
      }
    }

    const detailUrl =
      `https://www.fueleconomy.gov/ws/rest/vehicle/${encodeURIComponent(vehicleId)}`

    const detailResponse = await fetch(detailUrl)

    if (!detailResponse.ok) {
      return {
        combinedMPG: "",
        annualFuelCost: "",
        ghgScore: "",
        ecoBadge: "",
        efficiencySummary: "Fuel economy detail data could not be retrieved right now."
      }
    }

    const detailXml = await detailResponse.text()
    const detail = xmlToObject(detailXml)

    const combinedMPG = safeValue(detail.comb08)
    const annualFuelCostRaw = safeValue(detail.fuelCost08)
    const ghgScore = safeValue(detail.ghgScore)
    const ecoBadge = buildEcoBadge(ghgScore, detail.smartwayScore)

    let annualFuelCost = ""
    if (annualFuelCostRaw && !Number.isNaN(Number(annualFuelCostRaw))) {
      annualFuelCost = `$${Number(annualFuelCostRaw).toLocaleString()}`
    }

    return {
      combinedMPG,
      annualFuelCost,
      ghgScore,
      ecoBadge,
      efficiencySummary: combinedMPG
        ? "Fuel economy data matched successfully."
        : "Fuel economy data was checked but no combined MPG value was returned."
    }
  } catch (error) {
    console.error("Efficiency fetch error:", error)

    return {
      combinedMPG: "",
      annualFuelCost: "",
      ghgScore: "",
      ecoBadge: "",
      efficiencySummary: "Fuel economy data could not be retrieved right now."
    }
  }
}

function calculateCoverageScore(report) {
  let score = 0

  if (report.vehicle.make && report.vehicle.model && report.vehicle.year) {
    score += 25
  }

  if (typeof report.safety.recalls === "number") {
    score += 15
  }

  if (typeof report.safety.complaints === "number") {
    score += 15
  }

  if (report.efficiency.combinedMPG || report.efficiency.annualFuelCost) {
    score += 15
  }

  return score
}

app.get("/api/health", (req, res) => {
  res.json({ status: "server running" })
})

app.post("/api/decode", async (req, res) => {
  try {
    const vin = sanitizeVin(req.body.vin)

    if (vin.length !== 17) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid 17 character VIN"
      })
    }

    const decodeUrl =
      `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValuesExtended/${vin}?format=json`

    const decodeResponse = await fetch(decodeUrl)

    if (!decodeResponse.ok) {
      return res.status(500).json({
        success: false,
        message: "VIN decode request failed"
      })
    }

    const decodeData = await decodeResponse.json()

    if (!decodeData.Results || !decodeData.Results.length) {
      return res.status(404).json({
        success: false,
        message: "No VIN data found"
      })
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
      drive: safeValue(row.DriveType)
    }

    vehicle.title = buildVehicleTitle(vehicle)

    const recalls = await fetchRecalls(vehicle.year, vehicle.make, vehicle.model)
    const complaints = await fetchComplaints(vehicle.year, vehicle.make, vehicle.model)
    const efficiency = await fetchEfficiency(vehicle.year, vehicle.make, vehicle.model)

    const report = {
      vehicle,
      safety: {
        ...recalls,
        ...complaints
      },
      efficiency,
      coverageScore: 0,
      allowPurchase: false
    }

    report.coverageScore = calculateCoverageScore(report)
    report.allowPurchase = report.coverageScore >= 60

    return res.json({
      success: true,
      vin,
      report
    })
  } catch (error) {
    console.error(error)

    return res.status(500).json({
      success: false,
      message: "Something went wrong while decoding the VIN",
      error: String(error.message || error)
    })
  }
})

app.listen(3001, () => {
  console.log("Server running on port 3001")
})