/**
 * Generates MavunoAI-Documentation.docx following the Kabarak University
 * research-project template (title page → copyright → declaration →
 * recommendation → acknowledgement → dedication → abstract → TOC →
 * list of figures → chapters 1-5 → references).
 *
 * Run:  node docs/make_documentation.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  PageBreak, Table, TableRow, TableCell, WidthType, ShadingType,
  ImageRun, TableOfContents, Footer, PageNumber, LevelFormat, BorderStyle,
} = require('docx');

const FIG = name => fs.readFileSync(path.join(__dirname, 'figures', name));

/* ---------------------------------------------------------------- helpers */
const p = (text, opts = {}) => new Paragraph({
  alignment: opts.align || AlignmentType.JUSTIFIED,
  spacing: { line: 360, after: opts.after ?? 120 },
  children: [new TextRun({ text, bold: opts.bold, italics: opts.italics, size: opts.size || 24 })],
  ...(opts.extra || {}),
});
const centered = (text, opts = {}) => p(text, { ...opts, align: AlignmentType.CENTER });
const h1 = text => new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 240, after: 240 }, children: [new TextRun({ text, bold: true, size: 28, color: '000000' })] });
const h2 = text => new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 160 }, children: [new TextRun({ text, bold: true, size: 26, color: '000000' })] });
const h3 = text => new Paragraph({ heading: HeadingLevel.HEADING_3, spacing: { before: 160, after: 120 }, children: [new TextRun({ text, bold: true, size: 24, color: '000000' })] });
const pageBreak = () => new Paragraph({ children: [new PageBreak()] });
const bullet = text => new Paragraph({
  numbering: { reference: 'bullets', level: 0 },
  spacing: { line: 360, after: 80 },
  children: [new TextRun({ text, size: 24 })],
});

const figure = (name, caption, widthPx = 600, heightPx = 340) => [
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 160, after: 60 },
    children: [new ImageRun({ type: 'png', data: FIG(name), transformation: { width: widthPx, height: heightPx } })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 200 },
    children: [new TextRun({ text: caption, italics: true, size: 22 })],
  }),
];

function makeTable(headers, rows, colWidths) {
  const total = colWidths.reduce((a, b) => a + b, 0);
  const cell = (text, isHead) => new TableCell({
    width: { size: colWidths[0], type: WidthType.DXA },
    shading: isHead ? { type: ShadingType.CLEAR, fill: '2E7D46' } : undefined,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: [new Paragraph({
      spacing: { line: 240 },
      children: [new TextRun({ text: String(text), bold: isHead, size: 20, color: isHead ? 'FFFFFF' : '000000' })],
    })],
  });
  const row = (cells, isHead) => new TableRow({
    children: cells.map((c, i) => new TableCell({
      width: { size: colWidths[i], type: WidthType.DXA },
      shading: isHead ? { type: ShadingType.CLEAR, fill: '2E7D46' } : undefined,
      margins: { top: 60, bottom: 60, left: 100, right: 100 },
      children: [new Paragraph({
        spacing: { line: 240 },
        children: [new TextRun({ text: String(c), bold: isHead, size: 20, color: isHead ? 'FFFFFF' : '000000' })],
      })],
    })),
  });
  return new Table({
    width: { size: total, type: WidthType.DXA },
    columnWidths: colWidths,
    rows: [row(headers, true), ...rows.map(r => row(r, false))],
  });
}

/* ---------------------------------------------------------------- content */
const children = [];

/* ===== TITLE PAGE ===== */
children.push(
  new Paragraph({ spacing: { after: 800 } }),
  centered('MAVUNOAI: A WEB-BASED FARM INTELLIGENCE AND AGRICULTURAL CREDIT SCORING SYSTEM FOR SMALLHOLDER FARMERS IN KENYA', { bold: true, size: 32, after: 600 }),
  new Paragraph({ spacing: { after: 600 } }),
  centered('[GROUP MEMBER 1 — FULL NAME, REG NO]', { size: 26, after: 80 }),
  centered('[GROUP MEMBER 2 — FULL NAME, REG NO]', { size: 26, after: 80 }),
  centered('[GROUP MEMBER 3 — FULL NAME, REG NO]', { size: 26, after: 80 }),
  centered('[GROUP MEMBER 4 — FULL NAME, REG NO]', { size: 26, after: 600 }),
  new Paragraph({ spacing: { after: 400 } }),
  centered('A Project Submitted for the [HACKATHON NAME] Innovation Challenge under the Agricultural Technology and Financial Technology Tracks.', { size: 24, after: 400 }),
  new Paragraph({ spacing: { after: 400 } }),
  centered('July, 2026', { size: 24 }),
  pageBreak(),
);

/* ===== COPYRIGHT ===== */
children.push(
  h1('COPYRIGHT'),
  p('© 2026'),
  p('All Rights Reserved.'),
  p('No part of this project may be reproduced, stored in any retrieval system or transmitted in any form or by any means — electronic, mechanical, photocopying or recording — without prior written permission of the authors.'),
  p(''),
  p('Sign: ________________________    Date: ________________________'),
  pageBreak(),
);

/* ===== DECLARATION ===== */
children.push(
  h1('DECLARATION AND APPROVAL'),
  p('We declare that this project is our original work and, to the best of our knowledge, has never been presented to any institution or innovation challenge for any award. No part of this document shall be duplicated without our prior consent.'),
  p(''),
  p('Sign: ________________________    Date: ________________________'),
  p('Team Lead: [NAME]'),
  p('Reg No: [REG NO]'),
  pageBreak(),
);

/* ===== RECOMMENDATION ===== */
children.push(
  h1('RECOMMENDATION'),
  p('This project entitled MavunoAI: A Web-based Farm Intelligence and Agricultural Credit Scoring System for Smallholder Farmers in Kenya, written by the above-named team, is presented for consideration in the [HACKATHON NAME] Innovation Challenge. I have reviewed this project and recommend it for acceptance.'),
  p(''),
  p('Signature: ________________________    Date: ________________________'),
  p('[SUPERVISOR / PATRON NAME]'),
  p('[DEPARTMENT / INSTITUTION]'),
  pageBreak(),
);

/* ===== ACKNOWLEDGEMENT ===== */
children.push(
  h1('ACKNOWLEDGEMENT'),
  p('We thank God for the gift of life, health and the ability to learn. We are grateful to our lecturers and mentors for their guidance throughout our studies, and to the organisers of this innovation challenge for the platform to present solutions to real problems facing our country. Finally, we thank the smallholder farmers whose daily struggle for fair markets and fair credit inspired this work.'),
  pageBreak(),
);

/* ===== DEDICATION ===== */
children.push(
  h1('DEDICATION'),
  p('This work is dedicated to the smallholder farmers of Kenya — the women and men who feed the nation yet remain invisible to its financial system — and to our families for their unending support.'),
  pageBreak(),
);

/* ===== ABSTRACT ===== */
children.push(
  h1('ABSTRACT'),
  p('Agriculture contributes approximately one fifth of Kenya’s Gross Domestic Product directly and employs about 40 percent of the total population, yet the roughly 4.5 million smallholder farmers who produce the majority of the nation’s food face three compounding problems: crop diseases that destroy 20–40 percent of yields before an extension officer can be reached, opaque market prices that allow intermediaries to capture a disproportionate share of farm-gate value, and exclusion from formal credit because farmers lack payslips, collateral and credit histories — agriculture receives under 4 percent of commercial bank lending despite its share of the economy. This project presents MavunoAI, a web and USSD platform that addresses all three problems in a single reinforcing loop. The system provides an on-device artificial-intelligence crop doctor that diagnoses common diseases from a photograph of an affected leaf and prescribes localised treatment; a market intelligence module that tracks sixty-day price trends across five major Kenyan markets and ranks the best market for each crop daily; and, most significantly, the Mavuno Score — a 300–850 credit score computed from five signals in a farmer’s own harvest ledger (season consistency, per-crop yield trend, crop diversification, market timing and repayment record) that unlocks collateral-free input loans. The system was developed using the Agile methodology with a zero-dependency Node.js architecture and SQLite persistence, and was validated with an automated suite of 29 tests plus manual user-acceptance walkthroughs, achieving a 100 percent pass rate. By converting agronomic behaviour into bankable data — the same way mobile-money behaviour became the basis of M-Shwari and Fuliza credit limits — MavunoAI turns harvests into credit history.'),
  p('Keywords: agri-tech, fintech, credit scoring, crop disease diagnosis, smallholder farmers, financial inclusion, USSD'),
  pageBreak(),
);

/* ===== TOC ===== */
children.push(
  h1('TABLE OF CONTENTS'),
  new TableOfContents('Table of Contents', { hyperlink: true, headingStyleRange: '1-3' }),
  p('(In Microsoft Word: right-click the table above and choose "Update Field" to refresh page numbers.)', { italics: true, size: 20 }),
  pageBreak(),
);

/* ===== LIST OF FIGURES ===== */
children.push(
  h1('LIST OF FIGURES'),
  p('Figure 2.1  Conceptual Framework'),
  p('Figure 3.1  Agile Development Methodology'),
  p('Figure 3.2  Data Flow Diagram — Level 0 (Context Diagram)'),
  p('Figure 4.1  Use Case Diagram'),
  p('Figure 4.2  System Architecture'),
  p('Figure 4.3  Database Schema'),
  p('Figure 4.4  Dashboard Interface'),
  p('Figure 4.5  AI Crop Doctor — Live Diagnosis'),
  p('Figure 4.6  Market Intelligence Interface'),
  p('Figure 4.7  Harvest Ledger Interface'),
  p('Figure 4.8  Mavuno Score and Loan Offers Interface'),
  p('Figure 4.9  USSD Channel (Feature-Phone Access)'),
  pageBreak(),
);

/* ===== CHAPTER ONE ===== */
children.push(
  h1('CHAPTER ONE: INTRODUCTION'),
  h2('1.0 Background'),
  p('Agriculture is the backbone of the Kenyan economy. It contributes about 21.8 percent of Gross Domestic Product directly — and roughly a third when agro-processing linkages are included — employs about 40 percent of the total population and over 70 percent of the rural workforce (KNBS, 2024). The sector is dominated by an estimated 4.5 million smallholder farms of under five acres, which together produce over 75 percent of the country’s agricultural output (World Bank, 2023).'),
  p('Despite this centrality, the smallholder farmer operates almost entirely outside the modern information and financial economy. When disease strikes a maize field in Uasin Gishu, the farmer’s recourse is a government extension officer — but Kenya’s extension ratio stands at roughly one officer per one thousand farmers against the FAO-recommended one per four hundred (MoALF, 2023). By the time help arrives, diseases such as Maize Lethal Necrosis, which destroyed an estimated half a million tonnes of maize in its worst season, or the fall armyworm invasion, have already done irreversible damage. The Food and Agriculture Organisation estimates that pests and diseases claim 20–40 percent of crop yields annually.'),
  p('At the market, the same farmer sells into an information vacuum. Wholesale prices for maize can differ by more than 25 percent between Kisumu and Nairobi on the same day, yet the farmer typically knows only the price quoted by the broker at the farm gate. Studies of Kenyan value chains consistently show intermediaries capturing 40–60 percent of the final consumer price.'),
  p('Most consequentially, the farmer cannot borrow. Commercial bank lending to agriculture has stagnated below 4 percent of total credit (CBK, 2024) because farmers lack the three things formal lenders demand: a payslip, collateral and a credit history. Yet Kenya has already proven that alternative data can bank the unbanked — M-Shwari, Fuliza and the government’s Hustler Fund all extend credit scored on mobile-money behaviour rather than payslips. No equivalent exists for the farmer’s most valuable behavioural data: the harvest record itself.'),
  h2('1.1 Problem Statement'),
  p('Smallholder farmers in Kenya lose a large share of their potential income to three linked failures: crop diseases they cannot diagnose in time, market prices they cannot see, and credit they cannot access for lack of formal financial identity. Existing interventions address these problems in isolation — a diagnosis app here, a price SMS service there, a micro-lender elsewhere — leaving the farmer to stitch together fragmented tools, and leaving lenders without trustworthy agronomic data on which to underwrite. There is no integrated system that converts a farmer’s verified production behaviour into both better farm decisions and a bankable credit identity.'),
  h2('1.2 Purpose of the Study'),
  p('The purpose of this project is to design, develop and test an integrated web and USSD platform that protects smallholder yields through instant AI-assisted crop diagnosis, improves selling decisions through market price intelligence, and converts the resulting harvest records into a data-driven credit score that unlocks collateral-free micro-loans.'),
  h2('1.3 General Objective'),
  p('To develop a farm intelligence and agricultural credit scoring system for smallholder farmers in Kenya.'),
  h3('1.3.1 Specific Objectives'),
  bullet('To develop an on-device crop disease diagnosis module that identifies common diseases of maize, beans, potatoes, tomatoes and cabbage from a photograph and prescribes localised treatment and prevention measures.'),
  bullet('To develop a market intelligence module that presents sixty-day wholesale price trends across five major Kenyan markets and ranks the best market for each crop daily.'),
  bullet('To design and implement the Mavuno Score, a five-factor credit scoring engine that computes a 300–850 score from a farmer’s harvest ledger and maps it to tiered, collateral-free loan offers.'),
  bullet('To provide a USSD channel so that farmers without smartphones can access prices, scores, weather and loan information from any feature phone.'),
  bullet('To test the complete system through automated and user-acceptance testing.'),
  h2('1.4 Research Questions'),
  bullet('Can common crop diseases be identified with useful confidence from a leaf photograph using on-device analysis, without requiring an internet connection?'),
  bullet('Does visibility of cross-market price trends change the selling decision of a smallholder farmer?'),
  bullet('Can a harvest ledger provide enough signal to compute a credit score that lenders could underwrite against?'),
  bullet('Can the same platform serve both smartphone and feature-phone users without loss of core functionality?'),
  h2('1.5 Justification of the Study'),
  p('The justification for this system rests on the current Kenyan market moment. First, the credit gap is quantified and enormous: with agriculture at roughly a fifth of GDP but under 4 percent of bank credit, the sector is the single most under-served lending market in the country; the Central Bank and the Ministry of Agriculture have both flagged agricultural finance as a national priority under the Bottom-Up Economic Transformation Agenda. Second, the policy precedent already exists: the Hustler Fund and M-Shwari have normalised behavioural credit scoring at national scale, so a harvest-based score is an extension of a proven Kenyan model, not a leap of faith. Third, the infrastructure is ready: mobile penetration exceeds 100 percent of the adult population, M-PESA reaches over 30 million Kenyans for instant disbursement, and USSD remains universally available on the feature phones still common in rural areas. Fourth, the need is urgent: consecutive poor seasons, the 2022–2023 drought — the worst in four decades — and recurrent disease outbreaks have pushed food security to the centre of national planning, and every percentage point of yield saved through early diagnosis translates directly into national food supply. MavunoAI sits precisely at the intersection of these four forces.'),
  h2('1.6 Scope of the Study'),
  p('The system covers five staple and horticultural crops (maize, beans, potatoes, tomatoes and cabbage), five reference wholesale markets (Wakulima/Nairobi, Eldoret, Nakuru, Kibuye/Kisumu and Kongowea/Mombasa), a fourteen-disease diagnostic knowledge base, a five-factor credit scoring engine with three loan tiers, and a simulated USSD channel. The prototype runs as a web application with a local database and simulated weather and price feeds whose interfaces are designed for direct replacement by live sources (KAMIS market data, OpenWeather, M-PESA Daraja API).'),
  h2('1.7 Limitations of the Study'),
  p('The crop doctor uses colour-signature analysis rather than a trained convolutional neural network, so its confidence is indicative rather than clinical; the price and weather feeds are simulated pending integration of live data sources; and the loan disbursement is demonstrated rather than connected to a payment rail. Each limitation is confined behind an interface designed for substitution without architectural change.'),
  h2('1.8 Assumptions of the Study'),
  p('The study assumes that farmers can access either a smartphone browser or a feature phone with USSD capability; that harvest quantities and prices entered by farmers are broadly truthful (future versions add cooperative counter-verification); and that partner lenders would accept an agronomic behavioural score as a component of underwriting, as they already accept mobile-money behavioural scores.'),
  pageBreak(),
);

/* ===== CHAPTER TWO ===== */
children.push(
  h1('CHAPTER TWO: LITERATURE REVIEW'),
  h2('2.0 Introduction'),
  p('This chapter reviews the challenges facing smallholder farmers in Kenya, examines existing technological interventions in both the agri-tech and fintech spaces, identifies the gap this project fills, and presents the conceptual framework.'),
  h2('2.1 Challenges Facing Smallholder Farmers'),
  p('The literature identifies a consistent triad of constraints. On production, FAO (2022) attributes 20–40 percent of global crop losses to pests and diseases, with Maize Lethal Necrosis and fall armyworm the most economically damaging in East Africa; De Groote et al. (2020) measured fall armyworm losses in Kenyan maize at roughly a third of yield in affected fields. On markets, research on Kenyan horticultural and cereal value chains shows persistent farm-gate information asymmetry, with intermediaries capturing 40–60 percent of consumer price. On finance, the Central Bank of Kenya’s bank supervision reports show agricultural lending stagnant below 4 percent of gross loans, and FinAccess (2021) finds farmers disproportionately dependent on informal credit at effective rates far above bank rates.'),
  h2('2.2 Related Works'),
  h3('2.2.1 PlantVillage Nuru'),
  p('PlantVillage Nuru (Penn State University) demonstrated that on-device convolutional neural networks can diagnose cassava and maize diseases offline on low-end smartphones. Nuru validates the core feasibility of offline diagnosis but stops at diagnosis — it has no market or credit dimension.'),
  h3('2.2.2 iCow and DigiFarm'),
  p('iCow delivers agronomic advice by SMS, and Safaricom’s DigiFarm bundles advice, inputs and some financing. DigiFarm is the closest antecedent to this project; however, its credit decisions lean on mobile-money history and partner agronomic data rather than a transparent, farmer-visible score computed from the farmer’s own verified harvest ledger. The farmer cannot see why they qualify or how to improve.'),
  h3('2.2.3 Apollo Agriculture and Tulaa'),
  p('Apollo Agriculture underwrites input loans using satellite imagery and machine learning. This approach is powerful but opaque to the farmer and expensive to operate; it treats the farmer as a subject of scoring rather than a participant in building their own record.'),
  h3('2.2.4 M-Shwari, Fuliza and the Hustler Fund'),
  p('Kenya’s mobile-money credit stack proved, at a scale of tens of millions of users, that behavioural data can substitute for collateral. These products, however, score financial behaviour only; a farmer whose entire economic life is agronomic remains thin-file.'),
  h3('2.2.5 KAMIS'),
  p('The Kenya Agricultural Market Information System publishes wholesale market prices but reaches farmers poorly; the data exists institutionally without a farmer-facing decision layer.'),
  h2('2.3 Research Gap'),
  p('Each reviewed system solves one leg of the triad. No existing platform (i) closes the loop in which better farm decisions generate the very data that unlocks credit, (ii) makes the credit score transparent and improvable by the farmer, and (iii) serves smartphone and feature-phone users through one backend. MavunoAI is designed to fill precisely this gap.'),
  h2('2.4 Conceptual Framework'),
  ...figure('fig_conceptual.png', 'Figure 2.1: Conceptual Framework', 620, 310),
  pageBreak(),
);

/* ===== CHAPTER THREE ===== */
children.push(
  h1('CHAPTER THREE: METHODOLOGY'),
  h2('3.0 Introduction'),
  p('This chapter describes the development methodology, its justification, the functional and non-functional requirements of the system, and the tools and techniques used.'),
  h2('3.1 Development Methodology'),
  p('The project adopted the Agile methodology, iterating through requirements analysis, design, development, testing, release and feedback in short cycles. Each core module (dashboard, crop doctor, markets, harvest ledger, credit engine, USSD channel) was built and verified in its own iteration before integration.'),
  ...figure('fig_agile.png', 'Figure 3.1: Agile Development Methodology', 420, 420),
  h2('3.2 Justification of the Methodology'),
  p('Agile suits a hackathon-timeline project where requirements crystallise through building: early iterations of the scoring engine revealed a cross-crop yield-comparison defect that was corrected and regression-tested within the same cycle — a correction a waterfall sequence would have discovered only at final testing.'),
  h2('3.3 Functional Requirements'),
  bullet('The system shall allow a farmer to select a crop, upload a leaf photograph, and receive a disease diagnosis with confidence level, severity, treatment and prevention guidance, with analysis performed on the client device.'),
  bullet('The system shall record every diagnosis in the farmer’s scan history.'),
  bullet('The system shall display sixty-day wholesale price trends per crop across five markets and rank the best market daily.'),
  bullet('The system shall allow a farmer to log harvests (crop, season, quantity, price, market, date) and view a revenue-computed ledger.'),
  bullet('The system shall compute the Mavuno Score (300–850) from five weighted factors and display a transparent per-factor breakdown.'),
  bullet('The system shall present tiered loan offers according to score and allow one-tap application with instant decision.'),
  bullet('The system shall expose prices, score, weather and loan status over a USSD-style menu for feature phones.'),
  h2('3.4 Non-Functional Requirements'),
  h3('3.4.1 Usability'),
  p('A first-time user shall reach any core function within two taps from the dashboard; the USSD flow shall follow familiar Kenyan menu conventions in Kiswahili and English.'),
  h3('3.4.2 Reliability'),
  p('Malformed input, unknown routes and invalid requests shall fail safely with descriptive errors and never crash the server process (verified by tests TC13, TC15, TC28).'),
  h3('3.4.3 Performance'),
  p('The system shall serve at least fifty concurrent dashboard requests without error (verified: 50/50 in 283 ms, TC29).'),
  h3('3.4.4 Security'),
  p('The static file server shall reject path traversal attempts; request bodies are capped at 2 MB (verified by TC27).'),
  h3('3.4.5 Portability'),
  p('The system shall run with zero third-party runtime dependencies on any machine with Node.js ≥ 22.5, with no internet connection required.'),
  h2('3.5 Tools and Techniques'),
  makeTable(
    ['Tool / Technique', 'Purpose'],
    [
      ['Node.js (node:http, node:sqlite)', 'Zero-dependency application server and embedded relational database'],
      ['Vanilla JavaScript (ES2022)', 'Single-page application frontend'],
      ['HTML5 Canvas API', 'On-device leaf image feature extraction (colour-signature analysis)'],
      ['SVG', 'Hand-rolled price charts and score gauge'],
      ['Node built-in test runner (node:test)', 'Automated test suite (29 tests)'],
      ['VS Code / Claude Code', 'Development environment'],
      ['Git', 'Version control'],
    ],
    [3600, 5760],
  ),
  p(''),
  h2('3.6 Data Flow Diagram'),
  ...figure('fig_dfd0.png', 'Figure 3.2: Data Flow Diagram — Level 0 (Context Diagram)', 620, 310),
  pageBreak(),
);

/* ===== CHAPTER FOUR ===== */
children.push(
  h1('CHAPTER FOUR: SYSTEM ANALYSIS, IMPLEMENTATION AND DESIGN'),
  h2('4.0 Introduction'),
  p('This chapter presents the analysis and design diagrams, describes the implementation of each module, states the hardware and software specifications, and reports the testing carried out with its results.'),
  h2('4.1 Analysis Diagrams'),
  h3('4.1.1 Use Case Diagram'),
  ...figure('fig_usecase.png', 'Figure 4.1: Use Case Diagram', 560, 380),
  h3('4.1.2 System Architecture'),
  ...figure('fig_architecture.png', 'Figure 4.2: System Architecture', 620, 340),
  h2('4.2 Design'),
  h3('4.2.1 Database Schema'),
  ...figure('fig_schema.png', 'Figure 4.3: Database Schema', 620, 340),
  h3('4.2.2 Crop Doctor Module'),
  p('The crop doctor samples the uploaded photograph on a 96×96 canvas and measures three symptom ratios over leaf tissue: chlorosis (yellowing), necrosis (browning) and dark-lesion spotting, discarding background and glare pixels. Each of the fourteen diseases in the knowledge base carries a visual signature over the same three dimensions; the module ranks diseases by Euclidean signature distance and reports the nearest match with a confidence percentage, severity class, typical symptoms, immediate treatment (chemical and organic) and prevention guidance localised to Kenyan growing conditions. Because analysis runs entirely on the client device, diagnosis works without a data bundle; the module interface is designed so a trained TensorFlow Lite convolutional model can replace the signature matcher without any change to the user experience.'),
  h3('4.2.3 Market Intelligence Module'),
  p('The module maintains a per-crop, per-market, per-day price table (1,500 observations seeded over sixty days) and serves two views: a five-market trend chart rendered as SVG polylines with gridlines and axis labels, and a best-market ranking recomputed on each request. The interface matches the shape of the KAMIS wholesale price feed for later live integration.'),
  h3('4.2.4 Mavuno Score Engine'),
  p('The engine computes five component scores, each 0–100: season consistency (25% weight — distinct seasons logged), per-crop yield trend (20% — later-half versus earlier-half average quantities compared within each crop so that light crops are never penalised against heavy ones), crop diversification (15%), market timing (20% — share of sales at or above 90 percent of the thirty-day market average), and repayment record (20% — neutral baseline of 60, raised by repaid loans and discounted while loans are active). The weighted total maps linearly onto a 300–850 band. Scores of 700 and above (“Prime Harvester”) unlock two offers up to KES 120,000; 600–699 (“Growing Strong”) up to KES 40,000; 480–599 (“Seedling”) a KES 10,000 starter advance. Every loan stores the score at application for auditability.'),
  h3('4.2.5 USSD Module'),
  p('A simulated *384*626# session exposes market prices, the farmer’s score and tier, a three-day weather summary and loan eligibility through a numeric menu in Kiswahili, demonstrating feature-phone reach from the same backend and data as the web channel.'),
  h2('4.3 Description of Implementation'),
  h3('4.3.1 Hardware Specification'),
  makeTable(
    ['Component', 'Minimum specification'],
    [
      ['Server / demo machine', 'Any computer able to run Node.js ≥ 22.5; 2 GB RAM'],
      ['Farmer device (web)', 'Any smartphone or computer with a modern browser'],
      ['Farmer device (USSD)', 'Any GSM feature phone'],
    ],
    [3600, 5760],
  ),
  p(''),
  h3('4.3.2 Software Specification'),
  makeTable(
    ['Layer', 'Software'],
    [
      ['Runtime', 'Node.js v24 (tested); zero third-party runtime dependencies'],
      ['Database', 'SQLite via the built-in node:sqlite module (WAL mode)'],
      ['Frontend', 'HTML5, CSS3, vanilla JavaScript; no frameworks'],
      ['Operating system', 'Windows, Linux or macOS'],
    ],
    [3600, 5760],
  ),
  p(''),
  h3('4.3.3 System Interfaces'),
  p('The following screenshots were captured from the live running system during user-acceptance testing. They show each module operating on the seeded demonstration account (farmer Amina Chebet, Uasin Gishu County).'),
  p('The dashboard (Figure 4.4) presents the farmer’s complete situation in one view: the Mavuno Score, harvest and revenue statistics, a five-day weather forecast, today’s average prices across markets with weekly change, and the week’s agronomic advice.'),
  ...figure('shot_dashboard.png', 'Figure 4.4: Dashboard Interface', 620, 386),
  p('In the Crop Doctor (Figure 4.5), a photograph of a yellow-mottled maize leaf has been analysed on-device: the module measured 76 percent chlorosis and diagnosed Maize Streak Virus at 78 percent confidence, with immediate treatment and prevention guidance.'),
  ...figure('shot_doctor.png', 'Figure 4.5: AI Crop Doctor — Live Diagnosis', 620, 386),
  p('The market intelligence view (Figure 4.6) plots the sixty-day wholesale price trend for the selected crop across all five markets and ranks the best market for the day — here exposing a spread of over KES 14/kg between Kisumu and Nairobi for the same maize.'),
  ...figure('shot_markets.png', 'Figure 4.6: Market Intelligence Interface', 620, 386),
  p('The harvest ledger (Figure 4.7) lists every recorded harvest with computed revenue; each row is a data point in the farmer’s credit file.'),
  ...figure('shot_harvests.png', 'Figure 4.7: Harvest Ledger Interface', 620, 386),
  p('The credit view (Figure 4.8) shows the score gauge, the transparent five-factor breakdown, and the tiered loan offers the farmer qualifies for, each applicable in one tap.'),
  ...figure('shot_credit.png', 'Figure 4.8: Mavuno Score and Loan Offers Interface', 620, 386),
  p('Finally, the USSD channel (Figure 4.9) delivers live market prices in Kiswahili through a numeric menu, demonstrating full feature-phone access from the same backend.'),
  ...figure('shot_ussd.png', 'Figure 4.9: USSD Channel (Feature-Phone Access)', 620, 386),
  h2('4.4 Description of Testing and Results'),
  h3('4.4.1 System Testing'),
  p('Testing combined an automated suite of 29 tests written with the Node built-in test runner — which spawns the real server on an isolated port with a temporary database and exercises every API endpoint, the scoring engine, input validation, static-file security and concurrency — with a six-flow manual user-acceptance walkthrough performed in the browser. The suite is reproducible with a single command: node --test tests/api.test.js.'),
  h3('4.4.2 Testing Data and Results'),
  makeTable(
    ['ID', 'Test case', 'Expected result', 'Status'],
    [
      ['TC01', 'Dashboard farmer snapshot', 'Profile, 7 harvests, >10 t produce, >KES 400k revenue', 'Pass'],
      ['TC02', 'Score band and tier', '300–850 with named tier', 'Pass (733, Prime Harvester)'],
      ['TC06', '60-day price series', '60 rows × 5 markets, all positive', 'Pass'],
      ['TC09', 'Unknown crop', 'HTTP 400', 'Pass'],
      ['TC12', 'Log harvest', '201 + updated score; strong harvest never lowers score', 'Pass'],
      ['TC13', 'Missing-field validation (4 cases)', 'HTTP 400 each', 'Pass'],
      ['TC15', 'Malformed JSON', 'HTTP 400; server stays alive', 'Pass'],
      ['TC16', 'Score components', '5 components; weights sum to 100', 'Pass'],
      ['TC19', 'Loan application', '201 approved with matching terms', 'Pass'],
      ['TC20', 'Ineligible offer', 'HTTP 403', 'Pass'],
      ['TC22', 'Active-loan risk realism', 'Repayment component discounted below baseline', 'Pass'],
      ['TC27', 'Path traversal (3 payloads)', 'Server source never leaks', 'Pass'],
      ['TC29', '50 concurrent requests', 'All succeed', 'Pass (283 ms)'],
    ],
    [900, 3000, 3760, 1700],
  ),
  p(''),
  p('Overall automated result: 29 of 29 tests passed (100 percent). The full test-case table, the six-flow user-acceptance walkthrough and the defect log are recorded in TESTING.md in the project repository.'),
  h3('4.4.3 Defects Found and Corrected During Testing'),
  makeTable(
    ['ID', 'Defect', 'Severity', 'Correction'],
    [
      ['D1', 'Modal dialogs rendered on page load (CSS display overrode the hidden attribute)', 'High', 'Global [hidden]{display:none!important} rule'],
      ['D2', 'Harvest dates displayed one day early west of UTC', 'Low', 'UTC-fixed date formatting'],
      ['D3', 'Yield trend compared raw kilograms across crops, penalising light crops', 'Medium', 'Per-crop yield trend; regression test added'],
      ['D4', 'Malformed JSON returned HTTP 500', 'Low', 'Returns HTTP 400; server unaffected'],
    ],
    [700, 4000, 1200, 3460],
  ),
  p(''),
  h3('4.4.4 Description of Results'),
  p('All functional requirements were met and verified. The score engine behaved monotonically under new-season logging, discounted risk correctly while a loan was active, and rejected out-of-tier applications. The system withstood malformed input and path-traversal attempts without failure and served fifty concurrent requests in under a third of a second, comfortably exceeding the stated performance requirement.'),
  pageBreak(),
);

/* ===== CHAPTER FIVE ===== */
children.push(
  h1('CHAPTER FIVE: CONCLUSION AND RECOMMENDATION'),
  h2('5.0 Introduction'),
  p('This chapter concludes the project and presents recommendations and future work.'),
  h2('5.1 Conclusion'),
  p('MavunoAI demonstrates that the three defining exclusions of the Kenyan smallholder — from timely agronomic expertise, from market information and from formal credit — can be addressed by one integrated system in which each solution strengthens the others: diagnosis protects the harvest, price intelligence increases its value, and the record of both becomes the farmer’s credit identity. The prototype was fully implemented with a deliberately dependency-free architecture, and validated with a 100 percent pass rate across 29 automated tests and a complete user-acceptance walkthrough.'),
  h2('5.2 Recommendations'),
  p('The team recommends piloting the system with a farmers’ cooperative in a maize-growing county, where cooperative records can counter-verify self-reported harvests, and engaging a SACCO or microfinance partner to underwrite a first tranche of score-based input loans under the existing digital-credit regulatory framework.'),
  h2('5.3 Future Works'),
  bullet('Replace the colour-signature diagnostic matcher with a convolutional neural network trained on the PlantVillage dataset, deployed on-device with TensorFlow Lite.'),
  bullet('Integrate live KAMIS wholesale price data and county market boards, with SMS price alerts.'),
  bullet('Integrate M-PESA Daraja API for real loan disbursement and repayment collection.'),
  bullet('Publish a partner API through which SACCOs, MFIs and input suppliers can underwrite against the Mavuno Score with the farmer’s consent.'),
  bullet('Extend the crop knowledge base and add satellite-verified acreage as a sixth scoring factor.'),
  bullet('Price crop micro-insurance from the same score.'),
  pageBreak(),
);

/* ===== REFERENCES ===== */
children.push(
  h1('REFERENCES'),
  p('Central Bank of Kenya. (2024). Bank Supervision Annual Report. Nairobi: CBK.'),
  p('Central Bank of Kenya, KNBS & FSD Kenya. (2021). FinAccess Household Survey. Nairobi.'),
  p('De Groote, H., Kimenju, S. C., Munyua, B., Palmas, S., Kassie, M., & Bruce, A. (2020). Spread and impact of fall armyworm (Spodoptera frugiperda) in maize production areas of Kenya. Agriculture, Ecosystems & Environment, 292.'),
  p('Food and Agriculture Organisation. (2022). The State of Food and Agriculture. Rome: FAO.'),
  p('Kenya National Bureau of Statistics. (2024). Economic Survey 2024. Nairobi: KNBS.'),
  p('Mahuku, G., et al. (2015). Maize lethal necrosis (MLN), an emerging threat to maize-based food security in sub-Saharan Africa. Phytopathology, 105(7), 956–965.'),
  p('Ministry of Agriculture and Livestock Development. (2023). Agricultural Sector Transformation and Growth Strategy progress review. Nairobi: MoALF.'),
  p('Mramba, N., et al. (2018). Mobile phones for market information among smallholder farmers in East Africa. Journal of Agricultural Informatics.'),
  p('Penn State University. (2019). PlantVillage Nuru: AI-powered crop disease diagnosis. University Park, PA.'),
  p('Safaricom PLC. (2024). Sustainable Business Report. Nairobi: Safaricom.'),
  p('World Bank. (2023). Kenya Economic Update: Securing Growth — Agriculture as an engine of inclusive development. Washington, DC: World Bank.'),
);

/* ---------------------------------------------------------------- build */
const doc = new Document({
  styles: {
    default: {
      document: { run: { font: 'Times New Roman', size: 24 } },
    },
  },
  numbering: {
    config: [{
      reference: 'bullets',
      levels: [{
        level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 720, hanging: 360 } } },
      }],
    }],
  },
  features: { updateFields: true },
  sections: [{
    properties: {
      page: { margin: { top: 1440, bottom: 1440, left: 1800, right: 1440 } },
    },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ children: [PageNumber.CURRENT], size: 20 })],
        })],
      }),
    },
    children,
  }],
});

Packer.toBuffer(doc).then(buf => {
  const out = path.join(__dirname, 'MavunoAI-Documentation.docx');
  fs.writeFileSync(out, buf);
  console.log('WROTE', out, buf.length, 'bytes');
});
