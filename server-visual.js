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

function renderPills(items) {
  if (!Array.isArray(items) || !items.length) {
    return `<div class="empty-copy">No additional items were returned.</div>`
  }

  return `
    <div class="pill-wrap">
      ${items.map(item => `<span class="pill">${escapeHtml(item)}</span>`).join("")}
    </div>
  `
}

function renderKeyValueGrid(items) {
  return `
    <div class="grid">
      ${items.map(item => `
        <div class="item ${item.wide ? "wide" : ""}">
          <div class="label">${escapeHtml(item.label)}</div>
          <div class="${item.summary ? "summary" : "value"}">${escapeHtml(item.value)}</div>
        </div>
      `).join("")}
    </div>
  `
}

function renderDetailCards(items, type) {
  if (!Array.isArray(items) || !items.length) {
    return `<div class="empty-copy">No records were returned for this section.</div>`
  }

  if (type === "recalls") {
    return `
      <div class="stack-list">
        ${items.map(item => `
          <div class="detail-card">
            <div class="detail-top">
              <div>
                <div class="detail-title">${escapeHtml(safeValue(item.component, "Recall Item"))}</div>
                <div class="detail-meta">
                  Campaign ${escapeHtml(safeValue(item.campaignNumber, "N/A"))}
                  •
                  ${escapeHtml(safeValue(item.severity, "General Attention"))}
                </div>
              </div>
              <div class="chip">${escapeHtml(safeValue(item.reportDate, "Date unavailable"))}</div>
            </div>
            <div class="detail-copy">${escapeHtml(safeValue(item.summary, "Recall details available."))}</div>
            ${item.remedy && item.remedy !== "N/A" ? `<div class="detail-copy detail-remedy"><strong>Remedy:</strong> ${escapeHtml(item.remedy)}</div>` : ""}
          </div>
        `).join("")}
      </div>
    `
  }

  if (type === "complaints") {
    return `
      <div class="stack-list">
        ${items.map(item => `
          <div class="detail-card">
            <div class="detail-top">
              <div>
                <div class="detail-title">${escapeHtml(safeValue(item.component, "Complaint Record"))}</div>
                <div class="detail-meta">
                  ${escapeHtml(safeValue(item.date, "Date unavailable"))}
                  ${item.mileage && item.mileage !== "N/A" ? ` • ${escapeHtml(item.mileage)} miles` : ""}
                </div>
              </div>
            </div>
            <div class="detail-copy">${escapeHtml(safeValue(item.summary, "Complaint record present."))}</div>
          </div>
        `).join("")}
      </div>
    `
  }

  if (type === "investigations") {
    return `
      <div class="stack-list">
        ${items.map(item => `
          <div class="detail-card">
            <div class="detail-top">
              <div>
                <div class="detail-title">${escapeHtml(safeValue(item.component, "Safety Investigation"))}</div>
                <div class="detail-meta">
                  ${escapeHtml(safeValue(item.actionNumber, "Reference unavailable"))}
                  •
                  ${escapeHtml(safeValue(item.status, "Recorded"))}
                </div>
              </div>
              <div class="chip">${escapeHtml(safeValue(item.dateOpened, "Date unavailable"))}</div>
            </div>
            <div class="detail-copy">${escapeHtml(safeValue(item.summary, "Investigation record present."))}</div>
          </div>
        `).join("")}
      </div>
    `
  }

  return `<div class="empty-copy">No records were returned for this section.</div>`
}

function renderRankedComponents(items) {
  if (!Array.isArray(items) || !items.length) {
    return `<div class="empty-copy">No component ranking data was returned.</div>`
  }

  return `
    <div class="rank-grid">
      ${items.map(item => `
        <div class="rank-card">
          <div class="rank-label">${escapeHtml(safeValue(item.component, "Unknown Component"))}</div>
          <div class="rank-value">${escapeHtml(String(item.count || 0))}</div>
        </div>
      `).join("")}
    </div>
  `
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

function buildPublicScanPage(vin, report) {
  const riskColors = getRiskColor(report.signals.riskLevel)
  const confidenceColors = getConfidenceColor(report.signals.confidenceLevel)
  const triggeredCount = Array.isArray(report.signals.attentionFlags) ? report.signals.attentionFlags.length : 0

  const teaserCards = [
    "Executive Buyer Verdict",
    "Recall Campaign Detail",
    "Complaint Pattern Breakdown",
    "Investigation History",
    "High Cost Failure Areas",
    "Test Drive Checklist"
  ]

  return `
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
    .item {
      background: #f8fafc;
      border: 1px solid #eef2f7;
      border-radius: 16px;
      padding: 16px;
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
    .locked-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 14px;
      margin-top: 16px;
    }
    .locked-card {
      background: linear-gradient(180deg, #fffaf0, #fff7ed);
      border: 1px solid #fed7aa;
      border-radius: 16px;
      padding: 18px;
      position: relative;
      overflow: hidden;
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
      grid-template-columns: repeat(3, 1fr);
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
        <div class="meta">This free VIN scan completed successfully and found signals worth reviewing before purchase.</div>

        <div class="warning-box">
          <div class="warning-title">${escapeHtml(report.frontEndSummary.headline)}</div>
          <p class="warning-copy">${escapeHtml(report.frontEndSummary.subheadline)}</p>
        </div>

        <div class="scan-list">
          <div class="scan-item">Risk Level: ${escapeHtml(safeValue(report.signals.riskLevel))}</div>
          <div class="scan-item">Recalls: ${escapeHtml(String(report.safety.recalls || 0))}</div>
          <div class="scan-item">Complaints: ${escapeHtml(String(report.safety.complaints || 0))}</div>
          <div class="scan-item">Top Issue: ${escapeHtml(safeValue(report.safety.topComponent, "Not identified"))}</div>
          <div class="scan-item">Maintenance: ${escapeHtml(safeValue(report.ownership.maintenanceComplexity, "Moderate"))}</div>
          <div class="scan-item">Fuel Match: ${report.efficiency.combinedMPG ? "Matched" : "Unavailable"}</div>
        </div>
      </div>

      <div class="card">
        <div class="score-stack">
          <div class="score-box">
            <div class="score-number">${escapeHtml(report.signals.riskLevel)}</div>
            <div class="score-label">Buyer Risk Status</div>
            <div class="score-mini">${triggeredCount} public and modeled signal${triggeredCount === 1 ? "" : "s"} detected</div>
          </div>

          <div class="confidence-box">
            ${escapeHtml(report.signals.confidenceLevel)} • Score ${escapeHtml(String(report.signals.coverageScore))}
          </div>
        </div>
      </div>
    </div>

    <div class="card">
      <h2>Vehicle Identity</h2>
      ${renderKeyValueGrid([
        { label: "Year", value: safeValue(report.vehicle.year) },
        { label: "Make", value: safeValue(report.vehicle.make) },
        { label: "Model", value: safeValue(report.vehicle.model) },
        { label: "Trim", value: safeValue(report.vehicle.trim) },
        { label: "Fuel", value: safeValue(report.vehicle.fuel) },
        { label: "Drive", value: safeValue(report.vehicle.drive) }
      ])}
    </div>

    <div class="card">
      <h2>What unlocks in the full report</h2>
      <div class="meta">The paid report turns this preview into a full buyer dossier tied to the exact VIN you entered.</div>

      <div class="locked-grid">
        ${teaserCards.map(title => `
          <div class="locked-card">
            <div class="label">Unlocked After Payment</div>
            <div class="locked-title">${escapeHtml(title)}</div>
            <p class="locked-copy">Deeper buyer context, full detail, and expanded ownership guidance are hidden until the report is unlocked.</p>
          </div>
        `).join("")}
      </div>
    </div>

    <div class="premium-box">
      <div class="premium-eyebrow">Unlock Full Buyer Dossier</div>
      <div class="premium-title">See the full recall, complaint, and ownership intelligence</div>
      <p class="premium-copy">Unlock the complete VIN linked report to reveal campaign level recall detail, complaint breakdowns, investigations, failure areas, test drive checks, and model specific ownership guidance.</p>

      <div class="premium-list">
        <div class="premium-item">Executive buyer verdict</div>
        <div class="premium-item">Recall campaign detail cards</div>
        <div class="premium-item">Complaint component rankings</div>
        <div class="premium-item">Safety investigation matches</div>
        <div class="premium-item">High cost failure areas</div>
        <div class="premium-item">Brand specific ownership guidance</div>
      </div>

      <a class="premium-btn" href="/start-checkout/${encodeURIComponent(vin)}">
        Unlock Full Intelligence Report • $4.99
      </a>

      <div class="mini-note">One time payment. The unlocked report is tied to this VIN.</div>
    </div>
  </div>
</body>
</html>
  `
}

function buildPaidCustomerPage(vin, report) {
  const riskColors = getRiskColor(report.signals.riskLevel)
  const confidenceColors = getConfidenceColor(report.signals.confidenceLevel)
  const attentionFlags = Array.isArray(report.signals.attentionFlags) ? report.signals.attentionFlags : []

  return `
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
    .stack-list {
      display: grid;
      gap: 14px;
    }
    .detail-card {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 16px;
      padding: 16px;
    }
    .detail-top {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: flex-start;
      flex-wrap: wrap;
      margin-bottom: 10px;
    }
    .detail-title {
      font-size: 18px;
      font-weight: 800;
      color: #0f172a;
      margin-bottom: 4px;
    }
    .detail-meta {
      font-size: 12px;
      color: #64748b;
      line-height: 1.5;
    }
    .detail-copy {
      font-size: 14px;
      color: #334155;
      line-height: 1.7;
    }
    .detail-remedy {
      margin-top: 10px;
    }
    .chip {
      display: inline-flex;
      align-items: center;
      padding: 7px 11px;
      border-radius: 999px;
      background: #e2e8f0;
      font-size: 12px;
      font-weight: 700;
      color: #334155;
      white-space: nowrap;
    }
    .rank-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
    }
    .rank-card {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 14px;
      padding: 14px;
    }
    .rank-label {
      font-size: 12px;
      color: #64748b;
      line-height: 1.45;
      margin-bottom: 8px;
      min-height: 34px;
    }
    .rank-value {
      font-size: 26px;
      font-weight: 800;
      color: #0f172a;
    }
    .section-band {
      background: linear-gradient(135deg, #f8fbff, #f1f5f9);
      border: 1px solid #dbeafe;
      border-radius: 22px;
      padding: 22px;
      margin-bottom: 22px;
    }
    .section-band h2 {
      margin: 0 0 10px;
      font-size: 22px;
    }
    .section-band .meta {
      margin-bottom: 16px;
    }
    .history-box {
      background: linear-gradient(135deg, #111827, #1f2937);
      color: white;
      border-radius: 22px;
      padding: 24px;
      box-shadow: 0 12px 30px rgba(15, 23, 42, 0.18);
      margin-top: 22px;
    }
    .history-eyebrow {
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
    .history-title {
      font-size: 24px;
      font-weight: 800;
      margin: 0 0 10px;
    }
    .history-copy {
      color: #cbd5e1;
      font-size: 14px;
      line-height: 1.7;
      margin: 0 0 18px;
    }
    .history-list {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 12px;
      margin-bottom: 18px;
    }
    .history-item {
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 16px;
      padding: 14px;
      color: #f8fafc;
      font-size: 14px;
      line-height: 1.5;
      font-weight: 700;
    }
    .history-btn {
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
      .top-grid, .grid, .rank-grid, .history-list {
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
        <h2>Executive Buyer Verdict</h2>
        <div class="summary">${escapeHtml(safeValue(report.buyerVerdict.headline, "Buyer verdict unavailable"))}</div>
        <div class="meta" style="margin-top:10px;">${escapeHtml(safeValue(report.buyerVerdict.summary, "No additional verdict summary was returned."))}</div>
        <div style="margin-top:16px;">${renderPills(attentionFlags)}</div>
      </div>

      <div class="card">
        <div class="score-stack">
          <div class="score-box">
            <div class="score-number">${escapeHtml(safeValue(report.signals.riskLevel))}</div>
            <div class="score-label">Buyer Risk Level</div>
            <div class="score-mini">Public safety, complaint, efficiency, and ownership signals synthesized into one verdict.</div>
          </div>

          <div class="confidence-box">
            Coverage Score ${escapeHtml(String(report.signals.coverageScore || 0))} • ${escapeHtml(safeValue(report.signals.confidenceLevel))}
          </div>
        </div>
      </div>
    </div>

    <div class="card">
      <h2>VIN Identity and Factory Spec</h2>
      ${renderKeyValueGrid([
        { label: "Year", value: safeValue(report.vehicle.year) },
        { label: "Make", value: safeValue(report.vehicle.make) },
        { label: "Model", value: safeValue(report.vehicle.model) },
        { label: "Trim", value: safeValue(report.vehicle.trim) },
        { label: "Fuel Type", value: safeValue(report.vehicle.fuel) },
        { label: "Drive Type", value: safeValue(report.vehicle.drive) },
        { label: "Body Class", value: safeValue(report.vehicle.body) },
        { label: "Engine", value: safeValue(report.vehicle.engine) },
        { label: "WMI", value: safeValue(report.vehicle.wmi) },
        { label: "Plant Country", value: safeValue(report.vehicle.plantCountry) },
        { label: "Manufacturer", value: safeValue(report.vehicle.manufacturer) },
        { label: "Series", value: safeValue(report.vehicle.series) }
      ])}
    </div>

    <div class="card">
      <h2>Safety and Reliability Summary</h2>
      ${renderKeyValueGrid([
        { label: "Recall Count", value: String(report.safety.recalls || 0) },
        { label: "Complaint Count", value: String(report.safety.complaints || 0) },
        { label: "Top Complaint Area", value: safeValue(report.safety.topComponent, "Not identified") },
        { label: "Complaint Data", value: report.safety.dataAvailable ? "Available" : "Unavailable" },
        { label: "Recall Summary", value: safeValue(report.safety.recallSummary), summary: true, wide: true },
        { label: "Complaint Summary", value: safeValue(report.safety.complaintSummary), summary: true, wide: true }
      ])}
    </div>

    <div class="section-band">
      <h2>Recall Campaign Detail</h2>
      <div class="meta">Campaign level recall cards for this exact model year, make, and model profile.</div>
      ${renderDetailCards(report.safety.recallDetails, "recalls")}
    </div>

    <div class="section-band">
      <h2>Complaint Intelligence</h2>
      <div class="meta">Component clustering and complaint records help show where owner reported issues are concentrated.</div>
      ${renderRankedComponents(report.safety.complaintComponents)}
      <div style="height:16px;"></div>
      ${renderDetailCards(report.safety.complaintDetails, "complaints")}
    </div>

    <div class="section-band">
      <h2>Safety Investigation Matches</h2>
      <div class="meta">${escapeHtml(safeValue(report.investigations.summary, "No investigation summary returned."))}</div>
      ${renderDetailCards(report.investigations.items, "investigations")}
    </div>

    <div class="card">
      <h2>Efficiency and Running Cost</h2>
      ${renderKeyValueGrid([
        { label: "Combined MPG", value: safeValue(report.efficiency.combinedMPG) },
        { label: "Annual Fuel Cost", value: safeValue(report.efficiency.annualFuelCost) },
        { label: "Greenhouse Gas Score", value: safeValue(report.efficiency.ghgScore) },
        { label: "Eco Badge", value: safeValue(report.efficiency.ecoBadge) },
        { label: "Efficiency Summary", value: safeValue(report.efficiency.efficiencySummary), summary: true, wide: true }
      ])}
    </div>

    <div class="card">
      <h2>Specifications</h2>
      ${renderKeyValueGrid([
        { label: "Horsepower", value: safeValue(report.specs.horsepower) },
        { label: "Transmission", value: safeValue(report.specs.transmission) },
        { label: "Dimensions", value: safeValue(report.specs.dimensions) },
        { label: "Curb Weight", value: safeValue(report.specs.curbWeight) },
        { label: "Weight Class", value: safeValue(report.specs.weightClass) }
      ])}
    </div>

    <div class="card">
      <h2>${escapeHtml(safeValue(report.ownership.sectionTitle, "Model Specific Ownership Intelligence"))}</h2>
      ${renderKeyValueGrid([
        { label: "Brand Focus", value: safeValue(report.ownership.brandFocus) },
        { label: "Generation", value: safeValue(report.ownership.generation) },
        { label: "Engine Platform", value: safeValue(report.ownership.enginePlatform) },
        { label: "Likely Engine", value: safeValue(report.ownership.engineLabel) },
        { label: "Engine Confidence", value: safeValue(report.ownership.engineConfidence) },
        { label: "Maintenance Complexity", value: safeValue(report.ownership.maintenanceComplexity) },
        { label: "Complaint Level", value: safeValue(report.ownership.complaintLevel) },
        { label: "Generation Summary", value: safeValue(report.ownership.generationSummary), summary: true, wide: true },
        { label: "Ownership Advice", value: safeValue(report.ownership.ownershipAdvice), summary: true, wide: true }
      ])}
      <div style="height:16px;"></div>
      <div class="label">Common Problem Areas</div>
      ${renderPills(report.ownership.commonIssues)}
      <div style="height:16px;"></div>
      <div class="label">What To Check Before Buying</div>
      ${renderPills(report.ownership.inspectionChecks)}
      <div style="height:16px;"></div>
      <div class="label">Most Likely Expensive Failure Areas</div>
      ${renderPills(report.ownership.expensiveFailureAreas)}
      <div style="height:16px;"></div>
      <div class="label">What Matters On A Test Drive</div>
      ${renderPills(report.ownership.testDriveChecks)}
    </div>

    <div class="card">
      <h2>Likely Factory Option Profile</h2>
      ${renderKeyValueGrid([
        { label: safeValue(report.optionProfile?.sport?.label, "Sport Package"), value: `${safeValue(report.optionProfile?.sport?.probability, "N/A")}%` },
        { label: safeValue(report.optionProfile?.comfort?.label, "Comfort Package"), value: `${safeValue(report.optionProfile?.comfort?.probability, "N/A")}%` },
        { label: safeValue(report.optionProfile?.tech?.label, "Technology Package"), value: `${safeValue(report.optionProfile?.tech?.probability, "N/A")}%` }
      ])}
    </div>

    <div class="history-box">
      <div class="history-eyebrow">Deeper History Layer</div>
      <div class="history-title">Need title, damage, auction, or mileage history too?</div>
      <p class="history-copy">This intelligence report focuses on decoded identity, public safety data, efficiency data, and ownership context. For deeper title brands, salvage, theft, odometer, auction, and damage related history, run a dedicated history check.</p>

      <div class="history-list">
        <div class="history-item">Accident and damage databases</div>
        <div class="history-item">Title brand and salvage signals</div>
        <div class="history-item">Mileage anomaly checks</div>
        <div class="history-item">Auction and ownership history</div>
      </div>

      <a class="history-btn" href="https://www.carvertical.com/landing/v3?a=677d85351acf8&b=14f83321&voucher=checkyourspec&utm_medium=aff" target="_blank" rel="noopener">
        Run Global History Check
      </a>
    </div>
  </div>
</body>
</html>
  `
}

app.get("/", (req, res) => {
  res.send(`<h1>Customer visual report server running</h1><p>Try /scan/YOURVINHERE</p>`)
})

app.get("/api/health", (req, res) => {
  res.json({ status: "visual server running" })
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

    const report = await getReport(vin)

    return res.json({
      success: true,
      vin,
      report
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Something went wrong while decoding the VIN",
      error: String(error.message || error)
    })
  }
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
    return res.send(buildPublicScanPage(vin, report))
  } catch (error) {
    return res.status(500).send(`<h1>Error generating scan preview</h1><p>${escapeHtml(String(error.message || error))}</p>`)
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
    <p>Building your full buyer dossier and preparing the unlocked report.</p>
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
    return res.status(500).send(`<h1>Processing error</h1><p>${escapeHtml(String(error.message || error))}</p>`)
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
    return res.send(buildPaidCustomerPage(vin, report))
  } catch (error) {
    return res.status(500).send(`<h1>Error generating customer report</h1><p>${escapeHtml(String(error.message || error))}</p>`)
  }
})

app.listen(PORT, () => {
  console.log("Customer visual report server running on port " + PORT)
})