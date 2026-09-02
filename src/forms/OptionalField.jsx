import React from "react";
import { stateProperty } from ".";
import { Control, FormField } from "./FormField";

export function OptionalField(component, label, name, props = {}, helpText = null) {
  return (
    <FormField label={label} help={helpText}>
      <Control
        name={name}
        value={stateProperty(component, name)}
        data-testid={"control-" + name}
        onChange={component.handleChange}
        {...props}
      />
    </FormField>
  );
}
