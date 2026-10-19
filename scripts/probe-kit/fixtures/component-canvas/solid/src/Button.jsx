export function Button(props) {
  return (
    <button class="k-btn" type="button">
      {props.label ?? "Save"}
    </button>
  );
}
