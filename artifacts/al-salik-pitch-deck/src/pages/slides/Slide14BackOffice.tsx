const gridBg = {
  backgroundImage: "linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)",
  backgroundSize: "4vw 4vh",
} as const;

export default function Slide14BackOffice() {
  return (
    <div style={{ width: "100vw", height: "100vh", overflow: "hidden", backgroundColor: "#0F172A", fontFamily: "'DM Sans', sans-serif", position: "relative", color: "#FFFFFF", display: "flex", flexDirection: "column" }}>
      <div style={{ position: "absolute", inset: 0, ...gridBg, pointerEvents: "none" }} />

      <div style={{ position: "absolute", top: "4vh", left: "5vw", right: "5vw", display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 10 }}>
        <div style={{ color: "#14B8A6", fontSize: "1vw", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" }}>Al Salik POS</div>
        <div style={{ color: "#94A3B8", fontSize: "0.9vw", fontFamily: "'Inter', sans-serif" }}>2026</div>
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "14vh 5vw 10vh 5vw", zIndex: 5, position: "relative" }}>
        <div style={{ color: "#14B8A6", fontSize: "1.1vw", fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "1vh" }}>Manager Tools</div>
        <h2 style={{ fontSize: "3.5vw", fontWeight: 700, marginBottom: "1.5vh", letterSpacing: "-0.02em", lineHeight: 1.1 }}>Back Office Portal</h2>
        <p style={{ fontSize: "1.3vw", color: "#94A3B8", fontFamily: "'Inter', sans-serif", maxWidth: "55vw", marginBottom: "5vh", lineHeight: 1.5 }}>
          A dedicated web portal for managers to run reports, manage products, and monitor the business — without needing access to the POS device.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "2vw" }}>
          <div style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "1vw", padding: "3vh 2.5vw", position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "0.4vh", backgroundColor: "#14B8A6" }} />
            <div style={{ fontSize: "1vw", color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "1.2vh", fontFamily: "'Inter', sans-serif" }}>Reports</div>
            <div style={{ fontSize: "1.8vw", fontWeight: 700, marginBottom: "0.8vh" }}>Sales &amp; Revenue</div>
            <div style={{ fontSize: "1.2vw", color: "#94A3B8", fontFamily: "'Inter', sans-serif", lineHeight: 1.5 }}>Daily, weekly, monthly. CSV export for any range.</div>
          </div>
          <div style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "1vw", padding: "3vh 2.5vw", position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "0.4vh", backgroundColor: "#14B8A6" }} />
            <div style={{ fontSize: "1vw", color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "1.2vh", fontFamily: "'Inter', sans-serif" }}>Catalog</div>
            <div style={{ fontSize: "1.8vw", fontWeight: 700, marginBottom: "0.8vh" }}>Products &amp; Categories</div>
            <div style={{ fontSize: "1.2vw", color: "#94A3B8", fontFamily: "'Inter', sans-serif", lineHeight: 1.5 }}>Add, edit, price, and organize from any browser.</div>
          </div>
          <div style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "1vw", padding: "3vh 2.5vw", position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "0.4vh", backgroundColor: "#14B8A6" }} />
            <div style={{ fontSize: "1vw", color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "1.2vh", fontFamily: "'Inter', sans-serif" }}>Customers</div>
            <div style={{ fontSize: "1.8vw", fontWeight: 700, marginBottom: "0.8vh" }}>CRM &amp; Loyalty</div>
            <div style={{ fontSize: "1.2vw", color: "#94A3B8", fontFamily: "'Inter', sans-serif", lineHeight: 1.5 }}>Manage accounts, balances, and purchase history.</div>
          </div>
          <div style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "1vw", padding: "3vh 2.5vw", position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "0.4vh", backgroundColor: "#14B8A6" }} />
            <div style={{ fontSize: "1vw", color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "1.2vh", fontFamily: "'Inter', sans-serif" }}>Stock</div>
            <div style={{ fontSize: "1.8vw", fontWeight: 700, marginBottom: "0.8vh" }}>Inventory Control</div>
            <div style={{ fontSize: "1.2vw", color: "#94A3B8", fontFamily: "'Inter', sans-serif", lineHeight: 1.5 }}>On-hand levels, adjustments, and movement logs.</div>
          </div>
          <div style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "1vw", padding: "3vh 2.5vw", position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "0.4vh", backgroundColor: "#14B8A6" }} />
            <div style={{ fontSize: "1vw", color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "1.2vh", fontFamily: "'Inter', sans-serif" }}>Purchasing</div>
            <div style={{ fontSize: "1.8vw", fontWeight: 700, marginBottom: "0.8vh" }}>Supplier GRN</div>
            <div style={{ fontSize: "1.2vw", color: "#94A3B8", fontFamily: "'Inter', sans-serif", lineHeight: 1.5 }}>Receive stock, VAT per line, supplier statements.</div>
          </div>
          <div style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "1vw", padding: "3vh 2.5vw", position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "0.4vh", backgroundColor: "#14B8A6" }} />
            <div style={{ fontSize: "1vw", color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "1.2vh", fontFamily: "'Inter', sans-serif" }}>Devices</div>
            <div style={{ fontSize: "1.8vw", fontWeight: 700, marginBottom: "0.8vh" }}>License &amp; Branches</div>
            <div style={{ fontSize: "1.2vw", color: "#94A3B8", fontFamily: "'Inter', sans-serif", lineHeight: 1.5 }}>Manage device licenses and branch assignments.</div>
          </div>
        </div>
      </div>

      <div style={{ position: "absolute", bottom: "4vh", left: "5vw", right: "5vw", display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 10, borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: "2vh" }}>
        <div style={{ color: "#94A3B8", fontSize: "0.9vw", fontFamily: "'Inter', sans-serif" }}>Al Salik POS</div>
        <div style={{ color: "#94A3B8", fontSize: "0.9vw", fontFamily: "'Inter', sans-serif" }}>14</div>
      </div>
    </div>
  );
}
