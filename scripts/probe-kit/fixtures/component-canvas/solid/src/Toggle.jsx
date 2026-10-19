export function Toggle(props) {
  return (
    <label class="k-row">
      <span>{props.label ?? "Wi-Fi"}</span>
      <span class="k-track" data-on={String(Boolean(props.on))}>
        <span class="k-knob" />
      </span>
    </label>
  );
}
