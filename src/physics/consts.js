// Shared physics numbers. World units: one grid cell is CELL units, y points down,
// time is in seconds. The simulation always steps by DT, whatever the frame rate,
// so the same build gives the same run every time.

export const CELL = 40;
export const DT = 1 / 120;
export const ITERATIONS = 10;
export const GRAVITY = 1200;

// Wob, the jelly blob
export const WOB_R = 15;
export const WOB_MASS = 2;
export const WOB_SPEED = 115; // rolling speed it aims for on the ground (units/s)
export const WOB_SPIN_ACCEL = 110; // how quickly it can spin up (rad/s^2)
export const WOB_BOUNCE = 0.18;
export const WOB_GRIP = 1.1;

// Parts
export const NODE_R = 3;
export const PLANK_THICK = 7;
export const SPRING_THICK = 9;
export const WHEEL_R = 18;
export const WHEEL_SPEED = 100;
export const WHEEL_SPIN_ACCEL = 40;
export const SPRING_LAUNCH = 720;
export const BALLOON_LIFT = 2.1; // in "mass units" of lift, times gravity
export const MAX_STEP_MOVE = 14; // speed limit per step, stops tunnelling

export const WOB_WEIGHT = WOB_MASS * GRAVITY;
