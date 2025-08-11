// App.jsx — Part 1
import React, { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";

// ========================= CONFIG =========================
// Uses Vite proxy paths you set up.
// Detect if running on GitHub Pages
const IS_GH_PAGES = /\.github\.io$/.test(window.location.hostname);

// In GitHub Pages → use Cloudflare Worker proxy
// In local dev → use empty strings so Vite proxy kicks in
const API_BASE = IS_GH_PAGES
  ? 'https://wav-proxy.sujay-d99.workers.dev'
  : '';

export const API = {
  userByEmail: (email) =>
    `${API_BASE}/wavuser/api/WAVInternalUser/byEmail/${encodeURIComponent(email)}`,
  createPatient: `${API_BASE}/patient/api/Patient/create`,
  createOrder:   `${API_BASE}/patient/api/Order`,
  uploadOrderPdf: (orderId) =>
    `${API_BASE}/admin/api/OrderPdfUpload/upload/${orderId}`,
};

// If your sheet uses different header names, map them here (left = code expects, right = column in Excel)
const COLUMN_MAP = {
  patientid: "patientid",
  patientName: "patientName",
  dob: "dob",
  mrn: "mrn",
  address: "address",
  NPI: "NPI",
  patient_sex: "patient_sex",
  DABackOfficeID: "DABackOfficeID",
  companyId: "companyId",
  Pgcompanyid: "Pgcompanyid",
  soc: "soc",
  cert_period_soe: "cert_period_soe",
  cert_period_eoe: "cert_period_eoe",
  firstDiagnosis: "firstDiagnosis",
  secondDiagnosis: "secondDiagnosis",
  thirdDiagnosis: "thirdDiagnosis",
  fourthDiagnosis: "fourthDiagnosis",
  fifthDiagnosis: "fifthDiagnosis",
  sixthDiagnosis: "sixthDiagnosis",
  orderno: "orderno",
  orderdate: "orderdate",
  sendDate: "sendDate",
  documentId: "Document ID",
  documentName: "documentType", // your sheet uses documentType
  pdfLink: "PDF_Drive_Link",
};

// ========================= HELPERS =========================
function excelDateToJS(dateLike) {
  if (dateLike == null || dateLike === "") return null;
  if (typeof dateLike === "number") {
    // Excel serial to JS Date. Excel epoch starts at 1899-12-30
    const d = new Date(Math.round((dateLike - 25569) * 86400 * 1000));
    return isNaN(d.getTime()) ? null : d;
  }
  const try1 = new Date(dateLike);
  if (!isNaN(try1.getTime())) return try1;
  const parts = String(dateLike).trim().split(/[\/\-\.]/);
  if (parts.length === 3) {
    let [a, b, c] = parts.map((p) => parseInt(p, 10));
    if (a > 12) {
      const d = new Date(c, b - 1, a);
      return isNaN(d.getTime()) ? null : d;
    } else {
      const d = new Date(c, a - 1, b);
      return isNaN(d.getTime()) ? null : d;
    }
  }
  return null;
}
function formatMMDDYYYY(d) {
  if (!(d instanceof Date) || isNaN(d.getTime())) return "";
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yyyy = String(d.getFullYear());
  return `${mm}/${dd}/${yyyy}`;
}
function calcAge(dob) {
  if (!dob) return "";
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
  return String(age);
}
function splitName(full) {
  const parts = String(full || "").trim().split(/\s+/).filter(Boolean);
  let firstName = "", middleName = "", lastName = "";
  if (parts.length === 1) firstName = parts[0];
  else if (parts.length === 2) [firstName, lastName] = parts;
  else if (parts.length >= 3) { firstName = parts[0]; lastName = parts[parts.length - 1]; middleName = parts.slice(1, -1).join(" "); }
  return { firstName, middleName, lastName };
}
function parseAddress(addr) {
  if (!addr) return { patientAddress: "", patientCity: "", state: "", zip: "" };
  const s = String(addr);
  const pieces = s.split(",").map((p) => p.trim());
  let patientAddress = pieces[0] || "";
  let patientCity = pieces[1] || "";
  let state = "", zip = "";
  if (pieces[2]) {
    const m = pieces[2].match(/([A-Za-z]{2})\s*(\d{5}(?:-\d{4})?)?/);
    if (m) { state = m[1] || ""; zip = m[2] || ""; } else { state = pieces[2]; }
  }
  return { patientAddress, patientCity, state, zip };
}
function blobFromUrl(url) {
  return fetch(url).then((r) => { if (!r.ok) throw new Error(`Failed to download PDF: ${r.status}`); return r.blob(); });
}
function asJsonCell(obj) { try { return JSON.stringify(obj); } catch { return String(obj); } }
// App.jsx — Part 2
// Build patient create payload from a row
function buildPatientPayload(row, createdById) {
  const name = splitName(row[COLUMN_MAP.patientName]);
  const dobJs = excelDateToJS(row[COLUMN_MAP.dob]);
  const dobStr = formatMMDDYYYY(dobJs);
  const age = calcAge(dobJs);
  const { patientAddress, patientCity, state, zip } = parseAddress(row[COLUMN_MAP.address]);
// Safely parse a response body as JSON, but keep the original text too
async function parseJSONSafe(res) {
  const text = await res.text().catch(() => "");
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch {}
  return { data, text };
}

// Pretty-print model validation errors (400) into one line
function formatModelErrors(errObj) {
  if (!errObj || typeof errObj !== "object") return "";
  const parts = [];
  for (const [field, arr] of Object.entries(errObj)) {
    if (Array.isArray(arr)) parts.push(`${field}: ${arr.join("; ")}`);
  }
  return parts.join(" | ");
}
  return {
    filterStatus: "string",
    patientEHRRecId: "string",
    patientEHRType: "string",
    patientFName: name.firstName,
    patientMName: name.middleName,
    patientLName: name.lastName,
    dob: dobStr,
    age: age,
    patientSex: String(row[COLUMN_MAP.patient_sex] || ""),
    patientStatus: "Active",
    maritalStatus: "string",
    ssn: "",
    startOfCare: formatMMDDYYYY(excelDateToJS(row[COLUMN_MAP.soc])),
    careManagement: [{ careManagementType: "CPO" }],
    medicalRecordNo: String(row[COLUMN_MAP.mrn] || ""),
    serviceLine: "string",
    patientAddress,
    state,
    patientCity,
    patientState: state,
    zip,
    email: "",
    phoneNumber: "",
    fax: "",
    payorSource: "",
    billingProvider: "",
    billingProviderPhoneNo: "",
    billingProviderAddress: "",
    billingProviderZip: "",
    npi: "",
    line1DOSFrom: "",
    line1DOSTo: "",
    line1POS: "",
    physicianNPI: String(row[COLUMN_MAP.NPI] || ""),
    supervisingProvider: "",
    supervisingProviderNPI: "",
    physicianGroup: "",
    physicianGroupNPI: "",
    physicianGroupAddress: "",
    physicianPhone: "",
    physicianAddress: "",
    cityStateZip: "",
    patientAccountNo: "",
    agencyNPI: "",
    nameOfAgency: "",
    insuranceId: "",
    primaryInsuranceName: "",
    secondaryInsuranceName: "",
    secondaryInsuranceID: "",
    tertiaryInsuranceName: "",
    tertiaryInsuranceID: "",
    nextofKin: "",
    patientCaretaker: "",
    patientCaretakerContactNumber: "",
    remarks: "",
    daBackofficeID: String(row[COLUMN_MAP.DABackOfficeID] || ""),
    companyId: String(row[COLUMN_MAP.companyId] || ""),
    pgcompanyID: String(row[COLUMN_MAP.Pgcompanyid] || ""),
    createdBy: createdById,
    createdOn: new Date().toISOString(),
    updatedBy: createdById,
    updatedOn: new Date().toISOString(),
    episodeDiagnoses: [
      {
        id: "string",
        startOfCare: formatMMDDYYYY(excelDateToJS(row[COLUMN_MAP.soc])),
        startOfEpisode: formatMMDDYYYY(excelDateToJS(row[COLUMN_MAP.cert_period_soe])),
        endOfEpisode: formatMMDDYYYY(excelDateToJS(row[COLUMN_MAP.cert_period_eoe])),
        firstDiagnosis: String(row[COLUMN_MAP.firstDiagnosis] || ""),
        secondDiagnosis: String(row[COLUMN_MAP.secondDiagnosis] || ""),
        thirdDiagnosis: String(row[COLUMN_MAP.thirdDiagnosis] || ""),
        fourthDiagnosis: String(row[COLUMN_MAP.fourthDiagnosis] || ""),
        fifthDiagnosis: String(row[COLUMN_MAP.fifthDiagnosis] || ""),
        sixthDiagnosis: String(row[COLUMN_MAP.sixthDiagnosis] || ""),
        updatedOn: new Date().toISOString(),
      },
    ],
  };
}

function buildOrderPayload(row, patientId, createdById) {
  const d = (v) => formatMMDDYYYY(excelDateToJS(v));

  return {
    orderNo: String(row[COLUMN_MAP.orderno] || ""),
    orderDate: d(row[COLUMN_MAP.orderdate]),
    startOfCare: d(row[COLUMN_MAP.soc]),
    episodeStartDate: d(row[COLUMN_MAP.cert_period_soe]),
    episodeEndDate: d(row[COLUMN_MAP.cert_period_eoe]),
    documentID: String(row[COLUMN_MAP.documentId] || ""),
    mrn: String(row[COLUMN_MAP.mrn] || ""),
    patientName: String(row[COLUMN_MAP.patientName] || ""),
    sentToPhysicianDate: d(row[COLUMN_MAP.sendDate]),
    sentToPhysicianStatus: true,
    signedByPhysicianDate: "",
    signedByPhysicianStatus: false,
    uploadedSignedOrderDate: "",
    uploadedSignedOrderStatus: false,
    uploadedSignedPgOrderDate: "",
    uploadedSignedPgOrderStatus: false,
    cpoMinutes: "",
    orderUrl: "",
    documentName: String(row[COLUMN_MAP.documentName] || row.documentType || ""),
    ehr: "",
    account: "",
    location: "",
    remarks: "",
    patientId: String(patientId || ""),
    companyId: String(row[COLUMN_MAP.companyId] || ""),
    pgCompanyId: String(row[COLUMN_MAP.Pgcompanyid] || ""),
    entityType: "ORDER",
    clinicalJustification: "",
    billingProvider: "",
    billingProviderNPI: "",
    supervisingProvider: "",
    supervisingProviderNPI: "",
    bit64Url: "",
    daOrderType: "",
    daUploadSuccess: false,
    daResponseStatusCode: 0,
    daResponseDetails: "",
    createdBy: createdById,
    createdOn: new Date().toISOString(),
    updatedBy: createdById,
    updatedOn: new Date().toISOString(),
    cpoUpdatedBy: "",
    cpoUpdatedOn: new Date().toISOString(),
  };
}
// App.jsx — Part 3
export default function App() {
  const [email, setEmail] = useState("");
  const [user, setUser] = useState(null); // raw user JSON
  const [userId, setUserId] = useState("");

  const [file, setFile] = useState(null);
  const [rows, setRows] = useState([]); // parsed sheet rows

  const [logs, setLogs] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [updatedWorkbook, setUpdatedWorkbook] = useState(null);

  // NEW: totals and per-row summaries
  const [patientsCreated, setPatientsCreated] = useState(0);         // NEW
  const [ordersCreated, setOrdersCreated] = useState(0);             // NEW
  const [patientSuccessList, setPatientSuccessList] = useState([]);  // NEW [{row, patientName}]
  const [orderSuccessList, setOrderSuccessList] = useState([]);      // NEW [{row, documentId}]

  const addLog = (msg) => setLogs((prev) => [msg, ...prev].slice(0, 400));

  // Step gating
  const step1Done = !!userId;
  const step2Done = step1Done && rows.length > 0;
  const canProcess = useMemo(
    () => step2Done && !processing,
    [step2Done, processing]
  );
// App.jsx — Part 4
  async function handleLookup() {
    setUser(null);
    setUserId("");
    if (!email) return;
    const cleanEmail = email.trim().toLowerCase();
    addLog(`Looking up user for ${cleanEmail} ...`);
    try {
      const res = await fetch(API.userByEmail(cleanEmail), { headers: { accept: "*/*" } });
      const text = await res.text();
      let data = null;
      try { data = text ? JSON.parse(text) : null; } catch (e) {
        addLog(`⚠️ Response not JSON. status=${res.status} body=${text?.slice(0, 200)}`);
      }
      if (!res.ok) {
        addLog(`❌ User lookup failed: ${res.status} ${text?.slice(0, 200) || ""}`);
        return;
      }
      if (!data) {
        addLog(`⚠️ 200 OK but empty body.`);
        return;
      }
      const candidate = Array.isArray(data) ? data[0] : data;
      setUser(candidate);
      const foundId = candidate?.id || candidate?.Id || candidate?.userId || "";
      if (foundId) {
        setUserId(foundId);
        addLog(`✅ User found. id=${foundId}`);
      } else {
        addLog(`⚠️ 200 OK but no 'id' field in body. Keys: ${Object.keys(candidate || {}).join(", ")}`);
      }
    } catch (err) {
      addLog(`❌ Lookup error: ${err.message}`);
    }
  }

  function handleFileChange(e) {
    const f = e.target.files?.[0];
    setFile(f || null);
    setUpdatedWorkbook(null);
    if (!f) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const data = new Uint8Array(evt.target.result);
      const wb = XLSX.read(data, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]]; // first sheet
      const json = XLSX.utils.sheet_to_json(ws, { defval: "" });
      setRows(json);
      addLog(`📄 Loaded ${json.length} rows from "${f.name}"`);
    };
    reader.readAsArrayBuffer(f);
  }
async function getJSONAndText(res) {
  let text = "";
  try { text = await res.text(); } catch {}
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch {}
  return { json, text };
}

function formatValidationErrors(errors) {
  if (!errors || typeof errors !== "object") return "";
  return Object.entries(errors)
    .map(([field, msgs]) => `${field}: ${msgs.join("; ")}`)
    .join(" | ");
}

  async function createPatientIfNeeded(row, rowIndex) {
  const existing = row[COLUMN_MAP.patientid];
  if (existing) {
    addLog(`Row ${rowIndex + 1}: Patient already exists (${existing}), skipping.`);
    return existing;
  }

  const payload = buildPatientPayload(row, userId);
  const res = await fetch(API.createPatient, {
    method: "POST",
    headers: { "Content-Type": "application/json", accept: "*/*" },
    body: JSON.stringify(payload),
  });

  const { json, text } = await getJSONAndText(res);

  // Save for Excel output
  row["PatientResponse"] = asJsonCell(json || text || { status: res.status });

  if (res.status === 409) {
    const id = json?.id || json?.patientId || json?.agencyInfo?.patientWAVId || "";
    addLog(`Row ${rowIndex + 1}: ⚠️ Duplicate patient found${id ? ` (ID: ${id})` : ""}`);
    if (id) row[COLUMN_MAP.patientid] = id;
    return id;
  }

  if (res.status === 400) {
    const msg = json?.title || json?.message || "Invalid data";
    const errs = formatValidationErrors(json?.errors);
    addLog(`Row ${rowIndex + 1}: ❌ Patient could not be created — ${msg}${errs ? " | " + errs : ""}`);
    throw new Error(msg);
  }

  if (!res.ok) {
    addLog(`Row ${rowIndex + 1}: ❌ Patient create failed (${res.status})`);
    throw new Error(`Patient create failed: ${res.status}`);
  }

  // Success
  const newId = json?.id || json?.agencyInfo?.patientWAVId || "";
  if (!newId) throw new Error("No patient ID returned");
  row[COLUMN_MAP.patientid] = newId;
  addLog(`Row ${rowIndex + 1}: ✅ Patient created (ID: ${newId})`);
  setPatientsCreated(c => c + 1);
  setPatientSuccessList(list => [...list, { row: rowIndex + 1, patientName: row[COLUMN_MAP.patientName] }]);
  return newId;
}
// simple result wrapper for order creation
function orderCreateResult({ ok, orderId, json }) {
  return { ok, orderId: orderId || "", json: json || null };
}

async function createOrder(row, rowIndex, patientId) {
  const payload = buildOrderPayload(row, patientId, userId);
  const res = await fetch(API.createOrder, {
    method: "POST",
    headers: { "Content-Type": "application/json", accept: "*/*" },
    body: JSON.stringify(payload),
  });

  const { json, text } = await getJSONAndText(res);
  row["OrderResponse"] = asJsonCell(json || text || { status: res.status });

  // 409 Duplicate → treat as NOT created; do not log a scary line for users
  if (res.status === 409) {
    // Example: {"message":"Duplicate order found","orderId":"ORD41807"}
    // We won’t addLog here per your request (keeps Activity clean).
    return orderCreateResult({ ok: false, orderId: json?.orderId, json });
  }

  // 400 Validation → friendly message + stop this row
  if (res.status === 400) {
    const msg = json?.title || json?.message || "Invalid data";
    const errs = formatValidationErrors(json?.errors);
    addLog(`Row ${rowIndex + 1}: ❌ Order could not be created — ${msg}${errs ? " | " + errs : ""}`);
    return orderCreateResult({ ok: false, orderId: "", json });
  }

  // Other non-2xx
  if (!res.ok) {
    addLog(`Row ${rowIndex + 1}: ❌ Order create failed (${res.status})`);
    return orderCreateResult({ ok: false, orderId: "", json });
  }

  // Success
  const orderId = json?.id || json?.orderId || "";
  addLog(`Row ${rowIndex + 1}: 🧾 Order created (ID: ${orderId})`);
  setOrdersCreated((c) => c + 1);
  setOrderSuccessList((list) => [
    ...list,
    { row: rowIndex + 1, documentId: String(row[COLUMN_MAP.documentId] || "") }
  ]);

  return orderCreateResult({ ok: true, orderId, json });
}




  async function uploadOrderPdfIfAny(row, rowIndex, orderId) {
    const link = row[COLUMN_MAP.pdfLink];
    if (!orderId) {
      addLog(`Row ${rowIndex + 1}: No order id, skipping PDF upload.`);
      return;
    }
    if (!link) {
      addLog(`Row ${rowIndex + 1}: No PDF_Drive_Link. Skipping upload.`);
      return;
    }
    const blob = await blobFromUrl(link); // requires CORS on the source!
    const form = new FormData();
    const baseName = String(row[COLUMN_MAP.documentName] || "order").replace(/[^A-Za-z0-9._-]/g, "_");
    const fileName = baseName.toLowerCase().endsWith(".pdf") ? baseName : `${baseName}.pdf`;
    form.append("file", new File([blob], fileName, { type: "application/pdf" }));

    const res = await fetch(API.uploadOrderPdf(orderId), { method: "POST", body: form });
    if (!res.ok) throw new Error(`PDF upload failed: ${res.status}`);
    addLog(`Row ${rowIndex + 1}: 📤 PDF uploaded for orderId=${orderId}`);
  }

  async function handleProcess() {
    if (!userId) {
      addLog("Please lookup user first.");
      return;
    }
    if (rows.length === 0) {
      addLog("Please load an Excel file first.");
      return;
    }

    setProcessing(true);

    // NEW: reset summary before each run
    setPatientsCreated(0);
    setOrdersCreated(0);
    setPatientSuccessList([]);
    setOrderSuccessList([]);

    try {
      const newRows = rows.map((r) => ({ ...r }));

for (let i = 0; i < newRows.length; i++) {
  const row = newRows[i];
  try {
    const patientId = await createPatientIfNeeded(row, i);
    const result = await createOrder(row, i, patientId);

    // Upload PDF ONLY if the order was truly created (ok === true),
    // and only if there’s a link and an orderId.
    if (result.ok && result.orderId) {
      await uploadOrderPdfIfAny(row, i, result.orderId);
    } else {
      // no PDF attempt; silently skip to avoid: "❌ PDF upload failed: 400"
    }
  } catch (rowErr) {
    addLog(`Row ${i + 1}: ❌ ${rowErr.message}`);
  }
}



      const ws = XLSX.utils.json_to_sheet(newRows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Updated");
      setUpdatedWorkbook(wb);
      addLog("✅ Finished processing. You can download the updated Excel now.");
    } finally {
      setProcessing(false);
    }
  }

  function handleDownload() {
    if (!updatedWorkbook) return;
    const wbout = XLSX.write(updatedWorkbook, { bookType: "xlsx", type: "array" });
    const blob = new Blob([wbout], { type: "application/octet-stream" });
    saveAs(blob, `updated_${file?.name || "data"}`);
  }
// App.jsx — Part 5
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex justify-center p-6">
      <div className="w-full max-w-5xl">
        <header className="mb-6">
          <h1 className="text-2xl font-bold">WAV Intake & Orders</h1>
          <p className="text-neutral-400 text-sm">
            Step-by-step: lookup user → upload Excel → create Patients & Orders → upload PDFs → download updated Excel
          </p>
        </header>

        {/* Step 1 */}
        <section className="bg-neutral-900 rounded-2xl p-5 border border-neutral-800">
          <h2 className="font-semibold mb-3">1) User by Email</h2>
          <div className="flex gap-2">
            <input
              className="flex-1 bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 outline-none"
              placeholder="name@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button
              onClick={handleLookup}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50"
              disabled={!email}
            >
              Lookup
            </button>
          </div>

          {user && (
            <div className="mt-3 text-sm text-neutral-300 space-y-1">
              <div>id: <span className="text-indigo-300">{userId}</span></div>
              <div>name: {user.firstName} {user.lastName}</div>
              <div>role: {user.userRole}</div>
            </div>
          )}
        </section>

        {/* Step 2 (only after step 1) */}
        {step1Done && (
          <section className="mt-6 bg-neutral-900 rounded-2xl p-5 border border-neutral-800">
            <h2 className="font-semibold mb-3">2) Upload Excel</h2>
            <input type="file" accept=".xlsx,.xls" onChange={handleFileChange} />
            {rows.length > 0 && (
              <div className="mt-3 text-sm text-neutral-300">
                Loaded <b>{rows.length}</b> row(s)
              </div>
            )}
          </section>
        )}

        {/* Step 3 (only after step 2) */}
        {step2Done && (
          <section className="mt-6 bg-neutral-900 rounded-2xl p-5 border border-neutral-800">
            <h2 className="font-semibold mb-3">3) Process</h2>
            <div className="flex gap-2">
              <button
                onClick={handleProcess}
                disabled={!canProcess}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50"
              >
                {processing ? "Processing..." : "Create Patients, Orders & Upload PDFs"}
              </button>
              <button
                onClick={handleDownload}
                disabled={!updatedWorkbook}
                className="px-4 py-2 rounded-xl bg-neutral-700 hover:bg-neutral-600 disabled:opacity-50"
              >
                Download updated Excel
              </button>
            </div>
          </section>
        )}

        {/* Activity (always visible) */}
        <section className="mt-6 bg-neutral-900 rounded-2xl p-5 border border-neutral-800">
          <h2 className="font-semibold mb-3">Activity</h2>
          <div className="h-56 overflow-auto text-sm space-y-1">
            {logs.map((l, i) => (
              <div key={i} className="text-neutral-300">{l}</div>
            ))}
          </div>
        </section>

        {/* NEW: Summary */}
        <section className="mt-6 bg-neutral-900 rounded-2xl p-5 border border-neutral-800">
          <h2 className="font-semibold mb-3">Summary</h2>

          <div className="grid sm:grid-cols-2 gap-4 mb-4">
            <div className="rounded-xl border border-neutral-800 p-4">
              <div className="text-sm text-neutral-400">Patients created</div>
              <div className="text-3xl font-bold mt-1">{patientsCreated}</div>
            </div>
            <div className="rounded-xl border border-neutral-800 p-4">
              <div className="text-sm text-neutral-400">Orders created</div>
              <div className="text-3xl font-bold mt-1">{ordersCreated}</div>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="rounded-xl border border-neutral-800 p-4">
              <div className="font-medium mb-2">Patient Name Results</div>
              {patientSuccessList.length === 0 ? (
                <div className="text-sm text-neutral-500">No patients created yet.</div>
              ) : (
                <ul className="text-sm space-y-1">
                  {patientSuccessList.map((p, i) => (
                    <li key={i} className="text-emerald-300">
                      Row {p.row}: <span className="text-neutral-300">patientName</span> = <b>success</b>
                      {p.patientName ? <> — <span className="text-neutral-400">{p.patientName}</span></> : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-xl border border-neutral-800 p-4">
              <div className="font-medium mb-2">Document ID Results</div>
              {orderSuccessList.length === 0 ? (
                <div className="text-sm text-neutral-500">No orders created yet.</div>
              ) : (
                <ul className="text-sm space-y-1">
                  {orderSuccessList.map((o, i) => (
                    <li key={i} className="text-emerald-300">
                      Row {o.row}: <span className="text-neutral-300">documentID</span> = <b>success</b>
                      {o.documentId ? <> — <span className="text-neutral-400">{o.documentId}</span></> : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>

        <footer className="mt-8 text-xs text-neutral-400">
          Contact <a className="underline" href="mailto:sujay@doctoralliance.com">sujay@doctoralliance.com</a> if any doubts.
        </footer>
      </div>
    </div>
  );
}
