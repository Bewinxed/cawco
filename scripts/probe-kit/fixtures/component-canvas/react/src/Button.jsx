import "./Button.css";

export function Button({ label = "Save" }) {
  return (
    <button className="r-btn" type="button">
      {label}
    </button>
  );
}
