import type { Part } from "./cli";

let state: {
  parts: { [order: string]: Part };
  httpTargets: string[];
  httpTargetSecret: string;
} = {
  parts: {},
  httpTargets: [],
  httpTargetSecret: "",
};

export function getState() {
  return state;
}

export function setState(newState: typeof state) {
  state = newState;
}
