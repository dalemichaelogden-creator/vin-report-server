const express = require("express")
const cors = require("cors")
const Stripe = require("stripe")

const app = express()

app.use(cors())

const PORT = process.env.PORT || 3010
const API_BASE = process.env.API_BASE || "http://127.0.0.1:3002"
const BASE_URL = process.env.BASE_URL || process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "REPLACE_WITH_YOUR_STRIPE_SECRET_KEY"

const stripe = new Stripe(STRIPE_SECRET_KEY)

console.log("THIS IS THE VISUAL CUSTOMER REPORT FILE")

app.use(express.static("public"))
app.use(express.json())

function sanitizeVin(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .replace(/[IOQ]/g, "")
    .slice(0, 17)
}

function safeValue(value, fallback = "N/A") {
  return value && String(value).trim() ? String(value).trim() : fallback
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function getRiskColor(level) {
  if (level === "High") {
    return { bg: "#fee2e2", text: "#991b1b", border: "#fecaca" }
  }

  if (level === "Moderate") {
    return { bg: "#fef3c7", text: "#92400e", border: "#fcd34d" }
  }

  return { bg: "#dcfce7", text: "#166534", border: "#bbf7d0" }
}

function getConfidenceColor(level) {
  if (level === "High Confidence") {
    return { bg: "#dcfce7", text: "#166534" }
  }

  if (level === "Good Coverage") {
    return { bg: "#dbeafe", text: "#1d4ed8" }
  }

  if (level === "Partial Coverage") {
    return { bg: "#fef3c7", text: "#92400e" }
  }

  return { bg: "#fee2e2", text: "#991b1b" }
}

function renderList(items) {
  if (!Array.isArray(items) || !items.length) {
    return `<div class="empty-copy">No additional items were returned.</div>`
  }

  return `
    <div class="pill-wrap">
      ${items.map(item => `<span class="pill">${escapeHtml(item)}</span>`).join("")}
    </div>
  `
}

function buildScanHeadline(report) {
  const recalls = Number(report.safety && report.safety.recalls || 0)
  const complaints = Number(report.safety && report.safety.complaints || 0)
  const risk = safeValue(report.signals && report.signals.riskLevel, "Moderate")

  if (recalls >= 5 || complaints >= 25 || risk === "High") {
    return "Potential ownership concerns detected"
  }

  if (recalls >= 1 || complaints >= 1 || risk === "Moderate") {
    return "Known buyer risk signals detected"
  }

  return "Vehicle profile flagged for closer review"
}

function buildScanSubheadline(report) {
  const recalls = Number(report.safety && report.safety.recalls || 0)
  const complaints = Number(report.safety && report.safety.complaints || 0)

  if (recalls >= 5 && complaints >= 10) {
    return "This vehicle profile shows both recall activity and complaint history. A closer inspection is strongly recommended before purchase."
  }

  if (recalls >= 5) {
    return "This vehicle profile shows notable recall activity. Buyers usually review safety history more carefully before moving forward."
  }

  if (complaints >= 25) {
    return "This vehicle profile shows meaningful complaint activity across public records. Further review is recommended before purchase."
  }

  if (recalls >= 1 || complaints >= 1) {
    return "Public data suggests one or more buyer risk indicators for this vehicle profile. The full report reveals where the concern sits."
  }

  return "The free scan completed successfully and found one or more reasons this vehicle may deserve a closer look."
}

async function getReport(vin) {
  const url = `${API_BASE}/api/decode/${encodeURIComponent(vin)}`
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error("Could not retrieve backend intelligence report")
  }

  const data = await response.json()

  if (!data.success || !data.report) {
    throw new Error("Backend returned an invalid report")
  }

  return data.report
}

async function createCheckoutSession(vin) {
  const cleanVin = sanitizeVin(vin)

  if (cleanVin.length !== 17) {
    throw new Error("Valid 17 character VIN required")
  }

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: "VIN Intelligence Report",
            description: `Unlocked customer report for VIN ${cleanVin}`
          },
          unit_amount: 499
        },
        quantity: 1
      }
    ],
    metadata: {
      vin: cleanVin
    },
    client_reference_id: cleanVin,
    success_url: `${BASE_URL}/processing/${encodeURIComponent(cleanVin)}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${BASE_URL}/scan/${encodeURIComponent(cleanVin)}`
  })

  return session
}

async function verifyPaidSession(sessionId, expectedVin) {
  if (!sessionId) {
    return { ok: false, reason: "Missing session_id" }
  }

  const session = await stripe.checkout.sessions.retrieve(sessionId)

  if (!session) {
    return { ok: false, reason: "Stripe session not found" }
  }

  if (session.payment_status !== "paid") {
    return { ok: false, reason: "Stripe session is not paid" }
  }

  const paidVin = sanitizeVin(session.metadata && session.metadata.vin)
  const expected = sanitizeVin(expectedVin)

  if (!paidVin || paidVin !== expected) {
    return { ok: false, reason: "VIN mismatch" }
  }

  return { ok: true, session }
}

app.get("/", (req, res) => {
  res.send(`<h1>Customer visual report server running</h1><p>Try /scan/YOURVINHERE</p>`)
})

app.get("/start-checkout/:vin", async (req, res) => {
  try {
    const vin = sanitizeVin(req.params.vin)

    if (vin.length !== 17) {
      return res.status(400).send("<h1>Invalid VIN</h1><p>Please provide a valid 17 character VIN.</p>")
    }

    const session = await createCheckoutSession(vin)
    return res.redirect(session.url)
  } catch (error) {
    return res.status(500).send(`<h1>Checkout error</h1><p>${escapeHtml(String(error.message || error))}</p>`)
  }
})

app.post("/api/create-checkout-session", async (req, res) => {
  try {
    const vin = sanitizeVin(req.body && req.body.vin)

    if (vin.length !== 17) {
      return res.status(400).json({ error: "Valid 17 character VIN required" })
    }

    const session = await createCheckoutSession(vin)

    return res.json({
      success: true,
      url: session.url
    })
  } catch (error) {
    console.error("Stripe session error:", error)
    return res.status(500).json({
      success: false,
      error: "Failed to create checkout session"
    })
  }
})

app.get("/scan/:vin", async (req, res) => {
  try {
    const vin = sanitizeVin(req.params.vin)

    if (vin.length !== 17) {
      return res.status(400).send("<h1>Invalid VIN</h1><p>Please provide a valid 17 character VIN.</p>")
    }

    const report = await getReport(vin)

    const riskColors = getRiskColor(report.signals.riskLevel)
    const confidenceColors = getConfidenceColor(report.signals.confidenceLevel)
    const triggeredCount = Array.isArray(report.signals.attentionFlags) ? report.signals.attentionFlags.length : 0
    const scanHeadline = buildScanHeadline(report)
    const scanSubheadline = buildScanSubheadline(report)

    const teaserCards = [
      "Potential Recall Activity Found",
      "Known Reliability Pattern Detected",
      "High Maintenance Risk Category",
      "Specification Mismatch Risk"
    ]

    res.send(`
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(report.vehicle.title)} Scan Preview</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Arial, sans-serif;
      background: #eef3f9;
      color: #0f172a;
    }
    .wrap {
      max-width: 1120px;
      margin: 0 auto;
      padding: 28px 16px 56px;
    }
    .hero {
      background: linear-gradient(135deg, #0f172a, #1e293b 58%, #334155);
      color: white;
      border-radius: 24px;
      padding: 28px;
      box-shadow: 0 16px 36px rgba(15, 23, 42, 0.22);
      margin-bottom: 22px;
    }
    .hero-top {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      align-items: flex-start;
      flex-wrap: wrap;
    }
    .eyebrow {
      display: inline-block;
      background: rgba(255,255,255,0.12);
      color: #dbeafe;
      font-size: 12px;
      font-weight: 700;
      padding: 7px 12px;
      border-radius: 999px;
      margin-bottom: 12px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .hero h1 {
      margin: 0 0 8px;
      font-size: 38px;
      line-height: 1.08;
    }
    .hero-sub {
      margin: 0;
      color: #cbd5e1;
      font-size: 15px;
    }
    .status-chip {
      padding: 10px 14px;
      border-radius: 999px;
      font-size: 13px;
      font-weight: 700;
      white-space: nowrap;
      background: ${report.signals.allowPurchase ? "#dcfce7" : "#fee2e2"};
      color: ${report.signals.allowPurchase ? "#166534" : "#991b1b"};
    }
    .top-grid {
      display: grid;
      grid-template-columns: 1.15fr 0.85fr;
      gap: 20px;
      margin-bottom: 22px;
    }
    .card {
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 22px;
      padding: 22px;
      box-shadow: 0 10px 28px rgba(15, 23, 42, 0.06);
      margin-bottom: 22px;
    }
    .card h2 {
      margin: 0 0 16px;
      font-size: 22px;
    }
    .meta {
      font-size: 14px;
      line-height: 1.65;
      color: #64748b;
    }
    .warning-box {
      background: ${riskColors.bg};
      color: ${riskColors.text};
      border: 1px solid ${riskColors.border};
      border-radius: 18px;
      padding: 18px;
      margin-top: 16px;
    }
    .warning-title {
      font-size: 22px;
      font-weight: 800;
      margin: 0 0 8px;
    }
    .warning-copy {
      font-size: 14px;
      line-height: 1.7;
      margin: 0;
    }
    .score-stack {
      display: grid;
      gap: 14px;
    }
    .score-box {
      border-radius: 20px;
      padding: 22px;
      text-align: center;
      border: 1px solid ${riskColors.border};
      background: ${riskColors.bg};
      color: ${riskColors.text};
    }
    .score-number {
      font-size: 46px;
      font-weight: 800;
      line-height: 1;
      margin-bottom: 8px;
    }
    .score-label {
      font-size: 18px;
      font-weight: 700;
      margin-bottom: 6px;
    }
    .score-mini {
      font-size: 13px;
      line-height: 1.5;
    }
    .confidence-box {
      border-radius: 18px;
      padding: 16px;
      text-align: center;
      background: ${confidenceColors.bg};
      color: ${confidenceColors.text};
      font-weight: 700;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 14px;
    }
    .locked-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 14px;
      margin-top: 16px;
    }
    .item {
      background: #f8fafc;
      border: 1px solid #eef2f7;
      border-radius: 16px;
      padding: 16px;
    }
    .locked-card {
      background: linear-gradient(180deg, #fffaf0, #fff7ed);
      border: 1px solid #fed7aa;
      border-radius: 16px;
      padding: 18px;
      position: relative;
      overflow: hidden;
    }
    .locked-card::after {
      content: "";
      position: absolute;
      inset: 0;
      background: linear-gradient(90deg, rgba(255,255,255,0.18), rgba(255,255,255,0.04), rgba(255,255,255,0.18));
      opacity: 0.35;
      pointer-events: none;
    }
    .label {
      font-size: 11px;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      font-weight: 700;
      margin-bottom: 8px;
    }
    .value {
      font-size: 21px;
      font-weight: 700;
      line-height: 1.28;
      color: #0f172a;
    }
    .locked-title {
      font-size: 20px;
      font-weight: 800;
      color: #7c2d12;
      margin: 0 0 8px;
    }
    .locked-copy {
      font-size: 14px;
      line-height: 1.65;
      color: #9a3412;
      margin: 0;
    }
    .scan-list {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 12px;
      margin-top: 16px;
    }
    .scan-item {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 14px;
      padding: 14px;
      font-size: 14px;
      font-weight: 700;
      color: #0f172a;
    }
    .premium-box {
      background: linear-gradient(135deg, #111827, #1f2937);
      color: white;
      border-radius: 22px;
      padding: 24px;
      box-shadow: 0 12px 30px rgba(15, 23, 42, 0.18);
    }
    .premium-eyebrow {
      display: inline-block;
      background: rgba(255,255,255,0.12);
      color: #dbeafe;
      font-size: 11px;
      font-weight: 700;
      padding: 6px 10px;
      border-radius: 999px;
      margin-bottom: 12px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .premium-title {
      font-size: 24px;
      font-weight: 800;
      margin: 0 0 10px;
    }
    .premium-copy {
      color: #cbd5e1;
      font-size: 14px;
      line-height: 1.7;
      margin: 0 0 18px;
    }
    .premium-list {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 12px;
      margin-bottom: 18px;
    }
    .premium-item {
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 16px;
      padding: 14px;
      color: #f8fafc;
      font-size: 14px;
      line-height: 1.5;
      font-weight: 700;
    }
    .premium-btn {
      display: inline-flex;
      justify-content: center;
      align-items: center;
      background: linear-gradient(180deg, #22c55e, #16a34a);
      color: white;
      text-decoration: none;
      padding: 13px 18px;
      border-radius: 12px;
      font-weight: 800;
      box-shadow: 0 10px 22px rgba(34, 197, 94, 0.25);
    }
    .mini-note {
      margin-top: 12px;
      font-size: 12px;
      color: #cbd5e1;
    }
    @media (max-width: 900px) {
      .top-grid, .grid, .locked-grid, .scan-list, .premium-list {
        grid-template-columns: 1fr;
      }
      .hero h1 {
        font-size: 30px;
      }
      .wrap {
        padding: 18px 12px 36px;
      }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="hero">
      <div class="hero-top">
        <div>
          <div class="eyebrow">Free VIN Intelligence Scan</div>
          <h1>${escapeHtml(report.vehicle.title)}</h1>
          <p class="hero-sub">VIN: ${escapeHtml(vin)}</p>
        </div>
        <div class="status-chip">VIN Verified</div>
      </div>
    </div>

    <div class="top-grid">
      <div class="card">
        <h2>Scan Result</h2>
        <div class="meta">This VIN triggered multiple internal risk signals based on public safety data, model specific patterns, and ownership trends. Further detail is available in the full intelligence report.</div>

        <div class="warning-box">
          <div class="warning-title">${escapeHtml(scanHeadline)}</div>
          <p class="warning-copy">${escapeHtml(scanSubheadline)}</p>
        </div>

        <div class="scan-list">
          <div class="scan-item">Factory Build Architecture Decoded</div>
          <div class="scan-item">Engine Risk Profile Modeled</div>
          <div class="scan-item">Recall Database Cross Referenced</div>
          <div class="scan-item">Regional Reliability Signals Analyzed</div>
          <div class="scan-item">Configuration Probability Modeled</div>
          <div class="scan-item">Inspection Intelligence Generated</div>
        </div>
      </div>

      <div class="card">
        <div class="score-stack">
          <div class="score-box">
            <div class="score-number">${escapeHtml(report.signals.riskLevel)}</div>
            <div class="score-label">Risk Status</div>
            <div class="score-mini">${triggeredCount} internal logic flag${triggeredCount === 1 ? "" : "s"} detected</div>
          </div>

          <div class="confidence-box">
            ${escapeHtml(report.signals.confidenceLevel)} • Score ${escapeHtml(String(report.signals.coverageScore))}
          </div>
        </div>
      </div>
    </div>

    <div class="card">
      <h2>Locked Signal Categories</h2>
      <div class="meta">Your free scan confirmed that this VIN triggered one or more buyer risk categories. The full report reveals what was detected and where closer inspection may be needed.</div>

      <div class="locked-grid">
        ${teaserCards.map(title => `
          <div class="locked-card">
            <div class="label">Signal Category</div>
            <div class="locked-title">${escapeHtml(title)}</div>
            <p class="locked-copy">Details hidden until the full vehicle intelligence report is unlocked.</p>
          </div>
        `).join("")}
      </div>
    </div>

    <div class="card">
      <h2>Vehicle Identity</h2>
      <div class="grid">
        <div class="item"><div class="label">Year</div><div class="value">${escapeHtml(safeValue(report.vehicle.year))}</div></div>
        <div class="item"><div class="label">Make</div><div class="value">${escapeHtml(safeValue(report.vehicle.make))}</div></div>
        <div class="item"><div class="label">Model</div><div class="value">${escapeHtml(safeValue(report.vehicle.model))}</div></div>
        <div class="item"><div class="label">Trim</div><div class="value">${escapeHtml(safeValue(report.vehicle.trim))}</div></div>
      </div>
    </div>

    <div class="premium-box">
      <div class="premium-eyebrow">Unlock Specialist Intelligence Report</div>
      <div class="premium-title">See exactly what this VIN triggered</div>
      <p class="premium-copy">Your free scan shows that this VIN triggered one or more meaningful buyer signals. Unlock the full report to see what was detected, what to inspect in person, and whether this vehicle deserves closer scrutiny before purchase.</p>

      <div class="premium-list">
        <div class="premium-item">Reveal the actual concern behind each triggered signal</div>
        <div class="premium-item">See model specific reliability and maintenance intelligence</div>
        <div class="premium-item">Get inspection points before viewing the vehicle</div>
        <div class="premium-item">Understand whether this unit deserves closer scrutiny</div>
      </div>

      <a class="premium-btn" href="/start-checkout/${encodeURIComponent(vin)}">
        Unlock Full Intelligence Report • $4.99
      </a>

      <div class="mini-note">This upgraded report is unlocked after successful payment.</div>
    </div>
  </div>
</body>
</html>
    `)
  } catch (error) {
    res.status(500).send(`<h1>Error generating scan preview</h1><p>${escapeHtml(String(error.message || error))}</p>`)
  }
})

app.get("/processing/:vin", (req, res) => {
  try {
    const vin = sanitizeVin(req.params.vin)
    const sessionId = String(req.query.session_id || "")

    if (vin.length !== 17) {
      return res.status(400).send("<h1>Invalid VIN</h1><p>Please provide a valid 17 character VIN.</p>")
    }

    res.send(`
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Analyzing VIN...</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Arial, sans-serif;
      background: linear-gradient(135deg, #0f172a, #111827 60%, #1f2937);
      color: white;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .box {
      width: 100%;
      max-width: 520px;
      text-align: center;
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 24px;
      padding: 36px 28px;
      box-shadow: 0 18px 48px rgba(0,0,0,0.28);
      backdrop-filter: blur(8px);
    }
    .eyebrow {
      display: inline-block;
      background: rgba(255,255,255,0.1);
      color: #dbeafe;
      font-size: 12px;
      font-weight: 700;
      padding: 7px 12px;
      border-radius: 999px;
      margin-bottom: 16px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .loader {
      width: 58px;
      height: 58px;
      margin: 0 auto 22px;
      border-radius: 50%;
      border: 4px solid rgba(255,255,255,0.16);
      border-top-color: #22c55e;
      animation: spin 0.9s linear infinite;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    h1 {
      margin: 0 0 10px;
      font-size: 30px;
      line-height: 1.1;
    }
    p {
      margin: 0;
      color: #cbd5e1;
      font-size: 15px;
      line-height: 1.7;
    }
    .vin {
      margin-top: 18px;
      font-size: 13px;
      color: #93c5fd;
      word-break: break-all;
    }
  </style>
</head>
<body>
  <div class="box">
    <div class="eyebrow">Payment Confirmed</div>
    <div class="loader"></div>
    <h1>Analyzing VIN</h1>
    <p>Building your vehicle intelligence report and preparing the unlocked results.</p>
    <div class="vin">VIN: ${escapeHtml(vin)}</div>
  </div>

  <script>
    setTimeout(function () {
      window.location.href = "/customer-report/${encodeURIComponent(vin)}?session_id=${encodeURIComponent(sessionId)}";
    }, 1800);
  </script>
</body>
</html>
    `)
  } catch (error) {
    res.status(500).send(`<h1>Processing error</h1><p>${escapeHtml(String(error.message || error))}</p>`)
  }
})

app.get("/customer-report/:vin", async (req, res) => {
  try {
    const vin = sanitizeVin(req.params.vin)
    const sessionId = String(req.query.session_id || "")

    if (vin.length !== 17) {
      return res.status(400).send("<h1>Invalid VIN</h1><p>Please provide a valid 17 character VIN.</p>")
    }

    const paidCheck = await verifyPaidSession(sessionId, vin)

    if (!paidCheck.ok) {
      return res.redirect("/scan/" + encodeURIComponent(vin))
    }

    const report = await getReport(vin)

    const riskColors = getRiskColor(report.signals.riskLevel)
    const confidenceColors = getConfidenceColor(report.signals.confidenceLevel)

    res.send(`
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(report.vehicle.title)} Customer Report</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Arial, sans-serif;
      background: #edf3f8;
      color: #0f172a;
    }
    .wrap {
      max-width: 1180px;
      margin: 0 auto;
      padding: 28px 16px 56px;
    }
    .hero {
      background: linear-gradient(135deg, #0f172a, #1e293b 58%, #334155);
      color: white;
      border-radius: 24px;
      padding: 28px;
      box-shadow: 0 16px 36px rgba(15, 23, 42, 0.22);
      margin-bottom: 22px;
    }
    .hero-top {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      align-items: flex-start;
      flex-wrap: wrap;
    }
    .eyebrow {
      display: inline-block;
      background: rgba(255,255,255,0.12);
      color: #dbeafe;
      font-size: 12px;
      font-weight: 700;
      padding: 7px 12px;
      border-radius: 999px;
      margin-bottom: 12px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .hero h1 {
      margin: 0 0 8px;
      font-size: 38px;
      line-height: 1.08;
    }
    .hero-sub {
      margin: 0;
      color: #cbd5e1;
      font-size: 15px;
    }
    .status-chip {
      padding: 10px 14px;
      border-radius: 999px;
      font-size: 13px;
      font-weight: 700;
      white-space: nowrap;
      background: ${report.signals.allowPurchase ? "#dcfce7" : "#fee2e2"};
      color: ${report.signals.allowPurchase ? "#166534" : "#991b1b"};
    }
    .top-grid {
      display: grid;
      grid-template-columns: 1.2fr 0.8fr;
      gap: 20px;
      margin-bottom: 22px;
    }
    .card {
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 22px;
      padding: 22px;
      box-shadow: 0 10px 28px rgba(15, 23, 42, 0.06);
      margin-bottom: 22px;
    }
    .card h2 {
      margin: 0 0 16px;
      font-size: 22px;
    }
    .meta {
      font-size: 14px;
      line-height: 1.65;
      color: #64748b;
    }
    .score-stack {
      display: grid;
      gap: 14px;
    }
    .score-box {
      border-radius: 20px;
      padding: 22px;
      text-align: center;
      border: 1px solid ${riskColors.border};
      background: ${riskColors.bg};
      color: ${riskColors.text};
    }
    .score-number {
      font-size: 46px;
      font-weight: 800;
      line-height: 1;
      margin-bottom: 8px;
    }
    .score-label {
      font-size: 18px;
      font-weight: 700;
      margin-bottom: 6px;
    }
    .score-mini {
      font-size: 13px;
      line-height: 1.5;
    }
    .confidence-box {
      border-radius: 18px;
      padding: 16px;
      text-align: center;
      background: ${confidenceColors.bg};
      color: ${confidenceColors.text};
      font-weight: 700;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 14px;
    }
    .item {
      background: #f8fafc;
      border: 1px solid #eef2f7;
      border-radius: 16px;
      padding: 16px;
    }
    .wide {
      grid-column: 1 / -1;
    }
    .label {
      font-size: 11px;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      font-weight: 700;
      margin-bottom: 8px;
    }
    .value {
      font-size: 21px;
      font-weight: 700;
      line-height: 1.28;
      color: #0f172a;
    }
    .summary {
      font-size: 14px;
      line-height: 1.65;
      color: #475569;
    }
    .pill-wrap {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .pill {
      display: inline-flex;
      align-items: center;
      padding: 7px 11px;
      border-radius: 999px;
      background: #f1f5f9;
      border: 1px solid #e2e8f0;
      font-size: 13px;
      font-weight: 600;
      color: #1f2937;
    }
    .empty-copy {
      font-size: 14px;
      color: #64748b;
    }
    .premium-box {
      background: linear-gradient(135deg, #111827, #1f2937);
      color: white;
      border-radius: 22px;
      padding: 24px;
      box-shadow: 0 12px 30px rgba(15, 23, 42, 0.18);
    }
    .premium-eyebrow {
      display: inline-block;
      background: rgba(255,255,255,0.12);
      color: #dbeafe;
      font-size: 11px;
      font-weight: 700;
      padding: 6px 10px;
      border-radius: 999px;
      margin-bottom: 12px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .premium-title {
      font-size: 24px;
      font-weight: 800;
      margin: 0 0 10px;
    }
    .premium-copy {
      color: #cbd5e1;
      font-size: 14px;
      line-height: 1.7;
      margin: 0 0 18px;
    }
    .premium-list {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 12px;
      margin-bottom: 18px;
    }
    .premium-item {
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 16px;
      padding: 14px;
      color: #f8fafc;
      font-size: 14px;
      line-height: 1.5;
      font-weight: 700;
    }
    .premium-btn {
      display: inline-flex;
      justify-content: center;
      align-items: center;
      background: linear-gradient(180deg, #22c55e, #16a34a);
      color: white;
      text-decoration: none;
      padding: 13px 18px;
      border-radius: 12px;
      font-weight: 800;
      box-shadow: 0 10px 22px rgba(34, 197, 94, 0.25);
    }
    .mini-note {
      margin-top: 12px;
      font-size: 12px;
      color: #cbd5e1;
    }
    @media (max-width: 900px) {
      .top-grid, .grid, .premium-list {
        grid-template-columns: 1fr;
      }
      .hero h1 {
        font-size: 30px;
      }
      .wrap {
        padding: 18px 12px 36px;
      }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="hero">
      <div class="hero-top">
        <div>
          <div class="eyebrow">Vehicle Intelligence Report</div>
          <h1>${escapeHtml(report.vehicle.title)}</h1>
          <p class="hero-sub">VIN: ${escapeHtml(vin)}</p>
        </div>
        <div class="status-chip">Unlocked Report</div>
      </div>
    </div>

    <div class="top-grid">
      <div class="card">
        <h2>Unlocked Buyer Summary</h2>
        <div class="meta">${escapeHtml(report.frontEndSummary.subheadline)}</div>
      </div>

      <div class="card">
        <div class="score-stack">
          <div class="score-box">
            <div class="score-number">${escapeHtml(report.signals.riskLevel)}</div>
            <div class="score-label">Buyer Risk Level</div>
            <div class="score-mini">Based on public safety signals, platform maintenance characteristics, and data coverage.</div>
          </div>

          <div class="confidence-box">
            Coverage Score ${escapeHtml(String(report.signals.coverageScore))} • ${escapeHtml(report.signals.confidenceLevel)}
          </div>
        </div>
      </div>
    </div>

    <div class="card">
      <h2>Vehicle Identity</h2>
      <div class="grid">
        <div class="item"><div class="label">Year</div><div class="value">${escapeHtml(safeValue(report.vehicle.year))}</div></div>
        <div class="item"><div class="label">Make</div><div class="value">${escapeHtml(safeValue(report.vehicle.make))}</div></div>
        <div class="item"><div class="label">Model</div><div class="value">${escapeHtml(safeValue(report.vehicle.model))}</div></div>
        <div class="item"><div class="label">Trim</div><div class="value">${escapeHtml(safeValue(report.vehicle.trim))}</div></div>
        <div class="item"><div class="label">Fuel Type</div><div class="value">${escapeHtml(safeValue(report.vehicle.fuel))}</div></div>
        <div class="item"><div class="label">Drive Type</div><div class="value">${escapeHtml(safeValue(report.vehicle.drive))}</div></div>
      </div>
    </div>

    <div class="card">
      <h2>Safety and Reliability Signals</h2>
      <div class="grid">
        <div class="item"><div class="label">Recall Count</div><div class="value">${escapeHtml(String(report.safety.recalls))}</div></div>
        <div class="item"><div class="label">Complaint Count</div><div class="value">${escapeHtml(String(report.safety.complaints))}</div></div>
        <div class="item"><div class="label">Top Complaint Area</div><div class="value">${escapeHtml(safeValue(report.safety.topComponent))}</div></div>
        <div class="item"><div class="label">Complaint Data Status</div><div class="value">${report.safety.dataAvailable ? "Available" : "Unavailable"}</div></div>
        <div class="item wide"><div class="label">Recall Summary</div><div class="summary">${escapeHtml(safeValue(report.safety.recallSummary))}</div></div>
        <div class="item wide"><div class="label">Complaint Summary</div><div class="summary">${escapeHtml(safeValue(report.safety.complaintSummary))}</div></div>
      </div>
    </div>

    <div class="card">
      <h2>BMW Specialist Intelligence</h2>
      <div class="grid">
        <div class="item"><div class="label">Generation</div><div class="value">${escapeHtml(safeValue(report.specialist.generation))}</div></div>
        <div class="item"><div class="label">Likely Engine Family</div><div class="value">${escapeHtml(safeValue(report.specialist.likelyEngineFamily))}</div></div>
        <div class="item"><div class="label">Likely Engine</div><div class="value">${escapeHtml(safeValue(report.specialist.likelyEngineLabel))}</div></div>
        <div class="item"><div class="label">Maintenance Complexity</div><div class="value">${escapeHtml(safeValue(report.specialist.maintenanceComplexity))}</div></div>
        <div class="item wide"><div class="label">Ownership Advice</div><div class="summary">${escapeHtml(safeValue(report.specialist.ownershipAdvice))}</div></div>
        <div class="item wide"><div class="label">Common Problem Areas</div>${renderList(report.specialist.commonIssues)}</div>
        <div class="item wide"><div class="label">What To Check Before Buying</div>${renderList(report.specialist.inspectionChecks)}</div>
      </div>
    </div>

    <div class="card">
      <h2>Efficiency and Specs</h2>
      <div class="grid">
        <div class="item"><div class="label">Combined MPG</div><div class="value">${escapeHtml(safeValue(report.efficiency.combinedMPG))}</div></div>
        <div class="item"><div class="label">Annual Fuel Cost</div><div class="value">${escapeHtml(safeValue(report.efficiency.annualFuelCost))}</div></div>
        <div class="item"><div class="label">Horsepower</div><div class="value">${escapeHtml(safeValue(report.specs.horsepower))}</div></div>
        <div class="item"><div class="label">Transmission</div><div class="value">${escapeHtml(safeValue(report.specs.transmission))}</div></div>
      </div>
    </div>

    <div class="premium-box">
      <div class="premium-eyebrow">Global Vehicle History Check</div>
      <div class="premium-title">Need deeper history beyond this intelligence report?</div>
      <p class="premium-copy">Use CarVertical for wider global database checks including accident records, title flags, auction history, mileage anomalies, and ownership related history where available.</p>

      <div class="premium-list">
        <div class="premium-item">Global accident and damage databases</div>
        <div class="premium-item">Title and branding related history</div>
        <div class="premium-item">Mileage anomaly checks</div>
        <div class="premium-item">Auction and ownership history signals</div>
      </div>

      <a class="premium-btn" href="https://www.carvertical.com/landing/v3?a=677d85351acf8&b=14f83321&voucher=checkyourspec&utm_medium=aff" target="_blank" rel="noopener">
        Run Global History Check
      </a>

      <div class="mini-note">This takes the user into a deeper external history check using your affiliate link.</div>
    </div>
  </div>
</body>
</html>
    `)
  } catch (error) {
    res.status(500).send(`<h1>Error generating customer report</h1><p>${escapeHtml(String(error.message || error))}</p>`)
  }
})

app.listen(PORT, () => {
  console.log("Customer visual report server running on port " + PORT)
})