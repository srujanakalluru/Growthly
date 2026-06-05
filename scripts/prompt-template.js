/**
 * PROMPT TEMPLATE for the medical-analysis report.
 *
 * WHAT TO EDIT:
 *   - PERSONA .......... the assistant's role/tone.
 *   - taskGuide() ...... WHAT each report block should say (analysis content).
 *
 * WHAT NOT TO EDIT (unless you also change the dashboard CSS):
 *   - HTML_FORMAT_RULES ... HTML structure/styling spec (div/table/badge
 *     classes, inline-CSS chart). Changing these can break rendering.
 *   - The block keys (block_*) and their wrapper colour classes — the app keys
 *     off these, so renaming/removing breaks the dashboard.
 *
 * The data section (metrics, tables) is assembled in generate-inferences.js and
 * injected between PERSONA and taskGuide() at build time.
 */

const PERSONA = `You are a pediatric medical AI assistant analyzing feeding and growth data for an infant. Your tone is clinical, evidence-based, thorough, and professional.`;

// -- Analysis content (editable): what each block should contain -------------
function taskGuide(babyConfig) {
  return `# TASK
Return a valid JSON object of clinical inference blocks for a medical report. Each value is an escaped HTML string. Every block must be medically accurate and specific to the infant data provided.

# RULES
- Base analysis primarily on the last 14 days; use weekly rolling averages for trends; reference historical data for progress.
- Use the latest anthropometrics for current status. Use session-level detail for specific, actionable guidance.
- Use ONLY the data provided above (metrics, tables, medical context, neonatal/feeding history). Never invent data.
- Dates format: "6th Jan 2026".
- A 0 ml slot = a SKIPPED session (genuine missed pump), never a logging gap — advise accordingly.
- Measurement tables (Weight Trajectory, Z-Score History, Velocity by Interval): at most ONE measurement per completed week; if several fall within 7 days, keep the latest and recompute interval velocities (g/week) between kept rows.
- Metric usage: acceleration → predict trajectory/intervention timing; recovery rate → supply stability; hunger predictability → feeding strategy; velocity adequacy → distinguish catch-up vs concerning deceleration; z-score → emphasise direction and category, not a single percentile.
- Solids: only if the medical context mentions them. Treat as exploratory — NOT a way to cut formula or fill feeding gaps. Assess nutritional value and suggest the next best solid.

${(() => {
  const bd = babyConfig.birthDate;
  const phaseDate = (m) =>
    new Date(bd.getFullYear(), bd.getMonth() + m, bd.getDate())
      .toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const months = [5, 6, 7, 8, 9, 10, 11, 12, 13, 15, 18, 21, 24];
  return `Phase Calendar (from birth date ${babyConfig.birthDateString}) — use these exact dates as Start Date in block_pump_reduction:\n` +
    months.map((m) => `M${m}: ${phaseDate(m)}`).join(' · ');
})()}

# OUTPUT
Return ONLY a JSON object with the keys below (escaped HTML values). Do NOT start any block with h2/h3/h4 — the page already prints each block's title; an <h5> is allowed only for a sub-section inside a block.

Each block lists: purpose; what to Include; Wrap (mandatory wrapper class); and required badges/tables/cards. Honour every Wrap class and badge name exactly.

1. block_executive_summary — Overall status; feeding mechanics vs supply; major changes from weekly trends.
2. block_daily_production — Lactation status from recent 14-day avg, median, range, stability.
3. block_production_consumption — Production-consumption balance with specific recent numbers.
4. block_supply_stability — Supply maintenance: std dev, min/max, weekly trends, acceleration, recovery rate.
5. block_circadian_pattern — Circadian production: best/worst sessions, night vs day, active slots and gaps (from session detail + gap summary). Never output "N/A".
6. block_feeding_strategy — Include: current approach (expressed vs formula, feeds/day); optimized schedule table (cols Feed Time | Offer Volume | Notes from Per-Slot Feed Volume Analysis); for each slot with partial-feed ≥30% a specific mitigation; flag gaps <2h (not hungry) and >4h (missed cues); volume progression if median intake rising; satiation-cue tips. Wrap: analytics-blue. Use analytics-table; status-badge status-concerning / status-good.
7. block_topup_tapering — Formula elimination status (use hunger-pattern predictability).
8. block_velocity_interpretation — Growth velocity interpretation (age-appropriate, velocity trend + weight-gain patterns).
9. block_weight_progression — Weight trajectory from latest + all historical (integrate z-score). Wrap: analytics-gray. Table cols Date | Weight | Z-Score | Trend; first/oldest row Trend = status-badge status-baseline (Baseline); every later row Trend = status-improving / status-stable / status-declining (never plain text).
10. block_velocity — WHO growth velocity reference vs recent velocity.
11. block_height_hc — Linear growth + HC with WHO context: current length and HC each with percentile AND z-score; compare to WHO 3rd/15th/50th/85th/97th at this age; trajectory (channel/crossing); proportionality (length vs weight, head vs length); flag <3rd (review) or >97th. Include table Measurement | Value | Z-score | Percentile | WHO 50th at age.
12. block_bmi — BMI percentile interpretation: current BMI with percentile AND z-score; compare to WHO 3rd/15th/50th/85th/97th; categories (<3rd underweight, 3rd-15th lean-normal, 15th-85th healthy, 85th-97th overweight risk, >97th obese risk); if <3rd reassure plainly (BMI in infancy is sensitive to length error; trend matters more) + next steps; note infant BMI naturally declines ~6wk-6mo and place this baby in that arc; trend if multiple points. Wrap: analytics-orange. Badges status-adequate (15th-85th), status-below (<15th), status-concerning (<3rd).
12c. block_weight_for_length — WFL, the primary WHO indicator under 2 (preferred over BMI). Include: why WFL supersedes BMI (age-independent body-size comparison); current WFL z-score and percentile; WHO reference table at this length (Percentile | WHO Weight (kg) | Interpretation for 3rd/15th/50th/85th/97th); category badge; history table Date | Length | Weight | WFL Z | Percentile | WHO 50th at length; trajectory narrative; CRITICAL nuance — a declining z during rapid linear growth is physiologically normal (cite absolute weight-gain velocity); one sentence on what WFL shows that BMI cannot. Wrap: analytics-teal. analytics-table. Badges status-normal (-2..+2), status-concerning (<-2), status-above (>+2), status-baseline (oldest row).
13. block_integrated_summary — Integrated growth + feeding summary (weekly trends + current status).
14. block_monitoring_recommendations — Ongoing monitoring specific to current age.
15. block_medical_assessment — Clinical assessment using full medical history + current data.
16. block_circadian_optimization — Circadian optimization (specific time-slot data + deficit analysis).
18. block_trend_acceleration — Production growth-rate changes: current acceleration + significance; week-over-week velocity (table/list); plateau vs continued-growth prediction; recommendations. Wrap: analytics-purple. analytics-table. Badges status-accelerating / status-stable / status-decelerating.
19. block_recovery_resilience — Supply recovery/resilience: rating + explanation; table of significant drops with recovery times; avg recovery interpretation; stress tolerance; recommendations. Wrap: analytics-teal. analytics-table. Badges status-excellent/good/moderate/concerning (rating); status-recovered / status-not-recovered (per drop).
20. block_hunger_patterns — Consumption behavior: current avg + range; predictability score + meaning; appetite trend; avg feed/session (prominent metric card); per-slot intake table (median, min/max, partial-feed rate); slots with partial-feed ≥30% + likely cause; optimized schedule table (Time Slot | Recommended Offer Time | Recommended Volume | Rationale); recommendations. Wrap: analytics-green. Use metrics-grid + metric-card (incl. "Avg Feed/Session"); analytics-table; status-stable, status-concerning (wastage slots), status-good.
21. block_weight_gain_patterns — Interval velocity: table of intervals with velocity + WHO adequacy; catch-up vs normal deceleration; pattern changes >20%; current trend + significance. Wrap: analytics-orange. analytics-table. Badges status-adequate / status-above / status-below.
22. block_zscore_trajectory — Percentile movement: full z-score history table; toward/away from median; current category + meaning; interval changes; long-term prognosis. Wrap: analytics-gray. analytics-table. Badges status-improving / status-stable / status-declining.
23. block_pump_frequency — Frequency↔supply: current MEDIAN sessions/day + output/session; lag correlation table (0/7/14/21-day); optimal lag; first-week vs last-week trend; lag interpretation; recommendations by level (<6, 6-10, >10/day); warn if frequency changed >10%. Wrap: analytics-blue. analytics-table; metrics-grid + metric-card; badges status-strong / status-moderate / status-weak.
24. block_pump_reduction — Data-driven phase plan to 24 months (goal: sustainable pumping to 2y, not early cessation). ARC 1 (0-12mo): baseline (median freq, daily output, output/session); current daily consumption = minimum floor; schedule table cols Baby Age | Start Date | Target Sessions/Day | Rationale | Min Daily Output | Expected Output | Advance Criterion; taper current→6→5→4→3→2 only when stable; per-phase safety gates from this baby's data; expected output impact per cut (sessions × output/session × lag factor, cite lag); flag high-risk windows. ARC 2 (12-24mo): at 12mo go to exactly 2 sessions/day (post-wake + pre-sleep), explain prolactin rationale; project output (output/session × 2, declining); expected ranges 12-15/15-18/18-21/21-24mo; flag if below ~400 ml/day WHO floor (add midday session); at 24mo describe weaning (drop night first, then morning over 2-4wk); maintenance table Phase | Age | Sessions | Timing | Expected Output | Minimum Acceptable | Review Trigger. Every figure from the data above. Wrap: analytics-purple. Two analytics-tables; metrics-grid + metric-card; status-badge for phase readiness.
25. block_developmental_transitions — Forward-looking milestone guide grounded in actual age, consumption, supply trend. Include: current stage summary; milestone timeline table cols Milestone | Expected Timing (calendar range from birth date) | Impact on Milk Demand | Impact on Pumping | Action — covering solids (~6mo, complementary till ~8-9mo), pre-solids appetite rise (~5-5.5mo), supported sitting (~6mo), finger foods/self-feeding (~8-9mo), cup (~9-12mo), 12mo→2 sessions/day, weaning at 24mo; supply implications of current trend; positive psychological framing. Wrap: analytics-teal. analytics-table. Badges status-upcoming (<6wk), status-stable (6-16wk), status-future (>16wk).
25b. block_solids — Only if medical context mentions solids; else output an empty string. When present: when solids started + what was tried (context only); log table Date | Food | Notes; developmental readiness (factual); milk-volume impact (exploratory, state milk still needed); 3-5 next-food suggestions for an Indian diet grounded in tolerated foods; red flags (allergy, choking, avoid honey/salt/sugar/whole nuts/cow's milk as main drink). Wrap: analytics-teal. analytics-table.
26. block_dow_rhythm — Day-of-Week Production & Consumption rhythm; chart-first. Render all 7 days (Sun-Sat). Per day two horizontal bars: production #0071e3, consumption #30b0c7, each width = avg / maxProductionAcrossAllDays × 100% (same denominator). Use EXACTLY this HTML per day (substitute real values):

    <div style="margin-bottom:14px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:3px">
        <span style="width:36px;font-size:12px;font-weight:600;color:#1d1d1f;flex-shrink:0">Sun</span>
        <div style="flex:1;background:#f0f0f5;border-radius:4px;overflow:hidden;height:16px">
          <div style="height:16px;background:#0071e3;border-radius:4px;width:95%;display:flex;align-items:center;padding-left:6px">
            <span style="font-size:10px;color:#fff;font-weight:500;white-space:nowrap">702 ml</span>
          </div>
        </div>
        <span style="width:56px;font-size:11px;color:#34c759;text-align:right;font-weight:600;flex-shrink:0">+98 ml</span>
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        <span style="width:36px;font-size:10px;color:#8e8e93;flex-shrink:0">cons</span>
        <div style="flex:1;background:#f0f0f5;border-radius:4px;overflow:hidden;height:16px">
          <div style="height:16px;background:#30b0c7;border-radius:4px;width:81%;opacity:0.85;display:flex;align-items:center;padding-left:6px">
            <span style="font-size:10px;color:#fff;font-weight:500;white-space:nowrap">604 ml</span>
          </div>
        </div>
        <span style="width:56px;flex-shrink:0"></span>
      </div>
    </div>

    Rules: bar widths from all-time data (not recent-28); gap label right of the production row, green #34c759 for surplus "+X ml", red #ff3b30 for deficit "-X ml" (no space), grey #8e8e93 for "0 ml". Above the chart add a legend: inline <span> squares (display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:4px;vertical-align:middle) blue "Production" + teal "Consumption".
    Then a <div class="info-box"> (Key Findings): production peak/trough days with ml + swing; whether consumption tracks production (cite Spearman r); worst-gap day as highest-risk.
    Then one clinical paragraph: biological driver hypothesis (e.g. weekend rest → lower cortisol → better prolactin; weekday fatigue at trough); whether consumption rhythm confirms/contradicts production; ONE data-derived recommendation citing the actual gap value.
    Wrap entire block in: analytics-blue. Chart first; do NOT use a table for the chart.`;
}

// -- HTML structure & styling rules (leave unless you change the CSS) --------
const HTML_FORMAT_RULES = `# FORMAT REQUIREMENTS
- ASCII only — no emojis or Unicode icons.
- Headings: the page prints each block's h2/h3 title. Never emit h2/h3/h4 as a block title; start with content. Use <h5> only for a sub-section inside a block. Use <p>/<ul>/<li>/<strong> for structure.
- Box classes available: success-box, info-box, warning-box, critical-box.
- Advanced blocks: wrap in <div class="analytics-block analytics-[color]"> ([color] = purple/teal/green/orange/blue/gray, per block above); tables use <table class="analytics-table">; metrics use <div class="metrics-grid"> of <div class="metric-card"> each with <h5> label, <div class="value">, <div class="description">.
- Status badges: <span class="status-badge status-[type]">. Valid types: excellent, adequate, recovered, improving, normal, accelerating, strong, good, stable, moderate, above, decelerating, weak, baseline, concerning, below, not-recovered, declining.
- Be concise but medically thorough: cite specific numbers, use only WHO growth standards, reference latest measurements and weekly trends, tie each metric to this baby's trajectory.

Example (block_trend_acceleration):
<div class="analytics-block analytics-purple">
  <div class="metrics-grid">
    <div class="metric-card"><h5>Current Acceleration</h5><div class="value">+3.2 ml/week^2</div><div class="description">Growth rate is increasing</div></div>
    <div class="metric-card"><h5>Status</h5><div class="value"><span class="status-badge status-accelerating">Accelerating</span></div><div class="description">Positive trajectory</div></div>
  </div>
  <p>Clinical interpretation text here...</p>
  <table class="analytics-table"><thead><tr><th>Date</th><th>Velocity</th><th>Acceleration</th></tr></thead><tbody><tr><td>01/01/2026</td><td>25 ml/week</td><td>+2.5 ml/week^2</td></tr></tbody></table>
  <h5>Recommendations</h5><ul><li>Continue current strategy</li><li>Monitor for plateau</li></ul>
</div>

Return ONLY the JSON object, no other text.`;

module.exports = { PERSONA, taskGuide, HTML_FORMAT_RULES };
