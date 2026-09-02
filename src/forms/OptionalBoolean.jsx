import React from "react";
import { stateProperty } from ".";
import { Control, FormField } from "./FormField";

function optionalBooleanValue(target) {
  if (target.value === "true") {
    return true;
  }
  if (target.value === "false") {
    return false;
  }

  return undefined;
}

export function OptionalBoolean(component, label, name, defaultLabel) {
  return (
    <FormField label={label}>
      <Control
        as="select"
        name={name}
        value={stateProperty(component, name)}
        onChange={(e) => component.handleChange(e, optionalBooleanValue)}
      >
        <option value="">{defaultLabel}</option>
        <option value="true">yes</option>
        <option value="false">no</option>
      </Control>
    </FormField>
  );
}
