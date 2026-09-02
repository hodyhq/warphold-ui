import React from "react";
import { stateProperty } from ".";
import { Control, FieldFrame } from "./FormField";

export function listToMultilineString(v) {
  if (v) {
    return v.join("\n");
  }

  return "";
}

export function multilineStringToList(target) {
  const v = target.value;
  if (v === "") {
    return undefined;
  }

  return v.split(/\n/);
}

export function StringList(component, name, props = {}) {
  return (
    <FieldFrame>
      <Control
        as="textarea"
        name={name}
        rows="5"
        value={listToMultilineString(stateProperty(component, name))}
        onChange={(e) => component.handleChange(e, multilineStringToList)}
        {...props}
      />
    </FieldFrame>
  );
}
