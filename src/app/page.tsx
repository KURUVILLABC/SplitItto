"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  FileImage,
  LoaderCircle,
  Moon,
  Plus,
  ReceiptText,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Sun,
  Trash2,
  Upload,
  UsersRound,
  WandSparkles,
} from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { AssignmentBoard } from "@/features/assignment/assignment-board";
import { Button } from "@/components/ui/button";
import {
  calculatePersonTotals,
  useAssignmentStore,
} from "@/features/assignment/assignment-store";
import { newEmptyReceipt, useReceiptStore } from "@/features/receipt/receipt-store";
import { useUiStore } from "@/features/ui/ui-store";
import { formatRupees, parseRupees } from "@/lib/money";
import { validateReceipt } from "@/lib/receipt";

type Screen = "home" | "capture" | "verify" | "assign" | "summary";

interface ApiError {
  error?: string;
  details?: string[];
}

async function postJson<T>(url: string, data: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(data),
    signal,
  });
  const result = (await response.json()) as T & ApiError;
  if (!response.ok) throw new Error(result.error ?? "The request could not be completed.");
  return result;
}

function Header({
  onHome,
  screen,
  onTheme,
  darkMode,
}: {
  onHome: () => void;
  screen: Screen;
  onTheme: () => void;
  darkMode: boolean;
}) {
  const steps: { key: Screen; label: string }[] = [
    { key: "capture", label: "Scan" },
    { key: "verify", label: "Review" },
    { key: "assign", label: "Split" },
    { key: "summary", label: "Done" },
  ];
  const progressScreen = screen === "home" ? "capture" : screen;
  return (
    <header className="app-header">
      <button type="button" className="brand-lockup" onClick={onHome} aria-label="splitItto home">
        <span className="brand-mark"><span /><span /><span /><span /></span>
        <span>split<span className="brand-weight">Itto</span></span>
      </button>
      {screen !== "home" && (
        <nav className="step-nav" aria-label="Split progress">
          {steps.map((step, index) => {
            const activeIndex = steps.findIndex(({ key }) => key === progressScreen);
            return (
              <span className={`step-nav-item ${index <= activeIndex ? "step-nav-active" : ""}`} key={step.key}>
                <span className="step-dot">{index < activeIndex ? <Check size={11} /> : index + 1}</span>
                <span className="step-label">{step.label}</span>
              </span>
            );
          })}
        </nav>
      )}
      <button
        type="button"
        onClick={onTheme}
        className="icon-button theme-toggle"
        aria-label={darkMode ? "Switch to light mode" : "Switch to dark mode"}
        title={darkMode ? "Light mode" : "Dark mode"}
      >
        {darkMode ? <Sun size={18} /> : <Moon size={18} />}
      </button>
    </header>
  );
}

function HomeScreen({ onStart }: { onStart: () => void }) {
  return (
    <motion.main className="home-screen" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="hero-copy">
        <div className="hero-kicker"><Sparkles size={14} /> THE BETTER WAY TO SETTLE UP</div>
        <h1>Good food.<br /><span>No bill math.</span></h1>
        <p>Scan the receipt, claim what you had, and let the numbers take care of themselves.</p>
        <Button className="hero-button" onClick={onStart}>
          <ScanLine size={18} /> Scan a bill <ArrowRight size={17} />
        </Button>
        <div className="hero-proof"><ShieldCheck size={15} /> Every paise accounted for. Always.</div>
      </div>
      <div className="hero-visual" aria-hidden="true">
        <div className="visual-orbit orbit-one" />
        <div className="visual-orbit orbit-two" />
        <div className="visual-spark spark-one">✳</div>
        <div className="visual-spark spark-two">✳</div>
        <div className="receipt-card">
          <div className="receipt-topline"><span>RECEIPT PREVIEW</span><span>SCAN READY</span></div>
          <div className="receipt-restaurant">your receipt</div>
          <div className="receipt-rule" />
          <div className="receipt-line"><span>Items, clearly listed</span><b>···</b></div>
          <div className="receipt-line"><span>Quantities, accounted</span><b>···</b></div>
          <div className="receipt-line"><span>GST, fairly shared</span><b>···</b></div>
          <div className="receipt-rule dotted" />
          <div className="receipt-line receipt-subtotal"><span>Tax allocation</span><b>✓</b></div>
          <div className="receipt-total"><span>YOUR TOTAL</span><strong>Ready to split</strong></div>
          <div className="receipt-scan-stamp"><WandSparkles size={13} /> EVERY PAISE, COUNTED</div>
        </div>
        <div className="floating-person person-one"><span className="mini-avatar avatar-peach">1</span><span>Person 1</span><b>Fair share</b></div>
        <div className="floating-person person-two"><span className="mini-avatar avatar-lilac">2</span><span>Person 2</span><b>Fair share</b></div>
        <div className="visual-caption">ONE RECEIPT, FAIR SHARES <span>↗</span></div>
      </div>
      <div className="feature-strip">
        <div><ScanLine size={19} /><span><b>Scan it</b><small>Camera or upload</small></span></div>
        <div><ReceiptText size={19} /><span><b>Check it</b><small>Every item, every tax</small></span></div>
        <div><UsersRound size={19} /><span><b>Split it</b><small>Fair down to the paise</small></span></div>
      </div>
    </motion.main>
  );
}

function CaptureScreen({
  onImage,
  onManual,
  busy,
  message,
}: {
  onImage: (file: File) => void;
  onManual: () => void;
  busy: boolean;
  message: string;
}) {
  const uploadRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) onImage(file);
    event.target.value = "";
  }
  return (
    <motion.main className="capture-screen page-shell" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <button type="button" className="back-link" onClick={onManual} aria-label="Go to receipt entry">
        <ArrowLeft size={16} /> Back
      </button>
      <div className="capture-copy">
        <span className="eyebrow">LET’S START WITH THE RECEIPT</span>
        <h1>Make the bill<br /><em>make sense.</em></h1>
        <p>A quick scan gives everyone a fair, item-by-item split. No calculator, no awkward guesses.</p>
      </div>
      <div className={`capture-card ${busy ? "capture-busy" : ""}`}>
        <div className="capture-illustration">
          {busy ? <LoaderCircle className="spin" size={30} /> : <FileImage size={29} />}
        </div>
        <h2>{busy ? "Reading your receipt…" : "Add your receipt"}</h2>
        <p>{busy ? "Uploading securely and looking for each line item." : "A clear, flat photo works best. JPG, PNG, WEBP or HEIC · up to 4 MB."}</p>
        {!busy && (
          <div className="capture-actions">
            <Button onClick={() => cameraRef.current?.click()}>
              <ScanLine size={17} /> Open camera
            </Button>
            <Button variant="secondary" onClick={() => uploadRef.current?.click()}>
              <Upload size={17} /> Upload image
            </Button>
          </div>
        )}
        {message && <div className="inline-error" role="alert">{message}</div>}
        {!busy && (
          <button type="button" className="manual-link" onClick={onManual}>
            Enter receipt details manually <ChevronRight size={15} />
          </button>
        )}
        <input ref={cameraRef} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,image/heic,.heic,.heif" capture="environment" onChange={handleChange} />
        <input ref={uploadRef} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,image/heic,.heic,.heif" onChange={handleChange} />
      </div>
      <div className="privacy-note"><ShieldCheck size={14} /> Receipt images are stored securely and only used to read your bill.</div>
    </motion.main>
  );
}

function VerifyScreen({
  onBack,
  onContinue,
  message,
  busy,
}: {
  onBack: () => void;
  onContinue: () => void;
  message: string;
  busy: boolean;
}) {
  const receipt = useReceiptStore((state) => state.receipt);
  const updateReceipt = useReceiptStore((state) => state.updateReceipt);
  const updateItem = useReceiptStore((state) => state.updateItem);
  const addItem = useReceiptStore((state) => state.addItem);
  const removeItem = useReceiptStore((state) => state.removeItem);
  if (!receipt) return null;
  const count = receipt.items.reduce((sum, item) => sum + item.quantity, 0);
  return (
    <motion.main className="verify-screen page-shell" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <button type="button" className="back-link" onClick={onBack}><ArrowLeft size={16} /> Back to scan</button>
      <div className="screen-heading">
        <div><span className="eyebrow">STEP 02 / REVIEW</span><h1>One quick check.</h1></div>
        <span className="review-badge"><CheckCircle2 size={15} /> Receipt read</span>
      </div>
      <div className="receipt-editor">
        <div className="receipt-meta-grid">
          <label className="field-label">RESTAURANT
            <input value={receipt.merchantName} maxLength={120} onChange={(event) => updateReceipt({ merchantName: event.target.value })} placeholder="Restaurant name" />
          </label>
          <label className="field-label">DATE
            <input type="date" value={receipt.receiptDate} onChange={(event) => updateReceipt({ receiptDate: event.target.value })} />
          </label>
        </div>
        <div className="editor-items-head">
          <span>ITEMS ON THE BILL <small>{count} total</small></span>
          <span>LINE TOTAL</span>
        </div>
        <div className="receipt-items-list">
          {receipt.items.map((item, index) => (
            <div className="receipt-edit-row" key={item.id}>
              <span className="line-number">{String(index + 1).padStart(2, "0")}</span>
              <input aria-label={`Item ${index + 1} name`} className="item-name-input" value={item.name} maxLength={120} onChange={(event) => updateItem(item.id, { name: event.target.value })} placeholder="Item name" />
              <label className="quantity-input-label"><span>×</span><input aria-label={`Item ${index + 1} quantity`} type="number" min="1" max="1000" step="1" value={item.quantity} onChange={(event) => {
                const quantity = Number(event.target.value);
                if (Number.isSafeInteger(quantity) && quantity > 0) updateItem(item.id, { quantity });
              }} /></label>
              <label className="money-input-label"><span>₹</span><input aria-label={`Item ${index + 1} amount in rupees`} inputMode="decimal" type="number" min="0" step="0.01" value={(item.amountPaise / 100).toFixed(2)} onChange={(event) => {
                const amountPaise = parseRupees(event.target.value);
                if (amountPaise !== null) updateItem(item.id, { amountPaise });
              }} /></label>
              <button type="button" className="icon-button delete-item" aria-label={`Delete ${item.name || `item ${index + 1}`}`} onClick={() => removeItem(item.id)}><Trash2 size={15} /></button>
            </div>
          ))}
          {receipt.items.length === 0 && <div className="no-items">No line items yet. Add the items from your receipt below.</div>}
        </div>
        <button type="button" className="add-line-button" onClick={addItem}><Plus size={15} /> Add an item</button>
        <div className="receipt-totals">
          <div><span>Subtotal</span><strong>{formatRupees(receipt.subtotalPaise)}</strong></div>
          <div className="gst-line"><label htmlFor="gst-amount">GST / tax</label><label className="money-input-label total-money-input"><span>₹</span><input id="gst-amount" aria-label="GST in rupees" inputMode="decimal" type="number" min="0" step="0.01" value={(receipt.taxPaise / 100).toFixed(2)} onChange={(event) => {
            const taxPaise = parseRupees(event.target.value);
            if (taxPaise !== null) updateReceipt({ taxPaise });
          }} /></label></div>
          <div className="grand-total-line"><span>Receipt total</span><strong>{formatRupees(receipt.totalPaise)}</strong></div>
        </div>
        {message && <div className="inline-error" role="alert">{message}</div>}
      </div>
      <div className="verify-footer">
        <div className="footer-hint"><ShieldCheck size={15} /> Tax is shared proportionally across items.</div>
        <button type="button" className="primary-button" onClick={onContinue} disabled={busy}>
          {busy ? <LoaderCircle className="spin" size={17} /> : null}
          {busy ? "Preparing items…" : "Continue to split"} {!busy && <ArrowRight size={16} />}
        </button>
      </div>
    </motion.main>
  );
}

function SummaryScreen({
  billId,
  onNew,
}: {
  billId: string;
  onNew: () => void;
}) {
  const receipt = useReceiptStore((state) => state.receipt);
  const generatedItems = useReceiptStore((state) => state.generatedItems);
  const people = useAssignmentStore((state) => state.people);
  const targets = useAssignmentStore((state) => state.targets);
  const [pdfModule, setPdfModule] = useState<typeof import("jspdf") | null>(null);
  const [pdfError, setPdfError] = useState("");
  const currentReceipt = receipt;

  useEffect(() => {
    let cancelled = false;
    void import("jspdf")
      .then((module) => {
        if (!cancelled) setPdfModule(module);
      })
      .catch((error: unknown) => {
        console.error("Could not load the PDF generator.", error);
        if (!cancelled) setPdfError("PDF export could not be loaded. Please refresh and try again.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!currentReceipt) return null;
  const pdfReceipt = currentReceipt;
  const totals = calculatePersonTotals(people, generatedItems, targets);
  function downloadPdf() {
    if (!pdfModule) return;
    try {
      const pdf = new pdfModule.jsPDF();
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(22);
      pdf.text("splitItto", 20, 24);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(12);
      pdf.text("Split summary", 20, 34);
      pdf.text(pdfReceipt.merchantName, 20, 45);
      pdf.text(`Receipt total: ${formatRupees(pdfReceipt.totalPaise).replace("₹", "INR ")}`, 20, 55);
      let y = 73;
      for (const [index, person] of totals.people.entries()) {
        pdf.text(`${index + 1}. ${person.name}`, 20, y);
        pdf.text(formatRupees(person.amountPaise).replace("₹", "INR "), 180, y, { align: "right" });
        y += 10;
      }
      y += 6;
      pdf.setDrawColor(224, 229, 220);
      pdf.line(20, y, 190, y);
      y += 10;
      pdf.setFont("helvetica", "bold");
      pdf.text("Total", 20, y);
      pdf.text(formatRupees(pdfReceipt.totalPaise).replace("₹", "INR "), 180, y, { align: "right" });
      pdf.save(`splititto-${billId}.pdf`);
      setPdfError("");
    } catch (error) {
      console.error("Could not generate the split summary PDF.", error);
      setPdfError("Could not generate the PDF. Please try again.");
    }
  }
  return (
    <motion.main className="summary-screen page-shell" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      <div className="summary-confetti" aria-hidden="true">✳</div>
      <div className="summary-check"><Check size={28} strokeWidth={2.5} /></div>
      <span className="eyebrow">THE MATH IS MATHING</span>
      <h1>That’s a wrap.</h1>
      <p className="summary-subtitle">{currentReceipt.merchantName} · everyone’s share is ready.</p>
      <div className="summary-card">
        <div className="summary-card-heading"><span>YOUR SPLIT</span><span>{totals.people.length} PEOPLE</span></div>
        {totals.people.map((person, index) => (
          <div className="summary-person" key={person.personId}>
            <div className="summary-person-name"><span className={`summary-avatar summary-avatar-${index % 4}`}>{person.name[0]?.toUpperCase() ?? "P"}</span><span>{person.name}</span></div>
            <strong>{formatRupees(person.amountPaise)}</strong>
          </div>
        ))}
        <div className="summary-grand-total"><span>Grand total</span><strong>{formatRupees(currentReceipt.totalPaise)}</strong></div>
      </div>
      <div className="summary-actions">
        <button type="button" className="primary-button" onClick={downloadPdf} disabled={!pdfModule}>
          <ReceiptText size={17} /> {pdfModule ? "Download summary" : "Preparing PDF…"}
        </button>
        <button type="button" className="secondary-button" onClick={onNew}>Start a new split</button>
      </div>
      {pdfError && <p className="inline-error" role="alert">{pdfError}</p>}
      <p className="saved-note"><ShieldCheck size={14} /> Split saved securely · {billId}</p>
    </motion.main>
  );
}

export default function HomePage() {
  const [screen, setScreen] = useState<Screen>("home");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [billId, setBillId] = useState("");
  const darkMode = useUiStore((state) => state.darkMode);
  const toggleDarkMode = useUiStore((state) => state.toggleDarkMode);
  const setReceipt = useReceiptStore((state) => state.setReceipt);
  const setGeneratedItems = useReceiptStore((state) => state.setGeneratedItems);
  const receipt = useReceiptStore((state) => state.receipt);
  const generatedItems = useReceiptStore((state) => state.generatedItems);
  const people = useAssignmentStore((state) => state.people);
  const targets = useAssignmentStore((state) => state.targets);
  const resetAssignments = useAssignmentStore((state) => state.reset);
  const moveItem = useAssignmentStore((state) => state.moveItem);
  const addPerson = useAssignmentStore((state) => state.addPerson);
  const updatePerson = useAssignmentStore((state) => state.updatePerson);
  const removePerson = useAssignmentStore((state) => state.removePerson);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
  }, [darkMode]);

  async function handleImage(file: File) {
    setBusy(true);
    setMessage("");
    try {
      const uploadData = new FormData();
      uploadData.set("file", file);
      const uploadResponse = await fetch("/api/upload", { method: "POST", body: uploadData });
      const uploaded = (await uploadResponse.json()) as {
        imageUrl?: string;
        imagePublicId?: string;
        imageFormat?: string;
        error?: string;
      };
      if (!uploadResponse.ok || !uploaded.imageUrl || !uploaded.imagePublicId) {
        throw new Error(uploaded.error ?? "Receipt upload failed.");
      }
      const ocr = await postJson<{
        merchantName: string;
        receiptDate: string;
        items: { id: string; name: string; quantity: number; amountPaise: number }[];
        subtotalPaise: number;
        taxPaise: number;
        totalPaise: number;
        ocrText: string;
        ocrProvider: string;
      }>("/api/ocr", {
        imagePublicId: uploaded.imagePublicId,
        imageUrl: uploaded.imageUrl,
        imageFormat: uploaded.imageFormat,
      }, AbortSignal.timeout(60_000));
      setReceipt({ ...ocr, imagePublicId: uploaded.imagePublicId });
      setScreen("verify");
      setMessage("");
    } catch (error) {
      const reason =
        error instanceof DOMException && error.name === "TimeoutError"
          ? "Receipt scanning took too long. Try a clearer image or enter the receipt details manually."
          : error instanceof Error
            ? error.message
            : "Receipt scan failed.";
      setMessage(reason);
    } finally {
      setBusy(false);
    }
  }

  function startManualEntry() {
    setReceipt(newEmptyReceipt());
    setScreen("verify");
    setMessage("");
  }

  async function continueToAssignment() {
    if (!receipt) return;
    setMessage("");
    const validationErrors = validateReceipt(receipt);
    if (validationErrors.length > 0) {
      setMessage(validationErrors.join(" "));
      return;
    }
    const count = receipt.items.reduce((sum, item) => sum + item.quantity, 0);
    if (count > 50) {
      setMessage("This receipt contains more than 50 items. Support for larger receipts is currently under development.");
      return;
    }
    setBusy(true);
    try {
      const result = await postJson<{
        generatedItems: { id: string; label: string; amountPaise: number; sourceLineId: string }[];
      }>("/api/process-bill", receipt);
      setGeneratedItems(result.generatedItems);
      resetAssignments(result.generatedItems);
      setScreen("assign");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not prepare receipt items.");
    } finally {
      setBusy(false);
    }
  }

  const assignmentTotals = calculatePersonTotals(people, generatedItems, targets);
  const receiptTotal = receipt?.totalPaise ?? 0;
  const allAssigned = generatedItems.length > 0 && assignmentTotals.unassignedCount === 0;
  const totalsMatch =
    generatedItems.reduce((sum, item) => sum + item.amountPaise, 0) === receiptTotal &&
    assignmentTotals.assignedPaise === receiptTotal;

  async function finishSplit() {
    if (!receipt) return;
    setMessage("");
    const assignments = generatedItems.flatMap((item) => {
      const targetId = targets[item.id];
      return targetId ? [{ itemId: item.id, targetId }] : [];
    });
    try {
      const validation = await postJson<{ valid: boolean; errors: string[] }>("/api/validate-bill", {
        totalPaise: receipt.totalPaise,
        items: generatedItems.map(({ id, amountPaise }) => ({ id, amountPaise })),
        people: people.map(({ id, name }) => ({ id, name })),
        assignments,
      });
      if (!validation.valid) {
        setMessage(validation.errors.join(" "));
        return;
      }
      const saved = await postJson<{ billId: string }>("/api/save-bill", {
        receipt: {
          ...receipt,
        },
        generatedItems,
        people,
        assignments,
      });
      setBillId(saved.billId);
      setScreen("summary");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save your split.");
    }
  }

  function startNewSplit() {
    useReceiptStore.getState().reset();
    resetAssignments([]);
    setBillId("");
    setMessage("");
    setScreen("capture");
  }

  function goHome() {
    setMessage("");
    setScreen("home");
  }

  return (
    <div className={`app-root ${screen === "assign" ? "app-assignment" : ""} ${darkMode ? "app-dark" : ""}`}>
      <Header onHome={goHome} screen={screen} onTheme={toggleDarkMode} darkMode={darkMode} />
      <AnimatePresence mode="wait">
        {screen === "home" && <HomeScreen key="home" onStart={() => setScreen("capture")} />}
        {screen === "capture" && (
          <CaptureScreen key="capture" onImage={handleImage} onManual={startManualEntry} busy={busy} message={message} />
        )}
        {screen === "verify" && (
          <VerifyScreen key="verify" onBack={() => setScreen("capture")} onContinue={continueToAssignment} message={message} busy={busy} />
        )}
        {screen === "assign" && receipt && (
          <motion.main key="assign" className="assignment-screen page-shell" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <div className="assignment-topline">
              <button type="button" className="back-link" onClick={() => setScreen("verify")}><ArrowLeft size={16} /> Edit receipt</button>
              <div className="merchant-chip"><ReceiptText size={14} /><span>{receipt.merchantName || "Your receipt"}</span><i />{generatedItems.length} items</div>
            </div>
            <div className="assignment-heading">
              <div><span className="eyebrow">STEP 03 / MAKE IT FAIR</span><h1>Who had what?</h1><p>Drag each item to a person, or make it a shared one.</p></div>
              <div className="tax-note"><Sparkles size={14} /> GST already split fairly</div>
            </div>
            <AssignmentBoard
              items={generatedItems}
              people={people}
              targets={targets}
              onMove={moveItem}
              onAddPerson={addPerson}
              onUpdatePerson={updatePerson}
              onRemovePerson={removePerson}
            />
            <div className="assignment-bottom">
              <div className="validation-status">
                <div className={allAssigned ? "status-good" : "status-pending"}><span>{allAssigned ? "✓" : "·"}</span>{allAssigned ? "All items assigned" : `${assignmentTotals.unassignedCount} item${assignmentTotals.unassignedCount === 1 ? "" : "s"} still to place`}</div>
                <div className={totalsMatch ? "status-good" : "status-pending"}><span>{totalsMatch ? "✓" : "·"}</span>{totalsMatch ? "Totals match" : "Checking receipt total"}</div>
              </div>
              <div className="bottom-total">
                <span>RECEIPT TOTAL</span><strong>{formatRupees(receiptTotal)}</strong>
                <small>Assigned {formatRupees(assignmentTotals.assignedPaise)}</small>
              </div>
              <button type="button" className="primary-button finish-button" onClick={finishSplit} disabled={!allAssigned || !totalsMatch || busy}>
                {busy ? <LoaderCircle className="spin" size={17} /> : <Check size={17} />}
                {busy ? "Saving split…" : "Finish split"}
              </button>
            </div>
            {message && <div className="inline-error assignment-error" role="alert">{message}</div>}
          </motion.main>
        )}
        {screen === "summary" && billId && <SummaryScreen key="summary" billId={billId} onNew={startNewSplit} />}
      </AnimatePresence>
      <footer className="site-footer"><span>Thoughtful splits, happier tables.</span><span>Made for the “I’ll just have a bite” moments.</span></footer>
    </div>
  );
}
