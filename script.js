// Link two sliders so slider 2 follows slider 1 as a leaky integrator
const s1 = document.getElementById('s1');
const s2 = document.getElementById('s2');
const v1 = document.getElementById('v1');
const v2 = document.getElementById('v2');

// Parameters for the leaky integrator follower
const DT = 0.01; // seconds between updates
const TAU = 1.0; // convergence time (seconds)
const ALPHA = 1 - Math.exp(-DT / TAU); // discrete-time smoothing factor
const TICK_MS = Math.round(DT * 1000);

// target value that s2 should follow
let target = Number(s1.value);
// Xval: internal precise state (float) used by the integrator — do not use s2.value here
let Xval = Number(s2.value);

// initialize displays (show raw numeric values)
v1.textContent = String(Number(s1.value));
v2.textContent = String(Number(s2.value));

// When the user moves slider 1, update the target and display immediately.
s1.addEventListener('input', () => {
  // keep s2's range in sync for robustness

  target = Number(s1.value);
  // show raw numeric value for slider 1
  v1.textContent = String(target);
});

// Leaky-integrator update loop: advance s2 toward target every DT seconds.
setInterval(() => {
  // advance the internal float state
  Xval = Xval + ALPHA * (target - Xval);

  // clamp Xval to min/max
  const min = Number(s2.min || -Infinity);
  const max = Number(s2.max || Infinity);
  Xval = Math.min(max, Math.max(min, Xval));

  s2.value = Xval;

  // print the internal precise float for visibility
  v2.textContent = String(Math.round(Xval));
}, TICK_MS);

