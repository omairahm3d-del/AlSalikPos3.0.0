const base = import.meta.env.BASE_URL;

export default function Slide12Why() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: "#0A0F1E" }}>
      <img
        src={`${base}hero.png`}
        crossOrigin="anonymous"
        alt="Al Salik POS"
        className="absolute inset-0 w-full h-full object-cover"
        style={{ opacity: 0.15 }}
      />
      <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(10,15,30,0.85) 0%, rgba(10,15,30,0.95) 100%)" }} />

      <div className="absolute inset-0 flex flex-col" style={{ padding: "6vh 7vw", justifyContent: "center" }}>
        <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: "1.3vw", color: "#C9963A", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: "1.5vh" }}>
          Why Al Salik POS
        </div>
        <div style={{ fontFamily: "Playfair Display, serif", fontSize: "4.5vw", fontWeight: 900, color: "#FFFFFF", lineHeight: 1.1, marginBottom: "5vh" }}>
          Ready to go live the same day
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "2vw" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.8vh" }}>
            <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: "1.3vw", fontWeight: 700, color: "#C9963A", letterSpacing: "0.05em" }}>OFFLINE-FIRST</div>
            <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: "1.7vw", color: "#E8EDF8", lineHeight: 1.5 }}>Works without internet. No internet, no problem.</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.8vh" }}>
            <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: "1.3vw", fontWeight: 700, color: "#C9963A", letterSpacing: "0.05em" }}>UAE VAT COMPLIANT</div>
            <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: "1.7vw", color: "#E8EDF8", lineHeight: 1.5 }}>Simplified tax invoices out of the box.</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.8vh" }}>
            <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: "1.3vw", fontWeight: 700, color: "#C9963A", letterSpacing: "0.05em" }}>MULTI-BRANCH</div>
            <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: "1.7vw", color: "#E8EDF8", lineHeight: 1.5 }}>One system for all your locations.</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.8vh" }}>
            <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: "1.3vw", fontWeight: 700, color: "#C9963A", letterSpacing: "0.05em" }}>NO PER-TRANSACTION FEES</div>
            <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: "1.7vw", color: "#E8EDF8", lineHeight: 1.5 }}>Affordable flat pricing. Keep your margins.</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.8vh" }}>
            <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: "1.3vw", fontWeight: 700, color: "#C9963A", letterSpacing: "0.05em" }}>LOCAL SUPPORT</div>
            <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: "1.7vw", color: "#E8EDF8", lineHeight: 1.5 }}>Arabic receipt option. UAE-first design.</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.8vh" }}>
            <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: "1.3vw", fontWeight: 700, color: "#C9963A", letterSpacing: "0.05em" }}>TWO MODES</div>
            <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: "1.7vw", color: "#E8EDF8", lineHeight: 1.5 }}>Restaurant or Saloon — built for your business.</div>
          </div>
        </div>

        <div style={{ marginTop: "5vh", display: "flex", alignItems: "center", gap: "3vw" }}>
          <div style={{ height: "1px", background: "rgba(201,150,58,0.3)", flex: 1 }} />
          <div style={{ fontFamily: "Playfair Display, serif", fontSize: "2vw", color: "#C9963A", fontWeight: 700, letterSpacing: "0.05em" }}>Al Salik POS</div>
          <div style={{ height: "1px", background: "rgba(201,150,58,0.3)", flex: 1 }} />
        </div>
      </div>
    </div>
  );
}
