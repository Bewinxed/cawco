import "./Button.css";

export function Toggle({ on = false, label = "Wi-Fi" }) {
  return (
    <div className="r-toggle-row" style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <span>{label}</span>
      <span className="r-toggle" data-on={on}>
        <span className="r-knob" />
      </span>
    </div>
  );
}
