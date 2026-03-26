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
console.log("SERVER_VISUAL_JS_BOOTED");

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

function money(value) {
  const num = Number(value)
  if (Number.isNaN(num) || !num) return "N/A"
  return `$${num.toLocaleString()}`
}

function displaySpec(value, fallback) {
  const clean = safeValue(value, "")
  return clean && clean !== "N/A" ? clean : fallback
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

function getSeverityBadge(severity) {
  const value = safeValue(severity, "General Attention")

  if (value === "Higher Attention") {
    return { bg: "#fee2e2", text: "#991b1b", border: "#fecaca" }
  }

  if (value === "Moderate Attention") {
    return { bg: "#fef3c7", text: "#92400e", border: "#fcd34d" }
  }

  return { bg: "#e2e8f0", text: "#334155", border: "#cbd5e1" }
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

function renderSimpleBullets(items) {
  if (!Array.isArray(items) || !items.length) {
    return `<div class="empty-copy">No items available.</div>`
  }

  return `
    <ul class="bullet-list">
      ${items.map(item => `<li>${escapeHtml(item)}</li>`).join("")}
    </ul>
  `
}

function renderAdvisoryItems(items) {
  if (!Array.isArray(items) || !items.length) {
    return `<div class="empty-copy">No advisory items available.</div>`
  }

  return `
    <div class="stack-grid">
      ${items.map(item => `
        <div class="stack-card">
          <div class="stack-title">${escapeHtml(safeValue(item.heading))}</div>
          <div class="stack-copy">${escapeHtml(safeValue(item.body))}</div>
        </div>
      `).join("")}
    </div>
  `
}

function renderRiskForecastItems(items) {
  if (!Array.isArray(items) || !items.length) {
    return `<div class="empty-copy">No forecast items available.</div>`
  }

  return `
    <div class="forecast-grid">
      ${items.map(item => `
        <div class="forecast-card">
          <div class="forecast-top">
            <span class="mini-label">Risk Area</span>
            <span class="risk-chip ${escapeHtml(safeValue(item.risk).toLowerCase())}">${escapeHtml(safeValue(item.risk))}</span>
          </div>
          <div class="forecast-title">${escapeHtml(safeValue(item.area))}</div>
          <div class="forecast-copy">${escapeHtml(safeValue(item.note))}</div>
          <div class="forecast-cost">Estimated cost: ${escapeHtml(safeValue(item.estimatedCost))}</div>
        </div>
      `).join("")}
    </div>
  `
}

function renderNegotiationItems(items) {
  if (!Array.isArray(items) || !items.length) {
    return `<div class="empty-copy">No negotiation items available.</div>`
  }

  return `
    <div class="stack-grid">
      ${items.map(item => `
        <div class="stack-card">
          <div class="stack-title">${escapeHtml(safeValue(item.title))}</div>
          <div class="stack-copy">${escapeHtml(safeValue(item.script))}</div>
        </div>
      `).join("")}
    </div>
  `
}

function renderRoadmap(intervals) {
  if (!Array.isArray(intervals) || !intervals.length) {
    return `<div class="empty-copy">No roadmap available.</div>`
  }

  return `
    <div class="roadmap-grid">
      ${intervals.map(item => `
        <div class="roadmap-card">
          <div class="roadmap-title">${escapeHtml(safeValue(item.interval))}</div>
          ${renderSimpleBullets(item.actions || [])}
        </div>
      `).join("")}
    </div>
  `
}

function renderComplaintComponents(items) {
  if (!Array.isArray(items) || !items.length) {
    return `<div class="empty-copy">No complaint component ranking available.</div>`
  }

  return `
    <div class="table-wrap">
      <table class="table">
        <thead>
          <tr>
            <th>Component</th>
            <th>Count</th>
          </tr>
        </thead>
        <tbody>
          ${items.map(item => `
            <tr>
              <td>${escapeHtml(safeValue(item.component))}</td>
              <td>${escapeHtml(String(item.count || 0))}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `
}

function renderRecallDetails(items) {
  if (!Array.isArray(items) || !items.length) {
    return `<div class="empty-copy">No recall campaign detail available.</div>`
  }

  return `
    <div class="detail-grid">
      ${items.map(item => {
        const badge = getSeverityBadge(item.severity)
        return `
          <div class="detail-card">
            <div class="detail-header">
              <div>
                <div class="mini-label">Campaign</div>
                <div class="detail-title">${escapeHtml(safeValue(item.campaignNumber, "Unknown Campaign"))}</div>
              </div>
              <span class="severity-chip" style="background:${badge.bg};color:${badge.text};border-color:${badge.border};">
                ${escapeHtml(safeValue(item.severity))}
              </span>
            </div>
            <div class="detail-sub">${escapeHtml(safeValue(item.component, "General safety item"))}</div>
            <div class="detail-copy">${escapeHtml(safeValue(item.summary))}</div>
            <div class="meta-row">
              <span><strong>Date:</strong> ${escapeHtml(safeValue(item.reportDate))}</span>
            </div>
            <div class="meta-row">
              <span><strong>Remedy:</strong> ${escapeHtml(safeValue(item.remedy))}</span>
            </div>
          </div>
        `
      }).join("")}
    </div>
  `
}

function renderComplaintDetails(items) {
  if (!Array.isArray(items) || !items.length) {
    return `<div class="empty-copy">No complaint detail available.</div>`
  }

  return `
    <div class="detail-grid">
      ${items.map(item => `
        <div class="detail-card">
          <div class="mini-label">Complaint Component</div>
          <div class="detail-title">${escapeHtml(safeValue(item.component))}</div>
          <div class="detail-copy">${escapeHtml(safeValue(item.summary))}</div>
          <div class="meta-row">
            <span><strong>Date:</strong> ${escapeHtml(safeValue(item.date))}</span>
          </div>
          <div class="meta-row">
            <span><strong>Mileage:</strong> ${escapeHtml(safeValue(item.mileage))}</span>
          </div>
        </div>
      `).join("")}
    </div>
  `
}

function renderInvestigations(items) {
  if (!Array.isArray(items) || !items.length) {
    return `<div class="empty-copy">No matching investigation records were surfaced for this vehicle profile.</div>`
  }

  return `
    <div class="detail-grid">
      ${items.map(item => `
        <div class="detail-card">
          <div class="mini-label">Action Number</div>
          <div class="detail-title">${escapeHtml(safeValue(item.actionNumber, "Recorded"))}</div>
          <div class="detail-sub">${escapeHtml(safeValue(item.component))}</div>
          <div class="detail-copy">${escapeHtml(safeValue(item.summary))}</div>
          <div class="meta-row">
            <span><strong>Opened:</strong> ${escapeHtml(safeValue(item.dateOpened))}</span>
          </div>
          <div class="meta-row">
            <span><strong>Status:</strong> ${escapeHtml(safeValue(item.status))}</span>
          </div>
        </div>
      `).join("")}
    </div>
  `
}

async function getReport(vin) {
  const url = `${API_BASE}/api/decode/${encodeURIComponent(vin)}`;
  console.log("Fetching report from internal API:", url);

  try {
    const response = await fetch(url);

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Could not retrieve backend intelligence report. Status: ${response.status}. Body: ${body}`);
    }

    const data = await response.json();

    if (!data.success || !data.report) {
      throw new Error("Backend returned an invalid report");
    }

    return data.report;
  } catch (err) {
    console.error("Internal report fetch failed:", err);
    throw err;
  }
}

async function createCheckoutSession(vin, sourcePage = "") {
  const cleanVin = sanitizeVin(vin)

  if (cleanVin.length !== 17) {
    throw new Error("Valid 17 character VIN required")
  }

  const cleanSourcePage = String(sourcePage || "").trim()

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
      vin: cleanVin,
      source_page: cleanSourcePage
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
    const sourcePage = String((req.body && req.body.sourcePage) || "").trim()

    if (vin.length !== 17) {
      return res.status(400).json({ error: "Valid 17 character VIN required" })
    }

    const session = await createCheckoutSession(vin, sourcePage)

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

    const teaserCards = [
      "Executive Buyer Verdict",
      "Market Value Analysis",
      "Engine and Platform Advisory",
      "24 Month Risk Forecast",
      "Negotiation Leverage",
      "30,000 Mile Ownership Roadmap"
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
      max-width: 1160px;
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
      line-height: 1.6;
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
      grid-template-columns: repeat(3, 1fr);
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
      font-size: 18px;
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
      font-size: 26px;
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
        <div class="meta">This free VIN scan has completed. Public data and platform analysis found one or more areas that may deserve closer attention before purchase.</div>

        <div class="warning-box">
          <div class="warning-title">${escapeHtml(report.frontEndSummary.headline)}</div>
          <p class="warning-copy">${escapeHtml(report.frontEndSummary.subheadline)}</p>
        </div>

        <div class="scan-list">
          <div class="scan-item">VIN identity verified</div>
          <div class="scan-item">Public recall data checked</div>
          <div class="scan-item">Complaint data reviewed</div>
          <div class="scan-item">Efficiency match attempted</div>
          <div class="scan-item">Ownership platform profiled</div>
          <div class="scan-item">Buyer verdict prepared</div>
        </div>
      </div>

      <div class="card">
        <div class="score-stack">
          <div class="score-box">
            <div class="score-number">${escapeHtml(report.signals.riskLevel)}</div>
            <div class="score-label">Buyer Risk Level ${escapeHtml(report.signals.riskLevel)}</div>
            <div class="score-mini">
              Low means fewer public risk signals were found. Moderate means some issues or ownership concerns deserve closer review. High means stronger public risk signals were found and the vehicle should be inspected very carefully.
            </div>
          </div>

          <div class="confidence-box">
            Coverage Score ${escapeHtml(String(report.signals.coverageScore))} • ${escapeHtml(report.signals.confidenceLevel)}<br>
            <span style="display:block;margin-top:8px;font-size:12px;line-height:1.6;font-weight:600;">
              Coverage Score shows how much usable public data was matched to this VIN and vehicle profile. High Confidence means multiple strong data points matched cleanly. Good Coverage means the report is solid but not complete in every category. Partial Coverage means some datasets matched, but others were limited.
            </span>
          </div>
        </div>
      </div>
    </div>

    <div class="card">
      <h2>Unlocked in the Full Paid Report</h2>
      <div class="meta">The paid report is designed as a full pre purchase intelligence dossier, not just a longer version of this preview.</div>

      <div class="locked-grid">
        ${teaserCards.map(title => `
          <div class="locked-card">
            <div class="label">Premium Section</div>
            <div class="locked-title">${escapeHtml(title)}</div>
            <p class="locked-copy">This section is available after payment and tied to the exact VIN you entered.</p>
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
      <div class="premium-eyebrow">Unlock Full Pre Purchase Intelligence Report</div>
      <div class="premium-title">Turn this free scan into a buyer dossier</div>
      <p class="premium-copy">Unlock the full report to see buyer verdict, market value, recall campaign detail, complaint ranking, engine advisory, risk forecast, negotiation scripts, and a 30,000 mile ownership roadmap.</p>

      <div class="premium-list">
        <div class="premium-item">Executive buyer verdict with public risk summary</div>
        <div class="premium-item">Modeled retail and trade value positioning</div>
        <div class="premium-item">Recall campaign detail and complaint ranking</div>
        <div class="premium-item">Brand specific ownership intelligence</div>
      </div>

      <a class="premium-btn" href="/start-checkout/${encodeURIComponent(vin)}">
        Unlock Full Intelligence Report • $4.99
      </a>
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
    <h1>Building Report</h1>
    <p>Preparing your full pre purchase intelligence report for this VIN.</p>
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

console.log("Customer report requested for VIN:", vin);
console.log("Customer report session_id:", sessionId);
    if (vin.length !== 17) {
      return res.status(400).send("<h1>Invalid VIN</h1><p>Please provide a valid 17 character VIN.</p>")
    }

    const BYPASS_PAYMENT_FOR_TESTING = false

    if (!BYPASS_PAYMENT_FOR_TESTING) {
  console.log("About to verify Stripe session");
  const paidCheck = await verifyPaidSession(sessionId, vin);
  console.log("Paid check result:", paidCheck);

  if (!paidCheck.ok) {
    console.log("Paid check failed, redirecting back to scan page");
    return res.redirect("/scan/" + encodeURIComponent(vin));
  }
}

    console.log("About to fetch full report");
const report = await getReport(vin);
console.log("Full report fetched successfully");

    const riskColors = getRiskColor(report.signals.riskLevel)
    const confidenceColors = getConfidenceColor(report.signals.confidenceLevel)

    const engineFallback = report.vehicle.make === "BMW"
      ? "2.0L TwinPower Turbo I4"
      : (report.ownership.engineLabel || "Manufacturer specific engine configuration")

    const transmissionFallback = report.vehicle.make === "BMW"
      ? "8-Speed ZF Automatic"
      : "Automatic transmission configuration"

    res.send(`
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(report.vehicle.title)} Pre Purchase Intelligence Report</title>
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
      max-width: 1220px;
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
      line-height: 1.7;
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
      margin: 0 0 14px;
      font-size: 24px;
      line-height: 1.2;
    }
    .section-kicker {
      display: inline-block;
      background: #e2e8f0;
      color: #334155;
      padding: 5px 9px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      margin-bottom: 10px;
    }
    .meta {
      font-size: 14px;
      line-height: 1.7;
      color: #64748b;
    }
    .summary-copy {
      font-size: 15px;
      line-height: 1.75;
      color: #334155;
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
    .table-wrap {
      overflow-x: auto;
    }
    .table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 10px;
    }
    .table th,
    .table td {
      padding: 12px 10px;
      text-align: left;
      border-bottom: 1px solid #e2e8f0;
      font-size: 14px;
      vertical-align: top;
    }
    .table th {
      color: #475569;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 14px;
    }
    .grid-3 {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
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
      line-height: 1.7;
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
    .bullet-list {
      margin: 0;
      padding-left: 18px;
    }
    .bullet-list li {
      margin: 0 0 8px;
      color: #334155;
      line-height: 1.65;
      font-size: 14px;
    }
    .empty-copy {
      font-size: 14px;
      color: #64748b;
    }
    .stack-grid,
    .detail-grid,
    .forecast-grid,
    .roadmap-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 14px;
      margin-top: 10px;
    }
    .stack-card,
    .detail-card,
    .forecast-card,
    .roadmap-card {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 16px;
      padding: 16px;
    }
    .stack-title,
    .detail-title,
    .forecast-title,
    .roadmap-title {
      font-size: 18px;
      font-weight: 800;
      color: #0f172a;
      margin-bottom: 8px;
      line-height: 1.3;
    }
    .stack-copy,
    .detail-copy,
    .forecast-copy {
      color: #475569;
      font-size: 14px;
      line-height: 1.7;
    }
    .detail-header {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      align-items: flex-start;
      margin-bottom: 8px;
    }
    .detail-sub {
      font-size: 13px;
      font-weight: 700;
      color: #475569;
      margin-bottom: 10px;
    }
    .meta-row {
      margin-top: 10px;
      font-size: 13px;
      color: #475569;
      line-height: 1.5;
    }
    .mini-label {
      display: inline-block;
      font-size: 11px;
      color: #64748b;
      font-weight: 700;
      text-transform: uppercase;
      margin-bottom: 6px;
      letter-spacing: 0.04em;
    }
    .severity-chip {
      display: inline-flex;
      align-items: center;
      border: 1px solid;
      border-radius: 999px;
      padding: 6px 10px;
      font-size: 11px;
      font-weight: 700;
      white-space: nowrap;
    }
    .forecast-top {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      align-items: center;
      margin-bottom: 10px;
    }
    .risk-chip {
      display: inline-flex;
      align-items: center;
      padding: 6px 10px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 700;
    }
    .risk-chip.high {
      background: #fee2e2;
      color: #991b1b;
    }
    .risk-chip.medium {
      background: #fef3c7;
      color: #92400e;
    }
    .risk-chip.low {
      background: #dcfce7;
      color: #166534;
    }
    .forecast-cost {
      margin-top: 12px;
      font-size: 13px;
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
    @media (max-width: 980px) {
      .top-grid,
      .grid,
      .grid-3,
      .stack-grid,
      .detail-grid,
      .forecast-grid,
      .roadmap-grid,
      .premium-list {
        grid-template-columns: 1fr;
      }
      .hero h1 {
        font-size: 30px;
      }
      .wrap {
        padding: 18px 12px 36px;
      }
    }
      @media print {
  .pdf-download-wrap {
    display: none !important;
  }

  body {
    background: white !important;
  }

  .wrap {
    max-width: 100% !important;
    padding: 0 !important;
  }

  .card,
  .hero,
  .premium-box,
  .item,
  .stack-card,
  .detail-card,
  .forecast-card,
  .roadmap-card {
    box-shadow: none !important;
    break-inside: avoid;
    page-break-inside: avoid;
  }

  a {
    color: inherit !important;
    text-decoration: none !important;
  }
}
  </style>
</head>
<body>
  <div class="wrap">

  <div class="pdf-download-wrap" style="margin: 0 0 18px; display: flex; justify-content: flex-end;">
    <button onclick="window.print()" style="
      background: #0074d4;
      color: #ffffff;
      border: none;
      padding: 12px 18px;
      border-radius: 10px;
      font-size: 14px;
      font-weight: 700;
      cursor: pointer;
    ">
      Download PDF Report
    </button>
  </div>

  <div class="hero">
      <div class="hero-top">
        <div>
          <div class="eyebrow">${escapeHtml(safeValue(report.reportMeta.headline, "PRE PURCHASE INTELLIGENCE REPORT"))}</div>
          <h1>${escapeHtml(report.vehicle.title)}</h1>
          <p class="hero-sub">
            Stock ID: ${escapeHtml(safeValue(report.reportMeta.stockId))}<br>
            VIN: ${escapeHtml(vin)}<br>
            Date: ${escapeHtml(safeValue(report.reportMeta.date))}
          </p>
        </div>
        <div class="status-chip">Unlocked Report</div>
      </div>
    </div>

    <div class="top-grid">
      <div class="card">
        <div class="section-kicker">Executive Verdict</div>
        <h2>${escapeHtml(safeValue(report.buyerVerdict.headline))}</h2>
        <div class="summary-copy">${escapeHtml(safeValue(report.buyerVerdict.summary))}</div>
      </div>

      <div class="card">
        <div class="score-stack">
          <div class="score-box">
            <div class="score-number">${escapeHtml(report.signals.riskLevel)}</div>
            <div class="score-label">Buyer Risk Level ${escapeHtml(report.signals.riskLevel)}</div>
            <div class="score-mini">
              Low means fewer public risk signals were found. Moderate means some issues or ownership concerns deserve closer review. High means stronger public risk signals were found and the vehicle should be inspected very carefully.
            </div>
          </div>

          <div class="confidence-box">
            Coverage Score ${escapeHtml(String(report.signals.coverageScore))} • ${escapeHtml(report.signals.confidenceLevel)}<br>
            <span style="display:block;margin-top:8px;font-size:12px;line-height:1.6;font-weight:600;">
              Coverage Score shows how much usable public data was matched to this VIN and vehicle profile. High Confidence means multiple strong data points matched cleanly. Good Coverage means the report is solid but not complete in every category. Partial Coverage means some datasets matched, but others were limited.
            </span>
          </div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="section-kicker">1. Market Value Analysis</div>
      <h2>Market Value Analysis</h2>
      <div class="meta">${escapeHtml(safeValue(report.marketAnalysis.method))} • ${escapeHtml(safeValue(report.marketAnalysis.valuationDate))}</div>

      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>Condition</th>
              <th>Est. Retail Value</th>
              <th>Est. Trade In</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Excellent</td>
              <td>${money(report.marketAnalysis.retailValues.excellent)}</td>
              <td>${money(report.marketAnalysis.tradeValues.excellent)}</td>
            </tr>
            <tr>
              <td>Good or Clean</td>
              <td>${money(report.marketAnalysis.retailValues.good)}</td>
              <td>${money(report.marketAnalysis.tradeValues.good)}</td>
            </tr>
            <tr>
              <td>Fair or Average</td>
              <td>${money(report.marketAnalysis.retailValues.fair)}</td>
              <td>${money(report.marketAnalysis.tradeValues.fair)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="summary" style="margin-top:14px;"><strong>Analyst Note:</strong> ${escapeHtml(safeValue(report.marketAnalysis.analystNote))}</div>
    </div>

    <div class="card">
      <div class="section-kicker">2. Platform and Engine Advisory</div>
      <h2>${escapeHtml(safeValue(report.engineAdvisory.title))}</h2>
      <div class="summary">${escapeHtml(safeValue(report.engineAdvisory.summary))}</div>
      ${renderAdvisoryItems(report.engineAdvisory.advisoryItems || [])}
    </div>

    <div class="card">
      <div class="section-kicker">3. 24 Month Risk Forecast</div>
      <h2>${escapeHtml(safeValue(report.riskForecast.title))}</h2>
      <div class="summary">${escapeHtml(safeValue(report.riskForecast.summary))}</div>
      ${renderRiskForecastItems(report.riskForecast.items || [])}
    </div>

    <div class="card">
      <div class="section-kicker">4. VIN Identity and Factory Spec</div>
      <h2>VIN Identity and Factory Spec</h2>
      <div class="grid">
        <div class="item"><div class="label">Year</div><div class="value">${escapeHtml(safeValue(report.vehicle.year))}</div></div>
        <div class="item"><div class="label">Make</div><div class="value">${escapeHtml(safeValue(report.vehicle.make))}</div></div>
        <div class="item"><div class="label">Model</div><div class="value">${escapeHtml(safeValue(report.vehicle.model))}</div></div>
        <div class="item"><div class="label">Trim</div><div class="value">${escapeHtml(safeValue(report.vehicle.trim))}</div></div>
        <div class="item"><div class="label">Fuel Type</div><div class="value">${escapeHtml(safeValue(report.vehicle.fuel))}</div></div>
        <div class="item"><div class="label">Drive Type</div><div class="value">${escapeHtml(safeValue(report.vehicle.drive))}</div></div>
        <div class="item"><div class="label">Body Class</div><div class="value">${escapeHtml(safeValue(report.vehicle.body))}</div></div>
        <div class="item"><div class="label">Engine Model</div><div class="value">${escapeHtml(displaySpec(report.vehicle.engine, engineFallback))}</div></div>
        <div class="item"><div class="label">Engine Platform</div><div class="value">${escapeHtml(report.vehicle.enginePlatform || "N/A")}</div></div>
<div class="item"><div class="label">Engine Confidence</div><div class="value">${escapeHtml(report.vehicle.engineConfidence || "N/A")}</div></div>
<div class="item"><div class="label">Engine Risk Level</div><div class="value">${escapeHtml(report.vehicle.engineRiskLevel || "N/A")}</div></div>
<div class="item wide"><div class="label">Engine Risk Note</div><div class="summary">${escapeHtml(report.vehicle.engineRiskNote || "N/A")}</div></div>
<div class="item wide"><div class="label">Engine Summary</div><div class="summary">${escapeHtml(report.vehicle.engineSummary || "N/A")}</div></div>
<div class="item"><div class="label">Transmission Type</div><div class="value">${escapeHtml(report.vehicle.transmissionType || "N/A")}</div></div>
<div class="item"><div class="label">Transmission Risk</div><div class="value">${escapeHtml(report.vehicle.transmissionRisk || "N/A")}</div></div>
<div class="item wide"><div class="label">Transmission Summary</div><div class="summary">${escapeHtml(report.vehicle.transmissionSummary || "N/A")}</div></div>
<div class="item"><div class="label">Mechanical Risk Level</div><div class="value">${escapeHtml(report.vehicle.mechanicalRiskLevel || "N/A")}</div></div>
<div class="item wide"><div class="label">Mechanical Risk Summary</div><div class="summary">${escapeHtml(report.vehicle.mechanicalRiskSummary || "N/A")}</div></div>
        <div class="item"><div class="label">WMI</div><div class="value">${escapeHtml(safeValue(report.vehicle.wmi))}</div></div>
        <div class="item"><div class="label">Plant Country</div><div class="value">${escapeHtml(safeValue(report.vehicle.plantCountry))}</div></div>
        <div class="item"><div class="label">Series</div><div class="value">${escapeHtml(safeValue(report.vehicle.series))}</div></div>
        <div class="item"><div class="label">Manufacturer</div><div class="value">${escapeHtml(safeValue(report.vehicle.manufacturer))}</div></div>
      </div>
    </div>

    <div class="card">
      <div class="section-kicker">5. Safety and Reliability Signals</div>
      <h2>Safety and Reliability Signals</h2>
      <div class="grid">
        <div class="item"><div class="label">Recall Count</div><div class="value">${escapeHtml(String(report.safety.recalls || 0))}</div></div>
        <div class="item"><div class="label">Complaint Count</div><div class="value">${escapeHtml(String(report.safety.complaints || 0))}</div></div>
        <div class="item"><div class="label">Top Complaint Area</div><div class="value">${escapeHtml(safeValue(report.safety.topComponent))}</div></div>
        <div class="item"><div class="label">Complaint Data Status</div><div class="value">${report.safety.dataAvailable ? "Available" : "Unavailable"}</div></div>
        <div class="item wide"><div class="label">Recall Summary</div><div class="summary">${escapeHtml(safeValue(report.safety.recallSummary))}</div></div>
        <div class="item wide"><div class="label">Complaint Summary</div><div class="summary">${escapeHtml(safeValue(report.safety.complaintSummary))}</div></div>
      </div>
    </div>

    <div class="card">
      <div class="section-kicker">6. Recall Campaign Detail</div>
      <h2>Recall Campaign Detail</h2>
      ${renderRecallDetails(report.safety.recallDetails || [])}
    </div>

    <div class="card">
      <div class="section-kicker">7. Complaint Intelligence</div>
      <h2>Complaint Component Ranking</h2>
      ${renderComplaintComponents(report.safety.complaintComponents || [])}
      <div style="margin-top:18px;"></div>
      <h2 style="font-size:20px;">Complaint Detail</h2>
      ${renderComplaintDetails(report.safety.complaintDetails || [])}
    </div>

    <div class="card">
      <div class="section-kicker">8. Safety Investigations</div>
      <h2>Safety Investigations</h2>
      ${renderInvestigations(report.investigations.items || [])}
    </div>

    <div class="card">
      <div class="section-kicker">9. Efficiency and Running Cost</div>
      <h2>Efficiency and Running Cost</h2>
      <div class="grid">
        <div class="item"><div class="label">Combined MPG</div><div class="value">${escapeHtml(safeValue(report.efficiency.combinedMPG))}</div></div>
        <div class="item"><div class="label">Annual Fuel Cost</div><div class="value">${escapeHtml(safeValue(report.efficiency.annualFuelCost))}</div></div>
        <div class="item"><div class="label">GHG Score</div><div class="value">${escapeHtml(safeValue(report.efficiency.ghgScore))}</div></div>
        <div class="item"><div class="label">Eco Badge</div><div class="value">${escapeHtml(safeValue(report.efficiency.ecoBadge))}</div></div>
        <div class="item wide"><div class="label">Efficiency Summary</div><div class="summary">${escapeHtml(safeValue(report.efficiency.efficiencySummary))}</div></div>
      </div>
    </div>

    <div class="card">
      <div class="section-kicker">10. Additional Vehicle Specs</div>
      <h2>Additional Vehicle Specs</h2>
      <div class="grid">
        <div class="item"><div class="label">Horsepower</div><div class="value">${escapeHtml(safeValue(report.specs.horsepower))}</div></div>
        <div class="item"><div class="label">Transmission</div><div class="value">${escapeHtml(displaySpec(report.specs.transmission, transmissionFallback))}</div></div>
        <div class="item"><div class="label">Dimensions</div><div class="value">${escapeHtml(safeValue(report.specs.dimensions))}</div></div>
        <div class="item"><div class="label">Curb Weight</div><div class="value">${escapeHtml(safeValue(report.specs.curbWeight))}</div></div>
      </div>
    </div>

    <div class="card">
      <div class="section-kicker">11. Model Specific Ownership Intelligence</div>
      <h2>${escapeHtml(safeValue(report.ownership.sectionTitle))}</h2>
      <div class="grid">
        <div class="item"><div class="label">Brand Focus</div><div class="value">${escapeHtml(safeValue(report.ownership.brandFocus))}</div></div>
        <div class="item"><div class="label">Platform</div><div class="value">${escapeHtml(safeValue(report.ownership.platform))}</div></div>
        <div class="item"><div class="label">Engine Platform</div><div class="value">${escapeHtml(safeValue(report.ownership.enginePlatform))}</div></div>
        <div class="item"><div class="label">Maintenance Complexity</div><div class="value">${escapeHtml(safeValue(report.ownership.maintenanceComplexity))}</div></div>
        <div class="item"><div class="label">Complaint Level</div><div class="value">${escapeHtml(safeValue(report.ownership.complaintLevel))}</div></div>
        <div class="item"><div class="label">Engine Confidence</div><div class="value">${escapeHtml(safeValue(report.ownership.engineConfidence))}</div></div>
        <div class="item wide"><div class="label">Platform Summary</div><div class="summary">${escapeHtml(safeValue(report.ownership.platformSummary))}</div></div>
        <div class="item wide"><div class="label">Ownership Advice</div><div class="summary">${escapeHtml(safeValue(report.ownership.ownershipAdvice))}</div></div>
        <div class="item wide"><div class="label">Common Problem Areas</div>${renderList(report.ownership.commonIssues || [])}</div>
        <div class="item wide"><div class="label">What To Check Before Buying</div>${renderList(report.ownership.inspectionChecks || [])}</div>
        <div class="item wide"><div class="label">Most Likely Expensive Failure Areas</div>${renderList(report.ownership.expensiveFailureAreas || [])}</div>
        <div class="item wide"><div class="label">Test Drive Checks</div>${renderList(report.ownership.testDriveChecks || [])}</div>
      </div>
    </div>

    <div class="card">
      <div class="section-kicker">12. Option Probability Profile</div>
      <h2>Likely Factory Option Profile</h2>
      <div class="summary" style="margin-bottom:14px;">
        These percentages estimate the likelihood that this vehicle has each option or package, based on sold vehicle patterns, trim positioning, drivetrain, body style, and comparable market data. This is a probability model, not a factory build confirmation.
      </div>
      <div class="grid-3">
        <div class="item">
          <div class="label">${escapeHtml(safeValue(report.optionProfile.sport?.label, "Sport Package"))}</div>
          <div class="value">${escapeHtml(String(report.optionProfile.sport?.probability || "N/A"))}%</div>
        </div>
        <div class="item">
          <div class="label">${escapeHtml(safeValue(report.optionProfile.comfort?.label, "Comfort Package"))}</div>
          <div class="value">${escapeHtml(String(report.optionProfile.comfort?.probability || "N/A"))}%</div>
        </div>
        <div class="item">
          <div class="label">${escapeHtml(safeValue(report.optionProfile.tech?.label, "Technology Package"))}</div>
          <div class="value">${escapeHtml(String(report.optionProfile.tech?.probability || "N/A"))}%</div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="section-kicker">13. Negotiation Leverage</div>
      <h2>${escapeHtml(safeValue(report.negotiationLeverage.title))}</h2>
      <div class="summary">${escapeHtml(safeValue(report.negotiationLeverage.summary))}</div>
      ${renderNegotiationItems(report.negotiationLeverage.items || [])}
    </div>

    <div class="card">
      <div class="section-kicker">14. 30,000 Mile Ownership Roadmap</div>
      <h2>${escapeHtml(safeValue(report.ownershipRoadmap.title))}</h2>
      <div class="summary">${escapeHtml(safeValue(report.ownershipRoadmap.summary))}</div>
      ${renderRoadmap(report.ownershipRoadmap.intervals || [])}
    </div>

    <div class="card">
      <div class="section-kicker">15. Final Purchase Checklist</div>
      <h2>${escapeHtml(safeValue(report.purchaseChecklist.title))}</h2>
      ${renderSimpleBullets(report.purchaseChecklist.items || [])}
    </div>

    <div class="premium-box">
      <div class="premium-eyebrow">Global Vehicle History Check</div>
      <div class="premium-title">Need deeper title and accident history?</div>
      <p class="premium-copy">This report focuses on public safety, specification, efficiency, and ownership intelligence. For deeper title brands, accident databases, salvage history, mileage anomalies, and auction records where available, run a wider history check below.</p>

      <div class="premium-list">
        <div class="premium-item">Global accident and damage databases</div>
        <div class="premium-item">Title and branding related history</div>
        <div class="premium-item">Mileage anomaly checks</div>
        <div class="premium-item">Auction and ownership history signals</div>
      </div>

      <a class="premium-btn" href="https://www.carvertical.com/landing/v3?a=677d85351acf8&b=14f83321&voucher=checkyourspec&utm_medium=aff" target="_blank" rel="noopener">
        Run Global History Check
      </a>
    </div>
  </div>
</body>
</html>
    `)
  } catch (error) {
  console.error("Customer report route failed full object:", error);
  console.error("Customer report route failed message:", error?.message);
  console.error("Customer report route failed cause:", error?.cause);

  res.status(500).send(`<h1>Error generating customer report</h1><p>${escapeHtml(String(error.message || error))}</p>`)
}
})
app.get("/debug-internal-decode/:vin", async (req, res) => {
  try {
    const vin = sanitizeVin(req.params.vin);
    const url = `${API_BASE}/api/decode/${encodeURIComponent(vin)}`;

    console.log("DEBUG internal decode URL:", url);

    const response = await fetch(url);
    const text = await response.text();

    res.status(response.status).send(text);
  } catch (error) {
  console.error("DEBUG internal decode failed full object:", error);
  console.error("DEBUG internal decode failed message:", error?.message);
  console.error("DEBUG internal decode failed cause:", error?.cause);

  res.status(500).send(`
    <pre>
message: ${String(error?.message || error)}
cause: ${String(error?.cause || "none")}
stack: ${String(error?.stack || "no stack")}
    </pre>
  `);
}
});

app.get("/which-backend", (req, res) => {
  res.json({
    ok: true,
    backend: "server-visual.js"
  });
});

app.get("/api/decode-test/:vin", async (req, res) => {
  try {
    const vin = String(req.params.vin || "").trim().toUpperCase();
    const url = `${API_BASE}/api/decode/${encodeURIComponent(vin)}`;

    const response = await fetch(url);
    const text = await response.text();

    res.status(response.status);
    res.setHeader("Content-Type", "application/json");
    res.send(text);
  } catch (err) {
    console.error("decode-test proxy failed:", err);
    res.status(500).json({
      ok: false,
      error: "Proxy failed"
    });
  }
});

app.listen(PORT, () => {
  console.log("Customer visual report server running on port " + PORT)
})