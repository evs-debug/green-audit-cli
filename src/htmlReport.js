const fs = require('fs');
const path = require('path');

/**
 * Computes annual impact estimates based on carbon emissions per view.
 * @param {number} carbonGrams - CO2e grams per page view.
 */
function computeAnnualImpact(carbonGrams) {
  const monthlyPageviews = 10000;
  const annualCarbonKg = (carbonGrams * monthlyPageviews * 12) / 1000;

  // Approx 0.403 kg CO2e per mile driven (avg US car)
  const miles = Math.round(annualCarbonKg / 0.403);
  // Approx 0.007 kg CO2e per full smartphone charge
  const smartphones = Math.round(annualCarbonKg / 0.007);
  // Approx 21.7 kg CO2e absorbed per tree per year
  const trees = Math.max(1, Math.round(annualCarbonKg / 21.7));

  return {
    co2: annualCarbonKg.toFixed(1),
    miles,
    smartphones: smartphones.toLocaleString(),
    trees
  };
}

/**
 * Returns rating text and description based on grade.
 */
function getRatingInfo(grade) {
  const map = {
    'A': { text: 'Excellent', description: 'This webpage is cleaner than 85% of pages tested. It runs on sustainable energy and is highly optimized.' },
    'B': { text: 'Good', description: 'This webpage has a lower than average carbon footprint. Some further optimizations could make it even greener.' },
    'C': { text: 'Fair', description: 'This webpage has an above average carbon footprint. Consider optimizing resources to reduce environmental impact.' },
    'D': { text: 'Poor', description: 'This webpage has a high carbon footprint. Significant optimizations are recommended.' },
    'F': { text: 'Very Poor', description: 'This webpage has a very high carbon footprint. Major optimization efforts are needed.' }
  };
  return map[grade] || { text: grade, description: 'Carbon footprint analysis completed.' };
}

/**
 * Returns a short human-readable descriptor for a resource URL.
 * Extracts the query string keys (e.g. "challenge.js") when available,
 * otherwise falls back to a readable type label.
 */
function describeResource(r) {
  const typeLabels = {
    script: 'JavaScript',
    image: 'Image',
    stylesheet: 'CSS',
    font: 'Font',
    document: 'Page',
    fetch: 'Data request',
    xhr: 'API call',
    media: 'Media'
  };
  const label = typeLabels[r.type] || r.type;

  // Try to extract a meaningful name from the URL
  let name = '';
  try {
    const u = new URL(r.url);
    const segment = u.pathname.split('/').filter(Boolean).pop() || '';
    name = segment.replace(/\.(js|css|png|jpg|jpeg|gif|svg|woff2?|ttf|json)$/i, '');
  } catch (e) {
    name = '';
  }

  if (name && name.length > 2 && name.length <= 40) {
    return `${label} — ${name}`;
  }
  return `${label}`;
}

/**
 * Generates a human-readable impact description for a given resource type.
 */
function impactDescription(type) {
  const map = {
    script: 'Adds heavy code that slows down loading and processing, raising energy use and draining battery on every visit.',
    image: 'Large images inflate page weight, making downloads slower and increasing transfer emissions.',
    stylesheet: 'Bulk CSS delays rendering and increases bytes transferred, consuming more energy per view.',
    font: 'Custom fonts add extra requests and bytes, increasing the energy cost of each page load.',
    document: 'A heavy main page delays the first content from showing and increases the energy needed to load it.',
    fetch: 'Excess background data requests add network overhead and energy use with every page load.',
    xhr: 'Frequent API calls keep the page active longer, drawing more power on the user\'s device.',
    media: 'Large media files are very expensive to transfer and play, driving up CO2 emissions per view.'
  };
  return map[type] || 'This resource contributes to a heavier page load and higher energy consumption.';
}

/**
 * Generates a self-contained HTML report with inline CSS and dynamic data.
 */
function generateReport(data, energyKwh, carbonGrams, grade, label) {
  const rating = getRatingInfo(grade);
  const annualImpact = computeAnnualImpact(carbonGrams);
  const transferSizeKB = data.totalBytes / 1024;
  const transferSizeMB = transferSizeKB >= 1024
    ? (transferSizeKB / 1024).toFixed(2) + ' MB'
    : transferSizeKB.toFixed(1) + ' KB';
  const domPct = Math.min((data.domNodeCount / 1500) * 100, 100);
  const heapPct = Math.min((data.jsHeapUsed / (50 * 1024 * 1024)) * 100, 100);
  const scriptDurationMs = (data.scriptDuration * 1000).toFixed(0);
  const heapMB = (data.jsHeapUsed / 1024 / 1024).toFixed(2);

  // Grade color variable
  const gradeVar = `--grade-${grade.toLowerCase()}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>GreenAudit Report for ${data.url}</title>
    <style>
        :root {
            --primary-green: #059669;
            --primary-light: #d1fae5;
            --text-main: #0f172a;
            --text-muted: #64748b;
            --bg-color: #f8fafc;
            --card-bg: rgba(255, 255, 255, 0.85);
            --card-border: rgba(255, 255, 255, 0.4);
            --grade-a: #10b981;
            --grade-b: #84cc16;
            --grade-c: #eab308;
            --grade-d: #f97316;
            --grade-e: #ef4444;
            --grade-f: #7f1d1d;
            --active-grade: var(${gradeVar});
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            background: linear-gradient(135deg, #f0fdf4 0%, #f8fafc 100%);
            color: var(--text-main);
            min-height: 100vh;
            line-height: 1.5;
            overflow-x: hidden;
        }
        .container, .glass-card, .details-layout, .metrics-grid, .breakdown-row, .impact-item {
            max-width: 100%;
            overflow-wrap: anywhere;
            word-break: break-word;
        }
        .breakdown-label span:first-child, .impact-item div p { overflow-wrap: anywhere; word-break: break-word; }
        h1, h2, h3, .serif {
            font-family: "Georgia", "Times New Roman", serif;
            color: #020617;
        }
        .glass-card {
            background: var(--card-bg);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            border: 1px solid var(--card-border);
            border-radius: 16px;
            box-shadow: 0 10px 25px rgba(0, 0, 0, 0.02);
            padding: 2rem;
            transition: transform 0.3s ease, box-shadow 0.3s ease;
        }
        .glass-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 15px 30px rgba(0, 0, 0, 0.04);
        }
        .hidden { display: none !important; }
        header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 1.5rem 2rem;
            border-bottom: 1px solid rgba(0,0,0,0.05);
        }
        .logo { font-weight: 800; font-size: 1.25rem; letter-spacing: -0.5px; display: flex; align-items: center; gap: 8px;}
        .report-meta { font-size: 0.875rem; color: var(--text-muted); }
        .container { max-width: 1100px; margin: 0 auto; padding: 2rem; }
        .page-title { font-size: 2.75rem; margin-bottom: 0.5rem; }
        .page-subtitle { color: var(--text-muted); margin-bottom: 2rem; font-size: 1.1rem;}
        .hero-card { display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem; }
        .hero-text h2 { font-size: 2rem; color: var(--text-muted); margin-bottom: 0.5rem; }
        .hero-text h2 strong { color: var(--text-main); }
        .hero-text p { color: var(--text-muted); max-width: 450px; }
        .status-badge { display: inline-flex; align-items: center; gap: 6px; color: var(--primary-green); font-size: 0.875rem; font-weight: 600; margin-bottom: 1rem;}
        .grade-circle {
            width: 140px; height: 140px; border-radius: 50%;
            border: 8px solid var(--primary-light); display: flex;
            align-items: center; justify-content: center;
            font-size: 4.5rem; font-weight: 700; font-family: "Georgia", serif;
            color: var(--active-grade); position: relative;
        }
        .grade-circle::after {
            content: '';
            position: absolute;
            top: -8px; left: -8px; right: -8px; bottom: -8px;
            border-radius: 50%;
            border: 8px solid var(--active-grade);
            clip-path: polygon(50% 0%, 100% 0, 100% 100%, 50% 100%);
        }
        .metrics-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
            gap: 1.5rem;
            margin-bottom: 2rem;
        }
        .metric-item { padding: 1.5rem; border-right: 1px solid var(--card-border); }
        .metric-item:last-child { border-right: none; }
        .metric-header { display: flex; align-items: center; gap: 8px; font-weight: 600; font-size: 1.1rem; margin-bottom: 1rem; color: #0f172a;}
        .metric-header svg { color: var(--primary-green); width: 20px; }
        .metric-value { font-size: 2.5rem; font-weight: 700; margin-bottom: 0.25rem; font-family: "Georgia", serif;}
        .metric-value span { font-size: 1rem; color: var(--text-muted); font-family: system-ui, sans-serif;}
        .metric-desc { font-size: 0.9rem; color: var(--text-muted); margin-top: 1rem; line-height: 1.4; }
        .action-footer {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding-top: 1.5rem;
            border-top: 1px solid var(--card-border);
            margin-top: 1rem;
        }
        .btn {
            background: white;
            border: 1px solid #e2e8f0;
            padding: 0.75rem 1.5rem;
            border-radius: 8px;
            font-weight: 600;
            color: var(--text-main);
            cursor: pointer;
            transition: all 0.2s;
        }
        .btn:hover { background: #f8fafc; border-color: #cbd5e1; }
        .back-link { display: inline-flex; align-items: center; gap: 4px; color: var(--text-muted); cursor: pointer; margin-bottom: 1.5rem; text-decoration: none;}
        .back-link:hover { color: var(--text-main); }
        .details-layout { display: grid; grid-template-columns: 300px 1fr; gap: 2rem; }
        .impact-card { background: white; }
        .impact-item { display: flex; align-items: flex-start; gap: 12px; margin-bottom: 1.2rem; }
        .impact-item svg { width: 24px; color: var(--primary-green); flex-shrink: 0;}
        .impact-item div h4 { font-size: 0.95rem; margin-bottom: 0.2rem;}
        .impact-item div p { font-size: 0.85rem; color: var(--text-muted);}
        .breakdown-row {
            padding: 1rem 0;
            border-bottom: 1px solid #f1f5f9;
        }
        .breakdown-row:last-child { border-bottom: none; }
        .breakdown-label { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-weight: 500;}
        .impact-desc { font-size: 0.8rem; color: var(--text-muted); margin-top: 0.4rem; line-height: 1.4; }
        .progress-track {
            width: 100%;
            height: 6px;
            background: #e2e8f0;
            border-radius: 3px;
            margin-top: 8px;
        }
        .progress-fill { height: 100%; border-radius: 3px; background: var(--primary-green);}
        @media (max-width: 768px) {
            .details-layout { grid-template-columns: 1fr; }
            .hero-card { flex-direction: column; text-align: center; gap: 2rem; }
            .metric-item { border-right: none; border-bottom: 1px solid var(--card-border); }
        }
    </style>
</head>
<body>
    <header>
        <div class="logo">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--primary-green)"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"></path><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"></path></svg>
            GreenAudit.
        </div>
        <div class="report-meta">Report generated for: <strong>${data.url}</strong></div>
    </header>

    <div class="container">
        <!-- Summary Dashboard -->
        <div id="summary-view">
            <h1 class="serif page-title">Sustainability Report</h1>
            <p class="page-subtitle">Here is the environmental impact analysis for the webpage you were just visiting.</p>

            <div class="glass-card">
                <div class="hero-card">
                    <div class="hero-text">
                        <div class="status-badge">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                            Analysis Complete
                        </div>
                        <h2 class="serif"><strong>${rating.text}</strong> Rating</h2>
                        <p>${rating.description}</p>
                    </div>
                    <div class="grade-circle">${grade}</div>
                </div>

                <div class="metrics-grid">
                    <div class="metric-item">
                        <div class="metric-header">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"></path></svg>
                            Carbon Emissions
                        </div>
                        <div class="metric-value">${carbonGrams.toFixed(3)} <span>g CO₂e</span></div>
                        <div style="font-size: 0.75rem; font-weight: bold; text-transform: uppercase; letter-spacing: 1px;">Per Page View</div>
                        <p class="metric-desc">Estimated greenhouse gases produced each time someone visits this webpage. Lower emissions mean a greener website.</p>
                    </div>
                    <div class="metric-item">
                        <div class="metric-header">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                            Page Weight
                        </div>
                        <div class="metric-value">${transferSizeMB}</div>
                        <div style="font-size: 0.75rem; font-weight: bold; text-transform: uppercase; letter-spacing: 1px;">Total Transfer Size</div>
                        <p class="metric-desc">Total amount of data downloaded to display the webpage. Lighter pages require less energy to transfer.</p>
                    </div>
                    <div class="metric-item">
                        <div class="metric-header">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                            Load Time
                        </div>
                        <div class="metric-value">${data.loadTime} <span>ms</span></div>
                        <div style="font-size: 0.75rem; font-weight: bold; text-transform: uppercase; letter-spacing: 1px;">Time to Load</div>
                        <p class="metric-desc">How long it takes for the webpage to become ready. Faster load times mean less energy used on the device.</p>
                    </div>
                </div>

                <div class="action-footer">
                    <span style="font-size: 0.85rem; color: var(--text-muted); display: flex; align-items: center; gap: 6px;">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
                        Estimates based on the Sustainable Web Design model.
                    </span>
                    <button class="btn" onclick="document.getElementById('summary-view').classList.add('hidden'); document.getElementById('detailed-view').classList.remove('hidden');">View Full Detailed Report</button>
                </div>
            </div>
        </div>

        <!-- Detailed Analysis -->
        <div id="detailed-view" class="hidden">
            <a href="#" onclick="document.getElementById('detailed-view').classList.add('hidden'); document.getElementById('summary-view').classList.remove('hidden'); return false;" class="back-link">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
                Back to Summary
            </a>

            <h1 class="serif page-title">Detailed Analysis</h1>
            <p class="page-subtitle">A comprehensive breakdown of where your webpage's emissions come from and how to improve them.</p>

            <div class="details-layout">
                <div>
                    <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 2rem;">
                        <div>
                            <div style="color: var(--text-muted); font-size: 0.9rem;">Overall Grade</div>
                            <h2 class="serif" style="color: var(--text-muted); font-size: 1.8rem;">${rating.text}</h2>
                        </div>
                        <div style="font-family: 'Georgia', serif; font-size: 3rem; font-weight: bold; color: var(--active-grade); line-height: 1;">${grade}</div>
                    </div>

                    <div class="glass-card impact-card">
                        <h3 class="serif" style="margin-bottom: 1rem; display: flex; align-items: center; gap: 8px;">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"></path></svg>
                            Unused JavaScript (dead code waste)
                        </h3>
                        <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 1.5rem;">JavaScript that is downloaded but never used still wastes energy on every visit. Removing it makes the page both faster and greener.</p>
                        ${data.jsWaste.length === 0
                          ? '<p style="color: var(--text-muted);">No significant unused JS detected.</p>'
                          : data.jsWaste.map((f, i) => {
                              const name = describeResource({ url: f.url, type: 'script' }).split('— ')[1] || 'script';
                              return `<div class="impact-item">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"></path></svg>
        <div>
          <h4>${f.unusedPercent.toFixed(1)}% unused</h4>
          <p><strong>${name}</strong> — ${(f.unusedBytes / 1024).toFixed(1)} KB wasted</p>
        </div>
      </div>`;
                            }).join('')}
                    </div>
                </div>

                <div>
                    <div class="glass-card" style="margin-bottom: 2rem; padding: 1.5rem;">
                        <h3 class="serif" style="margin-bottom: 1.5rem;">Technical Metrics</h3>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2rem;">
                            <div>
                                <div class="breakdown-row" style="padding-top: 0;">
                                    <span class="breakdown-label"><span>Total Requests</span><span style="font-weight: 600;">${data.resourceCount}</span></span>
                                </div>
                                <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 1rem;">Every image, CSS file, font and JS file counts as one request.</p>

                                <div class="breakdown-row">
                                    <span class="breakdown-label"><span>DOM Nodes</span><span style="font-weight: 600;">${data.domNodeCount}</span></span>
                                </div>
                                <div class="progress-track"><div class="progress-fill" style="width: ${domPct}%;"></div></div>
                                <p style="font-size: 0.8rem; color: var(--text-muted); margin-top: 0.5rem;">${data.domNodeCount > 1500 ? 'High complexity (over 1500 nodes)' : 'OK complexity'}</p>
                            </div>
                            <div>
                                <div class="breakdown-row" style="padding-top: 0;">
                                    <span class="breakdown-label"><span>JS Execution Time</span><span style="font-weight: 600;">${scriptDurationMs} ms</span></span>
                                </div>
                                <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 1rem;">Less execution time means lower CPU usage.</p>

                                <div class="breakdown-row">
                                    <span class="breakdown-label"><span>Heap Memory</span><span style="font-weight: 600;">${heapMB} MB</span></span>
                                </div>
                                <div class="progress-track"><div class="progress-fill" style="width: ${heapPct}%;"></div></div>
                            </div>
                        </div>
                    </div>

                    <div class="glass-card">
                        <h3 class="serif" style="margin-bottom: 1.5rem;">${data.topResources.length > 0 ? 'Top Green Bottlenecks' : 'Resource Breakdown'}</h3>
                        ${data.topResources.length > 0 ? data.topResources.map((r, i) => {
                          const sizeKB = (r.size / 1024).toFixed(1);
                          const pct = data.totalBytes > 0 ? ((r.size / data.totalBytes) * 100).toFixed(1) : 0;
                          return `<div class="breakdown-row">
          <div>
            <span class="breakdown-label"><span>${i + 1}. ${describeResource(r)}</span><span style="font-weight: 600;">${sizeKB} KB</span></span>
            <div class="impact-desc">${impactDescription(r.type)}</div>
          </div>
        </div>
        <div class="progress-track"><div class="progress-fill" style="width: ${pct}%;"></div></div>`;
                        }).join('') : '<p style="color: var(--text-muted);">No significant resources detected.</p>'}
                    </div>
                </div>
            </div>
        </div>
    </div>
</body>
</html>`;
}

/**
 * Saves the HTML report to the reports directory with a timestamped filename.
 */
function saveHtmlReport(data, energyKwh, carbonGrams, grade, label) {
  const dir = path.join(process.cwd(), 'reports');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const hostname = data.url.replace(/^https?:\/\//, '').replace(/[^a-z0-9]/gi, '-').toLowerCase();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const htmlPath = path.join(dir, `${hostname}-${timestamp}.html`);

  const htmlContent = generateReport(data, energyKwh, carbonGrams, grade, label);
  fs.writeFileSync(htmlPath, htmlContent);

  console.log(`HTML report saved: ${htmlPath}`);
  return htmlPath;
}

module.exports = { generateReport, saveHtmlReport };
