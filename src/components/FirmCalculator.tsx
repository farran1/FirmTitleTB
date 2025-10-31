import React, { useState, useRef } from "react";
// @ts-ignore
import { jsPDF } from "jspdf";

const logoBase64 = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAgEA+gD6AAD..."; // truncated for brevity

const todayStr = () => {
  const today = new Date();
  return today.toISOString().split("T")[0];
};

const formatCurrency = (n: number) =>
  "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const FirmCalculator: React.FC = () => {
  // Form state
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [salePrice, setSalePrice] = useState(350000);
  const [mortgagePayoff, setMortgagePayoff] = useState(250000);
  const [commission, setCommission] = useState(6.0);
  const [commissionSlider, setCommissionSlider] = useState(60); // 6.0 * 10
  const [annualTax, setAnnualTax] = useState(3000);
  const [otherFees, setOtherFees] = useState(600);
  const [hoaEstoppel, setHoaEstoppel] = useState(true);
  const [closingDate, setClosingDate] = useState(todayStr());
  const [propertyType, setPropertyType] = useState("Single Family");
  const [isCash, setIsCash] = useState(false);

  // UI state
  const [emailError, setEmailError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [statusType, setStatusType] = useState<"" | "success" | "error">("");
  const [showSummary, setShowSummary] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  // Calculation results
  const [results, setResults] = useState<any>(null);

  // Refs for PDF
  const formRef = useRef<HTMLFormElement>(null);

  // Commission slider sync
  const handleCommissionInput = (v: string) => {
    const value = parseFloat(v);
    setCommission(isNaN(value) ? 0 : value);
    setCommissionSlider(Math.min(Math.max((isNaN(value) ? 0 : value) * 10, 0), 100));
  };
  const handleCommissionSlider = (v: string) => {
    const value = parseInt(v, 10);
    setCommissionSlider(value);
    setCommission((value / 10));
  };

  // Calculation logic
  function calculateAll() {
    // Commission
    const commissionAmt = salePrice * (commission / 100);
    const docStamps = salePrice * 0.007;
    const intangibleTax = isCash ? 0 : salePrice * 0.002;
    const recordingFees = 20.0;
    const hoaEstoppelAmt = hoaEstoppel ? 150.0 : 0.0;
    // Title insurance
    let titleInsurance = 0;
    if (salePrice <= 100000) {
      titleInsurance = 575;
    } else if (salePrice <= 500000) {
      titleInsurance = 575 + (salePrice - 100000) * 0.005;
    } else if (salePrice <= 1000000) {
      titleInsurance = 2575 + (salePrice - 500000) * 0.004;
    } else {
      titleInsurance = 4575 + (salePrice - 1000000) * 0.003;
    }
    if (propertyType === "Condo") {
      titleInsurance *= 0.85;
    }
    // Property tax proration
    const closingDateObj = new Date(closingDate);
    const dayBefore = new Date(closingDateObj);
    dayBefore.setDate(closingDateObj.getDate() - 1);
    const startOfYear = new Date(closingDateObj.getFullYear(), 0, 0);
    const diff = dayBefore.getTime() - startOfYear.getTime();
    const oneDay = 1000 * 60 * 60 * 24;
    const dayOfYear = Math.floor(diff / oneDay);
    const isLeapYear = (closingDateObj.getFullYear() % 4 === 0 && closingDateObj.getFullYear() % 100 !== 0) || (closingDateObj.getFullYear() % 400 === 0);
    const daysInYear = isLeapYear ? 366 : 365;
    const propertyTaxProration = (dayOfYear / daysInYear) * annualTax;
    // Totals
    const totalClosingCosts = commissionAmt + docStamps + intangibleTax + recordingFees + hoaEstoppelAmt + titleInsurance + propertyTaxProration + otherFees;
    const netProceeds = salePrice - mortgagePayoff - totalClosingCosts;
    return {
      commissionAmt,
      docStamps,
      intangibleTax,
      recordingFees,
      hoaEstoppelAmt,
      titleInsurance,
      propertyTaxProration,
      totalClosingCosts,
      netProceeds,
    };
  }

  // Form submit handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage("");
    setStatusType("");
    setShowSummary(false);
    setShowDetails(false);
    // Email validation
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      setEmailError("Please enter a valid email address");
      return;
    } else {
      setEmailError("");
    }
    setStatusMessage("Processing your request...");
    setStatusType("");
    // Send to Formspree
    try {
      const resp = await fetch("https://formspree.io/f/movdowyr", {
        method: "POST",
        headers: { "Accept": "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          address,
          sale_price: salePrice
        })
      });
      const data = await resp.json();
      if (data.ok) {
        setStatusMessage("Email submitted successfully!");
        setStatusType("success");
      } else {
        setStatusMessage("Email submission failed, but you can still download your PDF.");
        setStatusType("error");
      }
    } catch (err) {
      setStatusMessage("Email submission failed, but you can still download your PDF.");
      setStatusType("error");
    }
    // Calculate
    const calc = calculateAll();
    setResults(calc);
    setShowSummary(true);
    setShowDetails(true);
    // Generate PDF
    try {
      const pdf = new jsPDF();
      pdf.addImage(logoBase64, 'JPEG', 15, 15, 30, 30);
      pdf.setFontSize(20);
      pdf.setTextColor(44, 62, 80);
      pdf.text("Net Sheet", 50, 25);
      pdf.setFontSize(12);
      pdf.setTextColor(100, 100, 100);
      const addressLines = pdf.splitTextToSize("Property: " + address, 170);
      let yPos = 50;
      for (let i = 0; i < addressLines.length; i++) {
        pdf.text(addressLines[i], 15, yPos);
        yPos += 7;
      }
      pdf.text("Email: " + email, 15, yPos);
      yPos += 7;
      pdf.text("Closing Date: " + closingDate, 15, yPos);
      yPos += 15;
      pdf.setFontSize(16);
      pdf.setTextColor(44, 62, 80);
      pdf.text("Transaction Summary", 15, yPos);
      yPos += 10;
      pdf.setFontSize(12);
      pdf.setTextColor(0, 0, 0);
      pdf.text("Sale Price: " + formatCurrency(salePrice), 20, yPos);
      yPos += 8;
      pdf.text("Mortgage Payoff: " + formatCurrency(mortgagePayoff), 20, yPos);
      yPos += 8;
      pdf.text("Total Closing Costs: " + formatCurrency(calc.totalClosingCosts), 20, yPos);
      yPos += 12;
      pdf.setFontSize(14);
      pdf.setTextColor(44, 62, 80);
      pdf.text("Net Proceeds:", 20, yPos);
      pdf.setFontSize(16);
      pdf.setTextColor(1, 79, 239);
      pdf.text(formatCurrency(calc.netProceeds), 60, yPos);
      yPos += 20;
      pdf.setFontSize(16);
      pdf.setTextColor(44, 62, 80);
      pdf.text("Closing Cost Breakdown", 15, yPos);
      yPos += 10;
      pdf.setFontSize(12);
      pdf.setTextColor(0, 0, 0);
      const breakdownItems = [
        ["Commission", calc.commissionAmt],
        ["Documentary Stamps", calc.docStamps],
        ["Intangible Tax", calc.intangibleTax],
        ["Recording Fees", calc.recordingFees],
        ["Title Insurance", calc.titleInsurance],
        ["Property Tax Proration", calc.propertyTaxProration],
      ];
      if (hoaEstoppel) breakdownItems.push(["HOA Estoppel Fee", calc.hoaEstoppelAmt]);
      if (otherFees > 0) breakdownItems.push(["Other Fees", otherFees]);
      for (const [item, amount] of breakdownItems) {
        pdf.text(item + ": " + formatCurrency(amount as number), 20, yPos);
        yPos += 8;
        if (yPos > 260) {
          pdf.addPage();
          yPos = 20;
        }
      }
      pdf.setFontSize(10);
      pdf.setTextColor(150, 150, 150);
      pdf.text("Generated on " + todayStr(), 15, 280);
      const dateStr = todayStr().replace(/-/g, "");
      pdf.save("FirmTitle_NetSheet_" + dateStr + ".pdf");
      setStatusMessage("PDF generated successfully! Check your downloads.");
      setStatusType("success");
    } catch (err) {
      setStatusMessage("Error generating PDF. Please try again.");
      setStatusType("error");
    }
  };

  // Render
  return (
    <div className="container">
      <style>{`
        :root {
          --primary: #2c3e50;
          --secondary: #014fef;
          --light-bg: #f5f7fa;
          --card-bg: #ffffff;
          --border: #e0e0e0;
          --text: #34495e;
          --text-light: #7f8c8d;
          --success: #4caf50;
          --error: #f44336;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: linear-gradient(135deg, #f5f7fa 0%, #e4e7ec 100%); padding: 20px; color: var(--text); min-height: 100vh; line-height: 1.6; }
        .container { max-width: 800px; margin: 0 auto; background: var(--card-bg); border-radius: 16px; padding: 30px; box-shadow: 0 12px 30px rgba(0, 0, 0, 0.15); position: relative; overflow: hidden; }
        .container::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 5px; background: linear-gradient(90deg, var(--primary) 0%, var(--secondary) 100%); }
        .header { display: flex; align-items: center; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 1px solid var(--border); }
        .logo { width: 80px; height: 80px; background: var(--secondary); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 24px; box-shadow: 0 4px 8px rgba(1, 79, 239, 0.3); margin-right: 20px; background-image: url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA2NCA2NCI+PHJlY3Qgd2lkdGg9IjY0IiBoZWlnaHQ9IjY0IiBmaWxsPSIjMDE0ZmVmIiByeD0iMTIiIHJ5PSIxMiIvPjx0ZXh0IHg9IjMyIiB5PSIzNCIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXNpemU9IjI0IiBmb250LXdlaWdodD0iYm9sZCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0id2hpdGUiPkZUPC90ZXh0Pjwvc3ZnPg=='); background-size: cover; flex-shrink: 0; }
        .header-text h1 { font-size: 28px; font-weight: 700; background: linear-gradient(90deg, var(--primary) 0%, var(--secondary) 100%); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; margin-bottom: 5px; }
        .header-text h2 { font-size: 22px; font-weight: 600; color: var(--primary); }
        label { display: block; margin-top: 15px; font-weight: 600; color: var(--text); font-size: 14px; }
        input, select { width: 100%; padding: 14px 18px; margin-top: 8px; border-radius: 12px; border: 1px solid var(--border); font-family: 'Segoe UI', sans-serif; font-size: 15px; transition: all 0.3s ease; background: #fafbfc; }
        input:focus, select:focus { outline: none; border-color: var(--secondary); box-shadow: 0 0 0 3px rgba(1, 79, 239, 0.15); background: white; }
        input[type="range"] { -webkit-appearance: none; -moz-appearance: none; appearance: none; height: 8px; border-radius: 4px; padding: 0; margin-top: 15px; background: linear-gradient(90deg, var(--secondary) 0%, var(--secondary) 60%, #e0e0e0 60%, #e0e0e0 100%); }
        input[type="range"]::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 22px; height: 22px; background: var(--secondary); border-radius: 50%; cursor: pointer; box-shadow: 0 2px 6px rgba(0,0,0,0.3); border: 2px solid white; }
        input[type="range"]::-moz-range-thumb { width: 22px; height: 22px; background: var(--secondary); border-radius: 50%; cursor: pointer; box-shadow: 0 2px 6px rgba(0,0,0,0.3); border: 2px solid white; }
        button { width: 100%; margin-top: 25px; padding: 16px; background: linear-gradient(135deg, var(--secondary) 0%, #0039c0 100%); color: white; border: none; border-radius: 12px; font-size: 17px; font-weight: 600; cursor: pointer; transition: all 0.3s ease; box-shadow: 0 6px 12px rgba(1, 79, 239, 0.25); position: relative; overflow: hidden; }
        button::after { content: ''; position: absolute; top: -50%; left: -50%; width: 200%; height: 200%; background: rgba(255,255,255,0.1); transform: rotate(30deg); transition: all 0.6s ease; }
        button:hover { transform: translateY(-3px); box-shadow: 0 8px 18px rgba(1, 79, 239, 0.4); }
        .flex-row { display: flex; align-items: center; gap: 15px; margin-top: 10px; }
        .checkbox-row { display: flex; align-items: center; gap: 10px; margin-top: 20px; padding: 14px 18px; background-color: rgba(245, 247, 250, 0.5); border-radius: 12px; transition: all 0.3s ease; border: 1px solid var(--border); }
        .checkbox-row:hover { background-color: rgba(1, 79, 239, 0.08); border-color: rgba(1, 79, 239, 0.3); }
        .checkbox-row input[type="checkbox"] { width: 20px; height: 20px; accent-color: var(--secondary); margin: 0; }
        .group-box { border: 1px solid var(--border); border-radius: 16px; padding: 25px; margin-top: 25px; background: var(--card-bg); box-shadow: 0 4px 12px rgba(0,0,0,0.05); position: relative; }
        .group-title { font-weight: 700; margin-bottom: 20px; color: var(--primary); font-size: 17px; display: flex; align-items: center; gap: 10px; padding-left: 8px; }
        .group-title::before { content: ""; display: inline-block; width: 6px; height: 24px; background: linear-gradient(180deg, var(--secondary) 0%, #0039c0 100%); border-radius: 3px; }
        .error-message { color: var(--error); font-size: 13px; margin-top: 8px; display: none; padding-left: 5px; }
        .status-message { text-align: center; margin-top: 20px; padding: 14px; border-radius: 12px; font-weight: 500; font-size: 15px; display: none; }
        .success { background-color: #e8f5e9; color: var(--success); border: 1px solid #c8e6c9; display: block; }
        .error { background-color: #ffebee; color: var(--error); border: 1px solid #ffcdd2; display: block; }
        .calculator-icon { display: inline-block; margin-right: 10px; font-size: 24px; }
        .result-summary { background: linear-gradient(135deg, #f0f7ff 0%, #e1edff 100%); border-radius: 12px; padding: 20px; margin-top: 25px; border: 1px solid #d6e4ff; display: none; }
        .result-item { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #e0e0e0; }
        .result-total { font-weight: 700; font-size: 18px; color: var(--secondary); padding-top: 15px; border-bottom: none; }
        .calculation-details { margin-top: 20px; padding: 20px; background-color: #f9f9f9; border-radius: 12px; border: 1px solid #eee; display: none; }
        .calculation-row { display: flex; justify-content: space-between; margin: 8px 0; font-size: 14px; }
        .calculation-title { font-weight: 600; color: var(--primary); }
        @media (max-width: 600px) { .container { padding: 20px; } .header { flex-direction: column; text-align: center; } .logo { margin-right: 0; margin-bottom: 15px; } .flex-row { flex-direction: column; align-items: stretch; } .flex-row input[type="number"] { width: 100%; } }
      `}</style>
      <div className="header">
        <div className="logo"></div>
        <div className="header-text">
          <h1>Firm Title TB</h1>
          <h2>Net Sheet Calculator</h2>
        </div>
      </div>
      <form id="netSheetForm" ref={formRef} onSubmit={handleSubmit}>
        <label htmlFor="email">Your Email:</label>
        <input type="email" id="email" name="email" required placeholder="your@email.com"
          value={email} onChange={e => setEmail(e.target.value)} />
        {emailError && <div className="error-message" style={{ display: "block" }}>{emailError}</div>}
        <label htmlFor="address">Property Address:</label>
        <input type="text" id="address" name="address" placeholder="Enter full property address" required
          value={address} onChange={e => setAddress(e.target.value)} />
        <div className="group-box">
          <div className="group-title">Transaction Details</div>
          <label htmlFor="sale_price">Sale Price ($):</label>
          <input type="number" id="sale_price" name="sale_price" value={salePrice} onChange={e => setSalePrice(Number(e.target.value))} required />
          <label htmlFor="mortgage_payoff">Mortgage Payoff ($):</label>
          <input type="number" id="mortgage_payoff" name="mortgage_payoff" value={mortgagePayoff} onChange={e => setMortgagePayoff(Number(e.target.value))} required />
          <label>Commission Rate (%):</label>
          <div className="flex-row">
            <input type="number" id="commission" step="0.1" value={commission} min={0} max={10} style={{ width: "100px" }}
              onChange={e => handleCommissionInput(e.target.value)} />
            <input type="range" id="commission_slider" min={0} max={100} step={1} value={commissionSlider}
              onChange={e => handleCommissionSlider(e.target.value)} />
          </div>
          <label htmlFor="tax">Annual Property Tax ($):</label>
          <input type="number" id="tax" name="tax" value={annualTax} onChange={e => setAnnualTax(Number(e.target.value))} required />
          <label htmlFor="other_fees">Other Fees ($):</label>
          <input type="number" id="other_fees" name="other_fees" value={otherFees} onChange={e => setOtherFees(Number(e.target.value))} required />
          <div className="checkbox-row">
            <input type="checkbox" id="hoa_estoppel" checked={hoaEstoppel} onChange={e => setHoaEstoppel(e.target.checked)} />
            <label htmlFor="hoa_estoppel">Include HOA Estoppel Fee ($150)</label>
          </div>
        </div>
        <div className="group-box">
          <div className="group-title">Property Information</div>
          <label htmlFor="closing_date">Closing Date:</label>
          <input type="date" id="closing_date" name="closing_date" value={closingDate} onChange={e => setClosingDate(e.target.value)} required />
          <label htmlFor="property_type">Property Type:</label>
          <select id="property_type" value={propertyType} onChange={e => setPropertyType(e.target.value)}>
            <option>Single Family</option>
            <option>Condo</option>
            <option>Townhome</option>
            <option>Multi-Family</option>
            <option>Land</option>
          </select>
          <div className="checkbox-row">
            <input type="checkbox" id="is_cash" checked={isCash} onChange={e => setIsCash(e.target.checked)} />
            <label htmlFor="is_cash">Cash Transaction (No Intangible Tax)</label>
          </div>
        </div>
        <button type="submit">
          <span className="calculator-icon">📝</span> Calculate & Download Net Sheet
        </button>
        {statusMessage && (
          <div className={`status-message${statusType ? " " + statusType : ""}`} style={{ display: "block" }}>{statusMessage}</div>
        )}
        {showSummary && results && (
          <div id="result-summary" className="result-summary" style={{ display: "block" }}>
            <h3>Summary Preview</h3>
            <div className="result-item">
              <span>Sale Price:</span>
              <span id="preview-sale-price">{formatCurrency(salePrice)}</span>
            </div>
            <div className="result-item">
              <span>Mortgage Payoff:</span>
              <span id="preview-mortgage">{formatCurrency(mortgagePayoff)}</span>
            </div>
            <div className="result-item">
              <span>Closing Costs:</span>
              <span id="preview-costs">{formatCurrency(results.totalClosingCosts)}</span>
            </div>
            <div className="result-item result-total">
              <span>Net Proceeds:</span>
              <span id="preview-net">{formatCurrency(results.netProceeds)}</span>
            </div>
          </div>
        )}
        {showDetails && results && (
          <div id="calculation-details" className="calculation-details" style={{ display: "block" }}>
            <h3>Detailed Calculation</h3>
            <div className="calculation-row">
              <span className="calculation-title">Commission:</span>
              <span id="detail-commission">{formatCurrency(results.commissionAmt)}</span>
            </div>
            <div className="calculation-row">
              <span className="calculation-title">Documentary Stamps:</span>
              <span id="detail-docstamps">{formatCurrency(results.docStamps)}</span>
            </div>
            <div className="calculation-row">
              <span className="calculation-title">Intangible Tax:</span>
              <span id="detail-intangible">{formatCurrency(results.intangibleTax)}</span>
            </div>
            <div className="calculation-row">
              <span className="calculation-title">Recording Fees:</span>
              <span id="detail-recording">{formatCurrency(results.recordingFees)}</span>
            </div>
            <div className="calculation-row">
              <span className="calculation-title">Title Insurance:</span>
              <span id="detail-title">{formatCurrency(results.titleInsurance)}</span>
            </div>
            <div className="calculation-row">
              <span className="calculation-title">Property Tax Proration:</span>
              <span id="detail-taxproration">{formatCurrency(results.propertyTaxProration)}</span>
            </div>
            <div className="calculation-row">
              <span className="calculation-title">HOA Estoppel Fee:</span>
              <span id="detail-hoa">{formatCurrency(results.hoaEstoppelAmt)}</span>
            </div>
            <div className="calculation-row">
              <span className="calculation-title">Other Fees:</span>
              <span id="detail-other">{formatCurrency(otherFees)}</span>
            </div>
          </div>
        )}
      </form>
    </div>
  );
};

export default FirmCalculator; 