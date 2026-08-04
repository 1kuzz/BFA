export function Toast(props) {
  return (
    <div id="toast" className="toast" role="status" aria-live="polite" style={{ display: props.message ? 'block' : 'none' }}>
      {props.message}
    </div>
  );
}
