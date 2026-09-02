import React from "react";
import { stateProperty } from ".";
import { Control, FormField } from "./FormField";

export function RequiredField(component, label, name, props = {}, helpText = null) {
  const invalid = stateProperty(component, name, null) === "";

  return (
    <FormField label={label} required invalid={invalid} invalidFeedback="Required field" help={helpText}>
      <Control
        invalid={invalid}
        name={name}
        value={stateProperty(component, name)}
        data-testid={"control-" + name}
        onChange={component.handleChange}
        {...props}
      />
    </FormField>
  );
}
