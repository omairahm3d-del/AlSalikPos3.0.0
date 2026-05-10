const base = import.meta.env.BASE_URL;

export default function Slide07SaloonDivider() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: "#0A0F1E" }}>
      <img
        src={`${base}salon.png`}
        crossOrigin="anonymous"
        alt="Luxury salon"
        className="absolute inset-0 w-full h-full object-cover"
        style={{ opacity: 0.4 }}
      />
      <div className="absolute inset-0" style={{ background: "linear-gradient(135deg, rgba(10,15,30,0.95) 0%, rgba(10,15,30,0.60) 55%, rgba(10,15,30,0.85) 100%)" }} />

      <div className="absolute inset-0 flex flex-col justify-center" style={{ paddingLeft: "7vw", paddingRight: "45vw" }}>
        <div style={{ width: "5vw", height: "0.4vh", background: "#4ECBA0", marginBottom: "3vh" }} />
        <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: "1.4vw", color: "#4ECBA0", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: "2vh" }}>
          Saloon Mode
        </div>
        <div style={{ fontFamily: "Playfair Display, serif", fontSize: "5.5vw", fontWeight: 900, color: "#FFFFFF", lineHeight: 1.05, textWrap: "balance", marginBottom: "3vh" }}>
          Everything Restaurant Has, Plus More
        </div>
        <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: "1.8vw", color: "#8B9CC8", lineHeight: 1.7 }}>
          Designed specifically for salons, spas &amp; barbers
        </div>

        <div style={{ marginTop: "4vh", display: "flex", flexDirection: "column", gap: "1.5vh" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "1.5vw" }}>
            <div style={{ width: "0.5vw", height: "0.5vw", background: "#4ECBA0", borderRadius: "50%" }} />
            <span style={{ fontFamily: "DM Sans, sans-serif", fontSize: "1.7vw", color: "#CBD5E8" }}>Services with duration per appointment</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "1.5vw" }}>
            <div style={{ width: "0.5vw", height: "0.5vw", background: "#4ECBA0", borderRadius: "50%" }} />
            <span style={{ fontFamily: "DM Sans, sans-serif", fontSize: "1.7vw", color: "#CBD5E8" }}>Stylist assignment per service in the cart</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "1.5vw" }}>
            <div style={{ width: "0.5vw", height: "0.5vw", background: "#4ECBA0", borderRadius: "50%" }} />
            <span style={{ fontFamily: "DM Sans, sans-serif", fontSize: "1.7vw", color: "#CBD5E8" }}>Service Bundles — group services at one price</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "1.5vw" }}>
            <div style={{ width: "0.5vw", height: "0.5vw", background: "#4ECBA0", borderRadius: "50%" }} />
            <span style={{ fontFamily: "DM Sans, sans-serif", fontSize: "1.7vw", color: "#CBD5E8" }}>Prepaid Packages — sell session credits upfront</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "1.5vw" }}>
            <div style={{ width: "0.5vw", height: "0.5vw", background: "#4ECBA0", borderRadius: "50%" }} />
            <span style={{ fontFamily: "DM Sans, sans-serif", fontSize: "1.7vw", color: "#CBD5E8" }}>Appointment calendar for booking</span>
          </div>
        </div>
      </div>
    </div>
  );
}
