export default function BootLoader() {
  return (
  <div id="boot-loader" className="boot-loader" role="status" aria-live="polite" aria-label="Loading SplitSmart">
    <svg className="biryani" viewBox="0 0 220 200" aria-hidden="true">
      <ellipse className="glow" cx="110" cy="150" rx="90" ry="30"></ellipse>
      <g className="steam">
        <path d="M80 82c-14-14 14-22 0-40"></path>
        <path d="M110 76c-14-16 14-26 0-46"></path>
        <path d="M140 82c-14-14 14-22 0-40"></path>
      </g>
      <path className="bowl" d="M30 110h160c0 40-30 70-80 70s-80-30-80-70z"></path>
      <ellipse className="rim" cx="110" cy="110" rx="80" ry="14"></ellipse>
      <circle className="spice" cx="80" cy="108" r="4"></circle>
      <circle className="spice" cx="115" cy="112" r="4"></circle>
      <circle className="spice" cx="145" cy="107" r="4"></circle>
    </svg>
    <p>Serving your dashboard…</p>
  </div>
  );
}
