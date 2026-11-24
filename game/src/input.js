// Keyboard and mouse, gathered for the fixed-step loop. Held keys are a set; presses are
// a queue the loop drains one step at a time, so an F tapped between frames still lands on
// exactly one tick as enterPressed. The mouse position is reported in canvas pixels and
// main.js turns it into an aim angle with the camera.

export function createInput(canvas) {
  const held = new Set();
  const pressed = new Set();
  const mouse = { x: 0, y: 0, down: false };

  window.addEventListener('keydown', (event) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) event.preventDefault();
    if (!event.repeat) pressed.add(event.code);
    held.add(event.code);
  });
  window.addEventListener('keyup', (event) => held.delete(event.code));
  window.addEventListener('blur', () => {
    held.clear();
    mouse.down = false;
  });
  canvas.addEventListener('mousemove', (event) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * canvas.width;
    mouse.y = ((event.clientY - rect.top) / rect.height) * canvas.height;
  });
  canvas.addEventListener('mousedown', (event) => {
    if (event.button === 0) mouse.down = true;
  });
  window.addEventListener('mouseup', (event) => {
    if (event.button === 0) mouse.down = false;
  });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  /** The control object for one simulation step; drains this step's queued presses. */
  function control() {
    const take = (code) => {
      const was = pressed.has(code);
      pressed.delete(code);
      return was;
    };
    const mx = (held.has('KeyD') ? 1 : 0) - (held.has('KeyA') ? 1 : 0);
    const my = (held.has('KeyS') ? 1 : 0) - (held.has('KeyW') ? 1 : 0);
    return {
      mx, my,
      throttle: (held.has('ArrowUp') || held.has('KeyW') ? 1 : 0) - (held.has('ArrowDown') || held.has('KeyS') ? 1 : 0),
      steer: (held.has('ArrowRight') || held.has('KeyD') ? 1 : 0) - (held.has('ArrowLeft') || held.has('KeyA') ? 1 : 0),
      sprint: held.has('ShiftLeft') || held.has('ShiftRight'),
      punch: held.has('Space'),
      shoot: mouse.down,
      enterPressed: take('KeyF'),
      interactPressed: take('KeyE'),
      confirmPressed: take('Enter'),
      continuePressed: take('KeyC'),
      pausePressed: take('KeyP') || take('Escape'),
      aim: null, // main.js fills this from the mouse and the camera
      mouse,
    };
  }

  return { control, mouse };
}
